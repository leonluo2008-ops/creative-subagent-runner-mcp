// =====================================================================
// server.ts — Express + MCP Streamable HTTP transport
// 第一版只暴露一个工具: health_check
// 全部请求必须带 Bearer Token
// =====================================================================
import express, { type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { env, logStartupConfig } from "./utils/env.js";
import { bearerAuth } from "./security/auth.js";
import { healthCheck } from "./tools/healthCheck.js";
import { listSubagentRoles } from "./tools/listSubagentRoles.js";
import { runSubagent } from "./tools/runSubagent.js";
import { safeError } from "./security/redact.js";

type ToolRole = "chapter_writer" | "structure_auditor" | "style_auditor" | "reviser";

function jsonTextResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function buildRunSubagentInternalError(
  params: Partial<{ role: ToolRole; task_id: string }>,
  err: unknown
) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    status: "model_error" as const,
    role: params.role ?? "chapter_writer",
    task_id: params.task_id ?? "unknown",
    error: {
      message: `run_subagent_internal_error: ${message}`,
    },
    elapsed_ms: 0,
  };
}

function createMcpServer() {
  const server = new McpServer(
    {
      name: "creative-subagent-runner-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        "Generic MCP server for running creative writing subagents via GPT/OpenAI-compatible and Gemini native APIs.",
    }
  );

  // ---- 注册 health_check 工具 ----
  server.tool(
    "health_check",
    "检查 MCP server 与 provider 配置状态。返回 provider 状态、角色路由、server 配置，**不包含任何 API Key 明文**。",
    {},
    async () => {
      const result = await healthCheck();
      return jsonTextResult(result);
    }
  );

  // ---- 注册 list_subagent_roles 工具 ----
  server.tool(
    "list_subagent_roles",
    "列出支持的子 agent 角色及其默认路由、必填字段。",
    {},
    async () => {
      const result = await listSubagentRoles();
      return jsonTextResult(result);
    }
  );

  // ---- 注册 run_subagent 工具 ----
  server.tool(
    "run_subagent",
    "运行指定角色的通用子 agent。返回结构化结果：写手/修稿返回 content，审计员返回 report。",
    {
      role: z.enum(["chapter_writer", "structure_auditor", "style_auditor", "reviser"]).describe("子 agent 角色"),
      task_id: z.string().min(1).describe("任务唯一 ID，用于日志追踪"),
      provider: z.enum(["openai", "gemini"]).optional().describe("Provider（生产环境不允许覆盖默认）"),
      model: z.string().optional().describe("具体模型（生产环境不允许覆盖默认）"),
      project_context: z
        .object({
          project_name: z.string().optional(),
          genre: z.string().optional(),
          target_reader: z.string().optional(),
          l1_core: z.string().optional(),
          l0_world: z.string().optional(),
          series_l2: z.string().optional(),
          current_season_l2: z.string().optional(),
          project_rules: z.array(z.string()).optional(),
          forbidden: z.array(z.string()).optional(),
        })
        .optional(),
      chapter_context: z
        .object({
          season: z.number().optional(),
          chapter: z.number().optional(),
          chapter_title: z.string().optional(),
          chapter_beats: z.string().optional(),
          previous_chapter_tail: z.string().optional(),
          next_chapter_hook: z.string().optional(),
          existing_draft: z.string().optional(),
          previous_audit: z.string().optional(),
        })
        .optional(),
      style_rules: z
        .object({
          tone: z.string().optional(),
          narration: z.string().optional(),
          must_have: z.array(z.string()).optional(),
          anti_patterns: z.array(z.string()).optional(),
        })
        .optional(),
      output_contract: z
        .object({
          format: z.enum(["markdown", "plain"]).optional(),
          word_count: z.string().optional(),
          language: z.string().optional(),
          return_json: z.boolean().optional(),
        })
        .optional(),
      model_options: z
        .object({
          temperature: z.number().optional(),
          max_tokens: z.number().optional(),
          timeout_ms: z.number().optional(),
        })
        .optional(),
    },
    async (params) => {
      try {
        const result = await runSubagent(params);
        return jsonTextResult(result);
      } catch (err) {
        safeError("run_subagent_tool_failed", err);
        return jsonTextResult(buildRunSubagentInternalError(params, err));
      }
    }
  );

  return server;
}

// ---- Express app ----
const app = express();
app.use(express.json({ limit: "10mb" }));

// 健康端点（不需要鉴权，给监控用）
app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 根端点说明（不需要鉴权）
app.get("/", (_req: Request, res: Response) => {
  res.json({
    name: "creative-subagent-runner-mcp",
    version: "0.1.0",
    transport: "streamable-http",
    mcp_endpoint: "/mcp",
    auth: "Bearer Token required for /mcp",
  });
});

// MCP 端点（需要鉴权）
app.post("/mcp", bearerAuth, async (req: Request, res: Response) => {
  const server = createMcpServer();

  // 每个请求用独立 transport (无状态模式)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // 禁用 session 持久化，每请求一个 transport
  });

  let closed = false;
  const closeResources = async () => {
    if (closed) return;
    closed = true;
    transport.close();
    await server.close();
  };

  res.on("close", () => {
    void closeResources();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    safeError("mcp_request_failed", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  } finally {
    if (res.writableEnded) {
      await closeResources();
    }
  }
});

// 405 handler for non-POST /mcp
app.all("/mcp", (req: Request, res: Response) => {
  if (req.method !== "POST") {
    res.status(405).json({
      error: "method_not_allowed",
      message: `MCP endpoint only accepts POST. Use ${req.method} on /healthz or / instead.`,
    });
  }
});

// 全局错误处理
app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
  safeError("express_unhandled", err);
  if (!res.headersSent) {
    res.status(500).json({ error: "internal_error", message: "Internal server error" });
  }
});

// ---- 启动 ----
const server = app.listen(env.PORT, env.HOST, () => {
  logStartupConfig();
  console.log(`\n✅ MCP server listening on http://${env.HOST}:${env.PORT}`);
  console.log(`   Health (no auth):   GET  http://${env.HOST}:${env.PORT}/healthz`);
  console.log(`   Root (no auth):     GET  http://${env.HOST}:${env.PORT}/`);
  console.log(`   MCP endpoint:       POST http://${env.HOST}:${env.PORT}/mcp  (Bearer auth required)`);
  console.log(`   PID:                ${process.pid}`);
  console.log(`   Started:            ${new Date().toISOString()}\n`);
});

// 优雅退出
const shutdown = (signal: string) => {
  console.log(`\n[${signal}] shutting down...`);
  server.close(() => {
    console.log("server closed.");
    process.exit(0);
  });
  setTimeout(() => {
    console.error("forced exit after 10s");
    process.exit(1);
  }, 10000);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

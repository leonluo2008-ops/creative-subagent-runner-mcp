import express, { type Request, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { env, logStartupConfig } from "./utils/env.js";
import { adminAuth, bearerAuth } from "./security/auth.js";
import { healthCheck } from "./tools/healthCheck.js";
import { listSubagentRoles } from "./tools/listSubagentRoles.js";
import { runSubagent } from "./tools/runSubagent.js";
import { safeError } from "./security/redact.js";
import { configStore } from "./store/configStore.js";
import { adminProviderInputSchema } from "./store/types.js";

type ToolRole = "chapter_writer" | "structure_auditor" | "style_auditor" | "reviser";
const roleSchema = z.enum(["chapter_writer", "structure_auditor", "style_auditor", "reviser"]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../");
const adminPublicDir = path.join(projectRoot, "public", "admin");

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
  snapshotVersion: string,
  params: Partial<{ role: ToolRole; task_id: string }>,
  err: unknown,
) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    status: "model_error" as const,
    role: params.role ?? "chapter_writer",
    task_id: params.task_id ?? "unknown",
    config_version: snapshotVersion,
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
        "Generic MCP server for running creative writing subagents via configured providers and active config snapshots.",
    },
  );

  server.tool(
    "health_check",
    "检查 MCP server 与 provider 配置状态。返回 provider 状态、角色路由、server 配置，**不包含任何 API Key 明文**。",
    {},
    async () => {
      const result = await healthCheck();
      return jsonTextResult(result);
    },
  );

  server.tool(
    "list_subagent_roles",
    "列出支持的子 agent 角色及其默认路由、必填字段。",
    {},
    async () => {
      const result = await listSubagentRoles();
      return jsonTextResult(result);
    },
  );

  server.tool(
    "run_subagent",
    "运行指定角色的通用子 agent。返回结构化结果：写手/修稿返回 content，审计员返回 report。",
    {
      role: roleSchema.describe("子 agent 角色"),
      task_id: z.string().min(1).describe("任务唯一 ID，用于日志追踪"),
      provider: z.string().optional().describe("Provider ID 或 adapter 别名（生产环境不允许覆盖默认）"),
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
      const snapshot = configStore.getActiveSnapshot();
      try {
        const result = await runSubagent(params, snapshot);
        return jsonTextResult(result);
      } catch (err) {
        safeError("run_subagent_tool_failed", err);
        return jsonTextResult(buildRunSubagentInternalError(snapshot.configVersion, params, err));
      }
    },
  );

  return server;
}

async function createApp() {
  await configStore.initialize();

  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.get("/healthz", (_req: Request, res: Response) => {
    const snapshot = configStore.getActiveSnapshot();
    res.json({ status: "ok", timestamp: new Date().toISOString(), config_version: snapshot.configVersion });
  });

  app.get("/", (_req: Request, res: Response) => {
    res.json({
      name: "creative-subagent-runner-mcp",
      version: "0.1.0",
      transport: "streamable-http",
      mcp_endpoint: "/mcp",
      admin_ui: "/admin",
      auth: {
        mcp: "Bearer Token required for /mcp",
        admin: "Bearer Admin Token required for /api/*",
      },
    });
  });

  app.use("/admin", express.static(adminPublicDir, { extensions: ["html"] }));
  app.get("/admin", (_req: Request, res: Response) => {
    res.sendFile(path.join(adminPublicDir, "index.html"));
  });

  const adminRouter = express.Router();
  adminRouter.use(adminAuth);

  adminRouter.get("/config/roles", async (_req, res) => {
    const draft = await configStore.getDraftConfig();
    res.json({ roles: draft.roles });
  });

  adminRouter.put("/config/roles/:roleId", async (req, res) => {
    const role = roleSchema.parse(req.params.roleId);
    await configStore.saveRole(role, req.body);
    res.json({ status: "ok", role });
  });

  adminRouter.get("/config/prompts/:roleId", async (req, res) => {
    const role = roleSchema.parse(req.params.roleId);
    const draft = await configStore.getDraftConfig();
    res.json({ role, prompt: draft.prompts[role] });
  });

  adminRouter.put("/config/prompts/:roleId", async (req, res) => {
    const role = roleSchema.parse(req.params.roleId);
    const prompt = z.object({ prompt: z.string().min(1) }).parse(req.body);
    await configStore.savePrompt(role, prompt.prompt);
    res.json({ status: "ok", role });
  });

  adminRouter.get("/config/providers", async (_req, res) => {
    const draft = await configStore.getDraftConfig();
    res.json({ providers: configStore.getAdminProviderViews(draft) });
  });

  adminRouter.put("/config/providers", async (req, res) => {
    const payload = z.array(adminProviderInputSchema).parse(req.body);
    await configStore.saveAdminProviders(payload);
    res.json({ status: "ok", count: payload.length });
  });

  adminRouter.get("/runtime", async (_req, res) => {
    const draft = await configStore.getDraftConfig();
    res.json(draft.runtime);
  });

  adminRouter.put("/runtime", async (req, res) => {
    await configStore.saveRuntime(req.body);
    res.json({ status: "ok" });
  });

  adminRouter.get("/config/current", async (_req, res) => {
    res.json(await configStore.getAdminCurrentStatus());
  });

  adminRouter.delete("/config/providers/:providerId", async (req, res) => {
    await configStore.deleteProvider(req.params.providerId);
    res.json({ status: "ok", providerId: req.params.providerId });
  });

  adminRouter.post("/config/apply", async (_req, res) => {
    const snapshot = await configStore.applyDraftConfig();
    res.json({
      status: "ok",
      configVersion: snapshot.configVersion,
      activatedAt: snapshot.activatedAt,
    });
  });

  adminRouter.get("/health", async (_req, res) => {
    res.json(await healthCheck());
  });

  adminRouter.post("/test/run-subagent", async (req, res) => {
    const snapshot = configStore.getActiveSnapshot();
    const result = await runSubagent(req.body, snapshot);
    res.json(result);
  });

  app.use("/api", adminRouter);

  app.post("/mcp", bearerAuth, async (req: Request, res: Response) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
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

  app.all("/mcp", (req: Request, res: Response) => {
    if (req.method !== "POST") {
      res.status(405).json({
        error: "method_not_allowed",
        message: `MCP endpoint only accepts POST. Use ${req.method} on /healthz or / instead.`,
      });
    }
  });

  app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
    safeError("express_unhandled", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "internal_error", message: err.message || "Internal server error" });
    }
  });

  return app;
}

const app = await createApp();
const server = app.listen(env.PORT, env.HOST, () => {
  logStartupConfig();
  console.log(`\n✅ MCP server listening on http://${env.HOST}:${env.PORT}`);
  console.log(`   Health (no auth):   GET  http://${env.HOST}:${env.PORT}/healthz`);
  console.log(`   Root (no auth):     GET  http://${env.HOST}:${env.PORT}/`);
  console.log(`   MCP endpoint:       POST http://${env.HOST}:${env.PORT}/mcp  (Bearer auth required)`);
  console.log(`   Admin UI:           GET  http://${env.HOST}:${env.PORT}/admin`);
  console.log(`   Admin API:          /api/* (Bearer admin token required)`);
  console.log(`   PID:                ${process.pid}`);
  console.log(`   Started:            ${new Date().toISOString()}\n`);
});

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

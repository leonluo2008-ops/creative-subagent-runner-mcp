// =====================================================================
// env.ts — 环境变量加载与校验
// 严格区分必填/可选，缺失必填项直接抛错退出，绝不静默回退
// =====================================================================
import dotenv from "dotenv";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 优先使用当前工作目录下的 .env，兼容 dist-test；找不到再回退到源码相对路径。
const cwdEnvPath = path.resolve(process.cwd(), ".env");
const fallbackEnvPath = path.resolve(__dirname, "../../.env");
const envPath = fs.existsSync(cwdEnvPath) ? cwdEnvPath : fallbackEnvPath;
dotenv.config({ path: envPath });

const envSchema = z.object({
  // ---- Server ----
  NODE_ENV: z.enum(["production", "development", "test"]).default("production"),
  PORT: z.coerce.number().int().positive().default(3037),
  HOST: z.string().default("0.0.0.0"),

  // ---- MCP 自身鉴权（不是模型 key） ----
  MCP_AUTH_TOKEN: z.string().min(32, "MCP_AUTH_TOKEN must be at least 32 chars"),
  ADMIN_TOKEN: z.string().min(32, "ADMIN_TOKEN must be at least 32 chars"),

  // ---- OpenAI-compatible ----
  OPENAI_BASE_URL: z.string().url(),
  OPENAI_API_KEY: z.string().min(10),

  // ---- Gemini native ----
  GEMINI_BASE_URL: z.string().url(),
  GEMINI_API_KEY: z.string().min(10),

  // ---- Model defaults ----
  DEFAULT_OPENAI_MODEL: z.string().default("gpt-5.4-mini"),
  WRITER_OPENAI_MODEL: z.string().default("gpt-5.4-mini"),
  STRUCTURE_AUDITOR_OPENAI_MODEL: z.string().default("gpt-5.4-mini"),
  STYLE_AUDITOR_OPENAI_MODEL: z.string().default("gpt-5.4-mini"),
  REVISER_OPENAI_MODEL: z.string().default("gpt-5.4-mini"),

  DEFAULT_GEMINI_MODEL: z.string().default("gemini-3.1-pro-preview"),
  WRITER_GEMINI_MODEL: z.string().default("gemini-3.1-pro-preview"),
  // 2026-06-22: audit 首选切到 3.5-flash, 备用 3.1-pro-preview (server 自动 fallback)
  STRUCTURE_AUDITOR_GEMINI_MODEL: z.string().default("gemini-3.5-flash"),
  STRUCTURE_AUDITOR_GEMINI_FALLBACK_MODEL: z.string().default("gemini-3.1-pro-preview"),
  STYLE_AUDITOR_GEMINI_MODEL: z.string().default("gemini-3.5-flash"),
  STYLE_AUDITOR_GEMINI_FALLBACK_MODEL: z.string().default("gemini-3.1-pro-preview"),
  REVISER_GEMINI_MODEL: z.string().default("gemini-3.1-pro-preview"),

  // ---- Provider 路由 ----
  DEFAULT_PROVIDER: z.enum(["openai", "gemini"]).default("openai"),
  WRITER_PROVIDER: z.enum(["openai", "gemini"]).default("openai"),
  STRUCTURE_AUDITOR_PROVIDER: z.enum(["openai", "gemini"]).default("gemini"),
  STYLE_AUDITOR_PROVIDER: z.enum(["openai", "gemini"]).default("gemini"),
  REVISER_PROVIDER: z.enum(["openai", "gemini"]).default("openai"),

  // ---- Generation ----
  DEFAULT_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  DEFAULT_MAX_TOKENS: z.coerce.number().int().positive().default(8000),
  DEFAULT_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),

  // ---- Safety ----
  MAX_INPUT_CHARS: z.coerce.number().int().positive().default(120000),
  MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(16000),

  // ---- Gemini auth ----
  GEMINI_AUTH_MODE: z.enum(["bearer", "key_query", "both"]).default("both"),

  // ---- JSON mode ----
  ENABLE_JSON_MODE: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .default("false"),

  // ---- Provider override policy ----
  ALLOW_PROVIDER_OVERRIDE: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .default("false"),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ .env validation failed:");
  console.error(parsed.error.format());
  process.exit(1);
}

export const env: Env = parsed.data;

// 启动时只打印脱敏信息，**绝不打印任何 Key 内容**
export function logStartupConfig() {
  console.log("=".repeat(60));
  console.log(`[${new Date().toISOString()}] creative-subagent-runner-mcp`);
  console.log("=".repeat(60));
  console.log(`NODE_ENV:        ${env.NODE_ENV}`);
  console.log(`PORT:            ${env.PORT}`);
  console.log(`HOST:            ${env.HOST}`);
  console.log(`MCP_AUTH_TOKEN:  ${env.MCP_AUTH_TOKEN.slice(0, 4)}...${env.MCP_AUTH_TOKEN.slice(-4)} (len=${env.MCP_AUTH_TOKEN.length})`);
  console.log(`ADMIN_TOKEN:     ${env.ADMIN_TOKEN.slice(0, 4)}...${env.ADMIN_TOKEN.slice(-4)} (len=${env.ADMIN_TOKEN.length})`);
  console.log(`OPENAI_BASE_URL: ${env.OPENAI_BASE_URL}`);
  console.log(`OPENAI_API_KEY:  ${env.OPENAI_API_KEY.slice(0, 4)}...${env.OPENAI_API_KEY.slice(-4)} (len=${env.OPENAI_API_KEY.length})`);
  console.log(`GEMINI_BASE_URL: ${env.GEMINI_BASE_URL}`);
  console.log(`GEMINI_API_KEY:  ${env.GEMINI_API_KEY.slice(0, 4)}...${env.GEMINI_API_KEY.slice(-4)} (len=${env.GEMINI_API_KEY.length})`);
  console.log(`ALLOW_PROVIDER_OVERRIDE: ${env.ALLOW_PROVIDER_OVERRIDE}`);
  console.log(`GEMINI_AUTH_MODE: ${env.GEMINI_AUTH_MODE}`);
  console.log(`MAX_INPUT_CHARS: ${env.MAX_INPUT_CHARS}`);
  console.log("=".repeat(60));
}

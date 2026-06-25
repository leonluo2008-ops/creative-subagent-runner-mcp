// =====================================================================
// healthCheck.ts — 健康检查工具
// 不暴露任何 API Key 内容，只暴露脱敏后的状态
// =====================================================================
import { env } from "../utils/env.js";
import { getModelForRole, type Role } from "../llm/modelRouter.js";

export interface HealthCheckResult {
  status: "ok";
  version: string;
  providers: {
    openai: {
      enabled: boolean;
      base_url: string;
      key_configured: boolean;
      key_length: number;
    };
    gemini: {
      enabled: boolean;
      base_url: string;
      key_configured: boolean;
      key_length: number;
      auth_mode: string;
    };
  };
  roles: Array<{
    role: string;
    provider: string;
    model: string;
  }>;
  server: {
    node_env: string;
    allow_provider_override: boolean;
    max_input_chars: number;
    max_output_tokens: number;
  };
}

export async function healthCheck(): Promise<HealthCheckResult> {
  return {
    status: "ok",
    version: "0.1.0",
    providers: {
      openai: {
        enabled: env.OPENAI_API_KEY.length > 0,
        base_url: env.OPENAI_BASE_URL,
        key_configured: env.OPENAI_API_KEY.length > 0,
        key_length: env.OPENAI_API_KEY.length,
      },
      gemini: {
        enabled: env.GEMINI_API_KEY.length > 0,
        base_url: env.GEMINI_BASE_URL,
        key_configured: env.GEMINI_API_KEY.length > 0,
        key_length: env.GEMINI_API_KEY.length,
        auth_mode: env.GEMINI_AUTH_MODE,
      },
    },
    roles: [
      { role: "chapter_writer", provider: env.WRITER_PROVIDER, model: getModelForRole("chapter_writer" as Role, env.WRITER_PROVIDER as any) },
      { role: "structure_auditor", provider: env.STRUCTURE_AUDITOR_PROVIDER, model: getModelForRole("structure_auditor" as Role, env.STRUCTURE_AUDITOR_PROVIDER as any) },
      { role: "style_auditor", provider: env.STYLE_AUDITOR_PROVIDER, model: getModelForRole("style_auditor" as Role, env.STYLE_AUDITOR_PROVIDER as any) },
      { role: "reviser", provider: env.REVISER_PROVIDER, model: getModelForRole("reviser" as Role, env.REVISER_PROVIDER as any) },
    ],
    server: {
      node_env: env.NODE_ENV,
      allow_provider_override: env.ALLOW_PROVIDER_OVERRIDE,
      max_input_chars: env.MAX_INPUT_CHARS,
      max_output_tokens: env.MAX_OUTPUT_TOKENS,
    },
  };
}
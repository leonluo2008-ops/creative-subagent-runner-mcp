// =====================================================================
// healthCheck.ts — 健康检查工具
// 不暴露任何 API Key 内容，只暴露脱敏后的状态
// =====================================================================
import { env } from "../utils/env.js";
import { configStore } from "../store/configStore.js";

export interface HealthCheckResult {
  status: "ok";
  version: string;
  config_version: string;
  providers: Array<{
    id: string;
    adapter: string;
    enabled: boolean;
    base_url: string;
    secret_ref: string;
    secret_configured: boolean;
    model_count: number;
  }>;
  roles: Array<{
    role: string;
    provider: string;
    model: string;
    fallback_model: string | null;
  }>;
  server: {
    node_env: string;
    allow_provider_override: boolean;
    max_input_chars: number;
    max_output_tokens: number;
  };
}

export async function healthCheck(): Promise<HealthCheckResult> {
  const snapshot = configStore.getActiveSnapshot();
  return {
    status: "ok",
    version: "0.1.0",
    config_version: snapshot.configVersion,
    providers: snapshot.providers.map((provider) => ({
      id: provider.id,
      adapter: provider.adapter,
      enabled: provider.enabled,
      base_url: provider.baseUrl,
      secret_ref: provider.secretRef,
      secret_configured: Boolean((process.env[provider.secretRef] ?? "").trim()),
      model_count: provider.models.length,
    })),
    roles: snapshot.roles.map((role) => ({
      role: role.role,
      provider: role.providerId,
      model: role.model,
      fallback_model: role.fallbackModel,
    })),
    server: {
      node_env: env.NODE_ENV,
      allow_provider_override: snapshot.runtime.allowProviderOverride,
      max_input_chars: snapshot.runtime.maxInputChars,
      max_output_tokens: snapshot.runtime.maxOutputTokens,
    },
  };
}

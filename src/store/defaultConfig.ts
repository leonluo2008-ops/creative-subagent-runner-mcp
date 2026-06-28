import { env } from "../utils/env.js";
import {
  DEFAULT_ROLE_DEFINITIONS,
  type DefaultRoleDefinition,
} from "../roles/index.js";
import type { DraftConfig } from "./types.js";

function roleOutputType(role: DefaultRoleDefinition["role"]): "content" | "report" {
  return role === "structure_auditor" || role === "style_auditor" ? "report" : "content";
}

function roleProviderId(role: DefaultRoleDefinition["role"]): string {
  switch (role) {
    case "chapter_writer":
      return env.WRITER_PROVIDER === "gemini" ? "gemini-default" : "openai-default";
    case "structure_auditor":
      return env.STRUCTURE_AUDITOR_PROVIDER === "openai" ? "openai-default" : "gemini-default";
    case "style_auditor":
      return env.STYLE_AUDITOR_PROVIDER === "openai" ? "openai-default" : "gemini-default";
    case "reviser":
      return env.REVISER_PROVIDER === "gemini" ? "gemini-default" : "openai-default";
  }
}

function roleModel(role: DefaultRoleDefinition["role"]): string {
  switch (role) {
    case "chapter_writer":
      return env.WRITER_PROVIDER === "gemini" ? env.WRITER_GEMINI_MODEL : env.WRITER_OPENAI_MODEL;
    case "structure_auditor":
      return env.STRUCTURE_AUDITOR_PROVIDER === "openai"
        ? env.STRUCTURE_AUDITOR_OPENAI_MODEL
        : env.STRUCTURE_AUDITOR_GEMINI_MODEL;
    case "style_auditor":
      return env.STYLE_AUDITOR_PROVIDER === "openai"
        ? env.STYLE_AUDITOR_OPENAI_MODEL
        : env.STYLE_AUDITOR_GEMINI_MODEL;
    case "reviser":
      return env.REVISER_PROVIDER === "gemini" ? env.REVISER_GEMINI_MODEL : env.REVISER_OPENAI_MODEL;
  }
}

function roleFallbackModel(role: DefaultRoleDefinition["role"]): string | null {
  switch (role) {
    case "structure_auditor":
      return env.STRUCTURE_AUDITOR_PROVIDER === "gemini"
        ? env.STRUCTURE_AUDITOR_GEMINI_FALLBACK_MODEL
        : null;
    case "style_auditor":
      return env.STYLE_AUDITOR_PROVIDER === "gemini"
        ? env.STYLE_AUDITOR_GEMINI_FALLBACK_MODEL
        : null;
    default:
      return null;
  }
}

export function buildDefaultDraftConfig(): DraftConfig {
  const providers = [
    {
      id: "openai-default",
      label: "OpenAI Compatible Default",
      adapter: "openai-compatible" as const,
      enabled: true,
      baseUrl: env.OPENAI_BASE_URL,
      secretRef: "OPENAI_API_KEY",
      defaultModel: env.DEFAULT_OPENAI_MODEL,
      models: [
        env.DEFAULT_OPENAI_MODEL,
        env.WRITER_OPENAI_MODEL,
        env.STRUCTURE_AUDITOR_OPENAI_MODEL,
        env.STYLE_AUDITOR_OPENAI_MODEL,
        env.REVISER_OPENAI_MODEL,
      ],
      defaultTimeoutMs: env.DEFAULT_TIMEOUT_MS,
    },
    {
      id: "gemini-default",
      label: "Gemini Native Default",
      adapter: "gemini-native" as const,
      enabled: true,
      baseUrl: env.GEMINI_BASE_URL,
      secretRef: "GEMINI_API_KEY",
      authMode: env.GEMINI_AUTH_MODE,
      defaultModel: env.DEFAULT_GEMINI_MODEL,
      models: [
        env.DEFAULT_GEMINI_MODEL,
        env.WRITER_GEMINI_MODEL,
        env.STRUCTURE_AUDITOR_GEMINI_MODEL,
        env.STRUCTURE_AUDITOR_GEMINI_FALLBACK_MODEL,
        env.STYLE_AUDITOR_GEMINI_MODEL,
        env.STYLE_AUDITOR_GEMINI_FALLBACK_MODEL,
        env.REVISER_GEMINI_MODEL,
      ],
      defaultTimeoutMs: env.DEFAULT_TIMEOUT_MS,
    },
  ];

  const roleDefs = Object.values(DEFAULT_ROLE_DEFINITIONS);
  const roles = roleDefs.map((def) => ({
    role: def.role,
    description: def.description,
    providerId: roleProviderId(def.role),
    model: roleModel(def.role),
    fallbackModel: roleFallbackModel(def.role),
    requiredInputFields: def.requiredInputFields,
    outputType: roleOutputType(def.role),
    enabled: true,
  }));

  const prompts = Object.fromEntries(
    roleDefs.map((def) => [def.role, def.systemPrompt]),
  ) as DraftConfig["prompts"];

  return {
    runtime: {
      allowProviderOverride: env.ALLOW_PROVIDER_OVERRIDE,
      defaultTemperature: env.DEFAULT_TEMPERATURE,
      defaultMaxTokens: env.DEFAULT_MAX_TOKENS,
      defaultTimeoutMs: env.DEFAULT_TIMEOUT_MS,
      maxInputChars: env.MAX_INPUT_CHARS,
      maxOutputTokens: env.MAX_OUTPUT_TOKENS,
      logLevel: "info",
    },
    providers,
    roles,
    prompts,
  };
}

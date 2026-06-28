import { z } from "zod";

export const providerAdapterTypeSchema = z.enum(["openai-compatible", "gemini-native"]);
export type ProviderAdapterType = z.infer<typeof providerAdapterTypeSchema>;

export const roleIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/, "roleId 只能包含小写字母、数字、下划线和中划线");
export type RoleId = z.infer<typeof roleIdSchema>;

export const providerConfigSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  adapter: providerAdapterTypeSchema,
  enabled: z.boolean().default(true),
  baseUrl: z.string().url(),
  secretRef: z.string().min(1),
  authMode: z.enum(["bearer", "key_query", "both"]).optional(),
  defaultModel: z.string().min(1),
  models: z.array(z.string()).default([]),
  defaultTimeoutMs: z.number().int().positive().default(120000),
});

export type ProviderConfig = z.infer<typeof providerConfigSchema>;

export const adminProviderInputSchema = z.object({
  id: z.string().min(1),
  type: providerAdapterTypeSchema,
  baseUrl: z.string().url(),
  model: z.string().min(1),
  apiKey: z.string().optional().default(""),
  enabled: z.boolean().default(true),
});

export type AdminProviderInput = z.infer<typeof adminProviderInputSchema>;

export interface AdminProviderView {
  id: string;
  type: ProviderAdapterType;
  baseUrl: string;
  model: string;
  enabled: boolean;
  apiKeyConfigured: boolean;
  usedByRoles: string[];
  deletable: boolean;
}

export interface AdminCurrentStatus {
  active: {
    configVersion: string;
    activatedAt: string;
  };
  draftSummary: {
    providers: number;
    roles: number;
    prompts: number;
  };
  dirty: boolean;
}

export const roleConfigSchema = z.object({
  role: roleIdSchema,
  displayName: z.string().min(1),
  description: z.string().min(1),
  providerId: z.string().min(1),
  model: z.string().min(1),
  fallbackModel: z.string().min(1).nullable().default(null),
  requiredInputFields: z.array(z.string()).default([]),
  outputType: z.enum(["content", "report"]).default("content"),
  enabled: z.boolean().default(true),
  isSystem: z.boolean().default(false),
});

export type RoleConfig = z.infer<typeof roleConfigSchema>;

export const adminRoleCreateInputSchema = z.object({
  displayName: z.string().min(1),
  description: z.string().optional().default(""),
  providerId: z.string().optional(),
  model: z.string().optional(),
  fallbackModel: z.string().nullable().optional().default(null),
  requiredInputFields: z.array(z.string()).optional().default([]),
  outputType: z.enum(["content", "report"]).optional().default("content"),
  enabled: z.boolean().optional().default(true),
  prompt: z.string().optional().default(""),
});

export type AdminRoleCreateInput = z.infer<typeof adminRoleCreateInputSchema>;

export const runtimeConfigSchema = z.object({
  allowProviderOverride: z.boolean().default(false),
  defaultTemperature: z.number().min(0).max(2).default(0.7),
  defaultMaxTokens: z.number().int().positive().default(8000),
  defaultTimeoutMs: z.number().int().positive().default(120000),
  maxInputChars: z.number().int().positive().default(120000),
  maxOutputTokens: z.number().int().positive().default(16000),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

export const currentStateSchema = z.object({
  configVersion: z.string().min(1),
  activatedAt: z.string().min(1),
  summary: z.object({
    providerCount: z.number().int().nonnegative(),
    roleCount: z.number().int().nonnegative(),
  }),
});

export type CurrentState = z.infer<typeof currentStateSchema>;

export const activeSnapshotSchema = z.object({
  configVersion: z.string().min(1),
  activatedAt: z.string().min(1),
  runtime: runtimeConfigSchema,
  providers: z.array(providerConfigSchema),
  roles: z.array(roleConfigSchema),
  prompts: z.record(z.string(), z.string()),
});

export type ActiveConfigSnapshot = z.infer<typeof activeSnapshotSchema>;

export interface DraftConfig {
  runtime: RuntimeConfig;
  providers: ProviderConfig[];
  roles: RoleConfig[];
  prompts: Record<string, string>;
}

export interface ProviderResolvedSecret {
  provider: ProviderConfig;
  secret: string;
}

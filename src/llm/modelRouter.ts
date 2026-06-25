// =====================================================================
// modelRouter.ts — Provider / Model 路由
// 强制: 生产环境不允许调用方覆盖角色路由
// 2026-06-22: audit 角色加 fallback model (首选 3.5-flash → 备用 3.1-pro-preview)
// =====================================================================
import { env } from "../utils/env.js";
import { safeError } from "../security/redact.js";

export type Role = "chapter_writer" | "structure_auditor" | "style_auditor" | "reviser";
export type Provider = "openai" | "gemini";

export interface RoleDefaultRoute {
  provider: Provider;
  model: string;
  reason: string;
}

const ROLE_DEFAULT_ROUTES: Record<Role, RoleDefaultRoute> = {
  chapter_writer: {
    provider: "openai",
    model: "gpt-5.4-mini",
    reason: "写正文、对白、中文叙事、风格化表达（v2.0.2 起可通过 WRITER_PROVIDER=gemini 切到 gemini-3.5-flash）",
  },
  structure_auditor: {
    provider: "gemini",
    model: "gemini-3.5-flash",
    reason: "长上下文审查、结构一致性、伏笔和章间承接 (2026-06-22 首选 3.5-flash, 备用 3.1-pro-preview)",
  },
  style_auditor: {
    provider: "gemini",
    model: "gemini-3.5-flash",
    reason: "长上下文风格审查、反模式检查、目标读者适配 (2026-06-22 首选 3.5-flash, 备用 3.1-pro-preview)",
  },
  reviser: {
    provider: "openai",
    model: "gpt-5.4-mini",
    reason: "根据审计报告修正文稿，保持中文表达质量（v2.0.2 起可通过 REVISER_PROVIDER=gemini 切到 gemini-3.5-flash）",
  },
};

/**
 * 获取角色的默认路由
 */
export function getRoleDefaultRoute(role: Role): RoleDefaultRoute {
  const defaultRoute = ROLE_DEFAULT_ROUTES[role];
  if (!defaultRoute) {
    throw new Error(`Unknown role: ${role}`);
  }

  // 根据 .env 中的 PROVIDER 偏好，复用 env 中的 model (而非代码硬编码)
  // v2.0.2 修复 (Bug #007 followup): provider override 必须同时调 getModelForRole()
  // 否则 env 里的 *_GEMINI_MODEL 永远被忽略
  const providerOverride = getProviderOverrideFromEnv(role);
  if (providerOverride) {
    return {
      provider: providerOverride,
      model: getModelForRole(role, providerOverride),
      reason: defaultRoute.reason + ` (env override: ${providerOverride})`,
    };
  }

  return defaultRoute;
}

function getProviderOverrideFromEnv(role: Role): Provider | null {
  switch (role) {
    case "chapter_writer":
      return env.WRITER_PROVIDER;
    case "structure_auditor":
      return env.STRUCTURE_AUDITOR_PROVIDER;
    case "style_auditor":
      return env.STYLE_AUDITOR_PROVIDER;
    case "reviser":
      return env.REVISER_PROVIDER;
  }
}

/**
 * 根据角色 + provider 选择具体 model
 * 优先用角色专属 env 变量，回退到 DEFAULT_*_MODEL
 */
export function getModelForRole(role: Role, provider: Provider): string {
  if (provider === "openai") {
    switch (role) {
      case "chapter_writer":
        return env.WRITER_OPENAI_MODEL || env.DEFAULT_OPENAI_MODEL;
      case "structure_auditor":
        return env.STRUCTURE_AUDITOR_OPENAI_MODEL || env.DEFAULT_OPENAI_MODEL;
      case "style_auditor":
        return env.STYLE_AUDITOR_OPENAI_MODEL || env.DEFAULT_OPENAI_MODEL;
      case "reviser":
        return env.REVISER_OPENAI_MODEL || env.DEFAULT_OPENAI_MODEL;
    }
  }
  if (provider === "gemini") {
    switch (role) {
      case "chapter_writer":
        return env.WRITER_GEMINI_MODEL || env.DEFAULT_GEMINI_MODEL;
      case "structure_auditor":
        return env.STRUCTURE_AUDITOR_GEMINI_MODEL || env.DEFAULT_GEMINI_MODEL;
      case "style_auditor":
        return env.STYLE_AUDITOR_GEMINI_MODEL || env.DEFAULT_GEMINI_MODEL;
      case "reviser":
        return env.REVISER_GEMINI_MODEL || env.DEFAULT_GEMINI_MODEL;
    }
  }
  throw new Error(`Unsupported provider '${provider}' for role '${role}'`);
}

/**
 * 获取角色的 fallback model (2026-06-22 新增)
 * - 仅 audit 角色 (structure_auditor / style_auditor) 配置了 fallback
 * - chapter_writer / reviser 没有 fallback (它们的 provider 是 openai, 实测不限流)
 * - 返回 null 表示该角色没有 fallback
 */
export function getFallbackModelForRole(role: Role, provider: Provider): string | null {
  if (provider !== "gemini") return null;
  switch (role) {
    case "structure_auditor":
      return env.STRUCTURE_AUDITOR_GEMINI_FALLBACK_MODEL || null;
    case "style_auditor":
      return env.STYLE_AUDITOR_GEMINI_FALLBACK_MODEL || null;
    default:
      return null;
  }
}

export interface ResolvedRoute {
  provider: Provider;
  model: string;
  role: Role;
  reason: string;
  /** 是否使用了 ALLOW_PROVIDER_OVERRIDE 才通过的覆盖 */
  overrideApplied: boolean;
}

export interface RouteResolutionError {
  status: "provider_role_mismatch" | "unsupported_role";
  message: string;
  role: Role;
  requestedProvider?: Provider;
  requestedModel?: string;
  expectedProvider: Provider;
  expectedModel: string;
}

/**
 * 解析最终路由
 * - 调用方传入 provider/model 与角色默认一致 → OK
 * - 不一致 + ALLOW_PROVIDER_OVERRIDE=false → 报 provider_role_mismatch
 * - 不一致 + ALLOW_PROVIDER_OVERRIDE=true → 允许（仅测试）
 * - 都不传 → 用角色默认
 */
export function resolveRoute(
  role: Role,
  requestedProvider?: string,
  requestedModel?: string
): { ok: true; route: ResolvedRoute } | { ok: false; error: RouteResolutionError } {
  const defaultRoute = getRoleDefaultRoute(role);
  const expectedProvider = defaultRoute.provider;
  const expectedModel = defaultRoute.model;

  // 完全没指定 → 用默认
  if (!requestedProvider && !requestedModel) {
    return {
      ok: true,
      route: {
        provider: expectedProvider,
        model: expectedModel,
        role,
        reason: defaultRoute.reason,
        overrideApplied: false,
      },
    };
  }

  // 指定了 provider → 校验
  const providerNormalized = requestedProvider?.toLowerCase() as Provider | undefined;

  // 非法 provider
  if (providerNormalized && providerNormalized !== "openai" && providerNormalized !== "gemini") {
    return {
      ok: false,
      error: {
        status: "provider_role_mismatch",
        role,
        requestedProvider: providerNormalized,
        requestedModel,
        expectedProvider,
        expectedModel,
        message: `Unsupported provider '${providerNormalized}'. Expected '${expectedProvider}' for role '${role}'.`,
      },
    };
  }

  // provider 与默认冲突
  if (providerNormalized && providerNormalized !== expectedProvider) {
    if (!env.ALLOW_PROVIDER_OVERRIDE) {
      return {
        ok: false,
        error: {
          status: "provider_role_mismatch",
          role,
          requestedProvider: providerNormalized,
          requestedModel,
          expectedProvider,
          expectedModel,
          message: `${role} must default to ${expectedProvider}. If testing requires override, set ALLOW_PROVIDER_OVERRIDE=true on server.`,
        },
      };
    }
    // 允许覆盖
    safeError("provider_override_applied", new Error(`role=${role} provider=${providerNormalized} (override mode)`));
    return {
      ok: true,
      route: {
        provider: providerNormalized,
        model: requestedModel ?? expectedModel,
        role,
        reason: defaultRoute.reason + " (override mode)",
        overrideApplied: true,
      },
    };
  }

  // provider 一致，model 不一致
  if (requestedModel && requestedModel !== expectedModel) {
    if (!env.ALLOW_PROVIDER_OVERRIDE) {
      return {
        ok: false,
        error: {
          status: "provider_role_mismatch",
          role,
          requestedProvider: expectedProvider,
          requestedModel,
          expectedProvider,
          expectedModel,
          message: `${role} uses ${expectedModel} by default. To use '${requestedModel}', set ALLOW_PROVIDER_OVERRIDE=true.`,
        },
      };
    }
    return {
      ok: true,
      route: {
        provider: expectedProvider,
        model: requestedModel,
        role,
        reason: defaultRoute.reason + " (model override)",
        overrideApplied: true,
      },
    };
  }

  // 全部一致
  return {
    ok: true,
    route: {
      provider: expectedProvider,
      model: expectedModel,
      role,
      reason: defaultRoute.reason,
      overrideApplied: false,
    },
  };
}
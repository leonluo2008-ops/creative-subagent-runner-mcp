import { safeError } from "../security/redact.js";
import type { ActiveConfigSnapshot, ProviderConfig, RoleConfig } from "../store/types.js";

export type Role = string;
export type Provider = "openai" | "gemini";

function adapterAlias(adapter: ProviderConfig["adapter"]): Provider {
  return adapter === "gemini-native" ? "gemini" : "openai";
}

function getRoleConfig(snapshot: ActiveConfigSnapshot, role: Role): RoleConfig {
  const config = snapshot.roles.find((item) => item.role === role);
  if (!config) {
    throw new Error(`Unknown role: ${role}`);
  }
  return config;
}

export interface RoleDefaultRoute {
  providerId: string;
  provider: Provider;
  model: string;
  reason: string;
}

export function getRoleDefaultRoute(snapshot: ActiveConfigSnapshot, role: Role): RoleDefaultRoute {
  const roleConfig = getRoleConfig(snapshot, role);
  const provider = snapshot.providers.find((item) => item.id === roleConfig.providerId);
  if (!provider) {
    throw new Error(`Role '${role}' references missing provider '${roleConfig.providerId}'.`);
  }

  return {
    providerId: provider.id,
    provider: adapterAlias(provider.adapter),
    model: roleConfig.model,
    reason: `${role} -> ${provider.id}/${roleConfig.model}`,
  };
}

export function getModelForRole(snapshot: ActiveConfigSnapshot, role: Role, providerId?: string): string {
  const roleConfig = getRoleConfig(snapshot, role);
  if (!providerId || providerId === roleConfig.providerId) {
    return roleConfig.model;
  }
  const provider = snapshot.providers.find((item) => item.id === providerId);
  if (!provider) {
    throw new Error(`Unsupported provider '${providerId}' for role '${role}'.`);
  }
  return provider.defaultModel;
}

export function getFallbackModelForRole(snapshot: ActiveConfigSnapshot, role: Role): string | null {
  return getRoleConfig(snapshot, role).fallbackModel;
}

export interface ResolvedRoute {
  providerId: string;
  provider: Provider;
  model: string;
  role: Role;
  reason: string;
  overrideApplied: boolean;
}

export interface RouteResolutionError {
  status: "provider_role_mismatch" | "unsupported_role";
  message: string;
  role: Role;
  requestedProvider?: string;
  requestedModel?: string;
  expectedProvider: string;
  expectedModel: string;
}

export function resolveRoute(
  snapshot: ActiveConfigSnapshot,
  role: Role,
  requestedProvider?: string,
  requestedModel?: string,
): { ok: true; route: ResolvedRoute } | { ok: false; error: RouteResolutionError } {
  const roleConfig = getRoleConfig(snapshot, role);
  const provider = snapshot.providers.find((item) => item.id === roleConfig.providerId);

  if (!provider) {
    return {
      ok: false,
      error: {
        status: "provider_role_mismatch",
        role,
        requestedProvider,
        requestedModel,
        expectedProvider: roleConfig.providerId,
        expectedModel: roleConfig.model,
        message: `Role '${role}' references missing provider '${roleConfig.providerId}'.`,
      },
    };
  }

  const expectedProviderId = provider.id;
  const expectedProviderAlias = adapterAlias(provider.adapter);
  const expectedModel = roleConfig.model;

  if (!requestedProvider && !requestedModel) {
    return {
      ok: true,
      route: {
        providerId: expectedProviderId,
        provider: expectedProviderAlias,
        model: expectedModel,
        role,
        reason: `${role} -> ${expectedProviderId}/${expectedModel}`,
        overrideApplied: false,
      },
    };
  }

  const requestedNormalized = requestedProvider?.toLowerCase();
  const matchesProvider =
    !requestedNormalized ||
    requestedNormalized === expectedProviderId.toLowerCase() ||
    requestedNormalized === expectedProviderAlias;

  if (!matchesProvider) {
    if (!snapshot.runtime.allowProviderOverride) {
      return {
        ok: false,
        error: {
          status: "provider_role_mismatch",
          role,
          requestedProvider,
          requestedModel,
          expectedProvider: expectedProviderId,
          expectedModel,
          message: `${role} must default to ${expectedProviderId}. To override provider, enable allowProviderOverride.`,
        },
      };
    }

    const overrideProvider = snapshot.providers.find(
      (item) =>
        item.id.toLowerCase() === requestedNormalized ||
        adapterAlias(item.adapter) === requestedNormalized,
    );

    if (!overrideProvider) {
      return {
        ok: false,
        error: {
          status: "provider_role_mismatch",
          role,
          requestedProvider,
          requestedModel,
          expectedProvider: expectedProviderId,
          expectedModel,
          message: `Unknown provider override '${requestedProvider}'.`,
        },
      };
    }

    safeError(
      "provider_override_applied",
      new Error(`role=${role} provider=${overrideProvider.id} (override mode)`),
    );

    return {
      ok: true,
      route: {
        providerId: overrideProvider.id,
        provider: adapterAlias(overrideProvider.adapter),
        model: requestedModel ?? overrideProvider.defaultModel,
        role,
        reason: `${role} -> ${overrideProvider.id}/${requestedModel ?? overrideProvider.defaultModel} (override mode)`,
        overrideApplied: true,
      },
    };
  }

  if (requestedModel && requestedModel !== expectedModel) {
    if (!snapshot.runtime.allowProviderOverride) {
      return {
        ok: false,
        error: {
          status: "provider_role_mismatch",
          role,
          requestedProvider: expectedProviderId,
          requestedModel,
          expectedProvider: expectedProviderId,
          expectedModel,
          message: `${role} uses ${expectedModel} by default. To use '${requestedModel}', enable allowProviderOverride.`,
        },
      };
    }

    return {
      ok: true,
      route: {
        providerId: expectedProviderId,
        provider: expectedProviderAlias,
        model: requestedModel,
        role,
        reason: `${role} -> ${expectedProviderId}/${requestedModel} (model override)`,
        overrideApplied: true,
      },
    };
  }

  return {
    ok: true,
    route: {
      providerId: expectedProviderId,
      provider: expectedProviderAlias,
      model: expectedModel,
      role,
      reason: `${role} -> ${expectedProviderId}/${expectedModel}`,
      overrideApplied: false,
    },
  };
}

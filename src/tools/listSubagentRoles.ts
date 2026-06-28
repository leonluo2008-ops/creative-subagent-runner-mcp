// =====================================================================
// tools/listSubagentRoles.ts
// 列出支持的子 agent 角色 + 默认路由
// =====================================================================
import { getRoleDefaultRoute } from "../llm/modelRouter.js";
import type { Role } from "../llm/modelRouter.js";
import { configStore } from "../store/configStore.js";

export interface ListRolesResult {
  roles: Array<{
    role: Role;
    description: string;
    default_provider: string;
    default_provider_adapter: string;
    default_model: string;
    required_input_fields: string[];
    enabled: boolean;
  }>;
}

export async function listSubagentRoles(): Promise<ListRolesResult> {
  const snapshot = configStore.getActiveSnapshot();
  const defs = snapshot.roles;
  return {
    roles: defs.map((def) => {
      const route = getRoleDefaultRoute(snapshot, def.role);
      return {
        role: def.role,
        description: def.description,
        default_provider: route.providerId,
        default_provider_adapter: route.provider,
        default_model: snapshot.runtime.allowProviderOverride
          ? route.model
          : `${route.model} (override locked: ${!snapshot.runtime.allowProviderOverride})`,
        required_input_fields: def.requiredInputFields,
        enabled: def.enabled,
      };
    }),
  };
}

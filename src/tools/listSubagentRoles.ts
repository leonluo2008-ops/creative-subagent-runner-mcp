// =====================================================================
// tools/listSubagentRoles.ts
// 列出支持的子 agent 角色 + 默认路由
// =====================================================================
import { listRoles } from "../roles/index.js";
import { env } from "../utils/env.js";
import { getRoleDefaultRoute } from "../llm/modelRouter.js";
import type { Role } from "../llm/modelRouter.js";

export interface ListRolesResult {
  roles: Array<{
    role: Role;
    description: string;
    default_provider: string;
    default_model: string;
    required_input_fields: string[];
  }>;
}

export async function listSubagentRoles(): Promise<ListRolesResult> {
  const defs = listRoles();
  return {
    roles: defs.map((def) => {
      const route = getRoleDefaultRoute(def.role);
      return {
        role: def.role,
        description: def.description,
        default_provider: route.provider,
        default_model: env.ALLOW_PROVIDER_OVERRIDE ? route.model : `${route.model} (override locked: ${!env.ALLOW_PROVIDER_OVERRIDE})`,
        required_input_fields: def.requiredInputFields,
      };
    }),
  };
}
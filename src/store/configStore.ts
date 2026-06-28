import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import type { Role } from "../llm/modelRouter.js";
import { buildDefaultDraftConfig } from "./defaultConfig.js";
import {
  activeSnapshotSchema,
  adminProviderInputSchema,
  currentStateSchema,
  providerConfigSchema,
  roleConfigSchema,
  runtimeConfigSchema,
  type AdminCurrentStatus,
  type AdminProviderInput,
  type AdminProviderView,
  type ActiveConfigSnapshot,
  type CurrentState,
  type DraftConfig,
  type ProviderConfig,
  type ProviderResolvedSecret,
  type RoleConfig,
} from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../");

const CONFIG_DIR = path.join(projectRoot, "config");
const ROLES_DIR = path.join(CONFIG_DIR, "roles");
const PROMPTS_DIR = path.join(CONFIG_DIR, "prompts");
const STATE_DIR = path.join(CONFIG_DIR, "state");
const PROVIDERS_FILE = path.join(CONFIG_DIR, "providers.json");
const RUNTIME_FILE = path.join(CONFIG_DIR, "runtime.json");
const CURRENT_FILE = path.join(STATE_DIR, "current.json");
const ACTIVE_SNAPSHOT_FILE = path.join(STATE_DIR, "active-snapshot.json");
const ENV_FILE = path.join(projectRoot, ".env");

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tempFile = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(tempFile, content, "utf8");
  await fs.rename(tempFile, filePath);
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await atomicWriteFile(filePath, JSON.stringify(value, null, 2));
}

function upsertEnvContent(content: string, updates: Record<string, string>): string {
  const lines = content.split(/\r?\n/);
  const nextLines = [...lines];

  for (const [key, value] of Object.entries(updates)) {
    const encodedValue = value.replace(/\r?\n/g, "\\n");
    const lineValue = `${key}=${encodedValue}`;
    const index = nextLines.findIndex((line) => line.startsWith(`${key}=`));
    if (index >= 0) {
      nextLines[index] = lineValue;
    } else {
      if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") {
        nextLines.push("");
      }
      nextLines.push(lineValue);
    }
  }

  return `${nextLines.join("\n").replace(/\n+$/g, "")}\n`;
}

async function updateEnvFile(updates: Record<string, string>): Promise<void> {
  const current = (await exists(ENV_FILE)) ? await fs.readFile(ENV_FILE, "utf8") : "";
  const next = upsertEnvContent(current, updates);
  await atomicWriteFile(ENV_FILE, next);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function collectRoleModelsForProvider(roles: RoleConfig[], providerId: string): string[] {
  const models: string[] = [];
  for (const role of roles) {
    if (role.providerId !== providerId) continue;
    models.push(role.model);
    if (role.fallbackModel) {
      models.push(role.fallbackModel);
    }
  }
  return uniqueStrings(models);
}

function collectRoleIdsForProvider(roles: RoleConfig[], providerId: string): string[] {
  return roles.filter((role) => role.providerId === providerId).map((role) => role.role);
}

function sanitizeEnvKeySegment(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

function getSecretRefForProvider(providerId: string, adapter: ProviderConfig["adapter"]): string {
  if (providerId === "openai-default") return "OPENAI_API_KEY";
  if (providerId === "gemini-default") return "GEMINI_API_KEY";
  const suffix = adapter === "gemini-native" ? "GEMINI" : "OPENAI";
  return `PROVIDER_${sanitizeEnvKeySegment(providerId)}_${suffix}_API_KEY`;
}

function getAuthModeForAdapter(adapter: ProviderConfig["adapter"]): ProviderConfig["authMode"] {
  return adapter === "gemini-native" ? "both" : undefined;
}

function generateConfigVersion(): string {
  return `${new Date().toISOString()}-${randomUUID().slice(0, 8)}`;
}

function buildComparableConfig(draft: DraftConfig) {
  return {
    runtime: draft.runtime,
    providers: draft.providers,
    roles: draft.roles,
    prompts: draft.prompts,
  };
}

function buildComparableSnapshot(snapshot: ActiveConfigSnapshot) {
  return {
    runtime: snapshot.runtime,
    providers: snapshot.providers,
    roles: snapshot.roles,
    prompts: snapshot.prompts,
  };
}

function validateDraftConfig(draft: DraftConfig): DraftConfig {
  const providers = draft.providers.map((provider) => providerConfigSchema.parse(provider));
  const roles = draft.roles.map((role) => roleConfigSchema.parse(role));
  const runtime = runtimeConfigSchema.parse(draft.runtime);

  const providerMap = new Map(providers.map((provider) => [provider.id, provider]));

  for (const provider of providers) {
    const secret = process.env[provider.secretRef] ?? "";
    if (!secret.trim()) {
      throw new Error(`Provider '${provider.id}' references missing secret '${provider.secretRef}'.`);
    }
  }

  for (const role of roles) {
    const provider = providerMap.get(role.providerId);
    if (!provider) {
      throw new Error(`Role '${role.role}' references unknown provider '${role.providerId}'.`);
    }
    if (!provider.enabled) {
      throw new Error(`Role '${role.role}' references disabled provider '${role.providerId}'.`);
    }
    if (provider.models.length > 0 && !provider.models.includes(role.model)) {
      throw new Error(`Role '${role.role}' uses model '${role.model}' not listed in provider '${provider.id}'.`);
    }
    if (role.fallbackModel && provider.models.length > 0 && !provider.models.includes(role.fallbackModel)) {
      throw new Error(
        `Role '${role.role}' fallback model '${role.fallbackModel}' not listed in provider '${provider.id}'.`,
      );
    }
    if (provider.adapter === "openai-compatible" && role.fallbackModel) {
      throw new Error(`Role '${role.role}' uses fallback model but provider '${provider.id}' is not Gemini.`);
    }
  }

  const prompts = draft.prompts;
  for (const role of roles) {
    const prompt = prompts[role.role];
    if (!prompt || !prompt.trim()) {
      throw new Error(`Prompt for role '${role.role}' is missing or empty.`);
    }
  }

  return {
    runtime,
    providers,
    roles,
    prompts,
  };
}

async function loadDraftConfigFromDisk(): Promise<DraftConfig> {
  const providersRaw = await readJsonFile<ProviderConfig[]>(PROVIDERS_FILE);
  const runtimeRaw = runtimeConfigSchema.parse(await readJsonFile(RUNTIME_FILE));
  const roleFiles = await fs.readdir(ROLES_DIR);
  const promptFiles = await fs.readdir(PROMPTS_DIR);

  const roles: RoleConfig[] = [];
  for (const fileName of roleFiles.filter((name) => name.endsWith(".json"))) {
    roles.push(await readJsonFile<RoleConfig>(path.join(ROLES_DIR, fileName)));
  }

  const prompts = {} as DraftConfig["prompts"];
  for (const fileName of promptFiles.filter((name) => name.endsWith(".md"))) {
    const role = fileName.replace(/\.md$/, "") as Role;
    prompts[role] = await fs.readFile(path.join(PROMPTS_DIR, fileName), "utf8");
  }

  return validateDraftConfig({
    runtime: runtimeRaw,
    providers: providersRaw,
    roles,
    prompts,
  });
}

async function bootstrapDraftConfigIfMissing(): Promise<void> {
  await ensureDir(CONFIG_DIR);
  await ensureDir(ROLES_DIR);
  await ensureDir(PROMPTS_DIR);
  await ensureDir(STATE_DIR);

  const defaults = buildDefaultDraftConfig();

  if (!(await exists(PROVIDERS_FILE))) {
    await writeJsonFile(PROVIDERS_FILE, defaults.providers);
  }
  if (!(await exists(RUNTIME_FILE))) {
    await writeJsonFile(RUNTIME_FILE, defaults.runtime);
  }

  for (const role of defaults.roles) {
    const roleFile = path.join(ROLES_DIR, `${role.role}.json`);
    if (!(await exists(roleFile))) {
      await writeJsonFile(roleFile, role);
    }
  }

  for (const [role, prompt] of Object.entries(defaults.prompts)) {
    const promptFile = path.join(PROMPTS_DIR, `${role}.md`);
    if (!(await exists(promptFile))) {
      await atomicWriteFile(promptFile, prompt);
    }
  }
}

function buildSnapshot(draft: DraftConfig, version: string, activatedAt: string): ActiveConfigSnapshot {
  return activeSnapshotSchema.parse({
    configVersion: version,
    activatedAt,
    runtime: draft.runtime,
    providers: draft.providers,
    roles: draft.roles,
    prompts: draft.prompts,
  });
}

async function persistActivatedSnapshot(snapshot: ActiveConfigSnapshot): Promise<void> {
  const currentState: CurrentState = currentStateSchema.parse({
    configVersion: snapshot.configVersion,
    activatedAt: snapshot.activatedAt,
    summary: {
      providerCount: snapshot.providers.length,
      roleCount: snapshot.roles.length,
    },
  });

  await writeJsonFile(ACTIVE_SNAPSHOT_FILE, snapshot);
  await writeJsonFile(CURRENT_FILE, currentState);
}

class ConfigStore {
  private activeSnapshot: ActiveConfigSnapshot | null = null;

  async initialize(): Promise<void> {
    await bootstrapDraftConfigIfMissing();

    if (await exists(ACTIVE_SNAPSHOT_FILE)) {
      const raw = await readJsonFile(ACTIVE_SNAPSHOT_FILE);
      this.activeSnapshot = activeSnapshotSchema.parse(raw);
      return;
    }

    const draft = await loadDraftConfigFromDisk();
    const snapshot = buildSnapshot(draft, generateConfigVersion(), new Date().toISOString());
    await persistActivatedSnapshot(snapshot);
    this.activeSnapshot = snapshot;
  }

  getActiveSnapshot(): ActiveConfigSnapshot {
    if (!this.activeSnapshot) {
      throw new Error("Config store is not initialized.");
    }
    return this.activeSnapshot;
  }

  async getDraftConfig(): Promise<DraftConfig> {
    await bootstrapDraftConfigIfMissing();
    return loadDraftConfigFromDisk();
  }

  async applyDraftConfig(): Promise<ActiveConfigSnapshot> {
    const draft = await this.getDraftConfig();
    const snapshot = buildSnapshot(draft, generateConfigVersion(), new Date().toISOString());
    await persistActivatedSnapshot(snapshot);
    this.activeSnapshot = snapshot;
    return snapshot;
  }

  async saveRuntime(runtime: DraftConfig["runtime"]): Promise<void> {
    const parsed = runtimeConfigSchema.parse(runtime);
    await writeJsonFile(RUNTIME_FILE, parsed);
  }

  async saveProviders(providers: ProviderConfig[]): Promise<void> {
    const normalized = providers.map((provider) =>
      providerConfigSchema.parse({
        ...provider,
        models: uniqueStrings(provider.models ?? []),
      }),
    );
    await writeJsonFile(PROVIDERS_FILE, normalized);
  }

  getAdminProviderViews(draft: DraftConfig): AdminProviderView[] {
    return draft.providers.map((provider) => {
      const usedByRoles = collectRoleIdsForProvider(draft.roles, provider.id);
      return {
      id: provider.id,
      type: provider.adapter,
      baseUrl: provider.baseUrl,
      model: provider.defaultModel,
      enabled: provider.enabled,
      apiKeyConfigured: Boolean((process.env[provider.secretRef] ?? "").trim()),
      usedByRoles,
      deletable: !usedByRoles.length,
    };
    });
  }

  async getAdminCurrentStatus(): Promise<AdminCurrentStatus> {
    const draft = await this.getDraftConfig();
    const active = this.getActiveSnapshot();
    const dirty = JSON.stringify(buildComparableConfig(draft)) !== JSON.stringify(buildComparableSnapshot(active));

    return {
      active: {
        configVersion: active.configVersion,
        activatedAt: active.activatedAt,
      },
      draftSummary: {
        providers: draft.providers.length,
        roles: draft.roles.length,
        prompts: Object.keys(draft.prompts).length,
      },
      dirty,
    };
  }

  async saveAdminProviders(inputs: AdminProviderInput[]): Promise<void> {
    const currentDraft = await this.getDraftConfig();
    const currentById = new Map(currentDraft.providers.map((provider) => [provider.id, provider]));
    const envUpdates: Record<string, string> = {};

    const normalized = inputs.map((input) => {
      const parsed = adminProviderInputSchema.parse(input);
      const existing = currentById.get(parsed.id);
      const secretRef = existing?.secretRef ?? getSecretRefForProvider(parsed.id, parsed.type);
      const apiKey = parsed.apiKey.trim();
      const existingKey = process.env[secretRef] ?? "";

      if (!apiKey && !existingKey.trim()) {
        throw new Error(`Provider '${parsed.id}' requires an API key the first time it is saved.`);
      }

      if (apiKey) {
        envUpdates[secretRef] = apiKey;
        process.env[secretRef] = apiKey;
      }

      const roleModels = collectRoleModelsForProvider(currentDraft.roles, parsed.id);
      return providerConfigSchema.parse({
        id: parsed.id,
        label: existing?.label ?? parsed.id,
        adapter: parsed.type,
        enabled: parsed.enabled,
        baseUrl: parsed.baseUrl,
        secretRef,
        authMode: getAuthModeForAdapter(parsed.type),
        defaultModel: parsed.model,
        models: uniqueStrings([parsed.model, ...roleModels]),
        defaultTimeoutMs: currentDraft.runtime.defaultTimeoutMs,
      });
    });

    if (Object.keys(envUpdates).length > 0) {
      await updateEnvFile(envUpdates);
    }

    await writeJsonFile(PROVIDERS_FILE, normalized);
  }

  async deleteProvider(providerId: string): Promise<void> {
    const draft = await this.getDraftConfig();
    const usedByRoles = collectRoleIdsForProvider(draft.roles, providerId);
    if (usedByRoles.length > 0) {
      throw new Error(`Provider '${providerId}' is still used by roles: ${usedByRoles.join(", ")}.`);
    }

    const existing = draft.providers.find((provider) => provider.id === providerId);
    if (!existing) {
      throw new Error(`Provider '${providerId}' does not exist.`);
    }

    await writeJsonFile(
      PROVIDERS_FILE,
      draft.providers.filter((provider) => provider.id !== providerId),
    );
  }

  async saveRole(role: Role, roleConfig: RoleConfig): Promise<void> {
    const parsed = roleConfigSchema.parse({
      ...roleConfig,
      role,
      requiredInputFields: uniqueStrings(roleConfig.requiredInputFields ?? []),
    });
    await writeJsonFile(path.join(ROLES_DIR, `${role}.json`), parsed);
  }

  async savePrompt(role: Role, prompt: string): Promise<void> {
    if (!prompt.trim()) {
      throw new Error(`Prompt for role '${role}' cannot be empty.`);
    }
    await atomicWriteFile(path.join(PROMPTS_DIR, `${role}.md`), prompt);
  }

  getProviderById(snapshot: ActiveConfigSnapshot, providerId: string): ProviderConfig {
    const provider = snapshot.providers.find((item) => item.id === providerId);
    if (!provider) {
      throw new Error(`Unknown provider '${providerId}'.`);
    }
    return provider;
  }

  resolveProviderSecret(provider: ProviderConfig): ProviderResolvedSecret {
    const secret = process.env[provider.secretRef] ?? "";
    if (!secret.trim()) {
      throw new Error(`Provider '${provider.id}' missing secret '${provider.secretRef}'.`);
    }
    return { provider, secret };
  }
}

export const configStore = new ConfigStore();
export { ACTIVE_SNAPSHOT_FILE, CONFIG_DIR, CURRENT_FILE };

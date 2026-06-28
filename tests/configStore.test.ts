import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promises as fs } from "node:fs";

function ensureTestEnv() {
  process.env.NODE_ENV ??= "test";
  process.env.MCP_AUTH_TOKEN ??= "mcp-token-for-tests-1234567890abcdef";
  process.env.ADMIN_TOKEN ??= "admin-token-for-tests-1234567890abcd";
  process.env.OPENAI_BASE_URL ??= "https://openai.test.local/v1";
  process.env.OPENAI_API_KEY ??= "sk-openai-test-key-12345";
  process.env.GEMINI_BASE_URL ??= "https://gemini.test.local";
  process.env.GEMINI_API_KEY ??= "sk-gemini-test-key-12345";
  process.env.DEFAULT_OPENAI_MODEL ??= "gpt-test-mini";
  process.env.WRITER_OPENAI_MODEL ??= "gpt-test-mini";
  process.env.STRUCTURE_AUDITOR_OPENAI_MODEL ??= "gpt-test-mini";
  process.env.STYLE_AUDITOR_OPENAI_MODEL ??= "gpt-test-mini";
  process.env.REVISER_OPENAI_MODEL ??= "gpt-test-mini";
  process.env.DEFAULT_GEMINI_MODEL ??= "gemini-test-pro";
  process.env.WRITER_GEMINI_MODEL ??= "gemini-test-pro";
  process.env.STRUCTURE_AUDITOR_GEMINI_MODEL ??= "gemini-test-flash";
  process.env.STRUCTURE_AUDITOR_GEMINI_FALLBACK_MODEL ??= "gemini-test-fallback";
  process.env.STYLE_AUDITOR_GEMINI_MODEL ??= "gemini-test-flash";
  process.env.STYLE_AUDITOR_GEMINI_FALLBACK_MODEL ??= "gemini-test-fallback";
  process.env.REVISER_GEMINI_MODEL ??= "gemini-test-pro";
  process.env.DEFAULT_PROVIDER ??= "openai";
  process.env.WRITER_PROVIDER ??= "openai";
  process.env.STRUCTURE_AUDITOR_PROVIDER ??= "gemini";
  process.env.STYLE_AUDITOR_PROVIDER ??= "gemini";
  process.env.REVISER_PROVIDER ??= "openai";
  process.env.DEFAULT_TEMPERATURE ??= "0.7";
  process.env.DEFAULT_MAX_TOKENS ??= "8000";
  process.env.DEFAULT_TIMEOUT_MS ??= "120000";
  process.env.MAX_INPUT_CHARS ??= "120000";
  process.env.MAX_OUTPUT_TOKENS ??= "16000";
  process.env.GEMINI_AUTH_MODE ??= "both";
  process.env.ENABLE_JSON_MODE ??= "false";
  process.env.ALLOW_PROVIDER_OVERRIDE ??= "false";
}

async function createStoreFixture() {
  ensureTestEnv();

  const { ConfigStore, buildConfigStorePaths } = await import("../src/store/configStore.js");

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "creative-subagent-store-"));
  const paths = buildConfigStorePaths(tempRoot);
  const store = new ConfigStore(paths);

  await store.initialize();

  return {
    tempRoot,
    paths,
    store,
    async cleanup() {
      await fs.rm(tempRoot, { recursive: true, force: true });
    },
  };
}

test("applyDraftConfig updates active snapshot and clears dirty state", { concurrency: false }, async () => {
  const fixture = await createStoreFixture();

  try {
    const initialSnapshot = fixture.store.getActiveSnapshot();
    const initialStatus = await fixture.store.getAdminCurrentStatus();

    assert.equal(initialStatus.dirty, false);

    const draft = await fixture.store.getDraftConfig();
    await fixture.store.saveRuntime({
      ...draft.runtime,
      logLevel: "debug",
    });

    const dirtyStatus = await fixture.store.getAdminCurrentStatus();
    assert.equal(dirtyStatus.dirty, true);

    const applied = await fixture.store.applyDraftConfig();
    assert.notEqual(applied.configVersion, initialSnapshot.configVersion);

    const afterApply = await fixture.store.getAdminCurrentStatus();
    assert.equal(afterApply.dirty, false);
    assert.equal(afterApply.active.configVersion, applied.configVersion);

    const currentState = JSON.parse(await fs.readFile(fixture.paths.currentFile, "utf8")) as {
      configVersion: string;
    };
    const persistedSnapshot = JSON.parse(
      await fs.readFile(fixture.paths.activeSnapshotFile, "utf8"),
    ) as { configVersion: string; runtime: { logLevel: string } };

    assert.equal(currentState.configVersion, applied.configVersion);
    assert.equal(persistedSnapshot.configVersion, applied.configVersion);
    assert.equal(persistedSnapshot.runtime.logLevel, "debug");
  } finally {
    await fixture.cleanup();
  }
});

test("saveAdminProviders keeps role models and fallback models in provider allowlist", { concurrency: false }, async () => {
  const fixture = await createStoreFixture();

  try {
    const draft = await fixture.store.getDraftConfig();
    const nextGeminiModel = "gemini-2.5-flash-latest";
    const geminiRoleModels = draft.roles
      .filter((role) => role.providerId === "gemini-default")
      .flatMap((role) => (role.fallbackModel ? [role.model, role.fallbackModel] : [role.model]));

    await fixture.store.saveAdminProviders(
      draft.providers.map((provider) => ({
        id: provider.id,
        type: provider.adapter,
        baseUrl: provider.baseUrl,
        model: provider.id === "gemini-default" ? nextGeminiModel : provider.defaultModel,
        apiKey: provider.id === "gemini-default" ? "sk-updated-gemini-key-12345" : "",
        enabled: provider.enabled,
      })),
    );

    const updatedDraft = await fixture.store.getDraftConfig();
    const geminiProvider = updatedDraft.providers.find((provider) => provider.id === "gemini-default");

    assert.ok(geminiProvider);
    assert.equal(geminiProvider.defaultModel, nextGeminiModel);
    assert.ok(geminiProvider.models.includes(nextGeminiModel));

    for (const model of geminiRoleModels) {
      assert.ok(geminiProvider.models.includes(model), `expected preserved model ${model}`);
    }

    const envContent = await fs.readFile(fixture.paths.envFile, "utf8");
    assert.match(envContent, /GEMINI_API_KEY=sk-updated-gemini-key-12345/);
  } finally {
    await fixture.cleanup();
  }
});

test("savePrompt leaves the original file untouched when atomic rename fails", { concurrency: false }, async () => {
  const fixture = await createStoreFixture();
  const promptFile = path.join(fixture.paths.promptsDir, "chapter_writer.md");
  const originalPrompt = await fs.readFile(promptFile, "utf8");
  const originalRename = fs.rename;

  try {
    (fs as typeof fs & { rename: typeof fs.rename }).rename = async (from, to) => {
      if (String(to).endsWith("chapter_writer.md")) {
        throw new Error("rename blocked for test");
      }
      return originalRename(from, to);
    };

    await assert.rejects(
      fixture.store.savePrompt("chapter_writer", "new prompt content"),
      /rename blocked for test/,
    );

    const currentPrompt = await fs.readFile(promptFile, "utf8");
    const promptDirEntries = await fs.readdir(fixture.paths.promptsDir);

    assert.equal(currentPrompt, originalPrompt);
    assert.ok(promptDirEntries.some((entry) => entry.includes(".tmp")));
  } finally {
    (fs as typeof fs & { rename: typeof fs.rename }).rename = originalRename;
    await fixture.cleanup();
  }
});

const state = {
  roles: [],
  providers: [],
  prompts: {},
  currentPromptRole: null,
  currentStatus: null,
  health: null,
  localDirty: {
    providers: false,
    roles: false,
    prompt: false,
  },
  loading: false,
};

const elements = {
  token: document.getElementById("adminToken"),
  globalStatus: document.getElementById("globalStatus"),
  publishMeta: document.getElementById("publishMeta"),
  dashboardMeta: document.getElementById("dashboardMeta"),
  healthJson: document.getElementById("healthJson"),
  providersList: document.getElementById("providersList"),
  rolesList: document.getElementById("rolesList"),
  promptMeta: document.getElementById("promptMeta"),
  promptTabs: document.getElementById("promptTabs"),
  promptEditor: document.getElementById("promptEditor"),
  toast: document.getElementById("toast"),
};

const actionButtonIds = [
  "refreshBtn",
  "addProviderBtn",
  "addRoleBtn",
  "saveProvidersBtn",
  "saveRolesBtn",
  "savePromptBtn",
  "resetPromptBtn",
  "applyBtn",
];

function getToken() {
  return elements.token.value.trim();
}

function saveToken() {
  localStorage.setItem("agent-kernel-admin-token", getToken());
  showToast("Admin Token 已保存");
}

function loadToken() {
  const token = localStorage.getItem("agent-kernel-admin-token") || "";
  elements.token.value = token;
}

function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTime(value) {
  if (!value) return "未知";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function getRoleDisplayName(roleId) {
  const role = state.roles.find((item) => item.role === roleId);
  return role?.displayName || roleId;
}

function hasLocalDirtyChanges() {
  return Object.values(state.localDirty).some(Boolean);
}

function setGlobalStatus(message = "", type = "info") {
  if (!message) {
    elements.globalStatus.textContent = "";
    elements.globalStatus.className = "status-banner status-info hidden";
    return;
  }
  elements.globalStatus.textContent = message;
  elements.globalStatus.className = `status-banner ${type === "error" ? "status-error" : "status-info"}`;
}

function setActionButtonsDisabled(disabled) {
  for (const id of actionButtonIds) {
    const button = document.getElementById(id);
    if (button) button.disabled = disabled;
  }
  elements.promptEditor.disabled = disabled;
}

function showToast(message, isError = false) {
  elements.toast.textContent = message;
  elements.toast.className = `toast${isError ? " error" : ""}`;
  setTimeout(() => {
    elements.toast.className = "toast hidden";
  }, 2800);
}

function renderEmptyBlock(title, message) {
  return `
    <div class="empty-state">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function renderLockedState(message) {
  setGlobalStatus(message, "error");
  setActionButtonsDisabled(true);
  elements.publishMeta.innerHTML = renderEmptyBlock("认证未完成", message);
  elements.dashboardMeta.innerHTML = renderEmptyBlock("Overview 未加载", message);
  elements.healthJson.textContent = message;
  elements.providersList.innerHTML = renderEmptyBlock("Providers 未加载", message);
  elements.rolesList.innerHTML = renderEmptyBlock("Roles 未加载", message);
  elements.promptMeta.textContent = message;
  elements.promptTabs.innerHTML = renderEmptyBlock("Prompts 未加载", message);
  elements.promptEditor.value = "";
}

function renderLoadFailure(message) {
  setGlobalStatus(message, "error");
  setActionButtonsDisabled(true);
  elements.publishMeta.innerHTML = renderEmptyBlock("加载失败", message);
  elements.dashboardMeta.innerHTML = renderEmptyBlock("Overview 加载失败", message);
  elements.healthJson.textContent = message;
  elements.providersList.innerHTML = renderEmptyBlock("Providers 加载失败", message);
  elements.rolesList.innerHTML = renderEmptyBlock("Roles 加载失败", message);
  elements.promptMeta.textContent = message;
  elements.promptTabs.innerHTML = renderEmptyBlock("Prompts 加载失败", message);
  elements.promptEditor.value = "";
}

async function api(path, options = {}) {
  const token = getToken();
  if (!token) {
    throw new Error("请先输入 Admin Token");
  }
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };
  const response = await fetch(`/api${path}`, { ...options, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json();
}

function renderPublishMeta() {
  if (!state.currentStatus) {
    elements.publishMeta.innerHTML = renderEmptyBlock("状态未知", "请先输入 Token 并刷新。");
    return;
  }

  const authBadge = `<span class="badge success">认证通过</span>`;
  const localBadge = hasLocalDirtyChanges()
    ? `<span class="badge warn">本地有未保存表单变更</span>`
    : `<span class="badge success">本地表单已保存</span>`;
  const draftBadge = state.currentStatus.dirty
    ? `<span class="badge warn">草稿未发布</span>`
    : `<span class="badge success">草稿与运行态一致</span>`;
  const versionBadge = `<span class="badge">运行版本 ${escapeHtml(state.currentStatus.active.configVersion)}</span>`;
  const timeBadge = `<span class="badge">生效时间 ${escapeHtml(formatTime(state.currentStatus.active.activatedAt))}</span>`;

  elements.publishMeta.innerHTML = `${authBadge}${localBadge}${draftBadge}${versionBadge}${timeBadge}`;
}

function renderDashboard() {
  if (!state.currentStatus || !state.health) {
    elements.dashboardMeta.innerHTML = renderEmptyBlock("Overview 未加载", "请先完成认证并刷新。");
    elements.healthJson.textContent = "";
    return;
  }

  const cards = [
    ["运行版本", state.currentStatus.active.configVersion],
    ["生效时间", formatTime(state.currentStatus.active.activatedAt)],
    ["草稿 Providers", String(state.currentStatus.draftSummary.providers)],
    ["草稿 Roles", String(state.currentStatus.draftSummary.roles)],
    ["草稿 Prompts", String(state.currentStatus.draftSummary.prompts)],
    ["发布状态", state.currentStatus.dirty ? "存在未发布草稿" : "当前即运行态"],
  ];

  elements.dashboardMeta.innerHTML = cards
    .map(
      ([label, value]) => `
        <div class="meta-item">
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(value)}</span>
        </div>
      `,
    )
    .join("");

  elements.healthJson.textContent = JSON.stringify(state.health, null, 2);
}

function renderProviders() {
  if (!state.providers.length) {
    elements.providersList.innerHTML = renderEmptyBlock("暂无 Provider", "当前草稿配置里还没有 Provider。");
    return;
  }

  elements.providersList.innerHTML = state.providers
    .map((provider, index) => {
      const usageBadges = provider.usedByRoles.length
        ? provider.usedByRoles.map((role) => `<span class="badge">${escapeHtml(role)}</span>`).join("")
        : `<span class="badge success">未被角色使用</span>`;
      const deleteButton = provider.deletable
        ? `<button data-provider-delete="${escapeHtml(provider.id)}">删除 Provider</button>`
        : `<button data-provider-delete="${escapeHtml(provider.id)}" disabled>仍被角色引用</button>`;

      return `
        <div class="panel provider-card" data-provider-index="${index}">
          <div class="provider-head">
            <div class="provider-title">
              <h3>${escapeHtml(provider.id)}</h3>
              <div class="role-summary">${usageBadges}</div>
            </div>
            <div class="button-row">
              ${deleteButton}
            </div>
          </div>
          <div class="form-grid">
            <label>Provider ID
              <input data-field="id" name="providerId-${index}" value="${escapeHtml(provider.id)}" readonly autocomplete="off">
            </label>
            <label>类型
              <select data-field="type" name="providerType-${index}" autocomplete="off">
                <option value="openai-compatible" ${provider.type === "openai-compatible" ? "selected" : ""}>openai-compatible</option>
                <option value="gemini-native" ${provider.type === "gemini-native" ? "selected" : ""}>gemini-native</option>
              </select>
            </label>
            <label>启用状态
              <select data-field="enabled" name="providerEnabled-${index}" autocomplete="off">
                <option value="true" ${provider.enabled ? "selected" : ""}>true</option>
                <option value="false" ${provider.enabled ? "" : "selected"}>false</option>
              </select>
            </label>
            <label>Base URL
              <input data-field="baseUrl" name="providerBaseUrl-${index}" type="url" value="${escapeHtml(provider.baseUrl)}" placeholder="https://api.example.com…" autocomplete="off">
            </label>
            <label>主模型名
              <input data-field="model" name="providerModel-${index}" value="${escapeHtml(provider.model)}" placeholder="例如 gpt-5.4-mini…" autocomplete="off">
            </label>
            <label>API Key
              <input
                data-field="apiKey"
                name="providerApiKey-${index}"
                type="password"
                value=""
                autocomplete="off"
                placeholder="${provider.apiKeyConfigured ? "已配置，留空表示不修改…" : "首次保存必须填写…"}"
              >
            </label>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderRoles() {
  if (!state.roles.length) {
    elements.rolesList.innerHTML = renderEmptyBlock("暂无 Roles", "当前草稿配置里还没有角色，或角色尚未加载。");
    return;
  }

  elements.rolesList.innerHTML = state.roles
    .map((role, index) => {
      const summaryBadges = [
        `<span class="badge">${escapeHtml(role.providerId)}</span>`,
        `<span class="badge">${escapeHtml(role.model)}</span>`,
        role.fallbackModel ? `<span class="badge warn">fallback ${escapeHtml(role.fallbackModel)}</span>` : `<span class="badge">无 fallback</span>`,
        `<span class="badge">${role.requiredInputFields.length} 个必填字段</span>`,
        role.isSystem ? `<span class="badge">系统角色</span>` : `<span class="badge success">自定义角色</span>`,
        role.enabled ? `<span class="badge success">已启用</span>` : `<span class="badge error">已停用</span>`,
      ].join("");
      const deleteButton = role.isSystem
        ? `<button data-role-delete="${escapeHtml(role.role)}" disabled>系统角色不可删</button>`
        : `<button data-role-delete="${escapeHtml(role.role)}">删除 Role</button>`;

      return `
        <details class="panel role-card" data-role-index="${index}" ${index === 0 ? "open" : ""}>
          <summary class="role-head">
            <div class="role-title">
              <h3>${escapeHtml(role.displayName || role.role)}</h3>
              <div>Role ID: ${escapeHtml(role.role)}</div>
              <div>${escapeHtml(role.description || "未填写描述")}</div>
              <div class="role-summary">${summaryBadges}</div>
            </div>
            <div class="button-row">
              ${deleteButton}
            </div>
          </summary>
          <div class="role-editor">
            <div class="form-grid">
              <label>显示名称
                <input data-field="displayName" name="roleDisplayName-${index}" value="${escapeHtml(role.displayName || "")}" placeholder="例如：章节写手…" autocomplete="off">
              </label>
              <label>Role ID
                <input data-field="role" name="roleName-${index}" value="${escapeHtml(role.role)}" disabled autocomplete="off">
              </label>
              <label>Description
                <input data-field="description" name="roleDescription-${index}" value="${escapeHtml(role.description || "")}" placeholder="例如：负责章节写作…" autocomplete="off">
              </label>
              <label>Provider ID
                <input data-field="providerId" name="roleProvider-${index}" value="${escapeHtml(role.providerId || "")}" placeholder="例如 gemini-default…" autocomplete="off">
              </label>
              <label>Main Model
                <input data-field="model" name="roleModel-${index}" value="${escapeHtml(role.model || "")}" placeholder="例如 gemini-3.5-flash…" autocomplete="off">
              </label>
              <label>Fallback Model
                <input data-field="fallbackModel" name="roleFallback-${index}" value="${escapeHtml(role.fallbackModel || "")}" placeholder="没有则留空…" autocomplete="off">
              </label>
              <label>Output Type
                <select data-field="outputType" name="roleOutputType-${index}" autocomplete="off">
                  <option value="content" ${role.outputType === "content" ? "selected" : ""}>content</option>
                  <option value="report" ${role.outputType === "report" ? "selected" : ""}>report</option>
                </select>
              </label>
              <label>Enabled
                <select data-field="enabled" name="roleEnabled-${index}" autocomplete="off">
                  <option value="true" ${role.enabled ? "selected" : ""}>true</option>
                  <option value="false" ${role.enabled ? "" : "selected"}>false</option>
                </select>
              </label>
              <label>Required Fields
                <textarea data-field="requiredInputFields" name="roleRequiredFields-${index}" rows="5" autocomplete="off" placeholder="每行一个字段…">${escapeHtml((role.requiredInputFields || []).join("\n"))}</textarea>
              </label>
            </div>
          </div>
        </details>
      `;
    })
    .join("");
}

function renderPromptMeta() {
  const promptValue = state.prompts[state.currentPromptRole];
  if (typeof promptValue !== "string") {
    elements.promptMeta.textContent = "请选择角色并先完成配置加载。";
    return;
  }

  const dirtyText = state.localDirty.prompt ? "当前 Prompt 有未保存修改。" : "当前 Prompt 已与草稿同步。";
  elements.promptMeta.textContent = `当前角色：${getRoleDisplayName(state.currentPromptRole)}（${state.currentPromptRole}）。${dirtyText}`;
}

function renderPromptTabs() {
  const availableRoles = state.roles
    .map((role) => role.role)
    .filter((roleId) => typeof state.prompts[roleId] === "string");
  if (!availableRoles.length) {
    elements.promptTabs.innerHTML = renderEmptyBlock("暂无 Prompt", "请先填写 Admin Token 并刷新，再加载 Prompt。");
    elements.promptEditor.value = "";
    renderPromptMeta();
    return;
  }

  if (!availableRoles.includes(state.currentPromptRole)) {
    state.currentPromptRole = availableRoles[0];
  }

  elements.promptTabs.className = "prompt-tabs";
  elements.promptTabs.innerHTML = availableRoles
    .map(
      (role) =>
        `<button data-role-tab="${role}" class="${state.currentPromptRole === role ? "primary" : ""}">${escapeHtml(getRoleDisplayName(role))}</button>`,
    )
    .join("");
  elements.promptEditor.value = state.prompts[state.currentPromptRole] || "";
  renderPromptMeta();
}

function collectProviders() {
  const panels = [...elements.providersList.querySelectorAll("[data-provider-index]")];
  return panels.map((panel) => ({
    id: panel.querySelector('[data-field="id"]').value.trim(),
    type: panel.querySelector('[data-field="type"]').value,
    enabled: panel.querySelector('[data-field="enabled"]').value === "true",
    baseUrl: panel.querySelector('[data-field="baseUrl"]').value.trim(),
    model: panel.querySelector('[data-field="model"]').value.trim(),
    apiKey: panel.querySelector('[data-field="apiKey"]').value.trim(),
  }));
}

function collectRoles() {
  const panels = [...elements.rolesList.querySelectorAll("[data-role-index]")];
  return panels.map((panel) => ({
    role: panel.querySelector('[data-field="role"]').value.trim(),
    displayName: panel.querySelector('[data-field="displayName"]').value.trim(),
    description: panel.querySelector('[data-field="description"]').value.trim(),
    providerId: panel.querySelector('[data-field="providerId"]').value.trim(),
    model: panel.querySelector('[data-field="model"]').value.trim(),
    fallbackModel: panel.querySelector('[data-field="fallbackModel"]').value.trim() || null,
    outputType: panel.querySelector('[data-field="outputType"]').value,
    enabled: panel.querySelector('[data-field="enabled"]').value === "true",
    requiredInputFields: panel
      .querySelector('[data-field="requiredInputFields"]')
      .value.split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
    isSystem: state.roles[Number(panel.getAttribute("data-role-index"))]?.isSystem ?? false,
  }));
}

async function loadPrompts() {
  const prompts = {};
  for (const role of state.roles) {
    const payload = await api(`/config/prompts/${encodeURIComponent(role.role)}`);
    prompts[role.role] = payload.prompt;
  }
  state.prompts = prompts;
  state.localDirty.prompt = false;
  renderPromptTabs();
}

async function refreshAll() {
  const token = getToken();
  if (!token) {
    renderLockedState("未填写 Admin Token，无法加载管理数据。请先输入 Token，再点击“保存 Token”。");
    return;
  }

  state.loading = true;
  setActionButtonsDisabled(true);
  setGlobalStatus("正在加载当前配置…", "info");

  const [health, current, roles, providers] = await Promise.all([
    api("/health"),
    api("/config/current"),
    api("/config/roles"),
    api("/config/providers"),
  ]);

  state.health = health;
  state.currentStatus = current;
  state.roles = roles.roles;
  state.providers = providers.providers;
  state.localDirty.providers = false;
  state.localDirty.roles = false;

  renderPublishMeta();
  renderDashboard();
  renderProviders();
  renderRoles();
  await loadPrompts();

  state.loading = false;
  setActionButtonsDisabled(false);

  if (hasLocalDirtyChanges()) {
    setGlobalStatus("页面存在未保存表单变更。先保存草稿，再决定是否发布。", "info");
  } else if (state.currentStatus.dirty) {
    setGlobalStatus("草稿已保存，但尚未发布到运行态。", "info");
  } else {
    setGlobalStatus("当前草稿与运行态一致，可以继续编辑。", "info");
  }
  renderPublishMeta();
}

async function saveProviders() {
  state.providers = collectProviders();
  await api("/config/providers", {
    method: "PUT",
    body: JSON.stringify(state.providers),
  });
  state.localDirty.providers = false;
  showToast("Providers 草稿已保存，尚未发布。");
  await refreshAll();
}

async function saveRoles() {
  const roles = collectRoles();
  for (const role of roles) {
    await api(`/config/roles/${encodeURIComponent(role.role)}`, {
      method: "PUT",
      body: JSON.stringify(role),
    });
  }
  state.localDirty.roles = false;
  showToast("Roles 草稿已保存，尚未发布。");
  await refreshAll();
}

async function savePrompt() {
  const role = state.currentPromptRole;
  state.prompts[role] = elements.promptEditor.value;
  await api(`/config/prompts/${encodeURIComponent(role)}`, {
    method: "PUT",
    body: JSON.stringify({ prompt: state.prompts[role] }),
  });
  state.localDirty.prompt = false;
  renderPromptMeta();
  showToast(`${getRoleDisplayName(role)} Prompt 已保存，尚未发布。`);
  await refreshAll();
}

async function resetPrompt() {
  const role = state.currentPromptRole;
  const payload = await api(`/config/prompts/${encodeURIComponent(role)}`);
  state.prompts[role] = payload.prompt;
  elements.promptEditor.value = payload.prompt;
  state.localDirty.prompt = false;
  renderPromptMeta();
  showToast("已恢复当前草稿中的 Prompt。");
}

async function applyConfig() {
  const result = await api("/config/apply", { method: "POST", body: JSON.stringify({}) });
  showToast(`发布成功：${result.configVersion}`);
  await refreshAll();
}

function addProvider() {
  state.providers.push({
    id: `provider-${Date.now()}`,
    type: "openai-compatible",
    enabled: true,
    baseUrl: "https://api.example.com",
    model: "example-model",
    apiKeyConfigured: false,
    usedByRoles: [],
    deletable: true,
  });
  state.localDirty.providers = true;
  renderProviders();
  renderPublishMeta();
  setGlobalStatus("新增了一个 Provider 草稿，请先保存。", "info");
}

async function addRole() {
  const displayName = window.prompt("请输入角色显示名（支持中文）");
  if (displayName === null) return;
  const normalized = displayName.trim();
  if (!normalized) {
    showToast("角色显示名不能为空。", true);
    return;
  }

  const provider = state.providers.find((item) => item.enabled) || state.providers[0];
  if (!provider) {
    showToast("请先至少配置一个 Provider，再新增角色。", true);
    return;
  }

  await api("/config/roles", {
    method: "POST",
    body: JSON.stringify({
      displayName: normalized,
      providerId: provider.id,
      model: provider.model,
      outputType: "content",
    }),
  });

  showToast(`已新增角色“${normalized}”，请继续完善描述与 Prompt。`);
  await refreshAll();
}

async function deleteProvider(providerId) {
  const provider = state.providers.find((item) => item.id === providerId);
  if (!provider) return;

  if (!provider.deletable) {
    showToast(`Provider ${providerId} 仍被角色引用，不能删除。`, true);
    return;
  }

  const confirmed = window.confirm(`确认删除 Provider "${providerId}" 吗？此操作会删除草稿中的该 Provider。`);
  if (!confirmed) return;

  await api(`/config/providers/${encodeURIComponent(providerId)}`, { method: "DELETE" });
  state.localDirty.providers = false;
  showToast(`Provider ${providerId} 已删除，尚未发布。`);
  await refreshAll();
}

async function deleteRole(roleId) {
  const role = state.roles.find((item) => item.role === roleId);
  if (!role) return;

  if (role.isSystem) {
    showToast(`系统角色 ${role.displayName || roleId} 不允许删除。`, true);
    return;
  }

  const confirmed = window.confirm(`确认删除角色“${role.displayName || roleId}”吗？这会同时删除它的 Prompt 草稿。`);
  if (!confirmed) return;

  await api(`/config/roles/${encodeURIComponent(roleId)}`, { method: "DELETE" });
  state.localDirty.roles = false;
  state.localDirty.prompt = false;
  showToast(`角色 ${role.displayName || roleId} 已删除，尚未发布。`);
  await refreshAll();
}

function attachDirtyGuards() {
  window.addEventListener("beforeunload", (event) => {
    if (!hasLocalDirtyChanges()) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

document.getElementById("saveTokenBtn").addEventListener("click", () => {
  saveToken();
  refreshAll().catch((error) => {
    renderLoadFailure(`加载失败：${error.message}`);
    showToast(error.message, true);
  });
});

document.getElementById("refreshBtn").addEventListener("click", () => {
  refreshAll().catch((error) => {
    renderLoadFailure(`加载失败：${error.message}`);
    showToast(error.message, true);
  });
});

document.getElementById("saveProvidersBtn").addEventListener("click", () => {
  saveProviders().catch((error) => showToast(error.message, true));
});

document.getElementById("saveRolesBtn").addEventListener("click", () => {
  saveRoles().catch((error) => showToast(error.message, true));
});

document.getElementById("addRoleBtn").addEventListener("click", () => {
  addRole().catch((error) => showToast(error.message, true));
});

document.getElementById("savePromptBtn").addEventListener("click", () => {
  savePrompt().catch((error) => showToast(error.message, true));
});

document.getElementById("resetPromptBtn").addEventListener("click", () => {
  resetPrompt().catch((error) => showToast(error.message, true));
});

document.getElementById("applyBtn").addEventListener("click", () => {
  applyConfig().catch((error) => showToast(error.message, true));
});

document.getElementById("addProviderBtn").addEventListener("click", addProvider);

elements.providersList.addEventListener("input", () => {
  state.localDirty.providers = true;
  renderPublishMeta();
  setGlobalStatus("Provider 表单有未保存变更。请先保存草稿。", "info");
});

elements.providersList.addEventListener("click", (event) => {
  const target = event.target.closest("[data-provider-delete]");
  if (!target) return;
  deleteProvider(target.getAttribute("data-provider-delete")).catch((error) => showToast(error.message, true));
});

elements.rolesList.addEventListener("input", () => {
  state.localDirty.roles = true;
  renderPublishMeta();
  setGlobalStatus("Role 表单有未保存变更。请先保存草稿。", "info");
});

elements.rolesList.addEventListener("click", (event) => {
  const target = event.target.closest("[data-role-delete]");
  if (!target) return;
  deleteRole(target.getAttribute("data-role-delete")).catch((error) => showToast(error.message, true));
});

elements.promptTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-role-tab]");
  if (!button) return;
  state.currentPromptRole = button.getAttribute("data-role-tab");
  renderPromptTabs();
});

elements.promptEditor.addEventListener("input", () => {
  state.localDirty.prompt = true;
  renderPromptMeta();
  renderPublishMeta();
  setGlobalStatus("Prompt 有未保存修改。请先保存草稿。", "info");
});

elements.token.addEventListener("input", () => {
  if (!getToken()) {
    renderLockedState("未填写 Admin Token，无法加载管理数据。请先输入 Token，再点击“保存 Token”。");
  } else {
    setActionButtonsDisabled(false);
    setGlobalStatus("Token 已填写。点击“保存 Token”或“刷新状态”开始加载。", "info");
  }
});

attachDirtyGuards();
loadToken();
refreshAll().catch((error) => {
  renderLoadFailure(`加载失败：${error.message}`);
  showToast(error.message, true);
});

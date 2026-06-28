<aside>
📌

**用途**：本文档用于指导 Hermes / Cloud Code 等开发 agent，开发并部署一个公网可访问的 **Subagent Runner MCP Server**。这个 MCP Server 通过 OpenAI-compatible / Gemini 原生 API 调用外部大模型，供 Notion AI / 二大爷运行通用写手、结构审计、风格审计、修稿等子 agent。

</aside>

## 1. 项目定位

这个 MCP Server 不是视频渲染工具，也不是 Notion 页面操作工具。

它的定位是：

> **通用子 agent 运行器：接收主调度传来的项目上下文与任务要求，调用外部大模型 API，运行指定角色的子 agent，并返回正文或审计报告。**
> 

整体架构：

```
Notion AI / 二大爷 / 主调度
  ↓ MCP 调用
Subagent Runner MCP Server
  ↓
Provider Router
  ├─ OpenAI-compatible API（GPT 等）
  └─ Gemini Native API（Gemini 等）
  ↓
通用子 agent 输出
  ↓
返回给 Notion AI
  ↓
Notion AI 判断并写入 Notion
```

## 2. 核心边界

### MCP Server 负责

- 接收 `run_subagent` 调用。
- 校验输入上下文。
- 根据 `role` 选择子 agent prompt。
- 根据 provider / model 配置调用外部大模型 API。
- 返回结构化结果。
- 记录必要日志并脱敏。

### MCP Server 不负责

- 不直接修改 Notion 页面。
- 不持有 Notion token。
- 不执行 shell。
- 不读写用户主机任意文件。
- 不渲染视频。
- 不把某一个项目的设定写死进全局 prompt。
- 不把 API Key 返回给调用方。

## 3. 推荐项目名

```
creative-subagent-runner-mcp
```

或：

```
openai-gemini-subagent-mcp
```

## 4. 支持的子 agent 角色

第一版至少支持：

```
chapter_writer
structure_auditor
style_auditor
reviser
```

### `chapter_writer`

通用章节写手。

职责：

- 根据项目上下文写指定章节正文。
- 严格遵守 L1 / L0 / L2 / L3。
- 承接上一章结尾。
- 完成当前章 beats。
- 保留下一章钩子。
- 遵守项目风格规则。
- 不改大纲。
- 不自审。

### `structure_auditor`

通用结构审计员。

职责：

- 审计 L1 / L0 / L2 / L3 一致性。
- 审计章间承接。
- 审计章末钩子。
- 审计伏笔与世界观一致性。
- 审计是否凭空新增设定。
- 审计角色言行是否跳变。

### `style_auditor`

通用风格审计员。

职责：

- 根据 `style_rules` 审计文风。
- 审计叙事人称。
- 审计是否说教。
- 审计是否触发反模式。
- 审计目标读者适配。
- 审计表达边界。
- 审计风格技巧是否压过作品内核。

### `reviser`

通用修稿 agent。

职责：

- 根据已有正文与审计报告修订正文。
- P0 必须修。
- P1 按主调度要求修。
- 不修改 L1 / L0 / L2 / L3。
- 不新增未经授权的核心设定。
- 输出修订后的完整正文和修订说明。

## 5. MCP Tools 设计

第一版建议只做三个工具：

```
health_check
list_subagent_roles
run_subagent
```

### 5.1 `health_check`

用途：检查 MCP Server 与 provider 配置状态。

输入：

```json
{}
```

输出示例：

```json
{
  "status": "ok",
  "version": "0.1.0",
  "providers": {
    "openai": {
      "enabled": true,
      "base_url": "https://api.jxincm.cn/v1",
      "default_model": "gpt-5.5"
    },
    "gemini": {
      "enabled": true,
      "base_url": "https://api.jxincm.cn",
      "default_model": "gemini-3.1-pro-preview"
    }
  },
  "roles": [
    "chapter_writer",
    "structure_auditor",
    "style_auditor",
    "reviser"
  ]
}
```

注意：

- 不允许返回 API Key。
- 不允许返回 Bearer Token。
- 如果 provider 未配置 key，应显示 `enabled: false` 或 `status: "not_configured"`。

### 5.2 `list_subagent_roles`

用途：列出支持的子 agent 角色。

输入：

```json
{}
```

输出：

```json
{
  "roles": [
    {
      "role": "chapter_writer",
      "description": "通用章节写手，根据项目上下文和章节 beats 写正文。"
    },
    {
      "role": "structure_auditor",
      "description": "通用结构审计员，审计 L1/L0/L2/L3 一致性、章间承接和伏笔。"
    },
    {
      "role": "style_auditor",
      "description": "通用风格审计员，审计文风、反模式、项目禁区和目标读者适配。"
    },
    {
      "role": "reviser",
      "description": "通用修稿 agent，根据审计报告修正文稿。"
    }
  ]
}
```

### 5.3 `run_subagent`

用途：运行指定角色的通用子 agent。

输入结构：

```json
{
  "role": "chapter_writer",
  "task_id": "space-rideshare-s1-ch03-v1",
  "provider": "openai",
  "model": "gpt-5.5",
  "project_context": {
    "project_name": "",
    "genre": "",
    "target_reader": "",
    "l1_core": "",
    "l0_world": "",
    "series_l2": "",
    "current_season_l2": "",
    "project_rules": [],
    "forbidden": []
  },
  "chapter_context": {
    "season": 1,
    "chapter": 3,
    "chapter_title": "",
    "chapter_beats": "",
    "previous_chapter_tail": "",
    "next_chapter_hook": "",
    "existing_draft": "",
    "previous_audit": ""
  },
  "style_rules": {
    "tone": "",
    "narration": "",
    "must_have": [],
    "anti_patterns": []
  },
  "output_contract": {
    "format": "markdown",
    "word_count": "",
    "language": "zh-CN",
    "return_json": false
  },
  "model_options": {
    "temperature": 0.7,
    "max_tokens": 8000
  }
}
```

规则：

- `provider` 可选：`openai` 或 `gemini`。
- `model` 可选。
- **生产默认不允许随意覆盖角色路由**。正式创作流程必须按固定规范执行：
    - `chapter_writer` → `openai` → `gpt-5.5`
    - `structure_auditor` → `gemini` → `gemini-3.1-pro-preview`
    - `style_auditor` → `gemini` → `gemini-3.1-pro-preview`
    - `reviser` → `openai` → `gpt-5.5`
- 如果调用方显式传入的 `provider` / `model` 与角色默认规范冲突，服务端必须返回 `provider_role_mismatch`，不得继续调用模型。
- 只有在 `.env` 中显式开启 `ALLOW_PROVIDER_OVERRIDE=true` 时，才允许测试环境覆盖角色路由；生产环境保持 `false`。
- 如果调用方没有指定 `provider` / `model`，则由 `.env` 中的角色路由决定。
- 如果缺少关键上下文，服务端应直接返回 `missing_context`，不要把不完整任务交给模型自由发挥。
- `run_subagent` 返回值必须包含实际使用的 `provider`、`model`、`role`、`task_id`，便于主调度和日志追踪。

## 6. juxinapi 配置方式

### 6.1 GPT / OpenAI-compatible

从 juxinapi 文档确认，OpenAI-compatible base URL 为：

```bash
OPENAI_BASE_URL=https://api.jxincm.cn/v1
```

Chat Completions endpoint 为：

```
https://api.jxincm.cn/v1/chat/completions
```

如果使用 OpenAI SDK，`baseURL` 必须填：

```
https://api.jxincm.cn/v1
```

不要填完整的 `/chat/completions`，否则 SDK 会重复拼接。

请求格式：

```
POST https://api.jxincm.cn/v1/chat/completions
Authorization: Bearer ${OPENAI_API_KEY}
Content-Type: application/json
```

Body 示例：

```json
{
  "model": "gpt-5.5",
  "messages": [
    {
      "role": "system",
      "content": "子 agent system prompt"
    },
    {
      "role": "user",
      "content": "任务上下文 JSON"
    }
  ],
  "temperature": 0.7,
  "max_tokens": 8000
}
```

响应解析：

```tsx
const content = response.choices?.[0]?.message?.content
```

### 6.2 Gemini Native

从 juxinapi 文档确认，Gemini CLI 中转配置为：

```bash
GEMINI_API_KEY=sk-xxxxx
GOOGLE_GEMINI_BASE_URL=https://api.jxincm.cn
```

本项目统一使用：

```bash
GEMINI_BASE_URL=https://api.jxincm.cn
GEMINI_API_KEY=sk-xxxxx
```

Gemini 原生路径格式：

```
/v1beta/models/{model}:generateContent
```

请求 URL 示例：

```
https://api.jxincm.cn/v1beta/models/gemini-3.1-pro-preview:generateContent
```

建议实现两种鉴权模式：

#### Bearer 模式

```
POST https://api.jxincm.cn/v1beta/models/${model}:generateContent
Authorization: Bearer ${GEMINI_API_KEY}
Content-Type: application/json
```

#### Query key 模式

```
POST https://api.jxincm.cn/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}
Content-Type: application/json
```

Gemini Body：

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "系统提示 + 任务上下文"
        }
      ]
    }
  ],
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 8000
  }
}
```

响应解析：

```tsx
const content =
  response.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
```

## 7. 推荐环境变量模板

`.env.example`：

```bash
NODE_ENV=production
PORT=3000

# MCP Server 自己的鉴权，不是模型 key
MCP_AUTH_TOKEN=replace-with-long-random-token

# ===== juxinapi / GPT / OpenAI-compatible =====
OPENAI_BASE_URL=https://api.jxincm.cn/v1

# GPT 使用独立 API Key；不要和 Gemini Key 混用
OPENAI_API_KEY=sk-your-gpt-key

# GPT 模型
DEFAULT_OPENAI_MODEL=gpt-5.5
WRITER_OPENAI_MODEL=gpt-5.5
STRUCTURE_AUDITOR_OPENAI_MODEL=gpt-5.5
STYLE_AUDITOR_OPENAI_MODEL=gpt-5.5
REVISER_OPENAI_MODEL=gpt-5.5

# ===== juxinapi / Gemini native =====
GEMINI_BASE_URL=https://api.jxincm.cn

# Gemini 使用独立 API Key；不要和 GPT Key 混用
GEMINI_API_KEY=sk-your-gemini-key

# Gemini 模型
DEFAULT_GEMINI_MODEL=gemini-3.1-pro-preview
WRITER_GEMINI_MODEL=gemini-3.1-pro-preview
STRUCTURE_AUDITOR_GEMINI_MODEL=gemini-3.1-pro-preview
STYLE_AUDITOR_GEMINI_MODEL=gemini-3.1-pro-preview
REVISER_GEMINI_MODEL=gemini-3.1-pro-preview

# 默认路由：openai | gemini
DEFAULT_PROVIDER=openai

# 按角色路由：openai | gemini
WRITER_PROVIDER=openai
STRUCTURE_AUDITOR_PROVIDER=gemini
STYLE_AUDITOR_PROVIDER=gemini
REVISER_PROVIDER=openai

# Generation defaults
DEFAULT_TEMPERATURE=0.7
DEFAULT_MAX_TOKENS=8000
DEFAULT_TIMEOUT_MS=120000

# Safety limits
MAX_INPUT_CHARS=120000
MAX_OUTPUT_TOKENS=16000

# Gemini auth mode: bearer | key_query | both
GEMINI_AUTH_MODE=both

# JSON mode compatibility
ENABLE_JSON_MODE=false

# Provider override policy
# 生产环境必须保持 false，防止写手误走 Gemini、审计误走 GPT
ALLOW_PROVIDER_OVERRIDE=false
```

<aside>
🔐

GPT 与 Gemini 使用**不同的 API Key**。开发和部署时必须分别配置 `OPENAI_API_KEY` 与 `GEMINI_API_KEY`，不要在日志、README、Notion 页面或聊天里暴露真实 Key。

</aside>

## 8. 当前默认模型路由建议

当前已确认两个模型：

```
GPT / OpenAI-compatible：gpt-5.5
Gemini Native：gemini-3.1-pro-preview
```

并且两个模型使用**不同的 API Key**：

```
OPENAI_API_KEY：用于 gpt-5.5
GEMINI_API_KEY：用于 gemini-3.1-pro-preview
```

推荐职责分工：

```
写手：gpt-5.5
结构审计：gemini-3.1-pro-preview
风格审计：gemini-3.1-pro-preview
修稿：gpt-5.5
```

原因：

- GPT 更适合中文叙事、对白、正文风格化和修稿。
- Gemini 长上下文能力强，适合读取大量项目设定并做结构 / 风格审计。
- 后续如果实测 Gemini 写作更好，可只改 `.env`，不改代码。

默认 provider：

```bash
WRITER_PROVIDER=openai
STRUCTURE_AUDITOR_PROVIDER=gemini
STYLE_AUDITOR_PROVIDER=gemini
REVISER_PROVIDER=openai
```

## 9. 角色 Prompt 草案

### 9.1 `chapter_writer`

```
你是通用章节写手 agent。

你不绑定任何具体项目。所有项目设定、世界观、人物、风格、禁区，均来自本次输入。

你的职责：
- 根据 project_context 和 chapter_context 写指定章节正文。
- 严格遵守 L1/L0/L2/L3。
- 承接上一章结尾。
- 完成当前章 beats。
- 保留下一章钩子。
- 遵守 style_rules。
- 不修改大纲。
- 不新增未经授权的核心设定。
- 不自审。
- 不宣布作品通过审计。

如果缺少关键上下文，返回 missing_context，不得自行补设定。
```

### 9.2 `structure_auditor`

```
你是通用结构审计员 agent。

你只读，不写正文，不修稿。

你的职责：
- 审计正文是否符合 L1/L0/L2/L3。
- 检查章间承接。
- 检查章末钩子。
- 检查伏笔与世界观一致性。
- 检查是否凭空新增设定。
- 检查角色言行是否跳变。

输出必须包含：
- P0 必须修
- P1 建议修
- 结构评分
- 是否通过
- 一句话结论

不要因为文字好看就放过结构问题。
```

### 9.3 `style_auditor`

```
你是通用风格审计员 agent。

你只读，不写正文，不修稿。

你的职责：
- 根据 style_rules 审计风格。
- 检查叙事人称。
- 检查是否说教。
- 检查是否触发 anti_patterns。
- 检查目标读者适配。
- 检查表达边界。
- 检查风格是否压过作品内核。

你没有固定审美。项目要求什么风格，你就按什么风格审计。
```

### 9.4 `reviser`

```
你是通用修稿 agent。

你的职责：
- 根据 existing_draft 和 audit_report 修订正文。
- P0 必须修。
- P1 按任务要求修。
- 不修改 L1/L0/L2/L3。
- 不新增未经授权的核心设定。
- 不把修稿变成重写大纲。
- 输出修订后的完整正文。
- 附 revision_notes。
```

## 10. 输入校验规则

所有 role 必须有：

```
role
task_id
project_context
output_contract
```

### 写手必填

```
project_context.l1_core
project_context.l0_world
project_context.series_l2
project_context.current_season_l2
chapter_context.chapter_title
chapter_context.chapter_beats
style_rules
```

### 结构审计必填

```
existing_draft 或 chapter_content
project_context.l1_core
project_context.l0_world
project_context.series_l2
project_context.current_season_l2
chapter_context.chapter_beats
```

### 风格审计必填

```
existing_draft 或 chapter_content
style_rules
```

### 修稿必填

```
existing_draft
previous_audit 或 audit_report
```

缺失时返回：

```json
{
  "status": "missing_context",
  "missing": [
    "project_context.l1_core",
    "chapter_context.chapter_beats"
  ],
  "message": "缺少关键上下文，不能运行子 agent。"
}
```

## 11. Provider Router 规则

`modelRouter.ts` 应实现：

```
1. 先根据 role 解析默认 provider：
   - chapter_writer → WRITER_PROVIDER → 默认 openai
   - structure_auditor → STRUCTURE_AUDITOR_PROVIDER → 默认 gemini
   - style_auditor → STYLE_AUDITOR_PROVIDER → 默认 gemini
   - reviser → REVISER_PROVIDER → 默认 openai
2. 再根据 provider 解析模型：
   - openai → 对应 *_OPENAI_MODEL，回退 DEFAULT_OPENAI_MODEL
   - gemini → 对应 *_GEMINI_MODEL，回退 DEFAULT_GEMINI_MODEL
3. 生产环境默认不允许调用方覆盖 provider/model。
4. 如果输入显式指定 provider/model：
   - 若与 role 默认路由一致，允许继续。
   - 若与 role 默认路由冲突，且 ALLOW_PROVIDER_OVERRIDE=false，则返回 provider_role_mismatch。
   - 只有 ALLOW_PROVIDER_OVERRIDE=true 时，才允许测试环境覆盖。
5. 如果模型为空，返回配置错误，不调用模型。
```

必须内置的角色路由规范：

```
chapter_writer:
  provider: openai
  model: gpt-5.5
  reason: 写正文、对白、中文叙事、风格化表达

structure_auditor:
  provider: gemini
  model: gemini-3.1-pro-preview
  reason: 长上下文审查、结构一致性、伏笔和章间承接

style_auditor:
  provider: gemini
  model: gemini-3.1-pro-preview
  reason: 长上下文风格审查、反模式检查、目标读者适配

reviser:
  provider: openai
  model: gpt-5.5
  reason: 根据审计报告修正文稿，保持中文表达质量
```

冲突返回示例：

```json
{
  "status": "provider_role_mismatch",
  "role": "structure_auditor",
  "requested_provider": "openai",
  "requested_model": "gpt-5.5",
  "expected_provider": "gemini",
  "expected_model": "gemini-3.1-pro-preview",
  "message": "结构审计必须默认使用 Gemini。若确需测试覆盖，请在服务端设置 ALLOW_PROVIDER_OVERRIDE=true。"
}
```

示例逻辑：

```tsx
function resolveModelForRole(role, provider) {
  if (provider === "openai") {
    if (role === "chapter_writer") return env.WRITER_OPENAI_MODEL || env.DEFAULT_OPENAI_MODEL
    if (role === "structure_auditor") return env.STRUCTURE_AUDITOR_OPENAI_MODEL || env.DEFAULT_OPENAI_MODEL
    if (role === "style_auditor") return env.STYLE_AUDITOR_OPENAI_MODEL || env.DEFAULT_OPENAI_MODEL
    if (role === "reviser") return env.REVISER_OPENAI_MODEL || env.DEFAULT_OPENAI_MODEL
  }

  if (provider === "gemini") {
    if (role === "chapter_writer") return env.WRITER_GEMINI_MODEL || env.DEFAULT_GEMINI_MODEL
    if (role === "structure_auditor") return env.STRUCTURE_AUDITOR_GEMINI_MODEL || env.DEFAULT_GEMINI_MODEL
    if (role === "style_auditor") return env.STYLE_AUDITOR_GEMINI_MODEL || env.DEFAULT_GEMINI_MODEL
    if (role === "reviser") return env.REVISER_GEMINI_MODEL || env.DEFAULT_GEMINI_MODEL
  }

  throw new Error("Unsupported provider")
}
```

## 12. 推荐代码结构

```
creative-subagent-runner-mcp/
├── package.json
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── README.md
├── src/
│   ├── index.ts
│   ├── server.ts
│   ├── tools/
│   │   ├── healthCheck.ts
│   │   ├── listSubagentRoles.ts
│   │   └── runSubagent.ts
│   ├── roles/
│   │   ├── chapterWriter.ts
│   │   ├── structureAuditor.ts
│   │   ├── styleAuditor.ts
│   │   ├── reviser.ts
│   │   └── index.ts
│   ├── llm/
│   │   ├── openaiCompatibleClient.ts
│   │   ├── geminiNativeClient.ts
│   │   ├── modelRouter.ts
│   │   └── normalizeResponse.ts
│   ├── schemas/
│   │   ├── runSubagentInput.ts
│   │   └── outputs.ts
│   ├── security/
│   │   ├── auth.ts
│   │   └── redact.ts
│   └── utils/
│       ├── truncate.ts
│       └── errors.ts
```

## 13. 安全要求

必须实现：

### 13.1 Bearer Token 鉴权

MCP Server 自身必须要求：

```
Authorization: Bearer ${MCP_AUTH_TOKEN}
```

错误 token 返回 401。

### 13.2 不暴露模型 API Key

禁止在响应、日志、错误堆栈中打印：

```
OPENAI_API_KEY
GEMINI_API_KEY
MCP_AUTH_TOKEN
```

### 13.3 不提供任意执行能力

禁止提供：

```
run_shell
execute_code
eval
read_file
write_file
delete_file
```

### 13.4 限制输入大小

```bash
MAX_INPUT_CHARS=120000
```

超过限制时返回：

```json
{
  "status": "input_too_large",
  "message": "Input exceeds MAX_INPUT_CHARS."
}
```

### 13.5 超时控制

```bash
DEFAULT_TIMEOUT_MS=120000
```

超时返回：

```json
{
  "status": "timeout",
  "message": "Model request timed out."
}
```

## 14. Docker Compose

```yaml
services:
  creative-subagent-runner-mcp:
    build: .
    env_file: .env
    ports:
      - "3000:3000"
    restart: unless-stopped
```

公网 HTTPS 推荐 Caddy：

```
subagent-mcp.your-domain.com {
    reverse_proxy 127.0.0.1:3000
}
```

MCP URL 示例：

```
https://subagent-mcp.your-domain.com/mcp
```

## 15. 最小测试

### 15.1 GPT / OpenAI-compatible 测试

```bash
curl https://api.jxincm.cn/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.5",
    "messages": [
      {"role": "system", "content": "你是一个测试助手。"},
      {"role": "user", "content": "只回复 OK"}
    ],
    "temperature": 0.1,
    "max_tokens": 20
  }'
```

预期：

```
choices[0].message.content 包含 OK
```

### 15.2 Gemini Bearer 测试

```bash
curl "https://api.jxincm.cn/v1beta/models/gemini-3.1-pro-preview:generateContent" \
  -H "Authorization: Bearer $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {"text": "只回复 OK"}
        ]
      }
    ],
    "generationConfig": {
      "temperature": 0.1,
      "maxOutputTokens": 20
    }
  }'
```

### 15.3 Gemini Query Key 测试

```bash
curl "https://api.jxincm.cn/v1beta/models/gemini-3.1-pro-preview:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {"text": "只回复 OK"}
        ]
      }
    ],
    "generationConfig": {
      "temperature": 0.1,
      "maxOutputTokens": 20
    }
  }'
```

如果 Bearer 和 query key 只有一个成功，则固定：

```bash
GEMINI_AUTH_MODE=bearer
```

或：

```bash
GEMINI_AUTH_MODE=key_query
```

## 16. MCP 层验收测试

### 16.1 `health_check`

预期：

```json
{
  "status": "ok"
}
```

### 16.2 `list_subagent_roles`

预期包含：

```
chapter_writer
structure_auditor
style_auditor
reviser
```

### 16.3 `run_subagent` 写手测试

使用 `provider=openai`，`model=gpt-5.5`。

输入要包含：

- `project_context`
- `chapter_context`
- `style_rules`
- `output_contract`

预期返回：

```json
{
  "status": "ok",
  "role": "chapter_writer",
  "provider": "openai",
  "model": "gpt-5.5",
  "content": "..."
}
```

### 16.4 `run_subagent` 结构审计测试

使用 `provider=gemini`，`model=gemini-3.1-pro-preview`。

预期返回：

```json
{
  "status": "ok",
  "role": "structure_auditor",
  "provider": "gemini",
  "model": "gemini-3.1-pro-preview",
  "report": {
    "p0": [],
    "p1": [],
    "score": 8.5,
    "pass": true
  }
}
```

## 17. README 必须包含

README 至少写清：

```
# creative-subagent-runner-mcp

A generic MCP server that runs creative writing subagents via GPT/OpenAI-compatible and Gemini native APIs.

## Tools
- health_check
- list_subagent_roles
- run_subagent

## Supported roles
- chapter_writer
- structure_auditor
- style_auditor
- reviser

## Providers
- OpenAI-compatible
- Gemini native

## juxinapi configuration
OPENAI_BASE_URL=https://api.jxincm.cn/v1
GEMINI_BASE_URL=https://api.jxincm.cn

## Security
- No shell execution
- No Notion writes
- Bearer token required
- API keys only in .env
- Input size limits
```

## 18. 给 Hermes / Cloud Code 的执行顺序

```
Step 1：创建 creative-subagent-runner-mcp 项目。
Step 2：选择 TypeScript + MCP SDK。
Step 3：实现 Bearer Token 鉴权。
Step 4：实现 role prompt 模块。
Step 5：实现 openaiCompatibleClient。
Step 6：实现 geminiNativeClient。
Step 7：实现 Gemini Bearer / query key 双鉴权兼容。
Step 8：实现 modelRouter。
Step 8.1：实现角色与模型绑定规范：写手/修稿走 GPT，结构/风格审计走 Gemini。
Step 8.2：实现 provider_role_mismatch 校验，生产环境不允许错配模型。
Step 9：实现 health_check。
Step 10：实现 list_subagent_roles。
Step 11：实现 run_subagent。
Step 12：实现输入 schema 校验。
Step 13：实现 missing_context 返回。
Step 14：实现日志脱敏。
Step 15：实现 Dockerfile / docker-compose.yml。
Step 16：写 README。
Step 17：部署到公网 HTTPS。
Step 18：跑 GPT curl 测试。
Step 19：跑 Gemini curl 测试。
Step 20：跑 MCP 工具测试。
Step 21：返回 MCP URL、测试结果、示例 job/task 输出。
```

## 19. 已确认模型与待补充信息

当前已确认：

```
模型一：gpt-5.5
Provider：openai
用途：写手、修稿
API Key：使用 OPENAI_API_KEY，独立于 Gemini Key

模型二：gemini-3.1-pro-preview
Provider：gemini
用途：结构审计、风格审计
API Key：使用 GEMINI_API_KEY，独立于 GPT Key
```

当前推荐路由：

```
WRITER_PROVIDER=openai
WRITER_OPENAI_MODEL=gpt-5.5

STRUCTURE_AUDITOR_PROVIDER=gemini
STRUCTURE_AUDITOR_GEMINI_MODEL=gemini-3.1-pro-preview

STYLE_AUDITOR_PROVIDER=gemini
STYLE_AUDITOR_GEMINI_MODEL=gemini-3.1-pro-preview

REVISER_PROVIDER=openai
REVISER_OPENAI_MODEL=gpt-5.5
```

仍需用户或开发 agent 在部署时补充：

```
OPENAI_API_KEY：gpt-5.5 对应的真实 API Key
GEMINI_API_KEY：gemini-3.1-pro-preview 对应的真实 API Key
MCP_AUTH_TOKEN：MCP Server 自身对 Notion 连接开放的访问 Token
```

安全要求：

```
真实 API Key 只写入服务器 .env。
不要提交 Git。
不要写进 README。
不要写进 Notion。
不要发到聊天。
不要在日志中打印。
```

## 20. 一句话目标

> 做一个安全的、通用的、公网可访问的 Subagent Runner MCP Server：Notion AI 负责整理上下文和写回 Notion，MCP Server 负责通过 juxinapi 调用 GPT / Gemini 运行通用子 agent。
>
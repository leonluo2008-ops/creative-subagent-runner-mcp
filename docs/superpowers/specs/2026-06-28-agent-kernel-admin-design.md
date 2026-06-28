# Agent Kernel 管理后台设计稿

## 概述

本文定义 `creative-subagent-runner-mcp` 的第一阶段重构方案，把它从“仅能通过 MCP 调用的写作子 agent 服务”升级为“可管理的 agent 内核平台”。

目标不是推翻现有 MCP server，而是把它演进成三件东西：

- 一个可复用的 `agent kernel`，负责角色定义、模型路由、prompt 模板、校验、重试、输出归一化；
- 一个 `MCP gateway`，让没有原生子 agent 能力的客户端也能通过 MCP 间接调用多角色 agent；
- 一个 `admin console`，用 GUI 管理角色、模型、prompt、运行策略和健康检查。

第一阶段只面向单管理员使用，不做 SaaS 化、多租户、计费和复杂权限系统。

## 目标

- 保留现有的 MCP 接入方式，保证外部客户端继续可用。
- 增加可视化控制面，用于管理角色和模型。
- 把业务逻辑从 MCP 协议适配层中拆出来。
- 把业务配置从 `.env` 中迁移到结构化配置文件。
- 保证 GUI 和 MCP 共享同一套执行内核。
- 第一阶段保持单仓库、单部署单元。

## 非目标

- 多用户账号系统。
- 多租户隔离。
- 计费与配额系统。
- 完整的浏览器内长篇创作工作台。
- 可视化工作流编排器。
- 第一阶段直接迁移到数据库存储。
- 第一阶段提供完整的配置回滚中心。

## 产品定位

重构后的系统同时承担两个角色：

1. 继续作为面向写作场景的 MCP server，供现有 MCP 客户端和编排层使用。
2. 作为“agent 外挂网关”，让本身没有子 agent 能力的系统，借助 MCP 接入多角色 agent 能力。

第一阶段的后台是“控制面”，不是主要创作工作台。

## 系统架构

仓库仍然保持单仓和单部署，但代码内部拆为 4 层。

### 1. `core`

`core` 负责全部 agent 业务行为，不依赖 MCP transport 和 Web UI。

职责：

- 角色定义与元数据；
- prompt 模板与 prompt 拼装；
- provider / model 路由；
- fallback 逻辑；
- 输入校验；
- 输出归一化；
- 重试、超时、CoT 清洗、字数校验；
- 上游 provider 错误归一化。

所有执行入口都必须调用同一套 `core` API，不允许 MCP 和 Admin 各自偷偷实现一套业务逻辑。

### 2. `mcp`

`mcp` 是外部 MCP 客户端的协议适配层。

职责：

- 注册工具；
- 解析 MCP 工具参数；
- 执行 MCP 鉴权；
- 管理 transport 和请求生命周期；
- 把 `core` 返回值包装成 MCP 输出结构。

`mcp` 层不拥有角色路由、prompt 内容和配置解析规则。

### 3. `admin`

`admin` 是管理员 GUI 控制台。

职责：

- 查看当前生效配置；
- 编辑角色绑定和角色元数据；
- 编辑 prompt 模板；
- 管理 provider 和 model 选项；
- 查看健康状态；
- 触发小型测试调用；
- 保存配置并触发 apply。

`admin` 必须调用与 MCP 相同的后端内核服务。

### 4. `store`

`store` 负责配置持久化、加载和快照管理。

职责：

- 从磁盘读取结构化配置；
- 在配置生效前做校验；
- 向 `core` 暴露当前激活的配置快照；
- 支持显式 apply / reload；
- 为后续迁移 SQLite 或其他持久化存储保留兼容空间。

## 建议的仓库结构

```text
src/
  core/
    execution/
    prompts/
    roles/
    routing/
    validation/
    normalization/
  mcp/
    tools/
    server/
    adapters/
  admin/
    api/
    ui/
  store/
    files/
    loaders/
    schemas/
  shared/
    types/
    errors/
    utils/
config/
  providers.json
  runtime.json
  roles/
    chapter_writer.json
    structure_auditor.json
    style_auditor.json
    reviser.json
  prompts/
    chapter_writer.md
    structure_auditor.md
    style_auditor.md
    reviser.md
  state/
    current.json
docs/
  superpowers/
    specs/
```

最终目录名可以微调，但分层边界不能被打回去。

## 配置策略

第一阶段采用结构化文件，不上数据库。

### 为什么先用文件

- 当前只有一个管理员。
- 最快能做出可用控制台。
- 部署最简单。
- 便于人工 diff、检查和恢复。
- 避免过早引入 migration、备份和 schema 兼容成本。

### 配置归属

`.env` 只保留敏感项和部署项：

- API Key；
- MCP 鉴权 Token；
- Admin Token；
- host / port；
- 环境模式。

结构化配置文件负责业务行为：

- 角色启用状态；
- 角色到 provider 的绑定；
- 模型选择；
- fallback 策略；
- prompt 内容；
- 运行策略。

### 初始配置文件

`config/providers.json`
- provider 列表；
- base URL；
- 支持的适配器类型；
- 可选模型白名单；
- 启用状态；
- provider 默认值；
- 每个 provider 的超时默认值；
- provider 对应的 secret 引用名。

`config/roles/*.json`
- role id；
- 角色描述；
- 绑定 provider；
- 主模型；
- fallback 模型；
- required fields；
- 输出类型；
- 启用状态。

`config/prompts/*.md`
- 每个角色的 system prompt。

`config/runtime.json`
- 默认 timeout；
- 默认 max tokens；
- 默认 temperature；
- 最大输入长度；
- override 策略；
- 日志策略。

`config/state/current.json`
- 当前激活的 `configVersion`；
- 最近一次 apply 时间；
- 当前激活配置的摘要。

## Admin 安全边界

第一阶段后台允许通过公网远程访问，但运行前提是：**后台只在 Tailscale 专用网络内暴露**。

即便如此，后台仍然保留最小鉴权，不采用“零鉴权管理面”。

### 第一阶段最小安全方案

- 网络边界：依赖 Tailscale 专用网络控制入口；
- 应用层边界：后台 API 和后台页面使用独立 `Admin Token`；
- MCP 边界：继续保留现有 `/mcp` Bearer Token；
- 密钥分离：`Admin Token` 与 `MCP_AUTH_TOKEN` 不能复用；
- 日志脱敏：后台不得在日志中打印 token、API key、完整 prompt 草稿。

### 为什么即使在 Tailscale 内也保留 Admin Token

- Tailscale 解决的是“谁能进入网络”，不是“谁可以改配置”；
- 管理后台拥有修改 prompt、改模型路由、触发测试调用的高权限；
- 一旦后续增加反向代理、转发、共享节点或调试链路，零鉴权后台会变成高风险点。

### 第一阶段不做的安全能力

- 不做完整用户系统；
- 不做 RBAC；
- 不做复杂会话管理；
- 不做多管理员协作审计流。

## Provider 扩展策略

第一阶段 `Providers` 页面允许新增 provider 条目，但“可新增配置”不等于“任意未知协议都能立刻接入”。

### 第一阶段允许的扩展边界

- 允许在后台新增 provider 配置条目；
- 允许设置该 provider 的基础字段、模型白名单、secret 引用名、启用状态；
- 允许把角色绑定到新 provider。

### 第一阶段的实现限制

- `core` 只支持已实现的 provider adapter 类型；
- 新增 provider 时，必须声明自己属于哪个 adapter 类型，例如 `openai-compatible`、`gemini-native`；
- 如果后台新增了 provider 条目，但其 adapter 类型在代码中不存在，则该 provider 不能 apply 成功。

这能避免出现“后台看起来能配，运行时其实完全不能调用”的假能力。

## Admin 后台范围

第一阶段后台只做 6 个控制面模块。

### `Dashboard`

用途：

- 显示服务健康状态；
- 显示每个角色当前生效的 provider / model；
- 显示 fallback 状态；
- 显示最近一次 apply 时间和 `configVersion`；
- 显示是否存在未生效的磁盘变更。

### `Roles`

用途：

- 管理多 agent 角色；
- 启用或停用角色；
- 设置 provider / model 绑定；
- 设置 fallback 模型；
- 编辑 required fields 和输出类型；
- 查看角色描述。

### `Prompts`

用途：

- 在 TypeScript 代码外编辑 system prompt；
- 预览 prompt 内容；
- 恢复默认模板；
- 展示最近修改时间。

第一阶段不做复杂 prompt 编排器。

### `Providers`

用途：

- 管理 OpenAI-compatible、Gemini 以及后续新增的 provider；
- 编辑 base URL、默认策略和 secret 引用；
- 定义允许的模型；
- 指定 provider 对应的 adapter 类型。

### `Runtime`

用途：

- 管理全局运行策略；
- 设置 override 开关；
- 编辑默认 temperature、timeout、max tokens、输入长度限制；
- 展示全局安全开关。

### `Health`

用途：

- 检查 provider 连通性；
- 检查必要 secret 是否存在；
- 校验角色路由是否可解析；
- 执行最小测试调用；
- 显示错误摘要。

## 第一阶段明确不做

- 账号系统；
- 复杂权限；
- 多租户；
- 任务历史中心；
- 浏览器内正式创作工作台；
- 计费；
- 完整工作流设计器；
- 完整配置回滚中心。

最多只保留一个轻量测试调用入口，用于运维和调试。

## 请求流

所有入口共用一条后端链路：

`Admin GUI / MCP Client -> API 层 -> core -> provider client -> 归一化 -> 返回`

### MCP 入口

外部客户端继续调用 `/mcp`。

`mcp` 层负责：

- 做鉴权；
- 解析工具参数；
- 固定请求配置快照；
- 调用 `core`；
- 把结果序列化为 MCP 输出。

### Admin 入口

后台通过普通 HTTP API 调同一个内核。

第一阶段 API 可以包含：

- `GET /api/config/roles`
- `PUT /api/config/roles/:roleId`
- `GET /api/config/providers`
- `PUT /api/config/providers/:providerId`
- `GET /api/runtime`
- `PUT /api/runtime`
- `POST /api/config/apply`
- `GET /api/health`
- `POST /api/test/run-subagent`

## 请求级 `configVersion` 快照

第一阶段必须引入请求级配置快照语义。

### 定义

- 每次请求进入系统时，先读取当前激活配置的 `configVersion`；
- 本次请求后续的路由、prompt、fallback、重试，都只使用这一份快照；
- 即使管理员在请求执行中间点了 apply，也只影响后续新请求，不影响正在执行的旧请求。

### 作用

- 保证一次调用内部配置一致；
- 保证结果可复现；
- 保证日志可排查；
- 避免长请求、fallback、重试跨版本执行。

### 要求

- MCP 请求要固定 `configVersion`；
- Admin 测试调用也要固定 `configVersion`；
- 日志中要记录请求对应的 `configVersion`；
- 错误返回中可以选择性附带 `configVersion` 便于排错。

## 配置写入、Apply 与激活模型

第一阶段允许“保存配置直接写正式态”，但必须配合**原子写入**和**显式 apply**。

### 保存阶段

- Admin 修改配置后，直接写入正式配置文件；
- 写入必须采用临时文件 + 替换的原子写法；
- 不允许直接把半截内容写到正式文件中；
- 多文件写入完成前，不更新 `config/state/current.json`。

### Apply 阶段

流程如下：

1. 启动时加载当前激活配置；
2. Admin 保存后，磁盘上的正式文件发生变化；
3. 只有在用户点击 `apply` 后，系统才重新校验并尝试激活新配置；
4. 校验成功后，生成新的 `configVersion`；
5. 更新内存中的 active snapshot；
6. 最后更新 `config/state/current.json`；
7. 从这一刻起，新请求使用新快照，旧请求继续使用旧快照。

### Apply 失败时

- 内存中的 active snapshot 保持旧值；
- `config/state/current.json` 保持旧值；
- Admin 显示本次 apply 错误；
- 服务继续对外提供旧配置能力。

### 为什么不直接“保存即生效”

- 当前配置分散在多文件中；
- prompt、role、provider、runtime 之间有交叉依赖；
- 直接保存即生效，容易在写入半程时把运行态搞脏。

因此第一阶段采用：

- 保存可以直接写正式态；
- 生效必须显式 apply；
- 运行态永远只认“最后一个成功激活的快照”。

## 错误模型

错误分为 4 类。

### 1. 配置错误

示例：

- role 引用了不存在的 provider；
- fallback model 不合法；
- prompt 文件缺失；
- provider 的 secret 引用不存在；
- 配置文件格式损坏。

处理策略：

- 在保存时尽量做结构校验；
- 在 apply 时做完整校验；
- 非法配置不能替换当前 active snapshot；
- 后台展示明确错误信息。

### 2. 请求错误

示例：

- 缺少关键上下文；
- 输入结构不合法；
- 输入过大；
- role 不存在。

处理策略：

- 保留现有 `missing_context`、`invalid_input`、`input_too_large` 等结构化状态。

### 3. Provider 错误

示例：

- key 缺失；
- 上游 429 / 500；
- provider timeout；
- model 不可用。

处理策略：

- 在 `core` 中统一归一化；
- MCP 和 Admin 共用同一份错误语义；
- 不向上层泄漏原始脏报错。

### 4. 系统错误

示例：

- 未知异常；
- 配置解析崩溃；
- 文件 IO 失败。

处理策略：

- 写日志；
- 返回安全的 `internal_error` / `model_error`；
- 保持协议层稳定。

## 测试策略

第一阶段只测高价值路径，但要覆盖真正容易出事故的部分。

### 必测项

1. 配置读取与校验
- 合法配置能加载；
- 非法配置会被拦截；
- apply 失败不会污染 active snapshot。

2. 角色路由解析
- 每个角色都能拿到正确 provider / model；
- override 开关行为正确；
- fallback 逻辑正确。

3. 请求级快照一致性
- 请求开始后固定 `configVersion`；
- 请求执行中 apply 新配置，不影响旧请求；
- Admin 测试调用和 MCP 请求都遵守同样规则。

4. 原子写入与 apply
- 单文件写入失败不会产生脏文件；
- 多文件更新后只有成功 apply 才会更新 `current.json`；
- 重启后服务加载的是“最后一次成功激活的配置”，不是“磁盘上最新但未 apply 的状态”。

5. 安全边界
- Admin Token 校验生效；
- Admin Token 与 MCP Token 不混用；
- 未带 Admin Token 不能修改配置或触发测试调用。

6. 错误归一化
- timeout；
- provider 不可用；
- secret 缺失；
- 输入缺失；
- 非法配置。

### 低优先级

- 大规模浏览器自动化测试；
- 完整 UI E2E 自动化。

第一阶段以服务级测试和聚焦手工验证为主。

## 验收标准

第一阶段满足以下条件时视为成功：

- 管理员可以在 GUI 中查看和编辑角色配置；
- 管理员可以在 GUI 中查看和编辑模型与 provider 配置；
- prompt 可以在 TypeScript 代码外编辑；
- 配置可以保存并通过显式 apply 生效；
- apply 失败不会打挂当前 MCP 服务；
- 每个请求都固定 `configVersion` 快照；
- MCP 客户端继续可用 `run_subagent`；
- GUI 可以执行健康检查和最小测试调用；
- Admin 控制面至少具备 `Tailscale + Admin Token` 的最小防护。

## 迁移说明

当前代码中已经有很多高价值逻辑，应该抽取而不是粗暴重写：

- 路由解析；
- 输入校验；
- 输出归一化；
- CoT 清洗；
- 字数校验；
- fallback 执行；
- 结构化错误处理；
- MCP 请求级资源清理和生命周期管理。

重构的顺序应该是：先把这些逻辑抽到稳定内部接口后面，再接 Admin 和新的 API 面。

## 实施顺序建议

推荐分阶段如下：

1. 从当前 MCP 代码中抽出 `core` 接口。
2. 增加 `store`，实现文件配置、active snapshot 和 `configVersion` 管理。
3. 重构 MCP 层，让它消费 `core + active snapshot`。
4. 增加 Admin HTTP API 和最小 Admin Token 鉴权。
5. 增加第一阶段 Admin UI。
6. 补齐配置快照、原子写入、安全边界和共享执行行为的测试。

这个顺序能把回归风险压到最低，同时保持现有 MCP 服务不断线。

## 本稿已确认的决策

- 部署模型：第一阶段单仓、单服务单元。
- 用户模型：第一阶段单管理员。
- 存储模型：先结构化文件，后续再考虑数据库。
- UI 范围：先做控制面，不做完整创作台。
- 安全边界：后台依赖 Tailscale，但仍保留最小 `Admin Token`。
- 写入策略：保存直接写正式态，但必须原子写入。
- 生效策略：只有显式 apply 才切换 active snapshot。
- 一致性策略：每个请求固定 `configVersion` 快照。
- Provider 策略：允许新增 provider，但必须绑定已实现的 adapter 类型。
- 回滚策略：第一阶段不做完整回滚中心。

## 暂缓决策

以下事项留到后续阶段再定：

- 数据库迁移时机；
- 多用户认证；
- 配置历史和回滚 UI；
- 对外产品化；
- 计费与配额策略；
- 工作流编排器。

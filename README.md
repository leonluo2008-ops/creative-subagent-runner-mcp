# creative-subagent-runner-mcp

通用 MCP server，运行创作类子 agent，通过 **juxinapi** (api.jxincm.cn) 调用 GPT / Gemini。

## 定位

> **通用子 agent 运行器**：接收主调度传来的项目上下文与任务要求，调用外部大模型 API，运行指定角色的子 agent，返回正文或审计报告。

不是视频渲染工具，不是 Notion 页面操作工具，不持有 Notion token，不执行 shell，不读写用户主机任意文件。

## 支持的角色

| 角色 | 默认 Provider | 默认 Model | 用途 |
|------|--------------|-----------|------|
| `chapter_writer` | openai | `gpt-5.4-mini` | 写章节正文 |
| `structure_auditor` | gemini | `gemini-3.1-pro-preview` | 审计 L1/L0/L2/L3 一致性、章间承接 |
| `style_auditor` | gemini | `gemini-3.1-pro-preview` | 审计文风、反模式、目标读者适配 |
| `reviser` | openai | `gpt-5.4-mini` | 根据审计报告修稿 |

**为什么 `gpt-5.4-mini`？**
- 实测不限流（gpt-5.5 / gpt-5-mini / gpt-5-nano 都有限流或 thinking 烧光 token 的坑）
- 中文写作质量好（实测样例见本文末尾）
- 8 倍省钱 vs `gpt-5.5`

## MCP Tools

| 工具 | 鉴权 | 说明 |
|------|------|------|
| `GET /healthz` | ❌ 无 | 健康检查 |
| `GET /` | ❌ 无 | 根端点说明 |
| `POST /mcp` | ✅ Bearer Token | MCP Streamable HTTP endpoint |

调 `/mcp` 的 3 个工具：

### `health_check`
返回 provider 状态、角色路由、server 配置。**不包含任何 API Key 明文**。

### `list_subagent_roles`
返回 4 个角色的描述、默认路由、必填字段。

### `run_subagent`
核心工具。输入包含 `role` / `task_id` / `project_context` / `chapter_context` / `style_rules` / `output_contract` / `model_options`。
返回结构化结果：
- 写手 / 修稿: `content` 字段（正文）
- 审计员: `report` 字段（`{p0, p1, score, pass, summary}` JSON）

## 部署

### 准备

- Node.js >= 20
- juxinapi 的两个 API Key（GPT 专用 / Gemini 专用，**不要混用**）
- 公网可达的部署目标（本项目走旁路由方案）

### 安装

```bash
git clone <repo> ~/Github/creative-subagent-runner-mcp
cd ~/Github/creative-subagent-runner-mcp

# 1. 装依赖
npm install

# 2. 复制 .env 模板
cp .env.example .env
nano .env   # 填 3 个 Key: MCP_AUTH_TOKEN / OPENAI_API_KEY / GEMINI_API_KEY

# 3. 编译
npm run build

# 4. 一键装 systemd
sudo ./deploy/deploy.sh install
```

### 旁路由端口映射（你的环境）

```
WAN: 60.188.104.7:50255
  ↓ 旁路由端口转发规则
LAN: 192.168.101.9:3037 (本机 MCP server)
```

### 验证

```bash
# 本机
./deploy/deploy.sh verify

# 外网（从另一台机器测）
curl http://60.188.104.7:50255/healthz
curl -X POST http://60.188.104.7:50255/mcp \
  -H "Authorization: Bearer *** $MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

### 运维

```bash
./deploy/deploy.sh restart   # 重启
./deploy/deploy.sh stop      # 停止
./deploy/deploy.sh status    # 状态
./deploy/deploy.sh logs      # 最近 50 行日志
./deploy/deploy.sh verify    # 验证
./deploy/deploy.sh uninstall # 卸载（保留代码）
```

## 安全

### 已实现

- **Bearer Token 鉴权**：所有 `/mcp` 请求必须带 `Authorization: Bearer <token>`
- **API Key 永不外泄**：日志、错误堆栈、health_check 响应都脱敏
- **生产路由锁定**：`ALLOW_PROVIDER_OVERRIDE=false`，调用方不能覆盖角色路由
- **角色路由 mismatch 校验**：传错 provider/model 直接返回 `provider_role_mismatch`
- **输入大小限制**：`MAX_INPUT_CHARS=120000`，超出返回 `input_too_large`
- **超时控制**：`DEFAULT_TIMEOUT_MS=120000`，超时返回 `timeout`
- **systemd 加固**：`NoNewPrivileges` / `ProtectSystem=strict` / `MemoryMax=512M`

### 不允许的能力（按设计）

- ❌ 不修改 Notion 页面
- ❌ 不持有 Notion token
- ❌ 不执行 shell
- ❌ 不读写用户主机任意文件
- ❌ 不渲染视频
- ❌ 不把单个项目的设定写死进全局 prompt
- ❌ 不返回 API Key 明文

### Key 管理规范

```
真实 Key 只写入服务器 .env。
不要提交 Git。.gitignore 已包含 .env
不要写进 README / Notion / 聊天。
不要在日志中打印。
```

`.env` 权限：`-rw-------` (600)

## MCP 客户端接入示例

### Claude.ai / Cloud Code / Cursor

在 MCP 配置里加：

```json
{
  "mcpServers": {
    "creative-subagent-runner": {
      "url": "http://60.188.104.7:50255/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_AUTH_TOKEN>"
      }
    }
  }
}
```

### Notion AI

Notion AI 消费版目前不支持自定义 MCP Server。**方案**：
- 在主调度（Claude / Cloud Code）里跑 MCP，由主调度把上下文写到 Notion
- 或者用本文的 `curl` / Python 方式在 Notion 的 automation / webhook 里调

### 直接 curl

```bash
# 调 list_subagent_roles
curl -X POST http://60.188.104.7:50255/mcp \
  -H "Authorization: Bearer *** $MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_subagent_roles","arguments":{}},"id":1}'
```

### Python

```python
import urllib.request, json

token = "YOUR_MCP_TOKEN"
url = "http://60.188.104.7:50255/mcp"

req = urllib.request.Request(
    url,
    data=json.dumps({
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": "run_subagent",
            "arguments": {
                "role": "chapter_writer",
                "task_id": "demo-ch01",
                "project_context": {
                    "l1_core": "...",
                    "l0_world": "...",
                    "series_l2": "...",
                    "current_season_l2": "...",
                },
                "chapter_context": {
                    "chapter_title": "...",
                    "chapter_beats": "...",
                },
                "style_rules": {"tone": "...", "anti_patterns": []},
                "output_contract": {"format": "markdown", "word_count": "350-450", "language": "zh-CN"},
            },
        },
        "id": 1,
    }).encode(),
    headers={
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    },
)
with urllib.request.urlopen(req, timeout=120) as r:
    for line in r.read().decode().split("\n"):
        if line.startswith("data: "):
            payload = json.loads(line[6:])
            text = payload["result"]["content"][0]["text"]
            result = json.loads(text)
            print(result["content"])  # 写手的正文
            # print(result["report"])   # 审计员的报告
```

完整端到端测试脚本见 `scripts/e2e-test.py` / `scripts/e2e-test-auditors.py`。

## 端到端实测结果（2026-06-19）

### chapter_writer 写的章节样本

> 傍晚的时候，妈妈轻轻牵着小兔子，来到一座软软的草坡上。草叶挨着小兔子的脚，凉凉的，像一张安静的小毯子。她们坐下来，靠在一起，看着天边一点一点变暗。
>
> 小兔子先是看见橘色的光，慢慢变成浅蓝，又慢慢变成深蓝。就在这时候，第一颗星星亮起来了，接着是第二颗，第三颗。小兔子眨了眨眼，小声说："妈妈，天上在发亮呢。"
>
> 妈妈把小兔子搂进怀里，声音轻轻的："是呀，星星出来了，它们在陪着夜晚睡觉。"
>
> ……（详见 `/tmp/rabbit-ch01-draft.md`）

- **12.3s** / 375 中文字 / 1302 tokens
- 完全符合项目禁区（不说教、不"从前"开头、不恐怖）
- 完成所有 beats：傍晚到草坡 → 星星出来 → 第一次看月亮 → 妈妈描述 → 安静下来
- 结尾留钩子："远远的地方，忽然传来一阵轻轻的风声"

### structure_auditor 报告

```json
{
  "p0": [],
  "p1": ["第4段: '圆月'比作'小船'在儿童认知中略微违和，建议改'珍珠'或'灯笼'"],
  "score": 9.5,
  "pass": true,
  "summary": "结构完整，Beat执行精准，完美契合L0-L2的温馨基调，结尾的'风声'成功埋下季L2中下一项'听风'的钩子。"
}
```

### style_auditor 报告

```json
{
  "p0": [],
  "p1": ["'忽然'用2次违和 style_rules '温柔安静'基调，建议替换为'这时'或自然变化描写"],
  "score": 9.5,
  "pass": true,
  "summary": "文本高度契合3-6岁目标读者，完美落实了温柔安静的童谣基调。"
}
```

## 项目结构

```
creative-subagent-runner-mcp/
├── src/
│   ├── index.ts                  # 入口
│   ├── server.ts                 # Express + MCP Streamable HTTP
│   ├── tools/
│   │   ├── healthCheck.ts        # health_check 工具
│   │   ├── listSubagentRoles.ts  # list_subagent_roles 工具
│   │   └── runSubagent.ts        # run_subagent 工具（核心）
│   ├── roles/
│   │   └── index.ts              # 4 角色 prompt + requiredInputFields
│   ├── schemas/
│   │   └── runSubagentInput.ts   # Zod 校验 + missing_context
│   ├── llm/
│   │   ├── openaiCompatibleClient.ts  # GPT /v1/chat/completions
│   │   ├── geminiNativeClient.ts      # Gemini /v1beta/.../generateContent
│   │   └── modelRouter.ts             # 角色路由 + provider_role_mismatch
│   ├── security/
│   │   ├── auth.ts               # Bearer Token 鉴权（常量时间比较）
│   │   └── redact.ts             # API Key / Token 脱敏
│   └── utils/
│       └── env.ts                # .env 加载 + Zod schema 校验
├── deploy/
│   ├── creative-subagent-runner-mcp.service  # systemd unit
│   └── deploy.sh                              # 一键安装/运维脚本
├── scripts/
│   ├── test-llm.ts               # 直连双 LLM 测试
│   ├── e2e-test.py               # 端到端 chapter_writer 测试
│   └── e2e-test-auditors.py       # 端到端审计员测试
├── dist/                          # TypeScript 编译产物
├── .env.example                  # 模板（无 Key，可提交）
├── .env                          # 真实 Key（不入 Git，600 权限）
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## License

Private project.

## 联系 / 反馈

通过主 Agent（huiben / hermes）反馈。
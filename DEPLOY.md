# creative-subagent-runner-mcp 独立部署指南

> **本文档**：从 series-projects skill 仓独立抽出的 MCP server 部署指南
>
> **目标读者**：在新机器上独立部署 MCP server（不需要 series-projects skill 全套）
>
> **适用场景**：Notion / 任意 HTTP 客户端通过公网/内网调用 MCP 的 4 角色写手/审计/修稿

---

## 1. 当前部署状态（参考机：luo-Surface-Pro）

| 项目 | 值 |
|---|---|
| systemd unit | `~/.config/systemd/user/creative-subagent-runner-mcp.service` |
| 代码位置 | `~/.hermes/skills/series-projects/mcp/creative-subagent-runner-mcp/` |
| PID | 243866 (node v22.22.1) |
| 内存 | ~44M (max 512M) |
| 监听 | `0.0.0.0:3037` |
| 运行时间 | 22h+ (active, enabled) |
| 公网地址 | `https://subagent.aistar.work` (Cloudflare Tunnel) |
| Tailscale | `100.126.167.88:3037` |

### 3 个访问入口

| 入口 | 地址 | 鉴权 | 适用场景 |
|---|---|---|---|
| 本机回环 | `http://127.0.0.1:3037/mcp` | 免鉴权 | 本地 agent / script |
| Tailscale | `http://100.x.x.x:3037/mcp` | Bearer token | 内网设备 (Tailscale tailnet) |
| 公网 | `https://subagent.aistar.work/mcp` | Bearer token | Notion / 任意公网客户端 |

---

## 2. 源码位置

MCP server 代码在 GitHub：
```
https://github.com/leonluo2008-ops/series-projects/tree/main/mcp/creative-subagent-runner-mcp
```

> 它是 series-projects 仓内的一个目录（git subtree 合入，不是 submodule）。
> 如果将来需要独立仓，可以 `git subtree split -P mcp/creative-subagent-runner-mcp -b mcp-only` 提取。

---

## 3. 新机器部署步骤

### 3.1 克隆

```bash
git clone https://github.com/leonluo2008-ops/series-projects.git
cd series-projects/mcp/creative-subagent-runner-mcp
```

> 如果只需要 MCP server，不需要完整 series-projects 仓，可以用 sparse checkout：
> ```bash
> git clone --filter=blob:none --sparse https://github.com/leonluo2008-ops/series-projects.git
> cd series-projects
> git sparse-checkout set mcp/creative-subagent-runner-mcp
> ```

### 3.2 安装依赖 & 构建

```bash
npm install
npm run build    # 输出到 dist/
```

**依赖要求**：
- Node.js >= 18 (推荐 v22)
- npm >= 9

### 3.3 配置 .env

在 `creative-subagent-runner-mcp/` 目录下创建 `.env`：

```bash
# === 必填 ===
NODE_ENV=production
PORT=3037
HOST=0.0.0.0

# 鉴权 token（非回环访问必需，openssl rand -hex 32 生成）
MCP_AUTH_TOKEN=<32位以上hex字符串>

# === LLM Provider 配置（至少配一个） ===
# 方案 A: OpenAI 兼容 API（如 juxinapi / new-api / one-api）
OPENAI_BASE_URL=https://your-api-gateway.com/v1
OPENAI_API_KEY=sk-xxx
DEFAULT_OPENAI_MODEL=gpt-4o-mini

# 方案 B: Gemini
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
GEMINI_API_KEY=xxx
DEFAULT_GEMINI_MODEL=gemini-2.5-flash

# 默认 provider: openai 或 gemini
DEFAULT_PROVIDER=openai

# === 4 角色模型路由（可选，不填则用 DEFAULT_ 值） ===
WRITER_PROVIDER=openai
WRITER_OPENAI_MODEL=gpt-4o
STRUCTURE_AUDITOR_PROVIDER=gemini
STRUCTURE_AUDITOR_GEMINI_MODEL=gemini-2.5-flash
STYLE_AUDITOR_PROVIDER=gemini
STYLE_AUDITOR_GEMINI_MODEL=gemini-2.5-flash
REVISER_PROVIDER=openai
REVISER_OPENAI_MODEL=gpt-4o

# === 参数调优（可选） ===
DEFAULT_TEMPERATURE=0.7
DEFAULT_MAX_TOKENS=4096
DEFAULT_TIMEOUT_MS=60000
MAX_INPUT_CHARS=50000
MAX_OUTPUT_TOKENS=8192

# === Gemini 鉴权模式 ===
GEMINI_AUTH_MODE=api-key   # 或 proxy-auth

# === 功能开关 ===
ENABLE_JSON_MODE=false
ALLOW_PROVIDER_OVERRIDE=false
```

**重要**：
- `MCP_AUTH_TOKEN` 必须用 `openssl rand -hex 32` 单独生成，不要用 heredoc
- 生成后立即轮换一次（确保终端回显的值作废）

### 3.4 systemd 用户服务（推荐）

创建 `~/.config/systemd/user/creative-subagent-runner-mcp.service`：

```ini
[Unit]
Description=Creative Subagent Runner MCP Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/absolute/path/to/creative-subagent-runner-mcp
Environment="NODE_ENV=production"
EnvironmentFile=/absolute/path/to/creative-subagent-runner-mcp/.env
ExecStart=/usr/bin/node /absolute/path/to/creative-subagent-runner-mcp/dist/index.js
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=creative-subagent-runner-mcp
MemoryMax=512M

[Install]
WantedBy=default.target
```

启动：

```bash
systemctl --user daemon-reload
systemctl --user enable --now creative-subagent-runner-mcp
systemctl --user status creative-subagent-runner-mcp
```

### 3.5 验证

```bash
# 本机 healthz
curl -sS http://127.0.0.1:3037/healthz
# 预期: {"status":"ok","timestamp":"..."}

# tools/list（带 token）
curl -sS http://127.0.0.1:3037/mcp \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer <MCP_AUTH_TOKEN>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

---

## 4. 公网暴露方案

Notion 只能访问公网地址。推荐以下方案之一：

### 方案 A: Cloudflare Tunnel（当前方案 ✅）

```bash
# 1. 安装 cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# 2. 登录
cloudflared tunnel login

# 3. 创建 tunnel
cloudflared tunnel create mcp-tunnel

# 4. 配置 ~/.cloudflared/config.yml
# 在 ingress 段加一条:
#   - hostname: subagent.your-domain.work
#     service: http://localhost:3037

# 5. DNS 记录
cloudflared tunnel route dns mcp-tunnel subagent.your-domain.work

# 6. systemd 启动
systemctl enable --now cloudflared
```

**优点**：不需要开端口、不需要公网 IP、HTTPS 自动、Cloudflare CDN 加速

### 方案 B: Tailscale Funnel

```bash
tailscale funnel 3037
# 自动分配一个公网 URL: https://your-machine.tailnet-xxx.ts.net
```

**优点**：零配置公网暴露
**缺点**：需要 Tailscale、URL 不固定、有带宽限制

### 方案 C: Nginx 反代 + VPS

标准 Nginx 反代到 `localhost:3037`，配 SSL 证书。

---

## 5. API 调用示例

### 5.1 列出角色

```bash
curl -sS "https://subagent.aistar.work/mcp" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_subagent_roles","arguments":{}}}'
```

### 5.2 写一章

```bash
curl -sS "https://subagent.aistar.work/mcp" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "jsonrpc":"2.0","id":2,
    "method":"tools/call",
    "params":{
      "name":"run_subagent",
      "arguments":{
        "role":"chapter_writer",
        "task_id":"demo-001",
        "project_context":{
          "project_name":"我的故事",
          "genre":"儿童童话",
          "target_reader":"6-10岁",
          "l1_core":"勇气与友谊"
        },
        "chapter_context":{
          "season":1,
          "chapter":1,
          "chapter_title":"冒险的开始",
          "chapter_beats":"开篇→触发事件→进入冒险世界",
          "previous_chapter_tail":"",
          "next_chapter_hook":"一个新的伙伴"
        },
        "style_rules":{
          "tone":"温暖幽默",
          "narration":"第三人称",
          "must_have":["对话","场景描写"],
          "anti_patterns":["AI味排比","说教"]
        },
        "output_contract":{
          "format":"markdown",
          "word_count":"800-1500",
          "language":"zh-CN"
        }
      }
    }
  }'
```

### 5.3 在 Notion 中调用

1. 在 Notion 中创建 HTTP Request block
2. URL: `https://subagent.aistar.work/mcp`
3. Method: `POST`
4. Headers:
   - `Content-Type: application/json`
   - `Accept: application/json, text/event-stream`
   - `Authorization: Bearer <TOKEN>`
5. Body: JSON-RPC 格式（同上）

---

## 6. 鉴权说明

| 访问方式 | 鉴权机制 |
|---|---|
| 127.0.0.1 / ::1 / localhost | 免鉴权（自动检测回环） |
| 其他所有地址（Tailscale / 公网） | Bearer token（`MCP_AUTH_TOKEN`） |

不带 token 访问非回环地址会返回 401 错误。

---

## 7. 故障排查

```bash
# 服务状态
systemctl --user status creative-subagent-runner-mcp

# 查日志
journalctl --user -u creative-subagent-runner-mcp -f

# healthz
curl -sS http://127.0.0.1:3037/healthz

# 端口占用
ss -tlnp | grep 3037

# 重启
systemctl --user restart creative-subagent-runner-mcp
```

---

*文档生成时间: 2026-06-26*
*基于 luo-Surface-Pro 实际部署状态*

# creative-subagent-runner-mcp

> **A generic MCP server for running creative writing subagents across different writing projects.**
>
> 这是一个**通用写作子 Agent Runner**，适用于多类型创作项目。
> 调用方（Notion AI / Cloud Code / Claude.ai / 自建主调度）每次传入项目上下文、章节任务和风格规则，
> 服务端运行对应的写手、结构审计、风格审计或修稿 agent，返回结构化结果。

## 定位

**通用写作子 Agent Runner**。它**不是**：

- ❌ 儿童故事工具 / 睡前故事工具 / 童谣工具
- ❌ 单一项目的专用工具
- ❌ 视频渲染工具 / Notion 页面操作工具 / shell 执行工具
- ❌ 持有 Notion token / 读写用户主机任意文件的工具

它**是**：

- ✅ 调用方每次传入项目设定、风格规则、目标读者和禁区
- ✅ 根据调用方传入的 `role` 选择子 agent（写手 / 结构审计 / 风格审计 / 修稿）
- ✅ 通过 **juxinapi** (`api.jxincm.cn`) 调用 GPT（OpenAI-compatible）和 Gemini（原生）
- ✅ 返回结构化结果：写手返回章节正文，审计员返回 `{p0, p1, score, pass, summary}`，修稿返回新正文 + 修订说明

## 核心原则

1. **不绑定具体项目** — 任何 IP、世界观、人物、剧情都来自调用方传入
2. **不绑定具体题材** — 儿童故事、成人小说、科幻剧本、悬疑、讽刺、剧本大纲、角色小传均可
3. **不绑定具体读者年龄** — `target_reader` 由调用方每次传入，可为"3-6 岁"也可为"35 岁男性"
4. **不绑定具体文风** — `style_rules.tone / must_have / anti_patterns` 全部由调用方决定
5. **不内置固定审美** — 风格审计员根据传入的 `style_rules` 决定审稿标准，不预置"温柔"或"冷峻"等任何倾向
6. **不修改调用方任何资源** — 不写 Notion / 不执行 shell / 不动文件系统

## 支持的角色

| 角色 | 默认 Provider | 默认 Model | 用途 |
|------|--------------|-----------|------|
| `chapter_writer` | openai | `gpt-5.4-mini` | 根据项目上下文和章节 beats 写指定章节正文 |
| `structure_auditor` | gemini | `gemini-3.1-pro-preview` | 审计 L1/L0/L2/L3 一致性、章间承接、伏笔、章末钩子 |
| `style_auditor` | gemini | `gemini-3.1-pro-preview` | 根据 `style_rules` 审计项目指定风格、反模式、表达边界、目标读者适配 |
| `reviser` | openai | `gpt-5.4-mini` | 根据审计报告（P0 + P1）修订正文，输出完整新文 + revision_notes |

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
核心工具。运行指定写作子 agent，根据 `role` 返回章节正文、结构审计报告、风格审计报告或修稿结果。

输入字段：
- `role` — `chapter_writer` / `structure_auditor` / `style_auditor` / `reviser`
- `task_id` — 调用方自定义任务 ID（用于日志追踪）
- `project_context` — 项目内核 / 世界观 / 系列大纲 / 当前季大纲 / 目标读者 / 项目规则 / 禁区
- `chapter_context` — 章节号 / 标题 / beats / 上一章尾 / 下一章钩 / 现有草稿 / 审计报告
- `style_rules` — 文风基调 / 叙事人称 / 必须有 / 反模式（**完全由调用方决定**）
- `output_contract` — 格式 / 字数 / 语言 / 是否返回 JSON
- `model_options` — temperature / max_tokens（默认由服务端 `.env` 决定，调用方不传则走默认）

## 部署

### 准备

- Node.js >= 20
- Linux（任何主流发行版，systemd 是唯一依赖）
- juxinapi 的两个 API Key（GPT 专用 / Gemini 专用，**不要混用**）
- 一个能跑 cloudflared 的账号（cloudflared 是推荐的公网暴露方案；不要 cloudflared 也可以走端口映射）

### 安装（任何 Linux 机器都一样）

```bash
# 1. clone 仓库（替换为你的 fork / 你的 git remote）
git clone <repo> ~/Github/creative-subagent-runner-mcp
cd ~/Github/creative-subagent-runner-mcp

# 2. 装依赖
npm install

# 3. 复制 .env 模板,填 3 个 Key
cp .env.example .env
chmod 600 .env
nano .env   # 必填: MCP_AUTH_TOKEN / OPENAI_API_KEY / GEMINI_API_KEY
            # 可选: PORT (默认 3037), HOST (默认 0.0.0.0)

# 4. 编译
npm run build

# 5. 一键装 systemd (用户级 service,不需要 root)
./deploy/deploy.sh install
```

**自动适配**：unit 文件用 systemd 模板变量 (`%u` = 当前用户, `%h` = home 目录)，
路径不需要改。 `deploy/creative-subagent-runner-mcp.service` 是用户级
unit (不需要 root 权限)。

### 公网暴露（推荐 Cloudflare Tunnel）

1. 在 Cloudflare 控制台建一个 Tunnel，下载 JSON credentials 到
   `~/.cloudflared/<TUNNEL_ID>.json`
2. 修改 `~/.cloudflared/config.yml`:

   ```yaml
   tunnel: <your-tunnel-id>
   credentials-file: /home/<your-user>/.cloudflared/<TUNNEL_ID>.json

   ingress:
     - hostname: mcp.your-domain.com
       service: http://localhost:3037
     - service: http_status:404
   ```

3. 启动: `cloudflared tunnel run <your-tunnel-id>`
4. 把 `mcp.your-domain.com` 的 DNS CNAME 指到 `<tunnel-id>.cfargotunnel.com`

**不需要修改任何项目代码**。cloudflared 是独立的 daemon。

### 公网暴露（备选：旁路由 / 防火墙端口映射）

如果你的服务器在 NAT 后面，可以让路由器做端口转发：

```
WAN: <your-public-ip>:PORT
  ↓ 路由器端口转发规则
LAN: <lan-ip-of-server>:3037
```

并在服务器本机放行对应端口：

```bash
sudo ufw allow <PORT>/tcp
```

**注意**：服务器本机必须 `chmod 600 .env`，systemd unit 用 `ProtectHome=read-only`。

### 验证

```bash
# 本机
./deploy/deploy.sh verify

# 外网
curl https://mcp.your-domain.com/healthz
curl -X POST https://mcp.your-domain.com/mcp \
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

### 升级代码后

```bash
cd ~/Github/creative-subagent-runner-mcp
git pull
npm install
npm run build
./deploy/deploy.sh restart
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
      "url": "http://<your-public-host>:PORT/mcp",
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
curl -X POST http://<your-public-host>:PORT/mcp \
  -H "Authorization: Bearer *** $MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_subagent_roles","arguments":{}},"id":1}'
```

### Python

```python
import urllib.request, json

token = "YOUR_MCP_TOKEN"
url = "http://<your-public-host>:PORT/mcp"

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

> **说明**：以下 3 个不同题材的实测样例展示 MCP Server 的**通用性**。
> 同一个写手 / 审计员 / 修稿 agent，仅通过 `style_rules` 切换，输出截然不同。
> 儿童故事只是 3 个示例之一，**不是默认方向**。

---

### 示例 A：3-6 岁儿童睡前故事

**项目设定（调用方传入）：**
```json
{
  "project_context": {
    "l1_core": "小兔子第一次看月亮",
    "l0_world": "森林小动物的世界",
    "target_reader": "3-6 岁"
  },
  "style_rules": {
    "tone": "温柔安静如童谣",
    "anti_patterns": ["说教", "恐怖", "复杂讽刺"]
  }
}
```

**chapter_writer 生成的章节样本：**

> 傍晚的时候，妈妈轻轻牵着小兔子，来到一座软软的草坡上。草叶挨着小兔子的脚，凉凉的，像一张安静的小毯子。她们坐下来，靠在一起，看着天边一点一点变暗。
>
> 小兔子先是看见橘色的光，慢慢变成浅蓝，又慢慢变成深蓝。就在这时候，第一颗星星亮起来了，接着是第二颗，第三颗。小兔子眨了眨眼，小声说："妈妈，天上在发亮呢。"
>
> 妈妈把小兔子搂进怀里，声音轻轻的："是呀，星星出来了，它们在陪着夜晚睡觉。"

- **12.3s** / 375 中文字 / 1302 tokens
- 完成 beats：傍晚到草坡 → 星星出来 → 第一次看月亮 → 妈妈描述 → 安静下来
- 结尾留钩子："远远的地方，忽然传来一阵轻轻的风声"

**style_auditor 报告：**
```json
{
  "p0": [],
  "p1": ["'忽然'用 2 次违和 style_rules '温柔安静'基调"],
  "score": 9.5,
  "pass": true,
  "summary": "文本高度契合 3-6 岁目标读者，落实了 style_rules 的温柔安静基调。"
}
```

---

### 示例 B：成人现实讽刺短篇

**项目设定（调用方传入）：**
```json
{
  "project_context": {
    "l1_core": "小城公务员发现一封 1998 年的举报信，举报对象是他自己",
    "l0_world": "中国北方某五线县城，2020 年代",
    "target_reader": "30-45 岁男性"
  },
  "style_rules": {
    "tone": "周星驰式喜剧外壳 + 悲剧内核",
    "narration": "第三人称冷叙述",
    "must_have": ["动作型笑点", "现实映射", "悲剧后劲"],
    "anti_patterns": ["说教", "新闻复刻", "纯苦情", "正能量口号"]
  }
}
```

**chapter_writer 生成的章节样本：**

> 他拉开的是单位里那只最老的旧抽屉。
> 抽屉卡得像一位退休多年却仍不肯散场的老干部，先是"咔"一声，接着"哐"地猛退半寸，像终于想起自己还有点脾气。灰尘顺势扑出来，呛得他连打两个喷嚏，手里那份刚印好的材料差点飞进暖气片后面，姿势狼狈得像在向文件鞠躬。
>
> 然后，一封信掉了出来。
> 纸张泛黄，边角卷起，像被年月咬过一口。信封上没有邮票，只有一行老式钢笔字，劲道还在，像当年写字的人下笔时手腕里全是火。
>
> 他弯腰捡起，指腹刚碰到那几个字，心口就轻轻一沉。
> 这笔迹，他认得。
> 不是因为他记性好，而是因为这字当年逼他在师父门前罚站了整整半天——横要平，竖要直，连"口"字都写得像县城广场上那块永远修不平的地砖。师父姓齐，是他刚进机关时带他的老笔杆子，骂人不带脏字，最擅长一边喝茶一边把人训得想回家改姓。
>
> 信封没封严，里面那张纸也滑了出来。
> 举报信。
> 落款日期：1998 年。
>
> 他站在原地，像被谁从背后轻轻拎住了后颈。
> 窗外大喇叭正在播天气预报，声音断断续续，跟这封信一样，隔了二十多年，忽然又钻回人耳朵里。
>
> 他摸出手机，拨了师父的电话。
> 第一遍，响三声，被挂断。
> 第二遍，刚响两声，又被挂断。
> 他盯着屏幕，忽然笑了一下，笑得比哭还短。
>
> 他低头看着那封信，忽然觉得抽屉不是抽屉，是一只埋了二十多年的棺材。
> 而棺材里躺着的，偏偏像是他自己。

- **7.2s** / 642 中文字 / 实测 `gpt-5.4-mini`
- 落实了喜剧外壳（抽屉像老干部 / 像向文件鞠躬 / 冰棍 = 时代停滞）+ 悲剧内核（举报自己 / 棺材意象）
- 结尾留钩子："师父电话挂断 + 棺材意象"

**structure_auditor 报告：**
```json
{
  "p0": [
    "第4段至第5段: 缺失 L1 核心设定'举报对象是他自己'的实质性交代——信纸滑出后主角仅看到'举报信'和'1998年'，并未明确写出主角阅读信件并发现被举报人就是自己，导致结尾'棺材里躺着的，偏偏像是他自己'缺乏事实支撑。"
  ],
  "p1": [
    "全文风格: 风格规则要求'周星驰式喜剧外壳 + 悲剧内核'，目前比喻（抽屉像老干部、修不平的地砖）更偏传统体制内伤痕文学与写实讽刺，缺乏周星驰那种夸张、荒诞、无厘头的喜剧张力。",
    "第8段: '五毛钱一根的冰棍'作为时代停滞的意象在 2020 年代县城语境下略显失真，建议替换为更符合当下且能体现荒诞停滞感的细节。"
  ],
  "score": 6.5,
  "pass": false,
  "summary": "顺利执行了规定的章节 beats，但未能在正文中明确落实 L1 核心设定（举报对象是自己），且喜剧外壳表现不足。"
}
```

> **审计员的 P0 不是 bug** — 它正好证明审计员按 L1 / L0 / style_rules 真实干活，给写手明确的修订方向。这是 MCP Server 跨题材通用的关键证据。

---

### 示例 C：科幻系列剧本（多季结构 + 章末钩子）

**项目设定（调用方传入）：**
```json
{
  "project_context": {
    "l1_core": "2187 年，人类发现月球背面埋着 1.2 亿年前的'非地球造物'",
    "l0_world": "近未来硬科幻，遵守现有物理定律",
    "series_l2": "《月背纪事》5 季",
    "current_season_l2": "第 1 季：发现 → 接触 → 代价"
  },
  "chapter_context": {
    "chapter": 3,
    "chapter_title": "硅基样本",
    "chapter_beats": "取样 → 样本异常活跃 → 触发休眠协议 → 主角被停职 → 章末主角偷走样本",
    "next_chapter_hook": "第 4 章：样本在主角家中开始唱歌"
  },
  "style_rules": {
    "tone": "硬科幻 + 冷峻 + 学术化对白",
    "must_have": ["物理自洽", "机构政治", "角色专业背景"],
    "anti_patterns": ["玄学", "超能力", "AI 觉醒陈词滥调"]
  }
}
```

**chapter_writer 生成的章节样本：**

> 取样是在月背基地的低温舱里完成的。机械臂按预设路径切开外层封装，钻头以毫米级进给从黑色样本表面刮下薄屑，送入真空转运盒。林澈站在观察窗外，手套里的指尖却仍能感觉到那种不对劲——不是震动，而是传感器反馈回来的周期性微扰，像样本在主动调整热容分布。
>
> "表面温升超出被动材料上限。"她低声说。
>
> 旁边的材料组组长扫了一眼曲线，语气克制："不是温升，是局部相变。它在消耗环境能量维持某种结构态。"
>
> 取样结束的第三分钟，样本忽然活跃起来。红外图像上，原本均匀的冷斑开始呈现规则脉冲，频率稳定得近乎故意。更糟的是，脉冲与舱内电磁噪声同步，像在借用设备自身的时钟。
>
> "启动休眠协议。"站在后方的项目官员立即下令，声音比谁都快恢复了行政腔调，"封存，断开外部耦合，所有人员退出二级区。"
>
> 隔离门闭合前，林澈看见样本表面那层黑色薄膜缓慢起皱，像某种无声的应答。
>
> 三小时后，她被叫进临时听证室。会议桌另一端坐着院方、军方联络官和安全监察。没人问她是否愿意参与，只有程序性措辞。
>
> "你的操作记录完整，但你在未获批的情况下提高了采样功率。"监察官翻着平板，"我们需要你暂时停职，配合调查。"
>
> 林澈抬头："如果不提高功率，样本可能在封装前完成自恢复。你们要的是安全，不是流程。"
>
> 军方联络官没有看她，只说："我们要的是可控。"
>
> 停职通知签完，她没有立刻离开。走廊尽头的储物间里，备用样本盒被单独列管，标签上写着：硅基样本 A-3，待转移。林澈知道自己在越界，也知道接下来会有更严格的封存、更多的权限切断，直到它变成一份只能写进报告里的异常。
>
> 她还是把盒子塞进了外套内层。
>
> 门禁灯由绿转红时，她听见自己呼吸很稳。不是勇敢，只是她比任何人都清楚：一旦样本进入军方体系，下一次见到它，就不再是作为材料。

- **5.6s** / 745 中文字 / 实测 `gpt-5.4-mini`
- 完成 beats：取样 → 异常活跃 → 触发休眠 → 停职 → 偷走样本
- 章末钩子落地：门禁灯转红 + 主角私自藏样 + "它不再是材料"
- 硬科幻质感：相变 / 电磁脉冲同步 / 晶格数据 / 行政腔调 / 军方"可控"

**structure_auditor 报告：**
```json
{
  "p0": [
    "第8段至第10段: 违背 L0 硬科幻逻辑与世界观严谨性。在军方高度介入、触发最高级别休眠协议的背景下，主角能从'走廊尽头的储物间'轻易将'单独列管'的备用样本塞进外套带走，安保形同虚设，缺乏利用技术手段或权限漏洞的合理交代。",
    "结尾处: 缺乏下一章钩子（样本在主角家中开始唱歌）的直接伏笔。需要埋下样本产生微弱物理高频震动或对周围音频/通讯设备产生声学干扰的种子，以支撑'唱歌'的合理性。"
  ],
  "p1": [
    "第1段: 缺乏对主角违规操作的描写。第8段听证会提到主角'未获批的情况下提高了采样功率'，但第1段取样过程并未体现林澈手动干预或提高功率的动作，导致停职理由显得突兀。",
    "第10段: '门禁灯由绿转红时'细节存疑——如果是红灯意味着报警或拒绝通行，主角如何能带着样本顺利离开？"
  ],
  "score": 6.5,
  "pass": false,
  "summary": "学术氛围与硬科幻质感良好，但核心情节（偷窃样本）的安保逻辑存在严重漏洞，且未给下一章的'唱歌'钩子预留声学或震动维度的物理种子。"
}
```

> **同样，审计员的 P0 是真实干活的表现** — 它准确指出硬科幻世界观下的逻辑漏洞，给修稿 agent 提供明确 P0/P1 清单。

---

**结论**：3 个完全不同题材（儿童睡前 / 成人讽刺 / 科幻剧本）走的是**完全相同的 4 个 agent**，仅通过 `project_context` + `style_rules` 切换输出。MCP Server 不内置任何固定审美或题材假设。

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
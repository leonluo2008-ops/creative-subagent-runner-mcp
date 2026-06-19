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

> **说明**：以下 3 个由调用方传入完全不同项目上下文的实测样例展示 MCP Server 的**通用性**。
> 同一个写手 / 审计员 / 修稿 agent，仅通过 `project_context` + `style_rules` 切换，输出截然不同。
> 儿童故事只是 3 个示例之一，**不是默认方向**。
> 实测全部由服务端按角色默认路由（chapter_writer / reviser → openai / gpt-5.4-mini；structure_auditor / style_auditor → gemini / gemini-3.1-pro-preview）自动选择，调用方**不显式传** `provider` / `model`。

---

### 示例 1：小兔子的晚安世界 — 3-6 岁儿童睡前故事

**项目设定（调用方传入的关键字段）：**
```json
{
  "project_name": "小兔子的晚安世界",
  "genre": "儿童睡前故事",
  "target_reader": "3-6 岁儿童",
  "l1_core": "一只小兔子在妈妈陪伴下，第一次感受夜晚世界的温柔，从害怕黑夜到愿意安静入睡。",
  "l0_world": "森林里的小动物世界。夜晚不是危险的地方，而是月亮、星星、风、草叶和妈妈轻声说话的地方。",
  "current_season_l2": "第 1 章：第一次看月亮；第 2 章：第一次听风；第 3 章：第一次闻夜里的花；第 4 章：第一次摸露珠；第 5 章：第一次听雨入睡。",
  "project_rules": ["语言温柔、低刺激", "每章只聚焦一个感官体验", "必须有妈妈陪伴", "结尾要让孩子感到安全"],
  "forbidden": ["恐怖元素", "死亡", "复杂讽刺", "成人化比喻", "强说教"],
  "style_rules": {
    "tone": "温柔、安静、像妈妈睡前轻声讲的故事",
    "must_have": ["具体的视觉和声音描写", "至少一处妈妈和小兔子的对白", "妈妈拥抱", "安全感结尾"],
    "anti_patterns": ["说教", "惊吓", "复杂隐喻", "段落过长", "成人化情绪"]
  }
}
```

**chapter_writer 生成的章节样本（实测，5.0s / 595 中文字）：**

> 傍晚的时候，森林慢慢安静下来。
> 小兔子却还睁着眼睛，趴在窗边，不肯去睡觉。
>
> "天黑了，森林会不会变得好大好大呀？"它小声问。
>
> 妈妈弯下身，轻轻摸了摸它的耳朵，笑着说："不会呀，妈妈陪你一起看。"
>
> 小兔子眨眨眼，跟着妈妈走出小屋。
> 草坡软软的，像一张铺好的小毯子。它们一步一步往上走，脚边的草叶轻轻晃动，发出细细的声音。
>
> 天边还留着一点点淡淡的蓝色。
> 一颗星星亮了起来。
> 又一颗。
> 再一颗。
>
> 小兔子抬起头，眼睛慢慢睁大了。
>
> "星星会发亮呢。"它轻轻说。
>
> "是呀，"妈妈说，"它们一颗一颗，来陪夜晚。"
>
> 小兔子继续往上看。
> 忽然，它看见了月亮。
>
> 月亮圆圆的，亮亮的，安安静静地挂在天上。
> 它不像白天的太阳那样热，也不刺眼，只是柔柔地亮着，像在轻轻照着森林。
>
> 小兔子第一次这么认真地看月亮，连呼吸都变轻了。
>
> "妈妈，月亮好漂亮呀。"它小声说。
>
> 妈妈把它抱进怀里，抱得稳稳的，暖暖的。
> "对呀，"妈妈在它耳边轻声说，"月亮像一盏挂在天上的小夜灯，陪小兔子睡觉呢。"
>
> 小兔子靠在妈妈怀里，听着妈妈慢慢的呼吸声。
> 它觉得草坡不高，森林也没有那么大了。
> 天上的月亮一闪一闪，像在说晚安。
>
> 小兔子的眼皮开始变得软软的。
> 它不再想东想西，只想安安静静地待在妈妈怀里。
>
> 这时候，远处忽然吹来一阵轻轻的风，穿过树叶，发出沙沙、沙沙的声音。

- 完成 beats：傍晚 → 草坡 → 星星一颗颗亮 → 看月亮 → 妈妈抱 → 风吹树叶（章末钩子）
- 落实 must_have：视觉/声音描写 + 妈妈拥抱 + 安全感结尾 + 多次对白
- 全部遵守 forbidden：无恐怖、无死亡、无复杂隐喻、无说教

---

### 示例 2：星际网约车 s1-ch3《五星诅咒》 — 成人讽刺科幻寓言（含 Gemini 结构审计）

**项目设定（调用方传入的关键字段）：**
```json
{
  "project_name": "星际网约车",
  "genre": "星际科幻 / 动物拟人 / 现实讽刺喜剧",
  "target_reader": "成人或青年读者",
  "l1_core": "一个下岗转行的中年土狗旺财，因为厂子倒闭背上飞船贷款，必须没日没夜接单养活一家老小；他慢慢发现，真正困住自己的不是那笔债，而是一套把每个司机都碾成数据的派单系统。",
  "l0_world": "星际大开发退潮后，普通动物在霓虹星港靠平台打零工生存。网约车变成星际出租飞船，平台叫天爪出行。角色全部是拟人动物。",
  "series_l2": "5 季：越拼越困 → 算法即命运 → 尊严的标价 → 抱团取暖 → 守住人味",
  "current_season_l2": "第 1 季：旺财从相信多劳多得，到发现评分权力对司机生存的压迫",
  "project_rules": ["角色全部是拟人动物，不出现真人", "每章冲突必须映射一个现实网约车痛点", "喜剧是外壳，悲剧是后劲", "主角旺财不能突然觉醒成英雄"],
  "forbidden": ["直接复刻真实新闻", "说教", "纯苦情控诉", "纯段子堆砌", "强行爽文逆袭"],
  "chapter": 3,
  "chapter_title": "五星诅咒",
  "style_rules": {
    "tone": "周星驰式喜剧外壳 + 悲剧内核",
    "must_have": ["动作型笑点", "具体道具", "现实网约车痛点的星际化转译", "悲剧后劲", "章末钩子必须落在评分降权"],
    "anti_patterns": ["说教", "新闻复刻", "纯苦情", "纯段子", "结尾喊口号", "主角突然高尚觉醒"]
  }
}
```

**chapter_writer 生成的章节精选（实测，25.8s / 3710 中文字）：**

> 老猫那句话像一颗没拧紧的螺丝，刚卡进旺财脑子里，下一秒，提示音就"叮"地一下响了，响得像谁在他耳朵里踢了一脚小铜锣。
>
> 旺财低头看终端，屏幕上滚出一行字：**新单已派发，请尽快接驾。**
>
> 他一边抖着尾巴，一边把刚才那点酸气咽回去，心里还在想：老猫说得对，挣钱哪有不挨刀的？可他没想到，这把刀不是砍在肉上，是直接顺着评分表往下削。
>
> 自从首单到账被平台抽得只剩骨头，旺财就像突然开了窍——不是开悟那种，是被现实拿拖鞋拍醒的那种。他发现，天爪出行最厉害的地方，不是飞得快，也不是单子多，而是它会在你刚觉得自己还有点尊严的时候，轻轻在后台把尊严折成一张优惠券。
>
> 评分，就是那张券。
>
> 旺财以前只知道"好评有奖励"，现在才懂，评分这东西像星港里最毒的那种无味冷气：看不见，摸不着，但会慢慢把你吹成一根会动的肉条。
>
> ……[中间：旺财把飞船擦得像迎宾馆 + 薄荷喷雾 + 微笑训练 + 尾巴装马达 + "地毯要是能五星我也铺" + 孔雀嫌旧/嫌音乐/嫌尾巴 + 旺财递午饭喂虫 + "服务还行吧" 虚晃一枪]……
>
> "哎呀，"孔雀拖长了声，"这座椅……有点旧呢。"
>
> 旺财连忙笑："旧是旧了点，但坐着特别有岁月感。"
>
> 孔雀抬起眼梢："我不缺岁月。"
>
> 旺财的笑容僵了一下，还是把后半句吞回去。它本来想说"但很稳"，可一想到自己这飞船昨天刚换过减震胶垫，硬是把"稳"字咽成了一口气。
>
> 孔雀又伸出羽冠般的指尖，在空中点了点："还有这音乐，什么风格？像港口保税区凌晨四点的清仓特卖。"
>
> 旺财赶紧切歌，手忙脚乱地在屏幕上划了三次，最后不小心点到一首星际民谣，里面的口琴一出来，孔雀脸上那层礼貌的笑差点裂开。
>
> "算了。"孔雀优雅地叹气，"我今天赶时间，不跟你计较。"
>
> 旺财如蒙大赦，立刻把音量调到几乎听不见，像一只怕惊扰神明的土狗。可他越小心，越显得自己像个不会呼吸的人。他想起老猫说的话，脑子里却只剩一个念头：只要它满意，五星就行。
>
> ……[中间：旺财一路低声下气 + 压速度如踩玻璃渣 + 把便当递给孔雀宠物小虫 + 孔雀下车前笑眯眯说"还行吧"]……
>
> **乘客评价：2星。**
> **评价理由：服务态度过于热情，疑似打扰乘客安静。**
>
> 旺财愣住了，像被人当胸塞进一只冻硬的石榴。
>
> 他眨了眨眼，又眨了一下，仿佛多眨两次，评分就能自动改口。可屏幕上那两颗星像两粒嘲笑他的硬糖，怎么都不肯融化。
>
> 紧接着，平台提示又跳出来，字比刚才还白，像一张病历单：
>
> **您的综合评分已下降。**
> **优质订单权限暂时关闭。**
> **请继续提升服务质量。**
>
> 旺财盯着那句"请继续提升服务质量"，半天没动。
>
> 车厢里那股薄荷味还在，冷冷的，像是刚刚演完一场高级服务的幻觉。地垫是新的，纸巾盒摆正了，水瓶还没开封，热毛巾也还整整齐齐。可它们都没用。它们像一群认真排练过的群众演员，最后被一句差评全数撤场。
>
> 旺财慢慢坐回驾驶位，尾巴垂在地上，动也不动。他想笑一下，没笑出来；想骂一句，也没力气。他只觉得刚才自己那一整路的弯腰、放低、赔笑、递饭，像是在给某个看不见的评分机器鞠躬。鞠到最后，机器抬了一下眼皮，顺手把他往更低处压了压。
>
> 老猫在不远处的车位上抽着烟，烟头在昏暗里一亮一暗。他早就看见了，却没走过来，只隔着一层车窗，看着旺财像一块被平台洗得发白的抹布。
>
> 旺财低头看着那条"优质订单权限暂时关闭"，喉咙里发紧，半晌才挤出一句几乎听不见的话：
>
> "我……是不是太吵了？"
>
> 屏幕没有回答。
>
> 只有远处港口广播继续机械地播报下一批派单，声音温柔得像在邀请，实际上每个字都像扣款通知。

- 完成 beats：旺财猛擦飞船 → 薄荷喷雾 → 微笑训练 → 孔雀嫌旧/音乐/尾巴 → 旺财递午饭喂虫 → 孔雀笑说"还行" → 2 星差评弹出 → 优质订单权限关闭
- 承接上章钩子：开头"老猫那句话像一颗没拧紧的螺丝"（呼应上一章"你以为挣的是你的？"）
- 章末钩子落地：评分下降 + 优质订单关闭 + 老猫在远处抽烟旁观 + 港口广播像扣款通知
- 喜剧外壳：薄荷喷雾喷到打喷嚏 / 尾巴装马达 / 星际民谣口琴 / 贵宾订单像挂金牌
- 悲剧内核：玉米饼被喂虫 / 地毯隐喻 / "请继续提升服务质量" / "服务态度过于热情 疑似打扰乘客安静"

**structure_auditor 报告（实测，Gemini 42.3s / score 6.5 / pass=false）：**
```json
{
  "p0": [
    "第3段（'他一边抖着尾巴……'）：章间承接台词错位。上一章结尾预设的老猫台词是'你以为挣的是你的？'，但本段旺财内心回想的却是'老猫说得对，挣钱哪有不挨刀的？'。两者概念未对齐（前者指向平台剥夺，后者指向服务受气），未能严丝合缝地承接上一章留下的悬念。",
    "第23-25段（'看见副驾驶前的一个小餐盒……指了指便当旁边那只小虫宠物'）：物品空间位置跳变。旺财的便当在副驾驶，而孔雀的宠物小虫'趴在它的丝绒包上'。前文未交代孔雀坐在副驾驶，或将自己的丝绒包放在了副驾驶。如果孔雀坐在后排，宠物包和副驾驶的便当不可能在同一空间相邻，缺乏合理的动线交代。",
    "第37段（'老猫在不远处的车位上抽着烟……'）：角色地理位置瞬移。旺财刚刚把孔雀送到目的地完成订单，此时老猫却出现在'不远处的车位上'并目睹一切。老猫原本在接单前的起点（前一章的地点），不可能瞬间瞬移到孔雀的下车地点，存在严重的地理逻辑断裂。"
  ],
  "p1": [
    "第12段（'再来，牙不要露太多……'）：喜剧外壳的动作笑点可进一步强化。旺财强行控制尾巴不晃的描写很好，建议在后续驾驶过程中（如第21段压速度时），增加更多'强行压抑狗类本能'的肢体滑稽感（如想吐舌头散热却为了高级感硬憋着），以放大周星驰式'越努力越心酸'的喜剧效果。",
    "第27段（'孔雀接过来，随手掀开……'）：阶级差距的现实讽刺可加码。孔雀拿旺财的午饭喂虫子时，可以增加一句孔雀对玉米饼的荒诞评价（例如：'这种粗劣的碳水刚好给宠物磨牙'），把平台规则下乘客权力极度膨胀的讽刺感推向极致。"
  ],
  "score": 6.5,
  "pass": false,
  "summary": "章节核心痛点和情绪弧光传达准确，章末钩子符合预设，但存在严重的物品与角色'瞬移'空间漏洞，且开头未能精准承接上一章的台词伏笔。"
}
```

> **审计员的 3 个 P0 不是 bug** — 它准确指出真实可修订的空间问题（章间承接、物品位置、角色瞬移），给 reviser 提供明确可执行的修订清单。这是 Gemini 在长上下文结构审查能力的实战证据。章节得分 6.5 而非 9.5，正是因为审计员**没放水**。

---

### 示例 3：雨夜便利店 — 成人悬疑短篇开篇

**项目设定（调用方传入的关键字段）：**
```json
{
  "project_name": "雨夜便利店",
  "genre": "成人悬疑短篇 / 都市心理惊悚",
  "target_reader": "成人读者",
  "l1_core": "一个夜班便利店店员在暴雨夜接待一位神秘客人，逐渐发现对方可能与三年前一起失踪案有关，而自己也并非局外人。",
  "l0_world": "故事发生在一座南方小城的深夜便利店。暴雨、停电、旧监控、临期便当、公交末班车构成主要环境。故事没有超自然元素，一切悬疑都应有现实解释。",
  "series_l2": "4 章：建立雨夜 → 制造疑点 → 揭示店员与失踪案关系 → 反转（真相是被压抑的罪责回返）",
  "project_rules": ["没有超自然元素", "悬疑来自信息差和心理压迫", "每章必须留下一个明确但不解释的疑点", "人物对白要克制", "场景细节必须服务悬疑"],
  "forbidden": ["鬼魂", "梦境解释一切", "突然出现警方长篇说明", "过度血腥", "强行反转"],
  "chapter": 1,
  "chapter_title": "雨夜来客",
  "style_rules": {
    "tone": "冷峻、克制、雨夜压迫感强",
    "must_have": ["雨声", "便利店白光", "停产薄荷糖", "旧监控", "章末疑点"],
    "anti_patterns": ["鬼故事化", "解释过早", "过度煽情", "血腥猎奇", "主角内心独白过多"]
  }
}
```

**chapter_writer 生成的章节样本（实测，20.9s / 2565 中文字）：**

> 雨下到后半夜，像有人在屋顶上倒一整桶碎玻璃。
>
> 便利店门口那块褪了色的灯箱牌子被风吹得轻轻晃，白光忽明忽暗，照得玻璃门上的水痕像一层不断移动的皮。阿诚站在收银台后，手里捏着一支圆珠笔，笔尖在记账本上停了很久，最后只划出一道歪斜的黑线。
>
> 店里太安静了。冷柜低低地嗡着，风幕机早坏了，门缝里不断渗进潮气。墙角那台老收音机开着，声音被雨和电流切得断断续续。
>
> "……本台继续播报，关于三年前'临江路失踪案'的市民纪念活动将于明日举行。主办方提醒——"
>
> 电流沙沙一响，后半句被吞掉，像有人把话硬生生掐断。阿诚抬眼看向收音机，伸手去拧音量旋钮，信号却忽强忽弱，重新冒出来的只有一句残缺的尾音：
>
> "……请勿在雨天靠近旧码头一带……"
>
> 他没再听。三年前那起失踪案，店里总会被人提起，像一块没法彻底揭过去的脏布。每到这种下雨的夜里，收音机里、电视里、甚至路人的话头里，都会绕回去。绕回那几个没找到的人名，绕回那条靠江的老街。
>
> 玻璃门外忽然闪过一道车灯。
>
> 阿诚下意识抬头，见一团深色的人影停在门口。对方穿着一件旧雨衣，帽檐压得很低，雨水顺着衣角往下滴，落在门前的地垫上，积出一小片暗色。
>
> 门上的感应器"嘀"了一声。
>
> 那人推门进来，带进一阵浓重的湿冷。便利店里那点白光立刻把他的轮廓照得很硬：雨衣很旧，像洗过很多次，袖口发白，鞋边沾着泥。脸却看不太清，只能看见下巴和一点被帽檐遮住的鼻梁。
>
> 阿诚站直了些，习惯性地问："要买什么？"
>
> 对方没有立刻答，只把目光慢慢扫过货架，像是在找一个早就知道位置的东西。
>
> "有薄荷糖吗？"他问。
>
> 声音不高，听起来平静，甚至有点疲。可阿诚还是不由自主地皱了一下眉。
>
> "哪一种？"
>
> "蓝色小盒的。"对方说，"以前放在收银台旁边。"
>
> 阿诚的手指在柜台边缘停住了。他知道那是什么。那款糖盒很小，金属蓝的外壳，薄荷味很冲，进价不高，很多年前就常被夜班司机和抽烟的人顺手拿走。可那一批，三年前就停产了。公司倒了，剩下的货也早卖空，连补货单都没再见过。
>
> "没有了。"阿诚说，"那种三年前就不生产了。"
>
> 对方似乎并不意外，只是轻轻"嗯"了一声。
>
> 过了两秒，他又说："你以前也是这么说的。"
>
> 阿诚抬眼看向他。
>
> 雨衣客人仍旧站在原地，双手垂在身侧，没有急着去看别的商品，也没有表现出任何尴尬。他像是只在确认一件事：这家店还在，这张脸是不是也还在。
>
> 阿诚压着声音："我们认识？"
>
> "也许吧。"对方说，"我上次来这里，还有。"
>
> 这句话落下时，店里冷柜的嗡鸣忽然显得格外清楚。阿诚盯着他，试图从那被帽檐遮住的半张脸里找出一点熟悉的轮廓。没有。至少他现在想不起来。
>
> 可那人话里的语气让他后背慢慢起了一层不舒服的紧绷。
>
> "你记错了。"阿诚说。
>
> "可能。"对方没有争辩，只抬手指了指货架，"再找找。"
>
> ……[中间：阿诚翻货架确认停产 + "你记性一直不太好" + 白光下冷白无温度 + 阿诚想看监控]……
>
> 就在这时，灯灭了。
>
> 不是慢慢变暗，是一下子全黑下去，像有人把整间店的电源直接掐断。收银台的屏幕暗掉，冷柜停了，收音机也断了声。黑暗只维持了半秒，备用照明随即亮起，惨淡的应急灯从天花板角落里投下一层灰白的光，勉强照出货架的边沿。
>
> 阿诚心口猛地一沉。
>
> "停电了。"他说，更多像是说给自己听。
>
> 对面的客人没有动。旧雨衣在应急灯下泛着发霉似的暗光，像一张湿透的皮。
>
> "总这样吗？"他问。
>
> "偶尔。"阿诚伸手去摸柜台下面的电闸盒，指尖碰到冰凉的铁皮。他知道这个时候不能慌，先看总闸，再看后备电源——可他还没来得及打开，墙角那台旧监控显示器忽然自己亮了。

- 完成 beats：暴雨夜值班 → 收音机播报失踪案 → 旧雨衣客人进店 → 只找停产薄荷糖 → "你以前也是这么说的" → 突然停电 → 备用监控自动亮起
- 冷峻风格落实：雨声如碎玻璃 / 白光忽明忽暗 / 冷柜低嗡 / 收音机断断续续 / 应急灯灰白光
- 章末钩子落地：旧监控显示器自己亮起 + 备用电源 — 屏幕里将出现"三年前同一个客人站在柜台前的画面"
- 全部遵守 forbidden：无鬼魂、无梦境解释、无长篇说明、无血腥

---

**结论**：3 个完全不同题材（3-6 岁儿童睡前 / 成人讽刺科幻寓言 / 成人悬疑短篇）走的是**完全相同的 4 个 agent**，仅通过 `project_context` + `style_rules` 切换输出。MCP Server 不内置任何固定审美或题材假设 — 题材、读者年龄、风格、世界观、禁区、章末钩子全部由调用方在每次任务中传入。

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
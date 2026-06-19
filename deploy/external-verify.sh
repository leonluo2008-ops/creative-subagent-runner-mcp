#!/usr/bin/env bash
# =====================================================================
# external-verify.sh — 在外部网络环境验证 MCP server 公网可达
#
# 使用方法 (在另一台机器上):
#   1. 把这个脚本和 _verify-parse.py 一起拷过去 (或在 clone 后用 ./external-verify.sh)
#   2. 设置两个变量:
#        export MCP_PUBLIC_URL=https://mcp.your-domain.com
#        export MCP_AUTH_TOKEN=<your-token>
#   3. 跑 ./external-verify.sh
#
# 预期结果:
#   - healthz 返回 {"status":"ok"}
#   - /mcp tools/list 返回 3 个工具
#   - run_subagent 在 3 个不同题材 (儿童睡前 / 成人讽刺科幻 / 成人悬疑) 上都能返回真实章节正文
#   - 证明 MCP server 是"通用写作子 agent runner",不是儿童故事专用工具
# =====================================================================

set -e

SCRIPT_DIR="${BASH_SOURCE%/*}"
PARSER="$SCRIPT_DIR/_verify-parse.py"

if [ ! -f "$PARSER" ]; then
  echo "❌ 找不到解析器: $PARSER"
  echo "   请把 _verify-parse.py 跟 external-verify.sh 放同一个目录"
  exit 1
fi

if [ -z "$MCP_PUBLIC_URL" ] || [ -z "$MCP_AUTH_TOKEN" ]; then
  echo "❌ 必须设置环境变量:"
  echo "   export MCP_PUBLIC_URL=https://mcp.your-domain.com"
  echo "   export MCP_AUTH_TOKEN=<your-token>"
  exit 1
fi

BASE="$MCP_PUBLIC_URL"
TOKEN="$MCP_AUTH_TOKEN"
TS="$(date +%s)"

echo "================================================================"
echo "external-verify.sh — 3 题材串行验证 (通用写作子 agent runner)"
echo "   target: $BASE"
echo "================================================================"

echo ""
echo "=== 1. /healthz (无鉴权) ==="
curl -sS --max-time 10 -w "\n[HTTP %{http_code}, %{time_total}s]\n" "$BASE/healthz"

echo ""
echo "=== 2. /mcp tools/list (带鉴权) ==="
curl -sS --max-time 15 -X POST "$BASE/mcp" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
  | grep "^data: " | head -1 | sed 's/^data: //' \
  | python3 -m json.tool 2>&1 | head -20


# ============================================================
# 题材 1: 小兔子的晚安世界
# ============================================================
echo ""
echo "================================================================"
echo "=== 31. 题材 1 — 小兔子的晚安世界 (3-6 岁儿童睡前) ==="
echo "================================================================"
PAYLOAD_1='{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "run_subagent", "arguments": {"role": "chapter_writer", "task_id": "verify-1-rabbit-bedtime", "project_context": {"project_name": "小兔子的晚安世界", "genre": "儿童睡前故事", "target_reader": "3-6 岁儿童", "l1_core": "一只小兔子在妈妈陪伴下，第一次感受夜晚世界的温柔，从害怕黑夜到愿意安静入睡。", "l0_world": "森林里的小动物世界。夜晚不是危险的地方，而是月亮、星星、风、草叶和妈妈轻声说话的地方。", "series_l2": "第一季围绕小兔子的感官初体验展开：看月亮、听风、闻花香、摸露珠、听雨声。", "current_season_l2": "第 1 章：第一次看月亮；第 2 章：第一次听风；第 3 章：第一次闻夜里的花。", "project_rules": ["语言温柔、低刺激", "每章只聚焦一个感官体验", "必须有妈妈陪伴"], "forbidden": ["恐怖元素", "死亡", "复杂讽刺", "成人化比喻"]}, "chapter_context": {"season": 1, "chapter": 1, "chapter_title": "小兔子第一次看月亮", "chapter_beats": "傍晚，小兔子不想睡觉，觉得天黑以后森林会变得很大；妈妈带它走到草坡上；星星一颗一颗亮起来；小兔子第一次认真看见月亮；妈妈告诉它月亮像一盏挂在天上的小夜灯；小兔子靠在妈妈怀里安静下来；远处一阵轻轻的风吹过树叶，作为下一章钩子。", "previous_chapter_tail": "", "next_chapter_hook": "远处，一阵轻轻的风吹过来，树叶沙沙响。"}, "style_rules": {"tone": "温柔、安静、像妈妈睡前轻声讲的故事", "must_have": ["具体的视觉和声音描写", "至少一处妈妈和小兔子的对白", "妈妈拥抱", "安全感结尾"], "anti_patterns": ["说教", "惊吓", "复杂隐喻", "段落过长", "成人化情绪"]}, "output_contract": {"format": "markdown", "word_count": "500-700", "language": "zh-CN"}}}, "id": 3}'

curl -sS --max-time 60 -X POST "$BASE/mcp" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "$PAYLOAD_1" \
  | grep "^data: " | head -1 | sed 's/^data: //' \
  | python3 "$PARSER"

# ============================================================
# 题材 2: 星际网约车 s1-ch3
# ============================================================
echo ""
echo "================================================================"
echo "=== 32. 题材 2 — 星际网约车 s1-ch3 (成人讽刺科幻寓言) ==="
echo "================================================================"
PAYLOAD_2='{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "run_subagent", "arguments": {"role": "chapter_writer", "task_id": "verify-2-space-rideshare-ch03", "project_context": {"project_name": "星际网约车", "genre": "星际科幻 / 动物拟人 / 现实讽刺喜剧", "target_reader": "成人或青年读者", "l1_core": "一个下岗转行的中年土狗旺财，因为厂子倒闭背上飞船贷款，必须没日没夜接单养活一家老小；他慢慢发现，真正困住自己的不是那笔债，而是一套把每个司机都碾成数据的派单系统。", "l0_world": "星际大开发退潮后，普通动物在霓虹星港靠平台打零工生存。网约车变成星际出租飞船，平台叫天爪出行。角色全部是拟人动物。", "series_l2": "5 季：越拼越困 → 算法即命运 → 尊严的标价 → 抱团取暖 → 守住人味", "current_season_l2": "第 1 季：旺财从相信多劳多得，到发现评分权力对司机生存的压迫", "project_rules": ["角色全部是拟人动物，不出现真人", "每章冲突必须映射一个现实网约车痛点", "喜剧是外壳，悲剧是后劲"], "forbidden": ["直接复刻真实新闻", "说教", "纯苦情控诉", "强行爽文逆袭"]}, "chapter_context": {"season": 1, "chapter": 3, "chapter_title": "五星诅咒", "chapter_beats": "旺财发现评分会影响派单，于是开始把飞船收拾得像迎宾馆：薄荷喷雾、免费水、微笑训练；一只孔雀乘客上船，嫌座椅旧、嫌音乐土、嫌旺财尾巴晃得不高级；老猫提醒旺财别把自己当地毯，旺财却说地毯要是能五星他也铺；旺财一路低声下气，甚至把自己的午饭递给孔雀的宠物小虫；孔雀下车前笑眯眯说还行吧，旺财以为稳了；差评弹出，理由是服务态度过于热情，疑似打扰乘客安静；系统提示评分下降，优质订单权限暂时关闭。", "previous_chapter_tail": "老猫看着旺财慢悠悠地说：你以为挣的是你的？下一单提示音又响了。", "next_chapter_hook": "一个差评把旺财的派单降权。"}, "style_rules": {"tone": "周星驰式喜剧外壳 + 悲剧内核", "must_have": ["动作型笑点", "具体道具", "现实网约车痛点的星际化转译", "悲剧后劲", "章末钩子必须落在评分降权"], "anti_patterns": ["说教", "新闻复刻", "纯苦情", "纯段子", "结尾喊口号", "主角突然高尚觉醒"]}, "output_contract": {"format": "markdown", "word_count": "1800-2500", "language": "zh-CN"}}}, "id": 4}'

curl -sS --max-time 120 -X POST "$BASE/mcp" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "$PAYLOAD_2" \
  | grep "^data: " | head -1 | sed 's/^data: //' \
  | python3 "$PARSER"

# ============================================================
# 题材 3: 雨夜便利店
# ============================================================
echo ""
echo "================================================================"
echo "=== 33. 题材 3 — 雨夜便利店 (成人悬疑短篇) ==="
echo "================================================================"
PAYLOAD_3='{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "run_subagent", "arguments": {"role": "chapter_writer", "task_id": "verify-3-rain-night-store", "project_context": {"project_name": "雨夜便利店", "genre": "成人悬疑短篇 / 都市心理惊悚", "target_reader": "成人读者", "l1_core": "一个夜班便利店店员在暴雨夜接待一位神秘客人，逐渐发现对方可能与三年前一起失踪案有关，而自己也并非局外人。", "l0_world": "故事发生在一座南方小城的深夜便利店。暴雨、停电、旧监控、临期便当、公交末班车构成主要环境。故事没有超自然元素，一切悬疑都应有现实解释。", "series_l2": "短篇结构：建立雨夜 → 制造疑点 → 揭示店员与失踪案关系 → 反转", "current_season_l2": "第 1 章：雨夜来客", "project_rules": ["没有超自然元素", "悬疑来自信息差和心理压迫", "每章必须留下一个明确但不解释的疑点"], "forbidden": ["鬼魂", "梦境解释一切", "突然出现警方长篇说明", "过度血腥", "强行反转"]}, "chapter_context": {"season": 1, "chapter": 1, "chapter_title": "雨夜来客", "chapter_beats": "暴雨夜，阿诚独自在便利店值班；收音机信号断断续续播报三年前失踪案纪念新闻；一个穿旧雨衣的客人进店；客人不买伞、不买热饮，只找一盒已经停产的薄荷糖；阿诚说这种糖三年前就没有了；客人说他上次来这里还有；阿诚感到不安；店里突然停电；备用监控自动亮起，屏幕里出现三年前同一个客人站在柜台前的画面。", "previous_chapter_tail": "", "next_chapter_hook": "备用监控画面显示，三年前的那个雨夜，站在柜台后的不是阿诚，而是一个已经失踪的女孩。"}, "style_rules": {"tone": "冷峻、克制、雨夜压迫感强", "must_have": ["雨声", "便利店白光", "停产薄荷糖", "旧监控", "章末疑点"], "anti_patterns": ["鬼故事化", "解释过早", "过度煽情", "血腥猎奇", "主角内心独白过多"]}, "output_contract": {"format": "markdown", "word_count": "1200-1800", "language": "zh-CN"}}}, "id": 5}'

curl -sS --max-time 120 -X POST "$BASE/mcp" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "$PAYLOAD_3" \
  | grep "^data: " | head -1 | sed 's/^data: //' \
  | python3 "$PARSER"

echo ""
echo "================================================================"
echo "✅ external-verify.sh 全部完成"
echo "   3 个不同题材 (儿童睡前 / 成人讽刺科幻 / 成人悬疑) 都能跑通"
echo "   MCP server 是通用写作子 agent runner, 儿童故事只是验证题材之一"
echo "================================================================"

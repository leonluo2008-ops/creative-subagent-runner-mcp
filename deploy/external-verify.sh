#!/usr/bin/env bash
# =====================================================================
# external-verify.sh — 在外部网络环境验证 MCP server 公网可达
#
# 使用方法 (在另一台机器上):
#   1. 把这个脚本和 _verify-parse.py 一起拷过去 (或在 clone 后用 ./external-verify.sh)
#   2. 设置两个变量:
#        export MCP_PUBLIC_URL=https://mcp.your-domain.com
#        export MCP_AUTH_TOKEN=***   3. 跑 ./external-verify.sh
#
# 预期结果:
#   - healthz 返回 {"status":"ok"}
#   - /mcp tools/list 返回 3 个工具
#   - run_subagent 在 3 个不同题材 (儿童睡前 / 成人讽刺 / 科幻) 上都能返回真实章节正文
#   - 证明 MCP server 是"通用写作子 agent runner",不是儿童故事专用工具
# =====================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
# 题材 A: 3-6 岁儿童睡前故事
# ============================================================
echo ""
echo "================================================================"
echo "=== 3A. 题材 A — 3-6 岁儿童睡前故事 ==="
echo "================================================================"
PAYLOAD_A='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"run_subagent","arguments":{"role":"chapter_writer","task_id":"verify-A-'"$TS"'","project_context":{"l1_core":"小兔子第一次看月亮","l0_world":"森林小动物的世界","series_l2":"感官初体验","current_season_l2":"第1季: 看月亮听风闻花","target_reader":"3-6岁"},"chapter_context":{"chapter_title":"小兔子第一次看月亮","chapter_beats":"傍晚到草坡 -> 星星出来 -> 第一次看月亮 -> 妈妈拥抱 -> 安静"},"style_rules":{"tone":"温柔安静如童谣","anti_patterns":["说教","恐怖"]},"output_contract":{"format":"markdown","word_count":"200-400","language":"zh-CN"}}},"id":3}'

curl -sS --max-time 60 -X POST "$BASE/mcp" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "$PAYLOAD_A" \
  | grep "^data: " | head -1 | sed 's/^data: //' \
  | python3 "$PARSER"

# ============================================================
# 题材 B: 成人现实讽刺短篇
# ============================================================
echo ""
echo "================================================================"
echo "=== 3B. 题材 B — 成人现实讽刺短篇 ==="
echo "================================================================"
PAYLOAD_B='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"run_subagent","arguments":{"role":"chapter_writer","task_id":"verify-B-'"$TS"'","project_context":{"l1_core":"小城公务员发现一封 1998 年的举报信，举报对象是他自己","l0_world":"中国北方某五线县城，2020 年代","series_l2":"中国县城浮世绘（短篇讽刺集）","current_season_l2":"举报信卷：每篇聚焦一封改变命运的旧信","target_reader":"30-45 岁男性"},"chapter_context":{"chapter_title":"抽屉里的信","chapter_beats":"开旧抽屉 -> 举报信掉落 -> 笔迹认出 -> 报告人是师父 -> 打电话被挂"},"style_rules":{"tone":"周星驰式喜剧外壳 + 悲剧内核","narration":"第三人称冷叙述","must_have":["动作型笑点","现实映射","悲剧后劲"],"anti_patterns":["说教","新闻复刻","纯苦情","正能量口号"]},"output_contract":{"format":"markdown","word_count":"200-400","language":"zh-CN"}}},"id":4}'

curl -sS --max-time 60 -X POST "$BASE/mcp" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "$PAYLOAD_B" \
  | grep "^data: " | head -1 | sed 's/^data: //' \
  | python3 "$PARSER"

# ============================================================
# 题材 C: 科幻系列剧本
# ============================================================
echo ""
echo "================================================================"
echo "=== 3C. 题材 C — 科幻系列剧本 ==="
echo "================================================================"
PAYLOAD_C='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"run_subagent","arguments":{"role":"chapter_writer","task_id":"verify-C-'"$TS"'","project_context":{"l1_core":"2187 年，人类发现月球背面埋着 1.2 亿年前的非地球造物","l0_world":"近未来硬科幻，遵守现有物理定律","series_l2":"《月背纪事》5 季","current_season_l2":"第 1 季：发现 → 接触 → 代价"},"chapter_context":{"chapter":3,"chapter_title":"硅基样本","chapter_beats":"取样 -> 样本异常活跃 -> 触发休眠协议 -> 主角被停职 -> 章末主角偷走样本","next_chapter_hook":"第 4 章：样本在主角家中开始唱歌"},"style_rules":{"tone":"硬科幻 + 冷峻 + 学术化对白","must_have":["物理自洽","机构政治","角色专业背景"],"anti_patterns":["玄学","超能力","AI 觉醒陈词滥调"]},"output_contract":{"format":"markdown","word_count":"200-400","language":"zh-CN"}}},"id":5}'

curl -sS --max-time 60 -X POST "$BASE/mcp" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "$PAYLOAD_C" \
  | grep "^data: " | head -1 | sed 's/^data: //' \
  | python3 "$PARSER"

echo ""
echo "================================================================"
echo "✅ external-verify.sh 全部完成"
echo "   3 个不同题材 (儿童睡前 / 成人讽刺 / 科幻) 都能跑通"
echo "   MCP server 是通用写作子 agent runner, 儿童故事只是验证题材之一"
echo "================================================================"

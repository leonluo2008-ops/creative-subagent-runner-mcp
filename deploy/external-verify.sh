#!/usr/bin/env bash
# =====================================================================
# external-verify.sh — 在外部网络环境验证 MCP server 公网可达
#
# 使用方法 (在另一台机器上):
#   1. 把这个脚本拷过去 (或直接 curl 下面的命令)
#   2. 设置两个变量:
#        export MCP_PUBLIC_URL=http://60.188.104.7:50255
#        export MCP_AUTH_TOKEN=<你的 MCP_AUTH_TOKEN>
#   3. 跑 ./external-verify.sh
#
# 预期结果:
#   - healthz 返回 {"status":"ok"}
#   - /mcp tools/list 返回 3 个工具
#   - run_subagent chapter_writer 能返回真实章节正文
# =====================================================================

set -e

if [ -z "$MCP_PUBLIC_URL" ] || [ -z "$MCP_AUTH_TOKEN" ]; then
  echo "❌ 必须设置环境变量:"
  echo "   export MCP_PUBLIC_URL=http://60.188.104.7:50255"
  echo "   export MCP_AUTH_TOKEN=<your-token>"
  exit 1
fi

BASE="$MCP_PUBLIC_URL"
TOKEN="$MCP_AUTH_TOKEN"

echo "================================================================"
echo "🌐 external-verify.sh"
echo "   target: $BASE"
echo "================================================================"

echo ""
echo "=== 1. /healthz (无鉴权) ==="
curl -sS --max-time 10 -w "\n[HTTP %{http_code}, %{time_total}s]\n" "$BASE/healthz"

echo ""
echo "=== 2. /mcp tools/list (带鉴权) ==="
curl -sS --max-time 15 -X POST "$BASE/mcp" \
  -H "Authorization: Bearer *** \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
  | grep "^data: " | head -1 | sed 's/^data: //' | python3 -m json.tool 2>&1 | head -20

echo ""
echo "=== 3. /mcp run_subagent chapter_writer (端到端) ==="
PAYLOAD='{"jsonrpc":"2.0","method":"tools/call","params":{"name":"run_subagent","arguments":{"role":"chapter_writer","task_id":"external-verify-'$(date +%s)'","project_context":{"l1_core":"小兔子第一次看月亮","l0_world":"森林小动物的世界","series_l2":"感官初体验","current_season_l2":"第1季: 看月亮听风闻花","target_reader":"3-6岁"},"chapter_context":{"chapter_title":"小兔子第一次看月亮","chapter_beats":"傍晚到草坡 -> 星星出来 -> 第一次看月亮 -> 妈妈拥抱 -> 安静"},"style_rules":{"tone":"温柔安静如童谣","anti_patterns":["说教","恐怖"]},"output_contract":{"format":"markdown","word_count":"200-300","language":"zh-CN"}}},"id":3}'

curl -sS --max-time 60 -X POST "$BASE/mcp" \
  -H "Authorization: Bearer *** \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "$PAYLOAD" \
  | grep "^data: " | head -1 | sed 's/^data: //' \
  | python3 -c "
import sys, json
data = json.loads(sys.stdin.read())
if 'error' in data:
    print('❌ Error:', data['error'])
    sys.exit(1)
result = json.loads(data['result']['content'][0]['text'])
print(f\"status:   {result.get('status')}\")
print(f\"provider: {result.get('provider')} / model: {result.get('model')}\")
print(f\"elapsed:  {result.get('elapsed_ms')}ms\")
print(f\"usage:    {result.get('usage', {})}\")
print()
print('📝 章节正文:')
print('-' * 60)
print(result.get('content', '(no content)'))
print('-' * 60)
"

echo ""
echo "================================================================"
echo "✅ external-verify.sh 全部完成"
echo "   如果 3 个测试都通过 → 旁路由映射正确，可给 Notion AI / 任何 MCP 客户端使用"
echo "================================================================"
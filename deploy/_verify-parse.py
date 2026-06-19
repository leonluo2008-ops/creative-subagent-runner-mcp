#!/usr/bin/env python3
"""通用 external-verify 的 JSON 解析器 (从 stdin 读 MCP data 行)"""
import sys, json

raw = sys.stdin.read().strip()
if not raw:
    print("❌ No data received")
    sys.exit(1)

try:
    data = json.loads(raw)
except json.JSONDecodeError as e:
    print(f"❌ JSON parse error: {e}")
    print(f"   raw: {raw[:300]}")
    sys.exit(1)

if "error" in data:
    print(f"❌ Error: {data['error']}")
    sys.exit(1)

text = data["result"]["content"][0]["text"]
try:
    result = json.loads(text)
except json.JSONDecodeError:
    print(text[:500])
    sys.exit(0)

print(f"  status:   {result.get('status')}")
print(f"  provider: {result.get('provider')} / model: {result.get('model')}")
print(f"  elapsed:  {result.get('elapsed_ms')}ms")
content = result.get("content", "")
print(f"  chars:    {len(content)}")
print()
print("章节正文(前 200 字):")
print("-" * 60)
print(content[:200] if content else "(no content)")
print("-" * 60)

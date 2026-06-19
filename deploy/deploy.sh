#!/usr/bin/env bash
# =====================================================================
# deploy.sh - 一键部署 / 重启 / 验证 MCP server
# 用法:
#   ./deploy.sh install   - 安装 systemd unit + 启动
#   ./deploy.sh restart   - 重启
#   ./deploy.sh stop      - 停止
#   ./deploy.sh status    - 查看状态
#   ./deploy.sh logs      - 最近 50 行日志
#   ./deploy.sh verify    - 验证 server 健康
#   ./deploy.sh uninstall - 卸载（保留代码）
# =====================================================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="creative-subagent-runner-mcp"
SERVICE_FILE="$PROJECT_DIR/deploy/${SERVICE_NAME}.service"
SYSTEMD_PATH="$HOME/.config/systemd/user/${SERVICE_NAME}.service"

# 用户 systemd (不需要 root)
SYSTEMCTL="systemctl --user"

cmd_install() {
  echo "==> 编译 TypeScript"
  cd "$PROJECT_DIR"
  npm run build

  echo "==> 确保 .env 存在"
  if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo "❌ .env 不存在，请先 cp .env.example .env 并填好 3 个 Key"
    exit 1
  fi
  chmod 600 "$PROJECT_DIR/.env"

  echo "==> 安装 systemd unit 到 $SYSTEMD_PATH"
  mkdir -p "$(dirname "$SYSTEMD_PATH")"
  cp "$SERVICE_FILE" "$SYSTEMD_PATH"
  systemctl --user daemon-reload
  systemctl --user enable "$SERVICE_NAME"
  systemctl --user restart "$SERVICE_NAME"

  sleep 2
  cmd_status
  echo ""
  echo "✅ 部署完成。Cloudflare Tunnel 配置请见 README §4.3"
}

cmd_restart() {
  echo "==> 重启 $SERVICE_NAME"
  systemctl --user restart "$SERVICE_NAME"
  sleep 2
  cmd_status
}

cmd_stop() {
  echo "==> 停止 $SERVICE_NAME"
  systemctl --user stop "$SERVICE_NAME"
}

cmd_status() {
  systemctl --user status "$SERVICE_NAME" --no-pager -l || true
  echo ""
  echo "==> 监听端口"
  ss -tlnp 2>/dev/null | grep ":3037" || echo "❌ 没在监听 3037"
}

cmd_logs() {
  journalctl --user -u "$SERVICE_NAME" -n 50 --no-pager
}

cmd_verify() {
  echo "==> 验证 server 健康 (本地 127.0.0.1:3037)"
  echo "--- /healthz (无鉴权) ---"
  curl -sS --max-time 5 http://127.0.0.1:3037/healthz | python3 -m json.tool

  echo ""
  echo "--- /mcp tools/list (带鉴权) ---"
  # 用 python 读 .env 避免 shell 引号问题
  TOKEN=$(python3 -c "import sys; sys.stdout.write([l.strip().split('=',1)[1] for l in open('$PROJECT_DIR/.env') if l.startswith('MCP_AUTH_TOKEN=')][0])")
  echo "Token 长度: ${#TOKEN}"
  curl -sS --max-time 10 -X POST http://127.0.0.1:3037/mcp \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
    | grep "^data: " | head -1 | sed 's/^data: //' | python3 -m json.tool 2>/dev/null || echo "(raw)"

  echo ""
  echo "--- /mcp health_check (带鉴权) ---"
  curl -sS --max-time 10 -X POST http://127.0.0.1:3037/mcp \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"health_check","arguments":{}},"id":2}' \
    | grep "^data: " | head -1 | sed 's/^data: //' | python3 -m json.tool 2>/dev/null || echo "(raw)"

  echo ""
  echo "--- 进程 ---"
  ps -ef | grep "dist/index.js" | grep -v grep || echo "(none)"
}

cmd_uninstall() {
  echo "==> 卸载 systemd unit"
  systemctl --user stop "$SERVICE_NAME" 2>/dev/null || true
  systemctl --user disable "$SERVICE_NAME" 2>/dev/null || true
  rm -f "$SYSTEMD_PATH"
  systemctl --user daemon-reload
  echo "✅ 已卸载（代码保留在 $PROJECT_DIR）"
}

case "${1:-}" in
  install)    cmd_install ;;
  restart)    cmd_restart ;;
  stop)       cmd_stop ;;
  status)     cmd_status ;;
  logs)       cmd_logs ;;
  verify)     cmd_verify ;;
  uninstall)  cmd_uninstall ;;
  *)
    echo "用法: $0 {install|restart|stop|status|logs|verify|uninstall}"
    exit 1
    ;;
esac
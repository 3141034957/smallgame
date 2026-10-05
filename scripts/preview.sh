#!/usr/bin/env bash
# Rebuild the client and restart the local preview server, so the game can be
# opened in a browser right after a change:
#   bash scripts/preview.sh          # http://localhost:3001
#   PORT=8080 bash scripts/preview.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-3001}"
LOG="${TMPDIR:-/tmp}/echo-garden-preview.log"

echo "▸ 编译前端…"
npm run build

if command -v lsof >/dev/null 2>&1; then
  OLD="$(lsof -ti "tcp:$PORT" || true)"
  [ -n "$OLD" ] && kill $OLD 2>/dev/null || true
fi

echo "▸ 启动预览服务 :$PORT"
nohup env PORT="$PORT" node server/index.mjs > "$LOG" 2>&1 &
disown 2>/dev/null || true

for _ in $(seq 1 30); do
  if curl -sf -o /dev/null "http://127.0.0.1:$PORT/"; then
    LAN="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
    echo "✓ 本机预览： http://localhost:$PORT/"
    [ -n "$LAN" ] && echo "✓ 同网手机： http://$LAN:$PORT/"
    echo "  日志：$LOG"
    exit 0
  fi
  sleep 0.4
done

echo "✗ 服务未就绪，查看日志：$LOG"
tail -n 10 "$LOG"
exit 1

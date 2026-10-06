#!/usr/bin/env bash
# Supervisor for hosts without systemd (containers, EAP dev boxes).
# Keeps the game server alive: restarts it when it exits, and stops it cleanly
# when the supervisor itself is terminated. Invoked by scripts/game-service.sh,
# but it can also be run by hand for debugging:
#   GAME_ROOT=/home/ubuntu/smallgame GAME_NODE=$(command -v node) \
#     bash scripts/game-service-daemon.sh
set -euo pipefail

GAME_ROOT="${GAME_ROOT:?需要 GAME_ROOT}"
GAME_NODE="${GAME_NODE:?需要 GAME_NODE}"
GAME_PORT="${GAME_PORT:-80}"
GAME_WATCH_INTERVAL="${GAME_WATCH_INTERVAL:-5}"
GAME_RUNTIME_DIR="${GAME_RUNTIME_DIR:-$GAME_ROOT/.service}"

DAEMON_PID="$GAME_RUNTIME_DIR/daemon.pid"
SERVER_PID="$GAME_RUNTIME_DIR/server.pid"
LOG="$GAME_RUNTIME_DIR/server.log"

mkdir -p -- "$GAME_RUNTIME_DIR"

alive() { [[ -f "$1" ]] && kill -0 "$(cat -- "$1")" 2>/dev/null; }

# One supervisor per project: a second copy would fight over the same port.
if alive "$DAEMON_PID" && [[ "$(cat -- "$DAEMON_PID")" != "$$" ]]; then
  printf '%s\n' "守护进程已在运行（PID $(cat -- "$DAEMON_PID")），本次不重复启动。"
  exit 0
fi
printf '%s\n' "$$" > "$DAEMON_PID"

stop_server() {
  if alive "$SERVER_PID"; then
    kill "$(cat -- "$SERVER_PID")" 2>/dev/null || true
    attempt=0
    while alive "$SERVER_PID" && (( attempt < 30 )); do sleep 0.5; attempt=$((attempt + 1)); done
    alive "$SERVER_PID" && kill -9 "$(cat -- "$SERVER_PID")" 2>/dev/null || true
  fi
  rm -f -- "$SERVER_PID"
}
cleanup() { stop_server; rm -f -- "$DAEMON_PID"; exit 0; }
trap cleanup TERM INT

start_server() {
  printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S')" '正在启动游戏服务…' >> "$LOG"
  env NODE_ENV=production PORT="$GAME_PORT" \
    "$GAME_NODE" "$GAME_ROOT/server/index.mjs" >> "$LOG" 2>&1 &
  printf '%s\n' "$!" > "$SERVER_PID"
}

while true; do
  if alive "$SERVER_PID"; then sleep "$GAME_WATCH_INTERVAL"; continue; fi
  rm -f -- "$SERVER_PID"
  start_server
  sleep "$GAME_WATCH_INTERVAL"
done

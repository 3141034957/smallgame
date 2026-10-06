#!/usr/bin/env bash
set -euo pipefail

GAME_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
GAME_SERVICE=smallgame.service
GAME_UNIT="/etc/systemd/system/$GAME_SERVICE"
GAME_ACTION="${1:-help}"

die() { printf '%s\n' "$*" >&2; exit 1; }
usage() {
  cat <<'EOF'
用法：bash scripts/game-service.sh <命令>
  install  安装依赖、自测、构建，配置守护服务并启动，启用开机自启
  update   拉取代码后执行；自测和构建通过后更新服务配置并重启
  start    启动服务
  stop     停止服务（不会自动重启）
  restart  重启服务
  status   查看服务状态和守护方式
  logs     查看最近 100 条日志并持续跟踪，Ctrl+C 退出查看
请用部署用户执行脚本，不要使用 sudo bash；需要权限的步骤会自行调用 sudo。

守护方式自动检测：有 systemd 用 systemd，没有（容器、EAP 开发机等）退化为
自带的常驻守护进程。可用 GAME_SUPERVISOR=systemd|daemon 强制指定。
EOF
}

case "$GAME_ACTION" in
  help|-h|--help) usage; exit 0 ;;
  install|update|start|stop|restart|status|logs) ;;
  *) usage; die "未知命令：$GAME_ACTION" ;;
esac

[[ "$(uname -s)" == Linux ]] || die '此脚本需要在 Ubuntu/Linux 服务器上运行。'
[[ "$(id -u)" != 0 ]] || die '请使用 ubuntu 等普通部署用户执行，不要 sudo bash。'
command -v sudo >/dev/null || die '缺少命令：sudo'

# systemd is missing inside most containers; fall back to the bundled watchdog.
detect_supervisor() {
  case "${GAME_SUPERVISOR:-auto}" in
    systemd|daemon) printf '%s' "$GAME_SUPERVISOR"; return ;;
    auto) ;;
    *) die 'GAME_SUPERVISOR 仅支持 auto、systemd 或 daemon。' ;;
  esac
  if command -v systemctl >/dev/null 2>&1 &&
    { [[ -d /run/systemd/system ]] || systemctl is-system-running >/dev/null 2>&1; }; then
    printf 'systemd'
  else
    printf 'daemon'
  fi
}
GAME_SUPERVISOR="$(detect_supervisor)"

export GAME_ROOT
export GAME_RUNTIME_DIR="$GAME_ROOT/.service"
export GAME_PORT="${GAME_PORT:-80}"
GAME_LOG="$GAME_RUNTIME_DIR/server.log"
GAME_DAEMON="$GAME_ROOT/scripts/game-service-daemon.sh"

daemon_alive() { [[ -f "$GAME_RUNTIME_DIR/daemon.pid" ]] && kill -0 "$(cat -- "$GAME_RUNTIME_DIR/daemon.pid")" 2>/dev/null; }
server_alive() { [[ -f "$GAME_RUNTIME_DIR/server.pid" ]] && kill -0 "$(cat -- "$GAME_RUNTIME_DIR/server.pid")" 2>/dev/null; }

daemon_stop() {
  daemon_alive && kill "$(cat -- "$GAME_RUNTIME_DIR/daemon.pid")" 2>/dev/null || true
  # `daemon_alive` must stay a command: inside (( )) it would be read as a variable.
  attempt=0
  while daemon_alive && (( attempt < 20 )); do sleep 0.5; attempt=$((attempt + 1)); done
  daemon_alive && kill -9 "$(cat -- "$GAME_RUNTIME_DIR/daemon.pid")" 2>/dev/null || true
  rm -f -- "$GAME_RUNTIME_DIR/daemon.pid" "$GAME_RUNTIME_DIR/server.pid"
}
daemon_start() {
  mkdir -p -- "$GAME_RUNTIME_DIR"
  # setsid detaches from the terminal so the watchdog survives logout; hosts
  # without util-linux (macOS dev runs) still work with a plain background job.
  if command -v setsid >/dev/null 2>&1; then
    GAME_ROOT="$GAME_ROOT" GAME_NODE="$GAME_NODE" GAME_PORT="$GAME_PORT" \
      GAME_RUNTIME_DIR="$GAME_RUNTIME_DIR" \
      setsid bash "$GAME_DAEMON" >> "$GAME_LOG" 2>&1 &
  else
    GAME_ROOT="$GAME_ROOT" GAME_NODE="$GAME_NODE" GAME_PORT="$GAME_PORT" \
      GAME_RUNTIME_DIR="$GAME_RUNTIME_DIR" \
      bash "$GAME_DAEMON" >> "$GAME_LOG" 2>&1 &
  fi
  disown 2>/dev/null || true
}

managed_alive() {
  if [[ "$GAME_SUPERVISOR" == systemd ]]; then
    sudo systemctl is-active --quiet "$GAME_SERVICE"
  else
    daemon_alive && server_alive
  fi
}
http_healthy() {
  curl --noproxy '*' -fsS --max-time 2 "http://127.0.0.1:${GAME_PORT}/" -o /dev/null &&
    curl --noproxy '*' -fsS --max-time 2 "http://127.0.0.1:${GAME_PORT}/api/farm/leaderboard" -o /dev/null
}
wait_service() {
  for (( attempt=0; attempt<15; attempt++ )); do
    if managed_alive && http_healthy; then return 0; fi
    sleep 1
  done
  if [[ "$GAME_SUPERVISOR" == systemd ]]; then
    sudo journalctl -u "$GAME_SERVICE" -n 60 --no-pager || true
  else
    tail -n 60 -- "$GAME_LOG" || true
  fi
  die '启动或 HTTP 检查失败，请根据上面的日志排查；修复后重新运行 install/update 或 start/restart。'
}

case "$GAME_ACTION" in
  status)
    if [[ "$GAME_SUPERVISOR" == systemd ]]; then
      sudo systemctl status "$GAME_SERVICE" --no-pager
    else
      printf '%s\n' "守护方式：自带常驻进程（未检测到 systemd）"
      if daemon_alive; then printf '%s\n' "守护进程：运行中（PID $(cat -- "$GAME_RUNTIME_DIR/daemon.pid")）"; else printf '%s\n' '守护进程：未运行'; fi
      if server_alive; then printf '%s\n' "游戏服务：运行中（PID $(cat -- "$GAME_RUNTIME_DIR/server.pid")）"; else printf '%s\n' '游戏服务：未运行'; fi
    fi
    if managed_alive && http_healthy; then
      printf '%s\n' "HTTP 检查：http://127.0.0.1:${GAME_PORT}/ 首页和排行榜接口正常"
      exit 0
    fi
    die '服务状态检查失败：守护进程、游戏进程或 HTTP 接口未就绪。' ;;
  logs)
    if [[ "$GAME_SUPERVISOR" == systemd ]]; then sudo journalctl -u "$GAME_SERVICE" -n 100 -f
    else tail -n 100 -f -- "$GAME_LOG"; fi
    exit ;;
  stop)
    if [[ "$GAME_SUPERVISOR" == systemd ]]; then sudo systemctl stop "$GAME_SERVICE"
    else daemon_stop; fi
    printf '%s\n' '游戏服务已停止。'; exit 0 ;;
  start|restart)
    if [[ "$GAME_SUPERVISOR" == systemd ]]; then
      sudo systemctl "$GAME_ACTION" "$GAME_SERVICE"
    else
      [[ "$GAME_ACTION" == restart ]] && daemon_stop
      if daemon_alive; then printf '%s\n' '守护进程已在运行。'; else
        [[ -f "$GAME_ROOT/dist/client/index.html" ]] || die '未找到 dist/client/index.html，请先执行 install/update。'
        GAME_NODE="$(readlink -f "$(command -v node)")"
        daemon_start
      fi
    fi
    wait_service
    bash "$0" status
    exit ;;
esac

for tool in node npm curl ss readlink; do
  command -v "$tool" >/dev/null || die "缺少命令：$tool，请先安装后重试。"
done
if [[ "$GAME_SUPERVISOR" == systemd ]]; then
  for tool in systemctl systemd-analyze; do
    command -v "$tool" >/dev/null || die "缺少命令：$tool，请先安装后重试。"
  done
fi
GAME_NODE="$(readlink -f "$(command -v node)")"
export GAME_NODE
GAME_USER="$(id -un)"
# Restrict unit-file interpolation to simple paths/usernames, without systemd
# specifiers or shell metacharacters. Normal Ubuntu/nvm paths are supported.
[[ "$GAME_ROOT" =~ ^/[a-zA-Z0-9_./-]+$ && "$GAME_NODE" =~ ^/[a-zA-Z0-9_./-]+$ && "$GAME_USER" =~ ^[a-zA-Z0-9_-]+$ ]] || die '项目路径、Node 路径或用户名包含不支持的字符，请使用无空格的普通路径。'
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 13)) process.exit(1)' || die '需要 Node.js 22.13.0 或更高版本。'
[[ -f "$GAME_ROOT/package-lock.json" && -f "$GAME_ROOT/server/index.mjs" ]] || die '项目文件不完整，请在完整仓库中执行。'
if [[ -e "$GAME_ROOT/server/data/game.db" && ! -w "$GAME_ROOT/server/data/game.db" ]]; then
  die "当前用户无法写入 server/data/game.db，请先检查数据库文件所有者和权限。"
fi

sudo -v
GAME_LISTENERS="$(sudo ss -H -ltnp "sport = :${GAME_PORT}")"
if [[ -n "$GAME_LISTENERS" ]] && ! sudo systemctl is-active --quiet "$GAME_SERVICE" 2>/dev/null && ! server_alive; then
  printf '%s\n' "$GAME_LISTENERS" >&2
  die "${GAME_PORT} 端口已被其他进程占用。若是手动 npm start，请在原终端 Ctrl+C 停止后重试；脚本不会自动杀进程。"
fi

cd -- "$GAME_ROOT"
printf '%s\n' '正在安装依赖、测试和构建；通过后才会更新守护服务。'
npm ci
npm test
npm run lint
npm run build
[[ -f dist/client/index.html ]] || die '构建未生成 dist/client/index.html，停止部署。'

if [[ "$GAME_SUPERVISOR" == systemd ]]; then
GAME_TMP="$(mktemp -d)"
trap 'rm -rf -- "$GAME_TMP"' EXIT
cat > "$GAME_TMP/$GAME_SERVICE" <<EOF
[Unit]
Description=Smallgame Server
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=10

[Service]
Type=simple
User=$GAME_USER
WorkingDirectory=$GAME_ROOT
ExecStartPre=/usr/bin/test -f $GAME_ROOT/dist/client/index.html
ExecStart=$GAME_NODE $GAME_ROOT/server/index.mjs
Environment=NODE_ENV=production
Environment=PORT=$GAME_PORT
Restart=always
RestartSec=3
TimeoutStopSec=30
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF
systemd-analyze verify "$GAME_TMP/$GAME_SERVICE"
if sudo test -f "$GAME_UNIT"; then
  sudo cp -- "$GAME_UNIT" "$GAME_UNIT.backup-$(date +%Y%m%d-%H%M%S)"
fi
sudo install -m 644 "$GAME_TMP/$GAME_SERVICE" "$GAME_UNIT"
sudo systemctl daemon-reload
sudo systemctl enable "$GAME_SERVICE"
sudo systemctl reset-failed "$GAME_SERVICE"
sudo systemctl restart "$GAME_SERVICE"
else
  # No systemd: bind the low port by capability, then run the bundled watchdog.
  printf '%s\n' '未检测到 systemd，使用自带常驻守护进程。'
  sudo setcap 'cap_net_bind_service=+ep' "$GAME_NODE" ||
    printf '%s\n' "警告：无法为 $GAME_NODE 授予绑定 ${GAME_PORT} 端口的能力，若启动报 EACCES 请改用高位端口或检查文件系统是否支持 setcap。" >&2
  daemon_stop
  daemon_start
  if command -v crontab >/dev/null 2>&1; then
    # `crontab -l` exits 1 when the user has no crontab yet, and grep exits 1
    # when nothing matches; neither must abort the deployment.
    GAME_EXISTING="$(crontab -l 2>/dev/null || true)"
    GAME_CRON="$(printf '%s\n' "$GAME_EXISTING" | grep -v -F -- "$GAME_DAEMON" || true)"
    printf '%s\n@reboot GAME_ROOT=%s GAME_NODE=%s GAME_PORT=%s GAME_RUNTIME_DIR=%s bash %s\n' \
      "$GAME_CRON" "$GAME_ROOT" "$GAME_NODE" "$GAME_PORT" "$GAME_RUNTIME_DIR" "$GAME_DAEMON" | crontab -
    printf '%s\n' '已写入当前用户的 crontab @reboot 开机自启。'
  else
    printf '%s\n' '警告：未找到 crontab，无法配置开机自启；请手动将守护进程加入开机启动项。' >&2
  fi
fi

wait_service
bash "$0" status
printf '%s\n' '守护服务已启动，页面和排行榜接口检查通过。' "通过服务器 IP 访问：http://<服务器IP>:${GAME_PORT}/（不依赖域名）"

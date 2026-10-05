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
  status   查看服务状态
  logs     查看最近 100 条日志并持续跟踪，Ctrl+C 退出查看
请用部署用户执行脚本，不要使用 sudo bash；需要权限的步骤会自行调用 sudo。
EOF
}

case "$GAME_ACTION" in
  help|-h|--help) usage; exit 0 ;;
  install|update|start|stop|restart|status|logs) ;;
  *) usage; die "未知命令：$GAME_ACTION" ;;
esac

[[ "$(uname -s)" == Linux ]] || die '此脚本需要在 Ubuntu/Linux 服务器上运行。'
[[ "$(id -u)" != 0 ]] || die '请使用 ubuntu 等普通部署用户执行，不要 sudo bash。'
for command in systemctl sudo; do
  command -v "$command" >/dev/null || die "缺少命令：$command"
done

case "$GAME_ACTION" in
  status) sudo systemctl status "$GAME_SERVICE" --no-pager; exit ;;
  logs) sudo journalctl -u "$GAME_SERVICE" -n 100 -f; exit ;;
  stop) sudo systemctl stop "$GAME_SERVICE"; printf '%s\n' '游戏服务已停止。'; exit 0 ;;
  start|restart) sudo systemctl "$GAME_ACTION" "$GAME_SERVICE"; sudo systemctl status "$GAME_SERVICE" --no-pager; exit ;;
esac

for command in node npm curl ss readlink systemd-analyze; do
  command -v "$command" >/dev/null || die "缺少命令：$command，请先安装后重试。"
done
GAME_NODE="$(readlink -f "$(command -v node)")"
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
GAME_LISTENERS="$(sudo ss -H -ltnp 'sport = :80')"
if [[ -n "$GAME_LISTENERS" ]] && ! sudo systemctl is-active --quiet "$GAME_SERVICE"; then
  printf '%s\n' "$GAME_LISTENERS" >&2
  die '80 端口已被其他进程占用。若是手动 npm start，请在原终端 Ctrl+C 停止后重试；脚本不会自动杀进程。'
fi

cd -- "$GAME_ROOT"
printf '%s\n' '正在安装依赖、测试和构建；通过后才会更新守护服务。'
npm ci
npm test
npm run lint
npm run build
[[ -f dist/client/index.html ]] || die '构建未生成 dist/client/index.html，停止部署。'

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
Environment=PORT=80
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

# Require both a live managed process and HTTP responses from the game and API.
for (( attempt=0; attempt<15; attempt++ )); do
  if sudo systemctl is-active --quiet "$GAME_SERVICE" &&
    curl --noproxy '*' -fsS --max-time 2 http://127.0.0.1/ -o /dev/null &&
    curl --noproxy '*' -fsS --max-time 2 http://127.0.0.1/api/farm/leaderboard -o /dev/null; then
    sudo systemctl status "$GAME_SERVICE" --no-pager
    printf '%s\n' '守护服务已启动，开机自启已启用，页面和排行榜接口检查通过。' '域名解析和 TCP 80 放行后可访问：http://yueduigameyuedui.site/'
    exit 0
  fi
  sleep 1
done
sudo journalctl -u "$GAME_SERVICE" -n 60 --no-pager || true
die '启动或 HTTP 检查失败，请根据上面的日志排查；修复后重新运行 install/update。'

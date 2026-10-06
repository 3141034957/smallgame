# 服务器进程守护

所有命令都在服务器上，以 `ubuntu` 等普通部署用户执行（不要 `sudo bash`）。项目目录为 `/home/ubuntu/smallgame`；脚本内部会在需要权限的步骤自行调用 `sudo`。

## 守护方式自动选择

脚本会检测运行环境并自动选择守护方式：

- **有 systemd**（Ubuntu/CVM 等）：写入 `/etc/systemd/system/smallgame.service`，`Restart=always`、开机自启、用 `AmbientCapabilities` 授予绑定 80 端口的能力。
- **没有 systemd**（容器、EAP 开发机等）：退化为自带的常驻守护进程 `scripts/game-service-daemon.sh`——每 5 秒检查一次，服务退出即自动拉起；用 `setcap` 让普通用户也能绑定 80 端口；通过当前用户的 `crontab` `@reboot` 实现开机自启。运行状态和日志放在项目内的 `.service/`（已加入 `.gitignore`）。

`status` 会显示当前使用的守护方式。需要固定某一种时用环境变量指定：

```bash
GAME_SUPERVISOR=systemd bash scripts/game-service.sh install   # 强制 systemd
GAME_SUPERVISOR=daemon  bash scripts/game-service.sh install   # 强制常驻守护进程
```

端口默认 80，可用 `GAME_PORT=8080 bash scripts/game-service.sh install` 指定。

## 首次安装

如果原终端还在运行 `npm start`，先按 `Ctrl+C` 停止。随后复制执行：

```bash
cd /home/ubuntu/smallgame &&
git pull --ff-only &&
bash scripts/game-service.sh install
```

脚本自动获取当前 Node 的绝对路径（支持 nvm）和执行用户名，依次执行 `npm ci`、测试、lint、构建。全部通过后写入 `/etc/systemd/system/smallgame.service`，启用开机自启并启动服务，检查首页和总排行榜 API。已有服务配置会先备份到同目录的 `.backup-时间戳` 文件。

看到「守护服务已启动，页面和排行榜接口检查通过」即可断开 SSH。云服务器安全组及系统防火墙放行 TCP 80 后，直接访问 `http://服务器IP/`，页面与 `/api` 接口共用同一 IP 和端口，不依赖域名解析。使用其他端口时，访问 `http://服务器IP:端口/`。

服务以普通用户运行，由 systemd 授予绑定 80 端口的能力，不需要额外执行 `setcap`。进程退出后 3 秒重启；60 秒内连续启动超过 10 次会暂停重试，避免配置错误时反复启动。数据库继续使用项目中的 `server/data/game.db`，脚本不删除或迁移数据库。

## 更新版本

```bash
cd /home/ubuntu/smallgame &&
git pull --ff-only &&
bash scripts/game-service.sh update
```

更新不会自动拉取其他分支；请先确认当前分支是需要部署的版本。脚本测试和构建成功前不会主动重启旧服务；但依赖和构建是在当前目录更新的，这不是零停机部署，也不会自动回滚代码或构建产物。生产升级前应备份数据；SQLite 使用 WAL，请用 SQLite 在线备份工具，或停止服务后完整备份 `server/data`，不要运行中仅复制 `game.db`。

更换 nvm 的 Node 版本后，执行 `update` 会同步刷新服务中的 Node 路径。

## 常用操作

在项目目录中执行：

```bash
# 查看状态
bash scripts/game-service.sh status

# 查看实时日志，Ctrl+C 只退出日志查看，不停止游戏
bash scripts/game-service.sh logs

# 重启 / 停止 / 启动
bash scripts/game-service.sh restart
bash scripts/game-service.sh stop
bash scripts/game-service.sh start
```

`install`、`update`、`start`、`restart` 都会等待进程和首页、排行榜接口就绪，失败时输出日志并返回非零退出码。`status` 也会检查进程和两个接口；未就绪时返回非零退出码，不能仅凭日志中出现「守护进程：运行中」判定部署成功。

主动停止后不会自动重启；但开机自启仍然有效。如需取消开机自启并立即停止：

```bash
sudo systemctl disable --now smallgame.service
```

## 常见问题

- **80 端口占用**：脚本会输出监听进程，不会自动杀进程。先停止旧的手动 `npm start`，或检查已有 Nginx/Apache 的部署方式。
- **Node 找不到 / 版本过低**：先在当前终端用 nvm 激活 Node.js 22.13+，再执行脚本；不要用 `sudo bash` 丢失当前 Node 环境。
- **`npm ci` 失败**：检查服务器访问 npm 源的网络与权限，修复后重试。
- **数据库权限错误**：服务使用执行脚本的普通用户，确保该用户能够写入 `server/data` 及其中的数据库文件。
- **启动失败或接口失败**：执行 `logs` 查看具体原因；修复后再次执行 `install` 或 `update`，脚本会清除失败计数并重新启动。
- **无 systemd 时报 EACCES（绑定 80 端口失败）**：`setcap` 未生效（多见于 `nosuid` 挂载或只读文件系统）。改用高位端口 `GAME_PORT=8080 ... install` 并让网关转发，或修复挂载选项后重跑。
- **无 systemd 且没有 crontab**：脚本会提示无法配置开机自启；手动把 `scripts/game-service-daemon.sh` 加入容器的启动命令即可。
- **无 systemd 时想取消开机自启**：`crontab -e` 删除包含 `game-service-daemon.sh` 的那一行，再执行 `bash scripts/game-service.sh stop`。

配置依据：[Ubuntu systemd.service](https://manpages.ubuntu.com/manpages/noble/man5/systemd.service.5.html)、[Ubuntu systemd.exec](https://manpages.ubuntu.com/manpages/noble/man5/systemd.exec.5.html)。

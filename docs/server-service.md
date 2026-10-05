# Ubuntu 服务器进程守护

所有命令都在服务器上，以 `ubuntu` 用户执行。项目目录为 `/home/ubuntu/smallgame`；不要对整个脚本使用 `sudo`。脚本内部会在安装 systemd 服务等必要步骤调用 `sudo`。

## 首次安装

如果原终端还在运行 `npm start`，先按 `Ctrl+C` 停止。随后复制执行：

```bash
cd /home/ubuntu/smallgame &&
git pull --ff-only &&
bash scripts/game-service.sh install
```

脚本自动获取当前 Node 的绝对路径（支持 nvm）和执行用户名，依次执行 `npm ci`、测试、lint、构建。全部通过后写入 `/etc/systemd/system/smallgame.service`，启用开机自启并启动服务，检查首页和总排行榜 API。已有服务配置会先备份到同目录的 `.backup-时间戳` 文件。

看到「守护服务已启动，开机自启已启用，页面和排行榜接口检查通过」即可断开 SSH。域名解析指向该服务器，且云服务器安全组及系统防火墙放行 TCP 80 后，可访问 <http://yueduigameyuedui.site/>。

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

配置依据：[Ubuntu systemd.service](https://manpages.ubuntu.com/manpages/noble/man5/systemd.service.5.html)、[Ubuntu systemd.exec](https://manpages.ubuntu.com/manpages/noble/man5/systemd.exec.5.html)。

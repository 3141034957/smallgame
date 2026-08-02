# Mochi Cat 小游戏

React + Vite 前端和 Node.js 排行榜服务。项目面向内网服务器部署，可通过 Cloudflare Tunnel 将同一个服务地址映射到公网域名。

## 环境要求

- Node.js 22.13+，推荐使用最新的 Node.js 22 LTS
- npm

如果使用 nvm：

```bash
nvm install
nvm use
```

## 本地开发

分别启动排行榜服务和前端开发服务器：

```bash
npm ci
npm run dev:server
```

在另一个终端运行：

```bash
npm run dev
```

开发页面地址为 `http://localhost:5173`，排行榜接口由 Vite 转发到 `http://localhost:3001`。

## 内网服务器部署

```bash
npm ci
npm run build
npm start
```

游戏和排行榜接口统一由 `http://localhost:3001` 提供。Cloudflare Tunnel 的源站服务地址也应配置为这个地址。

第一次启动时，服务会自动创建 SQLite 数据库，并把原来的排行榜和统计 JSON 数据导入数据库。生产环境建议使用 systemd、Supervisor 或其他进程管理工具保持 `npm start` 常驻，并在升级前备份 `server/data`。

## 数据文件

- `server/data/game.db`：SQLite 数据库，保存排行榜、提交历史、上报 IP 和统计数据
- `server/data/leaderboard.json`：旧排行榜的首次迁移来源和备份
- `server/data/stats.json`：旧统计数据的首次迁移来源和备份

当前服务使用本机 SQLite 存储，不依赖 Sites、Cloudflare Worker 或 D1 数据库。数据库启用了事务和 WAL；仍建议只运行一个 Node.js 服务实例。

查看数据库概况、排行榜、当天每个昵称的上报次数和当天全部提交记录：

```bash
# 默认查询今天
npm run db:inspect

# 查询指定日期
npm run db:inspect -- 2026-08-02
```

如果服务器安装了 `sqlite3` 命令，也可以直接查询：

```bash
sqlite3 server/data/game.db
```

```sql
SELECT * FROM leaderboard ORDER BY score DESC LIMIT 100;
SELECT * FROM score_submissions ORDER BY submitted_at DESC LIMIT 50;
```

## 检查

```bash
npm test
npm run lint
npm run build
```

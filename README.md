# 回声花房 · Echo Garden

一个使用 React、Vite 和 npm 构建的音乐解谜 / 创作小游戏，支持手机和桌面浏览器。玩家在八格唱片上摆放心跳、雨声、铃声和回声；唱针会按摆放顺序，实时演奏出玩家自己的短曲。声音和画面均在浏览器本地生成，不依赖外部音频素材。

这个分支保留了原来的 Mochi Cat：

- `#/`：回声花房
- `#/mochi`：Mochi Cat 原游戏
- `#/shop`：原游戏商店

## 环境要求

- Node.js 22.13+，推荐使用最新的 Node.js 22 LTS
- npm

如果使用 nvm：

```bash
nvm install
nvm use
```

## 本地开发

```bash
npm ci
npm run dev
```

开发页面地址为 `http://localhost:5173`。回声花房的故事、每日花谱和声音在浏览器中运行，不需要启动排行榜服务。

如果要游玩 Mochi Cat 并使用它的排行榜，在另一个终端启动原有服务：

```bash
npm run dev:server
```

Mochi Cat 的排行榜接口会由 Vite 转发到 `http://localhost:3001`。

## 三种玩法

### 夜间来信

在八格唱片上摆放种子，让位置关系满足来信中的线索：

1. 心跳相隔四格。
2. 雨滴位于唱片两侧。
3. 铃花后面紧跟回声。

每解开一封来信，唱片会演奏解法，再进入下一关。三封来信完成后，回放会让心跳、雨声、铃花、回声逐段加入，形成玩家自己的短曲；还可以自由改谱、保存在本机并复制链接分享。

### 每日花谱

按北京时间生成当天固定的六轮题目。每轮从三个声音种子中挑一个，种在八格唱片的空位上；它会立即演奏一圈，试听 1.3 秒后可跳过。所有玩家在同一天看到相同的选项和「指定拍点 / 留白」目标，次日目标会变化；可反复尝试更高的本地最佳分数，也能分享带日期与谱子的挑战链接。未完成的进度存在当前浏览器的 `localStorage` 中。

最终分数只计算六颗种子组成的唱片，不累加每轮的中途分数：每颗 +10；对置心跳 +30；双岸雨声 +25；铃后回声 +25；四种声音齐鸣 +20；不同种子相邻每对 +4、最多三对。当天指定拍点放入指定种子另得 +25，六颗种下后指定留白拍仍为空另得 +15。相同组合奖励每局只记一次。每日最佳成绩是**本机记录**，不宣称为在线排行榜。

### 一拍接力

打开朋友寄来的谱子，可以听原曲并且只改动八格中的一个位置。改完会演奏新版，并生成同时包含「原谱」和「接力谱」的邀请链接；下一位朋友可比较两版分数，继续改一拍。接力以链接传递，不需要账号或服务器。

## 创意参考

- [Rytmos 的开发者访谈](https://developer.apple.com/news/?id=34m9vbvv)：解谜过程逐层生成音乐。
- [Lo-Fi Room 的开发者页面](https://bearmask.itch.io/lofi-room)：寻找乐器并逐层拼出节拍。
- [Incredibox 官方说明](https://www.incredibox.com/info/faq)：简单放置声音、发现组合，并分享创作结果。
- [Patatap 官方网站](https://patatap.com/)：触碰立即带来声音与动态图形反馈。

这些作品提供交互设计上的启发；回声花房的玩法实现、代码、美术和音色均独立制作，不使用它们的素材或谱面。视觉采用唱片封套与夜间邮报的纸张 / 油墨语言，不依赖下载的图片素材。原有 Mochi Cat 的素材和服务也保持在原路由，不会被新玩法覆盖。

## 内网服务器部署

```bash
npm ci
npm run build
npm start
```

构建产物输出到 `dist/client`。使用原有 Node 服务时，页面和 Mochi Cat 的排行榜接口统一由 `http://localhost:3001` 提供。

第一次启动时，服务会自动创建 SQLite 数据库，并把原来的排行榜和统计 JSON 数据导入数据库。生产环境建议使用 systemd、Supervisor 或其他进程管理工具保持 `npm start` 常驻，并在升级前备份 `server/data`。

## 数据文件

- `server/data/game.db`：SQLite 数据库，保存 Mochi Cat 的排行榜、提交历史、上报 IP 和统计数据
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

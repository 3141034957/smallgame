# 怪潮乐队历险记 · Smallgame

项目只保留怪潮乐队历险记：不限时的音乐怪潮生存游戏，生命归零后结算。手机拖动摇杆方向，电脑用鼠标指向移动，乐器自动攻击。升级选择乐器与芯片，搭配六组终极形态，挑战追击怪物、远程弹幕、精英和 Boss。

`#/` 与 `#/farm` 都进入当前游戏，其他旧地址回到首页。角色商店采用“乐队集结”海报中的九位成员，使用战斗与每日任务获得的金币解锁；角色、金币、成就、生涯战绩、每日目标和本机最佳成绩保存在当前浏览器。历史总排行榜通过服务端回放校验成绩。七种怪物按生存时间逐步登场，玩法帮助中可查看图鉴与攻击预警说明；旧版成绩与新版规则隔离，已有钱包和角色不变。

仓库为 `https://github.com/3141034957/smallgame.git`；本地目录名继续使用 `echo-garden`。

## 开发与验证

需要 Node.js 22.13+ 和 npm。使用 nvm 时先运行 `nvm use`。

```bash
npm ci
npm run dev:server
```

另一个终端运行 `npm run dev`，访问 `http://localhost:5173`。Vite 将 `/api` 请求转发至 3001 端口的后端。

```bash
npm test
npm run lint
npm run build
npm run format:check
git diff --check
```

规则、操作与 API 见 [游戏说明](docs/music-farm.md)，代码职责与存档约定见 [代码结构](docs/code-structure.md)，角色素材与旧 ID 迁移见 [素材说明](docs/band-lineup-assets.md)。音频由浏览器合成，未接入外部音乐账号或曲库。

## 运行与部署

游戏入口已接入账号密码注册、登录和退出。同账号新登录会使旧会话失效；密码支持英文大小写、数字、特殊字符及普通空格。金币和强化等本机进度可一次绑定账号并按账号隔离，当前不跨设备同步。说明见 [账号登录](docs/accounts.md)。

```bash
npm run build
PORT=3001 npm start
```

构建输出到 `dist/client`。同一个 Node 服务提供页面和 `/api/farm/*` 排行榜接口；`npm start` 默认监听 80 端口，可以用 `PORT` 修改。生产守护安装与更新见 [服务器进程守护](docs/server-service.md)：

```bash
bash scripts/game-service.sh install
bash scripts/game-service.sh update
```

## 数据

SQLite 位于 `server/data/game.db`，可以通过 `DATA_DIR` 指定其他目录。服务保留既有的 `melody_scores` 表名，以兼容已经保存的怪潮乐队成绩；当前榜单只读取 `farm:v8-recovery:日期` 且玩法键为 `farm` 的记录。其他游戏的接口、运行代码和素材已移除，历史数据库记录不再参与当前榜单。服务不导入旧跳跃游戏的 JSON 备份。

浏览器身份键和旧角色 ID 的读取仅用于迁移玩家进度，不提供旧玩法或星星商店。生产升级前请备份 SQLite；服务启用 WAL，应使用在线备份，或停服后完整备份数据目录。

查看当前总榜或某日最佳成绩：

```bash
npm run db:inspect
npm run db:inspect -- 2026-10-06
```

测试使用独立临时数据库，不修改生产数据。

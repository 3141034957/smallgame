# 代码结构与维护

## 入口与职责

- `src/App.tsx`：仅保留 `/` 与 `/farm` 两个游戏入口；其他旧地址回到首页。分享链接继续携带日期和挑战参数。
- `src/pages/MusicFarm/index.tsx`：串联对局生命周期、动画循环、输入、音频与本地结算。可变的逐帧状态在 ref 中，界面状态在 React state 中。
- `src/pages/MusicFarm/UpgradeChoices.tsx`、`FarmHelp.tsx`：升级选项与玩法说明，接收数据和回调，不修改存档或推进游戏。
- `src/features/farm/upgradeSelection.ts`：执行选择及后续单选项的连续自动升级，返回每次选择的日志；页面在发布画面前处理单选项，多选项继续等待玩家，服务端仍按原规则回放日志。
- `src/pages/MusicFarm/FarmBoard.tsx`：生存榜读取、提交与重试。
- `src/pages/MusicFarm/render.ts`、`background.ts`：绘图和背景；不改变游戏规则。
- `src/features/farm/`：战斗规则、控制器、本地角色钱包、成就、任务、生涯统计等独立模块。
- `src/features/farm/permanent.mjs`：局外永久成长的数据与纯函数。成长是一条全局链而非多项多级树：`PERMANENT_CHAIN`（`PERMANENT_UPGRADES` 的别名）是 29 个 `max: 1` 的节点，`permanentNextStep` / `permanentIsUnlocked` 实现严格顺序解锁，`RECOVERY` 保存安全期与回血周期，`normalizePermanentLevels` 只认链上的 29 个 id（旧的多级存档键读回来为全 0，即强化数据直接清空，不做折算），`permanentStats` 汇总成战斗用的固定数值（`maxHp` / `damage` / `speed` / `attraction` / `xp` / `armor` / `regen` / `shieldSeconds`）。加成全为固定数值，链上没有百分比；`rules.mjs` 负责把它们接到伤害、受击、拾取、经验与步长上。
- `src/features/farm/schools.mjs`：流派（乐器 + 专属芯片 + 进化形态）与跨流派组合技的数据层，只描述数据与纯函数判定；增益由 `rules.mjs` 在 `stepFarm` 里乘到既有数值上，并通过 `rules.mjs` 一并导出给界面，保证客户端与服务端回放共用同一份结果。
- `src/features/farm/audio.ts`、`calendar.mjs`、`leaderboard.ts`：当前游戏的合成音频、北京时间及每日种子、排行榜请求，不依赖已删除的游戏模块。
- `src/features/auth/`、`server/auth.mjs`、`server/auth-store.mjs`：可选注册、密码登录与单账号单会话；`cloud.ts` 串行同步账号成长，`server/progress.mjs` 校验版本并保存到 SQLite；Cookie 只存会话令牌。
- `src/utils/accountStorage.ts`：游客与账号成长存档分别保存；新账号继承游客快照，账号存档携带云端版本和待同步标记。`playerIdentity.ts` 提供游客身份、账号身份和当前作用域昵称。
- `src/utils/localScores.ts`：最佳成绩的存档校验与容错。`src/features/farm/characters.ts` 一次保存金币、所有权、选择及奖励记录；旧角色存档只用于读取迁移。
- `server/index.mjs`、`farm.mjs`：仅提供怪潮乐队 API，成绩由共享规则回放校验。`farm-store.mjs` 保留历史表名和旧列迁移，已有怪潮乐队排名继续可用，旧玩法记录隔离。`identity.mjs` 校验身份及角色 ID。
- `server/static.mjs`：静态文件、页面回退、缓存和压缩协商。缺失的构建资源返回 404，页面回退使用 HTML 类型和 `no-cache`；压缩协商依据 [RFC 9110 §12.5.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-12.5.3)。
- `scripts/game-service.sh`：部署与守护管理；运行状态文件位于 `.service/`，不提交到 Git。

## 修改时的约定

1. 游戏判分、战斗与回放规则放在 `src/features/*` 的共享 `.mjs` 中，同时维护旁边的 `.d.mts` 类型声明。页面与服务端使用同一份规则。
2. 纯展示组件只接收数据和回调；网络、存档、结算等副作用集中在对应模块，避免复制进多个页面。
3. 每日任务结算传入对局 `runId`。重试只能补领奖励，不能再次累计这局进度；先保存进度再付款，钱包使用奖励 ID 去重。旧版任务存档会自动补齐对局记录。
4. 新增读写存档时处理损坏数据、浏览器禁用存储和容量不足。失败时不能让动画循环抛出异常或显示未到账的奖励。
5. 本地存档是玩家本机进度，不作为服务端榜单判分依据。

## 格式与验证

项目源码、服务端与脚本已统一为 Prettier 格式。修改后运行：

```bash
npm run format -- src/pages/MusicFarm/index.tsx src/features/farm/quests.ts
npm run format:check
git diff --check
npm test
npm run lint
npm run build
```

`server/static.test.mjs` 使用独立临时文件验证响应内容和缓存头；`server/index.test.mjs` 在系统分配的临时端口启动真实服务，验证异常请求不会终止进程、中文昵称的分块传输和旧游戏 API 返回 404。测试数据库位于系统临时目录，不使用 `server/data`。

`App.dom.test.tsx` 在 jsdom 中覆盖当前游戏入口、未知路由回退首页及 StrictMode 挂载/卸载。专项 DOM 测试验证生存榜自动提交、网络失败重试及昵称提交去重；钱包专项测试验证存储失败购买；画布、音频、网络等浏览器平台能力按测试需要模拟，游戏规则与真实 HTTP 另有独立测试。此类测试不代替真机画面、音频与触摸验证。

农场动画循环仍在主页面中；以后调整它时，应先保留固定步长模拟、显示插值、暂停和回放日志之间的关系，再决定是否抽出 hook。

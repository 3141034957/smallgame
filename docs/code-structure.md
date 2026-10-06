# 代码结构与维护

## 入口与职责

- `src/App.tsx`：HashRouter 路由及旧分享链接兼容；默认游戏是 `MusicFarm`，`Home` 是 `/mochi` 的旧跳跃游戏。
- `src/pages/MusicFarm/index.tsx`：串联对局生命周期、动画循环、输入、音频与本地结算。可变的逐帧状态在 ref 中，界面状态在 React state 中。
- `src/pages/MusicFarm/UpgradeChoices.tsx`、`FarmHelp.tsx`：升级选项与玩法说明，接收数据和回调，不修改存档或推进游戏。
- `src/pages/MusicFarm/FarmBoard.tsx`：生存榜读取、提交与重试。
- `src/pages/MusicFarm/render.ts`、`background.ts`：绘图和背景；不改变游戏规则。
- `src/features/farm/`：战斗规则、控制器、本地角色钱包、成就、任务、生涯统计等独立模块。
- `src/features/game/leaderboard.ts`：旧跳跃游戏的排行榜请求，使用当前站点的 `/api`；页面不直接保存另一套请求实现。
- `src/utils/playerIdentity.ts`：跳跃游戏与生存榜共用的身份、昵称和旧存档迁移。
- `src/utils/localScores.ts`：最佳成绩的存档校验和容错读写；`starCurrency.ts` 管理旧跳跃游戏的星星，余额、已购角色与选中角色由 `legacyProfile.ts` 一次保存，避免扣款成功但角色未保存。
- `server/`：HTTP 接口与 SQLite 存储；每种游戏的接口独立，客户端成绩由共享规则回放校验。
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

`server/static.test.mjs` 使用独立临时文件验证响应内容和缓存头；`server/index.test.mjs` 在系统分配的临时端口启动真实服务，验证异常请求不会终止进程及中文昵称的分块传输。测试数据库位于系统临时目录，不使用 `server/data`。

`App.dom.test.tsx` 在 jsdom 中覆盖所有游戏入口、商店、未知路由及 StrictMode 挂载/卸载。专项 DOM 测试验证生存榜自动提交、网络失败重试、昵称提交去重、键盘输入与存储失败购买；画布、音频、网络等浏览器平台能力按测试需要模拟，游戏规则与真实 HTTP 另有独立测试。此类测试不代替真机画面、音频与触摸验证。

农场动画循环仍在主页面中；以后调整它时，应先保留固定步长模拟、显示插值、暂停和回放日志之间的关系，再决定是否抽出 hook。

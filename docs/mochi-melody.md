# 软糖乐队 · Mochi Melody

## 赛题对应

用户提供的四张截图说明了「让音乐玩起来」的互动产品方向，并允许「方向 2：从 0 到 1，自由创意」，产品需要服务音乐或音频场景。

软糖乐队以音乐为游戏反馈：四轨分别由小猫鼓手、小兔键盘手、小熊贝斯手、小鸟主唱演奏。音符到达判定线时命中才会播放对应声部，最终可以听见自己实际接住的音符。自由排练将演奏延伸成创作，用户通过四轨十六小拍组成作品并分享可编辑的乐谱。

游戏使用原创算法谱面与本地合成音色，没有宣称运行了 AI 作曲服务。制作过程中使用 AI 辅助实现代码和生成插画，适合演示音乐交互、创作和社交延续三个环节。

## 核心循环

选曲 → 跟节拍演奏 → 连击与星级 → 解锁新曲 → 更高难度 → 回放演出或自由编曲。

「草莓汽水」96 BPM、「云朵摇摇」108 BPM、「星星的晚安」120 BPM；单局约 27–32 秒。练习模式只演奏一小段，不计星级。难度从隔拍单音、逐拍单音，增加到双音与半拍。

## 判定与奖励

- 音符提前 2.4 秒显示，给手指留出反应时间。
- 偏差不超过 85 毫秒为「刚刚好」，基础得分 100；不超过 220 毫秒为「接住啦」，基础得分 65。
- 每连续命中 5 音增加 5 点连击奖励，上限 50。漏拍或多拍会断连击，多拍还扣除 25 分（最低为 0）。
- 准确度为 `(刚刚好次数 + 接住次数 × 0.7) / (总音符数 + 多拍次数 × 0.5)`。
- 90%、70%、40% 对应三星、二星、一星。同一曲目与难度只保留最高得分与最高星级，不能靠重复同一成绩累计解锁星星。
- 收集 1 星开放「云朵摇摇」，4 星开放「星星的晚安」。邀请链接可以直接选择朋友邀请的曲目。
- 切出页面自动暂停，恢复时提供两秒准备时间。支持 ±150ms 音画校准。

## 自由排练与分享

四行分别代表四位成员，十六个格子是两小节的八分音符。可选「棉花糖」「摇摆果冻」「晚安饼干」预设，也可清空后从零编曲。播放时可以实时编辑，调速范围 80–140 BPM，速度调整在停止后生效。

分享链接以 16 位十六进制编码保存完整 4 × 16 乐谱，并包含速度。手机分两页显示两个小节；桌面展示完整乐谱。谱面与个人最佳保存在当前浏览器。HTTP 环境不能自动访问剪贴板时，会显示可手动复制的链接。

演出回放保留实际命中时间和音高，在当前页面中重播。邀请朋友挑战的链接包含曲目与难度。

## 甜蜜排行榜

首页与导航可以进入独立的软糖乐队排行榜，不与旧跳跃小游戏混排行。三首曲目 × 三种难度分别排名。正式演出结束后，玩家主动填写最多 12 字的昵称并提交；练习和零分演出不提供上榜。

每个浏览器生成并保存一个匿名玩家标识，同名玩家不会覆盖彼此。每人每榜保留一个最佳成绩，展示前 50 名与自己的完整名次（即使不在前 50 名）。分数相同依次比较准确度、最长连击和首次达成时间。更低的成绩不会覆盖最佳成绩，修改昵称会更新该玩家已有的榜单名字。换设备或清除浏览器数据会获得新身份，目前没有账号同步。

浏览器与 Node 服务共享 `src/features/melody/rules.mjs` 的谱面和判定代码。提交包含本场所有有效游戏输入（命中与多拍），服务器逐项重算分数、准确度、连击和星级，并拒绝与记录不符的分数、非法音轨、逆序时间与过大的请求。音画校准值在每场开场时固定。此机制提供一致的判分和输入校验；匿名客户端仍可构造完整演奏记录，尚不属于有账号和服务端实时判定的竞赛防作弊系统。

接口为 `GET /api/melody/leaderboard?song=strawberry&difficulty=cozy&playerId=...` 和 `POST /api/melody/score`。SQLite 新建 `melody_scores` 表，保留旧表及旧数据。默认数据库仍为 `server/data/game.db`，可用绝对路径的 `DATA_DIR` 环境变量指定独立数据目录。加载、空榜、离线、重试和提交成功均有独立界面反馈；网络错误不会影响本机最佳和星级。切换页面会回到顶部，避免手机从首页底部进入榜单后留在半页。

## 路由和部署

- `#/`：声音探险（后续新增玩法，见 [声音探险说明](sound-island.md)）
- `#/rhythm`：节奏舞台与自由排练
- `#/echo`：旧回声花房
- `#/mochi`：旧跳跃小游戏
- `#/shop`：旧商店

旧的 `#/?song=HRBE...` 回声花房分享链接会自动转到 `/echo`，新的旧游戏分享链接使用 `/echo`。

`npm ci` → `npm run build` → `npm start`，继续使用现有 Node 服务的 3001 端口。这个分支的更改需要同步到 Ubuntu 项目目录后重新构建、启动；本地开发不会自动更新服务器。

本地开发需要同时运行 `npm run dev` 与 `npm run dev:server`，Vite 将 `/api` 转发到 3001。部署保留完整项目中的 `server` 和共享规则文件 `src/features/melody/rules.mjs`，并备份数据目录；不要只上传前端构建文件。

## 插画来源

内置 image_gen 工具生成，文件：`public/assets/mochi-melody/band-hero.png`。四个实时舞台角色为代码绘制的 SVG，页面其他装饰为 CSS。音色为 Web Audio 合成，没有引用第三方歌曲。

生成提示词：

> Use case: illustration-story. Asset type: wide hero illustration for a cute browser music rhythm game. Create a beautifully polished cozy illustration of a tiny animal band on a mint-green picnic stage in a dreamy pastel garden: a round cream kitten playing a peach drum, a fluffy white rabbit playing a lavender miniature keyboard, a round caramel bear holding a small upright bass, and a tiny yellow bird singing into a pink flower-shaped microphone. All four have very simple dot eyes, soft blush cheeks, chunky rounded shapes, and charming tiny paws, pastel Scandinavian storybook illustration with smooth soft gouache textures and fine warm brown contours. The stage is set among small daisy flowers, mushrooms, floating musical notes, string bunting, and puffy pale pink clouds. The composition is horizontal landscape, four animals side by side in the lower middle, clear readable silhouettes, broad cream and mint negative space around them; cheerful sunlight, gentle shadows, subtle grain, sophisticated restrained palette of cream, mint, apricot, blush pink and lilac. No text, no letters, no watermark, no logo, no interface elements. Finished high quality game art, not a screenshot or mockup.

## 验证

- `npm run build`、`npm run lint`、`npm test`；全项目 7 个测试文件、59 项测试。
- 新增判定、漏拍、重复按键、双音谱面、星级、最佳记录、存档容错和乐谱分享编码测试。
- 浏览器实际键盘演奏：练习 8/8 全部命中，820 分、100% 准确度；正式曲目 22/22 命中，2375 分、三星、最长连击 22。
- 正式演出后刷新页面，最佳成绩与 3 颗星保留，「云朵摇摇」正常解锁。
- 检查桌面与 390×844 手机布局、暂停恢复、演出回放、实时改谱、两个小节的切换、分享链接还原谱面与速度、旧回声花房邀请兼容；浏览器未记录运行错误。
- 排行榜浏览器实测：22/22 完美命中，2,410 分、100% 准确度、最长连击 22，主动填写「草莓泡芙」并成功提交为第 1 名；仅使用 `/private/tmp` 独立测试数据库。检查空昵称、空榜、手机布局、服务中断重试和服务重启后的成绩保留。
- 服务端测试覆盖九个榜单的判分一致性、多拍惩罚、非法输入与伪造总分、同名不同玩家、最佳成绩保留、同分排序、50 名外个人排名、API 请求与错误响应。

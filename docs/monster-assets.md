# 怪潮素材与出场

运行素材为 `public/assets/monsters/` 的七张 PNG，来自本次提供的 `design-assets/monsters/` 同名透明素材。原始生成稿、JPG 预览和其他宣传图不参与游戏渲染；运行素材不再引用之前的程序绘制形象，加载失败才使用简化回退。

| 文件 | 对应怪物 | 出场阈值 |
| --- | --- | --- |
| monster-chaser.png | 追击音团 | 0 秒 |
| monster-bat.png | 疾拍蝙蝠 | 10 秒 |
| monster-noise.png | 噪音怪 | 20 秒 |
| monster-heavy-speaker.png | 重装音箱 | 35 秒 |
| monster-elite-record.png | 金唱片精英 | 45 秒 |
| boss-drum-beast.png | 鼓噪巨兽 | 60 秒，短弓 48 秒 |
| boss-bass-king.png | 低音炮王 | 90 秒，短弓 72 秒 |

出场阈值、名称、素材和玩法说明来自 `src/features/farm/monsters.mjs`。具体攻击、间隔、预警和上限见 [战斗规则](music-farm.md#战斗规则)。每个图片在首次加载时缓存为 192px 画布，避免逐帧缩放 1024px 原图。镜头插值只处理显示位置，冲刺方向、攻击时刻与判定仍由 16 Hz 共享规则计算。

规则版本为 `v6-levels`，服务端与客户端构建必须一起更新。历史数据库记录不删除，当前榜单只读新版前缀；客户端旧版请求会提示刷新。本机最佳纪录按版本隔离，角色、金币、任务、成就及生涯存档延续。

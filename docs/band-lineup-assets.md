# 乐队集结角色素材

参照 [乐队集结海报](../design-assets/posters/poster-band-lineup.png)，使用内置 imagegen 的 background-extraction 模式生成九张透明 PNG。PNG 原稿保存在 `design-assets/band-lineup/`，游戏使用 `public/assets/band-lineup/` 中的高质量 WebP；角色商店、游戏角色和排行榜共用 `src/features/farm/characterRoster.mjs`。

海报文字写“十位成员”，实际可见九位；商店对应这九位，不新增海报之外的形象。旧角色图片已移除；旧存档 ID 通过迁移别名转换，保留当前游戏的金币、已解锁角色、选择与奖励去重记录；旧星星商店已删除。别名不出现在商店中。

运行图保留原尺寸及无损透明通道，导出方式见 [素材压缩说明](asset-compression.md)。

| 新角色 ID | 素材文件 | 旧 ID |
| --- | --- | --- |
| bear-drums | bear.webp | steampunk |
| cat-guitar | cat.webp | default |
| lion-bass | lion.webp | — |
| bird-vocals | bird.webp | neon |
| crocodile-beat | crocodile.webp | burger-dog |
| hamster-keys | hamster.webp | — |
| rabbit-flute | rabbit.webp | penguin |
| fox-sax | fox.webp | golden |
| robot-dj | robot.webp | shadow |

## 生成提示词

参考图为上述海报；每张独立调用，设置 transparent_background=true。

共同提示词：

> Use case: background-extraction. Asset type: individual game character transparent PNG cutout. Input image is the edit target and exact identity reference. Extract ONLY [subject]. Reproduce this exact character and its original watercolor crayon paper texture, rounded chibi proportions, warm brown outlines and gentle pastel shading. Keep face, species, colors, costume, instrument and pose faithful to the poster. Entire isolated character and instrument visible, centered with comfortable transparent padding, square canvas. Remove poster background, lettering, stars, neighboring characters, white sticker border and black record platform. True transparent alpha background. No extra characters, no text, no watermark. One individual game sprite, not a lineup.

subject 分别为：

- bear: the brown teddy bear drummer at the upper left of the band's lineup, with its chocolate brown beret, blue neck scarf, drumsticks and entire small peach drum kit and cymbal.
- cat: the orange tabby cat guitarist in the upper row second from left, with soft orange stripes and pink cheeks, holding and playing the dusty rose electric guitar.
- lion: the lavender purple lion playing a tall brown upright double bass in the upper row, including the yellow heart-shaped mane tuft, fluffy scalloped purple mane and entire double bass.
- bird: the round pink bird singer on the upper right, with pink head feather crest, yellow beak and feet, yellow bow tie, silver microphone and microphone stand.
- crocodile: the small green crocodile wearing big over-ear silver and brown headphones at the bottom left, with rounded green spikes, pale yellow belly, short paws and friendly fangs; no extra instrument.
- hamster: the round caramel brown hamster keyboard player in the lower row second from left, with tan cheeks, cream belly and head tuft, playing the pastel violet and blue electronic keyboard on a small stand.
- rabbit: the cream white long-eared rabbit flutist in the lower row center, with pink ear interiors and pink cheeks, holding and playing the golden flute diagonally.
- fox: the orange fox saxophonist in the lower row second from right, with cream muzzle, fluffy tail and green trousers, holding and playing the entire golden saxophone.
- robot: the friendly pale grey DJ robot with dark screen face and two cyan oval eyes in the lower right, wearing pastel purple over-ear headphones and performing at the grey two-deck turntable console.

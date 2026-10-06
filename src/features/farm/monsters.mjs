// Appearance timing and art are shared by the battle, help and server replay.
export const FARM_RULESET = 'v6-levels'
export const FARM_SCORE_PREFIX = `farm:${FARM_RULESET}:`
export const farmBestKey = (day) => `farm-best-${FARM_RULESET}:${day}`
export const MONSTERS = [
  {
    id: 'chaser',
    name: '追击音团',
    kind: 0,
    starts: 0,
    size: 52,
    image: './assets/monsters/monster-chaser.png',
    attack: '持续追击，贴身碰撞。保持走位，避免被包围。',
  },
  {
    id: 'bat',
    name: '疾拍蝙蝠',
    kind: 1,
    starts: 10,
    size: 60,
    image: './assets/monsters/monster-bat.png',
    attack: '快速接近；亮起冲刺线后蓄力半秒，沿锁定方向突进。横向闪避。',
  },
  {
    id: 'noise',
    name: '噪音怪',
    kind: 2,
    starts: 20,
    size: 64,
    image: './assets/monsters/monster-noise.png',
    attack: '保持距离，蓄能后发射瞄准音弹；两分钟后升级为三连扇射。绕开弹道。',
  },
  {
    id: 'heavy',
    name: '重装音箱',
    kind: 3,
    starts: 35,
    size: 72,
    image: './assets/monsters/monster-heavy-speaker.png',
    attack: '血厚移动慢，近身后原地蓄力砸地。离开橙圈，击破可打断。',
  },
  {
    id: 'elite',
    name: '金唱片精英',
    kind: 3,
    starts: 45,
    size: 80,
    image: './assets/monsters/monster-elite-record.png',
    attack: '预警后直线冲刺；90 秒后冲刺结束会散射金色音弹。击破奖励更多。',
  },
  {
    id: 'drum-boss',
    name: '鼓噪巨兽',
    kind: 3,
    boss: true,
    starts: 60,
    interval: 18,
    size: 112,
    image: './assets/monsters/boss-drum-beast.png',
    attack: '追击并锁定你的落点，红圈预警一秒后砸地；两分钟后连续锁定两处。',
  },
  {
    id: 'bass-boss',
    name: '低音炮王',
    kind: 3,
    boss: true,
    starts: 90,
    interval: 45,
    size: 120,
    image: './assets/monsters/boss-bass-king.png',
    attack: '每三秒释放八向环形弹幕，每六秒锁定大范围砸地。走弹幕间隙。',
  },
]
export const regularMonsterKind = (tick, fps, id) => {
  const available = MONSTERS.filter(
    (monster) => !monster.boss && monster.id !== 'elite' && tick >= monster.starts * fps,
  )
  return available[(id + Math.floor(tick / (10 * fps))) % available.length].kind
}
export const monsterFor = (enemy) =>
  MONSTERS.find(
    (monster) =>
      monster.id ===
      (enemy.bass
        ? 'bass-boss'
        : enemy.boss
          ? 'drum-boss'
          : enemy.elite
            ? 'elite'
            : ['chaser', 'bat', 'noise', 'heavy'][enemy.kind]),
  )

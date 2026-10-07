import { MAX_GEAR_LEVEL, RECIPES, TALENTS, evolved } from './rules.mjs'

// 流派 = 一件核心乐器 + 它的专属芯片 + 两者满级后的进化形态。
// 组合技 = 跨流派前提，达成后自动生效，不占槽位、不消耗资源。
// 这一层只描述数据与数值，判定与生效都在下面的纯函数里完成，
// 因此同样的 gear 永远得到同样的结果（重放可复现）。

// 这里只补流派名与定位，乐器、芯片、进化名与配色全部复用 rules.mjs 的既有常量。
const SCHOOL_DEFINITIONS = [
  {
    id: 'drum',
    name: '鼓组流',
    style: '连锁爆破',
    tagline: '击杀引爆周围怪群，清场最快，但怕散兵',
  },
  { id: 'orbit', name: '吉他流', style: '环绕音刃', tagline: '音刃绕身护体，输出平稳还能挡下弹幕' },
  {
    id: 'power',
    name: '贝斯流',
    style: '贯穿收割',
    tagline: '低音光柱与黑洞成片收割，经验自己涌来',
  },
  { id: 'echo', name: '主唱流', style: '自动追踪', tagline: '高音箭雨自己找怪，站着也能打满全场' },
  {
    id: 'bell',
    name: '键盘流',
    style: '环形冲击',
    tagline: '星浪推开身边怪群，被围住时的解围手段',
  },
  {
    id: 'whistle',
    name: '长笛流',
    style: '残留音阵',
    tagline: '走过的路变成持续伤害区，走位就是输出',
  },
  {
    id: 'sax',
    name: '萨克斯流',
    style: '冲刺控制',
    tagline: '号角波撞飞并拖慢一排怪，控场能力最强',
  },
  {
    id: 'sampler',
    name: '采样台流',
    style: '音爆连锁',
    tagline: '埋下的采样延时炸开，适合绕圈拉怪',
  },
  { id: 'deck', name: '唱盘流', style: '回响弹幕', tagline: '宽音刃绕身并弹射连锁，怪越密越强' },
  {
    id: 'synth',
    name: '合成器流',
    style: '扇形棱镜',
    tagline: '扇形音浪穿透一排怪，方向感决定上限',
  },
]

// 增幅一律保守，且只放大既有数值：组合技不发明新的攻击机制，
// 这样既有平衡回归与逐帧重放都不会被破坏。
export const RESONANCE_STORM_DAMAGE = 0.15
export const RESONANCE_STORM_AREA = 0.08
export const BASS_TRAP_RESIDUE = 0.25
export const BASS_TRAP_ATTRACTION = 0.2
export const METAL_ECHO_BLADE = 0.15
export const METAL_ECHO_ORBIT = 0.15
export const METAL_ECHO_RICOCHET = 0.5
export const STAR_CHOIR_SHOCK = 0.2
export const STAR_CHOIR_RAIN = 0.15
export const BRASS_FRENZY_HORN = 0.2
export const BRASS_FRENZY_MINE = 0.25
export const FULL_ENCORE_DAMAGE = 0.08
export const FULL_ENCORE_ATTRACTION = 0.15
// 全场安可需要的进化流派数。
export const FULL_ENCORE_SCHOOLS = 3

// 组合技提供的增益键，comboModifiers 总是返回完整的一份，
// 未达成时全是 1，调用方无需判断某个组合是否生效。
export const COMBO_BONUS_KEYS = [
  'damage',
  'attraction',
  'blast',
  'blastArea',
  'fan',
  'fanArea',
  'residue',
  'orbit',
  'blade',
  'ricochet',
  'shock',
  'rain',
  'horn',
  'mine',
]

const percent = (value) => `${Math.round(value * 100)}%`

export const COMBOS = [
  {
    id: 'resonance',
    name: '共振风暴',
    icon: '🌀',
    requires: ['drum', 'synth'],
    requirement: '鼓组流 + 合成器流都进化',
    effect: `连锁爆破与扇形音浪伤害 +${percent(RESONANCE_STORM_DAMAGE)}、范围 +${percent(RESONANCE_STORM_AREA)}`,
    bonus: {
      blast: RESONANCE_STORM_DAMAGE,
      blastArea: RESONANCE_STORM_AREA,
      fan: RESONANCE_STORM_DAMAGE,
      fanArea: RESONANCE_STORM_AREA,
    },
  },
  {
    id: 'basspit',
    name: '低音陷阱',
    icon: '🕳️',
    requires: ['power', 'whistle'],
    requirement: '贝斯流 + 长笛流都进化',
    effect: `长笛残留音阵伤害 +${percent(BASS_TRAP_RESIDUE)}、拾取范围 +${percent(BASS_TRAP_ATTRACTION)}`,
    bonus: { residue: BASS_TRAP_RESIDUE, attraction: BASS_TRAP_ATTRACTION },
  },
  {
    id: 'metalecho',
    name: '金属回响',
    icon: '🎸',
    requires: ['orbit', 'deck'],
    requirement: '吉他流 + 唱盘流都进化',
    effect: `吉他与唱盘音刃伤害各 +${percent(METAL_ECHO_BLADE)}、回响弹伤害 +${percent(METAL_ECHO_RICOCHET)}`,
    bonus: {
      orbit: METAL_ECHO_ORBIT,
      blade: METAL_ECHO_BLADE,
      ricochet: METAL_ECHO_RICOCHET,
    },
  },
  {
    id: 'starchoir',
    name: '星海合唱',
    icon: '🌟',
    requires: ['echo', 'bell'],
    requirement: '主唱流 + 键盘流都进化',
    effect: `键盘星浪伤害 +${percent(STAR_CHOIR_SHOCK)}、追踪音雨伤害 +${percent(STAR_CHOIR_RAIN)}`,
    bonus: { shock: STAR_CHOIR_SHOCK, rain: STAR_CHOIR_RAIN },
  },
  {
    id: 'brassfrenzy',
    name: '铜管狂潮',
    icon: '🎷',
    requires: ['sax', 'sampler'],
    requirement: '萨克斯流 + 采样台流都进化',
    effect: `号角冲刺波伤害 +${percent(BRASS_FRENZY_HORN)}、音爆采样伤害 +${percent(BRASS_FRENZY_MINE)}`,
    bonus: { horn: BRASS_FRENZY_HORN, mine: BRASS_FRENZY_MINE },
  },
  {
    id: 'encore',
    name: '全场安可',
    icon: '🎆',
    requires: [],
    any: FULL_ENCORE_SCHOOLS,
    requirement: `任意 ${FULL_ENCORE_SCHOOLS} 个流派完成进化`,
    effect: `全部伤害 +${percent(FULL_ENCORE_DAMAGE)}、拾取范围 +${percent(FULL_ENCORE_ATTRACTION)}`,
    bonus: { damage: FULL_ENCORE_DAMAGE, attraction: FULL_ENCORE_ATTRACTION },
  },
]

let derivedCache = null
// 乐器名、芯片名、进化形态与配色都在 rules.mjs 里，而 rules.mjs 又要用到本模块的
// 组合技增益：两个模块互相引用，顶层直接展开 RECIPES 会撞上尚未初始化的绑定。
// 所以这些字段做成取值时才计算的派生属性，第一次读到之后缓存下来。
function derivedFor(id) {
  if (!derivedCache) derivedCache = {}
  if (!derivedCache[id]) {
    const recipe = RECIPES.find((item) => item.weapon === id)
    const weapon = TALENTS.find((talent) => talent.id === recipe.weapon)
    const chip = TALENTS.find((talent) => talent.id === recipe.chip)
    derivedCache[id] = {
      chip: recipe.chip,
      weaponName: weapon.name,
      weaponIcon: weapon.icon,
      chipName: chip.name,
      chipIcon: chip.icon,
      color: weapon.color,
      form: recipe.name,
      formIcon: recipe.icon,
      formDescription: recipe.description,
    }
  }
  return derivedCache[id]
}

// 界面直接用的一张表：id、流派名、核心乐器、专属芯片、进化形态、一句话定位、配色。
export const SCHOOLS = SCHOOL_DEFINITIONS.map((school) => ({
  id: school.id,
  name: school.name,
  weapon: school.id,
  style: school.style,
  tagline: school.tagline,
  blurb: `${school.style}：${school.tagline}`,
  get chip() {
    return derivedFor(school.id).chip
  },
  get chipName() {
    return derivedFor(school.id).chipName
  },
  get chipIcon() {
    return derivedFor(school.id).chipIcon
  },
  get weaponName() {
    return derivedFor(school.id).weaponName
  },
  get weaponIcon() {
    return derivedFor(school.id).weaponIcon
  },
  get color() {
    return derivedFor(school.id).color
  },
  get form() {
    return derivedFor(school.id).form
  },
  get formIcon() {
    return derivedFor(school.id).formIcon
  },
  get formDescription() {
    return derivedFor(school.id).formDescription
  },
}))

export const schools = () => SCHOOLS

export const schoolById = (id) => SCHOOLS.find((school) => school.id === id)

const gearOf = (source) => source?.gear ?? source

// 组合技是否达成：显式流派要全部进化，全场安可只数进化个数。
function comboMet(combo, gear, forms) {
  if (combo.any) return forms.length >= combo.any
  return combo.requires.every((id) => forms.includes(id))
}

// 差一点就达成：显式流派每个已进化的算到位，剩下的要有一件满级；
// 全场安可只差一个进化。
function comboAlmost(combo, gear, forms) {
  if (combo.any) return forms.length === combo.any - 1
  return combo.requires.every((id) => {
    if (forms.includes(id)) return true
    const school = schoolById(id)
    return Math.max(gear[school.weapon] ?? 0, gear[school.chip] ?? 0) >= MAX_GEAR_LEVEL
  })
}

// 当前生效的组合技。入参是完整的 farm state（也可以直接传 gear），
// 刚开局装备全 0 时安全返回空数组。只依赖 gear，所以重放逐帧可复现。
export function activeCombos(state) {
  const gear = gearOf(state)
  const forms = evolved(gear)
  return COMBOS.filter((combo) => comboMet(combo, gear, forms))
}

// 把生效组合技的数值增益折成一组乘数，未涉及的键恒为 1。
// 同一个键上的多个组合叠加方式与既有加成一致：加算到同一个 1 + 上。
export function comboModifiers(state) {
  const multipliers = Object.fromEntries(COMBO_BONUS_KEYS.map((key) => [key, 1]))
  for (const combo of activeCombos(state))
    for (const [key, value] of Object.entries(combo.bonus)) multipliers[key] += value
  return multipliers
}

// 差一点的那些组合技，附一句中文提示告诉玩家还差什么。
export function nearCombos(state) {
  const gear = gearOf(state)
  const forms = evolved(gear)
  return COMBOS.filter(
    (combo) => !comboMet(combo, gear, forms) && comboAlmost(combo, gear, forms),
  ).map((combo) => ({
    id: combo.id,
    name: combo.name,
    icon: combo.icon,
    missing: missingOf(combo, gear, forms),
  }))
}

function missingOf(combo, gear, forms) {
  if (combo.any) return `还差 ${combo.any - forms.length} 个流派进化`
  const parts = combo.requires
    .filter((id) => !forms.includes(id))
    .map((id) => {
      const school = schoolById(id)
      const remaining =
        Math.max(0, MAX_GEAR_LEVEL - (gear[school.weapon] ?? 0)) +
        Math.max(0, MAX_GEAR_LEVEL - (gear[school.chip] ?? 0))
      return `「${school.name}」还差 ${remaining} 级进化`
    })
  return parts.join('、')
}

// 流派层数：0 未接触、1 已有核心乐器、2 乐器与芯片齐备、
// 3 其中一件满级、4 已进化。
function schoolTier(gear, school, isEvolved) {
  const weaponLevel = gear[school.weapon] ?? 0
  const chipLevel = gear[school.chip] ?? 0
  if (isEvolved) return 4
  if (weaponLevel >= MAX_GEAR_LEVEL || chipLevel >= MAX_GEAR_LEVEL) return 3
  if (weaponLevel > 0 && chipLevel > 0) return 2
  return weaponLevel > 0 || chipLevel > 0 ? 1 : 0
}

// 给升级页与帮助页用：每个流派当前走到第几层、还差多少级。
export function schoolProgress(state) {
  const gear = gearOf(state)
  const forms = evolved(gear)
  return SCHOOLS.map((school) => {
    const weaponLevel = gear[school.weapon] ?? 0
    const chipLevel = gear[school.chip] ?? 0
    const isEvolved = forms.includes(school.id)
    return {
      ...school,
      weaponLevel,
      chipLevel,
      tier: schoolTier(gear, school, isEvolved),
      evolved: isEvolved,
      remaining:
        Math.max(0, MAX_GEAR_LEVEL - weaponLevel) + Math.max(0, MAX_GEAR_LEVEL - chipLevel),
    }
  })
}

// 已经达成的组合技、差一点的提示，以及本局进化了几个流派。
export function comboProgress(state) {
  return {
    active: activeCombos(state),
    near: nearCombos(state),
    evolvedSchools: evolved(gearOf(state)).length,
  }
}

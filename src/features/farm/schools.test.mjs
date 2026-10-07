import { describe, expect, it } from 'vitest'
import {
  BASS_TRAP_ATTRACTION,
  BASS_TRAP_RESIDUE,
  COMBOS,
  FULL_ENCORE_ATTRACTION,
  FULL_ENCORE_DAMAGE,
  MAX_GEAR_LEVEL,
  RECIPES,
  RESONANCE_STORM_DAMAGE,
  SCHOOLS,
  TALENTS,
  activeCombos,
  comboModifiers,
  comboProgress,
  createFarm,
  evolved,
  nearCombos,
  schoolProgress,
  schools,
  stepFarm,
} from './rules.mjs'

const day = '2026-10-04'
const emptyGear = () => Object.fromEntries(TALENTS.map((talent) => [talent.id, 0]))
// 只把给定的流派推到进化，其它保持空槽。
const gearWith = (...schoolIds) => {
  const gear = emptyGear()
  for (const id of schoolIds) {
    const recipe = RECIPES.find((item) => item.weapon === id)
    gear[recipe.weapon] = MAX_GEAR_LEVEL
    gear[recipe.chip] = MAX_GEAR_LEVEL
  }
  return gear
}
const ids = (combos) => combos.map((combo) => combo.id)
// 弱音器把范围加成垫高，让长笛的音阵正好够到这只假想怪，
// 而黑洞（32）、光柱、主脉冲与音刃都落在它之外：
// 于是这段时间里打在它身上的伤害只来自残留音阵，可以直接比比值。
const REACH = { mute: MAX_GEAR_LEVEL }
// 一只站着不动、血量极高的假想怪：它既不会死也不会走，
// 于是同一段时间里打在它身上的总伤害可以直接对比。
function punchingBag() {
  return {
    id: 1,
    x: 74,
    y: 76,
    kind: 0,
    hp: 1e5,
    maxHp: 1e5,
    regrow: Infinity,
    boss: false,
    attackUntil: Infinity,
  }
}
// 站在玩家另一侧、更近的一只怪：它会替假想怪挨下所有追着最近目标打的攻击。
function decoy() {
  return {
    id: 2,
    x: 35.4,
    y: 34.2,
    kind: 0,
    hp: 1e5,
    maxHp: 1e5,
    regrow: Infinity,
    boss: false,
    attackUntil: Infinity,
  }
}
function damageDealt(gear, ticks = 128, extra = []) {
  const state = createFarm(day)
  Object.assign(state, {
    position: [50, 50],
    crops: [punchingBag(), ...extra],
    tick: 0,
    nextBoss: Infinity,
    nextBass: Infinity,
    nextWave: Infinity,
  })
  Object.assign(state.gear, gear)
  let running = state
  for (let tick = 0; tick < ticks; tick++) running = stepFarm(running, running.position).state
  return 1e5 - running.crops[0].hp
}

describe('music roguelite schools', () => {
  it('gives every recipe one school and reuses the instrument and form data', () => {
    const list = schools()
    expect(list).toHaveLength(RECIPES.length)
    for (const school of list) {
      const recipe = RECIPES.find((item) => item.weapon === school.id)
      expect(school.chip).toBe(recipe.chip)
      expect(school.form).toBe(recipe.name)
      expect(school.color).toBe(TALENTS.find((talent) => talent.id === school.id).color)
      expect(school.name.length).toBeGreaterThan(0)
      expect(school.tagline.length).toBeGreaterThan(0)
    }
    expect(new Set(list.map((school) => school.id)).size).toBe(list.length)
  })

  it('keeps every combo dormant until its schools are all evolved', () => {
    const gear = emptyGear()
    expect(activeCombos(gear)).toEqual([])
    for (const school of schools()) {
      const partial = {
        ...gear,
        [school.weapon]: MAX_GEAR_LEVEL,
        [school.chip]: MAX_GEAR_LEVEL - 1,
      }
      expect(activeCombos(partial)).toEqual([])
    }
    expect(Object.values(comboModifiers(gear)).every((value) => value === 1)).toBe(true)
  })

  it('activates each cross-school combo only on its own pair, and the encore on any three', () => {
    for (const combo of COMBOS.filter((item) => !item.any)) {
      expect(ids(activeCombos(gearWith(...combo.requires)))).toEqual([combo.id])
      // 差一件芯片：流派没进化，组合技就必须退回去。
      const short = gearWith(...combo.requires)
      const recipe = RECIPES.find((item) => item.weapon === combo.requires[0])
      short[recipe.chip] = MAX_GEAR_LEVEL - 1
      expect(ids(activeCombos(short))).toEqual([])
    }
    expect(ids(activeCombos(gearWith('drum', 'whistle', 'deck')))).toEqual(['encore'])
    expect(ids(activeCombos(gearWith('drum', 'whistle')))).toEqual([])
    expect(ids(activeCombos(gearWith('drum', 'synth', 'power', 'whistle')))).toEqual([
      'resonance',
      'basspit',
      'encore',
    ])
  })

  it('scales the numbers a combo names, and nothing else', () => {
    const modifiers = comboModifiers(gearWith('drum', 'synth'))
    expect(modifiers.blast).toBeCloseTo(1 + RESONANCE_STORM_DAMAGE, 10)
    expect(modifiers.fan).toBeCloseTo(1 + RESONANCE_STORM_DAMAGE, 10)
    // 无关的一律保持 1：组合技只放大它自己承诺的那一路伤害。
    expect(modifiers.rain).toBe(1)
    expect(modifiers.damage).toBe(1)
  })

  it('raises residue damage by exactly the low-end trap multiplier', () => {
    // 只有长笛的音阵能够到这只怪：贝斯的黑洞与光柱都在它的射程之外，
    // 所以总伤害的比值就是低音陷阱的残留加成。
    const base = { whistle: MAX_GEAR_LEVEL, delay: MAX_GEAR_LEVEL, power: MAX_GEAR_LEVEL, ...REACH }
    const bass = { ...base, magnet: MAX_GEAR_LEVEL }
    const plain = { ...base, magnet: MAX_GEAR_LEVEL - 1 }
    expect(activeCombos(plain)).toEqual([])
    expect(ids(activeCombos(bass))).toEqual(['basspit'])
    expect(damageDealt(bass) / damageDealt(plain)).toBeCloseTo(1 + BASS_TRAP_RESIDUE, 4)
  })

  it('raises every hit once the third school evolves into the full encore', () => {
    // 只切换鼓组的芯片：共鸣音箱不产生任何伤害，多出的鼓组进化只带来全场安可。
    // 鼓点打在最近的怪身上，所以再放一只更近的诱饵怪把鼓点引开：
    // 这样连满级鼓组的爆炸也够不到假想怪。
    const base = {
      whistle: MAX_GEAR_LEVEL,
      delay: MAX_GEAR_LEVEL,
      deck: MAX_GEAR_LEVEL,
      needle: MAX_GEAR_LEVEL,
      drum: MAX_GEAR_LEVEL,
      ...REACH,
    }
    const two = { ...base, range: MAX_GEAR_LEVEL - 1 }
    const three = { ...base, range: MAX_GEAR_LEVEL }
    expect(activeCombos(two)).toEqual([])
    expect(ids(activeCombos(three))).toEqual(['encore'])
    expect(damageDealt(three, 128, [decoy()]) / damageDealt(two, 128, [decoy()])).toBeCloseTo(
      1 + FULL_ENCORE_DAMAGE,
      4,
    )
  })

  it('stacks the bonuses of every combo that is active at once', () => {
    // 低音陷阱（残留 + 拾取）叠加全场安可（全局伤害 + 拾取）：
    // 两条组合技的拾取加成加在同一个倍率上。
    const gear = {
      whistle: MAX_GEAR_LEVEL,
      delay: MAX_GEAR_LEVEL,
      power: MAX_GEAR_LEVEL,
      magnet: MAX_GEAR_LEVEL,
      orbit: MAX_GEAR_LEVEL,
      tempo: MAX_GEAR_LEVEL,
      ...REACH,
    }
    expect(ids(activeCombos(gear))).toEqual(['basspit', 'encore'])
    const modifiers = comboModifiers(gear)
    expect(modifiers.attraction).toBeCloseTo(1 + BASS_TRAP_ATTRACTION + FULL_ENCORE_ATTRACTION, 10)
    expect(modifiers.residue).toBeCloseTo(1 + BASS_TRAP_RESIDUE, 10)
    expect(modifiers.damage).toBeCloseTo(1 + FULL_ENCORE_DAMAGE, 10)
    // 两条同时生效时，音阵伤害吃到残留加成与全局加成的乘积。
    const plain = { ...gear, magnet: MAX_GEAR_LEVEL - 1, orbit: MAX_GEAR_LEVEL - 1 }
    expect(activeCombos(plain)).toEqual([])
    expect(damageDealt(gear) / damageDealt(plain)).toBeCloseTo(
      (1 + BASS_TRAP_RESIDUE) * (1 + FULL_ENCORE_DAMAGE),
      4,
    )
  })

  it('judges the same build the same way twice, which is what replays rely on', () => {
    const state = createFarm(day)
    Object.assign(state.gear, gearWith('sax', 'sampler', 'bell'))
    const first = activeCombos(state)
    const second = activeCombos(structuredClone(state))
    expect(second).toEqual(first)
    expect(comboModifiers(structuredClone(state))).toEqual(comboModifiers(state))
    expect(ids(first)).toEqual(['brassfrenzy', 'encore'])
    // 判定只依赖装备：把整局推进若干帧后结论不变。
    let running = state
    for (let tick = 0; tick < 64; tick++) running = stepFarm(running, running.position).state
    expect(ids(activeCombos(running))).toEqual(ids(first))
  })

  it('reports school tiers and the combos that are one step away', () => {
    const state = createFarm(day)
    Object.assign(state.gear, {
      drum: MAX_GEAR_LEVEL,
      range: MAX_GEAR_LEVEL,
      synth: MAX_GEAR_LEVEL,
      arp: MAX_GEAR_LEVEL - 1,
      whistle: 2,
    })
    const progress = schoolProgress(state)
    expect(progress).toHaveLength(RECIPES.length)
    expect(progress.find((item) => item.id === 'drum').tier).toBe(4)
    // 合成器只差一件芯片：层数停在半满，剩余 1 级。
    expect(progress.find((item) => item.id === 'synth')).toMatchObject({
      tier: 3,
      evolved: false,
      weaponLevel: MAX_GEAR_LEVEL,
      chipLevel: MAX_GEAR_LEVEL - 1,
      remaining: 1,
    })
    expect(progress.find((item) => item.id === 'whistle').tier).toBe(1)
    expect(progress.find((item) => item.id === 'bell').tier).toBe(0)
    const combos = comboProgress(state)
    // 鼓组已进化、合成器差一件：共振风暴还差一点，还没有组合技生效。
    expect(combos.active).toEqual([])
    expect(combos.near.map((item) => item.id)).toEqual(['resonance'])
    expect(combos.evolvedSchools).toBe(evolved(state.gear).length)
    // 补上琶音器就立刻生效。
    const complete = { ...state.gear, arp: MAX_GEAR_LEVEL }
    expect(ids(comboProgress({ gear: complete }).active)).toEqual(['resonance'])
    // 两个流派进化后，全场安可也进入差一点。
    expect(comboProgress({ gear: complete }).near.map((item) => item.id)).toEqual(['encore'])
  })

  it('exports the shape the upgrade and help pages ask for', () => {
    // SCHOOLS：id、流派名、核心乐器、专属芯片、进化形态、一句话定位、配色。
    expect(SCHOOLS).toHaveLength(RECIPES.length)
    for (const school of SCHOOLS) {
      expect(typeof school.id).toBe('string')
      expect(typeof school.name).toBe('string')
      expect(school.weapon).toBe(school.id)
      expect(typeof school.chip).toBe('string')
      expect(school.form).toBe(RECIPES.find((item) => item.weapon === school.id).name)
      expect(school.color).toBe(TALENTS.find((talent) => talent.id === school.id).color)
      expect(school.blurb).toContain('：')
    }
    // COMBOS：id、名称、图标、前提、效果，效果里带上具体数值。
    for (const combo of COMBOS) {
      expect(typeof combo.requirement).toBe('string')
      expect(combo.requirement.length).toBeGreaterThan(0)
      expect(combo.effect).toMatch(/\d+%/)
      expect(combo.icon.length).toBeGreaterThan(0)
    }
    // 刚开局的空 state 上调用是安全的。
    const fresh = createFarm(day)
    expect(activeCombos(fresh)).toEqual([])
    expect(nearCombos(fresh)).toEqual([])
    expect(comboProgress(fresh)).toEqual({ active: [], near: [], evolvedSchools: 0 })
  })

  it('names what each near combo is missing', () => {
    const state = createFarm(day)
    Object.assign(state.gear, {
      drum: MAX_GEAR_LEVEL,
      range: MAX_GEAR_LEVEL,
      synth: MAX_GEAR_LEVEL,
      arp: MAX_GEAR_LEVEL - 1,
    })
    const near = nearCombos(state)
    expect(near).toEqual([
      {
        id: 'resonance',
        name: '共振风暴',
        icon: '🌀',
        missing: '「合成器流」还差 1 级进化',
      },
    ])
    // 只差一个流派进化时，全场安可给出的是个数而不是流派名。
    const encore = nearCombos({ gear: gearWith('drum', 'whistle') })
    expect(encore.map((item) => item.id)).toEqual(['encore'])
    expect(encore[0].missing).toBe('还差 1 个流派进化')
    // 已经达成的组合技不会再出现在差一点里。
    const done = nearCombos({ gear: gearWith('drum', 'synth') })
    expect(done.map((item) => item.id)).toEqual(['encore'])
    expect(activeCombos({ gear: gearWith('drum', 'synth') }).map((item) => item.id)).toEqual([
      'resonance',
    ])
  })
})

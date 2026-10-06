import { describe, expect, it } from 'vitest'
import {
  FPS,
  MAX_EQUIPPED,
  MAX_GEAR_LEVEL,
  TALENTS,
  createFarm,
  evolved,
  stepFarm,
} from './rules.mjs'

const day = '2026-10-04'
const crop = (id, x, y, hp = 20) => ({
  id,
  x,
  y,
  hp,
  maxHp: hp,
  kind: id % 4,
  regrow: -1,
  boss: false,
})
function arena(gear, crops, tick = 0) {
  const state = createFarm(day)
  Object.assign(state, {
    position: [50, 50],
    crops,
    tick,
    aim: [1, 0],
    lastPulse: tick,
    nextBoss: Infinity,
    nextWave: Infinity,
  })
  Object.assign(state.gear, gear)
  return state
}

describe('the four new instruments', () => {
  it('blows a sax horn down the aim, damaging, slowing and shoving the row', () => {
    const state = arena({ sax: MAX_GEAR_LEVEL, mute: MAX_GEAR_LEVEL - 1 }, [crop(0, 58, 50)], 28)
    const result = stepFarm(state, state.position)
    const horn = result.events.find((event) => event.kind === 'horn')
    expect(horn).toBeTruthy()
    expect(horn.fromX).toBeGreaterThan(0)
    expect(result.state.crops[0].hp).toBeLessThan(20)
    expect(result.state.crops[0].slowUntil).toBeGreaterThan(state.tick)
    expect(result.state.crops[0].x).toBeGreaterThan(58)
    // The final form reaches further, so a monster far down the row is hit too.
    const ordinary = arena(
      { sax: MAX_GEAR_LEVEL, mute: MAX_GEAR_LEVEL - 1 },
      [crop(0, 122, 50)],
      28,
    )
    const terminal = arena({ sax: MAX_GEAR_LEVEL, mute: MAX_GEAR_LEVEL }, [crop(0, 122, 50)], 22)
    expect(evolved(terminal.gear)).toContain('sax')
    expect(stepFarm(ordinary, ordinary.position).state.crops[0].hp).toBe(20)
    expect(stepFarm(terminal, terminal.position).state.crops[0].hp).toBeLessThan(20)
  })

  it('arms a sampler beat on the floor and blows it up a second later', () => {
    const state = arena({ sampler: 2, trigger: 2 }, [crop(0, 52, 52)], 18)
    const planted = stepFarm(state, state.position).state
    expect(planted.mines).toHaveLength(1)
    expect(planted.crops[0].hp).toBe(20)
    const due = planted.mines[0].due
    let current = planted
    for (let index = 0; index < FPS + 4 && current.mines.length; index++)
      current = stepFarm(current, current.position).state
    expect(current.mines).toHaveLength(0)
    expect(current.crops[0].hp).toBeLessThan(20)
    expect(current.tick).toBeGreaterThanOrEqual(due)
  })

  it('spins dj blades that hit on contact and bounce a note when evolved', () => {
    const state = arena({ deck: MAX_GEAR_LEVEL, needle: MAX_GEAR_LEVEL - 1 }, [], 0)
    const angles = []
    for (let index = 0; index < 4; index++) {
      const blade = stepFarm({ ...state, tick: index * 2 }, state.position)
      angles.push(blade.state.tick)
    }
    // A monster sitting on the blade ring takes damage.
    const reach = 24 + MAX_GEAR_LEVEL * 3
    const hit = arena(
      { deck: MAX_GEAR_LEVEL, needle: MAX_GEAR_LEVEL - 1 },
      [crop(0, 50 + reach / 0.84, 50)],
      0,
    )
    const ordinary = stepFarm(hit, hit.position).state
    expect(ordinary.crops[0].hp).toBeLessThan(20)
    const terminalGear = { deck: MAX_GEAR_LEVEL, needle: MAX_GEAR_LEVEL }
    const pair = arena(
      terminalGear,
      [crop(0, 50 + reach / 0.84, 50), crop(1, 50 + reach / 0.84 + 12, 50)],
      0,
    )
    expect(evolved(pair.gear)).toContain('deck')
    const bounced = stepFarm(pair, pair.position)
    expect(bounced.events.some((event) => event.kind === 'ricochet')).toBe(true)
    expect(bounced.state.crops[1].hp).toBeLessThan(20)
  })

  it('fires a synth fan towards the closest monster and only inside its spread', () => {
    const state = arena({ synth: 2, arp: 2 }, [crop(0, 70, 50), crop(1, 30, 50)], 8)
    const result = stepFarm(state, state.position)
    const fan = result.events.find((event) => event.kind === 'fan')
    expect(fan).toBeTruthy()
    expect(Math.cos(fan.angle)).toBeGreaterThan(0)
    expect(result.state.crops[0].hp).toBeLessThan(20)
    expect(result.state.crops[1].hp).toBe(20)
    // The final form fires three fans at once.
    const terminal = arena({ synth: MAX_GEAR_LEVEL, arp: MAX_GEAR_LEVEL }, [crop(0, 70, 50)], 9)
    expect(evolved(terminal.gear)).toContain('synth')
    expect(
      stepFarm(terminal, terminal.position).events.filter((event) => event.kind === 'fan'),
    ).toHaveLength(3)
  })
})

describe('loadout slots', () => {
  it('stops dealing new instruments and chips once the five slots of a kind are full', () => {
    const state = createFarm(day)
    const weapons = TALENTS.filter((talent) => talent.kind === 'weapon')
      .slice(0, MAX_EQUIPPED)
      .map((talent) => talent.id)
    const chips = TALENTS.filter((talent) => talent.kind === 'chip')
      .slice(0, MAX_EQUIPPED)
      .map((talent) => talent.id)
    for (const id of [...weapons, ...chips]) state.gear[id] = 1
    state.level = weapons.length + chips.length
    state.xp = 1e9
    const offered = stepFarm(state, state.position).state.offered
    expect(offered.length).toBeGreaterThan(0)
    for (const id of offered) expect(state.gear[id]).toBeGreaterThan(0)
    // A fresh instrument cannot appear while every slot of its kind is taken.
    const fresh = TALENTS.filter((talent) => state.gear[talent.id] === 0).map((talent) => talent.id)
    for (const id of offered) expect(fresh).not.toContain(id)
  })

  it('still deals a new instrument while a slot is open', () => {
    const state = createFarm(day)
    state.gear[TALENTS[0].id] = 1
    state.level = 1
    state.xp = 1e9
    let sawNewcomer = false
    for (let index = 0; index < 400 && !sawNewcomer; index++) {
      const offered = stepFarm({ ...state, tick: index }, state.position).state.offered
      sawNewcomer = offered.some((id) => state.gear[id] === 0)
    }
    expect(sawNewcomer).toBe(true)
  })
})

describe('chips are universal stats', () => {
  it('lets a chip from another pair raise an unrelated instrument', () => {
    // Needle (the DJ chip) is flat damage for every attack.
    const plain = arena({ synth: 2 }, [crop(0, 70, 50)], 12)
    const boosted = arena({ synth: 2, needle: 3 }, [crop(0, 70, 50)], 12)
    expect(stepFarm(boosted, boosted.position).state.crops[0].hp).toBeLessThan(
      stepFarm(plain, plain.position).state.crops[0].hp,
    )
    // Resonator (the drum chip) widens every attack's reach.
    const narrow = arena({ synth: 2 }, [crop(0, 90, 50)], 12)
    const wide = arena({ synth: 2, range: MAX_EQUIPPED }, [crop(0, 90, 50)], 12)
    const narrowFan = stepFarm(narrow, narrow.position).events.find((event) => event.kind === 'fan')
    const wideFan = stepFarm(wide, wide.position).events.find((event) => event.kind === 'fan')
    expect(wideFan.radius).toBeGreaterThan(narrowFan.radius)
  })

  it('lets duration chips lengthen the effects of another instrument', () => {
    const brief = arena({ sax: 3 }, [crop(0, 58, 50)], 26)
    const long = arena({ sax: 3, sustain: 3 }, [crop(0, 58, 50)], 26)
    expect(stepFarm(long, long.position).state.crops[0].slowUntil).toBeGreaterThan(
      stepFarm(brief, brief.position).state.crops[0].slowUntil,
    )
  })
})

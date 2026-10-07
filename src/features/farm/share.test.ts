import { describe, expect, it } from 'vitest'
import {
  FARM_MAX_SUBMIT_FRAMES,
  FARM_TOO_LONG_MESSAGE,
  farmShareText,
  farmTooLongToSubmit,
} from './share'
import { MAX_GEAR_LEVEL, TALENTS } from './rules.mjs'
import type { FarmRound } from './rules.mjs'

const emptyGear = () =>
  Object.fromEntries(TALENTS.map((talent) => [talent.id, 0])) as FarmRound['gear']
const round = (patch: Partial<FarmRound> = {}): FarmRound => ({
  day: '2026-10-04',
  frames: [[50, 76]],
  choices: [],
  surges: [],
  outcome: 'defeated',
  hp: 0,
  seconds: 185,
  score: 12345,
  maxCombo: 40,
  harvested: 820,
  bosses: 5,
  elites: 2,
  blocks: 3,
  maxShields: 2,
  coins: 900,
  xp: 40,
  stars: 2,
  gear: { ...emptyGear(), drum: MAX_GEAR_LEVEL, range: MAX_GEAR_LEVEL },
  ...patch,
})

describe('result share text', () => {
  it('summarises the verified round in one line', () => {
    const text = farmShareText(round(), '2026-10-04')
    expect(text).toContain('怪潮乐队历险记 · 2026-10-04')
    expect(text).toContain('生存 3:05')
    expect(text).toContain('12,345 分')
    expect(text).toContain('击败 820')
    expect(text).toContain('巨兽 5')
    expect(text).toContain('精英 2')
    expect(text).toContain('挡下 3 次攻击')
    expect(text).toContain(`主力 鼓手咚咚 Lv.${MAX_GEAR_LEVEL}`)
    expect(text).toContain('终极 雷霆鼓组')
    expect(text.length).toBeLessThan(200)
  })
  it('flags a run that is longer than the server can replay', () => {
    const long = round({
      frames: Array.from(
        { length: FARM_MAX_SUBMIT_FRAMES + 1 },
        () => [50, 76] as FarmRound['frames'][number],
      ),
    })
    expect(farmTooLongToSubmit(round())).toBe(false)
    expect(farmTooLongToSubmit(null)).toBe(false)
    expect(farmTooLongToSubmit(long)).toBe(true)
    // The player is told why, instead of "成绩未通过校验".
    expect(FARM_TOO_LONG_MESSAGE).toContain('未上榜')
    expect(FARM_TOO_LONG_MESSAGE.length).toBeLessThan(20)
  })
  it('omits empty counters and works before the first run', () => {
    const text = farmShareText(round({ elites: 0, blocks: 0 }), '2026-10-04')
    expect(text).not.toContain('精英')
    expect(text).not.toContain('音盾')
    expect(farmShareText(null, '2026-10-05')).toContain('2026-10-05')
    expect(farmShareText(round({ gear: emptyGear() }), '2026-10-04')).not.toContain('终极')
  })
})

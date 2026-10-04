import { describe, expect, it } from 'vitest'
import { farmShareText } from './share'
import type { FarmRound } from './rules.mjs'

const round = (patch: Partial<FarmRound> = {}): FarmRound => ({
  day: '2026-10-04', frames: [[50, 76]], choices: [], surges: [], outcome: 'defeated', hp: 0, seconds: 185, score: 12345,
  maxCombo: 40, harvested: 820, bosses: 5, elites: 2, blocks: 3, maxShields: 2, coins: 900, xp: 40, stars: 2,
  gear: { drum: 3, orbit: 0, magnet: 0, range: 3, tempo: 0, power: 0, echo: 0, lucky: 0, bell: 0, sustain: 0, whistle: 0, delay: 0 }, ...patch,
})

describe('result share text', () => {
  it('summarises the verified round in one line', () => {
    const text = farmShareText(round(), '2026-10-04')
    expect(text).toContain('节拍幸存者 · 2026-10-04')
    expect(text).toContain('生存 3:05')
    expect(text).toContain('12,345 分')
    expect(text).toContain('击败 820')
    expect(text).toContain('巨兽 5')
    expect(text).toContain('精英 2')
    expect(text).toContain('音盾挡下 3 次')
    expect(text).toContain('主奏 爆米花鼓 Lv.3')
    expect(text).toContain('终极 雷霆节拍机')
    expect(text.length).toBeLessThan(200)
  })
  it('omits empty counters and works before the first run', () => {
    const text = farmShareText(round({ elites: 0, blocks: 0 }), '2026-10-04')
    expect(text).not.toContain('精英')
    expect(text).not.toContain('音盾')
    expect(farmShareText(null, '2026-10-05')).toContain('2026-10-05')
    expect(farmShareText(round({ gear: { drum: 0, orbit: 0, magnet: 0, range: 0, tempo: 0, power: 0, echo: 0, lucky: 0, bell: 0, sustain: 0, whistle: 0, delay: 0 } }), '2026-10-04')).not.toContain('终极')
  })
})

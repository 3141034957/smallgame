import { describe, expect, it, vi } from 'vitest'
import { createFarm, orbitPositions, stepFarm, type FarmState } from '@/features/farm/rules.mjs'
import { farmDeckFeedback, farmHealthRatio, farmHeroFeedback } from './combatFeedback'
import { drawFarm } from './render'

const arena = (): FarmState => ({
  ...createFarm('2026-10-22'),
  tick: 100,
  position: [50, 50],
  nextBoss: Infinity,
  nextWave: Infinity,
  hurtUntil: 0,
  crops: [],
  shots: [{ id: 200, x: 49, y: 50, dx: 1, dy: 0, expires: 200 }],
})

describe('combat feedback', () => {
  it('marks critical health relative to upgraded maximum health', () => {
    const state = { ...arena(), maxHp: 200, hp: 60 }
    expect(farmHeroFeedback(state)).toMatchObject({ lowHealth: true, healthRatio: 0.3 })
    expect(farmHeroFeedback({ ...state, hp: 61 }).lowHealth).toBe(false)
  })

  it('bounds the health track and removes combat marks after defeat', () => {
    expect(farmHealthRatio(250, 200)).toBe(1)
    expect(farmHealthRatio(-1, 200)).toBe(0)
    expect(farmHealthRatio(0, 0)).toBe(0)
    expect(farmHeroFeedback({ ...arena(), hp: 0, shields: 2, hurtUntil: 200 })).toMatchObject({
      lowHealth: false,
      protection: 'none',
    })
  })

  it('replaces the last shield with the real invulnerability window when it absorbs a hit', () => {
    const state = { ...arena(), shields: 1 }
    expect(farmHeroFeedback(state).protection).toBe('shield')
    const hit = stepFarm(state, state.position)!
    expect(hit.state.hp).toBe(state.hp)
    expect(hit.events.some((event) => event.kind === 'shield')).toBe(true)
    expect(farmHeroFeedback(hit.state).protection).toBe('invulnerable')
    expect(farmHeroFeedback({ ...hit.state, tick: hit.state.hurtUntil }).protection).toBe('none')
  })

  it('keeps a held shield visible after absorbing one of several charges', () => {
    const state = { ...arena(), shields: 2 }
    const hit = stepFarm(state, state.position)!
    expect(hit.state.shields).toBe(1)
    expect(farmHeroFeedback(hit.state).protection).toBe('shield')
  })

  it('shows protection after actual health damage without mutating the replay state', () => {
    const state = arena()
    const hit = stepFarm(state, state.position)!
    expect(hit.state.hp).toBeLessThan(state.hp)
    const before = structuredClone(hit.state)
    expect(farmHeroFeedback(hit.state).protection).toBe('invulnerable')
    expect(hit.state).toEqual(before)
  })

  it('also identifies the opening protection and the surge protection', () => {
    expect(farmHeroFeedback(createFarm('2026-10-22')).protection).toBe('invulnerable')
    const state = { ...arena(), charge: 100 }
    const burst = stepFarm(state, state.position, true)!
    expect(farmHeroFeedback(burst.state).protection).toBe('invulnerable')
  })

  it('keeps every displayed scratch blade aligned with real combat hits at all levels', () => {
    for (let level = 1; level <= 5; level++) {
      for (const needle of [0, 5]) {
        const state = arena()
        state.tick = 96
        state.shots = []
        state.gear.deck = level
        state.gear.needle = needle
        const feedback = farmDeckFeedback(state)
        expect(feedback.blades).toHaveLength(level === 5 && needle === 5 ? 4 : 2)
        // Place monsters at the outer edge of each displayed blade's hit zone.
        // An orbit drawn too far out would claim coverage where combat misses.
        state.crops = feedback.blades.map((blade, id) => ({
          id,
          x: blade.x + (Math.cos(blade.angle) * 11) / 0.84,
          y: blade.y + Math.sin(blade.angle) * 11,
          kind: 0,
          hp: 1000,
          maxHp: 1000,
          regrow: -1,
          boss: false,
        }))
        const result = stepFarm(state, state.position)!
        for (const crop of result.state.crops) expect(crop.hp).toBeLessThan(1000)
      }
    }
  })

  it('has no scratch blade or orbit before the instrument is equipped', () => {
    expect(farmDeckFeedback(arena())).toEqual({ reach: 0, blades: [] })
  })

  it.each([{ simple: true }, { reducedMotion: true }])(
    'retains visible collision markers with %j',
    (preference) => {
      // Asset canvases are inert; only the live frame records visible marks.
      const emptyContext = () =>
        new Proxy<Record<string, unknown>>(
          { createRadialGradient: () => ({ addColorStop() {} }) },
          { get: (target, key: string) => target[key] ?? (() => {}) },
        )
      const scratch = emptyContext()
      const ctx = emptyContext()
      const fillText = vi.fn()
      const translate = vi.fn()
      ctx.fillText = fillText
      ctx.translate = translate
      ctx.canvas = {
        ownerDocument: {
          createElement: () => ({ getContext: () => scratch }),
        },
      }
      const state = arena()
      state.shots = []
      state.gear.orbit = 1
      state.gear.deck = 1
      drawFarm(ctx as unknown as CanvasRenderingContext2D, state, [], 100, 390, 600, {
        ...preference,
        position: state.position,
        tick: state.tick,
        alpha: 1,
      })
      for (const [x, y] of orbitPositions(state))
        expect(fillText).toHaveBeenCalledWith('♪', x * 3.6, y * 4.3 + 5)
      for (const blade of farmDeckFeedback(state).blades)
        expect(translate).toHaveBeenCalledWith(blade.x * 3.6, blade.y * 4.3)
    },
  )
})

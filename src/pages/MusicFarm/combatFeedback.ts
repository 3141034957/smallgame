import { evolved, type FarmState } from '@/features/farm/rules.mjs'

type HeroState = Pick<FarmState, 'hp' | 'maxHp' | 'shields' | 'tick' | 'hurtUntil'>

export function farmHealthRatio(hp: number, maxHp: number): number {
  return maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0
}

/** The hero stays visible; protection and critical health use separate, stable marks. */
export function farmHeroFeedback(state: HeroState) {
  const healthRatio = farmHealthRatio(state.hp, state.maxHp)
  const alive = state.hp > 0
  return {
    healthRatio,
    lowHealth: alive && healthRatio <= 0.3,
    protection: !alive
      ? 'none'
      : state.shields > 0
        ? 'shield'
        : state.tick < state.hurtUntil
          ? 'invulnerable'
          : 'none',
  } as const
}

/** Keep the displayed scratch blades on the same orbit as the combat hit checks. */
export function farmDeckFeedback(
  state: Pick<FarmState, 'gear' | 'position' | 'tick'>,
  terminal = evolved(state.gear).includes('deck'),
) {
  const level = state.gear.deck
  const reach = level ? 16 + level * 3 : 0
  const count = level ? (terminal ? 4 : 2) : 0
  return {
    reach,
    blades: Array.from({ length: count }, (_, index) => {
      const angle = state.tick * 0.12 + (index * Math.PI * 2) / count
      return {
        angle,
        x: state.position[0] + (Math.cos(angle) * reach) / 0.84,
        y: state.position[1] + Math.sin(angle) * reach,
      }
    }),
  }
}

import { CHARACTERS, DEFAULT_CHARACTER_ID } from '@/features/shop/catalog'
import { migrateCharacterId } from '@/features/shop/characterRoster.mjs'

export const LEGACY_PROFILE_KEY = 'clockwork-player-profile-v1'
export const STAR_CURRENCY_KEY = 'clockwork-star-currency-v1'
export const INITIAL_STAR_BALANCE = 3
export type LegacyProfile = { stars: number; unlocks: string[]; selected: string }

function balance(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : INITIAL_STAR_BALANCE
}
function normalize(value: Partial<LegacyProfile>): LegacyProfile {
  const unlocks = [
    ...new Set([
      DEFAULT_CHARACTER_ID,
      ...(Array.isArray(value.unlocks)
        ? value.unlocks
            .map(migrateCharacterId)
            .filter(
              (id): id is string => !!id && CHARACTERS.some((character) => character.id === id),
            )
        : []),
    ]),
  ]
  return {
    stars: balance(value.stars),
    unlocks,
    selected: unlocks.includes(migrateCharacterId(value.selected) ?? '')
      ? migrateCharacterId(value.selected)!
      : DEFAULT_CHARACTER_ID,
  }
}

export function loadLegacyProfile(): LegacyProfile {
  try {
    const raw = localStorage.getItem(LEGACY_PROFILE_KEY)
    if (raw) {
      try {
        const stored = JSON.parse(raw)
        if (stored && typeof stored === 'object' && !Array.isArray(stored)) return normalize(stored)
      } catch {
        /* Recover from the old separate keys when a new save is damaged. */
      }
    }
    const rawStars = localStorage.getItem(STAR_CURRENCY_KEY)
    let unlocks: string[] = []
    try {
      unlocks = JSON.parse(localStorage.getItem('character-unlocks-v1') ?? '[]')
    } catch {
      /* A broken character list does not erase stars. */
    }
    let selected = localStorage.getItem('character-selected-v1') ?? DEFAULT_CHARACTER_ID
    if (
      !localStorage.getItem('character-default-oscar-v1') &&
      ['default', 'burger-dog'].includes(selected)
    )
      selected = DEFAULT_CHARACTER_ID
    return normalize({
      stars: rawStars?.trim() ? balance(Number(rawStars)) : INITIAL_STAR_BALANCE,
      unlocks,
      selected,
    })
  } catch {
    return normalize({})
  }
}

// Currency and character ownership commit together in one localStorage write.
// Leave migration keys intact so a failed first write cannot destroy progress.
export function saveLegacyProfile(profile: LegacyProfile): LegacyProfile {
  const next = normalize(profile)
  localStorage.setItem(LEGACY_PROFILE_KEY, JSON.stringify(next))
  return next
}

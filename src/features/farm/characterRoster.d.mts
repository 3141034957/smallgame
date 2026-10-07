export type BandCharacter = {
  id: string
  talentId: string
  icon: string
  name: string
  coinPrice: number
  image: string
  color: string
}
export const BAND_CHARACTERS: BandCharacter[]
export const DEFAULT_CHARACTER_ID: string
export const LEGACY_CHARACTER_IDS: Record<string, string>
export function migrateCharacterId(value: unknown): string | null

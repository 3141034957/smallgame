import { DEFAULT_CHARACTER_ID } from '@/features/shop/catalog'

const STORAGE_KEY = 'character-unlocks-v1'
const SELECTED_KEY = 'character-selected-v1'
const DEFAULT_CHARACTER_MIGRATION_KEY = 'character-default-oscar-v1'

export function getUnlocks(): string[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    const stored = value ? JSON.parse(value) : []
    const unlocks = Array.isArray(stored)
      ? stored.filter((id): id is string => typeof id === 'string')
      : []
    if (unlocks.includes(DEFAULT_CHARACTER_ID)) return unlocks
    const nextUnlocks = [...unlocks, DEFAULT_CHARACTER_ID]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUnlocks))
    return nextUnlocks
  } catch {
    return [DEFAULT_CHARACTER_ID]
  }
}

export function saveUnlocks(ids: string[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(ids)])) } catch { /* Storage optional. */ }
}

export function getSelected(): string {
  try {
    const selected = localStorage.getItem(SELECTED_KEY)
    const migrated = localStorage.getItem(DEFAULT_CHARACTER_MIGRATION_KEY)

    if (!migrated) {
      localStorage.setItem(DEFAULT_CHARACTER_MIGRATION_KEY, '1')
      if (!selected || selected === 'default' || selected === 'burger-dog') {
        localStorage.setItem(SELECTED_KEY, DEFAULT_CHARACTER_ID)
        return DEFAULT_CHARACTER_ID
      }
    }

    return selected || DEFAULT_CHARACTER_ID
  } catch {
    return DEFAULT_CHARACTER_ID
  }
}

export function saveSelected(id: string) {
  try { localStorage.setItem(SELECTED_KEY, id) } catch { /* Storage optional. */ }
}


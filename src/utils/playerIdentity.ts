import { accountStorage, activeAccountId } from '@/utils/accountStorage'
export const PLAYER_ID_STORAGE_KEY = 'clockwork-player-id-v1'
export const NICKNAME_STORAGE_KEY = 'clockwork-player-nickname-v1'
export const MAX_NAME_LENGTH = 12

function read(key: string) {
  try {
    return accountStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    accountStorage.setItem(key, value)
  } catch {
    /* Keep playing with an in-memory identity. */
  }
}

const validId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{8,96}$/.test(value)

export function createCompatiblePlayerId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  } catch {
    /* Some HTTP webviews expose randomUUID but refuse to use it. */
  }
  const bytes = new Uint8Array(16)
  if (typeof globalThis.crypto?.getRandomValues === 'function')
    globalThis.crypto.getRandomValues(bytes)
  else
    for (let index = 0; index < bytes.length; index++)
      bytes[index] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'))
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-')
}

export function getOrCreatePlayerId(): string {
  const accountId = activeAccountId()
  if (accountId) return accountId
  const stored = read(PLAYER_ID_STORAGE_KEY)?.trim()
  if (validId(stored)) return stored
  const id = createCompatiblePlayerId()
  write(PLAYER_ID_STORAGE_KEY, id)
  return id
}

export function getStoredNickname(): string {
  return normalizeNickname(read(NICKNAME_STORAGE_KEY) ?? '')
}

export function normalizeNickname(value: string): string {
  return value
    .trim()
    .replace(/[\s\p{Cc}]+/gu, ' ')
    .slice(0, MAX_NAME_LENGTH)
    .trim()
}

export function saveNickname(value: string): string {
  const name = normalizeNickname(value)
  write(NICKNAME_STORAGE_KEY, name)
  return name
}

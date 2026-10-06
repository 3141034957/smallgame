export const PLAYER_ID_STORAGE_KEY = 'clockwork-player-id-v1'
export const NICKNAME_STORAGE_KEY = 'clockwork-player-nickname-v1'
const LEGACY_PLAYER_KEY = 'mochi-melody-player-v1'
export const MAX_NAME_LENGTH = 12

function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* Keep playing with an in-memory identity. */
  }
}

const validId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{8,96}$/.test(value)

function legacyPlayer(): { id?: unknown; name?: unknown } | null {
  try {
    return JSON.parse(read(LEGACY_PLAYER_KEY) ?? 'null')
  } catch {
    return null
  }
}

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
  const stored = read(PLAYER_ID_STORAGE_KEY)?.trim()
  if (validId(stored)) return stored
  const legacy = legacyPlayer()?.id
  const id = validId(legacy) ? legacy : createCompatiblePlayerId()
  write(PLAYER_ID_STORAGE_KEY, id)
  return id
}

export function getStoredNickname(): string {
  const stored = read(NICKNAME_STORAGE_KEY)
  const legacy = legacyPlayer()?.name
  return normalizeNickname(stored?.trim() ? stored : typeof legacy === 'string' ? legacy : '')
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

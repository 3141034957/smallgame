// All existing save readers share this scope. Switching accounts remounts the game.
const PREFIX = 'farm-account-save-v1:'
const CLAIM = 'farm-legacy-claim-v1'
const LEGACY_KEYS = [
  'farm-character-profile-v1',
  'farm-career-v1',
  'farm-quests-v1',
  'farm-achievements-v1',
  'farm-settings-v1',
  'farm-seen-help-v1',
  'clockwork-player-nickname-v1',
  'mochi-melody-player-v1',
  'clockwork-player-profile-v1',
  'character-unlocks-v1',
  'character-selected-v1',
]
let accountId: string | null = null
let locked = false
export function activeAccountId() {
  return accountId
}
export function activateAccount(id: string | null) {
  accountId = id
  locked = true
}
function object(value: string | null): Record<string, string> {
  const parsed = JSON.parse(value ?? '{}')
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => typeof value === 'string'),
  ) as Record<string, string>
}
function readSave(id: string) {
  const current = localStorage.getItem(PREFIX + id)
  if (current !== null) return object(current)
  const claim = JSON.parse(localStorage.getItem(CLAIM) ?? 'null')
  return claim?.owner === id ? object(JSON.stringify(claim.data)) : {}
}
function legacySnapshot() {
  const keys = new Set(LEGACY_KEYS)
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (key?.startsWith('farm-best-')) keys.add(key)
  }
  return Object.fromEntries(
    [...keys].flatMap((key) => {
      const value = localStorage.getItem(key)
      return value === null ? [] : [[key, value]]
    }),
  )
}
export function canClaimLegacyProgress() {
  try {
    return !localStorage.getItem(CLAIM) && Object.keys(legacySnapshot()).length > 0
  } catch {
    return false
  }
}
export function claimLegacyProgress(id: string) {
  if (localStorage.getItem(CLAIM) || localStorage.getItem(PREFIX + id)) return
  // Owner and immutable snapshot land in one write; the original save remains intact.
  localStorage.setItem(CLAIM, JSON.stringify({ owner: id, data: legacySnapshot() }))
}
export const accountStorage = {
  getItem(key: string): string | null {
    if (accountId) return readSave(accountId)[key] ?? null
    if (locked) throw new Error('请先登录账号。')
    return localStorage.getItem(key)
  },
  setItem(key: string, value: string) {
    if (accountId) {
      localStorage.setItem(
        PREFIX + accountId,
        JSON.stringify({ ...readSave(accountId), [key]: value }),
      )
      return
    }
    if (locked) throw new Error('请先登录账号。')
    localStorage.setItem(key, value)
  },
}

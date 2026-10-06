import { isProgressKey, PROGRESS_KEYS } from '@/features/auth/progress.mjs'

const PREFIX = 'farm-account-save-v1:'
const CLAIM = 'farm-legacy-claim-v1'
const GUEST = 'farm-guest-save-v1'
export const ACCOUNT_SAVE_EVENT = 'echo-progress-changed'
export type ProgressData = Record<string, string>
export type AccountSave = { data: ProgressData; revision: number | null; dirty: boolean }
let accountId: string | null = null
const fallback = new Map<string, AccountSave>()
export const activeAccountId = () => accountId
export function activateAccount(id: string | null) {
  accountId = id
}
function object(value: string | null): ProgressData {
  const parsed = JSON.parse(value ?? '{}')
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => typeof value === 'string'),
  ) as ProgressData
}
function legacySnapshot() {
  const keys = new Set([...PROGRESS_KEYS, 'clockwork-player-id-v1'])
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (key && isProgressKey(key)) keys.add(key)
  }
  return Object.fromEntries(
    [...keys].flatMap((key) => {
      const value = localStorage.getItem(key)
      return value === null ? [] : [[key, value]]
    }),
  )
}
export function guestProgress(): ProgressData {
  const stored = localStorage.getItem(GUEST)
  return stored !== null ? object(stored) : localStorage.getItem(CLAIM) ? {} : legacySnapshot()
}
export function exportGuestProgress(): ProgressData {
  return Object.fromEntries(Object.entries(guestProgress()).filter(([key]) => isProgressKey(key)))
}
export function readAccountSave(id: string): AccountSave {
  const memory = fallback.get(id)
  if (memory) return memory
  const raw = localStorage.getItem(PREFIX + id)
  if (raw !== null) {
    const parsed = JSON.parse(raw)
    if (parsed?.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data))
      return {
        data: object(JSON.stringify(parsed.data)),
        revision: Number.isSafeInteger(parsed.revision) ? parsed.revision : null,
        dirty: parsed.dirty === true,
      }
    // Migrate the flat account save from before cloud storage.
    return { data: object(raw), revision: null, dirty: true }
  }
  const claim = JSON.parse(localStorage.getItem(CLAIM) ?? 'null')
  return {
    data: claim?.owner === id ? object(JSON.stringify(claim.data)) : {},
    revision: null,
    dirty: claim?.owner === id,
  }
}
export function writeAccountSave(id: string, save: AccountSave) {
  localStorage.setItem(PREFIX + id, JSON.stringify(save))
  fallback.delete(id)
}
export function installAccountSave(id: string, save: AccountSave) {
  try {
    writeAccountSave(id, save)
    return true
  } catch {
    fallback.set(id, save)
    return false
  }
}
export function acknowledgeAccountSave(id: string, sent: ProgressData, revision: number) {
  const current = readAccountSave(id)
  const data = Object.fromEntries(
    Object.entries(current.data).filter(([key]) => isProgressKey(key)),
  )
  const dirty = JSON.stringify(data) !== JSON.stringify(sent)
  installAccountSave(id, { data: current.data, revision, dirty })
  return dirty
}
export function resetGuestProgress() {
  // Preserve the transferred snapshot as a backup, then start a separate fresh guest.
  const data = guestProgress()
  localStorage.setItem('farm-guest-backup-v1', JSON.stringify(data))
  localStorage.setItem(GUEST, '{}')
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
  localStorage.setItem(CLAIM, JSON.stringify({ owner: id, data: legacySnapshot() }))
}
export const accountStorage = {
  getItem(key: string): string | null {
    return (accountId ? readAccountSave(accountId).data : guestProgress())[key] ?? null
  },
  setItem(key: string, value: string) {
    if (accountId) {
      const current = readAccountSave(accountId)
      writeAccountSave(accountId, {
        ...current,
        data: { ...current.data, [key]: value },
        dirty: true,
      })
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACCOUNT_SAVE_EVENT))
    } else localStorage.setItem(GUEST, JSON.stringify({ ...guestProgress(), [key]: value }))
  },
}

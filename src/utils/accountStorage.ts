import { isProgressKey, PROGRESS_KEYS } from '@/features/auth/progress.mjs'

export const GUEST_SAVE_KEY = 'farm-guest-save-v1'
const PREFIX = 'farm-account-save-v1:'
const CORRUPT = ':corrupt'
const CLAIM = 'farm-legacy-claim-v1'
const DAILY_BEST = /^farm-best-v[\w-]+:(\d{4}-\d{2}-\d{2})$/
// Daily best scores stay in plain localStorage, so another tab announces them
// under this prefix instead of through an account save.
export const isDailyBestKey = (key: string) => DAILY_BEST.test(key)
const DAILY_BEST_DAYS = 400
export const ACCOUNT_SAVE_EVENT = 'echo-progress-changed'
export type ProgressData = Record<string, string>
export type AccountSave = { data: ProgressData; revision: number | null; dirty: boolean }
let accountId: string | null = null
const fallback = new Map<string, AccountSave>()
export const activeAccountId = () => accountId
export function activateAccount(id: string | null) {
  accountId = id
}
const empty = (): AccountSave => ({ data: {}, revision: null, dirty: false })
function object(value: string | null): ProgressData {
  let parsed: unknown
  try {
    parsed = JSON.parse(value ?? '{}')
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => typeof value === 'string'),
  ) as ProgressData
}
const safeRevision = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : null
// Keep the unreadable blob around so a later write cannot make it unrecoverable.
function quarantine(id: string, raw: string): AccountSave {
  try {
    localStorage.setItem(PREFIX + id + CORRUPT, raw)
  } catch {
    /* Nothing else to do: the copy in memory is already empty. */
  }
  return empty()
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
  const stored = localStorage.getItem(GUEST_SAVE_KEY)
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
    let parsed: { data?: unknown; revision?: unknown; dirty?: unknown } | null = null
    try {
      parsed = JSON.parse(raw)
    } catch {
      return quarantine(id, raw)
    }
    if (parsed?.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data))
      return {
        data: object(JSON.stringify(parsed.data)),
        revision: safeRevision(parsed.revision),
        dirty: parsed.dirty === true,
      }
    // Migrate the flat account save from before cloud storage.
    return { data: object(raw), revision: null, dirty: true }
  }
  let claim: { owner?: unknown; data?: unknown } | null = null
  try {
    claim = JSON.parse(localStorage.getItem(CLAIM) ?? 'null')
  } catch {
    claim = null
  }
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
  const dirty = JSON.stringify(progressForCloud(current.data)) !== JSON.stringify(sent)
  installAccountSave(id, { data: current.data, revision, dirty })
  return dirty
}
export function resetGuestProgress(transferred: ProgressData = {}) {
  // Preserve the transferred snapshot as a backup, then start a separate fresh guest.
  const data = guestProgress()
  localStorage.setItem('farm-guest-backup-v1', JSON.stringify(data))
  // Only drop what actually reached the account; unknown keys stay playable.
  const rest = Object.fromEntries(Object.entries(data).filter(([key]) => !(key in transferred)))
  localStorage.setItem(GUEST_SAVE_KEY, JSON.stringify(rest))
}
// Daily best scores are dropped after a while so the upload stays within the server limit.
export function progressForCloud(data: ProgressData): ProgressData {
  const cutoff = new Date(Date.now() - DAILY_BEST_DAYS * 86_400_000).toISOString().slice(0, 10)
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => {
      if (!isProgressKey(key)) return false
      const date = DAILY_BEST.exec(key)?.[1]
      return date === undefined || date >= cutoff
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
  localStorage.setItem(CLAIM, JSON.stringify({ owner: id, data: legacySnapshot() }))
}
export const accountStorage = {
  getItem(key: string): string | null {
    try {
      return (accountId ? readAccountSave(accountId).data : guestProgress())[key] ?? null
    } catch {
      return null
    }
  },
  setItem(key: string, value: string) {
    if (accountId) {
      const current = readAccountSave(accountId)
      // A rejected write must not strand the player: keep the save in memory instead.
      installAccountSave(accountId, {
        ...current,
        data: { ...current.data, [key]: value },
        dirty: true,
      })
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACCOUNT_SAVE_EVENT))
    } else {
      localStorage.setItem(GUEST_SAVE_KEY, JSON.stringify({ ...guestProgress(), [key]: value }))
      // Guests have no cloud save, so this event is the only thing telling the
      // open page (and other tabs, through the storage event) to re-read it.
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACCOUNT_SAVE_EVENT))
    }
  },
}

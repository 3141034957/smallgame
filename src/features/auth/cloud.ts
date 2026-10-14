import {
  acknowledgeAccountSave,
  installAccountSave,
  progressForCloud,
  readAccountSave,
  writeAccountSave,
  type AccountSave,
  type ProgressData,
} from '@/utils/accountStorage'
import { validProgress } from './progress.mjs'
import { AccountError, notifyAccountExpired } from './client'

export type CloudProgress = { data: ProgressData; revision: number }
export type SyncStatus = 'saved' | 'pending' | 'offline' | 'conflict'
export async function progressRequest(
  id: string,
  save?: CloudProgress,
  signal?: AbortSignal,
  keepalive = false,
): Promise<CloudProgress> {
  const body = save ? JSON.stringify(save) : undefined
  const response = await fetch('/api/progress', {
    method: save ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: {
      'X-Echo-User': id,
      ...(save ? { 'Content-Type': 'application/json', 'X-Echo-Request': '1' } : {}),
    },
    body,
    keepalive: keepalive && !!body && new TextEncoder().encode(body).length < 60000,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
      : AbortSignal.timeout(10000),
  })
  const result = await response.json().catch(() => null)
  if (response.status === 401) notifyAccountExpired()
  if (!response.ok)
    throw new AccountError(response.status, result?.error ?? '云端保存失败，进度在本机')
  if (
    !validProgress(result?.data) ||
    !Number.isSafeInteger(result?.revision) ||
    result.revision < 0
  )
    throw new Error('云端进度异常')
  return result
}
const backupKey = (id: string) => `farm-account-backup-v1:${id}`
export function readAccountBackup(id: string): AccountSave | null {
  try {
    const value = JSON.parse(localStorage.getItem(backupKey(id)) ?? 'null')
    if (
      !value ||
      !value.data ||
      typeof value.data !== 'object' ||
      Array.isArray(value.data) ||
      !Object.values(value.data).every((item) => typeof item === 'string') ||
      !(value.revision === null || (Number.isSafeInteger(value.revision) && value.revision >= 0)) ||
      typeof value.dirty !== 'boolean'
    )
      return null
    return value
  } catch {
    return null
  }
}
function backupAccount(id: string, save: AccountSave) {
  try {
    localStorage.setItem(backupKey(id), JSON.stringify(save))
  } catch {
    throw new Error('备份失败，请释放存储后重试')
  }
  return backupKey(id)
}
export async function loadAccountProgress(id: string, signal: AbortSignal, forceCloud = false) {
  const remote = await progressRequest(id, undefined, signal)
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const local = readAccountSave(id)
  // Another tab may finish a newer sync while this GET is in flight.
  if (!forceCloud && local.revision !== null && local.revision > remote.revision) {
    return { persisted: true, retained: true, conflict: local.conflict === true, backup: null }
  }
  const keepLocal = !forceCloud && (local.dirty || local.conflict === true)
  const conflict =
    keepLocal &&
    (local.conflict === true ||
      (local.revision !== remote.revision && !(remote.revision === 0 && local.revision === null)))
  if (conflict) {
    // Never advance the base revision: doing so would turn the next automatic
    // upload into silent authorization to overwrite the other device.
    const persisted = installAccountSave(id, { ...local, conflict: true })
    return { persisted, retained: true, conflict: true, backup: null }
  }
  let backup: string | null = null
  if (forceCloud && Object.keys(local.data).length) backup = backupAccount(id, local)
  const save = {
    data: keepLocal ? local.data : remote.data,
    revision: remote.revision,
    dirty: keepLocal,
  }
  // Explicit replacement is only successful if it survives a reload.
  const persisted = forceCloud ? (writeAccountSave(id, save), true) : installAccountSave(id, save)
  return { persisted, retained: keepLocal, conflict: false, backup }
}
export function restoreAccountBackup(id: string) {
  const backup = readAccountBackup(id)
  if (!backup) throw new Error('备份不可用')
  const current = readAccountSave(id)
  const original = localStorage.getItem(backupKey(id))!
  backupAccount(id, current)
  try {
    // Restoration is local only. Choosing this snapshot for cloud upload is a
    // separate explicit action; its old revision must never be silently rebased.
    writeAccountSave(id, { ...backup, dirty: true, conflict: true })
  } catch (cause) {
    localStorage.setItem(backupKey(id), original)
    throw cause
  }
}
export async function keepAccountProgress(id: string, signal: AbortSignal) {
  const remote = await progressRequest(id, undefined, signal)
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  backupAccount(id, { ...remote, dirty: false })
  const current = readAccountSave(id)
  const data = progressForCloud(current.data)
  // A newer write on the other device still rejects this explicit choice.
  const result = await progressRequest(id, { data, revision: remote.revision }, signal)
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const latest = readAccountSave(id)
  if (latest.conflict && JSON.stringify(latest) !== JSON.stringify(current)) {
    // Another tab restored/changed the chosen snapshot during the request.
    // This response authorizes only the original choice, never that new save.
    throw new AccountError(409, '本机进度已变化，请重新选择')
  }
  const dirty = JSON.stringify(progressForCloud(latest.data)) !== JSON.stringify(data)
  installAccountSave(id, { data: latest.data, revision: result.revision, dirty })
}

export function createProgressSync(id: string, onStatus: (status: SyncStatus) => void) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Promise<boolean> | null = null
  let generation = 0
  let conflict = false
  let stopped = false
  const flush = (keepalive = false): Promise<boolean> => {
    if (stopped || conflict) return Promise.resolve(false)
    if (timer) clearTimeout(timer)
    const previous = pending
    // A keepalive save must own its request, otherwise the page unload cancels it.
    if (previous && !keepalive) return previous
    const token = ++generation
    pending = (async () => {
      if (previous) await previous
      await Promise.resolve()
      try {
        let current = readAccountSave(id)
        while ((current.dirty || current.conflict) && !stopped) {
          if (current.conflict) throw new AccountError(409, '请选择保留哪份进度')
          if (current.revision === null) throw new Error('尚未恢复云端存档。')
          onStatus('pending')
          const data = progressForCloud(current.data)
          const result = await progressRequest(
            id,
            { data, revision: current.revision },
            controller.signal,
            keepalive,
          )
          if (stopped) return false
          acknowledgeAccountSave(id, data, result.revision)
          current = readAccountSave(id)
        }
        if (!stopped) onStatus('saved')
        return !stopped
      } catch (error) {
        if (!stopped) {
          conflict = error instanceof AccountError && error.status === 409
          onStatus(conflict ? 'conflict' : 'offline')
        }
        return false
      } finally {
        if (token === generation) pending = null
      }
    })()
    return pending
  }
  return {
    flush,
    schedule() {
      if (stopped || conflict) return
      onStatus('pending')
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void flush(), 500)
    },
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      controller.abort()
    },
  }
}

import {
  acknowledgeAccountSave,
  installAccountSave,
  readAccountSave,
  type ProgressData,
} from '@/utils/accountStorage'
import { isProgressKey, validProgress } from './progress.mjs'
import { AccountError, notifyAccountExpired } from './client'

export type CloudProgress = { data: ProgressData; revision: number }
export type SyncStatus = 'saved' | 'pending' | 'offline' | 'conflict'
const dataForCloud = (data: ProgressData) =>
  Object.fromEntries(Object.entries(data).filter(([key]) => isProgressKey(key)))
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
    throw new AccountError(response.status, result?.error ?? '云端保存暂时不可用，本机进度仍保留。')
  if (
    !validProgress(result?.data) ||
    !Number.isSafeInteger(result?.revision) ||
    result.revision < 0
  )
    throw new Error('云端进度返回异常，本机存档仍保留。')
  return result
}
export async function loadAccountProgress(id: string, signal: AbortSignal, forceCloud = false) {
  const remote = await progressRequest(id, undefined, signal)
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  let local
  try {
    local = readAccountSave(id)
  } catch {
    local = { data: {}, revision: null, dirty: false }
  }
  const keepLocal =
    !forceCloud &&
    local.dirty &&
    (local.revision === remote.revision ||
      (remote.revision === 0 && Object.keys(local.data).length > 0))
  if (local.dirty && !keepLocal && Object.keys(local.data).length) {
    localStorage.setItem(`farm-account-backup-v1:${id}`, JSON.stringify(local))
  }
  const persisted = installAccountSave(id, {
    data: keepLocal ? dataForCloud(local.data) : remote.data,
    revision: remote.revision,
    dirty: keepLocal,
  })
  return { persisted, retained: keepLocal }
}

export function createProgressSync(id: string, onStatus: (status: SyncStatus) => void) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Promise<boolean> | null = null
  let conflict = false
  let stopped = false
  const flush = (keepalive = false): Promise<boolean> => {
    if (stopped || conflict) return Promise.resolve(false)
    if (timer) clearTimeout(timer)
    if (pending) return pending
    pending = (async () => {
      await Promise.resolve()
      try {
        let current = readAccountSave(id)
        while (current.dirty && !stopped) {
          if (current.revision === null) throw new Error('尚未恢复云端存档。')
          onStatus('pending')
          const data = dataForCloud(current.data)
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
        pending = null
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

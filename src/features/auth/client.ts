import { activeAccountId } from '@/utils/accountStorage'
import { normalizeAccount } from './validation.mjs'
export type AccountUser = { id: string; username: string }
export const AUTH_EXPIRED_EVENT = 'echo-auth-expired'
export const AUTH_CHANGED_KEY = 'echo-auth-changed-v1'
export class AccountError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
export async function accountRequest(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<AccountUser | null> {
  const response = await fetch(`/api/auth/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers:
      body === undefined
        ? undefined
        : {
            'Content-Type': 'application/json',
            'X-Echo-Request': '1',
            ...(path === 'logout' && activeAccountId()
              ? { 'X-Echo-User': activeAccountId()! }
              : {}),
          },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
      : AbortSignal.timeout(10000),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok)
    throw new AccountError(response.status, result?.error ?? '账号服务暂时连不上，请稍后重试。')
  const user = result?.user
  if (user === null && (path === 'session' || path === 'logout')) return null
  if (
    !user ||
    typeof user.id !== 'string' ||
    !/^account_[a-f0-9-]{36}$/.test(user.id) ||
    normalizeAccount(user.username) !== user.username
  )
    throw new Error('账号服务返回异常，请稍后重试。')
  return user
}
export function announceAccountChange() {
  try {
    localStorage.setItem(AUTH_CHANGED_KEY, `${Date.now()}:${Math.random()}`)
  } catch {
    /* Polling still checks other tabs. */
  }
}
export function notifyAccountExpired() {
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
}

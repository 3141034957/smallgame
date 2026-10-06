import { useCallback, useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import {
  activateAccount,
  canClaimLegacyProgress,
  claimLegacyProgress,
} from '@/utils/accountStorage'
import { ACCOUNT_HINT, PASSWORD_HINT, normalizeAccount, validPassword } from './validation.mjs'
import {
  AccountError,
  accountRequest,
  announceAccountChange,
  AUTH_CHANGED_KEY,
  AUTH_EXPIRED_EVENT,
  type AccountUser,
} from './client'
import './style.css'

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [importProgress, setImportProgress] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const mounted = useRef(false)
  const principal = useRef<AccountUser | null>(null)
  const pending = useRef<AbortController | null>(null)
  const sequence = useRef(0)
  const mutating = useRef(false)
  const cancelPending = useCallback(() => {
    sequence.current++
    pending.current?.abort()
    pending.current = null
  }, [])
  const accept = useCallback((next: AccountUser | null) => {
    // Unmount the old game while its own storage scope is still active.
    // Otherwise late cleanup could save an old run into the next account.
    if (principal.current && principal.current.id !== next?.id) flushSync(() => setUser(null))
    activateAccount(next?.id ?? null)
    principal.current = next
    setUser(next)
    setChecking(false)
  }, [])
  const check = useCallback(async () => {
    if (mutating.current || pending.current) return
    const controller = new AbortController()
    pending.current = controller
    const revision = ++sequence.current
    try {
      const next = await accountRequest('session', undefined, controller.signal)
      if (!mounted.current || revision !== sequence.current) return
      if (principal.current && !next) setNotice('登录已结束，请重新登录。')
      accept(next)
      setError('')
    } catch (cause) {
      if (!mounted.current || revision !== sequence.current || controller.signal.aborted) return
      if (cause instanceof AccountError && cause.status === 401) {
        accept(null)
        setNotice('登录已失效或账号在别处登录，请重新登录。')
      } else {
        // An outage must not silently sign in an anonymous player or discard a run.
        setError('暂时无法确认登录状态，请检查连接后重试。')
        if (!principal.current) setChecking(true)
      }
    } finally {
      if (pending.current === controller) pending.current = null
    }
  }, [accept])
  useEffect(() => {
    mounted.current = true
    void check()
    const timer = window.setInterval(() => {
      if (principal.current) void check()
    }, 15000)
    const focus = () => void check()
    const visibility = () => {
      if (!document.hidden) void check()
    }
    const storage = (event: StorageEvent) => {
      if (event.key === AUTH_CHANGED_KEY && !mutating.current) {
        cancelPending()
        void check()
      }
    }
    const expired = () => {
      // Stop the current game promptly; confirm the actual session before re-entering.
      cancelPending()
      accept(null)
      setNotice('登录已失效或账号已切换，请重新登录。')
      void check()
    }
    window.addEventListener('focus', focus)
    window.addEventListener('storage', storage)
    window.addEventListener(AUTH_EXPIRED_EVENT, expired)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      mounted.current = false
      cancelPending()
      window.clearInterval(timer)
      window.removeEventListener('focus', focus)
      window.removeEventListener('storage', storage)
      window.removeEventListener(AUTH_EXPIRED_EVENT, expired)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [accept, check, cancelPending])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (mutating.current) return
    if (!normalizeAccount(account)) {
      setError(ACCOUNT_HINT)
      return
    }
    if (!validPassword(password)) {
      setError(PASSWORD_HINT)
      return
    }
    if (mode === 'register' && confirmation !== password) {
      setError('两次输入的密码不一致。')
      return
    }
    mutating.current = true
    setBusy(true)
    setError('')
    setNotice('')
    pending.current?.abort()
    pending.current = null
    sequence.current++
    const controller = new AbortController()
    pending.current = controller
    try {
      const next = await accountRequest(mode, { account, password }, controller.signal)
      if (!mounted.current || controller.signal.aborted || !next) return
      if (importProgress && canClaimLegacyProgress()) {
        try {
          claimLegacyProgress(next.id)
        } catch {
          setNotice('登录成功，但本机旧进度暂时无法绑定；原存档仍保留。')
        }
      }
      setPassword('')
      setConfirmation('')
      accept(next)
      announceAccountChange()
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : '登录失败，请重试。')
    } finally {
      if (pending.current === controller) pending.current = null
      mutating.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const logout = async () => {
    if (mutating.current) return
    mutating.current = true
    setBusy(true)
    setError('')
    pending.current?.abort()
    pending.current = null
    sequence.current++
    try {
      await accountRequest('logout', {})
      if (!mounted.current) return
      accept(null)
      setNotice('已退出登录，进度保留在本机账号存档中。')
      announceAccountChange()
    } catch (cause) {
      if (mounted.current) {
        if (cause instanceof AccountError && cause.status === 401) accept(null)
        setError(cause instanceof Error ? cause.message : '退出失败，请重试。')
      }
    } finally {
      mutating.current = false
      if (mounted.current) setBusy(false)
    }
  }

  if (user)
    return (
      <div className="account-game" key={user.id}>
        <div className="account-bar" aria-label="当前登录账号">
          <span>♫ {user.username}</span>
          <button type="button" disabled={busy} onClick={() => void logout()}>
            {busy ? '处理中…' : '退出登录'}
          </button>
        </div>
        {(error || notice) && (
          <p className="account-game-notice" role={error ? 'alert' : 'status'}>
            {error || notice}
          </p>
        )}
        {children}
      </div>
    )
  return (
    <main className="account-page">
      <section className="account-card" aria-label="乐队账号登录">
        <span className="account-eyebrow">ECHO GARDEN · BAND CLUB</span>
        <div className="account-mark" aria-hidden="true">
          ♫
        </div>
        <h1>怪潮乐队历险记</h1>
        <p className="account-intro">登录你的乐队账号，准备登台。</p>
        {checking ? (
          <>
            <p role={error ? 'alert' : 'status'}>{error || '正在确认登录状态…'}</p>
            {error && (
              <button className="account-primary" onClick={() => void check()}>
                重新连接
              </button>
            )}
          </>
        ) : (
          <>
            <div className="account-tabs" aria-label="账号操作">
              {(['login', 'register'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  disabled={busy}
                  aria-pressed={mode === item}
                  onClick={() => {
                    setMode(item)
                    setPassword('')
                    setConfirmation('')
                    setShowPassword(false)
                    setError('')
                  }}
                >
                  {item === 'login' ? '登录' : '注册账号'}
                </button>
              ))}
            </div>
            <form onSubmit={(event) => void submit(event)}>
              <label htmlFor="account-name">账号</label>
              <input
                id="account-name"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={32}
                value={account}
                disabled={busy}
                onChange={(event) => setAccount(event.target.value)}
                required
                aria-describedby="account-hint"
              />
              <p id="account-hint" className="account-hint">
                {ACCOUNT_HINT}
              </p>
              <label htmlFor="account-password">密码</label>
              <div className="account-password">
                <input
                  id="account-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  minLength={8}
                  maxLength={128}
                  value={password}
                  disabled={busy}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  aria-describedby="password-hint"
                />
                <button
                  type="button"
                  disabled={busy}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? '隐藏' : '显示'}
                </button>
              </div>
              <p id="password-hint" className="account-hint">
                {PASSWORD_HINT}
              </p>
              {mode === 'register' && (
                <>
                  <label htmlFor="account-confirmation">确认密码</label>
                  <input
                    id="account-confirmation"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    maxLength={128}
                    value={confirmation}
                    disabled={busy}
                    onChange={(event) => setConfirmation(event.target.value)}
                    required
                  />
                </>
              )}
              {canClaimLegacyProgress() && (
                <label className="account-import">
                  <input
                    type="checkbox"
                    checked={importProgress}
                    disabled={busy}
                    onChange={(event) => setImportProgress(event.target.checked)}
                  />
                  将本机原有进度绑定到此账号
                </label>
              )}
              {notice && (
                <p role="status" className="account-notice">
                  {notice}
                </p>
              )}
              {error && (
                <p role="alert" className="account-error">
                  {error}
                </p>
              )}
              <button className="account-primary" type="submit" disabled={busy}>
                {busy ? '正在连接…' : mode === 'login' ? '登录并进入乐队' : '注册并进入乐队'}
              </button>
            </form>
            <p className="account-footnote">
              同一账号仅保留一次登录，新登录会使旧登录失效。金币与成长进度按账号保存在当前浏览器。
            </p>
          </>
        )}
      </section>
    </main>
  )
}

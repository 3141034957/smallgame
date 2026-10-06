import { useCallback, useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import {
  activateAccount,
  ACCOUNT_SAVE_EVENT,
  exportGuestProgress,
  installAccountSave,
  resetGuestProgress,
} from '@/utils/accountStorage'
import { BAND_CHARACTERS } from '@/features/farm/characterRoster.mjs'
import { ACCOUNT_HINT, PASSWORD_HINT, normalizeAccount, validPassword } from './validation.mjs'
import { AccountContext, AUTH_FORM_EVENT } from './context'
import { createProgressSync, loadAccountProgress, type SyncStatus } from './cloud'
import {
  AccountError,
  accountRequest,
  announceAccountChange,
  AUTH_CHANGED_KEY,
  AUTH_EXPIRED_EVENT,
  type AccountUser,
} from './client'
import './style.css'

const welcomeBand = ['cat-guitar', 'bear-drums', 'bird-vocals'].map((id) =>
  BAND_CHARACTERS.find((character) => character.id === id)!,
)

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null)
  const [gameVisible, setGameVisible] = useState(true)
  const [gameKey, setGameKey] = useState('guest')
  const [checking, setChecking] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('pending')
  const userId = user?.id
  const sync = useRef<ReturnType<typeof createProgressSync> | null>(null)
  const mounted = useRef(false)
  const principal = useRef<AccountUser | null>(null)
  const pending = useRef<AbortController | null>(null)
  const sequence = useRef(0)
  const mutating = useRef(false)
  const dialog = useRef<HTMLElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const cancelPending = useCallback(() => {
    sequence.current++
    pending.current?.abort()
    pending.current = null
  }, [])
  const accept = useCallback((next: AccountUser | null, preserveGuest = false) => {
    const changed = principal.current?.id !== next?.id
    if (changed) {
      sync.current?.stop()
      // Registration adopts this guest run. All other switches tear down under the old owner.
      if (!preserveGuest) flushSync(() => setGameVisible(false))
      activateAccount(next?.id ?? null)
      if (!preserveGuest) setGameKey(next?.id ?? `guest:${Date.now()}`)
      // Never carry a conflict or "saved" badge from the previous account over.
      setSyncStatus('pending')
    } else activateAccount(next?.id ?? null)
    principal.current = next
    setUser(next)
    setGameVisible(true)
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
      if (next && principal.current?.id !== next.id) {
        await loadAccountProgress(next.id, controller.signal)
        if (!mounted.current || revision !== sequence.current) return
      }
      if (principal.current && !next) setNotice('登录已结束，你可以继续游客游玩，账号存档仍保留。')
      accept(next)
      setError('')
    } catch (cause) {
      if (!mounted.current || revision !== sequence.current || controller.signal.aborted) return
      if (cause instanceof AccountError && cause.status === 401) {
        accept(null)
        setNotice('登录已失效或账号在别处登录，账号进度已保留，可继续游客游玩。')
      } else {
        setChecking(false)
        setError('暂时无法连接账号服务，你仍可以玩；进度先保存在本机。')
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
      cancelPending()
      accept(null)
      setNotice('登录已失效或账号已切换，账号进度已保留，可继续游客游玩。')
      void check()
    }
    window.addEventListener('focus', focus)
    window.addEventListener('storage', storage)
    window.addEventListener(AUTH_EXPIRED_EVENT, expired)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      mounted.current = false
      cancelPending()
      sync.current?.stop()
      window.clearInterval(timer)
      window.removeEventListener('focus', focus)
      window.removeEventListener('storage', storage)
      window.removeEventListener(AUTH_EXPIRED_EVENT, expired)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [accept, check, cancelPending])
  useEffect(() => {
    if (!userId) return
    const owner = userId
    const uploader = createProgressSync(owner, (status) => {
      if (mounted.current && principal.current?.id === owner) setSyncStatus(status)
    })
    sync.current = uploader
    const changed = () => uploader.schedule()
    const online = () => void uploader.flush()
    const hiding = () => {
      if (document.hidden) void uploader.flush(true)
    }
    const leaving = () => void uploader.flush(true)
    window.addEventListener(ACCOUNT_SAVE_EVENT, changed)
    window.addEventListener('online', online)
    window.addEventListener('pagehide', leaving)
    document.addEventListener('visibilitychange', hiding)
    void uploader.flush()
    return () => {
      uploader.stop()
      if (sync.current === uploader) sync.current = null
      window.removeEventListener(ACCOUNT_SAVE_EVENT, changed)
      window.removeEventListener('online', online)
      window.removeEventListener('pagehide', leaving)
      document.removeEventListener('visibilitychange', hiding)
    }
  }, [userId, gameKey])
  const openAccount = useCallback((next: 'login' | 'register') => {
    previousFocus.current = document.activeElement as HTMLElement
    window.dispatchEvent(new Event(AUTH_FORM_EVENT))
    setMode(next)
    setError('')
    setPassword('')
    setConfirmation('')
    setFormOpen(true)
  }, [])
  const closeForm = () => {
    if (mutating.current) return
    setFormOpen(false)
    setPassword('')
    setConfirmation('')
  }
  useEffect(() => {
    if (formOpen) dialog.current?.querySelector<HTMLInputElement>('input')?.focus()
    else previousFocus.current?.focus({ preventScroll: true })
  }, [formOpen])
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
    cancelPending()
    const controller = new AbortController()
    pending.current = controller
    try {
      const progress = mode === 'register' ? exportGuestProgress() : undefined
      const next = await accountRequest(
        mode,
        { account, password, ...(progress ? { progress } : {}) },
        controller.signal,
      )
      if (!mounted.current || controller.signal.aborted || !next) return
      if (progress) {
        installAccountSave(next.id, { data: progress, revision: 1, dirty: false })
        try {
          resetGuestProgress(progress)
        } catch {
          setNotice('账号已保存，本机游客备份暂时无法更新。')
        }
      } else {
        await loadAccountProgress(next.id, controller.signal)
        if (!mounted.current || controller.signal.aborted) return
      }
      setPassword('')
      setConfirmation('')
      setFormOpen(false)
      accept(next, mode === 'register')
      setNotice(
        mode === 'register'
          ? '注册成功，游客进度已保存到账号，继续玩吧！'
          : '已恢复账号进度；原游客存档仍保留在本机。',
      )
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
    cancelPending()
    try {
      await sync.current?.flush()
      await accountRequest('logout', {})
      if (!mounted.current) return
      accept(null)
      setNotice('已退出登录，可继续游客游玩。账号存档和未同步的本机进度仍保留。')
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
  const restoreCloud = async () => {
    const owner = principal.current
    if (!owner || mutating.current) return
    mutating.current = true
    setBusy(true)
    cancelPending()
    sync.current?.stop()
    const controller = new AbortController()
    pending.current = controller
    try {
      // End the old run before replacing its storage, then remount from the cloud.
      flushSync(() => setGameVisible(false))
      const { backup } = await loadAccountProgress(owner.id, controller.signal, true)
      if (!mounted.current || controller.signal.aborted) return
      setGameKey(`${owner.id}:${Date.now()}`)
      setGameVisible(true)
      setUser({ ...owner })
      setSyncStatus('saved')
      setNotice(
        backup
          ? '已恢复云端进度，未上传的本机副本已保留。'
          : '已恢复云端进度，本机没有需要保留的进度。',
      )
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) {
        setGameKey(`${owner.id}:${Date.now()}`)
        setGameVisible(true)
        setError(cause instanceof Error ? cause.message : '恢复失败。')
      }
    } finally {
      if (pending.current === controller) pending.current = null
      mutating.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return (
    <AccountContext value={{ user, openAccount }}>
      <div className="account-game">
        <div
          className="account-bar"
          aria-label={user ? '当前登录账号' : '游客模式'}
          inert={formOpen}
        >
          <span>{user ? `♫ ${user.username}` : '游客模式 · 进度保存在本机'}</span>
          <div className="account-actions">
            {user ? (
              <>
                <span role="status">
                  {syncStatus === 'saved'
                    ? '云端已保存'
                    : syncStatus === 'pending'
                      ? '正在保存…'
                      : syncStatus === 'conflict'
                        ? '云端有更新，本机副本已保留'
                        : '本机已保存，等待同步'}
                </span>
                {syncStatus === 'offline' && (
                  <button onClick={() => void sync.current?.flush()}>重试保存</button>
                )}
                {syncStatus === 'conflict' && (
                  <button disabled={busy} onClick={() => void restoreCloud()}>
                    恢复云端进度
                  </button>
                )}
                <button disabled={busy} onClick={() => void logout()}>
                  {busy ? '处理中…' : '退出登录'}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => openAccount('login')}>登录</button>
                <button onClick={() => openAccount('register')}>注册保存进度</button>
              </>
            )}
          </div>
        </div>
        {!formOpen && (error || notice) && (
          <p className="account-game-notice" role={error ? 'alert' : 'status'}>
            {error || notice}
            {error && <button onClick={() => void check()}>重新连接</button>}
          </p>
        )}
        <div className="account-play" inert={formOpen}>
          {gameVisible && (
            <div key={gameKey} className="account-game-content">
              {children}
            </div>
          )}
        </div>
      </div>
      {formOpen && (
        <div
          className="account-overlay"
          onKeyDown={(event) => {
            if (event.key === 'Escape') closeForm()
            if (event.key === 'Tab') {
              const items = Array.from(
                dialog.current?.querySelectorAll<HTMLElement>(
                  'button:not(:disabled),input:not(:disabled)',
                ) ?? [],
              )
              if (event.shiftKey && document.activeElement === items[0]) {
                event.preventDefault()
                items.at(-1)?.focus()
              } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
                event.preventDefault()
                items[0]?.focus()
              }
            }
          }}
        >
          <div className="account-scene" aria-hidden="true">
            {welcomeBand.map((character) => (
              <img key={character.id} src={character.image} alt="" />
            ))}
            <span>♫</span>
          </div>
          <section
            ref={dialog}
            className="account-card"
            role="dialog"
            aria-modal="true"
            aria-label="乐队账号登录"
          >
            <button className="account-close" disabled={busy} onClick={closeForm}>
              返回游戏
            </button>
            <div className="account-band" aria-hidden="true">
              {welcomeBand.map((character) => (
                <img key={character.id} src={character.image} alt="" />
              ))}
            </div>
            <span className="account-eyebrow">怪潮乐队历险记 · 乐手档案</span>
            <h2>{mode === 'register' ? '保存你的乐队进度' : '欢迎回到乐队'}</h2>
            <p className="account-intro">
              {mode === 'register'
                ? '注册后自动保存本机游客进度，换设备登录也能继续。'
                : '登录恢复账号云端进度，当前游客存档不会覆盖它。'}
            </p>
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
                {busy ? '正在连接…' : mode === 'login' ? '登录并进入乐队' : '注册并保存进度'}
              </button>
            </form>
            <p className="account-footnote">
              不注册也能玩。同一账号仅保留一次登录，登录后成长进度自动保存到云端。
            </p>
            {checking && <p className="account-hint">正在确认已有登录，游客游玩不受影响。</p>}
          </section>
        </div>
      )}
    </AccountContext>
  )
}

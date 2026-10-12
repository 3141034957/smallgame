import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from 'react'
import { flushSync } from 'react-dom'
import { activateAccount, ACCOUNT_SAVE_EVENT, exportGuestProgress } from '@/utils/accountStorage'
import { BAND_CHARACTERS } from '@/features/farm/characterRoster.mjs'
import { ACCOUNT_HINT, normalizeAccount } from './validation.mjs'
import {
  AccountContext,
  ACCOUNT_SWITCH_EVENT,
  AUTH_FORM_EVENT,
  type AccountContextValue,
} from './context'
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
  const [account, setAccount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('pending')
  // Restoring from the cloud replaces the storage under a live run, so it
  // takes a second tap that says the round will be lost.
  const [confirmRestore, setConfirmRestore] = useState(false)
  const confirmRestoreRef = useRef(false)
  confirmRestoreRef.current = confirmRestore
  const userId = user?.id
  const sync = useRef<ReturnType<typeof createProgressSync> | null>(null)
  const mounted = useRef(false)
  const principal = useRef<AccountUser | null>(null)
  const pending = useRef<AbortController | null>(null)
  const sequence = useRef(0)
  const mutating = useRef(false)
  const runActive = useRef(false)
  const deferred = useRef<AccountUser | null | undefined>(undefined)
  const dialog = useRef<HTMLElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const cancelPending = useCallback(() => {
    sequence.current++
    pending.current?.abort()
    pending.current = null
  }, [])
  // Returns false when the switch was parked because a run is still live.
  const accept = useCallback((next: AccountUser | null, preserveGuest = false) => {
    const changed = principal.current?.id !== next?.id
    if (changed && !preserveGuest && runActive.current) {
      // Switching now would unmount the live run and move the storage scope with
      // it: park the identity instead and keep playing under the current owner.
      deferred.current = next
      setNotice('本局后切换')
      setChecking(false)
      return false
    }
    // This result is the one that is actually live: an identity parked earlier
    // by a session that has since changed again is stale and must be dropped.
    deferred.current = undefined
    if (changed) {
      sync.current?.stop()
      // Registration adopts this guest run. All other switches tear down under the old owner.
      if (!preserveGuest) {
        flushSync(() => setGameVisible(false))
        runActive.current = false
      }
      activateAccount(next?.id ?? null)
      if (!preserveGuest) setGameKey(next?.id ?? `guest:${Date.now()}`)
      // Never carry a conflict or "saved" badge from the previous account over.
      setSyncStatus('pending')
      // A game that stays mounted keeps showing the old owner's wallet, quests
      // and career until it reads them again from the new scope.
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACCOUNT_SWITCH_EVENT))
    } else activateAccount(next?.id ?? null)
    principal.current = next
    setUser(next)
    setGameVisible(true)
    setChecking(false)
    return true
  }, [])
  const setRunActive = useCallback(
    (active: boolean) => {
      runActive.current = active
      if (active || deferred.current === undefined) return
      const next = deferred.current
      deferred.current = undefined
      // The page reports this from an effect, and applying the switch unmounts
      // it: `flushSync` must not run inside React's own commit. A microtask
      // lands after the commit, close enough to feel immediate.
      queueMicrotask(() => {
        if (!mounted.current || runActive.current) return
        if (accept(next)) setNotice('')
      })
    },
    [accept],
  )
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
      const previous = principal.current
      // A parked switch keeps the notice it was given; an applied one can say
      // what happened.
      if (accept(next)) {
        if (previous && !next) setNotice('已退出登录')
        setError('')
      }
    } catch (cause) {
      if (!mounted.current || revision !== sequence.current || controller.signal.aborted) return
      if (cause instanceof AccountError && cause.status === 401) {
        if (accept(null)) setNotice('登录已失效，可继续玩')
      } else {
        setChecking(false)
        setError('连不上账号服务，先存本机')
      }
    } finally {
      if (pending.current === controller) pending.current = null
      // An aborted or superseded check never reports a result of its own: drop the
      // gate so a cancelled session check can never block starting a run.
      if (controller.signal.aborted || revision !== sequence.current) {
        if (!pending.current) setChecking(false)
      }
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
      if (accept(null)) setNotice('登录已失效，可继续玩')
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
  // A conflict that resolved itself leaves nothing to confirm.
  useEffect(() => {
    if (syncStatus !== 'conflict') setConfirmRestore(false)
  }, [syncStatus])
  const openAccount = useCallback((_next?: 'login' | 'register') => {
    previousFocus.current = document.activeElement as HTMLElement
    window.dispatchEvent(new Event(AUTH_FORM_EVENT))
    setError('')
    setFormOpen(true)
  }, [])
  const closeForm = () => {
    if (mutating.current) return
    setFormOpen(false)
  }
  useEffect(() => {
    if (formOpen) dialog.current?.querySelector<HTMLInputElement>('input')?.focus()
    else previousFocus.current?.focus({ preventScroll: true })
  }, [formOpen])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (mutating.current) return
    if (!normalizeAccount(account)) {
      setError('昵称格式不对')
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
      // The nickname is the identity: the server adopts this guest progress
      // when the name is new and returns the existing save when it is taken.
      const progress = exportGuestProgress()
      const next = await accountRequest('login', { account, progress }, controller.signal)
      if (!mounted.current || controller.signal.aborted || !next) return
      await loadAccountProgress(next.id, controller.signal)
      if (!mounted.current || controller.signal.aborted) return
      setFormOpen(false)
      // Keep the run that just finished: remounting the game would drop the
      // result screen and with it the only chance to upload this score.
      accept(next, true)
      setNotice('已进入，进度已同步')
      announceAccountChange()
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : '登录失败，请重试。')
    } finally {
      if (pending.current === controller) pending.current = null
      mutating.current = false
      if (mounted.current) {
        // The login attempt answers the identity question either way: never leave
        // the gate on "checking" after it.
        setChecking(false)
        setBusy(false)
      }
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
      if (accept(null)) {
        setNotice('已退出登录')
        announceAccountChange()
      }
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
    // A live round, or a result still waiting to be uploaded, would be dropped
    // by the remount: ask once instead of throwing it away on a single tap.
    if (runActive.current && !confirmRestoreRef.current) {
      setNotice('')
      setError('')
      setConfirmRestore(true)
      return
    }
    setConfirmRestore(false)
    mutating.current = true
    setBusy(true)
    cancelPending()
    const controller = new AbortController()
    pending.current = controller
    try {
      await loadAccountProgress(owner.id, controller.signal, true)
      if (!mounted.current || controller.signal.aborted) return
      // Only a successful restore may replace the storage under the game, and
      // only then is the live round remounted. A failed download leaves the
      // uploader it had, so the player can try again from the same button.
      sync.current?.stop()
      flushSync(() => setGameVisible(false))
      setGameKey(`${owner.id}:${Date.now()}`)
      setGameVisible(true)
      setUser({ ...owner })
      setSyncStatus('saved')
      setNotice('已恢复云端进度')
    } catch (cause) {
      // The old run is still mounted: the player keeps playing instead of
      // losing the round to a failed download.
      if (mounted.current && !controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : '恢复失败。')
    } finally {
      if (pending.current === controller) pending.current = null
      mutating.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const value = useMemo<AccountContextValue>(
    () => ({ user, openAccount, checking, setRunActive }),
    [user, openAccount, checking, setRunActive],
  )
  return (
    <AccountContext value={value}>
      <div className="account-game">
        <div
          className="account-bar"
          aria-label={user ? '当前登录账号' : '游客模式'}
          inert={formOpen}
        >
          <span>{user ? `♫ ${user.username}` : '游客模式'}</span>
          <div className="account-actions">
            {user ? (
              <>
                <span role="status">
                  {syncStatus === 'saved'
                    ? '云端已保存'
                    : syncStatus === 'pending'
                      ? '正在保存…'
                      : syncStatus === 'conflict'
                        ? '云端有更新'
                        : '待同步'}
                </span>
                {syncStatus === 'offline' && (
                  <button aria-label="重试保存进度" onClick={() => void sync.current?.flush()}>
                    重试
                  </button>
                )}
                {syncStatus === 'conflict' &&
                  (confirmRestore ? (
                    // The round is still on screen, so the button says what
                    // confirming does to it before it does it.
                    <span className="account-restore-confirm">
                      <button
                        className="is-armed"
                        aria-label="放弃当前对局并恢复云端进度"
                        disabled={busy}
                        onClick={() => void restoreCloud()}
                      >
                        确认恢复
                      </button>
                      <button
                        aria-label="取消恢复云端进度"
                        onClick={() => setConfirmRestore(false)}
                      >
                        取消
                      </button>
                    </span>
                  ) : (
                    <button
                      aria-label="恢复云端进度"
                      disabled={busy}
                      onClick={() => void restoreCloud()}
                    >
                      恢复云端
                    </button>
                  ))}
                <button disabled={busy} onClick={() => void logout()}>
                  {busy ? '处理中…' : '退出登录'}
                </button>
              </>
            ) : (
              <>
                <button aria-label="输入昵称登录并同步进度" onClick={() => openAccount()}>
                  登录
                </button>
              </>
            )}
          </div>
        </div>
        {!formOpen && (error || notice) && (
          <p className="account-game-notice" role={error ? 'alert' : 'status'}>
            {error || notice}
            {error && (
              <button aria-label="重新连接账号服务" onClick={() => void check()}>
                重连
              </button>
            )}
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
            <h2>输入昵称，进入乐队</h2>
            <form onSubmit={(event) => void submit(event)}>
              <label htmlFor="account-name">昵称</label>
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
                {ACCOUNT_HINT} · 不设密码，换设备输入同一昵称即可继续
              </p>
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
              <button
                className="account-primary"
                type="submit"
                disabled={busy}
                aria-label={busy ? undefined : '用这个昵称进入乐队并同步进度'}
              >
                {busy ? '正在连接…' : '进入乐队'}
              </button>
            </form>
            {checking && <p className="account-hint">检查登录中…</p>}
          </section>
        </div>
      )}
    </AccountContext>
  )
}

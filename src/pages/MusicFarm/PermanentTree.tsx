import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { buyFarmUpgrade, resetFarmUpgrades, type FarmProfile } from '@/features/farm/characters'
import {
  normalizePermanentLevels,
  permanentLevelCount,
  permanentNextStep,
  PERMANENT_BRANCHES,
  PERMANENT_CHAIN,
  PERMANENT_TOTAL_LEVELS,
} from '@/features/farm/permanent.mjs'
import './PermanentTree.css'
import { Icon } from './icons'
import type { IconName } from './iconSources'

const BRANCH_STYLE = Object.fromEntries(
  PERMANENT_BRANCHES.map((branch) => [branch.id, branch.name]),
) as Record<string, string>

// The note pinned to the row that was acted on: success reads as a status,
// a refused purchase as an alert. `target: 'reset'` parks it on the footer.
const RESET_TARGET = 'reset'
type Hint = { target: string; text: string; failed: boolean }

export function PermanentTree({
  profile,
  onChange,
  onClose,
}: {
  profile: FarmProfile
  onChange: (profile: FarmProfile) => void
  onClose: () => void
}) {
  const levels = normalizePermanentLevels(profile.growth?.levels)
  const count = permanentLevelCount(levels)
  const nextId = permanentNextStep(levels)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [hint, setHint] = useState<Hint | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  // Bought steps fold into thin rows so the next one is never far away; they
  // stay in the chain either way, only the padding changes.
  const [showOwned, setShowOwned] = useState(false)
  // Blocks a second purchase before the first one has settled.
  const settled = useRef(true)
  const settle = () => {
    settled.current = true
    setPending(null)
  }
  // The chain runs two hundred steps deep: land on the step that is waiting,
  // or on the end of the chain once everything is bought, never on step 1.
  const anchorId = nextId ?? PERMANENT_CHAIN[PERMANENT_CHAIN.length - 1]?.id ?? ''
  const anchor = useRef<HTMLLIElement | null>(null)
  useEffect(() => {
    const el = anchor.current
    if (!el) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    el.scrollIntoView?.({ block: 'center', behavior: still ? 'auto' : 'smooth' })
  }, [anchorId])
  return (
    <div className="farm-growth">
      <div className="farm-growth-scroll">
        <header className="farm-growth-bar">
          <button type="button" aria-label="返回游戏" onClick={onClose}>
            ‹
          </button>
          <div>
            <small>BAND GROWTH</small>
            <h2>乐队升级</h2>
          </div>
          <div className="farm-growth-wallet">
            <small>金币余额</small>
            <strong>✦ {profile.coins.toLocaleString()}</strong>
          </div>
        </header>
        <div className="farm-growth-intro">
          <div>
            <span>下局生效 · 按顺序解锁</span>
          </div>
          <div className="farm-growth-total">
            <strong>
              {count}
              <small> / {PERMANENT_TOTAL_LEVELS}</small>
            </strong>
            <span>已购强化</span>
          </div>
        </div>
        <div className="farm-growth-ownedbar">
          <button
            type="button"
            className="farm-growth-toggle"
            disabled={!count}
            aria-expanded={showOwned}
            aria-label={
              showOwned ? `收起已购的 ${count} 个强化步骤` : `展开已购的 ${count} 个强化步骤`
            }
            onClick={() => setShowOwned(!showOwned)}
          >
            {showOwned ? '收起' : `已购 ${count}`}
          </button>
        </div>
        <ol
          className="farm-growth-nodes"
          style={{ '--chain-fill': `${(count / PERMANENT_TOTAL_LEVELS) * 100}%` } as CSSProperties}
        >
          {PERMANENT_CHAIN.map((item, index) => {
            const owned = !!levels[item.id]
            const open = owned || item.id === nextId
            const affordable = open && !owned && profile.coins >= item.price
            const busy = pending === item.id
            const step = index + 1
            const compact = owned && !showOwned
            return (
              <li
                className={`farm-growth-step${owned ? ' is-trained' : ''}${open ? '' : ' is-locked'}${item.id === nextId ? ' is-next' : ''}${compact ? ' is-compact' : ''}`}
                key={item.id}
                ref={item.id === anchorId ? anchor : null}
                style={{ '--branch-color': `var(--branch-${item.branch})` } as CSSProperties}
              >
                <span className="farm-growth-tier" aria-hidden="true">
                  {step}
                </span>
                {/* The icon tile rides the rail: open steps show their icon, locked
                  ones stay shut. */}
                <span className="farm-growth-tile" aria-hidden="true">
                  <Icon name={open ? (item.kind as IconName) : 'lock'} />
                </span>
                <article className="farm-growth-node" aria-label={`第 ${step} 步 ${item.name}`}>
                  <h4>{item.name}</h4>
                  {owned ? (
                    <span className="farm-growth-owned">已获得 ✓</span>
                  ) : open ? (
                    <>
                      <button
                        type="button"
                        className={`farm-growth-buy${affordable ? ' is-affordable' : ''}`}
                        disabled={!affordable || busy}
                        aria-busy={busy || undefined}
                        aria-label={`升级第 ${step} 步 ${item.name}，花费${item.price}金币`}
                        onClick={() => {
                          if (!settled.current) return
                          settled.current = false
                          setPending(item.id)
                          try {
                            const result = buyFarmUpgrade(item.id, 0)
                            onChange(result.profile)
                            const text = result.error ?? `已获得 ${item.name}`
                            setFailed(!!result.error)
                            setMessage(text)
                            setHint({ target: item.id, text, failed: !!result.error })
                          } finally {
                            queueMicrotask(settle)
                          }
                        }}
                      >
                        ✦ {item.price.toLocaleString()}
                      </button>
                      {!affordable && (
                        <small className="farm-growth-shortfall">
                          还差 ✦{(item.price - profile.coins).toLocaleString()}
                        </small>
                      )}
                    </>
                  ) : (
                    <span className="farm-growth-sealed">未解锁 · {BRANCH_STYLE[item.branch]}</span>
                  )}
                  {hint?.target === item.id && (
                    <p
                      className={`farm-growth-hint${hint.failed ? ' is-error' : ''}`}
                      role={hint.failed ? 'alert' : 'status'}
                    >
                      {hint.text}
                    </p>
                  )}
                </article>
              </li>
            )
          })}
        </ol>
        <footer className="farm-growth-reset">
          {confirmReset ? (
            <div role="group" aria-label="确认重置强化">
              <p>返还 ✦ {(profile.growth?.spent ?? 0).toLocaleString()}</p>
              <button type="button" onClick={() => setConfirmReset(false)}>
                取消
              </button>
              <button
                type="button"
                className="is-primary"
                onClick={() => {
                  const result = resetFarmUpgrades()
                  onChange(result.profile)
                  const text =
                    result.error ??
                    (result.paid ? '强化已重置，金币已返还。' : '当前没有需要重置的强化。')
                  setFailed(!!result.error)
                  setMessage(text)
                  // Every step is on sale again, so a note left on one of them
                  // would be describing a purchase that no longer exists. The
                  // answer belongs to the button that was pressed instead.
                  setHint({ target: RESET_TARGET, text, failed: !!result.error })
                  setConfirmReset(false)
                }}
              >
                确认重置
              </button>
            </div>
          ) : (
            <>
              <button type="button" disabled={!count} onClick={() => setConfirmReset(true)}>
                免费重置强化
              </button>
            </>
          )}
          {hint?.target === RESET_TARGET && (
            <p
              className={`farm-growth-hint${hint.failed ? ' is-error' : ''}`}
              role={hint.failed ? 'alert' : 'status'}
            >
              {hint.text}
            </p>
          )}
        </footer>
      </div>
      {/* Outside the scroller, so the answer is on screen wherever the chain
          has been scrolled to. The note next to the button carries the live
          region: one message, announced once. */}
      {message && <p className={`farm-growth-message${failed ? ' is-error' : ''}`}>{message}</p>}
    </div>
  )
}

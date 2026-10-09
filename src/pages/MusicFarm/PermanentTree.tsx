import { useRef, useState, type CSSProperties } from 'react'
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

const BRANCH_STYLE = Object.fromEntries(
  PERMANENT_BRANCHES.map((branch) => [branch.id, branch.name]),
) as Record<string, string>

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
  const [confirmReset, setConfirmReset] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  // Blocks a second purchase before the first one has settled.
  const settled = useRef(true)
  const settle = () => {
    settled.current = true
    setPending(null)
  }
  return (
    <div className="farm-growth">
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
      {message && (
        <p
          className={`farm-growth-message${failed ? ' is-error' : ''}`}
          role={failed ? 'alert' : 'status'}
        >
          {message}
        </p>
      )}
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
          return (
            <li
              className={`farm-growth-step${owned ? ' is-trained' : ''}${open ? '' : ' is-locked'}${item.id === nextId ? ' is-next' : ''}`}
              key={item.id}
              style={{ '--branch-color': `var(--branch-${item.branch})` } as CSSProperties}
            >
              <span className="farm-growth-tier" aria-hidden="true">
                {step}
              </span>
              {/* The icon tile rides the rail: owned steps glow, locked ones stay shut. */}
              <span className="farm-growth-tile" aria-hidden="true">
                {owned ? item.icon : open ? item.icon : '🔒'}
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
                          setFailed(!!result.error)
                          setMessage(result.error ?? `已获得 ${item.name}`)
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
                setFailed(!!result.error)
                setMessage(
                  result.error ??
                    (result.paid ? '强化已重置，金币已返还。' : '当前没有需要重置的强化。'),
                )
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
      </footer>
    </div>
  )
}

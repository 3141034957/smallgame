import { useState } from 'react'
import { buyFarmUpgrade, resetFarmUpgrades, type FarmProfile } from '@/features/farm/characters'
import {
  normalizePermanentLevels,
  permanentEffect,
  permanentLevelCount,
  permanentPrice,
  PERMANENT_BRANCHES,
  PERMANENT_TOTAL_LEVELS,
  PERMANENT_UPGRADES,
} from '@/features/farm/permanent.mjs'
import './PermanentTree.css'

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
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
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
          <span>全角色通用 · 永久保存 · 下局生效</span>
          <h3>把每次演出，变成下一次的底气。</h3>
          <p>八项强化全部开放，各项独立购买，无关卡解锁要求。</p>
        </div>
        <div className="farm-growth-total">
          <strong>
            {count}
            <small> / {PERMANENT_TOTAL_LEVELS}</small>
          </strong>
          <span>已购强化等级</span>
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
      <div className="farm-growth-tree">
        {PERMANENT_BRANCHES.map((branch) => (
          <section
            className={`farm-growth-branch is-${branch.id}`}
            key={branch.id}
            aria-label={branch.name}
          >
            <header>
              <span aria-hidden="true">{branch.icon}</span>
              <h3>{branch.name}</h3>
            </header>
            <div className="farm-growth-nodes">
              {PERMANENT_UPGRADES.filter((item) => item.branch === branch.id).map((item) => {
                const level = levels[item.id]
                const price = permanentPrice(item.id, level)
                const maxed = price === null
                const affordable = price !== null && profile.coins >= price
                return (
                  <article
                    className={`farm-growth-node${level ? ' is-trained' : ''}${maxed ? ' is-maxed' : ''}`}
                    key={item.id}
                    aria-label={item.name}
                  >
                    <div className="farm-growth-node-title">
                      <span aria-hidden="true">{item.icon}</span>
                      <h4>{item.name}</h4>
                      <b>
                        Lv.{level}
                        <small> / {item.max}</small>
                      </b>
                    </div>
                    <div
                      className="farm-growth-meter"
                      role="progressbar"
                      aria-label={`${item.name}强化进度`}
                      aria-valuenow={level}
                      aria-valuemin={0}
                      aria-valuemax={item.max}
                    >
                      <i style={{ width: `${(level / item.max) * 100}%` }} />
                    </div>
                    <p>{item.description}</p>
                    <dl>
                      <div>
                        <dt>当前</dt>
                        <dd>{permanentEffect(item.id, level)}</dd>
                      </div>
                      {!maxed && (
                        <div>
                          <dt>下级</dt>
                          <dd>{permanentEffect(item.id, level + 1)}</dd>
                        </div>
                      )}
                    </dl>
                    <button
                      type="button"
                      disabled={!affordable}
                      aria-label={
                        maxed ? `${item.name}已满级` : `升级${item.name}，花费${price}金币`
                      }
                      onClick={() => {
                        const result = buyFarmUpgrade(item.id, level)
                        onChange(result.profile)
                        setFailed(!!result.error)
                        setMessage(result.error ?? `${item.name}升至 Lv.${level + 1}，下一局生效。`)
                      }}
                    >
                      {maxed ? '已满级 ✓' : `升级 · ✦ ${price.toLocaleString()}`}
                    </button>
                    {!maxed && !affordable && (
                      <small className="farm-growth-shortfall">
                        还差 {(price - profile.coins).toLocaleString()} 金币
                      </small>
                    )}
                  </article>
                )
              })}
            </div>
          </section>
        ))}
      </div>
      <footer className="farm-growth-reset">
        {confirmReset ? (
          <div role="group" aria-label="确认重置强化">
            <p>
              重置全部强化，返还实际支出的 {(profile.growth?.spent ?? 0).toLocaleString()}{' '}
              金币。下一局使用重置后的属性。
            </p>
            <button type="button" onClick={() => setConfirmReset(false)}>
              取消
            </button>
            <button
              type="button"
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
            <p>尝试不同成长路线，重置可返还实际支出的金币。</p>
            <button type="button" disabled={!count} onClick={() => setConfirmReset(true)}>
              免费重置强化
            </button>
          </>
        )}
      </footer>
    </div>
  )
}

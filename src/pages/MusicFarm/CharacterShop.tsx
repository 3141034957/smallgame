import { useEffect, useRef, useState } from 'react'
import { FARM_CHARACTERS, selectFarmCharacter, type FarmProfile } from '@/features/farm/characters'
import './CharacterShop.css'

export function CharacterShop({
  profile,
  onChange,
  onClose,
}: {
  profile: FarmProfile
  onChange: (profile: FarmProfile) => void
  onClose?: () => void
}) {
  const [previewId, setPreviewId] = useState(profile.selected)
  // Unlocking a character equips it, so the preview has to follow.
  useEffect(() => setPreviewId(profile.selected), [profile.selected])
  const [message, setMessage] = useState('')
  // A double tap used to buy twice: the button stays disabled until this
  // purchase has gone through, and the ref blocks a second synchronous click.
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const character = FARM_CHARACTERS.find((item) => item.id === previewId) ?? FARM_CHARACTERS[0]
  const owned = profile.owned.includes(character.id)
  const equipped = profile.selected === character.id
  const affordable = profile.coins >= character.price
  const missing = Math.max(0, character.price - profile.coins)

  return (
    <div className="farm-shop">
      <header className="farm-shop-bar">
        <button
          className="farm-shop-back"
          type="button"
          aria-label="返回游戏"
          onClick={() => onClose?.()}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <div className="farm-shop-title">
          <small>BAND BACKSTAGE</small>
          <h2>角色商店</h2>
        </div>
        <span className="farm-shop-wallet">
          <i aria-hidden="true">✦</i>
          <span>
            <small>金币</small>
            <strong>{profile.coins.toLocaleString()}</strong>
          </span>
        </span>
      </header>
      {message && (
        <p className="farm-shop-toast" role="status">
          {message}
        </p>
      )}
      <main className="farm-shop-showcase">
        <div className="farm-shop-status">
          <span>{equipped ? '当前装备' : owned ? '已拥有' : '待解锁角色'}</span>
          <strong>{owned ? character.name : `✦ ${character.price.toLocaleString()}`}</strong>
        </div>
        <section className="farm-shop-stage">
          <div className="farm-shop-window" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div
            className="farm-shop-preview"
            style={{ '--character-glow': character.glow } as React.CSSProperties}
          >
            <div className="farm-shop-halo" aria-hidden="true" />
            <img key={character.id} src={character.image} alt={character.name} />
          </div>
          <div className="farm-shop-platform" aria-hidden="true">
            <span />
          </div>
        </section>
        <section className="farm-shop-detail">
          <div>
            <small>NO. {String(FARM_CHARACTERS.indexOf(character) + 1).padStart(2, '0')}</small>
            <h3>{character.name}</h3>
            <p>
              {owned ? character.desc : `还差 ${missing.toLocaleString()} 金币，打完这局就能带走`}
            </p>
          </div>
          <button
            type="button"
            className={`farm-shop-action${equipped ? ' is-active' : ''}${!owned ? ' is-buy' : ''}`}
            disabled={busy || equipped || (!owned && !affordable)}
            onClick={() => {
              if (pending.current) return
              pending.current = true
              setBusy(true)
              try {
                const result = selectFarmCharacter(character.id)
                onChange(result.profile)
                setMessage(
                  result.error ??
                    `${owned ? '已切换为' : '解锁成功！'} ${character.name}，上场吧！`,
                )
              } finally {
                pending.current = false
                setBusy(false)
              }
            }}
          >
            {equipped
              ? '使用中'
              : owned
                ? '使用角色'
                : `解锁 · ✦${character.price.toLocaleString()}`}
          </button>
        </section>
      </main>
      <section className="farm-shop-picker" aria-label="可选角色">
        <header className="farm-shop-picker-head">
          <div>
            <small>CHARACTER COLLECTION</small>
            <strong>选择角色</strong>
            <p>角色决定上场外观，本局乐队通过升级组建。</p>
          </div>
          <span>
            <b>{profile.owned.length}</b> / {FARM_CHARACTERS.length}
          </span>
        </header>
        <div className="farm-shop-list">
          {FARM_CHARACTERS.map((item) => {
            const unlocked = profile.owned.includes(item.id),
              active = profile.selected === item.id
            return (
              <button
                type="button"
                key={item.id}
                aria-label={`预览${item.name}`}
                aria-pressed={item.id === previewId}
                className={`${item.id === previewId ? 'is-focused ' : ''}${active ? 'is-active ' : ''}${unlocked ? 'is-owned' : ''}`}
                onClick={() => setPreviewId(item.id)}
              >
                <small className="farm-shop-badge">
                  {active ? '使用中' : unlocked ? '已拥有' : `✦${item.price.toLocaleString()}`}
                </small>
                <span className="farm-shop-thumb">
                  <img src={item.image} alt="" loading="lazy" />
                </span>
                <strong>{item.name}</strong>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

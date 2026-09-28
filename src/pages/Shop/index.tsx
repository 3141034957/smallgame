import { useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { CHARACTERS, DEFAULT_CHARACTER_ID } from '@/features/shop/catalog'
import type { Character } from '@/features/shop/catalog'
import { getSelected, getUnlocks, saveSelected, saveUnlocks } from '@/features/shop/storage'
import { getStarBalance, saveStarBalance } from '@/utils/starCurrency'
import './index.less'

function CharacterPreview({ character }: { character: Character }) {
  return (
    <div className="shop-preview" aria-label={`${character.name} 预览`}>
      <div className="shop-preview-halo" />
      <img
        key={character.id}
        className="shop-preview-img"
        src={character.image}
        alt={character.name}
        style={{ filter: `drop-shadow(0 18px 18px ${character.colors.glow})` }}
      />
    </div>
  )
}

function Shop() {
  const navigate = useNavigate()
  const [unlocks, setUnlocks] = useState(getUnlocks)
  const [selected, setSelected] = useState(getSelected)
  const [previewId, setPreviewId] = useState(getSelected)
  const [stars, setStars] = useState(getStarBalance)
  const [message, setMessage] = useState('')
  const messageTimerRef = useRef<number | null>(null)
  const previewCharacter =
    CHARACTERS.find((character) => character.id === previewId) ??
    CHARACTERS.find((character) => character.id === DEFAULT_CHARACTER_ID) ??
    CHARACTERS[0]
  const previewOwned = unlocks.includes(previewCharacter.id)
  const previewActive = selected === previewCharacter.id

  const showMessage = (msg: string) => {
    setMessage(msg)
    if (messageTimerRef.current !== null) {
      window.clearTimeout(messageTimerRef.current)
    }
    messageTimerRef.current = window.setTimeout(() => {
      messageTimerRef.current = null
      setMessage('')
    }, 2000)
  }

  useEffect(() => () => {
    if (messageTimerRef.current !== null) {
      window.clearTimeout(messageTimerRef.current)
    }
  }, [])

  const handleBuy = (char: Character) => {
    if (unlocks.includes(char.id)) {
      saveSelected(char.id)
      setSelected(char.id)
      showMessage(`已切换至 ${char.name}`)
      return
    }
    if (stars < char.price) {
      showMessage(`星星不足！还需 ${char.price - stars} 颗`)
      return
    }
    const newStars = saveStarBalance(stars - char.price)
    setStars(newStars)
    const newUnlocks = [...unlocks, char.id]
    saveUnlocks(newUnlocks)
    setUnlocks(newUnlocks)
    saveSelected(char.id)
    setSelected(char.id)
    showMessage(`🎉 解锁 ${char.name}！`)
  }

  return (
    <div className="shop-page">
      <div className="shop-ambient" aria-hidden="true">
        <i className="shop-pipe shop-pipe--left" />
        <i className="shop-pipe shop-pipe--right" />
        <i className="shop-gear shop-gear--left" />
        <i className="shop-gear shop-gear--right" />
      </div>

      <header className="shop-header">
        <button
          className="shop-back"
          type="button"
          onClick={() => navigate('/mochi')}
          aria-label="返回主页"
        >
          <span aria-hidden="true">‹</span>
        </button>

        <div className="shop-title-sign">
          <small>MECHANICAL WORKSHOP</small>
          <h1>角色工坊</h1>
        </div>

        <span className="shop-points">
          <i aria-hidden="true">★</i>
          <span>
            <small>星星</small>
            <strong>{stars}</strong>
          </span>
        </span>
      </header>

      {message && <div className="shop-toast">{message}</div>}

      <main className="shop-showcase">
        <div className="shop-preview-status">
          <span>{previewOwned ? (previewActive ? '当前装备' : '已拥有') : '待解锁角色'}</span>
          <strong>
            {previewOwned
              ? previewCharacter.name
              : `★ ${previewCharacter.price}`}
          </strong>
        </div>

        <section className="shop-stage">
          <div className="shop-stage-window" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <CharacterPreview character={previewCharacter} />
          <div className="shop-platform" aria-hidden="true">
            <span />
          </div>
        </section>

        <section className="shop-character-detail">
          <div>
            <small>NO. {String(CHARACTERS.indexOf(previewCharacter) + 1).padStart(2, '0')}</small>
            <h2>{previewCharacter.name}</h2>
            <p>{previewCharacter.desc}</p>
          </div>
          <button
            className={
              'shop-main-action' +
              (previewActive ? ' shop-main-action--active' : '') +
              (!previewOwned ? ' shop-main-action--buy' : '')
            }
            type="button"
            onClick={() => handleBuy(previewCharacter)}
            disabled={previewActive}
          >
            {previewActive
              ? '使用中'
              : previewOwned
                ? '使用角色'
                : `解锁 · ★${previewCharacter.price}`}
          </button>
        </section>
      </main>

      <section className="shop-picker" aria-label="可选角色">
        <header className="shop-picker-header">
          <div>
            <small>CHARACTER COLLECTION</small>
            <strong>选择角色</strong>
          </div>
          <span>
            <b>{unlocks.length}</b> / {CHARACTERS.length}
          </span>
        </header>

        <div className="shop-character-list">
          {CHARACTERS.map((character) => {
            const owned = unlocks.includes(character.id)
            const active = selected === character.id
            const focused = previewCharacter.id === character.id

            return (
              <button
                className={
                  'shop-character-card' +
                  (focused ? ' shop-character-card--focused' : '') +
                  (active ? ' shop-character-card--active' : '') +
                  (owned ? ' shop-character-card--owned' : '')
                }
                key={character.id}
                type="button"
                onClick={() => setPreviewId(character.id)}
                aria-pressed={focused}
                aria-label={`预览${character.name}`}
              >
                <span className="shop-card-badge">
                  {active
                    ? '使用中'
                    : owned
                      ? '已拥有'
                      : `★${character.price}`}
                </span>
                <span className="shop-card-image">
                  <img src={character.image} alt="" />
                </span>
                <strong>{character.name}</strong>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export default Shop

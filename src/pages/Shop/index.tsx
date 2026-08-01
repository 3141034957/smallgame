import { useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { getStarBalance, saveStarBalance } from '@/utils/starCurrency'
import './index.less'

interface Character {
  id: string
  name: string
  desc: string
  price: number
  image: string
  colors: {
    head: string
    body: string
    eye: string
    foot: string
    antenna: string
    glow: string
  }
}

const CHARACTER_CATALOG: Character[] = [
  {
    id: 'default',
    name: 'HUG',
    desc: '最初的机械核心',
    price: 1,
    image: '/assets/Pasted-20260730-103104_pixian_ai.png',
    colors: {
      head: 'linear-gradient(145deg, #8cb8ce, #5f83ad 66%, #4b6791)',
      body: 'linear-gradient(145deg, #688eb9, #435d91)',
      eye: '#a8fff0',
      foot: '#4c6497',
      antenna: '#a8fff0',
      glow: 'rgba(168, 255, 240, 0.6)',
    },
  },
  {
    id: 'steampunk',
    name: 'Oscar',
    desc: '黄铜与蒸汽的艺术',
    price: 1,
    image: '/assets/Pasted-20260730-104554_pixian_ai.png',
    colors: {
      head: 'linear-gradient(145deg, #d4a54a, #b8862d 66%, #8b6914)',
      body: 'linear-gradient(145deg, #c49a3c, #9a7628)',
      eye: '#ffd700',
      foot: '#a0762a',
      antenna: '#ffd700',
      glow: 'rgba(255, 215, 0, 0.6)',
    },
  },
  {
    id: 'penguin',
    name: '超能MM',
    desc: '披风与快刀的流浪侠客',
    price: 1,
    image: '/assets/Pasted-20260730-112045_pixian_ai.png',
    colors: {
      head: 'linear-gradient(145deg, #34333f, #14151c 66%, #090a0f)',
      body: 'linear-gradient(145deg, #f5f4ec, #cfd8dc)',
      eye: '#80d8ff',
      foot: '#f4a62a',
      antenna: '#b86fe8',
      glow: 'rgba(128, 216, 255, 0.62)',
    },
  },
  {
    id: 'neon',
    name: '咕咕嘎嘎',
    desc: '未来之光的化身',
    price: 1,
    image: '/assets/Pasted-20260730-104808_pixian_ai.png',
    colors: {
      head: 'linear-gradient(145deg, #a855f7, #7c3aed 66%, #5b21b6)',
      body: 'linear-gradient(145deg, #8b5cf6, #6d28d9)',
      eye: '#f472b6',
      foot: '#7c3aed',
      antenna: '#f472b6',
      glow: 'rgba(244, 114, 182, 0.6)',
    },
  },
  {
    id: 'golden',
    name: '我的刀盾',
    desc: '不灭的耀眼光辉',
    price: 1,
    image: '/assets/Pasted-20260730-105451_pixian_ai.png',
    colors: {
      head: 'linear-gradient(145deg, #fbbf24, #f59e0b 66%, #d97706)',
      body: 'linear-gradient(145deg, #fbbf24, #f59e0b)',
      eye: '#fef3c7',
      foot: '#d97706',
      antenna: '#fef3c7',
      glow: 'rgba(253, 230, 138, 0.7)',
    },
  },
  {
    id: 'shadow',
    name: '超能GG',
    desc: '来自深渊的注视',
    price: 1,
    image: '/assets/Pasted-20260730-110958_pixian_ai.png',
    colors: {
      head: 'linear-gradient(145deg, #374151, #1f2937 66%, #111827)',
      body: 'linear-gradient(145deg, #4b5563, #1f2937)',
      eye: '#ef4444',
      foot: '#374151',
      antenna: '#ef4444',
      glow: 'rgba(239, 68, 68, 0.5)',
    },
  },
  {
    id: 'burger-dog',
    name: '汉堡小狗',
    desc: '把美味和好运一起带来',
    price: 1,
    image: '/assets/Pasted-20260730-115541_pixian_ai.png',
    colors: {
      head: 'linear-gradient(145deg, #ffb13b, #f07c25 66%, #d95d17)',
      body: 'linear-gradient(145deg, #9ed84f, #5eaa3f)',
      eye: '#5b241c',
      foot: '#ff9b38',
      antenna: '#8ed34c',
      glow: 'rgba(255, 171, 67, 0.62)',
    },
  },
]

const CHARACTER_DISPLAY_ORDER = [
  'burger-dog',
  'golden',
  'neon',
  'shadow',
  'penguin',
  'steampunk',
  'default',
]

const CHARACTERS = CHARACTER_DISPLAY_ORDER.map(
  (id) => CHARACTER_CATALOG.find((character) => character.id === id) as Character,
)

const STORAGE_KEY = 'character-unlocks-v1'
const SELECTED_KEY = 'character-selected-v1'
const DEFAULT_CHARACTER_ID = 'steampunk'
const DEFAULT_CHARACTER_MIGRATION_KEY = 'character-default-oscar-v1'

function getUnlocks(): string[] {
  try {
    const val = localStorage.getItem(STORAGE_KEY)
    const stored = val ? JSON.parse(val) : []
    const unlocks = Array.isArray(stored) ? stored : []
    if (unlocks.includes(DEFAULT_CHARACTER_ID)) return unlocks
    const nextUnlocks = [...unlocks, DEFAULT_CHARACTER_ID]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUnlocks))
    return nextUnlocks
  } catch {
    return [DEFAULT_CHARACTER_ID]
  }
}

function saveUnlocks(ids: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
}

function getSelected(): string {
  const selected = localStorage.getItem(SELECTED_KEY)
  const migrated = localStorage.getItem(DEFAULT_CHARACTER_MIGRATION_KEY)

  if (!migrated) {
    localStorage.setItem(DEFAULT_CHARACTER_MIGRATION_KEY, '1')
    if (!selected || selected === 'default' || selected === 'burger-dog') {
      localStorage.setItem(SELECTED_KEY, DEFAULT_CHARACTER_ID)
      return DEFAULT_CHARACTER_ID
    }
  }

  return selected || DEFAULT_CHARACTER_ID
}

function saveSelected(id: string) {
  localStorage.setItem(SELECTED_KEY, id)
}

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
          onClick={() => navigate('/')}
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
export { CHARACTERS, getSelected, saveSelected }

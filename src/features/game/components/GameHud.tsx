import type { RefObject } from 'react'
import { formatScore } from '@/features/game/engine'
import type { GameStatus } from '@/features/game/engine'

type GameHudProps = {
  status: GameStatus
  platformIndex: number
  stars: number
  score: number
  paceMultiplier: number
  isFever: boolean
  isDoubleScore: boolean
  feverBarRef: RefObject<HTMLElement | null>
  onTogglePause: () => void
}

export function GameHud({
  status,
  platformIndex,
  stars,
  score,
  paceMultiplier,
  isFever,
  isDoubleScore,
  feverBarRef,
  onTogglePause,
}: GameHudProps) {
  return (
    <>
      <header className="hud">
        <button
          className="round-button pause-button"
          type="button"
          aria-label={status === 'paused' ? '继续游戏' : '暂停游戏'}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onTogglePause()
          }}
          disabled={status !== 'playing' && status !== 'paused'}
        >
          {status === 'paused' ? (
            <span className="play-icon">▶</span>
          ) : (
            <>
              <i />
              <i />
            </>
          )}
        </button>
        <div className="endless-status" aria-label={`无限模式，第 ${platformIndex} 层`}>
          <span>∞</span>
          <strong>{platformIndex}</strong>
          <small>层</small>
        </div>
        <div className="best-pill" aria-label={`拥有 ${stars} 颗星星`}>
          <span className="mini-cat star-wallet-icon">★</span>
          <span>星星</span>
          <strong>{stars}</strong>
        </div>
      </header>
      <div className="score">
        <span>SCORE</span>
        <strong>{formatScore(score)}</strong>
        <small>速度 ×{paceMultiplier.toFixed(2)}</small>
      </div>
      {isFever && (
        <div className="chorus-banner">
          <span>副歌模式</span>
          <strong>×2</strong>
          <i>
            <b ref={feverBarRef} />
          </i>
        </div>
      )}
      {isDoubleScore && !isFever && (
        <div className="double-score-banner">
          <span>♯ 狂热旋律</span>
          <strong>×2</strong>
        </div>
      )}
    </>
  )
}

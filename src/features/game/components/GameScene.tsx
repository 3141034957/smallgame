import type { CSSProperties, MutableRefObject, RefObject } from 'react'
import {
  NOTE_EFFECTS,
  PLATFORM_AREA_SCALE,
  slotHorizontalSpread,
  slotScale,
  slotY,
} from '@/features/game/engine'
import type { FrameState, LandingImpact, Platform } from '@/features/game/engine'

type GameSceneProps = {
  visiblePlatforms: Platform[]
  frame: FrameState
  gameSize: { width: number; height: number }
  bounceId: number
  impact: LandingImpact
  character: { id: string; image: string; glow: string }
  platformElementsRef: MutableRefObject<Map<number, HTMLDivElement>>
  playerRef: RefObject<HTMLDivElement | null>
  playerShadowRef: RefObject<HTMLDivElement | null>
}

export function GameScene({
  visiblePlatforms,
  frame,
  gameSize,
  bounceId,
  impact,
  character,
  platformElementsRef,
  playerRef,
  playerShadowRef,
}: GameSceneProps) {
  return (
    <>
      <div className="platform-layer" aria-hidden="true">
        {visiblePlatforms.map((platform, index) => {
          const distance = index - frame.phase
          const y = slotY(distance)
          const scale = slotScale(distance)
          const x = platform.x * gameSize.width * slotHorizontalSpread(scale)
          const width = (108 + platform.width * 38) * PLATFORM_AREA_SCALE
          const opacity = distance < 0 ? Math.max(0, 1 + distance * 14) : 1
          const platformStyle = {
            '--platform-x': `${x}px`,
            '--platform-y': `${y * gameSize.height / 100}px`,
            '--platform-width': `${width}px`,
            '--platform-scale': scale,
            '--platform-depth': 100 - index,
            '--platform-opacity': opacity,
            '--treat-scale': (0.55 + scale * 0.45) / scale,
            '--platform-note-size': `${width / 2}px`,
          } as CSSProperties

          return (
            <div
              className={[
                'platform-wrap',
                platform.id === bounceId ? 'is-bounced' : '',
                platform.reward > 1 ? 'platform-wrap--risk' : '',
              ].filter(Boolean).join(' ')}
              style={platformStyle}
              key={platform.id}
              ref={(element) => {
                if (element) platformElementsRef.current.set(platform.id, element)
                else platformElementsRef.current.delete(platform.id)
              }}
            >
              <div className="platform">
                {platform.reward > 1 && <span className="risk-badge">×1.5</span>}
                <span className="platform-light" />
                {platform.note && (
                  <span className={`platform-note platform-note--${platform.note}`}>
                    {NOTE_EFFECTS[platform.note].symbol}
                  </span>
                )}
                {platform.treat === 'star' && <span className="treat treat--star">★</span>}
              </div>
            </div>
          )
        })}
      </div>
      <div
        ref={playerRef}
        className={`player player--character-${character.id}`}
        aria-hidden="true"
        style={{ '--char-glow': character.glow } as CSSProperties}
      >
        <div ref={playerShadowRef} className="player-shadow" />
        <div
          className={[
            'player-sprite',
            impact.id > 0 ? 'player-sprite--landed' : '',
            impact.perfect ? 'player-sprite--perfect' : '',
          ].filter(Boolean).join(' ')}
          key={`player-impact-${impact.id}`}
        >
          <img className="player-character-image" src={character.image} alt="" draggable={false} />
        </div>
        <span className="spark spark--one">✦</span>
        <span className="spark spark--two">★</span>
      </div>
    </>
  )
}

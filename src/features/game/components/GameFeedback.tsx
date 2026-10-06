import type { CSSProperties } from 'react'
import type { GameStatus, LandingImpact, NoteFeedback } from '@/features/game/engine'

type GameFeedbackProps = {
  status: GameStatus
  feedback: { label: string; id: number }
  streak: number
  noteFeedback: NoteFeedback | null
  paintEffectId: number
  impact: LandingImpact
}

export function GameFeedback({
  status,
  feedback,
  streak,
  noteFeedback,
  paintEffectId,
  impact,
}: GameFeedbackProps) {
  if (status !== 'playing') return null
  return (
    <>
      {feedback.label && (
        <div className="feedback" key={`feedback-${feedback.id}`}>
          <strong>{feedback.label}</strong>
          {streak > 1 && <span>×{streak}</span>}
        </div>
      )}
      {noteFeedback && (
        <div
          className={`note-effect-toast note-effect-toast--${noteFeedback.kind}`}
          key={`note-effect-${noteFeedback.id}`}
        >
          <strong>{noteFeedback.symbol}</strong>
          <span>{noteFeedback.label}</span>
        </div>
      )}
      {paintEffectId > 0 && (
        <div className="paint-splatter" key={`paint-${paintEffectId}`} aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <i className={`paint-splatter__blob paint-splatter__blob--${index + 1}`} key={index} />
          ))}
        </div>
      )}
      {impact.id > 0 && (
        <div
          className={`landing-impact${impact.perfect ? ' landing-impact--perfect' : ''}`}
          style={{ left: `${impact.x}%` }}
          key={`impact-${impact.id}`}
        >
          {[0, 1, 2, 3, 4, 5, 6, 7].map((particle) => (
            <i
              style={{ '--particle-angle': `${particle * 45}deg` } as CSSProperties}
              key={particle}
            />
          ))}
          {impact.reward > 1 && <strong>×{impact.reward}</strong>}
        </div>
      )}
    </>
  )
}

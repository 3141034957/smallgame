import type { CSSProperties } from 'react'
import './StartStage.css'

type StartStageProps = {
  character: { image: string; glow: string }
}

/** A compact, decorative preview of the member who will start the next run. */
export default function StartStage({ character }: StartStageProps) {
  return (
    <div
      className="farm-start-stage"
      style={{ '--stage-glow': character.glow } as CSSProperties}
      aria-hidden="true"
    >
      <div className="farm-start-stage-sun" />
      <div className="farm-start-stage-hills" />
      <div className="farm-start-stage-flags">
        {Array.from({ length: 7 }, (_, index) => (
          <i key={index} />
        ))}
      </div>
      <div className="farm-start-stage-platform" />
      <div className="farm-start-stage-speaker is-left" />
      <div className="farm-start-stage-speaker is-right" />
      <span className="farm-start-stage-note is-left">♪</span>
      <span className="farm-start-stage-note is-right">♫</span>
      <img
        key={character.image}
        className="farm-start-stage-character"
        src={character.image}
        alt=""
        width="128"
        height="128"
        draggable="false"
      />
    </div>
  )
}

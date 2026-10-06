import type { CSSProperties } from 'react'

const GEAR_SPOKES = Array.from({ length: 10 }, (_, index) => index)
const CHAIN_LINKS = Array.from({ length: 8 }, (_, index) => index)

function MechanicalGear({ variant }: { variant: 'upper' | 'lower' | 'rear' }) {
  return (
    <div className={`mechanical-gear mechanical-gear--${variant}`}>
      {GEAR_SPOKES.map((spoke) => (
        <i
          className="gear-spoke"
          style={{ '--spoke-angle': `${spoke * 36}deg` } as CSSProperties}
          key={spoke}
        />
      ))}
      <span className="gear-hub">
        <b />
      </span>
    </div>
  )
}

export function MechanicalDecor() {
  return (
    <div className="mechanical-decor" aria-hidden="true">
      <div className="cavern-facet cavern-facet--one" />
      <div className="cavern-facet cavern-facet--two" />
      <div className="cavern-facet cavern-facet--three" />
      <div className="conduit conduit--left" />
      <div className="conduit conduit--right" />
      <div className="chain chain--left">
        {CHAIN_LINKS.map((link) => (
          <i key={link} />
        ))}
      </div>
      <div className="chain chain--right">
        {CHAIN_LINKS.map((link) => (
          <i key={link} />
        ))}
      </div>
      <MechanicalGear variant="rear" />
      <MechanicalGear variant="upper" />
      <MechanicalGear variant="lower" />
      <div className="rotor-arm rotor-arm--one" />
      <div className="rotor-arm rotor-arm--two" />
      <div className="rotor-joint rotor-joint--one" />
      <div className="rotor-joint rotor-joint--two" />
      <div className="hanging-bell hanging-bell--one">
        <i />
      </div>
      <div className="hanging-bell hanging-bell--two">
        <i />
      </div>
      <div className="hanging-bell hanging-bell--three">
        <i />
      </div>
    </div>
  )
}

import { farmBuildSummary, farmBuiltLevels } from '@/features/farm/build'
import type { Gear } from '@/features/farm/rules.mjs'

export function BuildSummary({ gear }: { gear: Gear }) {
  const summary = farmBuildSummary(gear).filter((item) => item.weaponLevel || item.chipLevel)
  if (!summary.length) return null
  return <section className="farm-build" aria-label="本局构筑">
    <div className="farm-build-heading"><small>THIS RUN&apos;S BAND</small><span>共 {farmBuiltLevels(gear)} 次升级</span></div>
    <ul>{summary.map((item) => <li key={item.weapon} className={item.evolved ? 'is-evolved' : ''}>
      <span aria-hidden="true">{item.weaponIcon}</span>
      <div><strong>{item.evolved ? item.form : item.weaponName}</strong><small>{item.weaponName} Lv.{item.weaponLevel} ＋ {item.chipName} Lv.{item.chipLevel}</small></div>
      <b>{item.evolved ? '终极 ✦' : `${item.weaponLevel + item.chipLevel}/6`}</b>
    </li>)}</ul>
  </section>
}

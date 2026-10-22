import type { CSSProperties } from 'react'
import { farmBuildSummary, farmBuiltLevels, farmComboReachable } from '@/features/farm/build'
import {
  DRUM_ECHO_KILLS_PER_DAMAGE,
  drumEchoStats,
  FPS,
  MAX_GEAR_LEVEL,
} from '@/features/farm/rules.mjs'
import type { Gear } from '@/features/farm/rules.mjs'
import {
  activeSchoolCombos,
  schoolComboHints,
  startedSchoolViews,
  type ComboState,
} from '@/features/farm/help'
import './BuildSummary.css'

export function BuildSummary({
  gear,
  state,
}: {
  gear: Gear
  state?: ComboState & { drumEchoKills?: number }
}) {
  const summary = farmBuildSummary(gear).filter((item) => item.weaponLevel || item.chipLevel)
  if (!summary.length) return null
  const base = state ?? gear
  const echo = drumEchoStats(base)
  const views = new Map(startedSchoolViews(base).map((view) => [view.weapon, view]))
  const combos = activeSchoolCombos(base)
  const hints = schoolComboHints(base)
    .filter((hint) => farmComboReachable(gear, hint.combo))
    .slice(0, 2)
  return (
    <section className="farm-build farm-build-summary" aria-label="本局乐队">
      <div className="farm-build-heading">
        <small>本局乐队</small>
        <span aria-label={`装备等级合计 ${farmBuiltLevels(gear)}`}>↑ {farmBuiltLevels(gear)}</span>
      </div>
      <ul className="farm-build-recipes">
        {summary.map((item) => {
          const view = views.get(item.weapon)
          const total = item.weaponLevel + item.chipLevel
          const label = view?.school.name ?? item.weaponName
          const missingName = !item.weaponLevel ? item.weaponName : item.chipName
          const status = item.evolved
            ? '终极'
            : item.evolutionBlocked
              ? '无法进化'
              : `${total}/${MAX_GEAR_LEVEL * 2}`
          return (
            <li
              key={item.weapon}
              className={`farm-build-recipe${item.evolved ? ' is-evolved' : ''}${item.evolutionBlocked ? ' is-blocked' : ''}`}
              style={{ '--school-color': view?.school.color ?? '#769655' } as CSSProperties}
              aria-label={label}
            >
              <div className="farm-build-recipe-heading">
                <span aria-hidden="true">{view?.school.formIcon ?? item.weaponIcon}</span>
                <strong>{item.evolved ? item.form : label}</strong>
                <span className="farm-school-layer">{status}</span>
              </div>
              <dl className="farm-build-pair">
                {[
                  { name: item.weaponName, icon: item.weaponIcon, level: item.weaponLevel },
                  { name: item.chipName, icon: item.chipIcon, level: item.chipLevel },
                ].map((part) => (
                  <div key={part.name} className={part.level ? '' : 'is-missing'}>
                    <dt>
                      <span aria-hidden="true">{part.icon}</span>
                      {part.name}
                    </dt>
                    <dd>{part.level ? `Lv.${part.level}` : '缺少'}</dd>
                  </div>
                ))}
              </dl>
              <div
                className="farm-build-progress"
                role="progressbar"
                aria-label={`${label}进化`}
                aria-valuemin={0}
                aria-valuemax={MAX_GEAR_LEVEL * 2}
                aria-valuenow={total}
                aria-valuetext={
                  item.evolved
                    ? `已进化为${item.form}`
                    : item.evolutionBlocked
                      ? `缺少${missingName}，槽位已满，本局无法进化`
                      : `${total}/${MAX_GEAR_LEVEL * 2}${!item.weaponLevel || !item.chipLevel ? `，缺少${missingName}` : ''}`
                }
              >
                <i style={{ width: `${(total / (MAX_GEAR_LEVEL * 2)) * 100}%` }} />
              </div>
              {item.weapon === 'drum' && item.weaponLevel >= MAX_GEAR_LEVEL && (
                <small
                  className="farm-build-drum"
                  aria-label={`余音每跳伤害 ${echo.damage}，间隔 ${echo.interval / FPS} 秒，每 ${DRUM_ECHO_KILLS_PER_DAMAGE} 次余音最后一击伤害加 1，当前成长加 ${echo.bonus}，下一次成长进度 ${echo.kills % DRUM_ECHO_KILLS_PER_DAMAGE}/${DRUM_ECHO_KILLS_PER_DAMAGE}；余音不受命中伤害和暴击加成`}
                >
                  每跳 {echo.damage} · {echo.interval / FPS}s · 成长 +{echo.bonus} ·{' '}
                  {echo.kills % DRUM_ECHO_KILLS_PER_DAMAGE}/{DRUM_ECHO_KILLS_PER_DAMAGE}
                </small>
              )}
            </li>
          )
        })}
      </ul>
      {(combos.length > 0 || hints.length > 0) && (
        <div className="farm-combos">
          <small className="farm-combos-title">{combos.length ? '本局组合技' : '下一步'}</small>
          <ul>
            {combos.map((combo) => (
              <li key={combo.id}>
                <span aria-hidden="true">{combo.icon}</span>
                <div>
                  <strong>{combo.name}</strong>
                  <small>{combo.effect}</small>
                </div>
              </li>
            ))}
            {hints.map((hint) => (
              <li key={hint.combo.id} className="is-hint">
                <span aria-hidden="true">{hint.combo.icon}</span>
                <div>
                  <strong>{hint.combo.name}</strong>
                  <small>
                    {hint.missing} · {hint.combo.effect}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

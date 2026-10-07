import type { CSSProperties } from 'react'
import { farmBuildSummary, farmBuiltLevels } from '@/features/farm/build'
import { MAX_GEAR_LEVEL } from '@/features/farm/rules.mjs'
import type { Gear } from '@/features/farm/rules.mjs'
import {
  activeSchoolCombos,
  comboBonusText,
  schoolComboHints,
  SCHOOL_ROMAN,
  startedSchoolViews,
  type ComboState,
} from '@/features/farm/help'

export function BuildSummary({ gear, state }: { gear: Gear; state?: ComboState }) {
  const summary = farmBuildSummary(gear).filter((item) => item.weaponLevel || item.chipLevel)
  if (!summary.length) return null
  const base = state ?? gear
  const views = new Map(startedSchoolViews(base).map((view) => [view.weapon, view]))
  const combos = activeSchoolCombos(base)
  const hints = schoolComboHints(base).slice(0, 2)
  return (
    <section className="farm-build" aria-label="本局乐队">
      <div className="farm-build-heading">
        <small>THIS RUN&apos;S BAND</small>
        <span>共 {farmBuiltLevels(gear)} 次升级</span>
      </div>
      <ul>
        {summary.map((item) => {
          const view = views.get(item.weapon)
          return (
            <li key={item.weapon} className={item.evolved ? 'is-evolved' : ''}>
              <span aria-hidden="true">{item.weaponIcon}</span>
              <div>
                <strong>{item.evolved ? item.form : item.weaponName}</strong>
                <small>
                  {item.weaponIsMember ? '成员' : '辅助乐器'} {item.weaponName} Lv.
                  {item.weaponLevel} ＋ 装备 {item.chipName} Lv.
                  {item.chipLevel}
                </small>
                {view && (
                  <span
                    className={`farm-school-tag${view.evolved ? ' is-evolved' : ''}`}
                    style={{ '--school-color': view.school.color } as CSSProperties}
                  >
                    <span className="farm-school-icon" aria-hidden="true">
                      {view.school.formIcon}
                    </span>
                    <span className="farm-school-name">{view.school.name}</span>
                    <span className="farm-school-ladder" aria-hidden="true">
                      {SCHOOL_ROMAN.map((mark, index) => (
                        <i
                          key={mark}
                          className={
                            index === SCHOOL_ROMAN.length - 1
                              ? view.evolved
                                ? 'is-form'
                                : ''
                              : index < view.tier
                                ? 'is-on'
                                : ''
                          }
                        >
                          {mark}
                        </i>
                      ))}
                    </span>
                    <span className="farm-school-layer">{view.layerLabel}</span>
                  </span>
                )}
              </div>
              <b>
                {item.evolved
                  ? '终极 ✦'
                  : `${item.weaponLevel + item.chipLevel}/${MAX_GEAR_LEVEL * 2}`}
              </b>
            </li>
          )
        })}
      </ul>
      {(combos.length > 0 || hints.length > 0) && (
        <div className="farm-combos">
          <small className="farm-combos-title">
            {combos.length ? 'CROSS-SCHOOL COMBOS · 本局组合技' : 'CROSS-SCHOOL COMBOS · 下一步'}
          </small>
          <ul>
            {combos.map((combo) => (
              <li key={combo.id}>
                <span aria-hidden="true">{combo.icon}</span>
                <div>
                  <strong>{combo.name}</strong>
                  <small>{comboBonusText(combo)}</small>
                </div>
              </li>
            ))}
            {hints.map((hint) => (
              <li key={hint.combo.id} className="is-hint">
                <span aria-hidden="true">{hint.combo.icon}</span>
                <div>
                  <strong>下一步：{hint.combo.name}</strong>
                  <small>
                    还差 {hint.missing} · {hint.combo.tagline}
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

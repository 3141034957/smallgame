import type { CSSProperties } from 'react'
import { Icon } from './icons'
import { talentIcon } from './iconSources'
import {
  evolved,
  MAX_EQUIPPED,
  MAX_GEAR_LEVEL,
  RECIPES,
  TALENTS,
  UPGRADE_CARDS,
} from '@/features/farm/rules.mjs'
import type { Gear, UpgradeId } from '@/features/farm/rules.mjs'
import {
  activeSchoolCombos,
  schoolComboHints,
  schoolOfTalent,
  schoolViews,
  type ComboState,
} from '@/features/farm/help'

type Props = {
  gear: Gear
  offered: UpgradeId[]
  hp?: number
  maxHp?: number
  // The live run, when the caller has it: combos can look at more than gear.
  state?: ComboState
  onSelect: (id: UpgradeId) => void
}

export function UpgradeChoices({ gear, offered, hp = 100, maxHp = 100, state, onSelect }: Props) {
  const cardIcon = (id: string) => {
    const name = talentIcon(id)
    return name ? <Icon name={name} /> : null
  }
  const forms = evolved(gear)
  const base = (state ?? { gear }) as ComboState
  const carried = (kind: 'weapon' | 'chip') =>
    TALENTS.filter((item) => item.kind === kind && gear[item.id] > 0).length
  return (
    <>
      <small className="farm-eyebrow">LEVEL UP · 时间已暂停</small>
      <h2>选择升级</h2>
      <p className="farm-slot-note">
        乐器 {carried('weapon')}/{MAX_EQUIPPED} · 芯片 {carried('chip')}/{MAX_EQUIPPED}
      </p>
      <div className="farm-choices">
        {offered.map((id, index) => {
          const item = UPGRADE_CARDS.find((card) => card.id === id)!
          if (item.kind === 'recovery')
            return (
              <button
                key={id}
                onClick={() => onSelect(id)}
                style={{ '--talent-color': item.color } as CSSProperties}
              >
                <i className="farm-choice-key" aria-hidden="true">
                  {index + 1}
                </i>
                <span className="farm-choice-icon">{cardIcon(item.id)}</span>
                <small>恢复卡 · {item.tag}</small>
                <b>
                  {item.name}
                  <em>
                    生命 {hp} → {maxHp}
                  </em>
                </b>
                <p>{item.description}</p>
              </button>
            )
          // Raw growth cards appear once the instrument pool runs dry, so they
          // have no recipe and no gear level to show.
          if (item.kind === 'stat')
            return (
              <button
                key={id}
                onClick={() => onSelect(id)}
                style={{ '--talent-color': item.color } as CSSProperties}
              >
                <i className="farm-choice-key" aria-hidden="true">
                  {index + 1}
                </i>
                <span className="farm-choice-icon">{cardIcon(item.id)}</span>
                <small>乐队成长 · {item.tag}</small>
                <b>{item.name}</b>
                <p>{item.description}</p>
                <div className="farm-choice-note">
                  <strong>本局生效</strong>
                </div>
              </button>
            )
          const gearId = item.id
          const recipe = RECIPES.find((entry) => entry.weapon === id || entry.chip === id)!
          const nextGear = { ...gear, [gearId]: gear[gearId] + 1 }
          const willEvolve =
            evolved(nextGear).includes(recipe.weapon) && !forms.includes(recipe.weapon)
          const school = schoolOfTalent(gearId)
          const view = school
            ? schoolViews(nextGear).find((entry) => entry.school.id === school.id)
            : undefined
          const nextState = { ...base, gear: nextGear } as ComboState
          const live = activeSchoolCombos(base)
          const fresh = activeSchoolCombos(nextState).filter(
            (combo) => !live.some((entry) => entry.id === combo.id),
          )
          const hint = schoolComboHints(nextState)[0]
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              style={{ '--talent-color': item.color } as CSSProperties}
            >
              <i className="farm-choice-key" aria-hidden="true">
                {index + 1}
              </i>
              <span className="farm-choice-icon">{cardIcon(item.id)}</span>
              <small>
                {item.kind === 'chip' ? '乐队装备' : item.characterId ? '乐队成员' : '辅助乐器'} ·{' '}
                {item.tag}
              </small>
              <b>
                {item.name}
                <em>
                  Lv.{gear[gearId]} → {gear[gearId] + 1}
                </em>
              </b>
              {view && (
                <span
                  className={`farm-school-tag${view.evolved ? ' is-evolved' : ''}`}
                  style={{ '--school-color': view.school.color } as CSSProperties}
                >
                  <span className="farm-school-icon" aria-hidden="true">
                    {view.school.formIcon}
                  </span>
                  <span className="farm-school-name">{view.school.name}</span>
                  <span className="farm-school-layer">{view.layerLabel}</span>
                </span>
              )}
              <p>{item.description}</p>
              {/* Desktop stacks these lines; phones fold them into the card's
                  last row so one card still reads as one row. */}
              <div className="farm-choice-note">
                <div className="farm-recipe-progress">
                  <span className="farm-school-progress">
                    进化：<b>{recipe.name}</b> · {nextGear[recipe.weapon]}/{MAX_GEAR_LEVEL} ＋{' '}
                    {nextGear[recipe.chip]}/{MAX_GEAR_LEVEL}
                  </span>
                  {hint && (
                    <span>
                      {hint.missing} → {hint.combo.name}
                    </span>
                  )}
                </div>
                {willEvolve && <strong>✦ 这次解锁 {recipe.name}</strong>}
                {fresh.map((combo) => (
                  <strong key={combo.id} className="is-combo">
                    ✦ 触发组合技：{combo.name}
                  </strong>
                ))}
                {!willEvolve && !fresh.length && (
                  <strong className="is-next">→ {recipe.name}</strong>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </>
  )
}

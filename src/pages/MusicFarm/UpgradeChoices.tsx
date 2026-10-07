import type { CSSProperties } from 'react'
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
  const forms = evolved(gear)
  const base = (state ?? { gear }) as ComboState
  const carried = (kind: 'weapon' | 'chip') =>
    TALENTS.filter((item) => item.kind === kind && gear[item.id] > 0).length
  return (
    <>
      <small className="farm-eyebrow">LEVEL UP · 时间已暂停</small>
      <h2>组建乐队，选你喜欢的！</h2>
      <p>
        成员负责攻击，装备负责强化；一局最多带 {MAX_EQUIPPED} 件乐器和 {MAX_EQUIPPED}{' '}
        件芯片。恢复满血卡随机出现，不占槽位；角色等级可以持续提升。只有一个选项时自动选择，继续战斗。
      </p>
      <p className="farm-slot-note">
        槽位 {carried('weapon')}/{MAX_EQUIPPED} 件乐器 · {carried('chip')}/{MAX_EQUIPPED} 件芯片
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
                <span className="farm-choice-icon">{item.icon}</span>
                <small>恢复卡 · {item.tag}</small>
                <b>
                  {item.name}
                  <em>
                    生命 {hp} → {maxHp}
                  </em>
                </b>
                <p>{item.description}</p>
                <strong>{hp >= maxHp ? '已满血，也可选择继续升级' : '选择后立即回满生命'}</strong>
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
                <span className="farm-choice-icon">{item.icon}</span>
                <small>乐队成长 · {item.tag}</small>
                <b>{item.name}</b>
                <p>{item.description}</p>
                <strong>只在本局生效，不占槽位</strong>
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
              <span className="farm-choice-icon">{item.icon}</span>
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
              <div className="farm-recipe-progress">
                <span className="farm-school-progress">
                  进化：<b>{recipe.name}</b> · {TALENTS.find((t) => t.id === recipe.weapon)!.name}{' '}
                  Lv.{nextGear[recipe.weapon]}/{MAX_GEAR_LEVEL} ＋{' '}
                  {TALENTS.find((t) => t.id === recipe.chip)!.name} Lv.
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
              {!willEvolve && !fresh.length && <strong>满级进化 → {recipe.name}</strong>}
            </button>
          )
        })}
      </div>
    </>
  )
}

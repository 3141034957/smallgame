import type { CSSProperties } from 'react'
import { evolved, MAX_EQUIPPED, MAX_GEAR_LEVEL, RECIPES, TALENTS } from '@/features/farm/rules.mjs'
import type { Gear, TalentId } from '@/features/farm/rules.mjs'

type Props = { gear: Gear; offered: TalentId[]; onSelect: (id: TalentId) => void }

export function UpgradeChoices({ gear, offered, onSelect }: Props) {
  const forms = evolved(gear)
  const carried = (kind: 'weapon' | 'chip') =>
    TALENTS.filter((item) => item.kind === kind && gear[item.id] > 0).length
  return (
    <>
      <small className="farm-eyebrow">LEVEL UP · 时间已暂停</small>
      <h2>组建乐队，选你喜欢的！</h2>
      <p>
        成员负责攻击，装备负责强化；一局最多带 {MAX_EQUIPPED} 件乐器和 {MAX_EQUIPPED}{' '}
        件芯片，槽位满了只会升级已有的。
      </p>
      <p className="farm-slot-note">
        槽位 {carried('weapon')}/{MAX_EQUIPPED} 件乐器 · {carried('chip')}/{MAX_EQUIPPED} 件芯片
      </p>
      <div className="farm-choices">
        {offered.map((id, index) => {
          const item = TALENTS.find((talent) => talent.id === id)!
          const recipe = RECIPES.find((entry) => entry.weapon === id || entry.chip === id)!
          const nextGear = { ...gear, [id]: gear[id] + 1 }
          const willEvolve =
            evolved(nextGear).includes(recipe.weapon) && !forms.includes(recipe.weapon)
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
                  Lv.{gear[id]} → {gear[id] + 1}
                </em>
              </b>
              <p>{item.description}</p>
              <div className="farm-recipe-progress">
                <span>
                  {TALENTS.find((talent) => talent.id === recipe.weapon)!.characterId
                    ? '成员'
                    : '辅助乐器'}{' '}
                  {TALENTS.find((talent) => talent.id === recipe.weapon)!.name}{' '}
                  {nextGear[recipe.weapon]}/{MAX_GEAR_LEVEL}
                </span>
                <span>
                  装备 {TALENTS.find((talent) => talent.id === recipe.chip)!.name}{' '}
                  {nextGear[recipe.chip]}/{MAX_GEAR_LEVEL}
                </span>
              </div>
              <strong>
                {willEvolve ? `✦ 这次解锁 ${recipe.name}` : `满级进化 → ${recipe.name}`}
              </strong>
            </button>
          )
        })}
      </div>
    </>
  )
}

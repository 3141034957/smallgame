import type { CSSProperties } from 'react'
import { Icon } from './icons'
import { talentIcon } from './iconSources'
import {
  DRUM_ECHO_KILLS_PER_DAMAGE,
  drumEchoStats,
  evolved,
  FPS,
  MAX_EQUIPPED,
  MAX_GEAR_LEVEL,
  RECIPES,
  TALENTS,
  UPGRADE_CARDS,
} from '@/features/farm/rules.mjs'
import type { Gear, UpgradeId } from '@/features/farm/rules.mjs'
import {
  activeSchoolCombos,
  schoolOfTalent,
  schoolViews,
  type ComboState,
} from '@/features/farm/help'
import { upgradeGuidance } from '@/features/farm/upgradeGuidance'
import './UpgradeChoices.css'

const shortEffects: Partial<Record<UpgradeId, string>> = {
  orbit: '环绕音刃，抵挡弹幕',
  power: '低音光柱贯穿敌群',
  echo: '高音箭雨自动追踪',
  tempo: '全队攻击加速',
  magnet: '拾取范围扩大',
  lucky: '收益与暴击↑（余音不暴击）',
  bell: '环形星浪推开怪群',
  sustain: '残留与减速延长',
  whistle: '追踪哨箭留下音痕',
  delay: '哨箭加速，音痕更密',
  sax: '号角贯穿，击退减速',
  mute: '号角减速延长',
  sampler: '沿途布设音爆采样',
  trigger: '布设加速，范围扩大',
  deck: '宽音刃命中弹出回响',
  needle: '命中与回响增强（余音除外）',
  synth: '扇形音浪贯穿敌群',
  arp: '扇形音浪伤害提升',
}

type Props = {
  gear: Gear
  offered: UpgradeId[]
  hp?: number
  maxHp?: number
  // The live run, when the caller has it: combos can look at more than gear.
  state?: ComboState & { drumEchoKills?: number }
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
      <div className="farm-choices farm-upgrade-choices">
        {offered.map((id, index) => {
          const item = UPGRADE_CARDS.find((card) => card.id === id)!
          if (item.kind === 'recovery')
            return (
              <button
                key={id}
                type="button"
                aria-label={`选择${item.name}，生命 ${hp} 恢复至 ${maxHp}；${item.description}`}
                onClick={() => onSelect(id)}
                style={{ '--talent-color': item.color } as CSSProperties}
              >
                <i className="farm-choice-key" aria-hidden="true">
                  {index + 1}
                </i>
                <span className="farm-choice-icon">{cardIcon(item.id)}</span>
                <small>恢复卡 · {item.tag}</small>
                <b>
                  <span className="farm-choice-name">{item.name}</span>
                  <em>
                    生命 {hp} → {maxHp}
                  </em>
                </b>
              </button>
            )
          // Raw growth cards appear once the instrument pool runs dry, so they
          // have no recipe and no gear level to show.
          if (item.kind === 'stat')
            return (
              <button
                key={id}
                type="button"
                aria-label={`选择${item.name}；${item.description}`}
                onClick={() => onSelect(id)}
                style={{ '--talent-color': item.color } as CSSProperties}
              >
                <i className="farm-choice-key" aria-hidden="true">
                  {index + 1}
                </i>
                <span className="farm-choice-icon">{cardIcon(item.id)}</span>
                <small>乐队成长 · {item.tag}</small>
                <b>
                  <span className="farm-choice-name">{item.name}</span>
                </b>
                <p aria-label={item.description}>
                  {item.stat === 'hp'
                    ? `生命 +${item.step} · 回复 +${item.step}`
                    : `${item.tag} ${item.step > 0 ? '+' : ''}${item.step}%`}
                  {item.id === 'overdrive' && '（余音除外）'}
                </p>
                <div className="farm-choice-note">
                  <strong>本局生效</strong>
                </div>
              </button>
            )
          const gearId = item.id
          const guidance = upgradeGuidance(gear, gearId)
          const recipe = RECIPES.find((entry) => entry.weapon === id || entry.chip === id)!
          const nextGear = { ...gear, [gearId]: gear[gearId] + 1 }
          const willEvolve =
            evolved(nextGear).includes(recipe.weapon) && !forms.includes(recipe.weapon)
          const beforeEcho = drumEchoStats({ ...base, gear })
          const afterEcho = drumEchoStats({ ...base, gear: nextGear })
          const benefit =
            id === 'drum'
              ? beforeEcho.interval !== afterEcho.interval && gear.drum > 0
                ? `间隔 ${beforeEcho.interval / FPS}→${afterEcho.interval / FPS}s`
                : `每跳 ${beforeEcho.damage}→${afterEcho.damage}`
              : id === 'range'
                ? `${willEvolve ? `每跳 ${beforeEcho.damage}→${afterEcho.damage} · ` : ''}扩散 +${willEvolve ? 14 : 2} · 爆发 +2`
                : (shortEffects[id] ?? item.description)
          const unlocksEchoGrowth = id === 'drum' && nextGear.drum === MAX_GEAR_LEVEL
          const description = unlocksEchoGrowth
            ? `${benefit} · ${DRUM_ECHO_KILLS_PER_DAMAGE}击杀 +1`
            : benefit
          const descriptionLabel = unlocksEchoGrowth
            ? `余音每跳伤害 ${beforeEcho.damage} 提升至 ${afterEcho.damage}；满级后每 ${DRUM_ECHO_KILLS_PER_DAMAGE} 次余音最后一击，最终每跳伤害增加 1`
            : id === 'drum' || id === 'range'
              ? description
              : item.description
          const school = schoolOfTalent(gearId)
          const view = school
            ? schoolViews(nextGear).find((entry) => entry.school.id === school.id)
            : undefined
          const nextState = { ...base, gear: nextGear } as ComboState
          const live = activeSchoolCombos(base)
          const fresh = activeSchoolCombos(nextState).filter(
            (combo) => !live.some((entry) => entry.id === combo.id),
          )
          const warningLabels = guidance.blockedSchools.map(
            (school) =>
              `选择后${school.missingKind === 'chip' ? '芯片' : '乐器'}槽位已满，${school.name}缺少${school.missingName}，本局无法进化`,
          )
          const pairLabel = guidance.partner
            ? `${guidance.completesPair ? '补齐配套' : '已有配套'}：${guidance.partner.name}，等级 ${guidance.partner.level}`
            : ''
          return (
            <button
              key={id}
              type="button"
              className={[
                willEvolve ? 'is-evolution-ready' : '',
                fresh.length ? 'is-combo-ready' : '',
                guidance.completesPair ? 'is-pair-ready' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={[
                `选择${item.name}，等级 ${gear[gearId]} 升至 ${nextGear[gearId]}`,
                descriptionLabel,
                pairLabel,
                `进化配方${recipe.name}：乐器 ${nextGear[recipe.weapon]}/${MAX_GEAR_LEVEL}，芯片 ${nextGear[recipe.chip]}/${MAX_GEAR_LEVEL}`,
                willEvolve ? `解锁进化：${recipe.name}` : '',
                ...fresh.map((combo) => `触发组合技：${combo.name}`),
                ...warningLabels,
              ]
                .filter(Boolean)
                .join('；')}
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
                <span className="farm-choice-name">{item.name}</span>
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
              <p aria-label={descriptionLabel}>{description}</p>
              {/* Desktop stacks these lines; phones fold them into the card's
                  last row so one card still reads as one row. */}
              <div className="farm-choice-note">
                {guidance.partner && (
                  <span
                    className={`farm-choice-pair${guidance.completesPair ? ' is-new-pair' : ''}`}
                    aria-label={pairLabel}
                  >
                    <span aria-hidden="true">{guidance.completesPair ? '＋' : '✓'}</span>
                    {guidance.partner.name} Lv.{guidance.partner.level}
                  </span>
                )}
                <div className="farm-recipe-progress">
                  <span className="farm-school-progress">
                    {!willEvolve && (
                      <>
                        进化：<b>{recipe.name}</b> ·{' '}
                      </>
                    )}
                    {nextGear[recipe.weapon]}/{MAX_GEAR_LEVEL} ＋ {nextGear[recipe.chip]}/
                    {MAX_GEAR_LEVEL}
                  </span>
                </div>
                {willEvolve && <strong>✦ 这次解锁 {recipe.name}</strong>}
                {fresh.map((combo) => (
                  <strong key={combo.id} className="is-combo">
                    ✦ 触发组合技：{combo.name}
                  </strong>
                ))}
                {guidance.blockedSchools.map((school, warningIndex) => (
                  <span
                    key={school.id}
                    className="farm-choice-slot-warning"
                    aria-label={warningLabels[warningIndex]}
                  >
                    <span aria-hidden="true">⚠</span>
                    {school.name}无法进化
                  </span>
                ))}
              </div>
            </button>
          )
        })}
      </div>
    </>
  )
}

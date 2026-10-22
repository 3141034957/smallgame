import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { MONSTERS } from '@/features/farm/monsters.mjs'
import { MAX_GEAR_LEVEL } from '@/features/farm/rules.mjs'
import { SCHOOL_COMBOS, SCHOOL_LIST } from '@/features/farm/help'
import './FarmHelp.css'

const sections = [
  { id: 'schools', label: '查看流派', count: SCHOOL_LIST.length },
  { id: 'combos', label: '查看组合', count: SCHOOL_COMBOS.length },
  { id: 'monsters', label: '查看怪物', count: MONSTERS.length },
] as const

type SectionId = (typeof sections)[number]['id']
const phrases = (text: string) => text.split(/[，、；。]/).filter(Boolean)

export function FarmHelp({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState<SectionId>('schools')
  const id = useId()
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const content = useRef<HTMLDivElement>(null)

  const select = (section: SectionId) => {
    setActive(section)
    if (content.current) content.current.scrollTop = 0
  }

  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number
    if (event.key === 'ArrowRight') next = (index + 1) % sections.length
    else if (event.key === 'ArrowLeft') next = (index + sections.length - 1) % sections.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = sections.length - 1
    else return
    event.preventDefault()
    select(sections[next].id)
    tabs.current[next]?.focus()
  }

  return (
    <div className="farm-guide">
      <header className="farm-guide-header">
        <h2>
          <span aria-hidden="true">♫</span> 乐队图鉴
        </h2>
        <button className="farm-guide-back" onClick={onClose} aria-label="关闭帮助并返回">
          返回
        </button>
      </header>
      <div className="farm-guide-tabs" role="tablist" aria-label="流派与组合技、怪潮图鉴">
        {sections.map((section, index) => (
          <button
            key={section.id}
            ref={(element) => {
              tabs.current[index] = element
            }}
            id={`${id}-${section.id}-tab`}
            role="tab"
            type="button"
            aria-selected={active === section.id}
            aria-controls={`${id}-${section.id}-panel`}
            aria-label={`${section.label}，共 ${section.count} 种`}
            tabIndex={active === section.id ? 0 : -1}
            onClick={() => select(section.id)}
            onKeyDown={(event) => navigate(event, index)}
          >
            {section.label}
          </button>
        ))}
      </div>
      <div className="farm-guide-content" ref={content}>
        <section
          id={`${id}-schools-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-schools-tab`}
          hidden={active !== 'schools'}
          tabIndex={0}
          className="farm-guide-panel farm-guide-schools farm-school-list"
        >
          {SCHOOL_LIST.map((school) => (
            <article
              key={school.id}
              className="farm-guide-school"
              style={{ '--school-color': school.color } as CSSProperties}
            >
              <header>
                <span className="farm-guide-icon" aria-hidden="true">
                  {school.weaponIcon}
                </span>
                <h3>{school.name}</h3>
                <small>{school.style}</small>
              </header>
              <div className="farm-guide-recipe" aria-label={`${school.name}进化配方`}>
                <span>
                  {school.weaponName} <b>Lv.{MAX_GEAR_LEVEL}</b>
                </span>
                <span className="farm-guide-plus" aria-label="加">
                  ＋
                </span>
                <span>
                  {school.chipName} <b>Lv.{MAX_GEAR_LEVEL}</b>
                </span>
              </div>
              <div className="farm-guide-evolution">
                <strong>
                  <span aria-hidden="true">{school.formIcon}</span> {school.form}
                </strong>
                <ul>
                  {phrases(school.formDescription).map((phrase) => (
                    <li key={phrase}>{phrase}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </section>
        <section
          id={`${id}-combos-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-combos-tab`}
          hidden={active !== 'combos'}
          tabIndex={0}
          className="farm-guide-panel farm-guide-combos"
        >
          {SCHOOL_COMBOS.map((combo) => (
            <article key={combo.id} className="farm-guide-combo">
              <span className="farm-guide-icon" aria-hidden="true">
                {combo.icon}
              </span>
              <div>
                <h3>{combo.name}</h3>
                <p className="farm-guide-requirement">{combo.requirement}</p>
                <ul aria-label={combo.effect}>
                  {phrases(combo.effect).map((phrase) => (
                    <li key={phrase}>{phrase}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </section>
        <section
          id={`${id}-monsters-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-monsters-tab`}
          hidden={active !== 'monsters'}
          tabIndex={0}
          className="farm-guide-panel farm-guide-monsters"
        >
          {MONSTERS.map((monster) => (
            <article key={monster.id} className={monster.boss ? 'is-boss' : undefined}>
              <img src={monster.image} alt="" loading="lazy" decoding="async" />
              <div>
                <header>
                  <h3>{monster.name}</h3>
                  <span
                    className="farm-guide-timing"
                    aria-label={`首次登场：${monster.starts === 0 ? '开场' : `${monster.starts} 秒`}${monster.interval ? `，每 ${monster.interval} 秒登场` : ''}`}
                  >
                    {monster.starts === 0 ? '开场' : `${monster.starts}s`}
                    {monster.interval ? ` · ↻${monster.interval}s` : ''}
                  </span>
                </header>
                <ul>
                  {phrases(monster.attack).map((phrase) => (
                    <li key={phrase}>{phrase}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  )
}

import type { CSSProperties } from 'react'
import { MONSTERS } from '@/features/farm/monsters.mjs'
import { MAX_GEAR_LEVEL, RECIPES, TALENTS } from '@/features/farm/rules.mjs'
import { SCHOOL_COMBOS, SCHOOL_LIST } from '@/features/farm/help'

const talent = (id: string) => TALENTS.find((item) => item.id === id)!

export function FarmHelp({ onClose }: { onClose: () => void }) {
  return (
    <>
      <small className="farm-eyebrow">YOUR LITTLE BAND</small>
      <h2>用你的乐队，击退怪潮</h2>
      <p>拖动走位，乐队自动攻击。</p>
      <p>躲开弹幕，捡经验升级。</p>
      <h3 className="farm-monsters-title">流派与组合技</h3>
      <p>乐器 ＋ 芯片 都到 Lv.{MAX_GEAR_LEVEL} → 终极形态；多个流派成型自动触发组合技。</p>
      <div className="farm-school-list">
        {SCHOOL_LIST.map((school) => (
          <div key={school.id} style={{ '--school-color': school.color } as CSSProperties}>
            <b>
              {school.formIcon} {school.name}
            </b>
            <em>
              {school.style} · 终极 {school.form}
            </em>
            <p>{school.tagline}</p>
          </div>
        ))}
      </div>
      <div className="farm-help-combos">
        {SCHOOL_COMBOS.map((combo) => (
          <div key={combo.id}>
            <span aria-hidden="true">{combo.icon}</span>
            <div>
              <b>{combo.name}</b>
              <small>
                {combo.requirement} → {combo.effect}
              </small>
            </div>
          </div>
        ))}
      </div>
      <div className="farm-recipes">
        {RECIPES.map((recipe) => (
          <div key={recipe.weapon}>
            <span>{recipe.icon}</span>
            <div>
              <b>{recipe.name}</b>
              <small>
                {talent(recipe.weapon).name} Lv.{MAX_GEAR_LEVEL} ＋ {talent(recipe.chip).name} Lv.
                {MAX_GEAR_LEVEL}
              </small>
              <p>{recipe.description}</p>
            </div>
          </div>
        ))}
      </div>
      <h3 className="farm-monsters-title">怪潮图鉴</h3>
      <p>每 2 分钟一只巨兽，两种轮流登场。</p>
      <div className="farm-monsters">
        {MONSTERS.map((monster) => (
          <article key={monster.id}>
            <img src={monster.image} alt={monster.name} loading="lazy" decoding="async" />
            <div>
              <b>
                {monster.name}{' '}
                <span>{monster.starts === 0 ? '开场' : `${monster.starts} 秒起`}</span>
              </b>
              <p>{monster.attack}</p>
            </div>
          </article>
        ))}
      </div>
      {/* Keyboard only: hidden on phones by the stylesheet. */}
      <p className="farm-help-keyboard">
        数字键 1–9 选择升级，方向键 / WASD 移动，空格释放音浪爆发。
      </p>
      <button className="farm-primary" onClick={onClose}>
        懂啦，开战
      </button>
    </>
  )
}

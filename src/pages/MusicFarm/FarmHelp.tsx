import { MONSTERS } from '@/features/farm/monsters.mjs'
import { MAX_GEAR_LEVEL, RECIPES, TALENTS } from '@/features/farm/rules.mjs'

const talent = (id: string) => TALENTS.find((item) => item.id === id)!

export function FarmHelp({ onClose }: { onClose: () => void }) {
  return (
    <>
      <small className="farm-eyebrow">YOUR LITTLE BAND</small>
      <h2>用你的乐队，击退怪潮</h2>
      <p>
        手机按住任意位置当摇杆，朝想去的方向拖动即可走位，松手停住；电脑移动鼠标指针即可走位，镜头跟随角色，无边界探索。鼠标移回中央或移出战场可停住，乐队成员自动攻击附近怪物。注意血条，躲开怪物、粉色弹幕和红色预警圈，捡回血爱心（掉落有限，会消失）。捡经验升级，三选一让新成员加入、强化已有装备，或选择随机出现的「恢复满血」卡；能量满了，点「音浪爆发」清弹幕并获得短暂无敌；吉他手的旋转音符会把飞来的弹幕打掉。
      </p>
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
      <h3 className="farm-monsters-title">怪潮图鉴 · 什么时候来？</h3>
      <p>
        时间按本局生存秒数计算，暂停与升级不计时。「短弓」词缀让两种巨兽提前两成登场；满场时按空位补充，传送预警期间不会攻击。
      </p>
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
      <p className="farm-help-keyboard">
        升级弹窗里按数字键 1–9 直接选择。方向键 / WASD
        移动，空格释放音浪爆发。离开页面自动暂停。角色等级无上限，乐器和装备最高
        Lv.5；构筑满级后仍可选择回血升级。不限时，生命归零后结算；怪潮会持续增强，无限总榜保留每位玩家的历史最高分。
      </p>
      <button className="farm-primary" onClick={onClose}>
        懂啦，开战！ ↗
      </button>
    </>
  )
}

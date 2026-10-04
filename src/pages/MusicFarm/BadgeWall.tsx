import { FARM_ACHIEVEMENTS, formatFarmAchievement, type FarmAchievementLog } from '@/features/farm/achievements'
import { farmCareerFavourite, type FarmCareer } from '@/features/farm/stats'
import { TALENTS } from '@/features/farm/rules.mjs'

export function BadgeWall({ log, career }: { log: FarmAchievementLog; career: FarmCareer }) {
  const unlocked = FARM_ACHIEVEMENTS.filter((achievement) => log.unlocked[achievement.id] !== undefined)
  const favourite = TALENTS.find((talent) => talent.id === farmCareerFavourite(career))
  return <div className="farm-badges">
    <header className="farm-badges-head"><div><small>YOUR SURVIVOR MEDALS</small><h2>成就墙</h2></div><div className="farm-badges-count"><small>已解锁</small><strong>{unlocked.length} / {FARM_ACHIEVEMENTS.length}</strong></div></header>
    <div className="farm-career"><span>出场 <b>{career.runs}</b> 场</span><span>击败 <b>{career.harvested.toLocaleString()}</b></span><span>巨兽 <b>{career.bosses.toLocaleString()}</b></span><span>最高 <b>{career.bestScore.toLocaleString()}</b> 分</span><span>最长 <b>{Math.floor(career.bestSeconds)}</b> 秒</span><span>金币 <b>{career.coins.toLocaleString()}</b></span><span>累计 <b>{Math.floor(career.totalSeconds / 60)}</b> 分钟</span><span>最高连击 <b>{career.bestCombo.toLocaleString()}</b></span>{favourite && <span>常用 <b>{favourite.name}</b></span>}</div>
    <ul className="farm-badge-list" aria-label="成就列表">{FARM_ACHIEVEMENTS.map((achievement) => {
      const at = log.unlocked[achievement.id], done = at !== undefined
      return <li key={achievement.id} className={done ? 'is-unlocked' : ''}>
        <span className="farm-badge-icon" aria-hidden="true">{done ? achievement.icon : '🔒'}</span>
        <div>
          <strong>{achievement.name}</strong>
          <small>{achievement.desc}</small>
          <em>{done ? `已解锁 · ${new Date(at).toLocaleDateString('zh-CN')}` : `${formatFarmAchievement(achievement, log.best[achievement.id] ?? 0)} / ${formatFarmAchievement(achievement, achievement.target)}`}</em>
        </div>
      </li>
    })}</ul>
    <small className="farm-badge-note">成就保存在当前浏览器，每局死亡结算后解锁。</small>
  </div>
}

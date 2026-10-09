import {
  FARM_ACHIEVEMENTS,
  formatFarmAchievement,
  type FarmAchievementLog,
} from '@/features/farm/achievements'
import { farmCareerFavourite, type FarmCareer } from '@/features/farm/stats'
import { TALENTS } from '@/features/farm/rules.mjs'

export function BadgeWall({ log, career }: { log: FarmAchievementLog; career: FarmCareer }) {
  const formatDay = (at: number) => {
    const date = new Date(at)
    return Number.isNaN(date.getTime()) ? '已解锁' : `已解锁 · ${date.toLocaleDateString('zh-CN')}`
  }
  const unlocked = FARM_ACHIEVEMENTS.filter(
    (achievement) => log.unlocked[achievement.id] !== undefined,
  )
  const favourite = TALENTS.find((talent) => talent.id === farmCareerFavourite(career))
  return (
    <div className="farm-badges">
      <header className="farm-badges-head">
        <div>
          <small>YOUR SURVIVOR MEDALS</small>
          <h2>成就墙</h2>
        </div>
        <div className="farm-badges-count">
          <small>已解锁</small>
          <strong>
            {unlocked.length} / {FARM_ACHIEVEMENTS.length}
          </strong>
        </div>
      </header>
      <div className="farm-career">
        <span>
          出场 <b>{career.runs}</b> 场
        </span>
        <span>
          击败 <b>{career.harvested.toLocaleString()}</b>
        </span>
        <span>
          巨兽 <b>{career.bosses.toLocaleString()}</b>
        </span>
        <span>
          最高 <b>{career.bestScore.toLocaleString()}</b> 分
        </span>
        <span>
          最长 <b>{Math.floor(career.bestSeconds)}</b> 秒
        </span>
        <span>
          金币 <b>{career.coins.toLocaleString()}</b>
        </span>
        <span>
          累计 <b>{Math.floor(career.totalSeconds / 60)}</b> 分钟
        </span>
        <span>
          最高连击 <b>{career.bestCombo.toLocaleString()}</b>
        </span>
        {favourite && (
          <span>
            主力 <b>{favourite.name}</b>
          </span>
        )}
      </div>
      <ul className="farm-badge-list" aria-label="成就列表">
        {[...FARM_ACHIEVEMENTS]
          .sort((a, b) => (log.unlocked[b.id] ?? 0) - (log.unlocked[a.id] ?? 0))
          .map((achievement) => {
            const at = log.unlocked[achievement.id],
              done = at !== undefined
            return (
              <li key={achievement.id} className={done ? 'is-unlocked' : ''}>
                <span className="farm-badge-icon" aria-hidden="true">
                  {done ? achievement.icon : '🔒'}
                </span>
                <div>
                  <strong>{achievement.name}</strong>
                  <small>{achievement.desc}</small>
                  <em>
                    {done
                      ? formatDay(at)
                      : `${formatFarmAchievement(achievement, log.best[achievement.id] ?? 0)} / ${formatFarmAchievement(achievement, achievement.target)}`}
                  </em>
                  {!done && (
                    <i
                      className="farm-badge-bar"
                      role="progressbar"
                      aria-label={`${achievement.name} 进度`}
                      aria-valuemin={0}
                      aria-valuemax={achievement.target}
                      aria-valuenow={Math.min(
                        achievement.target,
                        log.best[achievement.id] ?? 0,
                      )}
                      aria-valuetext={`${formatFarmAchievement(achievement, log.best[achievement.id] ?? 0)} / ${formatFarmAchievement(achievement, achievement.target)}`}
                    >
                      <b
                        style={{
                          width: `${Math.min(100, ((log.best[achievement.id] ?? 0) / achievement.target) * 100)}%`,
                        }}
                      />
                    </i>
                  )}
                </div>
              </li>
            )
          })}
      </ul>
      <small className="farm-badge-note">每局结算后解锁</small>
    </div>
  )
}

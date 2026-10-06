import type { DailyRecord } from '@/features/echo/storage'

type DailyTrailProps = {
  records: DailyRecord[]
  streak: number
}

// The theoretical ceiling of a six-seed flower score, used to scale the bars.
const BAR_CEILING = 212

export function DailyTrail({ records, streak }: DailyTrailProps) {
  const best = records.reduce((max, record) => Math.max(max, record.score), 0)

  return (
    <div className="echo-daily-trail">
      <div className="echo-daily-trail-head">
        <span>最近 {records.length} 天</span>
        <strong>{streak > 0 ? `连续种了 ${streak} 天` : '今晚是第一封'}</strong>
      </div>
      <div className="echo-daily-trail-bars" aria-label={`最近 ${records.length} 天的花谱成绩`}>
        {records.map((record) => (
          <span
            key={record.date}
            className={`echo-trail-day${record.score > 0 ? ' is-planted' : ''}${record.score === best && best > 0 ? ' is-best' : ''}`}
          >
            <i
              style={{ height: `${Math.max(3, Math.round((record.score / BAR_CEILING) * 26))}px` }}
              aria-hidden="true"
            />
            <b>{record.score || '·'}</b>
            <small>{record.date.slice(5).replace('-', '/')}</small>
          </span>
        ))}
      </div>
    </div>
  )
}

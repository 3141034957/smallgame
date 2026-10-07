import { farmTimelinePath, type FarmSample } from '@/features/farm/timeline'

const WIDTH = 300,
  HEIGHT = 76

export function RunTimeline({
  samples,
  marks,
  seconds,
}: {
  samples: FarmSample[]
  marks: number[]
  seconds: number
}) {
  if (samples.length < 2) return null
  const first = samples[0].tick,
    span = Math.max(1, samples[samples.length - 1].tick - first)
  const peak = samples.reduce((best, sample) => Math.max(best, sample.score), 0)
  const lowest = samples.reduce((worst, sample) => Math.min(worst, sample.hp), samples[0].hp)
  return (
    <figure className="farm-recap">
      <figcaption>
        <small>本局复盘</small>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`本局复盘：分数最高 ${peak.toLocaleString()} 分，生命最低 ${lowest} 点，存活 ${seconds.toFixed(1)} 秒`}
      >
        <polyline
          className="farm-recap-score"
          points={farmTimelinePath(samples, WIDTH, HEIGHT, (sample) => sample.score)}
        />
        <polyline
          className="farm-recap-hp"
          points={farmTimelinePath(samples, WIDTH, HEIGHT, (sample) => sample.hp)}
        />
        {marks
          .filter((tick) => tick >= first)
          .map((tick, index) => (
            <circle
              key={`${tick}-${index}`}
              className="farm-recap-mark"
              cx={((tick - first) / span) * WIDTH}
              cy={HEIGHT - 3}
              r={2.5}
            />
          ))}
      </svg>
      <div className="farm-recap-legend">
        <span className="is-score">分数 最高 {peak.toLocaleString()}</span>
        <span className="is-hp">生命 最低 {lowest}</span>
        <span>✦ 进化 {marks.length} 次</span>
      </div>
    </figure>
  )
}

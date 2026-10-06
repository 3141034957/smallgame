import { FPS, type FarmState } from './rules.mjs'

export type FarmSample = {
  tick: number
  score: number
  hp: number
  maxHp: number
  level: number
  bosses: number
}
// Two seconds per sample keeps a ten minute recap under a few hundred points.
export const FARM_SAMPLE_EVERY = 2 * FPS
export const FARM_SAMPLE_LIMIT = 480

// The client keeps its own samples for the result recap. They never enter the
// replay payload the server verifies.
export function farmTimelineSample(state: FarmState): FarmSample {
  return {
    tick: state.tick,
    score: state.score,
    hp: state.hp,
    maxHp: state.maxHp,
    level: state.level,
    bosses: state.bosses,
  }
}

// Build an SVG polyline inside a 0..width / 0..height box. Flat runs stay flat
// instead of dividing by zero, and a single sample sits on the left edge.
export function farmTimelinePath(
  samples: FarmSample[],
  width: number,
  height: number,
  value: (sample: FarmSample) => number,
  floor = 0,
): string {
  if (!samples.length || width <= 0 || height <= 0) return ''
  let peak = floor
  for (const sample of samples) peak = Math.max(peak, value(sample))
  const span = peak - floor || 1
  const last = samples[samples.length - 1].tick - samples[0].tick || 1
  return samples
    .map((sample) => {
      const x = ((sample.tick - samples[0].tick) / last) * width
      const y = height - ((value(sample) - floor) / span) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

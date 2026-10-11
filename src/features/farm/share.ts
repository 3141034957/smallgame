import { evolved, FPS, RECIPES, TALENTS, type FarmRound } from './rules.mjs'

// The server replays every frame to check the score, so a long run cannot be
// trimmed for upload: dropping frames changes the simulation and the replay
// then disagrees with the score the player actually reached. Runs past this
// budget stay on the device, and the player is told why they are not ranked.
export const FARM_MAX_SUBMIT_FRAMES = 20 * 60 * FPS
export const FARM_TOO_LONG_MESSAGE = `超 ${FARM_MAX_SUBMIT_FRAMES / FPS / 60} 分钟，未上榜（本机保留）`
export const farmTooLongToSubmit = (round: FarmRound | null) =>
  !!round && round.frames.length > FARM_MAX_SUBMIT_FRAMES
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
// Two minutes before the budget the HUD starts counting down: late enough to
// stay out of the way, early enough to still cash the run in.
export const FARM_SUBMIT_WARN_FRAMES = 18 * 60 * FPS
export type FarmSubmitStatus = {
  warning: boolean
  expired: boolean
  seconds: number
  label: string
}
// Icon-and-number copy for the HUD: the full sentence lives in `aria-label`.
export const farmSubmitStatus = (tick: number): FarmSubmitStatus => {
  const seconds = Math.max(0, Math.ceil((FARM_MAX_SUBMIT_FRAMES - tick) / FPS))
  if (tick > FARM_MAX_SUBMIT_FRAMES)
    return {
      warning: true,
      expired: true,
      seconds: 0,
      label: `已超 ${FARM_MAX_SUBMIT_FRAMES / FPS / 60} 分钟`,
    }
  if (tick < FARM_SUBMIT_WARN_FRAMES) return { warning: false, expired: false, seconds, label: '' }
  return { warning: true, expired: false, seconds, label: `成绩有效 ${clock(seconds)}` }
}
// The one-shot toast that announces the countdown; the HUD keeps the number.
export const farmSubmitNotice = (tick: number) => {
  const status = farmSubmitStatus(tick)
  return status.expired ? FARM_TOO_LONG_MESSAGE : `${status.label} · 可结算`
}
const digits = (value: number) => Math.round(value).toLocaleString()
// One-line brag text for the result page. Everything comes from the verified
// round, so a copied result always matches what the leaderboard accepted.
export function farmShareText(round: FarmRound | null, day: string): string {
  if (!round) return `怪潮乐队历险记 · 无限模式（${day}）：来和我比一比谁能撑更久！`
  const forms = evolved(round.gear)
    .map((weapon) => RECIPES.find((recipe) => recipe.weapon === weapon)?.name)
    .filter(Boolean)
  const best = TALENTS.filter((talent) => talent.kind === 'weapon')
    .map((talent) => ({ name: talent.name, level: round.gear[talent.id] ?? 0 }))
    .sort((a, b) => b.level - a.level)[0]
  const parts = [
    `生存 ${clock(round.seconds)}`,
    `${digits(round.score)} 分`,
    `击败 ${digits(round.harvested)}`,
    `巨兽 ${digits(round.bosses)}`,
    round.elites ? `精英 ${digits(round.elites)}` : '',
    round.blocks ? `挡下 ${digits(round.blocks)} 次攻击` : '',
    best && best.level ? `主力 ${best.name} Lv.${best.level}` : '',
    forms.length ? `终极 ${forms.join('＋')}` : '',
  ].filter(Boolean)
  return `怪潮乐队历险记 · ${day}：${parts.join(' · ')}｜来挑战我的最高分！`
}

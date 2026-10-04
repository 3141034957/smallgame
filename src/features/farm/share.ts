import { evolved, RECIPES, TALENTS, type FarmRound } from './rules.mjs'


const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
const digits = (value: number) => Math.round(value).toLocaleString()
// One-line brag text for the result page. Everything comes from the verified
// round, so a copied result always matches what the leaderboard accepted.
export function farmShareText(round: FarmRound | null, day: string): string {
  if (!round) return `节拍幸存者 · 无限模式（${day}）：来和我比一比谁能撑更久！`
  const forms = evolved(round.gear).map((weapon) => RECIPES.find((recipe) => recipe.weapon === weapon)?.name).filter(Boolean)
  const best = TALENTS.filter((talent) => talent.kind === 'weapon').map((talent) => ({ name: talent.name, level: round.gear[talent.id] ?? 0 })).sort((a, b) => b.level - a.level)[0]
  const parts = [
    `生存 ${clock(round.seconds)}`,
    `${digits(round.score)} 分`,
    `击败 ${digits(round.harvested)}`,
    `巨兽 ${digits(round.bosses)}`,
    round.elites ? `精英 ${digits(round.elites)}` : '',
    round.blocks ? `音盾挡下 ${digits(round.blocks)} 次` : '',
    best && best.level ? `主奏 ${best.name} Lv.${best.level}` : '',
    forms.length ? `终极 ${forms.join('＋')}` : '',
  ].filter(Boolean)
  return `节拍幸存者 · ${day}：${parts.join(' · ')}｜来挑战我的最高分！`
}

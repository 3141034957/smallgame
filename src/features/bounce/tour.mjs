import { makeGarden, simulateShot, validAim, validDay } from './rules.mjs'

export const CAST = [
  { id: 'rabbit', lane: 1, name: '泡芙', skill: '回声键盘', detail: '每撞两下，回声带响身边的花', symbol: '✿' },
  { id: 'cat', lane: 0, name: '奶糖', skill: '撞墙鼓浪', detail: '第一次撞墙，鼓浪带响附近三朵花', symbol: '●' },
  { id: 'bear', lane: 2, name: '布丁', skill: '低音穿透', detail: '前两次碰撞不反弹，穿过去继续撞', symbol: '♧' },
  { id: 'bird', lane: 3, name: '啾啾', skill: '三色和声', detail: '连响三种音色，和声额外送 180 分', symbol: '♪' },
]
export const ACTS = [
  { id: 'garden', name: '晨风花园', short: '花园', emoji: '✿', hint: '撞响炸花，让梦游团开场！', color: '#9cb684' },
  { id: 'soda', name: '汽水星球', short: '汽水', emoji: '◌', hint: '星星泡泡会带响两个同色泡泡，轻飘飘地接力！', color: '#93bac6' },
  { id: 'moon', name: '月光邮局', short: '月亮', emoji: '☾', hint: '撞进左下或右上的月亮门，穿越到另一边继续演奏！', color: '#ac9bc8' },
]
export function validTourAim(aim) {
  return validAim(aim) && CAST.some((member) => member.id === aim.character)
}
export function simulateTourShot(day, index, aim, includePath = true) {
  if (!validTourAim(aim) || !ACTS[index] || !validDay(day)) return null
  return simulateShot(day, index, aim, includePath, { character: aim.character, scene: ACTS[index].id })
}
export function replayTour(day, shots) {
  if (!validDay(day) || !Array.isArray(shots) || shots.length !== 3 || !shots.every(validTourAim)) return null
  const rounds = shots.map((aim, index) => simulateTourShot(day, index, aim, false))
  const events = rounds.flatMap((shot) => shot.events)
  const score = rounds.reduce((sum, shot) => sum + shot.score, 0)
  const voices = [0, 1, 2, 3].map((lane) => events.filter((event) => event.id >= 0 && event.lane === lane).length)
  const lead = voices.indexOf(Math.max(...voices))
  const titles = ['《把心跳寄到月亮》', '《花朵喝了一口汽水》', '《小熊的云朵低音》', '《星星也跟着唱起来》']
  return { mode: 'tour', day, shots, score, maxCombo: Math.max(...rounds.map((shot) => shot.combo)), fevers: rounds.reduce((sum, shot) => sum + shot.fevers, 0), hits: rounds.reduce((sum, shot) => sum + shot.hits, 0), stars: score >= 9500 ? 3 : score >= 4500 ? 2 : score > 0 ? 1 : 0, portals: events.filter((event) => event.kind === 'portal').length, skills: events.filter((event) => event.kind === 'skill' || event.kind === 'chorus').length, voices, title: titles[lead] }
}
export function encodeShow(shots) {
  return shots.map((shot) => `${shot.angle},${shot.power},${CAST.findIndex((member) => member.id === shot.character)}`).join(';')
}
export function decodeShow(value) {
  if (typeof value !== 'string' || value.length > 60 || !/^-?\d{1,2},\d{2,3},[0-3];-?\d{1,2},\d{2,3},[0-3];-?\d{1,2},\d{2,3},[0-3]$/.test(value)) return null
  const shots = value.split(';').map((part) => {
    const [angle, power, character] = part.split(',').map(Number)
    return { angle, power, character: CAST[character].id }
  })
  return shots.every(validTourAim) ? shots : null
}
export function tourGarden(day, index) { return makeGarden(day, index) }

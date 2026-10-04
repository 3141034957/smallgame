export const ISLANDS = [
  { id: 'picnic', name: '野餐小岛', mood: '草莓风，青草香', emoji: '🍓', steps: 18, unlock: 0, tint: '#e7efd7' },
  { id: 'cloud', name: '云朵港湾', mood: '踩着软软的云出发', emoji: '☁', steps: 17, unlock: 1, tint: '#e7e2f5' },
  { id: 'moon', name: '月亮森林', mood: '把晚安寄给星星', emoji: '☾', steps: 16, unlock: 3, tint: '#dbe9e6' },
]
export const HOME = 12
export const FRIENDS = [{ cell: 0, lane: 1, name: '泡芙' }, { cell: 4, lane: 3, name: '啾啾' }, { cell: 22, lane: 2, name: '布丁' }]
export const SPELLS = [
  { id: 'skip', lane: 0, name: '蹦蹦捷径', detail: '下次能走到两格以内', symbol: '↗' },
  { id: 'bloom', lane: 1, name: '花开双倍', detail: '下次捡到的声音变成两颗', symbol: '✿' },
  { id: 'rest', lane: 2, name: '午睡补给', detail: '恢复 3 步，每局一次', symbol: '☕' },
  { id: 'wind', lane: 3, name: '风的口袋', detail: '收集四周一格的全部声音', symbol: '≈' },
]
export const distance = (a, b) => Math.abs(a % 5 - b % 5) + Math.abs(Math.floor(a / 5) - Math.floor(b / 5))
export function routeSeed(day, islandId) {
  let seed = 2166136261
  for (const char of `${day}:${islandId}`) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0
  return seed
}
export function validDay(day) {
  if (typeof day !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(day)) return false
  const date = new Date(`${day}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day
}
export function todayRoute() {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
}
export function createJourney(islandId, day) {
  const island = ISLANDS.find((island) => island.id === islandId)
  if (!island || !validDay(day)) throw new Error('Invalid island or date')
  let seed = routeSeed(day, islandId)
  const tiles = Array.from({ length: 25 }, (_, cell) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const friend = FRIENDS.find((friend) => friend.cell === cell)
    return { cell, lane: cell === HOME || friend ? null : (seed >>> 16) % 4, collected: false }
  })
  // Each companion's voice is available near its home; the rest varies each day.
  tiles[1].lane = 1; tiles[3].lane = 3; tiles[17].lane = 2; tiles[23].lane = 2; tiles[11].lane = 0
  return { islandId, day, position: HOME, steps: island.steps, tiles, bag: [0, 0, 0, 0], friends: [], melody: [], phrase: [], score: 0, motifs: 0, collected: 0, skip: false, bloom: false, rested: false, finished: false, won: false, actions: [], event: '从营地出发，点击相邻的小格子。捡声音，邀请小伙伴入队 ♡' }
}
export function canInvite(state, lane) {
  return state.bag[lane] >= 1 && state.bag.reduce((sum, count) => sum + count, 0) >= 2
}
export function reachable(state, cell) {
  return !state.finished && state.steps > 0 && Number.isInteger(cell) && cell >= 0 && cell < 25 && cell !== state.position && distance(state.position, cell) <= (state.skip ? 2 : 1)
}

function collect(state, cell) {
  const tile = state.tiles[cell]
  if (tile.lane === null || tile.collected) return state
  const count = state.bloom ? 2 : 1
  const bag = [...state.bag]
  bag[tile.lane] += count
  const phrase = [...state.phrase, tile.lane].slice(-3)
  const motif = phrase.length === 3 && new Set(phrase).size === 3
  const melody = [...state.melody, { lane: tile.lane, cell, midi: [60, 64, 67, 69, 72][(cell + state.melody.length) % 5] + (tile.lane === 2 ? -24 : tile.lane === 3 ? 12 : 0) }]
  return { ...state, bag, melody, phrase: motif ? [] : phrase, collected: state.collected + 1, tiles: state.tiles.map((value) => value.cell === cell ? { ...value, collected: true } : value), bloom: false, score: state.score + 40 * count + (motif ? 60 : 0), motifs: state.motifs + (motif ? 1 : 0), steps: state.steps + (motif ? 1 : 0), event: motif ? '三种声音，变成一朵音乐花火！+60 分，恢复 1 步 ✦' : count === 2 ? '花开啦！这一颗声音变成了两颗 ♡' : '一颗新声音，悄悄加入了你的旅途小曲 ♪' }
}

export function act(state, action) {
  if (!state || state.finished || !action || state.actions.length >= 100) return null
  let next = state
  if (action.type === 'move') {
    if (!reachable(state, action.cell)) return null
    next = { ...state, position: action.cell, steps: state.steps - 1, skip: false, event: '走过的路，也在小曲里留下了脚印。' }
    next = collect(next, action.cell)
    const friend = FRIENDS.find((friend) => friend.cell === action.cell && !next.friends.includes(friend.lane))
    if (friend && next.collected === state.collected) next = { ...next, event: `${friend.name}在等你！用一颗 TA 的声音和一颗任意声音，邀请 TA 入队。` }
    if (action.cell === HOME) next = { ...next, event: next.friends.length === 3 ? '小伙伴都到齐啦，点「开场野餐音乐会」为旅途收尾！' : '回到小营地啦。还有小伙伴等着一起出发 ♡' }
  } else if (action.type === 'invite') {
    const friend = FRIENDS.find((friend) => friend.cell === state.position)
    if (!friend || state.friends.includes(friend.lane) || !canInvite(state, friend.lane)) return null
    const bag = [...state.bag]
    bag[friend.lane]--
    const extra = bag.indexOf(Math.max(...bag))
    bag[extra]--
    next = { ...state, bag, friends: [...state.friends, friend.lane], score: state.score + 220, event: `${friend.name}入队啦！音乐里多了一位小伙伴的和声。+220 分 ♡` }
  } else if (action.type === 'spell') {
    const spell = SPELLS.find((spell) => spell.id === action.id)
    if (!spell || (state.steps <= 0 && spell.id !== 'rest') || state.bag[spell.lane] < 1 || (spell.id === 'skip' && state.skip) || (spell.id === 'bloom' && state.bloom) || (spell.id === 'rest' && state.rested)) return null
    if (spell.id === 'wind' && !state.tiles.some((tile) => tile.lane !== null && !tile.collected && distance(state.position, tile.cell) === 1)) return null
    const bag = [...state.bag]; bag[spell.lane]--
    next = { ...state, bag, event: `${spell.name}，准备好啦！` }
    if (spell.id === 'skip') next = { ...next, skip: true, event: '蹦蹦捷径！点击两格以内的目的地，只消耗一步 ↗' }
    if (spell.id === 'bloom') next = { ...next, bloom: true, event: '种下一朵小花。下一颗捡到的声音会变成两颗 ✿' }
    if (spell.id === 'rest') next = { ...next, rested: true, steps: next.steps + 3, event: '午睡三分钟，精神满满！恢复 3 步 ☕' }
    if (spell.id === 'wind') {
      for (let cell = 0; cell < 25; cell++) if (distance(state.position, cell) === 1) next = collect(next, cell)
      next = { ...next, event: `风替你跑了一圈，收集了 ${next.collected - state.collected} 处声音！≈` }
    }
  } else if (action.type === 'finish') {
    const won = state.position === HOME && state.friends.length === 3
    next = { ...state, finished: true, won, score: state.score + (won ? 400 + state.steps * 20 : 0), event: won ? '小岛音乐会，开场啦！' : '这一段旅途，已经变成了你的小曲。' }
  } else return null
  return { ...next, actions: [...state.actions, action] }
}

export function replayJourney(islandId, day, actions) {
  if (!Array.isArray(actions) || actions.length > 100) return null
  let state
  try { state = createJourney(islandId, day) } catch { return null }
  for (const action of actions) { state = act(state, action); if (!state) return null }
  return state.finished ? state : null
}

// A tap completes the obvious next step; the journal still contains each verified action.
export function playTurn(state, action) {
  let next = act(state, action)
  if (!next || next.finished) return next
  const friend = FRIENDS.find((friend) => friend.cell === next.position && !next.friends.includes(friend.lane))
  if (friend && canInvite(next, friend.lane)) next = act(next, { type: 'invite' })
  if (next.position === HOME && next.friends.length === 3) next = act(next, { type: 'finish' })
  return next
}
export function journeyStars(state) { return state.won ? 3 : state.friends.length >= 2 ? 2 : state.friends.length >= 1 ? 1 : 0 }
export function encodeRoute(state) {
  const digits = '0123456789abcdefghijklmno'
  return state.actions.map((action) => action.type === 'move' ? digits[action.cell] : action.type === 'invite' ? 'I' : action.type === 'finish' ? 'F' : { skip: 'S', bloom: 'B', rest: 'R', wind: 'W' }[action.id]).join('')
}
export function decodeRoute(code) {
  if (typeof code !== 'string' || !/^[0-9a-oISBRWF]{1,100}$/.test(code)) return null
  return [...code].map((char) => char === 'I' ? { type: 'invite' } : char === 'F' ? { type: 'finish' } : 'SBRW'.includes(char) ? { type: 'spell', id: { S: 'skip', B: 'bloom', R: 'rest', W: 'wind' }[char] } : { type: 'move', cell: '0123456789abcdefghijklmno'.indexOf(char) })
}

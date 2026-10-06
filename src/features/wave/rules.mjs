import { routeSeed, todayRoute, validDay } from '../island/rules.mjs'
export { todayRoute, validDay }
export const SIZE = 6
export const DURATION = 45000
export const CHARGE = 24
const pitches = [60, 64, 67, 69, 72, 76]
export function adjacent(a, b) {
  return (
    a !== b &&
    Math.abs((a % SIZE) - (b % SIZE)) <= 1 &&
    Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE)) <= 1
  )
}
function rng(state) {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0
  return state.seed / 4294967296
}
function tile(state, lane = Math.floor(rng(state) * 4), kind = 'note') {
  return { id: state.nextId++, lane, kind }
}
export function validPath(board, path) {
  if (
    !Array.isArray(path) ||
    !path.length ||
    path.length > SIZE * SIZE ||
    new Set(path).size !== path.length ||
    path.some((i) => !Number.isInteger(i) || !board[i])
  )
    return false
  if (path.length < 3 && !path.some((i) => board[i].kind !== 'note')) return false
  return path.every(
    (i, n) => board[i].lane === board[path[0]].lane && (!n || adjacent(path[n - 1], i)),
  )
}
export function findMove(board) {
  // Any connected triple suffices. Bombs can also be tapped on their own.
  for (let i = 0; i < board.length; i++) {
    if (board[i].kind !== 'note') return [i]
    for (let j = 0; j < board.length; j++)
      if (adjacent(i, j) && board[i].lane === board[j].lane) {
        for (let k = 0; k < board.length; k++)
          if (k !== i && adjacent(j, k) && board[k].lane === board[i].lane) return [i, j, k]
      }
  }
  return null
}
function playable(state) {
  if (findMove(state.board)) return false
  const start = Math.floor(rng(state) * SIZE) * SIZE
  const lane = Math.floor(rng(state) * 4)
  // A guaranteed local triple, rather than an unbounded shuffle loop.
  for (let i = start; i < start + 3; i++) state.board[i] = tile(state, lane)
  return true
}
export function createWave(day) {
  if (!validDay(day)) throw new Error('Invalid wave date')
  const state = {
    day,
    seed: routeSeed(day, 'wave-v1'),
    nextId: 0,
    board: [],
    score: 0,
    combo: 0,
    maxCombo: 0,
    charge: 0,
    clears: 0,
    bombs: 0,
    boosts: 0,
    lastTime: -10000,
    turn: 0,
  }
  for (let i = 0; i < SIZE * SIZE; i++) state.board.push(tile(state))
  // First gesture teaches the actual mechanic, without a separate tutorial.
  for (let i = 30; i < 36; i++) state.board[i].lane = 1
  return state
}
export function playWave(previous, action) {
  if (
    !action ||
    !Number.isInteger(action.t) ||
    action.t < 0 ||
    action.t >= DURATION ||
    action.t - previous.lastTime < 180 ||
    previous.turn >= 250
  )
    return null
  const boost = action.boost === true
  if (
    boost
      ? previous.charge < CHARGE || action.path !== undefined
      : !validPath(previous.board, action.path)
  )
    return null
  const state = {
    ...previous,
    board: previous.board.map((item) => ({ ...item })),
    turn: previous.turn + 1,
  }
  const counts = [0, 1, 2, 3].map((lane) => state.board.filter((item) => item.lane === lane).length)
  const lead = boost ? counts.indexOf(Math.max(...counts)) : state.board[action.path[0]].lane
  const removed = new Set(
    boost
      ? state.board.map((item, index) => (item.lane === lead ? index : -1)).filter((i) => i >= 0)
      : action.path,
  )
  let triggered = 0
  for (const index of removed) {
    const note = state.board[index]
    if (note.kind === 'note') continue
    triggered++
    for (let other = 0; other < SIZE * SIZE; other++) {
      if (
        note.kind === 'rainbow'
          ? state.board[other].lane === note.lane
          : other % SIZE === index % SIZE || Math.floor(other / SIZE) === Math.floor(index / SIZE)
      )
        removed.add(other)
    }
  }
  state.combo = action.t - state.lastTime <= 3000 ? previous.combo + 1 : 1
  state.maxCombo = Math.max(state.maxCombo, state.combo)
  const multiplier = Math.min(5, 1 + Math.floor((state.combo - 1) / 3))
  const length = boost ? 0 : action.path.length
  const earned =
    (removed.size * 50 + Math.max(0, length - 3) * 25 + triggered * 200 + (boost ? 300 : 0)) *
    multiplier
  state.score += earned
  state.clears += removed.size
  state.bombs += triggered
  state.boosts += boost ? 1 : 0
  state.charge = boost ? 0 : Math.min(CHARGE, state.charge + removed.size)
  state.lastTime = action.t
  const notes = [...removed].map((i, n) => ({
    lane: state.board[i].lane,
    midi:
      pitches[n % pitches.length] +
      (state.board[i].lane === 2 ? -24 : state.board[i].lane === 3 ? 12 : 0),
  }))
  for (let column = 0; column < SIZE; column++) {
    const survivors = []
    for (let row = 0; row < SIZE; row++)
      if (!removed.has(row * SIZE + column)) survivors.push(state.board[row * SIZE + column])
    const fresh = Array.from({ length: SIZE - survivors.length }, () => tile(state))
    const next = [...fresh, ...survivors]
    for (let row = 0; row < SIZE; row++) state.board[row * SIZE + column] = next[row]
  }
  const created = length >= 10 ? 'rainbow' : length >= 6 ? 'bomb' : null
  if (created) state.board[action.path.at(-1)] = tile(state, lead, created)
  const reshuffled = playable(state)
  return {
    state,
    removed: [...removed],
    earned,
    multiplier,
    created,
    triggered,
    lead,
    boost,
    reshuffled,
    notes,
  }
}
export function replayWave(day, actions) {
  if (!validDay(day) || !Array.isArray(actions) || !actions.length || actions.length > 250)
    return null
  let state = createWave(day)
  for (const action of actions) {
    const result = playWave(state, action)
    if (!result) return null
    state = result.state
  }
  return {
    day,
    actions,
    score: state.score,
    maxCombo: state.maxCombo,
    clears: state.clears,
    bombs: state.bombs,
    boosts: state.boosts,
    stars: state.score >= 9000 ? 3 : state.score >= 4000 ? 2 : 1,
  }
}

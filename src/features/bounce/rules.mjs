import { routeSeed, validDay, todayRoute } from '../island/rules.mjs'

export { validDay, todayRoute }
export const WIDTH = 360
export const HEIGHT = 490
export const LAUNCH = { x: 180, y: 431 }
export const BALL_RADIUS = 11
export const SHOTS = 3
export const STEP = 1 / 120
export const MAX_TIME = 8
export const DEFAULT_AIM = { angle: 0, power: 95 }

// Degrees from straight up; quantized inputs keep browser and server replay identical.
export function validAim(aim) {
  return aim && Number.isInteger(aim.angle) && Math.abs(aim.angle) <= 65 && Number.isInteger(aim.power) && aim.power >= 45 && aim.power <= 100
}
export function aimFromDrag(dx, dy) {
  const length = Math.hypot(dx, dy)
  if (length < 8) return { ...DEFAULT_AIM }
  return { angle: Math.round(Math.max(-65, Math.min(65, Math.atan2(-dx, Math.max(12, dy)) * 180 / Math.PI))) || 0, power: Math.round(Math.max(45, Math.min(100, length * 1.5))) }
}
export function makeGarden(day, shotIndex = 0) {
  if (!validDay(day) || !Number.isInteger(shotIndex) || shotIndex < 0 || shotIndex >= SHOTS) throw new Error('Invalid bounce garden')
  let seed = routeSeed(day, `bounce-v1:${shotIndex}`)
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const burstSide = random() > .5 ? 1 : 3
  const nodes = []
  for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) {
    const id = row * 5 + col
    const x = 43 + col * 68 + (random() - .5) * 14
    const y = 74 + row * 65 + (random() - .5) * 12
    const lane = Math.floor(random() * 4)
    nodes.push({ id, x, y, radius: 22, lane, kind: id === 5 + burstSide || id === 14 - burstSide ? 'burst' : [0, 4, 17].includes(id) ? 'gold' : 'note', hit: false })
  }
  // A visible bottom-center flower is reachable with the default first gesture.
  nodes.push({ id: 20, x: 180, y: 332, radius: 26, lane: 1, kind: 'burst', hit: false })
  return nodes
}
const pitch = (node, combo) => [60, 64, 67, 69, 72][(node.id + combo) % 5] + (node.lane === 2 ? -24 : node.lane === 3 ? 12 : 0)

export function simulateShot(day, shotIndex, aim, includePath = true, performance = null) {
  if (!validAim(aim)) return null
  const nodes = makeGarden(day, shotIndex)
  const radians = aim.angle * Math.PI / 180
  const speed = 460 + aim.power * 3.2
  let x = LAUNCH.x, y = LAUNCH.y, vx = Math.sin(radians) * speed, vy = -Math.cos(radians) * speed
  let score = 0, combo = 0, fevers = 0, time = 0, rebounds = 2
  let physicalHits = 0, wallSkill = false, portals = 0, portalUntil = 0, choruses = 0
  let phrase = []
  const events = [], path = includePath ? [{ t: 0, x, y }] : []
  const signal = (kind, id, sx, sy, lane, points = 0) => {
    score += points
    events.push({ t: time, id, x: sx, y: sy, lane, midi: 84, points, total: score, combo, kind, chain: true, fever: false })
  }
  const hit = (node, chain = false, origin = null) => {
    if (node.hit) return
    node.hit = true
    combo++
    const multiplier = Math.min(5, 1 + Math.floor(combo / 4))
    const points = (node.kind === 'gold' ? 150 : 70) * multiplier
    score += points
    events.push({ t: time, id: node.id, x: node.x, y: node.y, lane: node.lane, midi: pitch(node, combo), points, total: score, combo, kind: node.kind, chain, fever: false, ...(origin ? { origin } : {}) })
    if (combo === 6 || combo === 12 || combo === 18) {
      score += 400; fevers++
      events.push({ t: time, id: -combo, x: node.x, y: node.y, lane: node.lane, midi: 84, points: 400, total: score, combo, kind: 'fever', chain: true, fever: true })
    }
    if (performance?.character === 'bird') {
      phrase = [...phrase, node.lane].slice(-3)
      if (phrase.length === 3 && new Set(phrase).size === 3) {
        phrase = []; choruses++
        signal('chorus', -300 - choruses, node.x, node.y, 3, 180)
      }
    }
    if (node.kind === 'burst') {
      // Nearby flowers chain in a deterministic order; each can pay out only once.
      for (const other of nodes) if (!other.hit && Math.hypot(other.x - node.x, other.y - node.y) <= 111) hit(other, true)
      if (performance?.scene === 'soda') {
        const sameVoice = nodes.filter((other) => !other.hit && other.lane === node.lane).slice(0, 2)
        for (const other of sameVoice) hit(other, true, { x: node.x, y: node.y })
      }
    }

  }
  for (let frame = 1; frame <= MAX_TIME / STEP; frame++) {
    time = frame * STEP
    vy += (performance?.scene === 'soda' ? 85 : performance?.scene === 'moon' ? 120 : 180) * STEP
    x += vx * STEP; y += vy * STEP
    let wall = false
    if (x < BALL_RADIUS) { x = BALL_RADIUS; vx = Math.abs(vx) * .99; wall = true }
    if (x > WIDTH - BALL_RADIUS) { x = WIDTH - BALL_RADIUS; vx = -Math.abs(vx) * .99; wall = true }
    if (wall && performance?.character === 'cat' && !wallSkill) {
      wallSkill = true
      signal('skill', -200, x, y, 0)
      const nearby = nodes.filter((node) => !node.hit && Math.hypot(node.x - x, node.y - y) <= 130).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y)).slice(0, 3)
      for (const node of nearby) hit(node, true, { x, y })
    }
    if (y < BALL_RADIUS) { y = BALL_RADIUS; vy = Math.abs(vy) }
    if (y > HEIGHT - BALL_RADIUS && vy > 0 && rebounds > 0) { y = HEIGHT - BALL_RADIUS; vy = -Math.abs(vy) * .93; rebounds-- }
    if (performance?.scene === 'moon' && time >= portalUntil && portals < 3) {
      const gates = [{ x: 28, y: 342 }, { x: 332, y: 78 }]
      const entrance = gates.findIndex((gate) => Math.hypot(x - gate.x, y - gate.y) <= 28)
      if (entrance !== -1) {
        const exit = gates[1 - entrance]
        x = exit.x + (entrance === 0 ? -42 : 42); y = exit.y
        vx = entrance === 0 ? -Math.abs(vx) : Math.abs(vx)
        vy = entrance === 0 ? Math.abs(vy) : -Math.abs(vy)
        portals++; portalUntil = time + .65
        signal('portal', -100 - portals, x, y, 3)
        if (includePath) path.push({ t: time, x, y, jump: true })
      }
    }
    for (const node of nodes) {
      if (node.hit) continue
      const dx = x - node.x, dy = y - node.y, distance = Math.hypot(dx, dy), radius = BALL_RADIUS + node.radius
      if (distance >= radius) continue
      const nx = distance > .001 ? dx / distance : 0, ny = distance > .001 ? dy / distance : 1
      x = node.x + nx * (radius + .5); y = node.y + ny * (radius + .5)
      const dot = vx * nx + vy * ny
      physicalHits++
      const pierce = performance?.character === 'bear' && physicalHits <= 2
      if (dot < 0 && !pierce) { vx -= 2 * dot * nx; vy -= 2 * dot * ny }
      hit(node)
      if (pierce) signal('skill', -200 - physicalHits, node.x, node.y, 2)
      if (performance?.character === 'rabbit' && physicalHits % 2 === 0) {
        signal('skill', -200 - physicalHits, node.x, node.y, 1)
        for (const other of nodes) if (!other.hit && Math.hypot(other.x - node.x, other.y - node.y) <= 76) hit(other, true, { x: node.x, y: node.y })
      }
      // Side hits stay lively, without steering towards targets or inventing hits.
      const rebound = Math.hypot(vx, vy)
      if (rebound < .001) { vx = 0; vy = -430 }
      else if (rebound < 430) { vx *= 430 / rebound; vy *= 430 / rebound }
    }
    if (includePath && (frame % 2 === 0 || y > HEIGHT + 30)) path.push({ t: time, x, y })
    if (y > HEIGHT + 30) break
  }
  return { score, combo, fevers, hits: nodes.filter((node) => node.hit).length, duration: time, events, path }
}
export function replayRound(day, shots) {
  if (!validDay(day) || !Array.isArray(shots) || shots.length !== SHOTS || !shots.every(validAim)) return null
  const rounds = shots.map((aim, index) => simulateShot(day, index, aim, false))
  const score = rounds.reduce((sum, round) => sum + round.score, 0)
  return { day, shots, score, maxCombo: Math.max(...rounds.map((round) => round.combo)), fevers: rounds.reduce((sum, round) => sum + round.fevers, 0), hits: rounds.reduce((sum, round) => sum + round.hits, 0), stars: score >= 9500 ? 3 : score >= 4500 ? 2 : score > 0 ? 1 : 0 }
}

import { FPS, MOVE_STEP, type Point } from './rules.mjs'

export function farmWorldBounds(rect: {
  left: number
  top: number
  width: number
  height: number
}) {
  const scale = Math.max(
    Math.min(rect.width / 360, rect.height / 430),
    rect.width / 900,
    rect.height / 850,
  )
  const width = 360 * scale,
    height = 430 * scale
  return {
    left: rect.left + (rect.width - width) / 2,
    top: rect.top + (rect.height - height) / 2,
    width,
    height,
  }
}

// Floating-point display motion runs at the display refresh rate. Only the
// integer positions from stepFarm are recorded or used for harvesting.
export function advanceFarmPosition(
  position: Point,
  target: Point,
  authoritative: Point,
  deltaMs: number,
  moveStep = MOVE_STEP,
): Point {
  const destination = target
  const dx = destination[0] - position[0],
    dy = destination[1] - position[1]
  const distance = Math.hypot(dx, dy)
  const travel = Math.min(distance, (Math.max(0, Math.min(125, deltaMs)) * FPS * moveStep) / 1000)
  const scale = distance ? travel / distance : 0
  const next: Point = [position[0] + dx * scale, position[1] + dy * scale]
  // Predict at most one simulation step. A delayed frame cannot visually
  // teleport across crops before the authoritative simulation gets there.
  const aheadX = next[0] - authoritative[0],
    aheadY = next[1] - authoritative[1]
  const ahead = Math.hypot(aheadX, aheadY)
  const limit = moveStep + Math.SQRT1_2
  if (ahead > limit)
    return [
      authoritative[0] + (aheadX * limit) / ahead,
      authoritative[1] + (aheadY * limit) / ahead,
    ]
  return next
}

// Input remains in camera space. Resolve it each step so a held direction keeps
// moving as the camera follows, without requiring another pointermove event.
export function farmPointerTarget(position: Point, screen: Point): Point {
  const dx = screen[0] - 50,
    dy = screen[1] - 50
  return Math.hypot(dx * 0.84, dy) <= 3 ? [...position] : [position[0] + dx, position[1] + dy]
}

export const FARM_STICK_DEAD_ZONE = 0.16
export function farmStickRadius(width: number, height: number) {
  return Math.max(28, Math.min(width, height) * 0.18)
}

// Touch drags steer a virtual stick: the press point becomes the base and the
// offset direction is the walking direction, so the hero never chases the
// finger across the arena. Null inside the dead zone means "stand still".
export function farmStickVector(
  dx: number,
  dy: number,
  width: number,
  height: number,
  radius: number,
): Point | null {
  if (!width || !height || Math.hypot(dx, dy) < radius * FARM_STICK_DEAD_ZONE) return null
  // Pixels per world unit differ per axis, so scale each axis separately and
  // the movement direction matches the drag drawn on screen.
  const wx = (dx / width) * 100,
    wy = (dy / height) * 100
  const length = Math.hypot(wx, wy) || 1
  return [(wx / length) * MOVE_STEP, (wy / length) * MOVE_STEP]
}

export function farmCamera(position: Point, width: number, height: number) {
  const bounds = farmWorldBounds({ left: 0, top: 0, width, height })
  const scale = bounds.width / 360
  const x = width / 2 - position[0] * 3.6 * scale
  const y = height / 2 - position[1] * 4.3 * scale
  return {
    scale,
    x,
    y,
    left: -x / scale,
    top: -y / scale,
    right: (width - x) / scale,
    bottom: (height - y) / scale,
  }
}

// Only visible tiles are generated; negative coordinates use floor, not truncation.
export function farmVisibleTiles(camera: ReturnType<typeof farmCamera>) {
  const tiles: { x: number; y: number; variant: number }[] = []
  for (let row = Math.floor(camera.top / 430); row <= Math.floor(camera.bottom / 430); row++) {
    for (
      let column = Math.floor(camera.left / 360);
      column <= Math.floor(camera.right / 360);
      column++
    ) {
      const hash = (Math.imul(column, 73856093) ^ Math.imul(row, 19349663)) >>> 0
      tiles.push({ x: column * 360, y: row * 430, variant: hash % 4 })
    }
  }
  return tiles
}

// Bosses spawn outside the view on an endless map. Point at them from the
// screen edge so the player knows which way the threat is coming from.
export function farmOffscreenMarkers(
  position: Point,
  bosses: { x: number; y: number; hp: number }[],
  width: number,
  height: number,
  margin = 24,
) {
  if (width <= 0 || height <= 0) return []
  const camera = farmCamera(position, width, height)
  const centerX = width / 2,
    centerY = height / 2
  const markers: { x: number; y: number; angle: number; distance: number }[] = []
  for (const boss of bosses) {
    if (!(boss.hp > 0) || !Number.isFinite(boss.x) || !Number.isFinite(boss.y)) continue
    const sx = boss.x * 3.6 * camera.scale + camera.x,
      sy = boss.y * 4.3 * camera.scale + camera.y
    if (sx >= margin && sx <= width - margin && sy >= margin && sy <= height - margin) continue
    const dx = sx - centerX,
      dy = sy - centerY
    const spanX = dx ? (width / 2 - margin) / Math.abs(dx) : Infinity
    const spanY = dy ? (height / 2 - margin) / Math.abs(dy) : Infinity
    const reach = Math.min(spanX, spanY)
    if (!Number.isFinite(reach) || reach <= 0) continue
    markers.push({
      x: centerX + dx * reach,
      y: centerY + dy * reach,
      angle: Math.atan2(dy, dx),
      distance: Math.hypot((boss.x - position[0]) * 0.84, boss.y - position[1]),
    })
  }
  return markers
}

// Seconds until the next boss arrival, shared by the HUD countdown.
export function farmBossCountdown(state: {
  tick: number
  nextBoss: number
  nextBass: number
}): number {
  const due = Math.min(state.nextBoss, state.nextBass)
  return Math.max(0, Math.ceil((due - state.tick) / FPS))
}

export function formatFarmTime(ticks: number) {
  const seconds = Math.floor(ticks / FPS)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds / 60) % 60
  const tail = `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  return hours ? `${hours}:${tail}` : tail
}

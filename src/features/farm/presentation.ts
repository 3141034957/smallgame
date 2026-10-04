import { FPS, MOVE_STEP, type Point } from './rules.mjs'

export function farmWorldBounds(rect: { left: number; top: number; width: number; height: number }) {
  const scale = Math.max(Math.min(rect.width / 360, rect.height / 430), rect.width / 900, rect.height / 850)
  const width = 360 * scale, height = 430 * scale
  return { left: rect.left + (rect.width - width) / 2, top: rect.top + (rect.height - height) / 2, width, height }
}

// Floating-point display motion runs at the display refresh rate. Only the
// integer positions from stepFarm are recorded or used for harvesting.
export function advanceFarmPosition(position: Point, target: Point, authoritative: Point, deltaMs: number): Point {
  const destination = target
  const dx = destination[0] - position[0], dy = destination[1] - position[1]
  const distance = Math.hypot(dx, dy)
  const travel = Math.min(distance, Math.max(0, Math.min(125, deltaMs)) * FPS * MOVE_STEP / 1000)
  const scale = distance ? travel / distance : 0
  const next: Point = [position[0] + dx * scale, position[1] + dy * scale]
  // Predict at most one simulation step. A delayed frame cannot visually
  // teleport across crops before the authoritative simulation gets there.
  const aheadX = next[0] - authoritative[0], aheadY = next[1] - authoritative[1]
  const ahead = Math.hypot(aheadX, aheadY)
  const limit = MOVE_STEP + Math.SQRT1_2
  if (ahead > limit) return [authoritative[0] + aheadX * limit / ahead, authoritative[1] + aheadY * limit / ahead]
  return next
}

// Input remains in camera space. Resolve it each step so a held direction keeps
// moving as the camera follows, without requiring another pointermove event.
export function farmPointerTarget(position: Point, screen: Point): Point {
  const dx = screen[0] - 50, dy = screen[1] - 50
  return Math.hypot(dx * .84, dy) <= 3 ? [...position] : [position[0] + dx, position[1] + dy]
}

export function farmCamera(position: Point, width: number, height: number) {
  const bounds = farmWorldBounds({ left: 0, top: 0, width, height })
  const scale = bounds.width / 360
  const x = width / 2 - position[0] * 3.6 * scale
  const y = height / 2 - position[1] * 4.3 * scale
  return { scale, x, y, left: -x / scale, top: -y / scale, right: (width - x) / scale, bottom: (height - y) / scale }
}

// Only visible tiles are generated; negative coordinates use floor, not truncation.
export function farmVisibleTiles(camera: ReturnType<typeof farmCamera>) {
  const tiles: { x: number; y: number; variant: number }[] = []
  for (let row = Math.floor(camera.top / 430); row <= Math.floor(camera.bottom / 430); row++) {
    for (let column = Math.floor(camera.left / 360); column <= Math.floor(camera.right / 360); column++) {
      const hash = (Math.imul(column, 73856093) ^ Math.imul(row, 19349663)) >>> 0
      tiles.push({ x: column * 360, y: row * 430, variant: hash % 4 })
    }
  }
  return tiles
}

export function formatFarmTime(ticks: number) {
  const seconds = Math.floor(ticks / FPS)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds / 60) % 60
  const tail = `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  return hours ? `${hours}:${tail}` : tail
}

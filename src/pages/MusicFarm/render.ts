import { monsterFor } from '@/features/farm/monsters.mjs'
import { loadMonsterSprites, type MonsterSprites } from './monsterSprites'
import {
  evolved,
  FPS,
  orbitPositions,
  type Crop,
  type FarmEvent,
  type FarmState,
  type Point,
} from '../../features/farm/rules.mjs'
import {
  farmCamera,
  farmOffscreenMarkers,
  farmStickRadius,
  farmVisibleTiles,
  farmWorldBounds,
} from '../../features/farm/presentation'
import { FARM_GROUND_COLOR, paintFarmGround } from './background'

type Effect = { event: FarmEvent; born: number }
export type FarmPose = {
  character?: HTMLCanvasElement | null
  joystick?: { base: Point; knob: Point }
  simple?: boolean
  position: Point
  tick: number
  previousEnemies?: ReadonlyMap<number, { x: number; y: number }>
  previousShots?: ReadonlyMap<number, { x: number; y: number }>
  previousLoot?: ReadonlyMap<number, { x: number; y: number }>
  alpha: number
}
type Assets = {
  monsters: MonsterSprites
  garden: HTMLCanvasElement[]
  crops: HTMLCanvasElement[]
  sprout: HTMLCanvasElement
  heroPlaceholder: HTMLCanvasElement[]
  loot: HTMLCanvasElement
  notes: HTMLCanvasElement[]
}
const cachedAssets = new WeakMap<CanvasRenderingContext2D, Assets>()
const COLORS = ['#f3a0b0', '#f7ab67', '#ed817c', '#f3cd67']
const INK = '#405446'
const X = (value: number) => value * 3.6
const Y = (value: number) => value * 4.3

// Juice helpers: everything stays stateless so a frame can be redrawn anywhere.
const easeOut = (t: number) => 1 - (1 - t) ** 3
// Stable pseudo-random per effect and particle: no state, no allocations.
const noise = (a: number, b: number) => {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453
  return x - Math.floor(x)
}
function sparks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
  seed: number,
  count: number,
  color: string,
  spread: number,
  size: number,
) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = color
  for (let i = 0; i < count; i++) {
    const angle = noise(seed, i) * Math.PI * 2
    const speed = (0.35 + noise(seed, i + 11) * 0.85) * spread
    const t = easeOut(Math.min(1, progress * 1.5))
    const px = x + Math.cos(angle) * speed * t
    const py = y + Math.sin(angle) * speed * t + t * t * spread * 0.35
    ctx.globalAlpha = Math.max(0, 1 - progress) * 0.95
    ctx.beginPath()
    ctx.arc(px, py, Math.max(0.4, size * (1 - progress * 0.55)), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// Keep the canvas playable in older embedded mobile browsers too.
function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string | CanvasGradient,
) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
}

function leaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
  color = '#6ca57b',
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ellipse(ctx, 0, -size * 0.6, size * 0.32, size * 0.72, color)
  ctx.strokeStyle = '#b7d7a4'
  ctx.lineWidth = 0.7
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -size)
  ctx.stroke()
  ctx.restore()
}

function face(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1, happy = false) {
  ctx.fillStyle = INK
  for (const side of [-1, 1]) {
    if (happy) {
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.1 * scale
      ctx.beginPath()
      ctx.arc(x + side * 3.5 * scale, y, 1.5 * scale, Math.PI * 1.15, Math.PI * 1.85)
      ctx.stroke()
    } else ellipse(ctx, x + side * 3.5 * scale, y, 0.9 * scale, 1.25 * scale, INK)
    ellipse(ctx, x + side * 6 * scale, y + 2 * scale, 1.8 * scale, 0.9 * scale, '#f3a1a180')
  }
  ctx.strokeStyle = INK
  ctx.lineWidth = 0.8 * scale
  ctx.beginPath()
  ctx.arc(x, y + 2 * scale, 1.6 * scale, 0.12, Math.PI - 0.12)
  ctx.stroke()
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, y - size)
  ctx.quadraticCurveTo(x + size * 0.2, y - size * 0.2, x + size, y)
  ctx.quadraticCurveTo(x + size * 0.2, y + size * 0.2, x, y + size)
  ctx.quadraticCurveTo(x - size * 0.2, y + size * 0.2, x - size, y)
  ctx.quadraticCurveTo(x - size * 0.2, y - size * 0.2, x, y - size)
  ctx.fill()
}

function cropSprite(
  ctx: CanvasRenderingContext2D,
  crop: Crop,
  now: number,
  tick: number,
  hit: boolean,
  assets: Assets,
) {
  if (crop.hp <= 0) return
  const x = X(crop.x),
    y = Y(crop.y)
  if (tick < (crop.spawnAt ?? 0)) {
    const progress = 1 - ((crop.spawnAt ?? 0) - tick) / 12
    ctx.save()
    ctx.strokeStyle = '#ae8cbc'
    ctx.globalAlpha = 0.35 + Math.max(0, progress) * 0.4
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(x, y + 7, 16, 7, 0, 0, Math.PI * 2)
    ctx.stroke()
    sparkle(ctx, x, y - 3, 4 + Math.max(0, progress) * 5, '#cda1ce')
    ctx.restore()
    return
  }
  const monster = monsterFor(crop)
  const art = assets.monsters.get(monster.id)
  const winding = tick < (crop.windupUntil ?? -1)
  if (winding && crop.dashDx !== undefined && crop.dashDy !== undefined) {
    ctx.save()
    ctx.strokeStyle = crop.elite ? '#d99424' : '#d35e92'
    ctx.lineWidth = 7
    ctx.globalAlpha = 0.5
    ctx.setLineDash([8, 5])
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(X(crop.x + crop.dashDx * 20), Y(crop.y + crop.dashDy * 20))
    ctx.stroke()
    ctx.restore()
  }
  const bob = Math.sin(now / (crop.kind === 1 ? 70 : 110) + crop.id * 1.3) * 2
  ctx.save()
  ctx.translate(x + (hit ? Math.sin(now / 18) * 2 : 0), y + bob)
  ellipse(ctx, 0, monster.size * 0.34, monster.size * 0.3, 5, '#5e775b35')
  const warning =
    winding ||
    tick < (crop.attackUntil ?? -1) ||
    (!crop.boss && crop.kind === 2 && (tick + crop.id) % 64 >= 52)
  if (warning || hit) {
    ctx.shadowColor = warning ? '#e36e95' : '#fff6e2'
    ctx.shadowBlur = warning ? 10 : 18
  }
  if (crop.elite || warning) {
    ctx.strokeStyle = crop.elite ? '#dba23e' : '#dc759a'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(0, 0, monster.size * 0.48, monster.size * 0.48, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  if (art) ctx.drawImage(art, -monster.size / 2, -monster.size / 2, monster.size, monster.size)
  else ctx.drawImage(assets.crops[crop.kind], -32, -32, 64, 64)
  ctx.shadowBlur = 0
  if (crop.boss) {
    const bottom = monster.size / 2 + 3
    ctx.fillStyle = '#fffdf3'
    ctx.beginPath()
    roundedRect(ctx, -28, bottom, 56, 6, 3)
    ctx.fill()
    ctx.fillStyle = crop.bass ? '#8a63c9' : '#e3a44f'
    ctx.beginPath()
    roundedRect(ctx, -27, bottom + 1, Math.max(2, (54 * crop.hp) / crop.maxHp), 4, 2)
    ctx.fill()
    ctx.font = '700 10px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = crop.bass ? '#5b4788' : '#846b44'
    ctx.fillText(monster.name, 0, -monster.size / 2 - 5)
    ctx.font = '700 8px system-ui, sans-serif'
    ctx.fillText(`${Math.max(1, Math.ceil((crop.hp / crop.maxHp) * 100))}%`, 0, bottom + 18)
  }
  ctx.restore()
}

// A phone screen is a small window onto the same arena: keeping the farmer at
// desktop size eats the room needed to read the horde closing in, so the hero
// shrinks with the field and keeps its proportions on a wide desktop.
function heroScale(width: number, height: number) {
  return Math.min(1, Math.max(0.8, Math.min(width, height) / 520))
}
function drawHero(
  ctx: CanvasRenderingContext2D,
  state: FarmState,
  now: number,
  assets: Assets,
  character?: HTMLCanvasElement | null,
  scale = 1,
) {
  const x = X(state.position[0]),
    y = Y(state.position[1]),
    ultimate = evolved(state.gear).length > 0
  const bob = Math.sin(now / 150) * 1.1
  ctx.save()
  ctx.translate(x, y + bob)
  if (ultimate) {
    ctx.strokeStyle = '#edbc65b3'
    ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.ellipse(0, 9, 21, 8, 0, 0, Math.PI * 2)
    ctx.stroke()
    for (let i = 0; i < 3; i++) {
      const a = now / 600 + (i * Math.PI * 2) / 3
      sparkle(ctx, Math.cos(a) * 24, Math.sin(a) * 9 + 7, 3, '#f7d881')
    }
  }
  if (state.tick < state.hurtUntil && state.tick > 32)
    ctx.globalAlpha = Math.floor(now / 80) % 2 ? 0.45 : 1
  if (state.combo >= 30) {
    const heat = ctx.createRadialGradient(0, 0, 8, 0, 0, 40)
    heat.addColorStop(0, state.combo >= 60 ? '#f2a35c59' : '#f2c96c40')
    heat.addColorStop(1, '#f2c96c00')
    ellipse(ctx, 0, 4, 40, 40, heat)
  }
  if (state.shields > 0) {
    ctx.strokeStyle = '#7fd4e8'
    ctx.lineWidth = 2
    ctx.globalAlpha = 0.55 + Math.sin(now / 160) * 0.25
    ctx.beginPath()
    ctx.arc(0, 0, 27, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  if (character) {
    ellipse(ctx, 0, 17 * scale, 16 * scale, 5 * scale, '#70608030')
    ctx.drawImage(character, -40 * scale, -52 * scale, 80 * scale, 80 * scale)
  } else
    ctx.drawImage(
      assets.heroPlaceholder[state.tick < state.surgeUntil ? 1 : 0],
      -40 * scale,
      -40 * scale,
      80 * scale,
      80 * scale,
    )
  ctx.restore()
}

function cropBody(ctx: CanvasRenderingContext2D, kind: number) {
  ellipse(ctx, 0, 13, 12, 3, '#637b4f26')
  if (kind === 0) {
    // A tiny pink jelly with a musical antenna.
    ctx.fillStyle = '#e8a0c5'
    ctx.beginPath()
    ctx.moveTo(-13, 10)
    ctx.bezierCurveTo(-18, -19, 17, -19, 13, 10)
    ctx.quadraticCurveTo(0, 16, -13, 10)
    ctx.fill()
    ctx.font = 'bold 13px serif'
    ctx.fillStyle = '#9c699b'
    ctx.fillText('♪', 1, -10)
  } else if (kind === 1) {
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#b1a0dc'
      ctx.beginPath()
      ctx.moveTo(side * 5, 0)
      ctx.lineTo(side * 23, -11)
      ctx.lineTo(side * 19, 6)
      ctx.lineTo(side * 10, 4)
      ctx.fill()
    }
    ellipse(ctx, 0, 0, 9, 12, '#9c8acd')
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#9c8acd'
      ctx.beginPath()
      ctx.moveTo(side * 7, -4)
      ctx.lineTo(side * 8, -19)
      ctx.lineTo(side, -9)
      ctx.fill()
    }
  } else if (kind === 2) {
    ellipse(ctx, 0, 0, 12, 12, '#edaa7d')
    ellipse(ctx, 0, 8, 6, 5, '#bb708c')
    ellipse(ctx, 0, 8, 3, 3, '#fff0c8')
    ellipse(ctx, -6, -12, 3, 5, '#f1c68c')
    ellipse(ctx, 6, -12, 3, 5, '#f1c68c')
  } else {
    ctx.fillStyle = '#82b6c2'
    ctx.beginPath()
    roundedRect(ctx, -13, -14, 26, 28, 7)
    ctx.fill()
    ctx.fillStyle = '#d6ece8'
    ctx.beginPath()
    roundedRect(ctx, -9, -8, 18, 13, 4)
    ctx.fill()
    for (const side of [-1, 1]) ellipse(ctx, side * 15, 6, 4, 7, '#6897ac')
    for (let i = -1; i <= 1; i++) ellipse(ctx, i * 4, 10, 1, 1, '#527d93')
  }
  face(ctx, 0, -1)
}

// A neutral loading marker avoids showing another band member on image failure.
function heroPlaceholder(ctx: CanvasRenderingContext2D, active: boolean) {
  ellipse(ctx, 0, 10, 16, 5, '#446a493d')
  ellipse(ctx, 0, -3, 20, 20, active ? '#edcf83' : '#a8c3ad')
  ctx.fillStyle = '#fffaf0'
  ctx.font = 'bold 27px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('♪', 0, -3)
}

function sprite(
  owner: Document,
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
) {
  const canvas = owner.createElement('canvas')
  canvas.width = width * 2
  canvas.height = height * 2
  const ctx = canvas.getContext('2d')!
  ctx.scale(2, 2)
  paint(ctx)
  return canvas
}

function assetsFor(ctx: CanvasRenderingContext2D): Assets {
  const cached = cachedAssets.get(ctx)
  if (cached) return cached
  const owner = ctx.canvas.ownerDocument
  const assets: Assets = {
    monsters: loadMonsterSprites(owner),
    garden: Array.from({ length: 4 }, (_, variant) =>
      sprite(owner, 360, 430, (ctx) => paintFarmGround(ctx, variant)),
    ),
    crops: Array.from({ length: 4 }, (_, kind) =>
      sprite(owner, 64, 64, (ctx) => {
        ctx.translate(32, 32)
        cropBody(ctx, kind)
      }),
    ),
    sprout: sprite(owner, 24, 24, (ctx) => {
      ctx.translate(12, 9)
      ellipse(ctx, 0, 8, 8, 2, '#7c96652b')
      leaf(ctx, 0, 6, -0.7, 7, '#91b383')
      leaf(ctx, 0, 6, 0.7, 7, '#a6c493')
    }),
    heroPlaceholder: [false, true].map((happy) =>
      sprite(owner, 80, 80, (ctx) => {
        ctx.translate(40, 40)
        heroPlaceholder(ctx, happy)
      }),
    ),
    loot: sprite(owner, 18, 18, (ctx) => {
      ctx.translate(9, 9)
      ellipse(ctx, 0, 4, 5, 1.5, '#687c4b1f')
      ctx.save()
      ctx.translate(-2, 0)
      ctx.rotate(Math.PI / 4)
      ctx.fillStyle = '#89c6ab'
      ctx.fillRect(-3, -3, 6, 6)
      ctx.fillStyle = '#daf0cf'
      ctx.fillRect(-2, -2, 2, 2)
      ctx.restore()
      ellipse(ctx, 3, 2, 3.5, 3.5, '#ecc765')
      ellipse(ctx, 3, 2, 2.1, 2.1, '#ffe4a2')
    }),
    notes: [false, true].map((terminal) =>
      sprite(owner, 48, 48, (ctx) => {
        const glow = ctx.createRadialGradient(24, 24, 0, 24, 24, 15)
        glow.addColorStop(0, '#fff8f1d9')
        glow.addColorStop(1, '#cab2dc00')
        ellipse(ctx, 24, 24, 15, 15, glow)
        ctx.font = `800 ${terminal ? 23 : 19}px serif`
        ctx.textAlign = 'center'
        ctx.fillStyle = terminal ? '#ac73b8' : '#9c83bb'
        ctx.fillText(terminal ? '♫' : '♪', 24, 30)
      }),
    ),
  }
  cachedAssets.set(ctx, assets)
  return assets
}

function groundEffect(
  ctx: CanvasRenderingContext2D,
  event: FarmEvent,
  progress: number,
  now: number,
) {
  const x = X(event.x),
    y = Y(event.y),
    radius = Y(event.radius ?? 15)
  ctx.save()
  if (event.kind === 'shock') {
    // Star tambourine rings push outwards twice as wide as a pulse.
    const expanding = radius * (0.2 + easeOut(Math.min(1, progress * 1.2)) * 0.8)
    ctx.globalAlpha = (1 - progress) * 0.85
    ctx.strokeStyle = '#8fb7d9'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(x, y, expanding, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha *= 0.5
    ctx.strokeStyle = '#e8f2ff'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x, y, expanding * 0.72, 0, Math.PI * 2)
    ctx.stroke()
    // Keyboard: stars ride the wave outwards.
    ctx.globalAlpha = (1 - progress) * 0.9
    ctx.fillStyle = '#dcefff'
    ctx.font = 'bold 13px system-ui'
    ctx.textAlign = 'center'
    for (let i = 0; i < 5; i++) {
      const angle = now / 240 + (i * Math.PI * 2) / 5
      ctx.fillText(
        '✦',
        x + Math.cos(angle) * expanding * 0.85,
        y + Math.sin(angle) * expanding * 0.85 + 4,
      )
    }
    sparks(ctx, x, y, progress, event.id, 6, '#e8f6ff', expanding, 2)
  } else if (event.kind === 'blast') {
    // Drum: a struck skin — thick ring with the beat flying outwards.
    const expanding = radius * (0.2 + easeOut(Math.min(1, progress * 1.5)) * 0.8)
    ctx.globalAlpha = (1 - progress) * 0.9
    ctx.strokeStyle = '#e0954f'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(x, y, expanding, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = (1 - progress) * 0.3
    ellipse(ctx, x, y, expanding, expanding, '#eda578')
    ctx.globalAlpha = (1 - progress) * 0.8
    ctx.strokeStyle = '#f8d19a'
    ctx.lineWidth = 2
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 + progress * 0.7
      ctx.beginPath()
      ctx.moveTo(x + Math.cos(angle) * expanding * 0.5, y + Math.sin(angle) * expanding * 0.5)
      ctx.lineTo(x + Math.cos(angle) * expanding * 1.3, y + Math.sin(angle) * expanding * 1.3)
      ctx.stroke()
    }
    sparks(ctx, x, y, progress, event.id, 8, '#ffcf8a', expanding * 1.1, 2.6)
    ctx.fillStyle = '#b9762f'
    ctx.font = 'bold 15px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('♬', x, y + 5)
  } else if (['pulse', 'surge', 'echo', 'slam'].includes(event.kind)) {
    const color = event.kind === 'slam' ? '#e45e87' : event.kind === 'surge' ? '#efc561' : '#94b0d7'
    const expanding = radius * (0.18 + easeOut(Math.min(1, progress * 1.5)) * 0.82)
    ctx.globalAlpha = (1 - progress) * (event.kind === 'pulse' ? 0.5 : 0.8)
    ctx.strokeStyle = color
    ctx.lineWidth = event.kind === 'surge' ? 5 : 1.8
    ctx.beginPath()
    ctx.arc(x, y, expanding, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha *= 0.12
    ellipse(ctx, x, y, expanding, expanding, color)
  } else if (event.kind === 'beam') {
    const beamWidth = X(event.radius ?? 5)
    ctx.globalAlpha = (1 - progress) * 0.65
    const gradient = ctx.createLinearGradient(x - beamWidth, 0, x + beamWidth, 0)
    gradient.addColorStop(0, '#a8b8de00')
    gradient.addColorStop(0.45, '#d7deff')
    gradient.addColorStop(0.5, '#fffcf2')
    gradient.addColorStop(0.55, '#d7deff')
    gradient.addColorStop(1, '#a8b8de00')
    ctx.fillStyle = gradient
    ctx.fillRect(x - beamWidth, y - Y(120), beamWidth * 2, Y(240))
    ctx.strokeStyle = '#789fcaba'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, y - Y(120))
    ctx.lineTo(x, y + Y(120))
    ctx.stroke()
    // Bass: slow low-frequency waves rolling down the column.
    ctx.globalAlpha = (1 - progress) * 0.55
    ctx.strokeStyle = '#dbe4ff'
    ctx.lineWidth = 1.4
    for (let i = 0; i < 7; i++) {
      const wave = y - Y(110) + i * Y(34) + progress * Y(70)
      ctx.beginPath()
      ctx.moveTo(x - beamWidth * 0.85, wave)
      ctx.quadraticCurveTo(x, wave - 9, x + beamWidth * 0.85, wave)
      ctx.stroke()
    }
  } else if (event.kind === 'horn') {
    // Sax blast: a widening wedge down the aim, brightest right after the call.
    const heading = Math.atan2(event.fromY ?? 0, (event.fromX ?? 1) * 0.84)
    const reach = X(event.radius ?? 26) * (0.35 + Math.min(1, progress * 1.6) * 0.65)
    ctx.globalAlpha = (1 - progress) * 0.8
    ctx.translate(x, y)
    ctx.rotate(heading)
    ctx.fillStyle = '#e8b46e'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, reach, -0.62, 0.62)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = (1 - progress) * 0.5
    ctx.strokeStyle = '#fff3d8'
    ctx.lineWidth = 2
    ctx.stroke()
    // Brass: three arcs riding out of the bell.
    ctx.globalAlpha = (1 - progress) * 0.6
    ctx.lineWidth = 1.5
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath()
      ctx.arc(0, 0, reach * (0.32 * i), -0.52, 0.52)
      ctx.stroke()
    }
    ctx.restore()
    sparks(ctx, x, y, progress, event.id, 8, '#ffd79a', reach * 0.9, 2.4)
    return
  } else if (event.kind === 'fan') {
    const angle = event.angle ?? 0,
      spread = event.spread ?? 0.45
    const reach = X(event.radius ?? 34) * (0.4 + Math.min(1, progress * 1.8) * 0.6)
    ctx.globalAlpha = (1 - progress) * 0.7
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.fillStyle = '#bfe0b4'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, reach, -spread, spread)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = (1 - progress) * 0.45
    ctx.strokeStyle = '#f2fff0'
    ctx.lineWidth = 1.5
    ctx.stroke()
    // Prism: thin coloured rays split the fan.
    ctx.globalAlpha = (1 - progress) * 0.85
    ctx.lineWidth = 1.8
    const rays = ['#8fd6a6', '#b9e8a8', '#e6f2a8', '#c8ead2', '#a8dcc0']
    for (let i = 0; i < 5; i++) {
      const a = -spread + spread * 2 * (i / 4)
      ctx.strokeStyle = rays[i]
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(a) * reach, Math.sin(a) * reach)
      ctx.stroke()
    }
    ctx.fillStyle = '#5f8a63'
    ctx.font = 'bold 13px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('⌁', reach * 0.5, 4)
    ctx.restore()
    sparks(ctx, x, y, progress, event.id, 7, '#d8f0c4', reach * 0.8, 2.2)
    return
  } else if (event.kind === 'mine') {
    ctx.globalAlpha = (1 - progress) * 0.85
    ctx.strokeStyle = '#b795e0'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(x, y, radius * (0.25 + progress * 0.9), 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha *= 0.35
    ellipse(
      ctx,
      x,
      y,
      radius * (0.25 + progress * 0.9),
      radius * (0.25 + progress * 0.9),
      '#caaef0',
    )
    ctx.globalAlpha = 1 - progress
    ctx.fillStyle = '#7a5aa8'
    ctx.font = 'bold 16px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('✸', x, y + 6)
    // Vinyl shards fly out of the sample.
    const burst = radius * (0.25 + progress * 0.9)
    sparks(ctx, x, y, progress, event.id, 9, '#c9a6f5', burst * 1.2, 2.4)
    ctx.strokeStyle = '#8f6fc0'
    ctx.lineWidth = 2
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 + progress * 0.9
      ctx.beginPath()
      ctx.moveTo(x + Math.cos(angle) * burst * 0.55, y + Math.sin(angle) * burst * 0.55)
      ctx.lineTo(x + Math.cos(angle) * burst * 1.25, y + Math.sin(angle) * burst * 1.25)
      ctx.stroke()
    }
  } else if (event.kind === 'blackhole') {
    ctx.translate(x, y)
    ctx.globalAlpha = (1 - progress) * 0.55
    const gradient = ctx.createRadialGradient(0, 0, 1, 0, 0, radius)
    gradient.addColorStop(0, '#8670b580')
    gradient.addColorStop(0.65, '#b9a8d263')
    gradient.addColorStop(1, '#b9a8d200')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.rotate(now / 210)
    ctx.strokeStyle = '#8d80b7'
    ctx.lineWidth = 2
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      for (let t = 0; t < 24; t++) {
        const angle = t / 7 + (i * Math.PI * 2) / 3,
          r = (radius * t) / 24
        if (!t) ctx.moveTo(0, 0)
        else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r * 0.75)
      }
      ctx.stroke()
    }
  }
  ctx.restore()
}

function airEffect(ctx: CanvasRenderingContext2D, event: FarmEvent, progress: number) {
  const x = X(event.x),
    y = Y(event.y),
    color = COLORS[event.lane]
  ctx.save()
  if (event.kind === 'shield') {
    ctx.globalAlpha = Math.max(0, 1 - progress) * 0.9
    ctx.strokeStyle = '#7fd4e8'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(x, y, 22 + progress * 30, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#3f9db8'
    ctx.font = 'bold 12px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('🛡', x, y + 4)
    ctx.globalAlpha = 1
    ctx.restore()
    return
  }
  if (event.kind === 'block') {
    ctx.globalAlpha = Math.max(0, 1 - progress)
    ctx.strokeStyle = '#b7a0dd'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(x, y, 5 + progress * 16, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#8f74c4'
    ctx.font = 'bold 13px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('♪', x, y + 5 - progress * 10)
    ctx.globalAlpha = 1
    ctx.restore()
    return
  }
  if (event.kind === 'ricochet') {
    const tx = X(event.fromX ?? event.x),
      ty = Y(event.fromY ?? event.y)
    ctx.globalAlpha = 1 - progress
    ctx.strokeStyle = '#9db9c9'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(tx, ty)
    ctx.stroke()
    ctx.fillStyle = '#6f93a8'
    ctx.font = 'bold 14px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('♪', (x + tx) / 2, (y + ty) / 2 - 6 + progress * -10)
    ctx.globalAlpha = 1
    ctx.restore()
    return
  }
  if (event.kind === 'hurt' || event.kind === 'heal') {
    ctx.globalAlpha = 1 - progress
    ctx.font = '800 17px system-ui'
    ctx.textAlign = 'center'
    ctx.fillStyle = event.kind === 'hurt' ? '#cf476d' : '#3c9c7c'
    ctx.strokeStyle = '#fffaf4'
    ctx.lineWidth = 3
    const text = `${event.kind === 'hurt' ? '−' : '+'}${event.points}`
    ctx.strokeText(text, x, y - 30 - progress * 30)
    ctx.fillText(text, x, y - 30 - progress * 30)
  } else if (event.kind === 'harvest' || event.kind === 'boss') {
    ctx.globalAlpha = 1 - progress
    for (let i = 0; i < (event.kind === 'boss' ? 9 : 4); i++) {
      const angle = i * 2.4 + event.id * 0.5,
        travel = 8 + progress * (event.kind === 'boss' ? 44 : 22)
      sparkle(
        ctx,
        x + Math.cos(angle) * travel,
        y + Math.sin(angle) * travel - progress * 16,
        3 * (1 - progress) + 1,
        i % 2 ? '#fff5cf' : color,
      )
    }
    // Regular kills just feed the score readout; only a boss is worth a number.
    if (event.kind === 'boss') {
      ctx.font = '800 17px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.lineWidth = 3
      ctx.strokeStyle = '#fffaf0'
      const text = `+${event.points ?? 0}`,
        lift = y - 15 - progress * 25
      ctx.strokeText(text, x, lift)
      ctx.fillStyle = '#b58028'
      ctx.fillText(text, x, lift)
    }
  } else if (event.kind === 'rain') {
    const t = Math.min(1, progress * 2),
      startY = y - 70
    ctx.globalAlpha = 1 - progress
    ctx.strokeStyle = '#d89cb4'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(x + 15 * (1 - t), startY + t * 70 - 18)
    ctx.lineTo(x + 15 * (1 - t), startY + t * 70)
    ctx.stroke()
    ctx.fillStyle = '#bf7399'
    ctx.font = '800 18px serif'
    ctx.textAlign = 'center'
    ctx.fillText('♪', x + 15 * (1 - t), startY + t * 70)
    if (t === 1) sparkle(ctx, x, y, 8 * (1 - progress), '#e8bdd2')
  } else if (event.kind === 'collect') {
    ctx.globalAlpha = (1 - progress) * 0.7
    sparkle(ctx, x + Math.sin(event.id) * 13, y - 10 - progress * 15, 4 * (1 - progress), '#f1cf6c')
  }
  ctx.restore()
}

/** Coordinates are normalized by the simulation; caller owns device pixel ratio. */
export function drawFarm(
  ctx: CanvasRenderingContext2D,
  state: FarmState,
  effects: Effect[],
  now: number,
  width: number,
  height: number,
  pose?: FarmPose,
): void {
  if (width <= 0 || height <= 0) return
  const assets = assetsFor(ctx)
  const moving = pose ? { ...state, position: pose.position, tick: pose.tick } : state
  const camera = farmCamera(moving.position, width, height)
  ctx.save()
  ctx.fillStyle = FARM_GROUND_COLOR
  ctx.fillRect(0, 0, width, height)
  ctx.translate(camera.x, camera.y)
  ctx.scale(camera.scale, camera.scale)
  for (const tile of farmVisibleTiles(camera))
    ctx.drawImage(assets.garden[tile.variant], tile.x, tile.y, 360, 430)
  const visibleAt = (x: number, y: number, margin = 48) =>
    X(x) >= camera.left - margin &&
    X(x) <= camera.right + margin &&
    Y(y) >= camera.top - margin &&
    Y(y) <= camera.bottom + margin
  const active = effects.filter(({ born }) => now - born >= 0 && now - born < 900)

  // Boss kills, damage taken and the surge shake the stage for a few frames.
  let shakeX = 0,
    shakeY = 0
  for (const { event, born } of active) {
    const age = now - born
    if (age > 260) continue
    const power =
      event.kind === 'boss' ? 7 : event.kind === 'hurt' ? 6 : event.kind === 'surge' ? 4 : 0
    if (!power) continue
    const decay = (1 - age / 260) ** 2
    shakeX += (noise(event.id, 3) - 0.5) * power * decay
    shakeY += (noise(event.id, 9) - 0.5) * power * decay
  }
  // Several big hits can land together: keep the stage readable.
  const shake = 5
  if (shakeX || shakeY)
    ctx.translate(
      Math.max(-shake, Math.min(shake, shakeX)),
      Math.max(-shake, Math.min(shake, shakeY)),
    )
  // Sample dense drum bursts; every important weapon cast still gets its own visual.
  for (const { event, born } of active) {
    // Low-effect mode keeps the telegraphs that must be dodged and drops the rest.
    if (pose?.simple && event.kind !== 'slam' && event.kind !== 'surge') continue
    if (event.kind === 'blast' && event.id % 3 !== 0) continue
    // A telegraph can be wider than the screen: keep the margin as wide as it is.
    if (!visibleAt(event.x, event.y, 48 + Y(event.radius ?? 15))) continue
    const duration =
      event.kind === 'pulse'
        ? 650
        : event.kind === 'blast'
          ? 450
          : event.kind === 'shock'
            ? 700
            : 900
    const progress = (now - born) / duration
    if (progress < 1) groundEffect(ctx, event, progress, now)
  }
  const hitIds = new Set(
    active
      .filter(({ event, born }) => event.kind === 'hit' && now - born < 140)
      .map(({ event }) => `${event.x}:${event.y}`),
  )
  for (const danger of state.dangers) {
    // Long runs pile up off-screen warnings; only circles touching the view
    // are worth drawing. The off-screen boss arrows below stay untouched.
    if (!visibleAt(danger.x, danger.y, 48 + Y(danger.radius))) continue
    const progress = Math.max(0, Math.min(1, 1 - (danger.due - moving.tick) / 16))
    ellipse(
      ctx,
      X(danger.x),
      Y(danger.y),
      Y(danger.radius),
      Y(danger.radius),
      danger.sourceId !== undefined ? '#e5a54530' : '#e2537830',
    )
    ctx.strokeStyle = danger.sourceId !== undefined ? '#c58b26' : '#cf456f'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(X(danger.x), Y(danger.y), Y(danger.radius), 0, Math.PI * 2)
    ctx.stroke()
    ellipse(
      ctx,
      X(danger.x),
      Y(danger.y),
      Y(danger.radius) * progress,
      Y(danger.radius) * progress,
      '#e2537850',
    )
    ctx.fillStyle = '#b2375e'
    ctx.font = 'bold 20px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('!', X(danger.x), Y(danger.y) + 7)
  }
  for (const crop of state.crops) {
    if (!visibleAt(crop.x, crop.y)) continue
    const before = pose?.previousEnemies?.get(crop.id),
      alpha = pose?.alpha ?? 1
    const visible =
      before && Math.hypot(crop.x - before.x, crop.y - before.y) < 15
        ? {
            ...crop,
            x: before.x + (crop.x - before.x) * alpha,
            y: before.y + (crop.y - before.y) * alpha,
          }
        : crop
    cropSprite(ctx, visible, now, moving.tick, hitIds.has(`${crop.x}:${crop.y}`), assets)
  }
  for (const shot of state.shots) {
    if (!visibleAt(shot.x, shot.y)) continue
    const before = pose?.previousShots?.get(shot.id),
      alpha = pose?.alpha ?? 1
    const x = X(before ? before.x + (shot.x - before.x) * alpha : shot.x),
      y = Y(before ? before.y + (shot.y - before.y) * alpha : shot.y)
    ellipse(ctx, x, y, 6, 6, '#fff7e8')
    ellipse(
      ctx,
      x,
      y,
      4.5,
      4.5,
      shot.kind === 'record' ? '#c89530' : shot.kind === 'bass' ? '#9d65bc' : '#db6289',
    )
    ellipse(ctx, x - 1, y - 1, 1.5, 1.5, '#ffc5c0')
  }
  // Sentinel arrows: the flute whistles slim darts that curve onto a target.
  for (const arrow of state.arrows ?? []) {
    if (!visibleAt(arrow.x, arrow.y)) continue
    // Darts spend their last half second fading out with the whistle.
    const fade = Math.min(1, Math.max(0, arrow.expires - moving.tick) / (FPS / 2))
    if (fade <= 0) continue
    ctx.save()
    ctx.translate(X(arrow.x), Y(arrow.y))
    ctx.rotate(arrow.angle)
    // Whistle puffs: a few soft notes leaking out of the tail.
    for (let i = 1; i <= 3; i++) {
      ctx.globalAlpha = fade * (0.3 - i * 0.07)
      ellipse(ctx, -9 - i * 6, 0, 4.4 - i * 0.9, 4.4 - i * 0.9, '#9ac6b4')
    }
    ctx.globalAlpha = fade
    // A homing dart keeps a soft halo on its tip until it locks on.
    if (arrow.homing) ellipse(ctx, 9, 0, 8, 8, '#9ac6b455')
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#5f9480'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-10, 0)
    ctx.lineTo(5, 0)
    ctx.stroke()
    ctx.strokeStyle = '#e6f6ee'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(-9, 0)
    ctx.lineTo(4, 0)
    ctx.stroke()
    ctx.strokeStyle = '#9ac6b4'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(-10, 0)
    ctx.lineTo(-14, -4)
    ctx.moveTo(-10, 0)
    ctx.lineTo(-14, 4)
    ctx.stroke()
    ctx.fillStyle = '#9ac6b4'
    ctx.strokeStyle = '#3f7a66'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(13, 0)
    ctx.lineTo(4, -5)
    ctx.lineTo(4, 5)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
  // Echo whistle leaves delayed notes behind: draw them on the stage floor.
  for (const trail of state.trails) {
    if (!visibleAt(trail.x, trail.y)) continue
    const left = Math.max(0, trail.expires - moving.tick)
    const alpha = Math.min(1, left / 16)
    ctx.save()
    ctx.globalAlpha = alpha * (0.35 + Math.sin(now / 220 + trail.id) * 0.15)
    ellipse(ctx, X(trail.x), Y(trail.y) + 6, 11, 4, '#9ac6b455')
    ctx.restore()
    ctx.save()
    ctx.globalAlpha = alpha * 0.9
    ctx.drawImage(assets.notes[0], X(trail.x) - 13, Y(trail.y) - 15, 26, 26)
    ctx.restore()
  }
  // Sampler beats sit on the floor and tick louder just before they blow.
  for (const mine of state.mines) {
    if (!visibleAt(mine.x, mine.y)) continue
    const left = Math.max(0, mine.due - moving.tick)
    const armed = 1 - Math.min(1, left / FPS)
    ctx.save()
    ctx.globalAlpha = 0.45 + Math.sin(now / (110 - armed * 70) + mine.id) * 0.25
    ellipse(ctx, X(mine.x), Y(mine.y) + 5, 9 + armed * 3, 4 + armed * 2, '#b795e070')
    ctx.restore()
    ctx.save()
    ctx.globalAlpha = 0.9
    ctx.strokeStyle = '#8f6fc0'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(X(mine.x), Y(mine.y), 6 + armed * 3, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#6f4f9e'
    ctx.font = `bold ${11 + armed * 5}px system-ui`
    ctx.textAlign = 'center'
    ctx.fillText('✸', X(mine.x), Y(mine.y) + 4)
    ctx.restore()
  }
  for (const drop of state.loot) {
    if (!visibleAt(drop.x, drop.y)) continue
    const previous = pose?.previousLoot?.get(drop.id)
    const alpha = pose?.alpha ?? 1
    const x = X(previous ? previous.x + (drop.x - previous.x) * alpha : drop.x)
    const y =
      Y(previous ? previous.y + (drop.y - previous.y) * alpha : drop.y) +
      Math.sin(now / 230 + drop.id) * 1.8
    if (drop.heal) {
      // Healing packs expire, so blink during the last three seconds.
      const expiring = drop.expires !== undefined && drop.expires - moving.tick < 3 * FPS
      ctx.globalAlpha = expiring && Math.floor(now / 120) % 2 ? 0.4 : 1
      ellipse(ctx, x, y, 9, 9, '#fff7ed')
      ctx.fillStyle = '#e8759e'
      ctx.font = 'bold 16px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('♥', x, y + 6)
      ctx.globalAlpha = 1
    } else if (drop.shield) {
      ellipse(ctx, x, y, 9, 9, '#e7f7fb')
      ctx.fillStyle = '#3f9db8'
      ctx.font = 'bold 15px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('🛡', x, y + 6)
    } else ctx.drawImage(assets.loot, x - 9, y - 9, 18, 18)
  }
  const orbit = orbitPositions(moving),
    terminalOrbit = evolved(state.gear).includes('orbit')
  if (orbit.length && !pose?.simple) {
    ctx.save()
    ctx.strokeStyle = terminalOrbit ? '#c4a0d380' : '#b6a1ca40'
    ctx.setLineDash([2, 5])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(
      X(moving.position[0]),
      Y(moving.position[1]),
      ((13 + state.gear.orbit * 2) / 0.84) * 3.6,
      (13 + state.gear.orbit * 2) * 4.3,
      0,
      0,
      Math.PI * 2,
    )
    ctx.stroke()
    ctx.restore()
    for (const [x, y] of orbit) {
      ctx.drawImage(assets.notes[terminalOrbit ? 1 : 0], X(x) - 24, Y(y) - 24, 48, 48)
    }
  }
  const deckLevel = state.gear.deck
  if (deckLevel && !pose?.simple) {
    const terminalDeck = evolved(state.gear).includes('deck')
    const blades = terminalDeck ? 4 : 2
    const reach = 24 + deckLevel * 3
    ctx.save()
    ctx.strokeStyle = terminalDeck ? '#9db9c980' : '#9db9c940'
    ctx.setLineDash([3, 6])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(
      X(moving.position[0]),
      Y(moving.position[1]),
      (reach / 0.84) * 3.6,
      reach * 4.3,
      0,
      0,
      Math.PI * 2,
    )
    ctx.stroke()
    ctx.restore()
    for (let index = 0; index < blades; index++) {
      const angle = moving.tick * 0.12 + (index * Math.PI * 2) / blades
      const bx = X(moving.position[0] + (Math.cos(angle) * reach) / 0.84),
        by = Y(moving.position[1] + Math.sin(angle) * reach)
      ctx.save()
      ctx.translate(bx, by)
      ctx.rotate(angle)
      ctx.fillStyle = terminalDeck ? '#cfe3ee' : '#e6eff5'
      ctx.beginPath()
      ctx.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#6f93a8'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.restore()
    }
  }
  drawHero(ctx, moving, now, assets, pose?.character, heroScale(width, height))
  for (const { event, born } of active) {
    if (!visibleAt(event.x, event.y)) continue
    airEffect(ctx, event, (now - born) / 900)
  }
  ctx.restore()
  ctx.save()
  if (state.tick < state.surgeUntil) {
    ctx.strokeStyle = '#efd579'
    ctx.lineWidth = 4 + Math.sin(now / 100)
    ctx.strokeRect(2, 2, width - 4, height - 4)
  }
  const recentHurt = active.find(({ event, born }) => event.kind === 'hurt' && now - born < 220)
  if (recentHurt) {
    ctx.strokeStyle = `rgba(218,73,112,${(1 - (now - recentHurt.born) / 220) * 0.7})`
    ctx.lineWidth = 12
    ctx.strokeRect(0, 0, width, height)
  }
  for (const marker of farmOffscreenMarkers(
    moving.position,
    state.crops.filter((crop) => crop.boss),
    width,
    height,
  )) {
    ctx.save()
    ctx.translate(marker.x, marker.y)
    ctx.rotate(marker.angle)
    ctx.globalAlpha = 0.5 + Math.sin(now / 180) * 0.2
    ctx.fillStyle = '#cf456f'
    ctx.beginPath()
    ctx.moveTo(11, 0)
    ctx.lineTo(-7, 7)
    ctx.lineTo(-7, -7)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    ctx.save()
    ctx.globalAlpha = 0.75
    ctx.fillStyle = '#cf456f'
    ctx.font = '700 9px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('巨兽', marker.x, marker.y + 20)
    ctx.restore()
  }
  const stick = pose?.joystick
  if (stick) {
    // The phone stick is drawn in screen space: base at the press point, knob
    // pulled up to the stick radius so the thumb can feel the direction.
    const world = farmWorldBounds({ left: 0, top: 0, width, height })
    const baseX = world.left + (stick.base[0] / 100) * world.width,
      baseY = world.top + (stick.base[1] / 100) * world.height
    const knobX = world.left + (stick.knob[0] / 100) * world.width,
      knobY = world.top + (stick.knob[1] / 100) * world.height
    const radius = farmStickRadius(world.width, world.height)
    ctx.fillStyle = '#6b5a7d1f'
    ctx.beginPath()
    ctx.arc(baseX, baseY, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#ffffff73'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#fffdf6e6'
    ctx.beginPath()
    ctx.arc(knobX, knobY, radius * 0.46, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#b79ed0cc'
    ctx.stroke()
  }
  ctx.restore()
}

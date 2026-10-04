import { evolved, FPS, orbitPositions, type Crop, type FarmEvent, type FarmState, type Point } from '../../features/farm/rules.mjs'
import { farmCamera, farmVisibleTiles } from '../../features/farm/presentation'

type Effect = { event: FarmEvent; born: number }
export type FarmPose = { character?: HTMLCanvasElement | null; position: Point; tick: number; previousEnemies?: ReadonlyMap<number, { x: number; y: number }>; previousShots?: ReadonlyMap<number, { x: number; y: number }>; previousLoot?: ReadonlyMap<number, { x: number; y: number }>; alpha: number }
type Assets = { garden: HTMLCanvasElement[]; crops: HTMLCanvasElement[]; sprout: HTMLCanvasElement; bunny: HTMLCanvasElement[]; loot: HTMLCanvasElement; notes: HTMLCanvasElement[] }
const cachedAssets = new WeakMap<CanvasRenderingContext2D, Assets>()
const COLORS = ['#f3a0b0', '#f7ab67', '#ed817c', '#f3cd67']
const INK = '#405446'
const X = (value: number) => value * 3.6
const Y = (value: number) => value * 4.3

// Keep the canvas playable in older embedded mobile browsers too.
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.moveTo(x + r, y); ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r); ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height); ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r); ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath()
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string | CanvasGradient) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
}

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number, color = '#6ca57b') {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ellipse(ctx, 0, -size * .6, size * .32, size * .72, color)
  ctx.strokeStyle = '#b7d7a4'
  ctx.lineWidth = .7
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
    } else ellipse(ctx, x + side * 3.5 * scale, y, .9 * scale, 1.25 * scale, INK)
    ellipse(ctx, x + side * 6 * scale, y + 2 * scale, 1.8 * scale, .9 * scale, '#f3a1a180')
  }
  ctx.strokeStyle = INK
  ctx.lineWidth = .8 * scale
  ctx.beginPath()
  ctx.arc(x, y + 2 * scale, 1.6 * scale, .12, Math.PI - .12)
  ctx.stroke()
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, y - size)
  ctx.quadraticCurveTo(x + size * .2, y - size * .2, x + size, y)
  ctx.quadraticCurveTo(x + size * .2, y + size * .2, x, y + size)
  ctx.quadraticCurveTo(x - size * .2, y + size * .2, x - size, y)
  ctx.quadraticCurveTo(x - size * .2, y - size * .2, x, y - size)
  ctx.fill()
}

function garden(ctx: CanvasRenderingContext2D, variant: number) {
  ctx.fillStyle = '#e6e8f5'
  ctx.fillRect(0, 0, 360, 430)
  // A softly lit concert floor, with room to read incoming enemies.
  ctx.strokeStyle = '#beb8d633'; ctx.lineWidth = 1
  for (let x = 0; x <= 360; x += 45) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 430); ctx.stroke() }
  for (let y = 0; y <= 430; y += 43) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(360, y); ctx.stroke() }
  for (const r of [55, 105, 155]) { ctx.beginPath(); ctx.arc(180, 215, r, 0, Math.PI * 2); ctx.stroke() }
  ctx.font = 'bold 76px serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#a79fc21c'; ctx.fillText(['♫', '✦', '♪', '♬'][variant], 180, 242)
  for (let i = 0; i < 12; i++) sparkle(ctx, (i * 79 + 13) % 355, (i * 113 + 25) % 425, 2, '#fffaf3a0')
  // Fixed landmarks belong to world tiles, making travel easy to perceive.
  const color = ['#c1b1d9', '#b8c8d5', '#d5bbc8', '#c5cba9'][variant]
  for (const [x, y] of [[28, 54], [326, 358]]) {
    ctx.fillStyle = '#faf8f078'; ctx.beginPath(); roundedRect(ctx, x - 13, y - 19, 26, 38, 7); ctx.fill()
    ellipse(ctx, x, y + 5, 8, 8, color); ellipse(ctx, x, y + 5, 3, 3, '#faf8f0'); ellipse(ctx, x, y - 10, 3, 3, color)
  }
}

function cropSprite(ctx: CanvasRenderingContext2D, crop: Crop, now: number, tick: number, hit: boolean, assets: Assets) {
  if (crop.hp <= 0) return
  const x = X(crop.x), y = Y(crop.y)
  if (tick < (crop.spawnAt ?? 0)) {
    const progress = 1 - ((crop.spawnAt ?? 0) - tick) / 12
    ctx.save(); ctx.strokeStyle = '#ae8cbc'; ctx.globalAlpha = .35 + Math.max(0, progress) * .4; ctx.lineWidth = 2
    ctx.beginPath(); ctx.ellipse(x, y + 7, 16, 7, 0, 0, Math.PI * 2); ctx.stroke()
    sparkle(ctx, x, y - 3, 4 + Math.max(0, progress) * 5, '#cda1ce'); ctx.restore(); return
  }
  const bob = Math.sin(now / 110 + crop.id * 1.3) * 2
  const wobble = hit ? Math.sin(now / 18) * 2 : 0
  ctx.save()
  ctx.translate(x + wobble, y + bob)
  if (crop.boss) {
    ellipse(ctx, 0, 19, 28, 6, '#5e775b35')
    const glow = ctx.createRadialGradient(0, 0, 5, 0, 0, 38)
    glow.addColorStop(0, '#f5c96b4d')
    glow.addColorStop(1, '#f5c96b00')
    ellipse(ctx, 0, 0, 38, 38, glow)
    ellipse(ctx, -16, 19, 10, 6, '#8880bb')
    ellipse(ctx, 16, 19, 10, 6, '#8880bb')
    ellipse(ctx, 0, 0, 28, 24, '#a299d3')
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#eee4ff'; ctx.beginPath(); ctx.moveTo(side * 15, -17); ctx.lineTo(side * 25, -35); ctx.lineTo(side * 5, -21); ctx.fill()
      ellipse(ctx, side * 10, -3, 5, 7, '#fff9ed'); ellipse(ctx, side * 10, -2, 2.4, 4, INK)
    }
    ctx.fillStyle = '#675687'; ctx.beginPath(); roundedRect(ctx, -9, 9, 18, 6, 3); ctx.fill()
    ctx.fillStyle = '#fffdf3'
    ctx.beginPath()
    roundedRect(ctx, -24, 28, 48, 6, 3)
    ctx.fill()
    ctx.fillStyle = '#e3a44f'
    ctx.beginPath()
    roundedRect(ctx, -23, 29, Math.max(2, 46 * crop.hp / crop.maxHp), 4, 2)
    ctx.fill()
    ctx.font = '600 9px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#846b44'
    ctx.fillText('鼓噪巨兽', 0, -35)
    ctx.restore()
    return
  }
  for (const side of [-1, 1]) ellipse(ctx, side * 7, 13 + Math.sin(now / 100 + side) * 2, 4, 2.5, '#797197')
  if (crop.kind === 2 && (tick + crop.id) % 64 > 48) {
    ctx.strokeStyle = '#e06f91'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 19, 0, Math.PI * 2); ctx.stroke()
  }
  ctx.drawImage(assets.crops[crop.kind], -32, -32, 64, 64)
  ctx.restore()
}

function bunny(ctx: CanvasRenderingContext2D, state: FarmState, now: number, assets: Assets, character?: HTMLCanvasElement | null) {
  const x = X(state.position[0]), y = Y(state.position[1]), ultimate = evolved(state.gear).length > 0
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
      const a = now / 600 + i * Math.PI * 2 / 3
      sparkle(ctx, Math.cos(a) * 24, Math.sin(a) * 9 + 7, 3, '#f7d881')
    }
  }
  if (state.tick < state.hurtUntil && state.tick > 32) ctx.globalAlpha = Math.floor(now / 80) % 2 ? .45 : 1
  if (character) {
    ellipse(ctx, 0, 17, 16, 5, '#70608030')
    ctx.drawImage(character, -40, -52, 80, 80)
  } else ctx.drawImage(assets.bunny[state.tick < state.surgeUntil ? 1 : 0], -40, -40, 80, 80)
  ctx.restore()
}

function cropBody(ctx: CanvasRenderingContext2D, kind: number) {
  ellipse(ctx, 0, 13, 12, 3, '#637b4f26')
  if (kind === 0) {
    // A tiny pink jelly with a musical antenna.
    ctx.fillStyle = '#e8a0c5'; ctx.beginPath(); ctx.moveTo(-13, 10); ctx.bezierCurveTo(-18, -19, 17, -19, 13, 10); ctx.quadraticCurveTo(0, 16, -13, 10); ctx.fill()
    ctx.font = 'bold 13px serif'; ctx.fillStyle = '#9c699b'; ctx.fillText('♪', 1, -10)
  } else if (kind === 1) {
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#b1a0dc'; ctx.beginPath(); ctx.moveTo(side * 5, 0); ctx.lineTo(side * 23, -11); ctx.lineTo(side * 19, 6); ctx.lineTo(side * 10, 4); ctx.fill()
    }
    ellipse(ctx, 0, 0, 9, 12, '#9c8acd')
    for (const side of [-1, 1]) { ctx.fillStyle = '#9c8acd'; ctx.beginPath(); ctx.moveTo(side * 7, -4); ctx.lineTo(side * 8, -19); ctx.lineTo(side, -9); ctx.fill() }
  } else if (kind === 2) {
    ellipse(ctx, 0, 0, 12, 12, '#edaa7d')
    ellipse(ctx, 0, 8, 6, 5, '#bb708c'); ellipse(ctx, 0, 8, 3, 3, '#fff0c8')
    ellipse(ctx, -6, -12, 3, 5, '#f1c68c'); ellipse(ctx, 6, -12, 3, 5, '#f1c68c')
  } else {
    ctx.fillStyle = '#82b6c2'; ctx.beginPath(); roundedRect(ctx, -13, -14, 26, 28, 7); ctx.fill()
    ctx.fillStyle = '#d6ece8'; ctx.beginPath(); roundedRect(ctx, -9, -8, 18, 13, 4); ctx.fill()
    for (const side of [-1, 1]) ellipse(ctx, side * 15, 6, 4, 7, '#6897ac')
    for (let i = -1; i <= 1; i++) ellipse(ctx, i * 4, 10, 1, 1, '#527d93')
  }
  face(ctx, 0, -1)
}

function bunnyBody(ctx: CanvasRenderingContext2D, happy: boolean) {
  ellipse(ctx, 0, 16, 15, 5, '#446a493d')
  ellipse(ctx, -7, 11, 5, 4, '#fff8eb')
  ellipse(ctx, 7, 11, 5, 4, '#fff8eb')
  ellipse(ctx, 0, 5, 13, 13, '#fff8ef')
  ctx.fillStyle = '#79a98c'
  ctx.beginPath()
  roundedRect(ctx, -9, 1, 18, 13, 5)
  ctx.fill()
  ellipse(ctx, 0, 6, 3, 3, '#f5df8d')
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(side * 7, -15)
    ctx.rotate(side * .12)
    ellipse(ctx, 0, -7, 5, 13, '#fff9ee')
    ellipse(ctx, 0, -8, 2, 8, '#edb5ba')
    ctx.restore()
  }
  ellipse(ctx, 0, -7, 15, 13, '#fffaf0')
  // Mint headphones tie the farmer to the musical combat theme.
  ctx.strokeStyle = '#527d66'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(0, -6, 15, Math.PI, 0)
  ctx.stroke()
  for (const side of [-1, 1]) {
    ellipse(ctx, side * 15, -6, 3.7, 5.3, '#648d73')
    ellipse(ctx, side * 15, -6, 1.6, 3.3, '#c5ddba')
  }
  face(ctx, 0, -5, 1.3, happy)
}

function sprite(owner: Document, width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = owner.createElement('canvas')
  canvas.width = width * 2; canvas.height = height * 2
  const ctx = canvas.getContext('2d')!
  ctx.scale(2, 2); paint(ctx)
  return canvas
}

function assetsFor(ctx: CanvasRenderingContext2D): Assets {
  const cached = cachedAssets.get(ctx)
  if (cached) return cached
  const owner = ctx.canvas.ownerDocument
  const assets: Assets = {
    garden: Array.from({ length: 4 }, (_, variant) => sprite(owner, 360, 430, (ctx) => garden(ctx, variant))),
    crops: Array.from({ length: 4 }, (_, kind) => sprite(owner, 64, 64, (ctx) => { ctx.translate(32, 32); cropBody(ctx, kind) })),
    sprout: sprite(owner, 24, 24, (ctx) => { ctx.translate(12, 9); ellipse(ctx, 0, 8, 8, 2, '#7c96652b'); leaf(ctx, 0, 6, -.7, 7, '#91b383'); leaf(ctx, 0, 6, .7, 7, '#a6c493') }),
    bunny: [false, true].map((happy) => sprite(owner, 80, 80, (ctx) => { ctx.translate(40, 40); bunnyBody(ctx, happy) })),
    loot: sprite(owner, 18, 18, (ctx) => { ctx.translate(9, 9); ellipse(ctx, 0, 4, 5, 1.5, '#687c4b1f'); ctx.save(); ctx.translate(-2, 0); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#89c6ab'; ctx.fillRect(-3, -3, 6, 6); ctx.fillStyle = '#daf0cf'; ctx.fillRect(-2, -2, 2, 2); ctx.restore(); ellipse(ctx, 3, 2, 3.5, 3.5, '#ecc765'); ellipse(ctx, 3, 2, 2.1, 2.1, '#ffe4a2') }),
    notes: [false, true].map((terminal) => sprite(owner, 48, 48, (ctx) => { const glow = ctx.createRadialGradient(24, 24, 0, 24, 24, 15); glow.addColorStop(0, '#fff8f1d9'); glow.addColorStop(1, '#cab2dc00'); ellipse(ctx, 24, 24, 15, 15, glow); ctx.font = `800 ${terminal ? 23 : 19}px serif`; ctx.textAlign = 'center'; ctx.fillStyle = terminal ? '#ac73b8' : '#9c83bb'; ctx.fillText(terminal ? '♫' : '♪', 24, 30) })),
  }
  cachedAssets.set(ctx, assets)
  return assets
}

function groundEffect(ctx: CanvasRenderingContext2D, event: FarmEvent, progress: number, now: number) {
  const x = X(event.x), y = Y(event.y), radius = Y(event.radius ?? 15)
  ctx.save()
  if (['pulse', 'blast', 'surge', 'echo', 'slam'].includes(event.kind)) {
    const color = event.kind === 'slam' ? '#e45e87' : event.kind === 'blast' ? '#eda578' : event.kind === 'surge' ? '#efc561' : '#94b0d7'
    const expanding = radius * (.18 + Math.min(1, progress * 1.5) * .82)
    ctx.globalAlpha = (1 - progress) * (event.kind === 'pulse' ? .5 : .8)
    ctx.strokeStyle = color
    ctx.lineWidth = event.kind === 'surge' ? 5 : event.kind === 'blast' ? 2 : 1.8
    ctx.beginPath()
    ctx.arc(x, y, expanding, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha *= .12
    ellipse(ctx, x, y, expanding, expanding, color)
  } else if (event.kind === 'beam') {
    const beamWidth = X(event.radius ?? 5)
    ctx.globalAlpha = (1 - progress) * .65
    const gradient = ctx.createLinearGradient(x - beamWidth, 0, x + beamWidth, 0)
    gradient.addColorStop(0, '#a8b8de00')
    gradient.addColorStop(.45, '#d7deff')
    gradient.addColorStop(.5, '#fffcf2')
    gradient.addColorStop(.55, '#d7deff')
    gradient.addColorStop(1, '#a8b8de00')
    ctx.fillStyle = gradient
    ctx.fillRect(x - beamWidth, y - Y(120), beamWidth * 2, Y(240))
    ctx.strokeStyle = '#789fcaba'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, y - Y(120))
    ctx.lineTo(x, y + Y(120))
    ctx.stroke()
  } else if (event.kind === 'blackhole') {
    ctx.translate(x, y)
    ctx.globalAlpha = (1 - progress) * .55
    const gradient = ctx.createRadialGradient(0, 0, 1, 0, 0, radius)
    gradient.addColorStop(0, '#8670b580')
    gradient.addColorStop(.65, '#b9a8d263')
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
        const angle = t / 7 + i * Math.PI * 2 / 3, r = radius * t / 24
        if (!t) ctx.moveTo(0, 0)
        else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r * .75)
      }
      ctx.stroke()
    }
  }
  ctx.restore()
}

function airEffect(ctx: CanvasRenderingContext2D, event: FarmEvent, progress: number) {
  const x = X(event.x), y = Y(event.y), color = COLORS[event.lane]
  ctx.save()
  if (event.kind === 'hurt' || event.kind === 'heal') {
    ctx.globalAlpha = 1 - progress; ctx.font = '800 17px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = event.kind === 'hurt' ? '#cf476d' : '#3c9c7c'; ctx.strokeStyle = '#fffaf4'; ctx.lineWidth = 3
    const text = `${event.kind === 'hurt' ? '−' : '+'}${event.points}`; ctx.strokeText(text, x, y - 30 - progress * 30); ctx.fillText(text, x, y - 30 - progress * 30)
  } else if (event.kind === 'harvest' || event.kind === 'boss') {
    ctx.globalAlpha = 1 - progress
    for (let i = 0; i < (event.kind === 'boss' ? 9 : 4); i++) {
      const angle = i * 2.4 + event.id * .5, travel = 8 + progress * (event.kind === 'boss' ? 44 : 22)
      sparkle(ctx, x + Math.cos(angle) * travel, y + Math.sin(angle) * travel - progress * 16, 3 * (1 - progress) + 1, i % 2 ? '#fff5cf' : color)
    }
    if (!event.chain || event.id % 4 === 0 || event.kind === 'boss') {
      ctx.font = `800 ${event.kind === 'boss' ? 17 : 11}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.lineWidth = 3
      ctx.strokeStyle = '#fffaf0'
      const text = `+${event.points ?? 0}`, lift = y - 15 - progress * 25
      ctx.strokeText(text, x, lift)
      ctx.fillStyle = event.kind === 'boss' ? '#b58028' : '#688656'
      ctx.fillText(text, x, lift)
    }
  } else if (event.kind === 'rain') {
    const t = Math.min(1, progress * 2), startY = y - 70
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
    ctx.globalAlpha = (1 - progress) * .7
    sparkle(ctx, x + Math.sin(event.id) * 13, y - 10 - progress * 15, 4 * (1 - progress), '#f1cf6c')
  }
  ctx.restore()
}

/** Coordinates are normalized by the simulation; caller owns device pixel ratio. */
export function drawFarm(ctx: CanvasRenderingContext2D, state: FarmState, effects: Effect[], now: number, width: number, height: number, pose?: FarmPose): void {
  if (width <= 0 || height <= 0) return
  const assets = assetsFor(ctx)
  const moving = pose ? { ...state, position: pose.position, tick: pose.tick } : state
  const camera = farmCamera(moving.position, width, height)
  ctx.save()
  ctx.fillStyle = '#e6e8f5'
  ctx.fillRect(0, 0, width, height)
  ctx.translate(camera.x, camera.y)
  ctx.scale(camera.scale, camera.scale)
  for (const tile of farmVisibleTiles(camera)) ctx.drawImage(assets.garden[tile.variant], tile.x, tile.y, 360, 430)
  const visibleAt = (x: number, y: number, margin = 48) => X(x) >= camera.left - margin && X(x) <= camera.right + margin && Y(y) >= camera.top - margin && Y(y) <= camera.bottom + margin
  const active = effects.filter(({ born }) => now - born >= 0 && now - born < 900)
  // Sample dense drum bursts; every important weapon cast still gets its own visual.
  for (const { event, born } of active) {
    if (event.kind === 'blast' && event.id % 3 !== 0) continue
    const duration = event.kind === 'pulse' ? 650 : event.kind === 'blast' ? 450 : 900
    const progress = (now - born) / duration
    if (progress < 1) groundEffect(ctx, event, progress, now)
  }
  const hitIds = new Set(active.filter(({ event, born }) => event.kind === 'hit' && now - born < 140).map(({ event }) => `${event.x}:${event.y}`))
  for (const danger of state.dangers) {
    const progress = Math.max(0, Math.min(1, 1 - (danger.due - moving.tick) / 16))
    ellipse(ctx, X(danger.x), Y(danger.y), Y(danger.radius), Y(danger.radius), '#e2537830')
    ctx.strokeStyle = '#cf456f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(danger.x), Y(danger.y), Y(danger.radius), 0, Math.PI * 2); ctx.stroke()
    ellipse(ctx, X(danger.x), Y(danger.y), Y(danger.radius) * progress, Y(danger.radius) * progress, '#e2537850')
    ctx.fillStyle = '#b2375e'; ctx.font = 'bold 20px system-ui'; ctx.textAlign = 'center'; ctx.fillText('!', X(danger.x), Y(danger.y) + 7)
  }
  for (const crop of state.crops) {
    if (!visibleAt(crop.x, crop.y)) continue
    const before = pose?.previousEnemies?.get(crop.id), alpha = pose?.alpha ?? 1
    const visible = before && Math.hypot(crop.x - before.x, crop.y - before.y) < 15 ? { ...crop, x: before.x + (crop.x - before.x) * alpha, y: before.y + (crop.y - before.y) * alpha } : crop
    cropSprite(ctx, visible, now, moving.tick, hitIds.has(`${crop.x}:${crop.y}`), assets)
  }
  for (const shot of state.shots) {
    if (!visibleAt(shot.x, shot.y)) continue
    const before = pose?.previousShots?.get(shot.id), alpha = pose?.alpha ?? 1
    const x = X(before ? before.x + (shot.x - before.x) * alpha : shot.x), y = Y(before ? before.y + (shot.y - before.y) * alpha : shot.y)
    ellipse(ctx, x, y, 6, 6, '#fff7e8'); ellipse(ctx, x, y, 4.5, 4.5, '#db6289'); ellipse(ctx, x - 1, y - 1, 1.5, 1.5, '#ffc5c0')
  }
  for (const drop of state.loot) {
    if (!visibleAt(drop.x, drop.y)) continue
    const previous = pose?.previousLoot?.get(drop.id)
    const alpha = pose?.alpha ?? 1
    const x = X(previous ? previous.x + (drop.x - previous.x) * alpha : drop.x)
    const y = Y(previous ? previous.y + (drop.y - previous.y) * alpha : drop.y) + Math.sin(now / 230 + drop.id) * 1.8
    if (drop.heal) {
      // Healing packs expire, so blink during the last three seconds.
      const expiring = drop.expires !== undefined && drop.expires - moving.tick < 3 * FPS
      ctx.globalAlpha = expiring && Math.floor(now / 120) % 2 ? .4 : 1
      ellipse(ctx, x, y, 9, 9, '#fff7ed'); ctx.fillStyle = '#e8759e'; ctx.font = 'bold 16px system-ui'; ctx.textAlign = 'center'; ctx.fillText('♥', x, y + 6)
      ctx.globalAlpha = 1
    }
    else ctx.drawImage(assets.loot, x - 9, y - 9, 18, 18)
  }
  const orbit = orbitPositions(moving), terminalOrbit = evolved(state.gear).includes('orbit')
  if (orbit.length) {
    ctx.save()
    ctx.strokeStyle = terminalOrbit ? '#c4a0d380' : '#b6a1ca40'
    ctx.setLineDash([2, 5])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(X(moving.position[0]), Y(moving.position[1]), (13 + state.gear.orbit * 2) / .84 * 3.6, (13 + state.gear.orbit * 2) * 4.3, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
    for (const [x, y] of orbit) {
      ctx.drawImage(assets.notes[terminalOrbit ? 1 : 0], X(x) - 24, Y(y) - 24, 48, 48)
    }
  }
  bunny(ctx, moving, now, assets, pose?.character)
  for (const { event, born } of active) airEffect(ctx, event, (now - born) / 900)
  ctx.restore()
  ctx.save()
  if (state.tick < state.surgeUntil) {
    ctx.strokeStyle = '#efd579'
    ctx.lineWidth = 4 + Math.sin(now / 100)
    ctx.strokeRect(2, 2, width - 4, height - 4)
  }
  const recentHurt = active.find(({ event, born }) => event.kind === 'hurt' && now - born < 220)
  if (recentHurt) { ctx.strokeStyle = `rgba(218,73,112,${(1 - (now - recentHurt.born) / 220) * .7})`; ctx.lineWidth = 12; ctx.strokeRect(0, 0, width, height) }
  ctx.restore()
}

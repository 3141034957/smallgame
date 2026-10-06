export const FARM_GROUND_COLOR = '#dfe8d7'

function oval(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** Painted once per variant, then cached as a world-space tile by the renderer. */
export function paintFarmGround(ctx: CanvasRenderingContext2D, variant: number) {
  ctx.fillStyle = FARM_GROUND_COLOR
  ctx.fillRect(0, 0, 360, 430)

  // All four edges share the same ground color and path endpoints. Local
  // washes fade out before the tile edges, so arbitrary neighbours join.
  const washes = [
    ['#b7d9ce', '#f2e8c7'],
    ['#c4c8e2', '#d5e6c0'],
    ['#e7cdd5', '#c2dcd1'],
    ['#c2d8b5', '#ece4c4'],
  ][variant]
  for (const [index, [x, y, radius]] of [
    [110, 115, 105],
    [255, 310, 100],
  ].entries()) {
    const wash = ctx.createRadialGradient(x, y, 12, x, y, radius)
    wash.addColorStop(0, washes[index])
    wash.addColorStop(1, `${washes[index]}00`)
    ctx.fillStyle = wash
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }

  // A winding garden walk, not a collision wall. Tangents match at the edges.
  const path = () => {
    ctx.beginPath()
    ctx.moveTo(0, 278)
    ctx.bezierCurveTo(80, 278, 91, 182, 180, 205)
    ctx.bezierCurveTo(262, 228, 280, 278, 360, 278)
  }
  ctx.lineCap = 'butt'
  for (const [width, color] of [
    [48, '#bdcbbd'],
    [45, '#edf0de'],
    [33, '#e8e9d5'],
  ] as const) {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    path()
    ctx.stroke()
  }
  ctx.strokeStyle = '#f9f7e7'
  ctx.lineWidth = 1
  ctx.setLineDash([2, 12])
  path()
  ctx.stroke()
  ctx.setLineDash([])

  // Recessed record mosaics keep the music theme in the scenery. Their
  // muted edges are intentionally unlike the bright combat warning rings.
  const cx = 172 + [0, 14, -12, 7][variant],
    cy = 198 + [0, 15, 8, -8][variant]
  oval(ctx, cx, cy + 5, 64, 57, '#91a99524')
  oval(ctx, cx, cy, 64, 57, '#f4f1df')
  oval(ctx, cx, cy, 59, 52, '#e4e6d6')
  ctx.strokeStyle = '#bbc7b680'
  ctx.lineWidth = 0.8
  for (const radius of [25, 32, 39, 46, 53]) {
    ctx.beginPath()
    ctx.ellipse(cx, cy, radius, radius * 0.87, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  oval(ctx, cx, cy, 19, 16.5, ['#d4d2df', '#c3d9d0', '#e4d2cd', '#d6ddbc'][variant])
  oval(ctx, cx, cy, 3, 2.6, '#f8f6e8')
  // Four small inlaid bars suggest an equalizer without reading as pickups.
  ctx.fillStyle = '#91a39465'
  for (let i = 0; i < 4; i++)
    ctx.fillRect(cx - 10 + i * 6, cy + 33 - (i % 3) * 3, 2, 5 + (i % 3) * 3)

  // Seeded details stay attached to the world and never flicker while moving.
  for (let i = 0; i < 44; i++) {
    const x = 15 + ((i * 73 + variant * 29) % 330)
    const y = 16 + ((i * 109 + variant * 47) % 398)
    if (Math.hypot((x - cx) / 1.1, y - cy) < 77 || Math.abs(y - 268) < 43) continue
    if (i % 3 === 0) {
      ctx.strokeStyle = i % 2 ? '#8eac8a66' : '#a4b89880'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(x - 4, y)
      ctx.quadraticCurveTo(x - 4, y - 4, x - 6, y - 6)
      ctx.moveTo(x, y + 1)
      ctx.quadraticCurveTo(x + 1, y - 3, x, y - 7)
      ctx.moveTo(x + 3, y)
      ctx.lineTo(x + 5, y - 4)
      ctx.stroke()
    } else oval(ctx, x, y, 1.5 + (i % 2), 0.9, i % 2 ? '#f7f5dfb0' : '#a8bca44a')
  }

  // Sparse low flower beds frame the open floor; nothing hides a monster.
  for (const [x, y] of [
    [42, 73],
    [305, 356],
  ]) {
    oval(ctx, x, y + 7, 25, 8, '#b3c6ac55')
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.4 + variant * 0.5
      const px = x + Math.cos(angle) * (8 + i),
        py = y + Math.sin(angle) * 8
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(angle)
      oval(ctx, 0, 0, 3, 9, ['#a3bd9e', '#b3c9a6', '#bdc9b4'][i % 3])
      ctx.restore()
    }
    for (let i = 0; i < 3; i++) {
      const px = x - 12 + i * 12,
        py = y - 5 + (i % 2) * 7
      for (let petal = 0; petal < 5; petal++) {
        const angle = (petal * Math.PI * 2) / 5
        oval(
          ctx,
          px + Math.cos(angle) * 3,
          py + Math.sin(angle) * 3,
          2.5,
          2.5,
          variant % 2 ? '#f2e1dc' : '#faf6e1',
        )
      }
      oval(ctx, px, py, 1.8, 1.8, '#cdb879')
    }
  }
}

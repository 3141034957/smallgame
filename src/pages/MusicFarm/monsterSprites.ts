import { MONSTERS } from '@/features/farm/monsters.mjs'

export type MonsterSprites = Map<string, HTMLCanvasElement>
const cache = new WeakMap<Document, MonsterSprites>()

// Decode and downsample once, never scale seven 1024px originals every frame.
export function loadMonsterSprites(owner: Document): MonsterSprites {
  const existing = cache.get(owner)
  if (existing) return existing
  const sprites: MonsterSprites = new Map()
  cache.set(owner, sprites)
  for (const monster of MONSTERS) {
    const image = owner.createElement('img')
    image.onload = () => {
      const canvas = owner.createElement('canvas')
      canvas.width = canvas.height = 192
      const context = canvas.getContext('2d')
      if (!context) return
      const scale = 192 / Math.max(image.naturalWidth, image.naturalHeight)
      const width = image.naturalWidth * scale,
        height = image.naturalHeight * scale
      context.drawImage(image, (192 - width) / 2, (192 - height) / 2, width, height)
      sprites.set(monster.id, canvas)
    }
    // Missing art must never stop simulation or replay; the renderer uses a fallback.
    image.onerror = () => {}
    image.src = monster.image
  }
  return sprites
}

export type WeaponSprites = Map<string, HTMLCanvasElement>
const cache = new WeakMap<Document, WeaponSprites>()
// One artwork per instrument: the flying or bursting moment of its attack.
const SOURCES: Record<string, string> = {
  drum: '/assets/effects/drum.webp',
  orbit: '/assets/effects/orbit.webp',
  power: '/assets/effects/power.webp',
  echo: '/assets/effects/echo.webp',
  bell: '/assets/effects/bell.webp',
  whistle: '/assets/effects/whistle.webp',
  sax: '/assets/effects/sax.webp',
  sampler: '/assets/effects/sampler.webp',
  deck: '/assets/effects/deck.webp',
  synth: '/assets/effects/synth.webp',
}
export const WEAPON_EFFECT_IDS = Object.keys(SOURCES)
// Every instrument has a second, louder artwork for its evolved form.
const EVOLVED = new Set(WEAPON_EFFECT_IDS)
export function weaponEffectSource(id: string, evolved: boolean) {
  return evolved && EVOLVED.has(id) ? `/assets/effects/${id}-evolved.webp` : SOURCES[id]
}

// Decode and downsample once, never scale ten originals every frame.
export function loadWeaponEffects(owner: Document): WeaponSprites {
  const existing = cache.get(owner)
  if (existing) return existing
  const sprites: WeaponSprites = new Map()
  cache.set(owner, sprites)
  for (const id of WEAPON_EFFECT_IDS) {
    for (const evolved of [false, true]) {
      const image = owner.createElement('img')
      image.onload = () => {
        const canvas = owner.createElement('canvas')
        canvas.width = canvas.height = 96
        const context = canvas.getContext('2d')
        if (!context) return
        const scale = 96 / Math.max(image.naturalWidth, image.naturalHeight)
        const width = image.naturalWidth * scale,
          height = image.naturalHeight * scale
        context.drawImage(image, (96 - width) / 2, (96 - height) / 2, width, height)
        sprites.set(evolved ? `${id}-evolved` : id, canvas)
      }
      // Missing art must never stop the frame: the renderer keeps its shapes.
      image.onerror = () => {}
      image.src = weaponEffectSource(id, evolved)
    }
  }
  return sprites
}

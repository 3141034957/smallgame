import { FARM_CHARACTERS } from '@/features/farm/characters'

const sprites = new Map<string, Promise<HTMLCanvasElement>>()

export function loadFarmCharacterSprite(id: string): Promise<HTMLCanvasElement> {
  const cached = sprites.get(id)
  if (cached) return cached
  const character = FARM_CHARACTERS.find((item) => item.id === id)
  if (!character) return Promise.reject(new Error('Unknown character'))
  const promise = new Promise<HTMLCanvasElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 160; canvas.height = 160
      const context = canvas.getContext('2d')
      if (!context) { reject(new Error('Canvas unavailable')); return }
      const scale = Math.min(128 / image.naturalWidth, 140 / image.naturalHeight)
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale
      context.drawImage(image, (160 - width) / 2, 144 - height, width, height)
      resolve(canvas)
    }
    image.onerror = () => { sprites.delete(id); reject(new Error('Character image unavailable')) }
    image.src = character.image
  })
  sprites.set(id, promise)
  return promise
}

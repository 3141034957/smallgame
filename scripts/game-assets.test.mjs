import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { BAND_CHARACTERS } from '../src/features/farm/characterRoster.mjs'
import { MONSTERS } from '../src/features/farm/monsters.mjs'

it('keeps every original sprite dimension and limits shipped art to a quarter of the PNG source size', () => {
  let sourceBytes = 0,
    shippedBytes = 0
  for (const { image } of [...BAND_CHARACTERS, ...MONSTERS]) {
    const relative = image.replace(/^\.\/assets\//, '')
    const original = readFileSync(resolve('design-assets', relative.replace(/\.webp$/, '.png')))
    const webp = readFileSync(resolve('public/assets', relative))
    expect(webp.subarray(8, 16).toString()).toBe('WEBPVP8X')
    expect(webp.readUIntLE(24, 3) + 1).toBe(original.readUInt32BE(16))
    expect(webp.readUIntLE(27, 3) + 1).toBe(original.readUInt32BE(20))
    expect(webp.readUInt32LE(4) + 8).toBe(webp.length)
    sourceBytes += original.length
    shippedBytes += webp.length
  }
  expect(shippedBytes).toBeLessThan(sourceBytes / 4)
})

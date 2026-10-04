import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FARM_CHARACTERS } from './characters'

describe('survivor character assets', () => {
  it('ships seven real PNG images', () => {
    expect(FARM_CHARACTERS).toHaveLength(7)
    for (const character of FARM_CHARACTERS) {
      const path = resolve('public', character.image.replace(/^\.\//, ''))
      expect(existsSync(path)).toBe(true)
      expect(readFileSync(path).subarray(1, 4).toString()).toBe('PNG')
    }
  })
})

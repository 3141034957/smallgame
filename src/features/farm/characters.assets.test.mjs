import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FARM_CHARACTERS } from './characters'
import { TALENTS } from './rules.mjs'

describe('survivor character assets', () => {
  it('binds each poster animal to its matching instrument and unique member identity', () => {
    const expected = [
      ['bear-drums', '鼓手咚咚', 'drum', 'bear'],
      ['cat-guitar', '吉他手弦弦', 'orbit', 'cat'],
      ['lion-bass', '贝斯手阿低', 'power', 'lion'],
      ['bird-vocals', '主唱啾啾', 'echo', 'bird'],
      ['crocodile-beat', '节拍鳄小绿', 'sampler', 'crocodile'],
      ['hamster-keys', '键盘手叮当', 'bell', 'hamster'],
      ['rabbit-flute', '长笛手呼呼', 'whistle', 'rabbit'],
      ['fox-sax', '萨克斯阿鸣', 'sax', 'fox'],
      ['robot-dj', '打碟机哔哔', 'deck', 'robot'],
    ]
    expect(new Set(FARM_CHARACTERS.map((item) => item.talentId)).size).toBe(9)
    expect(TALENTS.filter((item) => item.characterId)).toHaveLength(9)
    for (const [id, name, talentId, animal] of expected) {
      const character = FARM_CHARACTERS.find((item) => item.id === id)
      expect(character).toMatchObject({
        name,
        talentId,
        image: `./assets/band-lineup/${animal}.png`,
      })
      expect(TALENTS.find((item) => item.id === talentId)).toMatchObject({ name, characterId: id })
    }
    expect(TALENTS.find((item) => item.id === 'synth').characterId).toBeUndefined()
  })
  it('ships nine real PNG images', () => {
    expect(FARM_CHARACTERS).toHaveLength(9)
    for (const character of FARM_CHARACTERS) {
      const path = resolve('public', character.image.replace(/^\.\//, ''))
      expect(existsSync(path)).toBe(true)
      expect(readFileSync(path).subarray(1, 4).toString()).toBe('PNG')
    }
  })
})

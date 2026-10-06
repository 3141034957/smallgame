import { BAND_CHARACTERS } from './characterRoster.mjs'
export { DEFAULT_CHARACTER_ID } from './characterRoster.mjs'

export interface Character {
  id: string
  name: string
  desc: string
  price: number
  image: string
  colors: { head: string; body: string; eye: string; foot: string; antenna: string; glow: string }
}

export const CHARACTERS: Character[] = BAND_CHARACTERS.map((character) => ({
  id: character.id,
  name: character.name,
  desc: character.desc,
  price: 1,
  image: character.image,
  colors: {
    head: character.color,
    body: character.color,
    eye: '#59483e',
    foot: character.color,
    antenna: character.color,
    glow: character.color + '99',
  },
}))

import { CHARACTERS } from './catalog'
import { loadLegacyProfile, saveLegacyProfile } from '@/utils/legacyProfile'

export const getUnlocks = () => loadLegacyProfile().unlocks
export const getSelected = () => loadLegacyProfile().selected

export function selectCharacter(id: string) {
  const profile = loadLegacyProfile()
  if (!profile.unlocks.includes(id)) throw new Error('请先解锁这个角色。')
  return saveLegacyProfile({ ...profile, selected: id })
}

export function buyCharacter(id: string) {
  const character = CHARACTERS.find((character) => character.id === id)
  if (!character) throw new Error('这个角色暂不可用。')
  const profile = loadLegacyProfile()
  if (profile.unlocks.includes(id)) return selectCharacter(id)
  if (profile.stars < character.price)
    throw new Error(`星星不足！还需 ${character.price - profile.stars} 颗`)
  return saveLegacyProfile({
    stars: profile.stars - character.price,
    unlocks: [...profile.unlocks, id],
    selected: id,
  })
}

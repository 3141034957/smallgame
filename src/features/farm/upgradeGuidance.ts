import { MAX_EQUIPPED, TALENTS, type Gear, type TalentId, type UpgradeId } from './rules.mjs'
import { SCHOOLS } from './schools.mjs'

type GearKind = 'weapon' | 'chip'

export type BlockedSchool = {
  id: string
  name: string
  missingId: TalentId
  missingName: string
  missingKind: GearKind
}

export type UpgradeGuidance = {
  partner: { id: TalentId; name: string; level: number } | null
  completesPair: boolean
  blockedSchools: BlockedSchool[]
}

const carried = (gear: Gear, kind: GearKind) =>
  TALENTS.filter((talent) => talent.kind === kind && gear[talent.id] > 0).length

// Describe only the consequences of this pick. Existing upgrades never consume
// another slot, and a school already blocked before this pick is not a new loss.
export function upgradeGuidance(gear: Gear, id: UpgradeId): UpgradeGuidance {
  const talent = TALENTS.find((entry) => entry.id === id)
  const result: UpgradeGuidance = { partner: null, completesPair: false, blockedSchools: [] }
  if (!talent) return result

  const partner = TALENTS.find((entry) => entry.id === talent.partner)!
  if (gear[partner.id] > 0) {
    result.partner = { id: partner.id, name: partner.name, level: gear[partner.id] }
    result.completesPair = gear[talent.id] === 0
  }
  if (gear[talent.id] > 0) return result

  const nextGear = { ...gear, [talent.id]: 1 }
  const before = { weapon: carried(gear, 'weapon'), chip: carried(gear, 'chip') }
  const after = { ...before, [talent.kind]: before[talent.kind] + 1 }

  for (const school of SCHOOLS) {
    if (nextGear[school.weapon] === 0 && nextGear[school.chip] === 0) continue
    if (nextGear[school.weapon] > 0 && nextGear[school.chip] > 0) continue

    const missingKind = nextGear[school.weapon] === 0 ? 'weapon' : 'chip'
    const wasStarted = gear[school.weapon] > 0 || gear[school.chip] > 0
    if (after[missingKind] < MAX_EQUIPPED) continue
    if (wasStarted && before[missingKind] >= MAX_EQUIPPED) continue

    result.blockedSchools.push({
      id: school.id,
      name: school.name,
      missingId: missingKind === 'weapon' ? school.weapon : school.chip,
      missingName: missingKind === 'weapon' ? school.weaponName : school.chipName,
      missingKind,
    })
  }
  return result
}

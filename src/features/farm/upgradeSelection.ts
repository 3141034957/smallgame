import { chooseTalent, type Choice, type FarmState, type UpgradeId } from './rules.mjs'

// Record automatic picks just like clicks, so replay uses the same choices and RNG.
export function selectFarmUpgrade(previous: FarmState, id: UpgradeId) {
  let state = chooseTalent(previous, id)
  if (!state) return null
  const choices: Choice[] = [{ tick: previous.tick, id }]
  while (state.offered.length === 1) {
    const only = state.offered[0]
    const next = chooseTalent(state, only)
    if (!next) return null
    choices.push({ tick: state.tick, id: only })
    state = next
  }
  return { state, choices }
}

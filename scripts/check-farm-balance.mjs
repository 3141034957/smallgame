import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { FPS, MAX_GEAR_LEVEL, RECIPES, chooseTalent, clampPoint, createFarm, evolved, farmModifier, stepFarm } from '../src/features/farm/rules.mjs'

// Deterministic moving player: no invulnerability, injected XP or free gear.
export function simulateFarm(day, focus = 'echo', dodge = true, seconds = 300) {
  let state = createFarm(day)
  const upgrades = [], snapshots = {}, evolutions = []
  const recipe = RECIPES.find((item) => item.weapon === focus)
  for (let tick = 0; tick < FPS * seconds && state.hp > 0; tick++) {
    while (state.offered.length) {
      const id = state.offered.includes(focus) && state.gear[focus] < MAX_GEAR_LEVEL ? focus
        : state.offered.includes(recipe.chip) && state.gear[recipe.chip] < MAX_GEAR_LEVEL ? recipe.chip : state.offered[0]
      state = chooseTalent(state, id)
      upgrades.push(tick / FPS)
      for (const form of evolved(state.gear)) if (!evolutions.some((item) => item.form === form)) evolutions.push({ form, seconds: tick / FPS })
    }
    let target = [50 + 30 * Math.sin(tick / 50), 50 + 25 * Math.cos(tick / 75)]
    if (dodge) {
      let closest = null, nearest = 26
      for (const enemy of state.crops) {
        if (enemy.hp <= 0) continue
        const distance = Math.hypot((enemy.x - state.position[0]) * .84, enemy.y - state.position[1])
        if (distance < nearest) { closest = enemy; nearest = distance }
      }
      if (closest) target = [state.position[0] + (state.position[0] - closest.x) * 2, state.position[1] + (state.position[1] - closest.y) * 2]
    }
    state = stepFarm(state, clampPoint(state.position, target), state.charge === 100).state
    if ([30, 60, 120, 180, 300].includes(state.tick / FPS)) snapshots[state.tick / FPS] = state.level
  }
  return { day, modifier: state.modifier, focus, dodge, seconds: state.tick / FPS, level: state.level, xp: state.xp, harvested: state.harvested, upgrades, evolutions, snapshots }
}

export function modifierDays() {
  const days = new Map()
  for (let date = 1; date <= 31; date++) {
    const day = `2026-10-${String(date).padStart(2, '0')}`
    if (!days.has(farmModifier(day).id)) days.set(farmModifier(day).id, day)
  }
  return [...days.values()]
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = modifierDays().flatMap((day) => RECIPES.map(({ weapon }) => simulateFarm(day, weapon)))
  const range = (values) => ({ min: Math.min(...values), median: [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)], max: Math.max(...values) })
  console.log(JSON.stringify({
    simulationLimitSeconds: 300,
    runs: results.length,
    firstUpgradeSeconds: range(results.map((run) => run.upgrades[0])),
    firstEvolutionSeconds: range(results.filter((run) => run.evolutions.length).map((run) => run.evolutions[0].seconds)),
    evolvedRuns: results.filter((run) => run.evolutions.length).length,
    survivalSeconds: range(results.map((run) => run.seconds)),
    finalLevel: range(results.map((run) => run.level)),
    wanderingResults: modifierDays().map((day) => simulateFarm(day, 'echo', false)),
    results,
  }, null, 2))
}

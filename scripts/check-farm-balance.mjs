import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { PERMANENT_UPGRADES } from '../src/features/farm/permanent.mjs'
import {
  FPS,
  MAX_GEAR_LEVEL,
  RECIPES,
  TALENTS,
  chooseTalent,
  clampPoint,
  createFarm,
  evolved,
  farmModifier,
  farmMoveStep,
  stepFarm,
} from '../src/features/farm/rules.mjs'

// Deterministic player: no invulnerability, injected XP or free gear.
export function simulateFarm(
  day,
  focus = 'echo',
  dodge = true,
  seconds = 300,
  startHolding = false,
  permanent = {},
  movement = dodge ? 'dodge' : 'wander',
) {
  let state = createFarm(day, permanent)
  // The opening deal is random, so a check that wants one exact build can start
  // the run already holding that instrument.
  if (startHolding) {
    state.gear[focus] = 1
    state.level = 1
  }
  const upgrades = [],
    snapshots = {},
    evolutions = []
  let recipe = RECIPES.find((item) => item.weapon === focus)
  let healing = 0,
    fullHealCards = 0,
    cardHealing = 0,
    damage = 0,
    blockedHits = 0
  // Ten instruments mean the opening deal may not contain the requested one:
  // like a real player, the run commits to whichever instrument it started.
  const committed = () => {
    if (state.gear[recipe.weapon] > 0) return recipe
    const best = TALENTS.filter((talent) => talent.kind === 'weapon').sort(
      (a, b) => state.gear[b.id] - state.gear[a.id],
    )[0]
    return RECIPES.find((item) => item.weapon === best.id)
  }
  for (let tick = 0; tick < FPS * seconds && state.hp > 0; tick++) {
    while (state.offered.length) {
      recipe = committed()
      const chip = recipe.chip
      const id =
        state.offered.includes(recipe.weapon) && state.gear[recipe.weapon] < MAX_GEAR_LEVEL
          ? recipe.weapon
          : state.offered.includes(chip) && state.gear[chip] < MAX_GEAR_LEVEL
            ? chip
            : (state.offered.find(
                (choice) => TALENTS.find((talent) => talent.id === choice)?.kind === 'weapon',
              ) ?? state.offered[0])
      const hp = state.hp
      state = chooseTalent(state, id)
      if (id === 'heal') {
        fullHealCards++
        cardHealing += state.hp - hp
      }
      upgrades.push(tick / FPS)
      for (const form of evolved(state.gear))
        if (!evolutions.some((item) => item.form === form))
          evolutions.push({ form, seconds: tick / FPS })
    }
    let target = [50 + 30 * Math.sin(tick / 50), 50 + 25 * Math.cos(tick / 75)]
    if (movement === 'stand') target = state.position
    if (movement === 'dodge') {
      let closest = null,
        nearest = 26
      for (const enemy of state.crops) {
        if (enemy.hp <= 0) continue
        const distance = Math.hypot(
          (enemy.x - state.position[0]) * 0.84,
          enemy.y - state.position[1],
        )
        if (distance < nearest) {
          closest = enemy
          nearest = distance
        }
      }
      if (closest)
        target = [
          state.position[0] + (state.position[0] - closest.x) * 2,
          state.position[1] + (state.position[1] - closest.y) * 2,
        ]
    }
    const result = stepFarm(
      state,
      clampPoint(state.position, target, farmMoveStep(state)),
      state.charge === 100,
    )
    state = result.state
    for (const event of result.events) {
      if (event.kind === 'heal') healing += event.points
      if (event.kind === 'hurt') damage += event.points
      if (event.kind === 'shield') blockedHits++
    }
    if ([30, 60, 120, 180, 300].includes(state.tick / FPS))
      snapshots[state.tick / FPS] = state.level
  }
  return {
    day,
    modifier: state.modifier,
    focus,
    dodge,
    movement,
    survivedLimit: state.hp > 0,
    hp: state.hp,
    healing: Math.round(healing * 100) / 100,
    fullHealCards,
    cardHealing: Math.round(cardHealing * 100) / 100,
    damage: Math.round(damage * 100) / 100,
    blockedHits,
    seconds: state.tick / FPS,
    level: state.level,
    xp: state.xp,
    harvested: state.harvested,
    coins: state.coins,
    upgrades,
    evolutions,
    snapshots,
  }
}

export function modifierDays() {
  const days = new Map()
  for (let date = 1; date <= 31; date++) {
    const day = `2026-10-${String(date).padStart(2, '0')}`
    if (!days.has(farmModifier(day).id)) days.set(farmModifier(day).id, day)
  }
  return [...days.values()]
}

// Standing still still permits automatic attacks, upgrades and surges.
// Reaching the time limit is censored data, never reported as a death.
export function checkRecoveryBalance() {
  const profiles = {
    base: {},
    low: { vitality: 3, armor: 1, regen: 1, shield: 1 },
    full: Object.fromEntries(PERMANENT_UPGRADES.map(({ id, max }) => [id, max])),
  }
  const runs = ['stand', 'wander', 'dodge'].flatMap((movement) =>
    Object.entries(profiles).flatMap(([profile, levels]) =>
      modifierDays().map((day) => ({
        profile,
        ...simulateFarm(day, 'echo', movement === 'dodge', 600, false, levels, movement),
      })),
    ),
  )
  const longStandingRuns = modifierDays().map((day) =>
    simulateFarm(day, 'echo', false, 1800, false, profiles.full, 'stand'),
  )
  return { simulationLimitSeconds: 600, runs, longStandingLimitSeconds: 1800, longStandingRuns }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--recovery')) {
    console.log(JSON.stringify(checkRecoveryBalance(), null, 2))
  } else {
    const results = modifierDays().flatMap((day) =>
      RECIPES.map(({ weapon }) => simulateFarm(day, weapon)),
    )
    const range = (values) => ({
      min: Math.min(...values),
      median: [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)],
      max: Math.max(...values),
    })
    console.log(
      JSON.stringify(
        {
          simulationLimitSeconds: 300,
          runs: results.length,
          firstUpgradeSeconds: range(results.map((run) => run.upgrades[0])),
          firstEvolutionSeconds: range(
            results.filter((run) => run.evolutions.length).map((run) => run.evolutions[0].seconds),
          ),
          evolvedRuns: results.filter((run) => run.evolutions.length).length,
          survivalSeconds: range(results.map((run) => run.seconds)),
          finalLevel: range(results.map((run) => run.level)),
          collectedCoins: range(results.map((run) => run.coins)),
          wanderingResults: modifierDays().map((day) => simulateFarm(day, 'echo', false)),
          results,
        },
        null,
        2,
      ),
    )
  }
}

import {
  accountStorage,
  ACCOUNT_SAVE_EVENT,
  activeAccountId,
  GUEST_SAVE_KEY,
  isDailyBestKey,
} from '@/utils/accountStorage'
import { farmBestKey } from '@/features/farm/monsters.mjs'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  advanceFarmPosition,
  farmBossCountdown,
  farmPointerTarget,
  farmSurgeStatus,
  farmWorldBounds,
  formatFarmTime,
} from '@/features/farm/presentation'
import { bindFarmControls, type FarmStick } from '@/features/farm/controls'
import { FarmAudio } from '@/features/farm/audio'
import {
  clampPoint,
  createFarm,
  evolved,
  farmModifier,
  finishFarm,
  FPS,
  farmMoveStep,
  MOVE_STEP,
  RECIPES,
  stepFarm,
  farmUpgradeXp,
  farmXpThreshold,
  UPGRADE_CARDS,
  todayRoute,
  validDay,
} from '@/features/farm/rules.mjs'
import type { Choice, FarmEvent, FarmRound, Point, UpgradeId } from '@/features/farm/rules.mjs'
import { selectFarmUpgrade } from '@/features/farm/upgradeSelection'
import { AUTH_FORM_EVENT } from '@/features/auth/context'
import { drawFarm } from './render'
import { FarmBoard } from './FarmBoard'
import { CharacterShop } from './CharacterShop'
import { PermanentTree } from './PermanentTree'
import { RECOVERY, permanentStats } from '@/features/farm/permanent.mjs'
import { loadFarmCharacterSprite } from './characterSprite'
import {
  awardFarmCoins,
  FARM_CHARACTERS,
  FARM_PROFILE_KEY,
  loadFarmProfile,
} from '@/features/farm/characters'
import {
  claimFarmAchievements,
  FARM_ACHIEVEMENTS,
  loadFarmAchievements,
  type FarmAchievementLog,
} from '@/features/farm/achievements'
import { loadFarmCareer, recordFarmCareer, type FarmCareer } from '@/features/farm/stats'
import {
  farmTimelineSample,
  FARM_SAMPLE_EVERY,
  FARM_SAMPLE_LIMIT,
  type FarmSample,
} from '@/features/farm/timeline'
import { FARM_HELP_SEEN_KEY } from '@/features/farm/help'
import { loadFarmSettings, saveFarmSettings, type FarmSettings } from '@/features/farm/settings'
import { FARM_TOO_LONG_MESSAGE, farmShareText, farmTooLongToSubmit } from '@/features/farm/share'
import { RunTimeline } from './RunTimeline'
import { BadgeWall } from './BadgeWall'
import { QuestList } from './QuestList'
import { BuildSummary } from './BuildSummary'
import { UpgradeChoices } from './UpgradeChoices'
import { FarmHelp } from './FarmHelp'
import { loadBestScore, saveBestScore } from '@/utils/localScores'
import {
  applyFarmQuests,
  farmQuests,
  loadFarmQuests,
  type FarmQuestLog,
} from '@/features/farm/quests'
import './style.css'

type Phase = 'ready' | 'play' | 'result'
type Panel = 'help' | 'board' | 'pause' | 'shop' | 'growth' | 'badges' | null
const talent = (id: UpgradeId) => UPGRADE_CARDS.find((item) => item.id === id)!
const number = (value: number) => value.toLocaleString()
// Cloud progress is stored per account, so another tab of the same account
// writes this key instead of the legacy local ones.
const accountSaveKey = (id: string) => `farm-account-save-v1:${id}`

export default function MusicFarm() {
  const [params] = useSearchParams()
  const day = validDay(params.get('day')) ? params.get('day')! : todayRoute()
  const [initial] = useState(() => createFarm(day, loadFarmProfile().growth?.levels))
  const dayRef = useRef(day)
  dayRef.current = day
  const model = useRef(initial)
  const [view, setView] = useState(model.current)
  const [inputMode, setInputMode] = useState<'touch' | 'mouse'>(() =>
    window.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'mouse',
  )
  const inputModeRef = useRef(inputMode)
  const showPerformance = params.get('stats') === '1'
  const [performanceView, setPerformanceView] = useState({ fps: 0, drawMs: '0', moves: 0 })
  const [phase, setPhase] = useState<Phase>('ready')
  const phaseRef = useRef<Phase>('ready')
  const [panel, setPanel] = useState<Panel>(null)
  const panelRef = useRef<Panel>(null)
  const [round, setRound] = useState<FarmRound | null>(null)
  const [profile, setProfile] = useState(loadFarmProfile)
  const character = FARM_CHARACTERS.find((item) => item.id === profile.selected)!
  const modifier = farmModifier(day)
  const bossesAlive = view.crops.filter((crop) => crop.boss).length
  const growthStats = permanentStats(view.permanent)
  // A spent surge locks the button for a few seconds, so the HUD has to show
  // the wait instead of staying lit up and swallowing the next tap.
  const surgeStatus = farmSurgeStatus(view)
  const safeSeconds = Math.max(
    0,
    Math.ceil((FPS * RECOVERY.safeSeconds - (view.tick - view.lastHit)) / FPS),
  )
  const heroSprite = useRef<HTMLCanvasElement | null>(null)
  const [heroError, setHeroError] = useState(false)
  const [rewardError, setRewardError] = useState('')
  const [badges, setBadges] = useState<FarmAchievementLog>(loadFarmAchievements)
  const [freshBadges, setFreshBadges] = useState<string[]>([])
  const [badgeError, setBadgeError] = useState('')
  const [goalError, setGoalError] = useState('')
  const [career, setCareer] = useState<FarmCareer>(loadFarmCareer)
  const [careerRecords, setCareerRecords] = useState({ score: false, seconds: false, combo: false })
  const [timeline, setTimeline] = useState<FarmSample[]>([])
  const samples = useRef<FarmSample[]>([])
  const [evolutionTicks, setEvolutionTicks] = useState<number[]>([])
  const [settings, setSettings] = useState<FarmSettings>(loadFarmSettings)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settingsRef = useRef(settings)
  const [quests, setQuests] = useState<FarmQuestLog>(() => loadFarmQuests(day))
  const [freshQuests, setFreshQuests] = useState<string[]>([])
  const todayQuests = farmQuests(day)
  const evolutionMarks = useRef<number[]>([])
  const runId = useRef('')
  const [muted, setMuted] = useState(false)
  const [audioError, setAudioError] = useState(false)
  const [celebration, setCelebration] = useState('')
  const [notice, setNotice] = useState('')
  const [best, setBest] = useState(() => loadBestScore(farmBestKey(day)))
  // Only a finished run writes the record back; the mounted value is already stored.
  const bestRecorded = useRef(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const page = useRef<HTMLDivElement>(null)
  const modal = useRef<HTMLElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const field = useRef<HTMLDivElement>(null)
  const audio = useRef<FarmAudio | null>(null)
  const pointerTarget = useRef<Point | null>(null)
  const stick = useRef<FarmStick | null>(null)
  const desired = useRef<Point>([...model.current.position])
  const displayPosition = useRef<Point>([...model.current.position])
  const controls = useRef<ReturnType<typeof bindFarmControls> | null>(null)
  const logs = useRef<{ frames: Point[]; choices: Choice[]; surges: number[] }>({
    frames: [],
    choices: [],
    surges: [],
  })
  const effects = useRef<{ event: FarmEvent; born: number }[]>([])
  const surge = useRef(false)
  const keys = useRef(new Set<string>())
  const audioSerial = useRef(0)
  const celebrationUntil = useRef(0)
  const noticeUntil = useRef(0)
  // A dialog owns the back gesture: without a placeholder history entry the
  // mobile back button leaves the page and the running round is lost.
  const dialogHistory = useRef(false)
  const dropDialogHistory = (consumeEntry: boolean) => {
    if (!dialogHistory.current) return
    dialogHistory.current = false
    if (consumeEntry) window.history.back()
  }
  const pushDialogHistory = () => {
    if (dialogHistory.current) return
    window.history.pushState({ farmDialog: true }, '')
    dialogHistory.current = true
  }
  const openPanel = (next: Panel) => {
    keys.current.clear()
    controls.current?.reset()
    previousFocus.current = document.activeElement as HTMLElement
    panelRef.current = next
    setPanel(next)
    pushDialogHistory()
    audio.current?.stop()
    audioSerial.current++
  }
  const prepare = async (nextMuted = muted) => {
    const serial = ++audioSerial.current
    if (!audio.current) audio.current = new FarmAudio()
    const ok = await audio.current.prepare()
    if (serial !== audioSerial.current) return
    setAudioError(!ok)
    audio.current.setMuted(nextMuted)
  }
  const dismissPanel = (fromHistory: boolean) => {
    dropDialogHistory(!fromHistory)
    panelRef.current = null
    setPanel(null)
    if (phaseRef.current === 'play') void prepare()
  }
  const closePanel = () => dismissPanel(false)
  const dismissPanelRef = useRef(dismissPanel)
  dismissPanelRef.current = dismissPanel
  useEffect(() => {
    // The back gesture closes the dialog instead of leaving the page.
    const onPopState = () => {
      if (dialogHistory.current) dismissPanelRef.current(true)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  const initializeBattle = () => {
    const latest = loadFarmProfile()
    setProfile(latest)
    model.current = createFarm(dayRef.current, latest.growth?.levels)
    desired.current = [...model.current.position]
    displayPosition.current = [...model.current.position]
    controls.current?.reset()
    logs.current = { frames: [], choices: [], surges: [] }
    effects.current = []
    surge.current = false
    keys.current.clear()
    setView(model.current)
  }
  const start = () => {
    initializeBattle()
    samples.current = []
    setTimeline([])
    evolutionMarks.current = []
    setEvolutionTicks([])
    const random = new Uint32Array(2)
    crypto.getRandomValues(random)
    runId.current = `farm_${Date.now()}_${random.join('_')}`
    phaseRef.current = 'play'
    setPhase('play') // The daily modifier left the start card, so the run announces itself.
    setNotice(`今日词缀 ${modifier.icon} ${modifier.name}：${modifier.desc}`)
    noticeUntil.current = performance.now() + 3400
    void prepare()
    field.current?.focus({ preventScroll: true })
  }
  const restart = () => {
    audio.current?.stop()
    audioSerial.current++
    initializeBattle()
    setRound(null)
    setRewardError('')
    setFreshBadges([])
    setBadgeError('')
    setCareerRecords({ score: false, seconds: false, combo: false })
    setFreshQuests([])
    setGoalError('')
    samples.current = []
    setTimeline([])
    evolutionMarks.current = []
    setEvolutionTicks([])
    setCelebration('')
    setNotice('')
    celebrationUntil.current = 0
    noticeUntil.current = 0
    dropDialogHistory(true)
    panelRef.current = null
    setPanel(null)
    phaseRef.current = 'ready'
    setPhase('ready')
    page.current?.scrollIntoView?.({ block: 'start' })
  }
  const restartRef = useRef(restart)
  restartRef.current = restart
  const claimReward = () => {
    if (!round) return
    // Retry both payouts: a quota failure can hide either one.
    const reward = awardFarmCoins(runId.current, round.coins)
    setProfile(reward.profile)
    setRewardError(reward.error ?? '')
    const goals = applyFarmQuests(day, round, runId.current)
    setQuests(goals.log)
    setFreshQuests((current) => [...new Set([...current, ...goals.completed])])
    setGoalError(goals.error ?? '')
    if (goals.completed.length) setProfile(loadFarmProfile())
  }
  useEffect(() => {
    let cancelled = false
    heroSprite.current = null
    setHeroError(false)
    void loadFarmCharacterSprite(profile.selected)
      .then((sprite) => {
        if (!cancelled) heroSprite.current = sprite
      })
      .catch(() => {
        if (!cancelled) setHeroError(true)
      })
    return () => {
      cancelled = true
    }
  }, [profile.selected])
  // First visit: show the rules straight away instead of hiding them behind "?".
  useEffect(() => {
    let seen = true
    try {
      seen = accountStorage.getItem(FARM_HELP_SEEN_KEY) === '1'
    } catch {
      seen = true
    }
    if (seen) return
    try {
      accountStorage.setItem(FARM_HELP_SEEN_KEY, '1')
    } catch {
      /* Storage optional. */
    }
    openPanel('help')
  }, [])
  // A hand-edited ?day= must not leave the run on another day's seed: the
  // leaderboard would reject the score because the replay would not match.
  useEffect(() => {
    if (model.current.day === day) return
    setQuests(loadFarmQuests(day))
    setFreshQuests([])
    bestRecorded.current = false
    setBest(loadBestScore(farmBestKey(day)))
    restartRef.current()
  }, [day])
  // Persisting outside the updater: StrictMode calls updaters twice, which
  // would store the same record twice and mark the save dirty for no reason.
  useEffect(() => {
    if (!bestRecorded.current) return
    saveBestScore(farmBestKey(day), best)
  }, [best, day])
  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    },
    [],
  )
  useEffect(() => {
    const sync = () => setProfile(loadFarmProfile())
    const onStorage = (event: StorageEvent) => {
      const owner = activeAccountId()
      if (
        !event.key ||
        event.key === FARM_PROFILE_KEY ||
        event.key === 'character-unlocks-v1' ||
        // Guest progress is a separate blob, so another tab's run only shows
        // up here when its own key is watched.
        event.key === GUEST_SAVE_KEY ||
        isDailyBestKey(event.key) ||
        (!!owner && event.key === accountSaveKey(owner))
      )
        sync()
    }
    window.addEventListener('storage', onStorage)
    // Same-tab writes go through `accountStorage`, which broadcasts its own event.
    window.addEventListener(ACCOUNT_SAVE_EVENT, sync)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(ACCOUNT_SAVE_EVENT, sync)
    }
  }, [])
  const select = (id: UpgradeId) => {
    const before = model.current
    const selection = selectFarmUpgrade(before, id)
    if (!selection) return
    const next = selection.state
    logs.current.choices.push(...selection.choices)
    model.current = next
    setView(next)
    // Picking an instrument for the first time reads as the member joining.
    // The chain of automatic picks that follows must not overwrite it.
    const card = talent(selection.choices[0].id)
    if (card.kind === 'recovery') {
      setNotice(`${card.icon} 已恢复满血！`)
      noticeUntil.current = performance.now() + 2600
    } else if (card.kind === 'weapon' && next.gear[card.id] === 1) {
      setNotice(`${card.icon} ${card.name} ${card.characterId ? '加入乐队！' : '就位！'}`)
      noticeUntil.current = performance.now() + 2600
    }
    const newForm = evolved(next.gear).find((weapon) => !evolved(before.gear).includes(weapon))
    if (newForm) {
      evolutionMarks.current = [...evolutionMarks.current, before.tick]
      setEvolutionTicks(evolutionMarks.current)
      setCelebration(RECIPES.find((recipe) => recipe.weapon === newForm)!.name)
      celebrationUntil.current = performance.now() + 2800
      audio.current?.playLane(1, 72)
      audio.current?.playLane(3, 84, 0.12)
      audio.current?.playLane(1, 79, 0.24)
    } else {
      audio.current?.playLane(1, 76)
      audio.current?.playLane(3, 81, 0.09)
    }
    if (!next.offered.length) field.current?.focus({ preventScroll: true })
  }
  const selectRef = useRef(select)
  selectRef.current = select
  useEffect(() => {
    const pauseForAccount = () => {
      if (phaseRef.current === 'play') openPanel('pause')
    }
    window.addEventListener(AUTH_FORM_EVENT, pauseForAccount)
    return () => window.removeEventListener(AUTH_FORM_EVENT, pauseForAccount)
  }, [])
  useEffect(() => {
    const sound = new FarmAudio()
    audio.current = sound
    const element = canvas.current!,
      controlField = field.current!,
      ctx = element.getContext('2d')!
    let box = element.getBoundingClientRect()
    let rect = farmWorldBounds(box)
    let width = box.width,
      height = box.height,
      ratio = Math.min(2, window.devicePixelRatio || 1)
    let resized = true
    const refreshBounds = () => {
      box = element.getBoundingClientRect()
      rect = farmWorldBounds(box)
    }
    // Scrolling inside a dialog also moves the field: measure at most once a
    // frame, and stay passive so the scroll itself is never blocked.
    let scrollFrame = 0
    const onScroll = () => {
      if (scrollFrame) return
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0
        refreshBounds()
      })
    }
    const scrollSettings = { capture: true, passive: true } as const
    const resize = () => {
      refreshBounds()
      controls.current?.reset()
      keys.current.clear()
      width = box.width
      height = box.height
      ratio = Math.min(2, window.devicePixelRatio || 1)
      const pixelsX = Math.round(width * ratio),
        pixelsY = Math.round(height * ratio)
      if (element.width !== pixelsX || element.height !== pixelsY) {
        element.width = pixelsX
        element.height = pixelsY
        resized = true
      }
    }
    resize()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    observer?.observe(element)
    window.addEventListener('resize', resize)
    window.addEventListener('scroll', onScroll, scrollSettings)
    controls.current = bindFarmControls(controlField, {
      canMove: () =>
        phaseRef.current === 'play' && !panelRef.current && !model.current.offered.length,
      bounds: () => rect,
      refreshBounds,
      target: (point) => {
        stick.current = null
        pointerTarget.current = point
        desired.current = farmPointerTarget(model.current.position, point)
        keys.current.clear()
        if (inputModeRef.current !== 'mouse') {
          inputModeRef.current = 'mouse'
          setInputMode('mouse')
        }
      },
      stick: (next) => {
        stick.current = next
        pointerTarget.current = null
        keys.current.clear()
        if (next.vector)
          desired.current = [
            model.current.position[0] + (next.vector[0] * farmMoveStep(model.current)) / MOVE_STEP,
            model.current.position[1] + (next.vector[1] * farmMoveStep(model.current)) / MOVE_STEP,
          ]
        if (inputModeRef.current !== 'touch') {
          inputModeRef.current = 'touch'
          setInputMode('touch')
        }
      },
      stop: () => {
        pointerTarget.current = null
        stick.current = null
        desired.current = [...displayPosition.current]
      },
    })
    const input = controls.current
    let previousEnemies = new Map<number, { x: number; y: number }>()
    let previousShots = new Map<number, { x: number; y: number }>()
    let previousLoot = new Map<number, { x: number; y: number }>()
    let frame = 0,
      last = 0,
      elapsed = 0,
      published = 0
    let drawnState = model.current,
      hasDrawn = false
    let drawnHero: HTMLCanvasElement | null = null
    let drawnStick: FarmStick | null = null
    let sampleStart = 0,
      draws = 0,
      drawMs = 0,
      moves = 0
    const animate = (now: number) => {
      const delta = last ? Math.min(125, now - last) : 0
      last = now
      let state = model.current
      const running = phaseRef.current === 'play' && !panelRef.current && !state.offered.length
      if (running) {
        elapsed += delta
        while (elapsed >= 1000 / FPS && state.hp > 0 && !state.offered.length) {
          elapsed -= 1000 / FPS
          const held = keys.current
          const dx =
            Number(held.has('ArrowRight') || held.has('d')) -
            Number(held.has('ArrowLeft') || held.has('a'))
          const dy =
            Number(held.has('ArrowDown') || held.has('s')) -
            Number(held.has('ArrowUp') || held.has('w'))
          if (pointerTarget.current)
            desired.current = farmPointerTarget(state.position, pointerTarget.current)
          else if (stick.current?.vector)
            desired.current = [
              state.position[0] + (stick.current.vector[0] * farmMoveStep(state)) / MOVE_STEP,
              state.position[1] + (stick.current.vector[1] * farmMoveStep(state)) / MOVE_STEP,
            ]
          if (dx || dy)
            desired.current = [
              state.position[0] + dx * farmMoveStep(state),
              state.position[1] + dy * farmMoveStep(state),
            ]
          const point = clampPoint(state.position, desired.current, farmMoveStep(state))
          const useSurge = surge.current && state.charge >= 100
          surge.current = false
          const result = stepFarm(state, point, useSurge)
          if (!result) break
          logs.current.frames.push(point)
          if (useSurge) logs.current.surges.push(state.tick)
          // The recap only renders after the run, so the samples stay in a ref
          // instead of re-rendering the whole page twice a second.
          if (state.tick % FARM_SAMPLE_EVERY === 0 && samples.current.length < FARM_SAMPLE_LIMIT)
            samples.current.push(farmTimelineSample(state))
          if (state.tick % 8 === 0) {
            const beat = state.tick / 8
            audio.current?.accompany(beat, 0, 0)
            if (state.gear.drum) audio.current?.playLane(0)
            if (state.gear.power)
              audio.current?.playLane(2, [36, 33, 29, 31][Math.floor(beat / 4) % 4])
            if (state.gear.orbit) audio.current?.playLane(1, [64, 67, 72, 69][beat % 4], 0.12)
            if (state.gear.echo) audio.current?.playLane(3, [76, 79, 84, 81][beat % 4], 0.24)
          }
          const harvests = result.events.filter(
            (event) => event.kind === 'harvest' || event.kind === 'boss',
          )
          harvests
            .slice(0, 4)
            .forEach((event, index) => audio.current?.playLane(1, event.midi, index * 0.025))
          if (useSurge) {
            audio.current?.playLane(0)
            audio.current?.playLane(3, 84)
          }
          if (result.events.some((event) => event.kind === 'shock'))
            audio.current?.playLane(2, 71, 0.1)
          if (result.events.some((event) => event.kind === 'block'))
            audio.current?.playLane(3, 79, 0.08)
          const arrival = result.events.find((event) => event.kind === 'arrival')
          if (arrival) {
            setNotice(
              arrival.bass
                ? '低音炮王登场！弹幕成环，别站在原地'
                : '鼓噪巨兽登场！躲开红圈，击败它爆经验',
            )
            noticeUntil.current = now + 2400
          }
          if (result.events.some((event) => event.kind === 'boss')) {
            setNotice('Boss 击破！回血与经验全部飞向你 ✦')
            noticeUntil.current = now + 2200
          }
          let blasts = 0,
            harvestEffects = 0,
            hits = 0
          for (const event of result.events) {
            if (
              event.kind === 'collect' ||
              (event.kind === 'blast' && ++blasts > 24) ||
              (event.kind === 'harvest' && ++harvestEffects > 32) ||
              (event.kind === 'hit' && ++hits > 16)
            )
              continue
            effects.current.push({ event, born: now })
          }
          effects.current = effects.current.slice(-180)
          previousEnemies = new Map(
            state.crops
              .filter((enemy) => enemy.hp > 0)
              .map((enemy) => [enemy.id, { x: enemy.x, y: enemy.y }]),
          )
          previousShots = new Map(state.shots.map((shot) => [shot.id, { x: shot.x, y: shot.y }]))
          previousLoot = new Map(state.loot.map((drop) => [drop.id, { x: drop.x, y: drop.y }]))
          state = result.state
          model.current = state
          // Resolve a lone offer before publishing or interrupting movement for a dialog.
          if (state.offered.length === 1) {
            selectRef.current(state.offered[0])
            state = model.current
          }
          if (state.hp <= 0) {
            const finished = finishFarm(
              state,
              logs.current.frames,
              logs.current.choices,
              logs.current.surges,
            )
            setRound(finished)
            phaseRef.current = 'result'
            setPhase('result')
            audio.current?.stop()
            setView(state)
            setTimeline(samples.current)
            if (finished) {
              const reward = awardFarmCoins(runId.current, finished.coins)
              setProfile(reward.profile)
              setRewardError(reward.error ?? '')
              const claim = claimFarmAchievements(finished)
              setBadges(claim.log)
              setFreshBadges(claim.fresh)
              setBadgeError(claim.error ?? '')
              const totals = recordFarmCareer(finished)
              setCareer(totals.career)
              setCareerRecords(totals.records)
              const goals = applyFarmQuests(day, finished, runId.current)
              setQuests(goals.log)
              setFreshQuests(goals.completed)
              setGoalError(goals.error ?? '')
              if (goals.completed.length) setProfile(loadFarmProfile())
            }
            if (finished) {
              bestRecorded.current = true
              setBest((previous) => Math.max(previous, finished.score))
            }
            break
          }
        }
        if (state.offered.length) {
          elapsed = 0
          input.reset()
        }
        if (now - published > 100 || state.offered.length) {
          published = now
          setView(state)
        }
      } else elapsed = 0
      effects.current = effects.current.filter((effect) => now - effect.born < 900)
      if (celebrationUntil.current && now > celebrationUntil.current) {
        celebrationUntil.current = 0
        setCelebration('')
      }
      if (noticeUntil.current && now > noticeUntil.current) {
        noticeUntil.current = 0
        setNotice('')
      }
      if (running && !state.offered.length && phaseRef.current === 'play') {
        if (pointerTarget.current)
          desired.current = farmPointerTarget(state.position, pointerTarget.current)
        else if (stick.current?.vector)
          desired.current = [
            state.position[0] + (stick.current.vector[0] * farmMoveStep(state)) / MOVE_STEP,
            state.position[1] + (stick.current.vector[1] * farmMoveStep(state)) / MOVE_STEP,
          ]
        const previous = displayPosition.current
        displayPosition.current = advanceFarmPosition(
          previous,
          desired.current,
          state.position,
          delta,
          farmMoveStep(state),
        )
        if (
          previous[0] !== displayPosition.current[0] ||
          previous[1] !== displayPosition.current[1]
        )
          moves++
      }
      if (
        !document.hidden &&
        phaseRef.current !== 'result' &&
        (running ||
          effects.current.length ||
          !hasDrawn ||
          drawnState !== state ||
          drawnHero !== heroSprite.current ||
          drawnStick !== stick.current ||
          resized)
      ) {
        const started = showPerformance ? performance.now() : 0
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
        drawFarm(ctx, state, effects.current, now, width, height, {
          character: heroSprite.current,
          joystick: stick.current ?? undefined,
          simple: !settingsRef.current.effects,
          position: displayPosition.current,
          tick: state.tick + (elapsed * FPS) / 1000,
          previousLoot,
          previousEnemies,
          previousShots,
          alpha: Math.min(1, (elapsed * FPS) / 1000),
        })
        if (showPerformance) {
          drawMs += performance.now() - started
          draws++
        }
        drawnHero = heroSprite.current
        drawnStick = stick.current
        drawnState = state
        hasDrawn = true
        resized = false
      }
      if (showPerformance) {
        if (!sampleStart) sampleStart = now
        if (now - sampleStart >= 1000) {
          const duration = now - sampleStart
          setPerformanceView({
            fps: Math.round((draws * 1000) / duration),
            drawMs: (drawMs / Math.max(1, draws)).toFixed(2),
            moves: Math.round((moves * 1000) / duration),
          })
          draws = 0
          moves = 0
          drawMs = 0
          sampleStart = now
        }
      }
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    const visibility = () => {
      if (document.hidden && phaseRef.current === 'play') {
        panelRef.current = 'pause'
        setPanel('pause')
        pushDialogHistory()
        keys.current.clear()
        input.reset()
        audio.current?.stop()
        audioSerial.current++
      }
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', visibility)
      observer?.disconnect()
      if (scrollFrame) cancelAnimationFrame(scrollFrame)
      window.removeEventListener('resize', resize)
      window.removeEventListener('scroll', onScroll, scrollSettings)
      input.dispose()
      sound.dispose()
    }
  }, [day, showPerformance])
  const offeredKey = view.offered.join(',')
  const offeredCount = view.offered.length
  useEffect(() => {
    if (panel || offeredCount) {
      modal.current?.querySelector<HTMLButtonElement>('button')?.focus()
    } else if (phaseRef.current === 'play') field.current?.focus({ preventScroll: true })
  }, [panel, offeredKey, offeredCount])
  // The shell is inert until React commits `panel === null`, so the element
  // that opened the dialog can only take focus back after that render.
  useEffect(() => {
    if (panel || phaseRef.current === 'play') return
    previousFocus.current?.focus({ preventScroll: true })
  }, [panel])
  useEffect(() => {
    if (phase === 'result') {
      page.current?.scrollIntoView({ block: 'start' })
      page.current?.querySelector<HTMLElement>('.farm-result h2')?.focus({ preventScroll: true })
    }
  }, [phase])
  const upgrade = phase === 'play' && view.offered.length > 0
  // Past the replay budget the server would reject the upload anyway, so the
  // run stays on the device and says so instead of failing with a vague error.
  const submitBlocked = farmTooLongToSubmit(round)
  const previousThreshold = farmXpThreshold(view.level)
  const requiredXp = farmUpgradeXp(view.level)
  const currentXp = Math.max(0, Math.min(requiredXp, view.xp - previousThreshold))
  const progress = requiredXp > 0 ? (currentXp / requiredXp) * 100 : 100
  const forms = evolved(view.gear)
  const trap = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && panel) closePanel()
    if (upgrade && /^[1-9]$/.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const picked = view.offered[Number(event.key) - 1]
      if (picked) {
        event.preventDefault()
        select(picked)
      }
      return
    }
    if (event.key !== 'Tab') return
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not(:disabled),a[href]',
      ),
    )
    if (event.shiftKey && document.activeElement === buttons[0]) {
      event.preventDefault()
      buttons.at(-1)?.focus()
    } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
      event.preventDefault()
      buttons[0]?.focus()
    }
  }
  return (
    <div
      className={`music-farm ${phase === 'result' ? 'is-result-page' : ''}`}
      ref={page}
      data-phase={phase}
    >
      <div className="farm-shell" inert={!!panel || upgrade}>
        <header className="farm-header">
          <a className="farm-brand" href="#/farm">
            <span>♬</span>
            <div>
              <h1>怪潮乐队历险记</h1>
              <small>TINY BAND · BIG BATTLES</small>
            </div>
          </a>
          <nav>
            <button
              className="farm-shop-open"
              aria-label="打开角色商店"
              onClick={() => {
                setProfile(loadFarmProfile())
                openPanel('shop')
              }}
            >
              🛍
            </button>
            <button
              className="farm-growth-open"
              aria-label="打开永久强化"
              onClick={() => {
                setProfile(loadFarmProfile())
                openPanel('growth')
              }}
            >
              ↗ <span>升级</span>
            </button>
            <button aria-label="查看成就墙" onClick={() => openPanel('badges')}>
              🏅
            </button>
            <button aria-label="查看生存排行榜" onClick={() => openPanel('board')}>
              🏆
            </button>
            <button
              aria-label={muted ? '开启声音' : '静音'}
              aria-pressed={muted}
              onClick={() => {
                setMuted(!muted)
                audio.current?.setMuted(!muted)
                if (muted || audioError) void prepare(!muted)
              }}
            >
              {muted ? '♩' : '♫'}
            </button>
            <button aria-label="查看进化配方" onClick={() => openPanel('help')}>
              ?
            </button>
          </nav>
        </header>
        <div className={`farm-layout ${phase === 'result' ? 'is-result' : ''}`}>
          <section className="farm-game" aria-label="怪潮乐队历险记游戏">
            <div className="farm-alerts">
              {badgeError && (
                <p role="status" className="farm-audio-error">
                  {badgeError}
                </p>
              )}
              {goalError && (
                <p role="status" className="farm-audio-error">
                  {goalError}
                </p>
              )}
              {heroError && (
                <p role="status" className="farm-audio-error">
                  角色图片暂时未加载，先由默认乐手上场。
                </p>
              )}
              {audioError && (
                <p role="status" className="farm-audio-error">
                  声音暂时无法开启，仍可继续战斗。点右上角声音按钮重试。
                </p>
              )}
            </div>
            <div className={`farm-health ${view.hp <= 30 ? 'is-low' : ''}`}>
              <span>♥</span>
              <div
                role="progressbar"
                aria-label="生命值"
                aria-valuemin={0}
                aria-valuemax={view.maxHp}
                aria-valuenow={view.hp}
              >
                <i style={{ width: `${(view.hp / view.maxHp) * 100}%` }} />
              </div>
              <b>
                {Math.ceil(view.hp)}/{view.maxHp}
              </b>
              {view.shields > 0 && (
                <em className="farm-shield-count" aria-label={`护盾 ${view.shields} 层`}>
                  🛡 {view.shields}
                </em>
              )}
              <small>
                第 {1 + Math.floor(view.tick / (FPS * 15))} 波 ·{' '}
                {bossesAlive ? `巨兽 ${bossesAlive} 只在场` : `巨兽 ${farmBossCountdown(view)}s`}
              </small>
            </div>
            <div className="farm-xp">
              <span>Lv.{view.level + 1}</span>
              <div
                role="progressbar"
                aria-label="经验进度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
              >
                <i style={{ width: `${progress}%` }} />
              </div>
              <span>
                {number(currentXp)} / {number(requiredXp)} 经验
              </span>
            </div>
            <div className="farm-hud">
              <div>
                <small>
                  清怪分数 · 第 {1 + Math.floor(view.tick / (FPS * 15))} 波
                  {bossesAlive
                    ? ` · 巨兽 ${bossesAlive} 只`
                    : ` · 巨兽 ${farmBossCountdown(view)}s`}
                </small>
                <strong>{number(view.score)}</strong>
              </div>
              <div
                className={`farm-combo ${view.combo >= 60 ? 'is-frenzy-2' : view.combo >= 30 ? 'is-frenzy-1' : ''}`}
              >
                <b>{view.combo}</b>
                <small>
                  {view.combo >= 60
                    ? '狂热 ✦✦ 音浪增强'
                    : view.combo >= 30
                      ? '狂热 ✦ 音浪强化'
                      : '连击 · 最高 ×5'}
                </small>
              </div>
              <div className="farm-time">
                <b aria-label="已生存时间">
                  <small>生存</small>
                  {formatFarmTime(view.tick)}
                </b>
                {phase === 'play' && (
                  <button aria-label="暂停游戏" onClick={() => openPanel('pause')}>
                    Ⅱ
                  </button>
                )}
              </div>
            </div>
            <div
              className="farm-field"
              ref={field}
              tabIndex={0}
              role="application"
              aria-label="生存战场：手机按住任意位置当摇杆拖动方向，电脑移动鼠标，或使用方向键和 WASD，空格释放音浪爆发"
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget || phaseRef.current !== 'play') return
                if (
                  [
                    'ArrowLeft',
                    'ArrowRight',
                    'ArrowUp',
                    'ArrowDown',
                    'w',
                    'a',
                    's',
                    'd',
                    ' ',
                  ].includes(event.key)
                ) {
                  event.preventDefault()
                  if (event.key === ' ') {
                    if (phaseRef.current === 'play' && model.current.charge >= 100)
                      surge.current = true
                  } else {
                    pointerTarget.current = null
                    keys.current.add(event.key)
                    const moveStep = farmMoveStep(model.current)
                    const movement: Record<string, Point> = {
                      ArrowLeft: [-moveStep, 0],
                      a: [-moveStep, 0],
                      ArrowRight: [moveStep, 0],
                      d: [moveStep, 0],
                      ArrowUp: [0, -moveStep],
                      w: [0, -moveStep],
                      ArrowDown: [0, moveStep],
                      s: [0, moveStep],
                    }
                    const delta = movement[event.key]
                    desired.current = [
                      model.current.position[0] + delta[0],
                      model.current.position[1] + delta[1],
                    ]
                  }
                }
              }}
              onKeyUp={(event) => keys.current.delete(event.key)}
              onBlur={() => keys.current.clear()}
            >
              <canvas ref={canvas} aria-label={`音乐怪物与${character.name}的生存战场`} />
              {phase === 'play' && (growthStats.regen || growthStats.shieldSeconds) ? (
                <div className="farm-recovery-hud" aria-label="永久恢复状态">
                  {!!growthStats.regen && (
                    <span>
                      ♡{' '}
                      {view.hp >= view.maxHp
                        ? '满血'
                        : safeSeconds
                          ? `安全等待 ${safeSeconds}s`
                          : `回血 ${Math.ceil((FPS * RECOVERY.regenSeconds - view.regenTicks) / FPS)}s`}
                    </span>
                  )}
                  {!!growthStats.shieldSeconds && (
                    <span>
                      ⬡{' '}
                      {view.shields
                        ? `${view.shields} 层`
                        : `补盾 ${Math.ceil(growthStats.shieldSeconds - view.shieldTicks / FPS)}s`}
                    </span>
                  )}
                </div>
              ) : null}
              {phase === 'ready' && (
                <div className="farm-ready">
                  <div className="farm-start-card">
                    <h2>带上你的乐队，冲出怪潮！</h2>
                    <p>无限舞台 · 自动攻击 · 看看能撑多久</p>
                    <FarmBoard compact />
                    <button className="farm-primary" onClick={start}>
                      开始玩 <span>无限模式 ↗</span>
                    </button>
                    <button
                      className="farm-shop-pill"
                      onClick={() => {
                        setProfile(loadFarmProfile())
                        openPanel('shop')
                      }}
                    >
                      ♬ 角色工坊
                    </button>
                    <button
                      className="farm-shop-pill"
                      onClick={() => {
                        setProfile(loadFarmProfile())
                        openPanel('growth')
                      }}
                    >
                      ↗ 永久强化
                    </button>
                    <small>{inputMode === 'touch' ? '拖动屏幕控制走位' : '移动鼠标控制走位'}</small>
                  </div>
                </div>
              )}
              {phase === 'play' && notice && (
                <div className="farm-notice" role="status">
                  {notice}
                </div>
              )}
              {phase === 'play' && celebration && !upgrade && (
                <div className="farm-evolution" role="status">
                  <small>成员 × 装备 · 终极乐器</small>
                  <b>✦ {celebration} ✦</b>
                  <span>奏响你的最强乐器！</span>
                </div>
              )}
              {phase === 'play' && view.tick < FPS * 4 && (
                <div className="farm-drag-hint">
                  {inputMode === 'touch'
                    ? '按住任意位置当摇杆，朝想去的方向拖动'
                    : '↔ 鼠标指向前方持续前进，移回中央停住'}
                </div>
              )}
            </div>
            <div className="farm-controls">
              <div>
                <b>✦ {number(view.coins)}</b>
                <small>
                  {view.harvested} 击败 · {view.bosses} Boss
                </small>
              </div>
              <button
                className={`farm-surge ${surgeStatus.ready ? 'is-ready' : ''} ${
                  surgeStatus.charged && !surgeStatus.ready ? 'is-cooling' : ''
                }`}
                disabled={phase !== 'play' || !surgeStatus.ready}
                onClick={() => {
                  surge.current = true
                }}
              >
                <i style={{ width: `${view.charge}%` }} />
                <span>
                  {surgeStatus.ready
                    ? '✦ 音浪爆发！'
                    : surgeStatus.charged
                      ? `音浪冷却 ${surgeStatus.seconds}s`
                      : `音浪爆发 ${view.charge}%`}
                </span>
              </button>
            </div>
          </section>
          {phase === 'result' && (
            <section className="farm-result">
              <small>SURVIVOR ENCORE</small>
              {freshBadges.length > 0 && (
                <div className="farm-fresh-badges">
                  <small>本局解锁成就</small>
                  <div>
                    {freshBadges.map((id) => {
                      const badge = FARM_ACHIEVEMENTS.find((item) => item.id === id)!
                      return (
                        <span key={id}>
                          {badge.icon} {badge.name}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
              <h2 tabIndex={-1}>演出落幕，再战一场！</h2>
              <div className="farm-stars">{'★'.repeat(round?.stars ?? 0)}</div>
              <strong className="farm-final-score">{number(view.score)}</strong>
              <small className="farm-personal-best">
                今日最佳 {number(best)} 分 · 生涯最高 {number(career.bestScore)} 分
                {careerRecords.score ? ' · 新纪录 ✦' : ''} · 生涯最长{' '}
                {formatFarmTime(career.bestSeconds * FPS)}
                {careerRecords.seconds ? ' · 新纪录 ✦' : ''}
                {careerRecords.combo ? ' · 连击新纪录 ✦' : ''}
              </small>
              <p>
                生存 {(view.tick / FPS).toFixed(1)} 秒 · {view.harvested} 击败 · {view.maxCombo}{' '}
                连击{view.elites ? ` · ${view.elites} 精英` : ''}
                {view.blocks ? ` · 挡下 ${view.blocks} 次攻击` : ''}
                {view.maxShields ? ` · 最高 ${view.maxShields} 层音盾` : ''}
              </p>
              {forms.length > 0 && (
                <p className="farm-final-build">
                  ✦{' '}
                  {RECIPES.filter((recipe) => forms.includes(recipe.weapon))
                    .map((recipe) => recipe.name)
                    .join(' ＋ ')}
                </p>
              )}
              <button className="farm-primary" onClick={restart}>
                再来一局，换种奏法 ↗
              </button>
              <button
                className="farm-text-button"
                onClick={() => {
                  const text = farmShareText(round, day)
                  navigator.clipboard
                    ?.writeText(text)
                    ?.then(() => {
                      setCopied(true)
                      if (copiedTimer.current) clearTimeout(copiedTimer.current)
                      copiedTimer.current = setTimeout(() => setCopied(false), 2400)
                    })
                    .catch(() => setCopied(false))
                }}
              >
                {copied ? '已复制 ✓' : '复制战绩'}
              </button>
              <BuildSummary gear={view.gear} />
              <RunTimeline samples={timeline} marks={evolutionTicks} seconds={view.tick / FPS} />
              <QuestList quests={todayQuests} log={quests} fresh={freshQuests} />
              <div className="farm-wallet-reward">
                {rewardError || goalError ? (
                  <>
                    <span role="alert">{rewardError || goalError}</span>
                    <button className="farm-text-button" onClick={claimReward}>
                      重试领取奖励
                    </button>
                  </>
                ) : (
                  <>
                    本局获得 ✦ {number(round?.coins ?? 0)} 金币
                    <small>钱包共 {number(profile.coins)} 金币 · 解锁角色与永久强化</small>
                  </>
                )}
                <button
                  className="farm-result-shop"
                  onClick={() => {
                    setProfile(loadFarmProfile())
                    openPanel('shop')
                  }}
                >
                  去角色商店 ↗
                </button>
                <button
                  className="farm-result-shop"
                  onClick={() => {
                    setProfile(loadFarmProfile())
                    openPanel('growth')
                  }}
                >
                  去永久强化 ↗
                </button>
              </div>
              {submitBlocked && (
                <p role="alert" className="farm-board-error">
                  {FARM_TOO_LONG_MESSAGE}
                </p>
              )}
              <FarmBoard round={submitBlocked ? null : round} characterId={profile.selected} />
            </section>
          )}
        </div>
        {showPerformance && (
          <output className="farm-performance" aria-label="性能诊断">
            渲染 {performanceView.fps} FPS · 绘制 {performanceView.drawMs} ms · 位移{' '}
            {performanceView.moves} 次/秒 · 坐标 {view.position.join(',')}{' '}
          </output>
        )}
        <footer className="farm-footer">
          一点音乐，一整场快乐 ♡ <span>原创合成音乐 · 演示版</span>
        </footer>
      </div>
      {(panel || upgrade) && (
        <div
          className={`farm-backdrop${panel === 'shop' || panel === 'growth' ? ' is-fullscreen' : ''}`}
        >
          <section
            className={`farm-dialog ${upgrade ? 'farm-upgrade-dialog' : panel === 'shop' || panel === 'growth' ? 'is-fullscreen' : ''}`}
            ref={modal}
            role="dialog"
            aria-modal="true"
            aria-label={
              upgrade
                ? '选择升级'
                : panel === 'board'
                  ? '生存排行榜'
                  : panel === 'help'
                    ? '玩法与进化配方'
                    : panel === 'shop'
                      ? '角色商店'
                      : panel === 'growth'
                        ? '永久强化'
                        : panel === 'badges'
                          ? '成就墙'
                          : '游戏暂停'
            }
            onKeyDown={trap}
          >
            {upgrade ? (
              <UpgradeChoices
                gear={view.gear}
                offered={view.offered}
                hp={view.hp}
                maxHp={view.maxHp}
                onSelect={select}
              />
            ) : (
              <>
                {panel !== 'shop' && panel !== 'growth' && (
                  <button className="farm-close" aria-label="关闭弹窗" onClick={closePanel}>
                    ×
                  </button>
                )}
                {panel === 'shop' ? (
                  <CharacterShop profile={profile} onChange={setProfile} onClose={closePanel} />
                ) : panel === 'growth' ? (
                  <PermanentTree profile={profile} onChange={setProfile} onClose={closePanel} />
                ) : panel === 'badges' ? (
                  <BadgeWall log={badges} career={career} />
                ) : panel === 'board' ? (
                  <FarmBoard />
                ) : panel === 'pause' ? (
                  <>
                    <div className="farm-modal-icon">☾</div>
                    <h2>乐队等你回来 ♡</h2>
                    <p>战斗和计时已暂停，乐队和构筑都还在。</p>
                    <button className="farm-primary" onClick={closePanel}>
                      继续战斗 ↗
                    </button>
                    <button
                      className="farm-text-button"
                      onClick={() => {
                        const next = saveFarmSettings({ effects: !settings.effects })
                        settingsRef.current = next
                        setSettings(next)
                      }}
                    >
                      特效：{settings.effects ? '开' : '关（省电）'}
                    </button>
                    <BuildSummary gear={view.gear} />
                    <p className="farm-pause-goals">
                      <small>
                        今日词缀 {modifier.icon} {modifier.name}
                      </small>
                      <QuestList quests={todayQuests} log={quests} />
                    </p>
                    <button className="farm-text-button" onClick={restart}>
                      重新开始
                    </button>
                  </>
                ) : (
                  <FarmHelp onClose={closePanel} />
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

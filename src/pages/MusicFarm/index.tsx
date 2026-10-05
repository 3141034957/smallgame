import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { advanceFarmPosition, farmBossCountdown, farmPointerTarget, farmWorldBounds, formatFarmTime } from '@/features/farm/presentation'
import { bindFarmControls, type FarmStick } from '@/features/farm/controls'
import { MelodyAudio } from '@/features/melody/audio'
import { chooseTalent, clampPoint, createFarm, evolved, farmModifier, finishFarm, FPS, MOVE_STEP, RECIPES, stepFarm, TALENTS, THRESHOLDS, todayRoute, validDay } from '@/features/farm/rules.mjs'
import type { Choice, FarmEvent, FarmRound, Point, TalentId } from '@/features/farm/rules.mjs'
import { drawFarm } from './render'
import { FarmBoard } from './FarmBoard'
import { CharacterShop } from './CharacterShop'
import { loadFarmCharacterSprite } from './characterSprite'
import { awardFarmCoins, FARM_CHARACTERS, FARM_PROFILE_KEY, loadFarmProfile } from '@/features/farm/characters'
import { claimFarmAchievements, FARM_ACHIEVEMENTS, loadFarmAchievements, type FarmAchievementLog } from '@/features/farm/achievements'
import { loadFarmCareer, recordFarmCareer, type FarmCareer } from '@/features/farm/stats'
import { farmTimelineSample, FARM_SAMPLE_EVERY, FARM_SAMPLE_LIMIT, type FarmSample } from '@/features/farm/timeline'
import { FARM_HELP_SEEN_KEY } from '@/features/farm/help'
import { loadFarmSettings, saveFarmSettings, type FarmSettings } from '@/features/farm/settings'
import { farmShareText } from '@/features/farm/share'
import { RunTimeline } from './RunTimeline'
import { BadgeWall } from './BadgeWall'
import { QuestList } from './QuestList'
import { BuildSummary } from './BuildSummary'
import { applyFarmQuests, farmQuests, loadFarmQuests, type FarmQuestLog } from '@/features/farm/quests'
import './style.css'

type Phase = 'ready' | 'play' | 'result'
type Panel = 'help' | 'board' | 'pause' | 'shop' | 'badges' | null
const talent = (id: TalentId) => TALENTS.find((item) => item.id === id)!
const number = (value: number) => value.toLocaleString()

export default function MusicFarm() {
  const [params] = useSearchParams()
  const day = validDay(params.get('day')) ? params.get('day')! : todayRoute()
  const [initial] = useState(() => createFarm(day))
  const dayRef = useRef(day)
  dayRef.current = day
  const model = useRef(initial)
  const [view, setView] = useState(model.current)
  const [inputMode, setInputMode] = useState<'touch' | 'mouse'>(() => window.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'mouse')
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
  const [best, setBest] = useState(() => { try { return Number(localStorage.getItem(`farm-best-v4-endless:${day}`)) || 0 } catch { return 0 } })
  const canvas = useRef<HTMLCanvasElement>(null)
  const page = useRef<HTMLDivElement>(null)
  const modal = useRef<HTMLElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const field = useRef<HTMLDivElement>(null)
  const audio = useRef<MelodyAudio | null>(null)
  const pointerTarget = useRef<Point | null>(null)
  const stick = useRef<FarmStick | null>(null)
  const desired = useRef<Point>([...model.current.position])
  const displayPosition = useRef<Point>([...model.current.position])
  const controls = useRef<ReturnType<typeof bindFarmControls> | null>(null)
  const logs = useRef<{ frames: Point[]; choices: Choice[]; surges: number[] }>({ frames: [], choices: [], surges: [] })
  const effects = useRef<{ event: FarmEvent; born: number }[]>([])
  const surge = useRef(false)
  const keys = useRef(new Set<string>())
  const audioSerial = useRef(0)
  const celebrationUntil = useRef(0)
  const noticeUntil = useRef(0)
  const openPanel = (next: Panel) => { keys.current.clear(); controls.current?.reset(); previousFocus.current = document.activeElement as HTMLElement; panelRef.current = next; setPanel(next); audio.current?.stop(); audioSerial.current++ }
  const prepare = async (nextMuted = muted) => { const serial = ++audioSerial.current; if (!audio.current) audio.current = new MelodyAudio(); const ok = await audio.current.prepare(); if (serial !== audioSerial.current) return; setAudioError(!ok); audio.current.setMuted(nextMuted) }
  const closePanel = () => { panelRef.current = null; setPanel(null); if (phaseRef.current === 'play') void prepare(); previousFocus.current?.focus({ preventScroll: true }) }
  const start = () => { samples.current = []; setTimeline([]); evolutionMarks.current = []; setEvolutionTicks([]); const random = new Uint32Array(2); crypto.getRandomValues(random); runId.current = `farm_${Date.now()}_${random.join('_')}`; phaseRef.current = 'play'; setPhase('play'); void prepare(); field.current?.focus({ preventScroll: true }) }
  const restart = () => {
    audio.current?.stop(); audioSerial.current++; model.current = createFarm(dayRef.current); desired.current = [...model.current.position]; displayPosition.current = [...model.current.position]; controls.current?.reset(); logs.current = { frames: [], choices: [], surges: [] }; effects.current = []; surge.current = false; keys.current.clear(); setView(model.current); setRound(null); setRewardError(''); setFreshBadges([]); setBadgeError(''); setCareerRecords({ score: false, seconds: false, combo: false }); setFreshQuests([]); setGoalError(''); samples.current = []; setTimeline([]); evolutionMarks.current = []; setEvolutionTicks([]); setCelebration(''); setNotice(''); celebrationUntil.current = 0; noticeUntil.current = 0; panelRef.current = null; setPanel(null); phaseRef.current = 'ready'; setPhase('ready'); page.current?.scrollIntoView({ block: 'start' })
  }
  const restartRef = useRef(restart)
  restartRef.current = restart
  const claimReward = () => {
    if (!round) return
    // Retry both payouts: a quota failure can hide either one.
    const reward = awardFarmCoins(runId.current, round.coins)
    setProfile(reward.profile); setRewardError(reward.error ?? '')
    const goals = applyFarmQuests(day, round)
    setQuests(goals.log); setFreshQuests(goals.completed); setGoalError(goals.error ?? '')
    if (goals.completed.length) setProfile(loadFarmProfile())
  }
  useEffect(() => {
    let cancelled = false
    heroSprite.current = null; setHeroError(false)
    void loadFarmCharacterSprite(profile.selected).then((sprite) => { if (!cancelled) heroSprite.current = sprite }).catch(() => { if (!cancelled) setHeroError(true) })
    return () => { cancelled = true }
  }, [profile.selected])
  // First visit: show the rules straight away instead of hiding them behind "?".
  useEffect(() => {
    let seen = true
    try { seen = localStorage.getItem(FARM_HELP_SEEN_KEY) === '1' } catch { seen = true }
    if (seen) return
    try { localStorage.setItem(FARM_HELP_SEEN_KEY, '1') } catch { /* Storage optional. */ }
    openPanel('help')
  }, [])
  // A hand-edited ?day= must not leave the run on another day's seed: the
  // leaderboard would reject the score because the replay would not match.
  useEffect(() => {
    if (model.current.day === day) return
    setQuests(loadFarmQuests(day))
    setFreshQuests([])
    setBest(() => { try { return Number(localStorage.getItem(`farm-best-v4-endless:${day}`)) || 0 } catch { return 0 } })
    restartRef.current()
  }, [day])
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current) }, [])
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (!event.key || event.key === FARM_PROFILE_KEY || event.key === 'character-unlocks-v1') setProfile(loadFarmProfile()) }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  const select = (id: TalentId) => {
    const before = model.current
    const next = chooseTalent(before, id)
    if (!next) return
    logs.current.choices.push({ tick: before.tick, id }); model.current = next; setView(next)
    // Picking an instrument for the first time reads as the member joining.
    if (talent(id).kind === 'weapon' && next.gear[id] === 1) { setNotice(`${talent(id).icon} ${talent(id).name} 加入乐队！`); noticeUntil.current = performance.now() + 2600 }
    const newForm = evolved(next.gear).find((weapon) => !evolved(before.gear).includes(weapon))
    if (newForm) { evolutionMarks.current = [...evolutionMarks.current, before.tick]; setEvolutionTicks(evolutionMarks.current); setCelebration(RECIPES.find((recipe) => recipe.weapon === newForm)!.name); celebrationUntil.current = performance.now() + 2800; audio.current?.playLane(1, 72); audio.current?.playLane(3, 84, .12); audio.current?.playLane(1, 79, .24) }
    else { audio.current?.playLane(1, 76); audio.current?.playLane(3, 81, .09) }
    if (!next.offered.length) field.current?.focus({ preventScroll: true })
  }
  useEffect(() => {
    const sound = new MelodyAudio(); audio.current = sound
    const element = canvas.current!, controlField = field.current!, ctx = element.getContext('2d')!
    let box = element.getBoundingClientRect()
    let rect = farmWorldBounds(box)
    let width = box.width, height = box.height, ratio = Math.min(2, window.devicePixelRatio || 1)
    let resized = true
    const refreshBounds = () => { box = element.getBoundingClientRect(); rect = farmWorldBounds(box) }
    const resize = () => {
      refreshBounds(); controls.current?.reset(); keys.current.clear(); width = box.width; height = box.height; ratio = Math.min(2, window.devicePixelRatio || 1)
      const pixelsX = Math.round(width * ratio), pixelsY = Math.round(height * ratio)
      if (element.width !== pixelsX || element.height !== pixelsY) { element.width = pixelsX; element.height = pixelsY; resized = true }
    }
    resize()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    observer?.observe(element)
    window.addEventListener('resize', resize)
    window.addEventListener('scroll', refreshBounds, true)
    controls.current = bindFarmControls(controlField, element, {
      canMove: () => phaseRef.current === 'play' && !panelRef.current && !model.current.offered.length,
      bounds: () => rect, refreshBounds,
      target: (point) => { stick.current = null; pointerTarget.current = point; desired.current = farmPointerTarget(model.current.position, point); keys.current.clear(); if (inputModeRef.current !== 'mouse') { inputModeRef.current = 'mouse'; setInputMode('mouse') } },
      stick: (next) => {
        stick.current = next; pointerTarget.current = null; keys.current.clear()
        if (next.vector) desired.current = [model.current.position[0] + next.vector[0], model.current.position[1] + next.vector[1]]
        if (inputModeRef.current !== 'touch') { inputModeRef.current = 'touch'; setInputMode('touch') }
      },
      stop: () => { pointerTarget.current = null; stick.current = null; desired.current = [...displayPosition.current] },
    })
    const input = controls.current
    let previousEnemies = new Map<number, { x: number; y: number }>()
    let previousShots = new Map<number, { x: number; y: number }>()
    let previousLoot = new Map<number, { x: number; y: number }>()
    let frame = 0, last = 0, elapsed = 0, published = 0
    let drawnState = model.current, hasDrawn = false
    let drawnHero: HTMLCanvasElement | null = null
    let drawnStick: FarmStick | null = null
    let sampleStart = 0, draws = 0, drawMs = 0, moves = 0
    const animate = (now: number) => {
      const delta = last ? Math.min(125, now - last) : 0; last = now
      let state = model.current
      const running = phaseRef.current === 'play' && !panelRef.current && !state.offered.length
      if (running) {
        elapsed += delta
        while (elapsed >= 1000 / FPS && state.hp > 0 && !state.offered.length) {
          elapsed -= 1000 / FPS
          const held = keys.current
          const dx = Number(held.has('ArrowRight') || held.has('d')) - Number(held.has('ArrowLeft') || held.has('a'))
          const dy = Number(held.has('ArrowDown') || held.has('s')) - Number(held.has('ArrowUp') || held.has('w'))
          if (pointerTarget.current) desired.current = farmPointerTarget(state.position, pointerTarget.current)
          else if (stick.current?.vector) desired.current = [state.position[0] + stick.current.vector[0], state.position[1] + stick.current.vector[1]]
          if (dx || dy) desired.current = [state.position[0] + dx * MOVE_STEP, state.position[1] + dy * MOVE_STEP]
          const point = clampPoint(state.position, desired.current)
          const useSurge = surge.current && state.charge >= 100; surge.current = false
          const result = stepFarm(state, point, useSurge)
          if (!result) break
          logs.current.frames.push(point); if (useSurge) logs.current.surges.push(state.tick)
          if (state.tick % FARM_SAMPLE_EVERY === 0 && samples.current.length < FARM_SAMPLE_LIMIT) { samples.current = [...samples.current, farmTimelineSample(state)]; setTimeline(samples.current) }
          if (state.tick % 8 === 0) {
            const beat = state.tick / 8; audio.current?.accompany(beat, 0, 0)
            if (state.gear.drum) audio.current?.playLane(0)
            if (state.gear.power) audio.current?.playLane(2, [36, 33, 29, 31][Math.floor(beat / 4) % 4])
            if (state.gear.orbit) audio.current?.playLane(1, [64, 67, 72, 69][beat % 4], .12)
            if (state.gear.echo) audio.current?.playLane(3, [76, 79, 84, 81][beat % 4], .24)
          }
          const harvests = result.events.filter((event) => event.kind === 'harvest' || event.kind === 'boss')
          harvests.slice(0, 4).forEach((event, index) => audio.current?.playLane(1, event.midi, index * .025))
          if (useSurge) { audio.current?.playLane(0); audio.current?.playLane(3, 84) }
          if (result.events.some((event) => event.kind === 'shock')) audio.current?.playLane(2, 71, .1)
          const arrival = result.events.find((event) => event.kind === 'arrival')
          if (arrival) { setNotice(arrival.bass ? '低音炮王登场！弹幕成环，别站在原地' : '鼓噪巨兽登场！躲开红圈，击败它爆经验'); noticeUntil.current = now + 2400 }
          if (result.events.some((event) => event.kind === 'boss')) { setNotice('Boss 击破！回血与经验全部飞向你 ✦'); noticeUntil.current = now + 2200 }
          let blasts = 0, harvestEffects = 0, hits = 0
          for (const event of result.events) {
            if (event.kind === 'collect' || event.kind === 'blast' && ++blasts > 24 || event.kind === 'harvest' && ++harvestEffects > 32 || event.kind === 'hit' && ++hits > 16) continue
            effects.current.push({ event, born: now })
          }
          effects.current = effects.current.slice(-180)
          previousEnemies = new Map(state.crops.filter((enemy) => enemy.hp > 0).map((enemy) => [enemy.id, { x: enemy.x, y: enemy.y }]))
          previousShots = new Map(state.shots.map((shot) => [shot.id, { x: shot.x, y: shot.y }]))
          previousLoot = new Map(state.loot.map((drop) => [drop.id, { x: drop.x, y: drop.y }]))
          state = result.state; model.current = state
          if (state.hp <= 0) {
            const finished = finishFarm(state, logs.current.frames, logs.current.choices, logs.current.surges)
            setRound(finished); phaseRef.current = 'result'; setPhase('result'); audio.current?.stop(); setView(state)
            if (finished) {
              const reward = awardFarmCoins(runId.current, finished.coins)
              setProfile(reward.profile); setRewardError(reward.error ?? '')
              const claim = claimFarmAchievements(finished)
              setBadges(claim.log); setFreshBadges(claim.fresh); setBadgeError(claim.error ?? '')
              const totals = recordFarmCareer(finished)
              setCareer(totals.career); setCareerRecords(totals.records)
              const goals = applyFarmQuests(day, finished)
              setQuests(goals.log); setFreshQuests(goals.completed)
              setGoalError(goals.error ?? '')
              if (goals.completed.length) setProfile(loadFarmProfile())
            }
            if (finished) setBest((previous) => { const value = Math.max(previous, finished.score); try { localStorage.setItem(`farm-best-v4-endless:${day}`, String(value)) } catch { /* Storage optional. */ } return value })
            break
          }
        }
        if (state.offered.length) { elapsed = 0; input.reset() }
        if (now - published > 100 || state.offered.length) { published = now; setView(state) }
      } else elapsed = 0
      effects.current = effects.current.filter((effect) => now - effect.born < 900)
      if (celebrationUntil.current && now > celebrationUntil.current) { celebrationUntil.current = 0; setCelebration('') }
      if (noticeUntil.current && now > noticeUntil.current) { noticeUntil.current = 0; setNotice('') }
      if (running && !state.offered.length && phaseRef.current === 'play') {
        if (pointerTarget.current) desired.current = farmPointerTarget(state.position, pointerTarget.current)
        else if (stick.current?.vector) desired.current = [state.position[0] + stick.current.vector[0], state.position[1] + stick.current.vector[1]]
        const previous = displayPosition.current
        displayPosition.current = advanceFarmPosition(previous, desired.current, state.position, delta)
        if (previous[0] !== displayPosition.current[0] || previous[1] !== displayPosition.current[1]) moves++
      }
      if (!document.hidden && phaseRef.current !== 'result' && (running || effects.current.length || !hasDrawn || drawnState !== state || drawnHero !== heroSprite.current || drawnStick !== stick.current || resized)) {
        const started = showPerformance ? performance.now() : 0
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
        drawFarm(ctx, state, effects.current, now, width, height, { character: heroSprite.current, joystick: stick.current ?? undefined, simple: !settingsRef.current.effects, position: displayPosition.current, tick: state.tick + elapsed * FPS / 1000, previousLoot, previousEnemies, previousShots, alpha: Math.min(1, elapsed * FPS / 1000) })
        if (showPerformance) { drawMs += performance.now() - started; draws++ }
        drawnHero = heroSprite.current; drawnStick = stick.current; drawnState = state; hasDrawn = true; resized = false
      }
      if (showPerformance) {
        if (!sampleStart) sampleStart = now
        if (now - sampleStart >= 1000) { const duration = now - sampleStart; setPerformanceView({ fps: Math.round(draws * 1000 / duration), drawMs: (drawMs / Math.max(1, draws)).toFixed(2), moves: Math.round(moves * 1000 / duration) }); draws = 0; moves = 0; drawMs = 0; sampleStart = now }
      }
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    const visibility = () => { if (document.hidden && phaseRef.current === 'play') { panelRef.current = 'pause'; setPanel('pause'); keys.current.clear(); input.reset(); audio.current?.stop(); audioSerial.current++ } }
    document.addEventListener('visibilitychange', visibility)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', visibility); observer?.disconnect(); window.removeEventListener('resize', resize); window.removeEventListener('scroll', refreshBounds, true); input.dispose(); sound.dispose() }
  }, [day, showPerformance])
  const offeredKey = view.offered.join(',')
  const offeredCount = view.offered.length
  useEffect(() => { if (panel || offeredCount) { modal.current?.querySelector<HTMLButtonElement>('button')?.focus() } else if (phaseRef.current === 'play') field.current?.focus({ preventScroll: true }) }, [panel, offeredKey, offeredCount])
  useEffect(() => { if (phase === 'result') { page.current?.scrollIntoView({ block: 'start' }); page.current?.querySelector<HTMLElement>('.farm-result h2')?.focus({ preventScroll: true }) } }, [phase])
  const upgrade = phase === 'play' && view.offered.length > 0
  const previousThreshold = view.level ? THRESHOLDS[view.level - 1] : 0
  const nextThreshold = THRESHOLDS[view.level] ?? view.xp
  const requiredXp = nextThreshold - previousThreshold
  const currentXp = Math.max(0, Math.min(requiredXp, view.xp - previousThreshold))
  const progress = requiredXp > 0 ? currentXp / requiredXp * 100 : 100
  const forms = evolved(view.gear)
  const trap = (event: React.KeyboardEvent<HTMLElement>) => { if (event.key === 'Escape' && panel) closePanel(); if (upgrade && /^[1-9]$/.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) { const picked = view.offered[Number(event.key) - 1]; if (picked) { event.preventDefault(); select(picked) } return } if (event.key !== 'Tab') return; const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]')); if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus() } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus() } }
  const rack = <div className="farm-rack">{RECIPES.map((recipe) => { const weapon = talent(recipe.weapon), chip = talent(recipe.chip), terminal = forms.includes(recipe.weapon); return <div key={recipe.weapon} className={terminal ? 'is-terminal' : ''} title={`${weapon.name} Lv.${view.gear[weapon.id]} ＋ ${chip.name} Lv.${view.gear[chip.id]} → ${recipe.name}`}><span>{recipe.icon}</span><strong>{terminal ? recipe.name : weapon.name}</strong><small>{terminal ? '终极乐器 ✦' : <>成员 {view.gear[weapon.id]}/3 · 装备 {view.gear[chip.id]}/3</>}</small></div> })}</div>
  return <div className={`music-farm ${phase === 'result' ? 'is-result-page' : ''}`} ref={page}><div className="farm-shell" inert={!!panel || upgrade}><header className="farm-header"><a className="farm-brand" href="#/farm"><span>♬</span><div><h1>怪潮乐队历险记</h1><small>TINY BAND · BIG BATTLES</small></div></a><nav><button className="farm-shop-open" aria-label="打开角色商店" onClick={() => { setProfile(loadFarmProfile()); openPanel('shop') }}>🛍</button><button aria-label="查看成就墙" onClick={() => openPanel('badges')}>🏅</button><button aria-label="查看生存排行榜" onClick={() => openPanel('board')}>🏆</button><button aria-label={muted ? '开启声音' : '静音'} aria-pressed={muted} onClick={() => { setMuted(!muted); audio.current?.setMuted(!muted); if (muted || audioError) void prepare(!muted) }}>{muted ? '♩' : '♫'}</button><button aria-label="查看进化配方" onClick={() => openPanel('help')}>?</button></nav></header>
    <div className={`farm-layout ${phase === 'result' ? 'is-result' : ''}`}>
    <section className="farm-game" aria-label="怪潮乐队历险记游戏">
        <div className="farm-alerts">{badgeError && <p role="status" className="farm-audio-error">{badgeError}</p>}{goalError && <p role="status" className="farm-audio-error">{goalError}</p>}{heroError && <p role="status" className="farm-audio-error">角色图片暂时未加载，先由默认乐手上场。</p>}{audioError && <p role="status" className="farm-audio-error">声音暂时无法开启，仍可继续战斗。点右上角声音按钮重试。</p>}</div>
    <div className={`farm-health ${view.hp <= 30 ? 'is-low' : ''}`}><span>♥</span><div role="progressbar" aria-label="生命值" aria-valuemin={0} aria-valuemax={view.maxHp} aria-valuenow={view.hp}><i style={{ width: `${view.hp / view.maxHp * 100}%` }} /></div><b>{view.hp}/{view.maxHp}</b>{view.shields > 0 && <em className="farm-shield-count" aria-label={`护盾 ${view.shields} 层`}>🛡 {view.shields}</em>}<small>第 {1 + Math.floor(view.tick / (FPS * 15))} 波 · {bossesAlive ? `巨兽 ${bossesAlive} 只在场` : `巨兽 ${farmBossCountdown(view)}s`}</small></div>
        <div className="farm-xp"><span>Lv.{view.level + 1}</span><div role="progressbar" aria-label="经验进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><i style={{ width: `${progress}%` }} /></div><span>{view.level >= THRESHOLDS.length ? 'MAX' : `${number(currentXp)} / ${number(requiredXp)} 经验`}</span></div>
        <div className="farm-hud"><div><small>清怪分数 · 第 {1 + Math.floor(view.tick / (FPS * 15))} 波{bossesAlive ? ` · 巨兽 ${bossesAlive} 只` : ` · 巨兽 ${farmBossCountdown(view)}s`}</small><strong>{number(view.score)}</strong></div><div className={`farm-combo ${view.combo >= 60 ? 'is-frenzy-2' : view.combo >= 30 ? 'is-frenzy-1' : ''}`}><b>{view.combo}</b><small>{view.combo >= 60 ? '狂热 ✦✦ 音浪增强' : view.combo >= 30 ? '狂热 ✦ 音浪强化' : '连击 · 最高 ×5'}</small></div><div className="farm-time"><b aria-label="已生存时间"><small>生存</small>{formatFarmTime(view.tick)}</b>{phase === 'play' && <button aria-label="暂停游戏" onClick={() => openPanel('pause')}>Ⅱ</button>}</div></div>
    <div className="farm-field" ref={field} tabIndex={0} role="application" aria-label="生存战场：手机按住任意位置当摇杆拖动方向，电脑移动鼠标，或使用方向键和 WASD，空格释放音浪爆发" onKeyDown={(event) => { if (event.target !== event.currentTarget || phaseRef.current !== 'play') return; if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','w','a','s','d',' '].includes(event.key)) { event.preventDefault(); if (event.key === ' ') { if (phaseRef.current === 'play' && model.current.charge >= 100) surge.current = true } else { pointerTarget.current = null; keys.current.add(event.key); const movement: Record<string, Point> = { ArrowLeft: [-MOVE_STEP,0], a: [-MOVE_STEP,0], ArrowRight: [MOVE_STEP,0], d: [MOVE_STEP,0], ArrowUp: [0,-MOVE_STEP], w: [0,-MOVE_STEP], ArrowDown: [0,MOVE_STEP], s: [0,MOVE_STEP] }; const delta = movement[event.key]; desired.current = [model.current.position[0] + delta[0], model.current.position[1] + delta[1]] } } }} onKeyUp={(event) => keys.current.delete(event.key)} onBlur={() => keys.current.clear()}><canvas ref={canvas} aria-label={`音乐怪物与${character.name}的生存战场`} />{phase === 'ready' && <div className="farm-ready"><div className="farm-start-card"><button className="farm-start-character" aria-label="选择出战角色" onClick={() => { setProfile(loadFarmProfile()); openPanel('shop') }}><img src={character.image} alt="" /><span><strong>{character.name}</strong>更换角色 ›</span></button><h2>带上你的乐队，冲出怪潮！</h2><p>无限舞台 · 拖动走位 · 自动攻击</p><QuestList quests={todayQuests} log={quests} compact /><p className="farm-modifier"><span aria-hidden="true">{modifier.icon}</span> 今日词缀 · <b>{modifier.name}</b>：{modifier.desc}</p><button className="farm-primary" onClick={start}>开始玩 <span>无限模式 ↗</span></button><small>躲怪、捡经验、选升级，看看能坚持多久！</small></div></div>}{phase === 'play' && notice && <div className="farm-notice" role="status">{notice}</div>}{phase === 'play' && celebration && !upgrade && <div className="farm-evolution" role="status"><small>成员 × 装备 · 终极乐器</small><b>✦ {celebration} ✦</b><span>奏响你的最强乐器！</span></div>}{phase === 'play' && view.tick < FPS * 4 && <div className="farm-drag-hint">{inputMode === 'touch' ? '按住任意位置当摇杆，朝想去的方向拖动' : '↔ 鼠标指向前方持续前进，移回中央停住'}</div>}</div>
    <div className="farm-controls"><div><b>✦ {number(view.coins)}</b><small>{view.harvested} 击败 · {view.bosses} Boss</small></div><button className={`farm-surge ${view.charge >= 100 ? 'is-ready' : ''}`} disabled={phase !== 'play' || view.charge < 100} onClick={() => { surge.current = true }}><i style={{ width: `${view.charge}%` }} /><span>{view.charge >= 100 ? '✦ 音浪爆发！' : `音浪爆发 ${view.charge}%`}</span></button></div>{rack}<div className="farm-bottom-note">成员 Lv.3 ＋ 对应装备 Lv.3 ＝ 终极乐器</div></section>
    {phase === 'result' && <section className="farm-result"><small>SURVIVOR ENCORE</small>{freshBadges.length > 0 && <div className="farm-fresh-badges"><small>本局解锁成就</small><div>{freshBadges.map((id) => { const badge = FARM_ACHIEVEMENTS.find((item) => item.id === id)!; return <span key={id}>{badge.icon} {badge.name}</span> })}</div></div>}<h2 tabIndex={-1}>演出落幕，再战一场！</h2><div className="farm-stars">{'★'.repeat(round?.stars ?? 0)}</div><strong className="farm-final-score">{number(view.score)}</strong><small className="farm-personal-best">今日最佳 {number(best)} 分 · 生涯最高 {number(career.bestScore)} 分{careerRecords.score ? ' · 新纪录 ✦' : ''} · 生涯最长 {formatFarmTime(career.bestSeconds * FPS)}{careerRecords.seconds ? ' · 新纪录 ✦' : ''}{careerRecords.combo ? ' · 连击新纪录 ✦' : ''}</small><p>生存 {(view.tick / FPS).toFixed(1)} 秒 · {view.harvested} 击败 · {view.maxCombo} 连击{view.elites ? ` · ${view.elites} 精英` : ''}{view.blocks ? ` · 🛡 挡下 ${view.blocks} 次` : ''}{view.maxShields ? ` · 最高 ${view.maxShields} 层音盾` : ''}</p>{forms.length > 0 && <p className="farm-final-build">✦ {RECIPES.filter((recipe) => forms.includes(recipe.weapon)).map((recipe) => recipe.name).join(' ＋ ')}</p>}<button className="farm-primary" onClick={restart}>再来一局，换种奏法 ↗</button><button className="farm-text-button" onClick={() => { const text = farmShareText(round, day); navigator.clipboard?.writeText(text)?.then(() => { setCopied(true); if (copiedTimer.current) clearTimeout(copiedTimer.current); copiedTimer.current = setTimeout(() => setCopied(false), 2400) }).catch(() => setCopied(false)) }}>{copied ? '已复制 ✓' : '复制战绩'}</button><BuildSummary gear={view.gear} /><RunTimeline samples={timeline} marks={evolutionTicks} seconds={(view.tick / FPS)} /><QuestList quests={todayQuests} log={quests} fresh={freshQuests} /><div className="farm-wallet-reward">{rewardError ? <><span role="alert">{rewardError}</span><button className="farm-text-button" onClick={claimReward}>重试领取 {number(round?.coins ?? 0)} 金币</button></> : <>本局获得 ✦ {number(round?.coins ?? 0)} 金币<small>钱包共 {number(profile.coins)} 金币 · 用来解锁新角色</small></>}<button className="farm-result-shop" onClick={() => { setProfile(loadFarmProfile()); openPanel('shop') }}>去角色商店 ↗</button></div><FarmBoard round={round} /></section>}
    </div>{showPerformance && <output className="farm-performance" aria-label="性能诊断">渲染 {performanceView.fps} FPS · 绘制 {performanceView.drawMs} ms · 位移 {performanceView.moves} 次/秒 · 坐标 {view.position.join(",")} </output>}<footer className="farm-footer">一点音乐，一整场快乐 ♡ <span>原创合成音乐 · 演示版</span></footer></div>
    {(panel || upgrade) && <div className="farm-backdrop"><section className={`farm-dialog ${upgrade ? 'farm-upgrade-dialog' : panel === 'shop' ? 'farm-shop-dialog' : ''}`} ref={modal} role="dialog" aria-modal="true" aria-label={upgrade ? '选择升级' : panel === 'board' ? '生存排行榜' : panel === 'help' ? '玩法与进化配方' : panel === 'shop' ? '角色商店' : panel === 'badges' ? '成就墙' : '游戏暂停'} onKeyDown={trap}>
    {upgrade ? <><small className="farm-eyebrow">LEVEL UP · 时间已暂停</small><h2>新成员，选你喜欢的！</h2><p>成员负责攻击，装备负责强化。都满级，自动进化成终极乐器。</p><div className="farm-choices">{view.offered.map((id, index) => { const item = talent(id), recipe = RECIPES.find((entry) => entry.weapon === id || entry.chip === id)!; const nextGear = { ...view.gear, [id]: view.gear[id] + 1 }; const willEvolve = evolved(nextGear).includes(recipe.weapon) && !forms.includes(recipe.weapon); return <button key={id} onClick={() => select(id)} style={{ '--talent-color': item.color } as React.CSSProperties}><i className="farm-choice-key" aria-hidden="true">{index + 1}</i><span className="farm-choice-icon">{item.icon}</span><small>{item.kind === 'weapon' ? '乐队成员' : '乐队装备'} · {item.tag}</small><b>{item.name}<em>Lv.{view.gear[id]} → {view.gear[id] + 1}</em></b><p>{item.description}</p><div className="farm-recipe-progress"><span>成员 {talent(recipe.weapon).name} {nextGear[recipe.weapon]}/3</span><span>装备 {talent(recipe.chip).name} {nextGear[recipe.chip]}/3</span></div><strong>{willEvolve ? `✦ 这次解锁 ${recipe.name}` : `满级进化 → ${recipe.name}`}</strong></button> })}</div></> : <><button className="farm-close" aria-label="关闭弹窗" onClick={closePanel}>×</button>{panel === 'shop' ? <CharacterShop profile={profile} onChange={setProfile} /> : panel === 'badges' ? <BadgeWall log={badges} career={career} /> : panel === 'board' ? <FarmBoard /> : panel === 'pause' ? <><div className="farm-modal-icon">☾</div><h2>乐队等你回来 ♡</h2><p>战斗和计时已暂停，乐队和构筑都还在。</p><button className="farm-primary" onClick={closePanel}>继续战斗 ↗</button><button className="farm-text-button" onClick={() => { const next = saveFarmSettings({ effects: !settings.effects }); settingsRef.current = next; setSettings(next) }}>特效：{settings.effects ? '开' : '关（省电）'}</button><p className="farm-pause-goals"><small>今日词缀 {modifier.icon} {modifier.name}</small><QuestList quests={todayQuests} log={quests} /></p><button className="farm-text-button" onClick={restart}>重新开始</button></> : <><small className="farm-eyebrow">YOUR LITTLE BAND</small><h2>用你的乐队，击退怪潮</h2><p>手机按住任意位置当摇杆，朝想去的方向拖动即可走位，松手停住；电脑移动鼠标指针即可走位，镜头跟随角色，无边界探索。鼠标移回中央或移出战场可停住，乐队成员自动攻击附近怪物。注意血条，躲开怪物、粉色弹幕和红色预警圈，捡回血爱心（掉落有限，会消失）。捡经验升级，三选一让新成员加入或强化已有装备；能量满了，点「音浪爆发」清弹幕并获得短暂无敌。</p><div className="farm-recipes">{RECIPES.map((recipe) => <div key={recipe.weapon}><span>{recipe.icon}</span><div><b>{recipe.name}</b><small>{talent(recipe.weapon).name} Lv.3 ＋ {talent(recipe.chip).name} Lv.3</small><p>{recipe.description}</p></div></div>)}</div><p className="farm-help-keyboard">升级弹窗里按数字键 1–9 直接选择。方向键 / WASD 移动，空格释放音浪爆发。离开页面自动暂停。不限时，生命归零后结算；怪潮会持续增强，无限总榜保留每位玩家的历史最高分。</p><button className="farm-primary" onClick={closePanel}>懂啦，开战！ ↗</button></>}</>}
    </section></div>}
  </div>
}

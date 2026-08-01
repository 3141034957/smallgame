import { useEffect, useRef, useState } from 'react'
import type {
  CSSProperties,
  FormEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import './index.less'
import { CHARACTERS, getSelected } from '@/pages/Shop'
import { addStars, getStarBalance } from '@/utils/starCurrency'

type GameStatus = 'ready' | 'playing' | 'paused' | 'over' | 'reviving'
type NoteKind = 'quarter' | 'eighth' | 'double-eighth' | 'sixteenth' | 'sharp' | 'natural'
type TempoEffect = 'speed-up' | 'slow-down' | 'double-score' | 'freeze'

type Platform = {
  id: number
  x: number
  width: number
  reward: 1 | 1.5
  treat?: 'star'
  note?: NoteKind
}

type FrameState = {
  phase: number
  platformIndex: number
  playerX: number
  falling: number
  fever: number
}

type LandingImpact = {
  id: number
  x: number
  perfect: boolean
  reward: number
}

type NoteFeedback = {
  id: number
  kind: NoteKind
  symbol: string
  label: string
}

const HOP_DURATION = 840
const FEVER_DURATION = 5000
const TEMPO_EFFECT_DURATION = 5000
const PAINT_EFFECT_DURATION = 4000
const DOUBLE_SCORE_DURATION = 8000
const FREEZE_DURATION = 3000
const SPEED_STEP_INTERVAL = 10
const SPEED_STEP_AMOUNT = 0.05
const MAX_PROGRESSION_SPEED = 1.7
const VISIBLE_PLATFORMS = 6
const PLATFORM_AREA_SCALE = 2 / 3
const BOTTOM_HORIZONTAL_SPREAD = 0.46
const NOTE_FREQUENCIES = [523.25, 587.33, 659.25, 783.99]
const ROUTE_PATTERN = [
  -0.38, 0.38, -0.46, 0.46,
  -0.52, -0.18, 0.18, 0.52,
  0.44, 0.34, -0.28, -0.48,
  0, 0.56, 0, -0.56,
]
const EASY_ROUTE_PATTERN = [0, 0.28, -0.25, 0.42, -0.38, 0.55, -0.5]
const NOTE_EFFECTS: Record<NoteKind, {
  symbol: string
  label: string
  effect: TempoEffect | 'shake' | 'paint'
}> = {
  quarter: { symbol: '♩', label: '加速 · 5秒', effect: 'speed-up' },
  eighth: { symbol: '♪', label: '减速 · 5秒', effect: 'slow-down' },
  'double-eighth': { symbol: '♫', label: '机械震荡 · 0.7秒', effect: 'shake' },
  sixteenth: { symbol: '♬', label: '能量墨迹 · 4秒', effect: 'paint' },
  sharp: { symbol: '♯', label: '狂热旋律 · 8秒', effect: 'double-score' },
  natural: { symbol: '♮', label: '冰霜凝滞 · 3秒', effect: 'freeze' },
}
const NOTE_KINDS = Object.keys(NOTE_EFFECTS) as NoteKind[]

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const API_BASE = '/api'
const NICKNAME_STORAGE_KEY = 'clockwork-player-nickname-v1'

async function submitScore(
  name: string,
  score: number,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score }),
      signal,
    })
    return response.ok
  } catch {
    return false
  }
}

async function fetchLeaderboard(
  signal?: AbortSignal,
): Promise<Array<{ rank: number; name: string; score: number }>> {
  try {
    const res = await fetch(`${API_BASE}/leaderboard`, { signal })
    if (!res.ok) return []
    const json = await res.json()
    return json.data || []
  } catch {
    return []
  }
}

const GEAR_SPOKES = Array.from({ length: 10 }, (_, index) => index)
const CHAIN_LINKS = Array.from({ length: 8 }, (_, index) => index)

function MechanicalGear({ variant }: { variant: 'upper' | 'lower' | 'rear' }) {
  return (
    <div className={`mechanical-gear mechanical-gear--${variant}`}>
      {GEAR_SPOKES.map((spoke) => (
        <i
          className="gear-spoke"
          style={{ '--spoke-angle': `${spoke * 36}deg` } as CSSProperties}
          key={spoke}
        />
      ))}
      <span className="gear-hub">
        <b />
      </span>
    </div>
  )
}

function MechanicalDecor() {
  return (
    <div className="mechanical-decor" aria-hidden="true">
      <div className="cavern-facet cavern-facet--one" />
      <div className="cavern-facet cavern-facet--two" />
      <div className="cavern-facet cavern-facet--three" />
      <div className="conduit conduit--left" />
      <div className="conduit conduit--right" />

      <div className="chain chain--left">
        {CHAIN_LINKS.map((link) => <i key={link} />)}
      </div>
      <div className="chain chain--right">
        {CHAIN_LINKS.map((link) => <i key={link} />)}
      </div>

      <MechanicalGear variant="rear" />
      <MechanicalGear variant="upper" />
      <MechanicalGear variant="lower" />

      <div className="rotor-arm rotor-arm--one" />
      <div className="rotor-arm rotor-arm--two" />
      <div className="rotor-joint rotor-joint--one" />
      <div className="rotor-joint rotor-joint--two" />

      <div className="hanging-bell hanging-bell--one"><i /></div>
      <div className="hanging-bell hanging-bell--two"><i /></div>
      <div className="hanging-bell hanging-bell--three"><i /></div>
    </div>
  )
}

function createPlatforms(): Platform[] {
  const items: Platform[] = [{
    id: 0,
    x: 0,
    width: 0.92,
    reward: 1,
  }]
  let previousX = 0

  for (let id = 1; id < 80; id += 1) {
    const platform = createPlatform(id, previousX)
    items.push(platform)
    previousX = platform.x
  }

  return items
}

function ensurePlatformsThrough(platforms: Platform[], targetId: number) {
  let latestPlatform = platforms[platforms.length - 1]
  while (latestPlatform.id < targetId) {
    latestPlatform = createPlatform(latestPlatform.id + 1, latestPlatform.x)
    platforms.push(latestPlatform)
  }
}

function createPlatform(id: number, previousX: number): Platform {
  const easyStart = id <= 6
  const hasStar = id % 6 === 0
  const x = easyStart
    ? EASY_ROUTE_PATTERN[id]
    : (() => {
        const patternIndex = (id - 7) % ROUTE_PATTERN.length
        const phrase = Math.floor((id - 7) / ROUTE_PATTERN.length)
        const phraseDrift = Math.sin(phrase * 1.31) * 0.045
        const plannedX = ROUTE_PATTERN[patternIndex] * 1.8 + phraseDrift
        return clamp(plannedX * 0.95 + previousX * 0.05, -0.87, 0.87)
      })()
  const reward = !hasStar && Math.random() < 1 / 15 ? 1.5 : 1

  return {
    id,
    x,
    width: easyStart ? 0.88 : 0.66 + ((id * 17) % 21) / 100,
    reward,
    treat: hasStar ? 'star' : undefined,
    note: !hasStar && reward === 1 && Math.random() < 0.1
      ? NOTE_KINDS[Math.floor(Math.random() * NOTE_KINDS.length)]
      : undefined,
  }
}

function slotY(distance: number) {
  if (distance >= 0) {
    return 20 + 64 * Math.exp(-0.42 * distance)
  }
  return 84 + Math.abs(distance) * 30
}

function slotScale(distance: number) {
  return 0.34 + 0.66 * Math.exp(-0.27 * Math.max(0, distance))
}

function slotHorizontalSpread(scale: number) {
  return scale * (0.3 + 0.16 * scale)
}

function progressionSpeed(platformIndex: number) {
  const speedSteps = Math.floor(platformIndex / SPEED_STEP_INTERVAL)
  return Math.min(
    MAX_PROGRESSION_SPEED,
    1 + speedSteps * SPEED_STEP_AMOUNT,
  )
}

function formatScore(score: number) {
  return String(score).padStart(5, '0')
}

function Home() {
  const selectedCharacter =
    CHARACTERS.find((character) => character.id === getSelected()) ??
    CHARACTERS.find((character) => character.id === 'steampunk') ??
    CHARACTERS[0]
  const gameRef = useRef<HTMLDivElement>(null)
  const platformsRef = useRef(createPlatforms())
  const platformOffsetRef = useRef(0)
  const statusRef = useRef<GameStatus>('ready')
  const hopElapsedRef = useRef(0)
  const platformIndexRef = useRef(0)
  const playerXRef = useRef(0)
  const targetXRef = useRef(0)
  const moveDirectionRef = useRef(0)
  const scoreRef = useRef(0)
  const pendingScoreRef = useRef<number | null>(null)
  const streakRef = useRef(0)
  const bounceIdRef = useRef(-1)
  const feverTimeRef = useRef(0)
  const fallProgressRef = useRef(0)
  const tempoEffectRef = useRef<{ kind: TempoEffect; remaining: number } | null>(null)
  const paintEffectTimeRef = useRef(0)
  const freezeTimeRef = useRef(0)
  const scoreMultiplierRef = useRef(1)
  const audioContextRef = useRef<AudioContext | null>(null)
  const activeAudioNodesRef = useRef(new Map<OscillatorNode, GainNode>())
  const backgroundMusicRef = useRef<HTMLAudioElement>(null)
  const bgmRef = useRef<HTMLAudioElement | null>(null)
  const playerRef = useRef<HTMLDivElement>(null)
  const playerShadowRef = useRef<HTMLDivElement>(null)
  const feverBarRef = useRef<HTMLElement>(null)
  const platformElementsRef = useRef(new Map<number, HTMLDivElement>())
  const activeAnimationsRef = useRef(new Set<Animation>())
  const requestControllersRef = useRef(new Set<AbortController>())
  const focusFrameRef = useRef(0)
  const gameSizeRef = useRef({ width: 480, height: 920 })
  const gameBoundsRef = useRef({ left: 0, width: 480 })
  const frameRef = useRef<FrameState>({
    phase: 0,
    platformIndex: 0,
    playerX: 0,
    falling: 0,
    fever: 0,
  })

  const [status, setStatus] = useState<GameStatus>('ready')
  const [score, setScore] = useState(0)
  const [stars, setStars] = useState(getStarBalance)
  const [streak, setStreak] = useState(0)
  const [best, setBest] = useState(() => Number(localStorage.getItem('cloud-cat-hop-best-v1') ?? 0))
  const bestRef = useRef(best)
  const [platformIndex, setPlatformIndex] = useState(0)
  const [feedback, setFeedback] = useState({ label: '', id: 0 })
  const [bounceId, setBounceId] = useState(-1)
  const [isFever, setIsFever] = useState(false)
  const [isDoubleScore, setIsDoubleScore] = useState(false)
  const [isFrozen, setIsFrozen] = useState(false)
  const [paceMultiplier, setPaceMultiplier] = useState(1)
  const [paintEffectId, setPaintEffectId] = useState(0)
  const [noteFeedback, setNoteFeedback] = useState<NoteFeedback | null>(null)
  const [impact, setImpact] = useState<LandingImpact>({
    id: 0,
    x: 50,
    perfect: false,
    reward: 1,
  })
  const [showingAd, setShowingAd] = useState(false)
  const [adCountdown, setAdCountdown] = useState(0)
  const [reviveCountdown, setReviveCountdown] = useState<number | null>(null)
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null)
  const [leaderboardData, setLeaderboardData] = useState<Array<{ rank: number; name: string; score: number }>>([])
  const [adCanSkip, setAdCanSkip] = useState(false)
  const [nickname, setNickname] = useState(
    () => localStorage.getItem(NICKNAME_STORAGE_KEY)?.trim() ?? '',
  )
  const [nicknameDraft, setNicknameDraft] = useState('')
  const [showNicknamePrompt, setShowNicknamePrompt] = useState(false)
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const changeStatus = (next: GameStatus) => {
    statusRef.current = next
    setStatus(next)
    const backgroundMusic = backgroundMusicRef.current
    if (!backgroundMusic) return

    if (next === 'playing') {
      backgroundMusic.volume = 0.42
      void backgroundMusic.play().catch(() => {
        // 某些浏览器会在缺少用户手势时拒绝播放，下一次点击会再次尝试。
      })
    } else {
      backgroundMusic.pause()
    }
  }

  const refreshLeaderboard = () => {
    const controller = new AbortController()
    requestControllersRef.current.add(controller)

    void fetchLeaderboard(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setLeaderboardData(data)
      })
      .finally(() => {
        requestControllersRef.current.delete(controller)
      })
  }

  const submitScoreAndRefresh = (name: string, nextScore: number) => {
    const controller = new AbortController()
    requestControllersRef.current.add(controller)

    void (async () => {
      try {
        const success = await submitScore(name, nextScore, controller.signal)
        if (!success || controller.signal.aborted) return
        const data = await fetchLeaderboard(controller.signal)
        if (!controller.signal.aborted) setLeaderboardData(data)
      } finally {
        requestControllersRef.current.delete(controller)
      }
    })()
  }

  const focusGameWithoutScrolling = () => {
    const game = gameRef.current
    if (!game) return
    game.scrollTop = 0
    game.focus({ preventScroll: true })
    if (focusFrameRef.current) cancelAnimationFrame(focusFrameRef.current)
    focusFrameRef.current = requestAnimationFrame(() => {
      focusFrameRef.current = 0
      game.scrollTop = 0
    })
  }

  const animateGame = (
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ) => {
    const animation = gameRef.current?.animate(keyframes, options)
    if (!animation) return

    activeAnimationsRef.current.add(animation)
    const release = () => {
      animation.removeEventListener('finish', release)
      animation.removeEventListener('cancel', release)
      activeAnimationsRef.current.delete(animation)
    }
    animation.addEventListener('finish', release, { once: true })
    animation.addEventListener('cancel', release, { once: true })
  }

  const ensureAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }
    if (audioContextRef.current.state === 'suspended') {
      void audioContextRef.current.resume()
    }
    return audioContextRef.current
  }

  const playNoteSound = (platform: Platform, perfect: boolean, fever: boolean) => {
    const context = ensureAudioContext()
    const now = context.currentTime
    const frequency = NOTE_FREQUENCIES[platform.id % NOTE_FREQUENCIES.length]

    const addVoice = (
      voiceFrequency: number,
      duration: number,
      volume: number,
      type: OscillatorType,
    ) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = type
      oscillator.frequency.setValueAtTime(voiceFrequency, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.018)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
      oscillator.connect(gain)
      gain.connect(context.destination)
      activeAudioNodesRef.current.set(oscillator, gain)
      oscillator.onended = () => {
        activeAudioNodesRef.current.delete(oscillator)
        oscillator.disconnect()
        gain.disconnect()
      }
      oscillator.start(now)
      oscillator.stop(now + duration + 0.03)
    }

    addVoice(frequency, perfect ? 0.42 : 0.28, perfect ? 0.18 : 0.11, 'sine')
    if (perfect) addVoice(frequency * 1.5, 0.34, 0.075, 'triangle')
    if (fever) addVoice(frequency / 2, 0.2, 0.09, 'square')
  }

  const getActiveHopDuration = () => {
    let duration = HOP_DURATION / progressionSpeed(platformIndexRef.current)
    if (tempoEffectRef.current?.kind === 'speed-up') duration /= 1.35
    if (tempoEffectRef.current?.kind === 'slow-down') duration *= 1.35
    if (feverTimeRef.current > 0) duration /= 1.1
    return duration
  }

  const triggerNoteEffect = (note: NoteKind) => {
    const noteEffect = NOTE_EFFECTS[note]
    setNoteFeedback({
      id: Date.now(),
      kind: note,
      symbol: noteEffect.symbol,
      label: noteEffect.label,
    })

    if (noteEffect.effect === 'speed-up' || noteEffect.effect === 'slow-down') {
      tempoEffectRef.current = {
        kind: noteEffect.effect,
        remaining: TEMPO_EFFECT_DURATION,
      }
    }

    if (noteEffect.effect === 'shake') {
      animateGame(
        [
          { transform: 'translate(0, 0) rotate(0)' },
          { transform: 'translate(-8px, 3px) rotate(-0.6deg)' },
          { transform: 'translate(7px, -4px) rotate(0.5deg)' },
          { transform: 'translate(-5px, -2px) rotate(-0.35deg)' },
          { transform: 'translate(5px, 3px) rotate(0.3deg)' },
          { transform: 'translate(0, 0) rotate(0)' },
        ],
        { duration: 700, easing: 'ease-out' },
      )
    }

    if (noteEffect.effect === 'paint') {
      paintEffectTimeRef.current = PAINT_EFFECT_DURATION
      setPaintEffectId(Date.now())
    }

    if (noteEffect.effect === 'double-score') {
      scoreMultiplierRef.current = 2
      setIsDoubleScore(true)
      // Brief flash via CSS class (handled by .game--double-score-flash)
      const gameEl = gameRef.current
      if (gameEl) {
        gameEl.classList.add('game--double-score-flash')
        window.setTimeout(() => gameEl.classList.remove('game--double-score-flash'), 500)
      }
      // Reset after duration
      window.setTimeout(() => {
        scoreMultiplierRef.current = 1
        setIsDoubleScore(false)
      }, DOUBLE_SCORE_DURATION)
    }

    if (noteEffect.effect === 'freeze') {
      freezeTimeRef.current = FREEZE_DURATION
      setIsFrozen(true)
    }
  }

  const paintFrame = (nextFrame: FrameState) => {
    const { width: gameWidth, height: gameHeight } = gameSizeRef.current
    const hopArc = Math.sin(nextFrame.phase * Math.PI)
    const playerX = nextFrame.playerX * gameWidth * BOTTOM_HORIZONTAL_SPREAD
    const playerY = (hopArc * 0.26 - nextFrame.falling * 0.48) * gameHeight
    const playerRotation =
      (targetXRef.current - nextFrame.playerX) * 16 + nextFrame.falling * 85

    if (playerRef.current) {
      playerRef.current.style.transform =
        `translate3d(calc(-50% + ${playerX}px), ${-playerY}px, 0) ` +
        `rotate(${playerRotation}deg) scale(${1 - hopArc * 0.06})`
      playerRef.current.style.opacity = String(1 - nextFrame.falling * 0.75)
    }
    if (playerShadowRef.current) {
      playerShadowRef.current.style.opacity = String(0.34 - hopArc * 0.24)
    }
    if (feverBarRef.current) {
      feverBarRef.current.style.transform = `scaleX(${nextFrame.fever})`
    }

    const localPlatformIndex = nextFrame.platformIndex - platformOffsetRef.current
    const visible = platformsRef.current.slice(
      localPlatformIndex,
      localPlatformIndex + VISIBLE_PLATFORMS,
    )
    visible.forEach((platform, index) => {
      const element = platformElementsRef.current.get(platform.id)
      if (!element) return

      const distance = index - nextFrame.phase
      const scale = slotScale(distance)
      const x = platform.x * gameWidth * slotHorizontalSpread(scale)
      const y = slotY(distance) * gameHeight / 100
      const opacity = distance < 0 ? Math.max(0, 1 + distance * 14) : 1
      const treatScale = (0.55 + scale * 0.45) / scale

      element.style.setProperty('--platform-x', `${x}px`)
      element.style.setProperty('--platform-y', `${y}px`)
      element.style.setProperty('--platform-scale', String(scale))
      element.style.setProperty('--platform-opacity', String(opacity))
      element.style.setProperty('--platform-depth', String(100 - index))
      element.style.setProperty('--treat-scale', String(treatScale))
    })
  }

  const startGame = () => {
    ensureAudioContext()
    if (!bgmRef.current) {
      bgmRef.current = new Audio('/audio/pigen-pop.mp3')
      bgmRef.current.loop = true
    }
    bgmRef.current.currentTime = 0
    bgmRef.current.play().catch(() => {})
    if (backgroundMusicRef.current) {
      backgroundMusicRef.current.currentTime = 2
    }
    platformsRef.current = createPlatforms()
    platformOffsetRef.current = 0
    hopElapsedRef.current = 0
    fallProgressRef.current = 0
    platformIndexRef.current = 0
    playerXRef.current = 0
    targetXRef.current = 0
    moveDirectionRef.current = 0
    scoreRef.current = 0
    streakRef.current = 0
    feverTimeRef.current = 0
    tempoEffectRef.current = null
    paintEffectTimeRef.current = 0
    setScore(0)
    setStreak(0)
    setFeedback({ label: '', id: 0 })
    setBounceId(-1)
    setIsFever(false)
    setPaceMultiplier(1)
    setPaintEffectId(0)
    setNoteFeedback(null)
    setShareStatus('idle')
    setReviveCountdown(null)
    setImpact({ id: 0, x: 50, perfect: false, reward: 1 })
    bounceIdRef.current = -1
    const initialFrame = { phase: 0, platformIndex: 0, playerX: 0, falling: 0, fever: 0 }
    frameRef.current = initialFrame
    setPlatformIndex(0)
    paintFrame(initialFrame)
    changeStatus('playing')
    focusGameWithoutScrolling()
  }

  const completeReturnToHome = () => {
    bgmRef.current?.pause()
    if (bgmRef.current) bgmRef.current.currentTime = 0
    moveDirectionRef.current = 0
    fallProgressRef.current = 0
    setShowingAd(false)
    setAdCountdown(0)
    setAdCanSkip(true)
    setReviveCountdown(null)
    changeStatus('ready')
    focusGameWithoutScrolling()
  }

  const returnToHome = () => {
    if (nickname) {
      completeReturnToHome()
      return
    }
    setNicknameDraft('')
    setShowNicknamePrompt(true)
  }

  const copyCurrentLink = async () => {
    const link = window.location.href
    let copied = false

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(link)
        copied = true
      }
    } catch {
      copied = false
    }

    if (!copied) {
      const textarea = document.createElement('textarea')
      textarea.value = link
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      try {
        copied = document.execCommand('copy')
      } catch {
        copied = false
      }
      textarea.remove()
    }

    setShareStatus(copied ? 'copied' : 'failed')
  }

  const saveNicknameAndReturnHome = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextNickname = nicknameDraft.trim().replace(/\s+/g, ' ')
    if (!nextNickname) return

    localStorage.setItem(NICKNAME_STORAGE_KEY, nextNickname)
    setNickname(nextNickname)
    setShowNicknamePrompt(false)

    const pendingScore = pendingScoreRef.current
    if (pendingScore !== null) {
      pendingScoreRef.current = null
      submitScoreAndRefresh(nextNickname, pendingScore)
    }

    completeReturnToHome()
  }

  const beginReviveCountdown = () => {
    ensureAudioContext()
    bgmRef.current?.pause()
    fallProgressRef.current = 0
    hopElapsedRef.current = 0
    feverTimeRef.current = 0
    setIsFever(false)
    freezeTimeRef.current = 0
    setIsFrozen(false)
    scoreMultiplierRef.current = 1
    setIsDoubleScore(false)
    setFeedback({ label: '', id: 0 })
    setBounceId(-1)
    setImpact({ id: 0, x: 50, perfect: false, reward: 1 })
    bounceIdRef.current = -1

    const nextFrame = {
      phase: 0,
      platformIndex: platformIndexRef.current,
      playerX: playerXRef.current,
      falling: 0,
      fever: 0,
    }
    frameRef.current = nextFrame
    paintFrame(nextFrame)
    changeStatus('reviving')
    setReviveCountdown(3)
    focusGameWithoutScrolling()
  }

  const requestAdPlay = () => {
    setAdCountdown(10)
    setAdCanSkip(true)
    setShowingAd(true)
  }

  const skipAd = () => {
    if (!adCanSkip) return
    setShowingAd(false)
    beginReviveCountdown()
  }

  useEffect(() => {
    if (!showingAd || adCountdown <= 0) return
    if (adCountdown <= 7 && !adCanSkip) setAdCanSkip(true)
    const timer = setTimeout(() => {
      const next = adCountdown - 1
      setAdCountdown(next)
      if (next <= 0) {
        setShowingAd(false)
        beginReviveCountdown()
      }
    }, 1000)
    return () => clearTimeout(timer)
  }, [showingAd, adCountdown, adCanSkip])

  useEffect(() => {
    if (reviveCountdown === null) return

    const timer = window.setTimeout(() => {
      if (reviveCountdown > 1) {
        setReviveCountdown(reviveCountdown - 1)
        return
      }

      setReviveCountdown(null)
      bgmRef.current?.play().catch(() => {})
      changeStatus('playing')
      focusGameWithoutScrolling()
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [reviveCountdown])

  useEffect(() => {
    if (resumeCountdown === null) return

    const timer = window.setTimeout(() => {
      if (resumeCountdown > 1) {
        setResumeCountdown(resumeCountdown - 1)
        return
      }

      setResumeCountdown(null)
      bgmRef.current?.play().catch(() => {})
      changeStatus('playing')
      focusGameWithoutScrolling()
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [resumeCountdown])

  useEffect(() => {
    const game = gameRef.current
    if (!game) return

    const updateGameMetrics = () => {
      const bounds = game.getBoundingClientRect()
      gameSizeRef.current = { width: bounds.width, height: bounds.height }
      gameBoundsRef.current = { left: bounds.left, width: bounds.width }
      paintFrame(frameRef.current)
    }

    updateGameMetrics()
    const resizeObserver = new ResizeObserver(updateGameMetrics)
    resizeObserver.observe(game)
    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    let animationFrame = 0
    let lastTime = performance.now()

    const tick = (time: number) => {
      const delta = Math.min(34, time - lastTime)
      lastTime = time

      if (statusRef.current === 'playing') {
        if (feverTimeRef.current > 0) {
          feverTimeRef.current = Math.max(0, feverTimeRef.current - delta)
          if (feverTimeRef.current === 0) setIsFever(false)
        }
        if (tempoEffectRef.current) {
          tempoEffectRef.current.remaining = Math.max(
            0,
            tempoEffectRef.current.remaining - delta,
          )
          if (tempoEffectRef.current.remaining === 0) {
            tempoEffectRef.current = null
          }
        }
        if (paintEffectTimeRef.current > 0) {
          paintEffectTimeRef.current = Math.max(0, paintEffectTimeRef.current - delta)
          if (paintEffectTimeRef.current === 0) setPaintEffectId(0)
        }
        if (scoreMultiplierRef.current > 1) {
          // Double score is timed via a setTimeout chain set in triggerNoteEffect
          // We just check and clear the visual state here
        }
        if (freezeTimeRef.current > 0) {
          freezeTimeRef.current = Math.max(0, freezeTimeRef.current - delta)
          if (freezeTimeRef.current === 0) {
            setIsFrozen(false)
          }
        }

        // When frozen, skip all movement
        if (freezeTimeRef.current > 0) {
          animationFrame = requestAnimationFrame(tick)
          return
        }

        const hopDuration = getActiveHopDuration()
        hopElapsedRef.current += delta
        targetXRef.current = clamp(
          targetXRef.current + moveDirectionRef.current * delta * 0.00155,
          -1,
          1,
        )
        playerXRef.current += (targetXRef.current - playerXRef.current) * Math.min(1, delta * 0.016)

        if (hopElapsedRef.current >= hopDuration) {
          hopElapsedRef.current -= hopDuration
          const targetIndex = platformIndexRef.current + 1
          ensurePlatformsThrough(
            platformsRef.current,
            targetIndex + VISIBLE_PLATFORMS - 1,
          )
          const target = platformsRef.current[targetIndex - platformOffsetRef.current]
          const missDistance = Math.abs(playerXRef.current - target.x)
          const landed = missDistance < target.width * PLATFORM_AREA_SCALE * 0.62

          if (landed) {
            platformIndexRef.current += 1
            if (platformsRef.current.length > 200) {
              const removed = platformsRef.current.length - 200
              platformsRef.current.splice(0, removed)
              platformOffsetRef.current += removed
            }
            setPlatformIndex(platformIndexRef.current)
            setPaceMultiplier(progressionSpeed(platformIndexRef.current))
            const perfect = missDistance < target.width * PLATFORM_AREA_SCALE * 0.2
            const isSpecial = target.reward > 1 || target.treat === 'star' || Boolean(target.note)

            if (isSpecial) {
              bounceIdRef.current = target.id
              setBounceId(target.id)
              setImpact({
                id: Date.now(),
                x: 50 + playerXRef.current * 34,
                perfect,
                reward: target.reward,
              })
            }
            streakRef.current = perfect ? streakRef.current + 1 : 0
            let feverActive = feverTimeRef.current > 0
            if (perfect && streakRef.current >= 8 && !feverActive) {
              feverTimeRef.current = FEVER_DURATION
              feverActive = true
              setIsFever(true)
            }
            const baseScore = 100 + (perfect ? Math.min(streakRef.current, 8) * 25 : 0)
            const feverMultiplier = feverActive ? 2 : 1
            const doubleMultiplier = scoreMultiplierRef.current
            const earned = Math.round(baseScore * target.reward * feverMultiplier * doubleMultiplier)
            scoreRef.current += earned
            setScore(scoreRef.current)
            if (target.treat === 'star') {
              setStars(addStars(1))
            }
            setStreak(streakRef.current)
            setFeedback({
              label: target.treat === 'star'
                ? '★ +1'
                : perfect
                  ? 'Perfect'
                  : missDistance < target.width * PLATFORM_AREA_SCALE * 0.4
                    ? 'Great'
                    : 'Nice',
              id: Date.now(),
            })
            if (target.note) playNoteSound(target, perfect, feverActive)
            if (perfect && isSpecial) {
              animateGame(
                [
                  { transform: 'translateX(0)' },
                  { transform: 'translateX(-3px)' },
                  { transform: 'translateX(3px)' },
                  { transform: 'translateX(-2px)' },
                  { transform: 'translateX(0)' },
                ],
                { duration: 145, easing: 'ease-out' },
              )
            }
            if (target.note) triggerNoteEffect(target.note)
          } else {
            fallProgressRef.current = 0
            const nextBest = Math.max(bestRef.current, scoreRef.current)
            bestRef.current = nextBest
            setBest(nextBest)
            localStorage.setItem('cloud-cat-hop-best-v1', String(nextBest))
            const storedNickname = localStorage.getItem(NICKNAME_STORAGE_KEY)?.trim()
            if (storedNickname) {
              pendingScoreRef.current = null
              submitScoreAndRefresh(storedNickname, scoreRef.current)
            } else {
              pendingScoreRef.current = scoreRef.current
            }
            changeStatus('over')
          }
        }

        const activeHopDuration = getActiveHopDuration()
        const nextFrame = {
          phase: hopElapsedRef.current / activeHopDuration,
          platformIndex: platformIndexRef.current,
          playerX: playerXRef.current,
          falling: 0,
          fever: feverTimeRef.current / FEVER_DURATION,
        }
        frameRef.current = nextFrame
        paintFrame(nextFrame)
      } else if (statusRef.current === 'over' && fallProgressRef.current < 1) {
        fallProgressRef.current = Math.min(1, fallProgressRef.current + delta / 650)
        const nextFrame = { ...frameRef.current, falling: fallProgressRef.current }
        frameRef.current = nextFrame
        paintFrame(nextFrame)
      }

      animationFrame = requestAnimationFrame(tick)
    }

    animationFrame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrame)
  }, [])

  useEffect(() => {
    refreshLeaderboard()
  }, [])

  useEffect(() => {
    const backgroundMusic = backgroundMusicRef.current
    const requestControllers = requestControllersRef.current
    const activeAnimations = activeAnimationsRef.current
    const activeAudioNodes = activeAudioNodesRef.current
    const platformElements = platformElementsRef.current

    return () => {
      if (focusFrameRef.current) {
        cancelAnimationFrame(focusFrameRef.current)
        focusFrameRef.current = 0
      }

      requestControllers.forEach((controller) => controller.abort())
      requestControllers.clear()

      activeAnimations.forEach((animation) => animation.cancel())
      activeAnimations.clear()

      activeAudioNodes.forEach((gain, oscillator) => {
        oscillator.onended = null
        try {
          oscillator.stop()
        } catch {
          // Oscillator may already have stopped.
        }
        oscillator.disconnect()
        gain.disconnect()
      })
      activeAudioNodes.clear()

      backgroundMusic?.pause()
      if (backgroundMusic) {
        backgroundMusic.currentTime = 0
        backgroundMusic.removeAttribute('src')
        backgroundMusic.load()
      }

      if (bgmRef.current) {
        bgmRef.current.pause()
        bgmRef.current.removeAttribute('src')
        bgmRef.current.load()
        bgmRef.current = null
      }

      platformElements.clear()
      const audioContext = audioContextRef.current
      audioContextRef.current = null
      if (audioContext && audioContext.state !== 'closed') {
        void audioContext.close().catch(() => {
          // The browser may already be tearing down the audio device.
        })
      }
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') {
        event.preventDefault()
        moveDirectionRef.current = -1
      }
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') {
        event.preventDefault()
        moveDirectionRef.current = 1
      }
      if ((event.key === ' ' || event.key === 'Enter') && statusRef.current === 'ready') {
        event.preventDefault()
        startGame()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight' ||
        event.key.toLowerCase() === 'a' ||
        event.key.toLowerCase() === 'd'
      ) {
        moveDirectionRef.current = 0
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const updatePointerTarget = (
    event: ReactPointerEvent<HTMLDivElement>,
    refreshBounds = false,
  ) => {
    if (statusRef.current !== 'playing' || !gameRef.current) return
    if (refreshBounds) {
      const bounds = gameRef.current.getBoundingClientRect()
      gameBoundsRef.current = { left: bounds.left, width: bounds.width }
    }
    const bounds = gameBoundsRef.current
    const normalized = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
    targetXRef.current = clamp(normalized * 1.12, -1, 1)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    updatePointerTarget(event, true)
  }

  const localPlatformIndex = platformIndex - platformOffsetRef.current
  const visiblePlatforms = platformsRef.current.slice(
    localPlatformIndex,
    localPlatformIndex + VISIBLE_PLATFORMS,
  )

  return (
    <main className="game-shell">
      <audio
        ref={backgroundMusicRef}
        src="/assets/clockwork-cavern-bgm.mp3"
        preload="auto"
        loop
      />
      <div
        ref={gameRef}
        className={`game game--${status}${isFever ? ' game--fever' : ''}${isDoubleScore ? ' game--double-score' : ''}${isFrozen ? ' game--frozen' : ''}`}
        role="application"
        aria-label="齿轮跃迁小游戏"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={updatePointerTarget}
      >
        <div className="sky-glow" />
        <MechanicalDecor />

        <div className="runway" aria-hidden="true">
          <div className="runway-edge runway-edge--left" />
          <div className="runway-edge runway-edge--right" />
        </div>

        <header className="hud">
          <button
            className="round-button pause-button"
            type="button"
            aria-label={status === 'paused' ? '继续游戏' : '暂停游戏'}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              if (statusRef.current === 'playing') {
                bgmRef.current?.pause()
                changeStatus('paused')
              } else if (statusRef.current === 'paused') {
                bgmRef.current?.play().catch(() => {})
                changeStatus('playing')
              }
            }}
            disabled={status !== 'playing' && status !== 'paused'}
          >
            {status === 'paused' ? <span className="play-icon">▶</span> : <><i /><i /></>}
          </button>

          <div className="endless-status" aria-label={`无限模式，第 ${platformIndex} 层`}>
            <span>∞</span>
            <strong>{platformIndex}</strong>
            <small>层</small>
          </div>

          <div className="best-pill" aria-label={`拥有 ${stars} 颗星星`}>
            <span className="mini-cat star-wallet-icon">★</span>
            <span>星星</span>
            <strong>{stars}</strong>
          </div>
        </header>

        <div className="score">
          <span>SCORE</span>
          <strong>{formatScore(score)}</strong>
          <small>速度 ×{paceMultiplier.toFixed(2)}</small>
        </div>

        {isFever && (
          <div className="chorus-banner">
            <span>副歌模式</span>
            <strong>×2</strong>
            <i><b ref={feverBarRef} /></i>
          </div>
        )}

        {isDoubleScore && !isFever && (
          <div className="double-score-banner">
            <span>♯ 狂热旋律</span>
            <strong>×2</strong>
          </div>
        )}

        {feedback.label && status === 'playing' && (
          <div className="feedback" key={`feedback-${feedback.id}`}>
            <strong>{feedback.label}</strong>
            {streak > 1 && <span>×{streak}</span>}
          </div>
        )}

        {noteFeedback && status === 'playing' && (
          <div
            className={`note-effect-toast note-effect-toast--${noteFeedback.kind}`}
            key={`note-effect-${noteFeedback.id}`}
          >
            <strong>{noteFeedback.symbol}</strong>
            <span>{noteFeedback.label}</span>
          </div>
        )}

        {paintEffectId > 0 && status === 'playing' && (
          <div className="paint-splatter" key={`paint-${paintEffectId}`} aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <i
                className={`paint-splatter__blob paint-splatter__blob--${index + 1}`}
                key={index}
              />
            ))}
          </div>
        )}

        {impact.id > 0 && status === 'playing' && (
          <div
            className={`landing-impact${impact.perfect ? ' landing-impact--perfect' : ''}`}
            style={{ left: `${impact.x}%` }}
            key={`impact-${impact.id}`}
          >
            {[0, 1, 2, 3, 4, 5, 6, 7].map((particle) => (
              <i
                style={{ '--particle-angle': `${particle * 45}deg` } as CSSProperties}
                key={particle}
              />
            ))}
            {impact.reward > 1 && <strong>×{impact.reward}</strong>}
          </div>
        )}

        <div className="platform-layer" aria-hidden="true">
          {visiblePlatforms.map((platform, index) => {
            const currentFrame = frameRef.current
            const { width: gameWidth, height: gameHeight } = gameSizeRef.current
            const distance = index - currentFrame.phase
            const y = slotY(distance)
            const scale = slotScale(distance)
            const x = platform.x * gameWidth * slotHorizontalSpread(scale)
            const width = (108 + platform.width * 38) * PLATFORM_AREA_SCALE
            const opacity = distance < 0 ? Math.max(0, 1 + distance * 14) : 1
            const platformStyle = {
              '--platform-x': `${x}px`,
              '--platform-y': `${y * gameHeight / 100}px`,
              '--platform-width': `${width}px`,
              '--platform-scale': scale,
              '--platform-depth': 100 - index,
              '--platform-opacity': opacity,
              '--treat-scale': (0.55 + scale * 0.45) / scale,
              '--platform-note-size': `${width / 2}px`,
            } as CSSProperties

            return (
              <div
                className={[
                  'platform-wrap',
                  platform.id === bounceId ? 'is-bounced' : '',
                  platform.reward > 1 ? 'platform-wrap--risk' : '',
                ].filter(Boolean).join(' ')}
                style={platformStyle}
                key={platform.id}
                ref={(element) => {
                  if (element) platformElementsRef.current.set(platform.id, element)
                  else platformElementsRef.current.delete(platform.id)
                }}
              >
                <div className="platform">
                  {platform.reward > 1 && <span className="risk-badge">×1.5</span>}
                  <span className="platform-light" />
                  {platform.note && (
                    <span className={`platform-note platform-note--${platform.note}`}>
                      {NOTE_EFFECTS[platform.note].symbol}
                    </span>
                  )}
                  {platform.treat === 'star' && <span className="treat treat--star">★</span>}
                </div>
              </div>
            )
          })}
        </div>

        <div
          ref={playerRef}
          className={`player player--character-${selectedCharacter.id}`}
          aria-hidden="true"
          style={{
            '--char-glow': selectedCharacter.colors.glow,
          } as CSSProperties}
        >
          <div ref={playerShadowRef} className="player-shadow" />
          <div
            className={[
              'player-sprite',
              impact.id > 0 ? 'player-sprite--landed' : '',
              impact.perfect ? 'player-sprite--perfect' : '',
            ].filter(Boolean).join(' ')}
            key={`player-impact-${impact.id}`}
          >
            <img
              className="player-character-image"
              src={selectedCharacter.image}
              alt=""
              draggable={false}
            />
          </div>
          <span className="spark spark--one">✦</span>
          <span className="spark spark--two">★</span>
        </div>

        <div className="controls" aria-hidden="true">
          <span>拖动屏幕控制落点</span>
        </div>

        {status === 'ready' && (
          <div className="game-overlay game-overlay--ready" onPointerDown={(event) => event.stopPropagation()}>
            <div className="ready-panel">
              <div className="overlay-ready-title">
                <span className="eyebrow">THE CLOCKWORK CAVERN</span>
                <h1>冲吧！小伙子</h1>
              </div>
              <p className="ready-description">穿过古老机械核心，踏上每一座能量平台</p>
              <div className="leaderboard">
                <div className="leaderboard-header">
                  <span className="leaderboard-title">🏆 排行榜</span>
                  <span className="leaderboard-subtitle">TOP 100</span>
                </div>
                <div className="leaderboard-columns" aria-hidden="true">
                  <span>名次</span>
                  <span>玩家</span>
                  <span>分数</span>
                </div>
                <div
                  className="leaderboard-list"
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  {leaderboardData.map((entry: { rank: number; name: string; score: number }) => (
                    <div
                      className={
                        'leaderboard-row' +
                        (entry.rank <= 3 ? ` leaderboard-row--top${entry.rank}` : '')
                      }
                      key={entry.rank}
                    >
                      <span className="leaderboard-rank">
                        {entry.rank <= 3
                          ? ['🥇', '🥈', '🥉'][entry.rank - 1]
                          : entry.rank}
                      </span>
                      <span className="leaderboard-name">{entry.name}</span>
                      <span className="leaderboard-score">{entry.score.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="overlay-ready-action">
                <button className="primary-button" type="button" onClick={startGame}>
                  开始跳跃
                </button>
                <div className="overlay-ready-row">
                  <button className="shop-entry-button" type="button" onClick={() => window.location.hash = '#/shop'}>
                    ⚙ 角色工坊
                  </button>
                  <small>拖动屏幕控制落点</small>
                </div>
              </div>
            </div>
          </div>
        )}

        {(status === 'over' || status === 'paused') && (
          <div className={`game-overlay game-overlay--${status}`} onPointerDown={(event) => event.stopPropagation()}>
            <div className="overlay-card">
              {status === 'paused' && (
                <>
                  <span className="pause-paw">🐾</span>
                  <h2>休息一下</h2>
                  <p>小小巡检员正在平台上等你</p>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => {
                      setResumeCountdown(1)
                      focusGameWithoutScrolling()
                    }}
                  >
                    继续游戏
                  </button>
                </>
              )}

              {status === 'over' && (
                <>
                  <button
                    className={`death-share-button death-share-button--${shareStatus}`}
                    type="button"
                    onClick={() => void copyCurrentLink()}
                    aria-label="复制当前网页链接"
                  >
                    {shareStatus === 'copied'
                      ? '已复制'
                      : shareStatus === 'failed'
                        ? '复制失败'
                        : '↗ 分享'}
                  </button>
                  <span className="eyebrow">GOOD TRY!</span>
                  <h2>差一点点</h2>
                  <div className="result-score">
                    <span>本次得分</span>
                    <strong>{formatScore(score)}</strong>
                  </div>
                  <div className="result-best">最佳记录 {formatScore(best)}</div>
                  <p className="revive-notice">🎉 庆祝玩家数量超过300，可直接跳过广告复活</p>
                  <button className="primary-button primary-button--revive" type="button" onClick={requestAdPlay}>
                    看广告免费复活
                  </button>
                  <button className="text-button" type="button" onClick={returnToHome}>
                    返回主页
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {showNicknamePrompt && (
          <div className="nickname-overlay" onPointerDown={(event) => event.stopPropagation()}>
            <form className="nickname-dialog" onSubmit={saveNicknameAndReturnHome}>
              <span className="eyebrow">PLAYER PROFILE</span>
              <h2>留下你的昵称</h2>
              <p>昵称只需填写一次，下次会直接返回主页</p>
              <input
                className="nickname-input"
                type="text"
                value={nicknameDraft}
                onChange={(event) => setNicknameDraft(event.target.value)}
                maxLength={12}
                placeholder="输入 1–12 个字符"
                autoComplete="nickname"
                autoFocus
                aria-label="玩家昵称"
              />
              <button
                className="primary-button"
                type="submit"
                disabled={!nicknameDraft.trim()}
              >
                保存并返回主页
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setShowNicknamePrompt(false)
                  focusGameWithoutScrolling()
                }}
              >
                暂不返回
              </button>
            </form>
          </div>
        )}

        {showingAd && (
          <div className="ad-overlay" onPointerDown={(e) => e.stopPropagation()}>
            <div className="ad-overlay-card">
              <span className="ad-label">📺 广告</span>
              <div className="ad-sim-placeholder">
                <span className="ad-sim-icon">🎬</span>
                <p>观看广告获取免费复活机会</p>
                <small>广告还有 {adCountdown} 秒</small>
              </div>
              <div className="ad-countdown-bar">
                <i style={{ width: `${(adCountdown / 10) * 100}%` }} />
              </div>
              {adCanSkip && (
                <button className="ad-skip-button" type="button" onClick={skipAd}>
                  跳过广告
                </button>
              )}
              {!adCanSkip && (
                <span className="ad-skip-hint">剩余 {adCountdown - 7}s 后可跳过</span>
              )}
            </div>
          </div>
        )}

        {resumeCountdown !== null && (
          <div
            className="resume-countdown-overlay"
            role="status"
            aria-live="assertive"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <span>准备继续</span>
            <strong key={resumeCountdown}>{resumeCountdown}</strong>
            <small>倒计时结束后继续游戏</small>
          </div>
        )}

        {status === 'reviving' && reviveCountdown !== null && (
          <div
            className="revive-countdown-overlay"
            role="status"
            aria-live="assertive"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <span>复活准备</span>
            <strong key={reviveCountdown}>{reviveCountdown}</strong>
            <small>倒计时结束后继续跳跃</small>
          </div>
        )}
      </div>
    </main>
  )
}

export default Home

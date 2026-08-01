import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './index.less'
import { CHARACTERS } from '@/features/shop/catalog'
import { getSelected } from '@/features/shop/storage'
import { addStars, getStarBalance } from '@/utils/starCurrency'
import {
  BOTTOM_HORIZONTAL_SPREAD,
  DOUBLE_SCORE_DURATION,
  FEVER_DURATION,
  FREEZE_DURATION,
  HOP_DURATION,
  NOTE_EFFECTS,
  PAINT_EFFECT_DURATION,
  PLATFORM_AREA_SCALE,
  TEMPO_EFFECT_DURATION,
  VISIBLE_PLATFORMS,
  clamp,
  createPlatforms,
  ensurePlatformsThrough,
  progressionSpeed,
  slotHorizontalSpread,
  slotScale,
  slotY,
} from '@/features/game/engine'
import { useGameAudio } from '@/features/game/hooks/useGameAudio'
import { useGameInput } from '@/features/game/hooks/useGameInput'
import { useGameLoop } from '@/features/game/hooks/useGameLoop'
import { MechanicalDecor } from '@/features/game/components/MechanicalDecor'
import { GameHud } from '@/features/game/components/GameHud'
import { GameScene } from '@/features/game/components/GameScene'
import { GameFeedback } from '@/features/game/components/GameFeedback'
import { ReadyOverlay } from '@/features/game/components/ReadyOverlay'
import type { LeaderboardEntry } from '@/features/game/components/ReadyOverlay'
import {
  AdDialog,
  CountdownOverlay,
  NicknameDialog,
  ResultDialog,
} from '@/features/game/components/GameDialogs'
import type {
  FrameState,
  GameStatus,
  LandingImpact,
  NoteFeedback,
  NoteKind,
  TempoEffect,
} from '@/features/game/engine'

const API_BASE = '/api'
const NICKNAME_STORAGE_KEY = 'clockwork-player-nickname-v1'
const PLAYER_ID_STORAGE_KEY = 'clockwork-player-id-v1'
const MAX_REVIVES_PER_RUN = 10

function createCompatiblePlayerId() {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID()
    }
  } catch {
    // Some browsers expose randomUUID but block it on non-HTTPS origins.
  }

  const bytes = new Uint8Array(16)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'))
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-')
}

function getOrCreatePlayerId() {
  try {
    const storedPlayerId = localStorage.getItem(PLAYER_ID_STORAGE_KEY)
    if (storedPlayerId) return storedPlayerId
  } catch {
    // Continue with an in-memory ID when site storage is unavailable.
  }

  const playerId = createCompatiblePlayerId()
  try {
    localStorage.setItem(PLAYER_ID_STORAGE_KEY, playerId)
  } catch {
    // The current game session can still work without persistent storage.
  }
  return playerId
}

async function submitScore(
  playerId: string,
  name: string,
  score: number,
  characterId: string,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, name, score, characterId }),
      signal,
    })
    return response.ok
  } catch {
    return false
  }
}

async function fetchLeaderboard(
  signal?: AbortSignal,
): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(`${API_BASE}/leaderboard`, {
      cache: 'no-store',
      signal,
    })
    if (!res.ok) return []
    const json = await res.json()
    return json.data || []
  } catch {
    return []
  }
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
  const reviveCountRef = useRef(0)
  const streakRef = useRef(0)
  const bounceIdRef = useRef(-1)
  const feverTimeRef = useRef(0)
  const fallProgressRef = useRef(0)
  const tempoEffectRef = useRef<{ kind: TempoEffect; remaining: number } | null>(null)
  const paintEffectTimeRef = useRef(0)
  const freezeTimeRef = useRef(0)
  const scoreMultiplierRef = useRef(1)
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
  const {
    backgroundMusicRef,
    ensureAudioContext,
    playNoteSound,
    startGameAudio,
    stopGameAudio,
    syncBackgroundMusic,
  } = useGameAudio()

  const [status, setStatus] = useState<GameStatus>('ready')
  const [playerId] = useState(getOrCreatePlayerId)
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
  const [reviveCount, setReviveCount] = useState(0)
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null)
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([])
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
    syncBackgroundMusic(next)
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

  const submitScoreAndRefresh = (
    name: string,
    nextScore: number,
    characterId: string,
  ) => {
    const controller = new AbortController()
    requestControllersRef.current.add(controller)

    void (async () => {
      try {
        const success = await submitScore(
          playerId,
          name,
          nextScore,
          characterId,
          controller.signal,
        )
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
    startGameAudio()
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
    reviveCountRef.current = 0
    setReviveCount(0)
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
    stopGameAudio()
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
      submitScoreAndRefresh(nextNickname, pendingScore, selectedCharacter.id)
    }

    completeReturnToHome()
  }

  const beginReviveCountdown = () => {
    ensureAudioContext()
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
    if (reviveCountRef.current >= MAX_REVIVES_PER_RUN) return

    const nextReviveCount = reviveCountRef.current + 1
    reviveCountRef.current = nextReviveCount
    setReviveCount(nextReviveCount)
    setAdCountdown(10)
    setAdCanSkip(true)
    setShowingAd(true)
  }

  const skipAd = () => {
    if (!adCanSkip) return
    setShowingAd(false)
    beginReviveCountdown()
  }

  const beginReviveCountdownRef = useRef(beginReviveCountdown)
  beginReviveCountdownRef.current = beginReviveCountdown
  const resumeAfterCountdownRef = useRef(() => {})
  resumeAfterCountdownRef.current = () => {
    changeStatus('playing')
    focusGameWithoutScrolling()
  }

  useEffect(() => {
    if (!showingAd || adCountdown <= 0) return
    if (adCountdown <= 7 && !adCanSkip) setAdCanSkip(true)
    const timer = setTimeout(() => {
      const next = adCountdown - 1
      setAdCountdown(next)
      if (next <= 0) {
        setShowingAd(false)
        beginReviveCountdownRef.current()
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
      resumeAfterCountdownRef.current()
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
      resumeAfterCountdownRef.current()
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

  const advanceGame = (delta: number) => {
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

        // When frozen, skip all movement.
        if (freezeTimeRef.current > 0) return

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
              submitScoreAndRefresh(
                storedNickname,
                scoreRef.current,
                selectedCharacter.id,
              )
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

  }

  useGameLoop(advanceGame)

  useEffect(() => {
    refreshLeaderboard()
  }, [])

  useEffect(() => {
    const requestControllers = requestControllersRef.current
    const activeAnimations = activeAnimationsRef.current
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

      platformElements.clear()
    }
  }, [])

  const { handlePointerDown, updatePointerTarget } = useGameInput({
    gameRef,
    gameBoundsRef,
    moveDirectionRef,
    statusRef,
    targetXRef,
    onStart: startGame,
  })

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

        <GameHud
          status={status}
          platformIndex={platformIndex}
          stars={stars}
          score={score}
          paceMultiplier={paceMultiplier}
          isFever={isFever}
          isDoubleScore={isDoubleScore}
          feverBarRef={feverBarRef}
          onTogglePause={() => {
            if (statusRef.current === 'playing') {
              changeStatus('paused')
            } else if (statusRef.current === 'paused') {
              changeStatus('playing')
            }
          }}
        />

        <GameFeedback
          status={status}
          feedback={feedback}
          streak={streak}
          noteFeedback={noteFeedback}
          paintEffectId={paintEffectId}
          impact={impact}
        />

        <GameScene
          visiblePlatforms={visiblePlatforms}
          frame={frameRef.current}
          gameSize={gameSizeRef.current}
          bounceId={bounceId}
          impact={impact}
          character={{
            id: selectedCharacter.id,
            image: selectedCharacter.image,
            glow: selectedCharacter.colors.glow,
          }}
          platformElementsRef={platformElementsRef}
          playerRef={playerRef}
          playerShadowRef={playerShadowRef}
        />

        <div className="controls" aria-hidden="true">
          <span>拖动屏幕控制落点</span>
        </div>

        {status === 'ready' && (
          <ReadyOverlay
            entries={leaderboardData}
            onStart={startGame}
            onOpenShop={() => { window.location.hash = '#/shop' }}
          />
        )}

        {(status === 'over' || status === 'paused') && (
          <ResultDialog
            mode={status}
            score={score}
            best={best}
            shareStatus={shareStatus}
            reviveCount={reviveCount}
            maxRevives={MAX_REVIVES_PER_RUN}
            onResume={() => {
              setResumeCountdown(1)
              focusGameWithoutScrolling()
            }}
            onShare={() => { void copyCurrentLink() }}
            onRevive={requestAdPlay}
            onReturnHome={returnToHome}
          />
        )}

        {showNicknamePrompt && (
          <NicknameDialog
            value={nicknameDraft}
            onChange={setNicknameDraft}
            onSubmit={saveNicknameAndReturnHome}
            onCancel={() => {
              setShowNicknamePrompt(false)
              focusGameWithoutScrolling()
            }}
          />
        )}

        {showingAd && (
          <AdDialog countdown={adCountdown} canSkip={adCanSkip} onSkip={skipAd} />
        )}

        {resumeCountdown !== null && (
          <CountdownOverlay mode="resume" value={resumeCountdown} />
        )}

        {status === 'reviving' && reviveCountdown !== null && (
          <CountdownOverlay mode="revive" value={reviveCountdown} />
        )}
      </div>
    </main>
  )
}

export default Home

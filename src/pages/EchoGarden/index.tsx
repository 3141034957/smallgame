import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CHAPTERS,
  SEEDS,
  SLOT_COUNT,
  STEP_SECONDS,
  decodeBoard,
  emptyBoard,
  encodeBoard,
  evaluateStoryChapter,
  plantSeed,
} from '@/features/echo/engine'
import type { Board, SeedKind } from '@/features/echo/engine'
import {
  DAILY_ROUNDS,
  getDailyOffers,
  getDailyPattern,
  getNightlyPick,
  msUntilNextDaily,
  scoreDailyGarden,
  scoreGarden,
  suggestNextMove,
} from '@/features/echo/daily'
import type { GardenHint } from '@/features/echo/daily'
import { useEchoAudio } from '@/features/echo/useEchoAudio'
import type { Playback } from '@/features/echo/useEchoAudio'
import {
  clearStoryProgress,
  dailyStreak,
  readCollection,
  readDailyBest,
  readDailyProgress,
  readMuted,
  readSkin,
  readStoryProgress,
  recentDailyBest,
  removeFromCollection,
  renameSong as renameCollectionSong,
  saveToCollection,
  writeDailyBest,
  writeDailyProgress,
  writeMuted,
  writeSkin,
  writeStoryProgress,
} from '@/features/echo/storage'
import type { DailyRecord, EchoSkin, SavedSong, StoryProgress } from '@/features/echo/storage'
import { DailyTrail } from './DailyTrail'
import { WelcomeScreen } from './WelcomeScreen'
import './index.less'

type Phase = 'welcome' | 'compose' | 'listening' | 'delivered' | 'final' | 'remix' | 'guest' | 'daily-compose' | 'daily-result' | 'relay' | 'relay-result'
type ListeningKind = 'letter' | 'song' | 'daily' | 'relay' | 'original'

const ALL_KINDS = SEEDS.map(({ kind }) => kind)
const UNDO_LIMIT = 40

function todayInChina() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function validDateKey(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const timestamp = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? value : null
}

function seedInfo(kind: SeedKind) {
  return SEEDS.find((seed) => seed.kind === kind)!
}

function oneBeatApart(original: Board, reply: Board) {
  return original.filter((seed, index) => seed !== reply[index]).length === 1
}

function relayNumber(raw: string | null) {
  const number = Number(raw)
  return Number.isInteger(number) && number >= 1 && number <= 99 ? number : 1
}

function countdownLabel(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours} 小时 ${minutes % 60} 分` : `${minutes} 分`
}

function EchoGarden() {
  const [searchParams, setSearchParams] = useSearchParams()
  const sharedBoardRef = useRef(decodeBoard(searchParams.get('song') ?? ''))
  const sharedDateRef = useRef(validDateKey(searchParams.get('daily')))
  const sharedParentRef = useRef((() => {
    const parent = decodeBoard(searchParams.get('from') ?? '')
    return parent && sharedBoardRef.current && oneBeatApart(parent, sharedBoardRef.current) ? parent : null
  })())
  const [skin, setSkin] = useState<EchoSkin>(readSkin)
  const [muted, setMuted] = useState(readMuted)
  const [collection, setCollection] = useState<SavedSong[]>(readCollection)
  const [storyProgress, setStoryProgress] = useState<StoryProgress | null>(readStoryProgress)
  const [dailyRecords, setDailyRecords] = useState<DailyRecord[]>(() => recentDailyBest(todayInChina()))
  const [dailyStreakCount, setDailyStreakCount] = useState(() => dailyStreak(todayInChina()))
  const [nextDailyMs, setNextDailyMs] = useState(() => msUntilNextDaily())
  const [guestSource, setGuestSource] = useState<'link' | 'nightly' | 'collection'>('link')
  const [board, setBoard] = useState<Board>(() => sharedBoardRef.current ?? emptyBoard())
  const [phase, setPhase] = useState<Phase>(sharedBoardRef.current ? 'guest' : 'welcome')
  const [dailyDate, setDailyDate] = useState(sharedDateRef.current ?? todayInChina)
  const [dailyRound, setDailyRound] = useState(0)
  const [dailyBest, setDailyBest] = useState(() => readDailyBest(sharedDateRef.current ?? todayInChina()))
  const [dailyLastGain, setDailyLastGain] = useState('')
  const [relayParentBoard, setRelayParentBoard] = useState<Board | null>(sharedParentRef.current)
  const [relayHop, setRelayHop] = useState(sharedParentRef.current ? relayNumber(searchParams.get('hop')) : 0)
  const [relayEditedSlot, setRelayEditedSlot] = useState<number | null>(null)
  const [compareBoard, setCompareBoard] = useState<Board | null>(null)
  const [chapter, setChapter] = useState(0)
  const [markedSlots, setMarkedSlots] = useState<number[]>([])
  const [selectedSeed, setSelectedSeed] = useState<SeedKind>('heart')
  const [playhead, setPlayhead] = useState(-1)
  const [songAct, setSongAct] = useState(0)
  const [listeningKind, setListeningKind] = useState<ListeningKind>('letter')
  const [canSkipPlayback, setCanSkipPlayback] = useState(false)
  const [audioUnavailable, setAudioUnavailable] = useState(false)
  const [notice, setNotice] = useState('选一颗声音种子，再点唱片上的空格。')
  const [shareNotice, setShareNotice] = useState('')
  const [shareFallbackUrl, setShareFallbackUrl] = useState('')
  const [hint, setHint] = useState<GardenHint | null>(null)
  const [undoDepth, setUndoDepth] = useState(0)
  const loadedQueryRef = useRef(searchParams.toString())
  const [showRules, setShowRules] = useState(false)
  const rulesCloseRef = useRef<HTMLButtonElement | null>(null)
  const rulesActionRef = useRef<HTMLButtonElement | null>(null)
  const rulesTriggerRef = useRef<HTMLButtonElement | null>(null)
  const audio = useEchoAudio()
  const audioRef = useRef(audio)
  audioRef.current = audio
  const animationRef = useRef(0)
  const playbackRef = useRef<Playback | null>(null)
  const playbackFinishRef = useRef<(() => void) | null>(null)
  const historyRef = useRef<Board[]>([])

  const stopPlayback = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    animationRef.current = 0
    playbackRef.current = null
    playbackFinishRef.current = null
    audioRef.current.stop()
    setPlayhead(-1)
    setCompareBoard(null)
    setCanSkipPlayback(false)
  }

  const openRules = (event: MouseEvent<HTMLButtonElement>) => {
    rulesTriggerRef.current = event.currentTarget
    setShowRules(true)
  }

  const closeRules = () => {
    setShowRules(false)
    requestAnimationFrame(() => rulesTriggerRef.current?.focus())
  }

  const refreshDailyHistory = () => {
    const today = todayInChina()
    setDailyRecords(recentDailyBest(today))
    setDailyStreakCount(dailyStreak(today))
  }

  const toggleSkin = () => {
    const next = skin === 'print' ? 'night' : 'print'
    writeSkin(next)
    setSkin(next)
  }

  const toggleMuted = () => {
    const next = !muted
    writeMuted(next)
    audioRef.current.setMuted(next)
    setMuted(next)
  }

  useEffect(() => () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    audioRef.current.stop()
  }, [])

  useEffect(() => {
    audioRef.current.setMuted(muted)
  }, [muted])

  useEffect(() => {
    const query = searchParams.toString()
    if (query === loadedQueryRef.current) return
    loadedQueryRef.current = query
    const incoming = decodeBoard(searchParams.get('song') ?? '')
    if (!incoming) return
    const possibleParent = decodeBoard(searchParams.get('from') ?? '')
    stopPlayback()
    sharedDateRef.current = validDateKey(searchParams.get('daily'))
    sharedParentRef.current = possibleParent && oneBeatApart(possibleParent, incoming) ? possibleParent : null
    setDailyDate(sharedDateRef.current ?? todayInChina())
    setBoard(incoming)
    setRelayParentBoard(sharedParentRef.current)
    setRelayHop(sharedParentRef.current ? relayNumber(searchParams.get('hop')) : 0)
    setRelayEditedSlot(null)
    setMarkedSlots([])
    setShareNotice('')
    setShareFallbackUrl('')
    setGuestSource('link')
    setPhase('guest')
  }, [searchParams])

  useEffect(() => {
    const timer = window.setInterval(() => setNextDailyMs(msUntilNextDaily()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!showRules) return
    rulesCloseRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRules()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [showRules])

  const startNewGarden = () => {
    stopPlayback()
    setSearchParams({}, { replace: true })
    clearStoryProgress()
    setStoryProgress(null)
    setBoard(emptyBoard())
    setChapter(0)
    setMarkedSlots([])
    setSelectedSeed('heart')
    setRelayParentBoard(null)
    setRelayHop(0)
    setRelayEditedSlot(null)
    sharedDateRef.current = null
    clearHistory()
    setNotice('先把两颗心跳种在唱片两侧。相隔四格就好。')
    setShareNotice('')
    setShareFallbackUrl('')
    setPhase('compose')
  }

  const continueStory = () => {
    if (!storyProgress) {
      startNewGarden()
      return
    }
    stopPlayback()
    setSearchParams({}, { replace: true })
    setBoard(storyProgress.board)
    setChapter(storyProgress.chapter)
    setMarkedSlots([])
    setSelectedSeed('bell')
    setRelayParentBoard(null)
    setRelayHop(0)
    setRelayEditedSlot(null)
    sharedDateRef.current = null
    setNotice(`${CHAPTERS[storyProgress.chapter].hint} 旧种子可以挪动，送信时仍需满足前面的线索。`)
    setShareNotice('')
    setShareFallbackUrl('')
    setPhase('compose')
  }

  const openSong = (code: string, source: 'nightly' | 'collection' = 'collection') => {
    const song = decodeBoard(code)
    if (!song) return
    stopPlayback()
    setSearchParams({}, { replace: true })
    clearHistory()
    setGuestSource(source)
    setBoard(song)
    setChapter(CHAPTERS.length - 1)
    setMarkedSlots([])
    setRelayParentBoard(null)
    setRelayHop(0)
    setRelayEditedSlot(null)
    sharedDateRef.current = null
    setPhase('guest')
    setNotice('按下唱针，听听这张唱片里的花房。')
    setShareNotice('')
    setShareFallbackUrl('')
  }

  const removeSong = (code: string) => {
    setCollection(removeFromCollection(code))
  }

  const renameSong = (code: string, title: string) => {
    setCollection(renameCollectionSong(code, title))
  }

  const goWelcome = () => {
    stopPlayback()
    refreshDailyHistory()
    setPhase('welcome')
  }

  const startDaily = (date = todayInChina(), restart = false) => {
    stopPlayback()
    setSearchParams({}, { replace: true })
    const progress = restart ? null : readDailyProgress(date)
    const nextBoard = progress?.board ?? emptyBoard()
    const nextRound = progress?.round ?? 0
    if (restart) writeDailyProgress(date, nextBoard, 0)
    setDailyDate(date)
    setDailyRound(nextRound)
    setDailyBest(readDailyBest(date))
    setDailyLastGain('')
    setBoard(nextBoard)
    setSelectedSeed(getDailyOffers(date, Math.min(nextRound, DAILY_ROUNDS - 1))[0])
    setMarkedSlots([])
    setRelayParentBoard(null)
    setRelayHop(0)
    setRelayEditedSlot(null)
    setShareNotice('')
    setShareFallbackUrl('')
    if (nextRound === DAILY_ROUNDS) {
      setDailyBest(writeDailyBest(date, scoreDailyGarden(nextBoard, date).score))
      refreshDailyHistory()
      setPhase('daily-result')
      setNotice('今天的六颗声音都种好了。')
    } else {
      setPhase('daily-compose')
      setNotice('从下方挑一颗声音，再点唱片上的空格。种下后会自动演奏。')
    }
  }

  const beginRelay = () => {
    stopPlayback()
    setSearchParams({}, { replace: true })
    setRelayParentBoard([...board])
    setRelayHop((current) => Math.min(99, current + 1))
    setRelayEditedSlot(null)
    setSelectedSeed('bell')
    setShareNotice('')
    setShareFallbackUrl('')
    setNotice('接力规则：只改一拍。选一颗声音，再点唱片上的任意一格。')
    setPhase('relay')
  }

  const runPlayback = (snapshot: Board, repeats: number, onFinish: () => void, kind: ListeningKind = 'letter') => {
    stopPlayback()
    const audioPlayback = audioRef.current.playLoop(snapshot, repeats)
    const fallbackStart = performance.now() / 1000 + 0.065
    const playback: Playback = audioPlayback ?? {
      startTimeSec: fallbackStart,
      durationSec: repeats * SLOT_COUNT * STEP_SECONDS,
      nowSec: () => performance.now() / 1000,
    }
    setAudioUnavailable(!audioPlayback)
    playbackRef.current = playback
    playbackFinishRef.current = onFinish
    setSongAct(0)
    setListeningKind(kind)
    setCanSkipPlayback(false)
    setPhase('listening')

    let skipUnlocked = false
    let silentAnnounced = false
    const animate = () => {
      if (playbackRef.current !== playback) return
      const elapsed = playback.nowSec() - playback.startTimeSec
      if (!silentAnnounced && playback.isSilent?.()) {
        silentAnnounced = true
        setAudioUnavailable(true)
      }
      if (elapsed >= playback.durationSec) {
        animationRef.current = 0
        playbackRef.current = null
        playbackFinishRef.current = null
        setPlayhead(-1)
        setCanSkipPlayback(false)
        onFinish()
        return
      }
      if (!skipUnlocked && elapsed >= 1.3) {
        skipUnlocked = true
        setCanSkipPlayback(true)
      }
      const step = elapsed < 0 ? -1 : Math.floor(elapsed / STEP_SECONDS) % SLOT_COUNT
      if (repeats > 1 && elapsed >= 0) {
        const act = Math.min(repeats - 1, Math.floor(elapsed / (STEP_SECONDS * SLOT_COUNT)))
        setSongAct((current) => current === act ? current : act)
      }
      setPlayhead((current) => current === step ? current : step)
      animationRef.current = requestAnimationFrame(animate)
    }
    animationRef.current = requestAnimationFrame(animate)
  }

  const skipPlayback = () => {
    const finish = playbackFinishRef.current
    if (!finish || !canSkipPlayback) return
    stopPlayback()
    finish()
  }

  const listenToLetter = () => {
    const snapshot = [...board] as Board
    if (snapshot.every((seed) => seed === null)) {
      setNotice('唱片还是空白的。先种下一颗声音吧。')
      return
    }
    const currentChapter = chapter
    runPlayback(snapshot, chapter === CHAPTERS.length - 1 ? 2 : 1, () => {
      const result = evaluateStoryChapter(snapshot, currentChapter)
      if (!result.complete) {
        setMarkedSlots([])
        setNotice(result.message)
        setPhase('compose')
        return
      }
      setMarkedSlots(result.marked)
      if (currentChapter === CHAPTERS.length - 1) {
        clearStoryProgress()
        setStoryProgress(null)
        setCollection(saveToCollection(snapshot).collection)
        setNotice('四封来信都收到了。现在听听你种出的整首歌。')
        setPhase('final')
      } else {
        setNotice(CHAPTERS[currentChapter].reply)
        setPhase('delivered')
      }
    })
  }

  const playFullSong = () => {
    const snapshot = [...board] as Board
    const returnPhase = phase
    runPlayback(snapshot, 4, () => setPhase(returnPhase), 'song')
  }

  const playOriginalSong = () => {
    if (!relayParentBoard) return
    const snapshot = [...relayParentBoard]
    runPlayback(snapshot, 1, () => {
      setCompareBoard(null)
      setPhase('guest')
    }, 'original')
    setCompareBoard(snapshot)
  }

  const continueLetter = () => {
    const nextChapter = Math.min(chapter + 1, CHAPTERS.length - 1)
    writeStoryProgress(board, nextChapter)
    setStoryProgress({ board, chapter: nextChapter })
    setChapter(nextChapter)
    setMarkedSlots([])
    setSelectedSeed(nextChapter === 1 ? 'rain' : 'bell')
    setNotice(`${CHAPTERS[nextChapter].hint} 旧种子可以挪动，送信时仍需满足前面的线索。`)
    setPhase('compose')
  }

  const selectSeed = (kind: SeedKind) => {
    setSelectedSeed(kind)
    setNotice(`${seedInfo(kind).name}：${seedInfo(kind).description}`)
    audioRef.current.previewSeed(kind)
  }

  const clearHistory = () => {
    historyRef.current = []
    setUndoDepth(0)
  }

  const pushHistory = (snapshot: Board) => {
    historyRef.current.push(snapshot)
    if (historyRef.current.length > UNDO_LIMIT) historyRef.current.shift()
    setUndoDepth(historyRef.current.length)
  }

  const undoEdit = () => {
    const previous = historyRef.current.pop()
    if (!previous) {
      setNotice('还没有可以撤回的一步。')
      return
    }
    setUndoDepth(historyRef.current.length)
    setBoard(previous)
    setRelayEditedSlot(relayParentBoard && encodeBoard(previous) === encodeBoard(relayParentBoard) ? null : relayEditedSlot)
    setNotice('撤回了上一步。')
  }

  const touchSlot = (index: number) => {
    if (phase === 'daily-compose') {
      if (board[index] !== null) {
        setNotice('这颗声音已经种下。每日花谱只能在空格里添一颗。')
        return
      }
      const offers = getDailyOffers(dailyDate, dailyRound)
      if (!offers.includes(selectedSeed)) return
      const next = plantSeed(board, index, selectedSeed)
      const before = scoreDailyGarden(board, dailyDate)
      const after = scoreDailyGarden(next, dailyDate)
      const newBonuses = after.bonuses.flatMap((bonus) => {
        const previous = before.bonuses.find((item) => item.label === bonus.label || item.label.startsWith('错落相邻') && bonus.label.startsWith('错落相邻'))
        const earned = bonus.points - (previous?.points ?? 0)
        return earned > 0 ? [`${bonus.label} +${earned}`] : []
      })
      const nextRound = dailyRound + 1
      writeDailyProgress(dailyDate, next, nextRound)
      setBoard(next)
      setDailyLastGain(`+${after.score - before.score} 分${newBonuses.length ? ` · ${newBonuses.join('、')}` : ''}`)
      runPlayback(next, 1, () => {
        setDailyRound(nextRound)
        if (nextRound === DAILY_ROUNDS) {
          setDailyBest(writeDailyBest(dailyDate, after.score))
          refreshDailyHistory()
          setNotice('六次选择结束，你的花谱已经装进信封。')
          setPhase('daily-result')
        } else {
          setSelectedSeed(getDailyOffers(dailyDate, nextRound)[0])
          setNotice(`第 ${nextRound} 颗已唱完。再选一颗声音，把花谱接着种下去。`)
          setPhase('daily-compose')
        }
      }, 'daily')
      return
    }
    if (phase === 'relay') {
      if (relayEditedSlot !== null && relayEditedSlot !== index) return
      pushHistory(board)
      const next = plantSeed(board, index, selectedSeed)
      setBoard(next)
      setRelayEditedSlot(encodeBoard(next) === encodeBoard(relayParentBoard ?? board) ? null : index)
      const delta = scoreGarden(next).score - scoreGarden(relayParentBoard ?? board).score
      setNotice(`第 ${index + 1} 拍换成${next[index] ? seedInfo(next[index]).name : '留白'}。接力版${delta >= 0 ? '+' : ''}${delta} 分。`)
      audioRef.current.previewSeed(selectedSeed)
      return
    }
    if (phase !== 'compose' && phase !== 'remix') return
    pushHistory(board)
    const next = plantSeed(board, index, selectedSeed)
    const added = next[index] !== null
    setBoard(next)
    setNotice(added
      ? `第 ${index + 1} 拍种下了${seedInfo(selectedSeed).name}。按「放唱针」听它和其他声音相遇。`
      : `第 ${index + 1} 拍腾出了空位。`)
    if (added) audioRef.current.previewSeed(selectedSeed)
    if (phase === 'compose') {
      writeStoryProgress(next, chapter)
      setStoryProgress({ board: next, chapter })
    }
  }

  const applyHint = () => {
    if (!hint) return
    const source = phase === 'relay' ? relayParentBoard ?? board : board
    pushHistory(board)
    const next = [...source] as Board
    next[hint.index] = hint.kind
    setBoard(next)
    if (phase === 'relay') {
      setRelayEditedSlot(hint.index)
      const delta = scoreGarden(next).score - scoreGarden(relayParentBoard ?? board).score
      setNotice(`邮差建议第 ${hint.index + 1} 拍换成${hint.kind ? seedInfo(hint.kind).name : '留白'}：${delta >= 0 ? '+' : ''}${delta} 分。`)
    } else {
      setNotice(`第 ${hint.index + 1} 拍换成${hint.kind ? seedInfo(hint.kind).name : '留白'}，多了 ${hint.gain} 分。`)
    }
    if (hint.kind) audioRef.current.previewSeed(hint.kind)
  }

  const finishRelay = () => {
    if (!relayParentBoard || encodeBoard(board) === encodeBoard(relayParentBoard)) {
      setNotice('先改动唱片上的一拍，才能把接力谱寄回去。')
      return
    }
    const snapshot = [...board]
    runPlayback(snapshot, 1, () => {
      setNotice('这一拍已经唱出来了。把改过的花房寄给朋友吧。')
      setPhase('relay-result')
    }, 'relay')
  }

  const copySong = async (mode: 'song' | 'daily' | 'relay' = 'song') => {
    const code = encodeBoard(board)
    const url = new URL(window.location.href)
    const params = new URLSearchParams({ song: code })
    if (mode === 'daily') params.set('daily', dailyDate)
    if (mode === 'relay' && relayParentBoard) {
      params.set('from', encodeBoard(relayParentBoard))
      params.set('hop', String(relayHop || 1))
      if (sharedDateRef.current) params.set('daily', sharedDateRef.current)
    }
    url.hash = `#/?${params.toString()}`
    const message = mode === 'daily'
      ? `月亮邮局 · ${dailyDate} 每日花谱，我种出了 ${scoreDailyGarden(board, dailyDate).score} 分。来挑战同一天的六颗声音：${url}`
      : mode === 'relay' && relayParentBoard
        ? `月亮邮局第 ${relayHop || 1} 次接力：${scoreGarden(relayParentBoard).score} → ${scoreGarden(board).score} 分。听听这一拍的新声音，再接力：${url}`
        : `我给月亮种了一首歌。打开花房听一听，也可以接力改一拍：${url}`
    try {
      await navigator.clipboard.writeText(message)
      setShareNotice('邀请已复制，发给朋友就能一起玩。')
      setShareFallbackUrl('')
    } catch {
      setShareNotice('浏览器没能自动复制。点下方链接即可全选，手动寄给朋友。')
      setShareFallbackUrl(url.toString())
    }
  }

  const beginRemix = () => {
    stopPlayback()
    setSearchParams({}, { replace: true })
    setMarkedSlots([])
    setSelectedSeed('bell')
    setShareNotice('')
    setShareFallbackUrl('')
    setPhase('remix')
    setNotice('自由改谱：再点同一种子可移走，也可以换一颗。')
  }

  const finishRemix = () => {
    setShareNotice('')
    setShareFallbackUrl('')
    setPhase('final')
    setNotice('这座花房有了新的声音。')
  }

  const collectSong = () => {
    const result = saveToCollection(board)
    setCollection(result.collection)
    setNotice(result.added
      ? `已经收进「${result.title}」，回到标题页就能再听到它。`
      : `「${result.title}」已经在收藏册里了。`)
  }

  const isEditing = phase === 'compose' || phase === 'remix' || phase === 'daily-compose' || phase === 'relay'
  const isFinal = phase === 'final' || phase === 'guest'
  const isComparingOriginal = phase === 'listening' && listeningKind === 'original'
  const showingSong = isFinal || phase === 'remix' || phase === 'listening' && listeningKind === 'song'
  const showingDaily = phase === 'daily-compose' || phase === 'daily-result' || phase === 'listening' && listeningKind === 'daily'
  const showingRelay = phase === 'relay' || phase === 'relay-result' || phase === 'listening' && listeningKind === 'relay'
  const guestDaily = phase === 'guest' && !!sharedDateRef.current && !relayParentBoard
  const guestRelay = phase === 'guest' && !!relayParentBoard
  const isNightlyPick = phase === 'guest' && guestSource === 'nightly' && !relayParentBoard && !sharedDateRef.current
  const guestSavedDaily = sharedDateRef.current ? readDailyProgress(sharedDateRef.current) : null

  useEffect(() => {
    if (phase !== 'remix' && phase !== 'relay') {
      setHint(null)
      return
    }
    const source = phase === 'relay' ? relayParentBoard ?? board : board
    setHint(suggestNextMove(source, { kinds: ALL_KINDS }))
  }, [board, phase, relayParentBoard])

  // The window listener is installed once, so it reads the newest handlers here.
  const keyboardRef = useRef({ editing: false, undoEnabled: false, touch: touchSlot, undo: undoEdit, play: () => {} })
  keyboardRef.current.editing = isEditing
  keyboardRef.current.undoEnabled = phase === 'compose' || phase === 'remix' || phase === 'relay'
  keyboardRef.current.touch = touchSlot
  keyboardRef.current.undo = undoEdit
  keyboardRef.current.play = () => {
    if (phase === 'compose') listenToLetter()
    else if (phase === 'remix' || isFinal) playFullSong()
    else if (phase === 'relay') finishRelay()
    else if (phase === 'delivered') continueLetter()
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (event.key >= '1' && event.key <= '8') {
        if (!keyboardRef.current.editing) return
        event.preventDefault()
        keyboardRef.current.touch(Number(event.key) - 1)
        return
      }
      if (event.key === 'z' || event.key === 'Z') {
        if (!keyboardRef.current.undoEnabled) return
        event.preventDefault()
        keyboardRef.current.undo()
        return
      }
      // A focused button keeps its own Space activation.
      if (event.key === ' ' && tag !== 'BUTTON') {
        event.preventDefault()
        keyboardRef.current.play()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const activeChapter = CHAPTERS[chapter]
  const displayedBoard = compareBoard ?? board
  const plantedCount = displayedBoard.filter(Boolean).length
  const allowedSeeds = phase === 'remix' || phase === 'relay'
    ? ALL_KINDS
    : showingDaily
      ? getDailyOffers(dailyDate, Math.min(dailyRound, DAILY_ROUNDS - 1))
      : activeChapter.allowed
  const dailyPattern = getDailyPattern(dailyDate)
  const dailyMission = `第 ${dailyPattern.featuredSlot + 1} 拍种${seedInfo(dailyPattern.featuredKind).name}，第 ${dailyPattern.quietSlot + 1} 拍留白`
  const gardenScore = showingDaily || guestDaily ? scoreDailyGarden(board, dailyDate) : scoreGarden(board)
  const parentScore = relayParentBoard ? scoreGarden(relayParentBoard).score : null
  const changedBeat = relayParentBoard ? board.findIndex((kind, index) => kind !== relayParentBoard[index]) : -1
  const changedBeatCopy = changedBeat < 0 || !relayParentBoard ? '' : `第 ${changedBeat + 1} 拍：${relayParentBoard[changedBeat] ? seedInfo(relayParentBoard[changedBeat]).name : '留白'} → ${board[changedBeat] ? seedInfo(board[changedBeat]).name : '留白'}`
  const songCode = encodeBoard(board)
  const isCollected = collection.some((song) => song.code === songCode)
  const stageTitle = isComparingOriginal
    ? '这是改动之前的花房'
    : showingDaily
    ? phase === 'daily-result' ? '今晚的花谱，已经写好' : `每日花谱 · 第 ${dailyRound + 1} 颗`
    : showingRelay
      ? phase === 'relay-result' ? `第 ${relayHop} 站，新的声音唱出来了` : '只改一拍，让故事继续'
      : phase === 'guest'
        ? relayParentBoard ? `朋友寄来的第 ${relayHop} 站` : isNightlyPick ? '今晚点播 · 月亮自己种的' : sharedDateRef.current ? '同一天的花谱' : '朋友寄来的花房'
        : showingSong
          ? '这一夜，终于有了自己的歌'
          : phase === 'delivered'
            ? '这一封信，送到了'
            : activeChapter.title
  const stageDescription = isComparingOriginal
    ? `原谱 ${parentScore} 分。等唱针走完，再听朋友改过的那一拍。`
    : showingDaily
    ? phase === 'daily-result'
      ? `${dailyDate} · ${gardenScore.score} 分。${dailyMission}，是今天独有的邮戳。`
      : `同日同题，六次选择。${dailyMission}，可加 40 分。`
    : showingRelay
      ? parentScore === null ? '从朋友寄来的花房出发，只改动一个位置，再把这段新声音传下去。' : `原谱 ${parentScore} 分 → 现在 ${gardenScore.score} 分。${changedBeatCopy || '选一拍，再寄出去。'}`
      : phase === 'guest'
        ? relayParentBoard
          ? `上一位 ${parentScore} 分 → 这一位 ${gardenScore.score} 分。${changedBeatCopy}。`
          : isNightlyPick
            ? `今晚月亮挑的这张唱片 ${gardenScore.score} 分，四封来信的线索它都满足。听完可以收进收藏册。`
            : sharedDateRef.current
            ? `朋友在 ${sharedDateRef.current} 的花谱得了 ${gardenScore.score} 分。${dailyMission}。`
            : '每一颗声音都在唱片上留下了位置。按下唱针，听听它会怎样开花。'
        : showingSong
          ? '心跳是节拍，雨滴是呼吸，铃花和回声是你写下的旋律。'
          : phase === 'delivered'
            ? activeChapter.reply
            : activeChapter.request

  if (phase === 'welcome') {
    return (
      <main className={`echo-page echo-skin-${skin} echo-phase-${phase}`}>
        <WelcomeScreen
          collection={collection}
          storyChapter={storyProgress?.chapter ?? null}
          nightlyCode={encodeBoard(getNightlyPick(todayInChina()))}
          dailyRecords={dailyRecords}
          streak={dailyStreakCount}
          nextDailyLabel={countdownLabel(nextDailyMs)}
          skin={skin}
          muted={muted}
          onStartStory={startNewGarden}
          onContinueStory={continueStory}
          onStartDaily={() => startDaily()}
          onOpenSong={openSong}
          onRenameSong={renameSong}
          onRemoveSong={removeSong}
          onToggleSkin={toggleSkin}
          onToggleMuted={toggleMuted}
        />
      </main>
    )
  }

  return (
    <main className={`echo-page echo-skin-${skin} echo-phase-${phase}`}>
      <header className="echo-game-header">
        <button className="echo-home-button" type="button" onClick={goWelcome} aria-label="返回标题">↖</button>
        <div className="echo-brand"><span className="echo-brand-icon">月</span><span>月亮邮局 <small>MOON RADIO / 112 BPM</small></span></div>
        <div className="echo-header-tools">
          <button className="echo-icon-button" type="button" onClick={toggleMuted} aria-pressed={muted} aria-label={muted ? '取消静音' : '静音'} title={muted ? '取消静音' : '静音'}>{muted ? '✕' : '♪'}</button>
          <button className="echo-icon-button" type="button" onClick={toggleSkin} aria-label={skin === 'print' ? '换成夜间邮报皮肤' : '换成印刷封套皮肤'} title="换一种封面">{skin === 'print' ? '☾' : '▤'}</button>
        </div>
        <div className="echo-letter-count">{showingDaily ? `${String(Math.min(dailyRound + 1, DAILY_ROUNDS)).padStart(2, '0')} / 06` : showingRelay || isComparingOriginal ? '接力件' : showingSong ? 'SIDE A' : `${String(chapter + 1).padStart(2, '0')} / ${String(CHAPTERS.length).padStart(2, '0')}`}</div>
      </header>

      <section className="echo-letter-card" aria-live="polite">
        <div className="echo-letter-top"><span>{showingDaily || guestDaily ? `每日邮戳 / ${dailyDate}` : showingRelay || isComparingOriginal || guestRelay ? `声波接力件 / 第 ${relayHop} 站` : isNightlyPick ? `月亮点播 / ${todayInChina()}` : showingSong ? '唱片 A 面 / 手工录制' : phase === 'delivered' ? '信件已投递' : `夜信编号 / 0${chapter + 1}`}</span><span className="echo-letter-stamp">{showingDaily || guestDaily ? gardenScore.score : showingRelay || isComparingOriginal || guestRelay ? String(relayHop).padStart(2, '0') : '月'}</span></div>
        <h2>{stageTitle}</h2>
        <p>{stageDescription}</p>
        <div className="echo-progress" aria-label={showingDaily || guestDaily ? `已种下 ${showingDaily ? dailyRound : board.filter(Boolean).length} / ${DAILY_ROUNDS} 颗每日声音` : showingRelay || isComparingOriginal || guestRelay ? '只改动一拍' : `已完成 ${showingSong ? CHAPTERS.length : phase === 'delivered' ? chapter + 1 : chapter} 封来信`}>
          {showingDaily || guestDaily
            ? Array.from({ length: DAILY_ROUNDS }, (_, index) => <i key={index} className={guestDaily || index < dailyRound || phase === 'listening' && listeningKind === 'daily' && index === dailyRound ? 'is-lit' : ''} />)
            : showingRelay || isComparingOriginal || guestRelay
              ? <i className={relayEditedSlot !== null || guestRelay || isComparingOriginal ? 'is-lit' : ''} />
              : CHAPTERS.map((letter, index) => <i key={letter.title} className={index < chapter || phase === 'delivered' && index <= chapter || showingSong ? 'is-lit' : ''} />)}
        </div>
      </section>

      <section className="echo-garden" aria-label="八格唱片花房">
        <div className="echo-garden-glow" />
        <div className="echo-record">
          <div className="echo-record-grooves" />
          <div className="echo-record-route" />
          {playhead >= 0 && <div className="echo-record-needle" style={{ transform: `rotate(${playhead * 45}deg)` }}><i /></div>}
          {displayedBoard.map((kind, index) => {
            const angle = (index * 45 - 90) * Math.PI / 180
            const isRooted = phase === 'daily-compose' && kind !== null || phase === 'relay' && relayEditedSlot !== null && relayEditedSlot !== index
            const isFeatured = (showingDaily || guestDaily) && index === dailyPattern.featuredSlot
            const isQuiet = (showingDaily || guestDaily) && index === dailyPattern.quietSlot
            const dormant = phase === 'listening' && listeningKind === 'song' && (
              kind === 'rain' && songAct === 0 ||
              kind === 'bell' && songAct < 2 ||
              kind === 'echo' && songAct < 3
            )
            const location = {
              left: `${50 + Math.cos(angle) * 38}%`,
              top: `${50 + Math.sin(angle) * 38}%`,
            } as CSSProperties
            return (
              <button
                className={`echo-slot${kind ? ` has-${kind}` : ''}${playhead === index ? ' is-playing' : ''}${isRooted ? ' is-rooted' : ''}${isFeatured ? ' is-postmark' : ''}${isQuiet ? ' is-quiet' : ''}${markedSlots.includes(index) && phase === 'delivered' ? ' is-marked' : ''}${dormant ? ' is-dormant' : ''}`}
                key={index}
                type="button"
                style={location}
                onClick={() => touchSlot(index)}
                disabled={!isEditing || phase === 'daily-compose' && kind !== null || phase === 'relay' && relayEditedSlot !== null && relayEditedSlot !== index}
                aria-label={`第 ${index + 1} 拍：${kind ? seedInfo(kind).name : '空格'}${isFeatured ? `，今日邮戳目标${seedInfo(dailyPattern.featuredKind).name}` : ''}${isQuiet ? '，今日留白目标' : ''}`}
              >
                <span className="echo-slot-number">{index + 1}</span>
                <span className="echo-slot-symbol">{kind ? seedInfo(kind).icon : '+'}</span>
                {(isFeatured || isQuiet) && <span className="echo-slot-badge" aria-hidden="true">{isFeatured ? '邮' : '空'}</span>}
              </button>
            )
          })}
          <div className={`echo-record-center bloom-${Math.min(4, Math.ceil(plantedCount / 2))}`}>
            <div className="echo-center-flower" aria-hidden="true"><i /><i /><i /><i /><b /></div>
            <strong>{playhead >= 0 && listeningKind === 'song' ? ['心跳', '雨声', '铃花', '合唱'][songAct] : playhead >= 0 ? `第 ${playhead + 1} 拍` : showingDaily ? `${gardenScore.score} 分` : showingSong || showingRelay ? '你的花房' : '声波花房'}</strong>
            <small>{playhead >= 0 ? `第 ${playhead + 1} 拍 · 正在开花` : `${plantedCount} / 8 颗声音`}</small>
          </div>
        </div>
        <div className="echo-garden-caption"><span>↻</span> 一圈八拍 · 每个位置都会发声</div>
      </section>

      <section className="echo-controls">
        {(phase === 'compose' || phase === 'remix') && (
          <>
            {phase === 'remix' && (
              <div className="echo-daily-scoreline">
                <span>当前 <strong>{gardenScore.score}</strong> 分</span>
                <span>{gardenScore.bonuses.length ? `已点亮 ${gardenScore.bonuses.length} 项组合` : '还没有组合奖励'}</span>
              </div>
            )}
            <div className="echo-seed-tray" aria-label="声音种子">
              {SEEDS.map((seed) => {
                const available = allowedSeeds.includes(seed.kind)
                return (
                  <button
                    className={`echo-seed-card is-${seed.kind}${selectedSeed === seed.kind && available ? ' is-selected' : ''}`}
                    key={seed.kind}
                    type="button"
                    onClick={() => selectSeed(seed.kind)}
                    disabled={!available}
                    aria-pressed={selectedSeed === seed.kind && available}
                    aria-label={`${seed.name}：${seed.description}${available ? '' : '，尚未解锁'}`}
                  >
                    <span>{available ? seed.icon : '·'}</span><strong>{seed.name}</strong>
                  </button>
                )
              })}
            </div>
            <p className="echo-notice" role="status">{notice}</p>
            <button className="echo-main-button" type="button" onClick={phase === 'remix' ? playFullSong : listenToLetter}>
              {phase === 'remix' ? '播放这段旋律' : '放唱针 · 送出这封信'} <span>▶</span>
            </button>
            <div className="echo-control-row">
              <button type="button" onClick={undoEdit} disabled={!undoDepth}>撤销一步</button>
              {phase === 'remix' && <button type="button" onClick={finishRemix}>改好了</button>}
            </div>
            {phase === 'remix' && hint && (
              <button className="echo-hint-button" type="button" onClick={applyHint}>
                邮差的提示：第 {hint.index + 1} 拍换{hint.kind ? seedInfo(hint.kind).name : '留白'}，+{hint.gain} 分 <span>↗</span>
              </button>
            )}
          </>
        )}

        {phase === 'daily-compose' && (
          <>
            <div className="echo-daily-scoreline"><span>当前 <strong>{gardenScore.score}</strong> 分</span><span>{dailyBest ? `本地最佳 ${dailyBest} 分` : '组合越巧，花开越盛'}</span></div>
            <div className="echo-seed-tray is-daily" aria-label="本回合的三颗声音种子">
              {allowedSeeds.map((kind) => {
                const seed = seedInfo(kind)
                return <button className={`echo-seed-card is-${kind}${selectedSeed === kind ? ' is-selected' : ''}`} key={kind} type="button" onClick={() => selectSeed(kind)} aria-pressed={selectedSeed === kind} aria-label={`${seed.name}：${seed.description}`}><span>{seed.icon}</span><strong>{seed.name}</strong></button>
              })}
            </div>
            <p className="echo-notice" role="status">{notice}</p>
            <button className="echo-daily-hint" type="button" onClick={openRules}>每颗 +10 · 查看组合与今日邮戳 ↗</button>
          </>
        )}

        {phase === 'relay' && (
          <>
            <div className="echo-daily-scoreline"><span>原谱 <strong>{parentScore}</strong> 分</span><span>接力版 <strong>{gardenScore.score}</strong> 分</span></div>
            <div className="echo-seed-tray" aria-label="接力改谱的声音种子">
              {SEEDS.map((seed) => <button className={`echo-seed-card is-${seed.kind}${selectedSeed === seed.kind ? ' is-selected' : ''}`} key={seed.kind} type="button" onClick={() => selectSeed(seed.kind)} aria-pressed={selectedSeed === seed.kind} aria-label={`${seed.name}：${seed.description}`}><span>{seed.icon}</span><strong>{seed.name}</strong></button>)}
            </div>
            <p className="echo-notice" role="status">{notice}</p>
            <button className="echo-main-button" type="button" onClick={finishRelay} disabled={relayEditedSlot === null}>听这一拍 · 完成接力 <span>▶</span></button>
            {hint && (
              <button className="echo-hint-button" type="button" onClick={applyHint}>
                邮差的提示：第 {hint.index + 1} 拍换{hint.kind ? seedInfo(hint.kind).name : '留白'}，可 +{hint.gain} 分 <span>↗</span>
              </button>
            )}
          </>
        )}

        {phase === 'listening' && <div className="echo-listening-actions"><div className="echo-playing-caption"><span>♫</span> {audioUnavailable ? '正在静音走谱 · 设备暂不支持播放' : listeningKind === 'song' ? `第 ${songAct + 1} 段 · ${['心跳独奏', '雨声加入', '铃花点亮', '整座花房合唱'][songAct]}` : listeningKind === 'daily' ? `花谱正在生长 ${dailyLastGain}` : listeningKind === 'relay' ? '一拍之差，听听花房怎样回应……' : listeningKind === 'original' ? '正在听接力前的原谱……' : '唱针正沿着你的选择旅行……'}</div>{canSkipPlayback && <button className="echo-skip-button" type="button" onClick={skipPlayback}>跳过试听 ↗</button>}</div>}

        {phase === 'delivered' && (
          <>
            <p className="echo-notice is-success" role="status">{notice}</p>
            <button className="echo-main-button" type="button" onClick={continueLetter}>打开下一封信 <span>↗</span></button>
          </>
        )}

        {isFinal && (
          <>
            <p className="echo-song-code">谱子 <strong>{songCode}</strong></p>
            <div className="echo-final-actions">
              <button className="echo-main-button" type="button" onClick={playFullSong}>回放我的花房 <span>▶</span></button>
              <div>
                {guestRelay && <button type="button" onClick={playOriginalSong}>听原谱 ▶</button>}
                <button type="button" onClick={phase === 'guest' ? beginRelay : beginRemix}>{phase === 'guest' ? '接力改一拍' : '自由改谱'}</button>
                <button type="button" onClick={collectSong} disabled={isCollected}>{isCollected ? '已收进收藏册' : '收进收藏册'}</button>
              </div>
              <div>
                <button type="button" onClick={() => void copySong(guestRelay ? 'relay' : guestDaily ? 'daily' : 'song')}>寄给朋友 ↗</button>
                <button type="button" onClick={goWelcome}>回到标题</button>
              </div>
            </div>
            {shareNotice && <p className="echo-share-notice" role="status">{shareNotice}</p>}
            {phase === 'guest' && <button className="echo-inline-button" type="button" onClick={sharedDateRef.current ? () => startDaily(sharedDateRef.current!, guestSavedDaily?.round === DAILY_ROUNDS) : startNewGarden}>{sharedDateRef.current ? guestSavedDaily && guestSavedDaily.round > 0 && guestSavedDaily.round < DAILY_ROUNDS ? `继续 ${sharedDateRef.current} 的花谱` : `挑战 ${sharedDateRef.current} 的每日花谱` : '自己也种一首'}</button>}
          </>
        )}

        {phase === 'daily-result' && (
          <>
            <div className="echo-result-score"><span>本次得分</span><strong>{gardenScore.score}</strong><small>分 · 本地最佳 {dailyBest}</small></div>
            <div className="echo-bonuses" aria-label="本次花谱的组合奖励">{gardenScore.bonuses.length ? gardenScore.bonuses.map((bonus) => <span key={bonus.label}>{bonus.label} +{bonus.points}</span>) : <span>试试让种子组成新的关系</span>}</div>
            <DailyTrail records={dailyRecords} streak={dailyStreakCount} />
            <p className="echo-garden-caption">距明天的新题还有 {countdownLabel(nextDailyMs)}</p>
            <button className="echo-daily-hint" type="button" onClick={openRules}>看看每一项如何计分 ↗</button>
            <div className="echo-final-actions"><button className="echo-main-button" type="button" onClick={() => void copySong('daily')}>分享比分 · 邀请同题 <span>↗</span></button><div><button type="button" onClick={playFullSong}>听完整花谱 ▶</button><button type="button" onClick={() => startDaily(dailyDate, true)}>重种这一天</button><button type="button" onClick={goWelcome}>回到标题</button></div></div>
            {shareNotice && <p className="echo-share-notice" role="status">{shareNotice}</p>}
          </>
        )}

        {phase === 'relay-result' && (
          <>
            <p className="echo-relay-delta">原谱 {parentScore} 分 <span>→</span> 接力版 <strong>{gardenScore.score} 分</strong><small>{changedBeatCopy}</small></p>
            <div className="echo-final-actions"><button className="echo-main-button" type="button" onClick={() => void copySong('relay')}>寄回朋友 · 继续接力 <span>↗</span></button><div><button type="button" onClick={playFullSong}>听完整花房 ▶</button><button type="button" onClick={() => setPhase('relay')}>再调这一拍</button></div></div>
            {shareNotice && <p className="echo-share-notice" role="status">{shareNotice}</p>}
          </>
        )}
        {shareFallbackUrl && <input className="echo-share-fallback" aria-label="可手动复制的邀请链接" readOnly value={shareFallbackUrl} onFocus={(event) => event.currentTarget.select()} />}
      </section>

      {showRules && <div className="echo-rules-backdrop" onClick={closeRules}>
        <section className="echo-rules-dialog" role="dialog" aria-modal="true" aria-label="每日花谱计分规则" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
          if (event.key !== 'Tab') return
          if (event.shiftKey && document.activeElement === rulesCloseRef.current) {
            event.preventDefault()
            rulesActionRef.current?.focus()
          } else if (!event.shiftKey && document.activeElement === rulesActionRef.current) {
            event.preventDefault()
            rulesCloseRef.current?.focus()
          }
        }}>
          <button ref={rulesCloseRef} className="echo-rules-close" type="button" onClick={closeRules} aria-label="关闭计分规则">×</button>
          <span className="echo-rules-kicker">HOW THE GARDEN GROWS</span>
          <h2>花谱如何得分？</h2>
          <p>六次选择只看最终唱片。声音的位置，比声音的数量更有趣。</p>
          <ul>
            <li><span>每颗种子</span><strong>+10</strong></li>
            <li><span>两颗心跳相隔四格</span><strong>+30</strong></li>
            <li><span>雨声落在两颗对置心跳之间的两段路上</span><strong>+25</strong></li>
            <li><span>铃声顺时针下一格是回声</span><strong>+25</strong></li>
            <li><span>四种声音都出现</span><strong>+20</strong></li>
            <li><span>不同声音相邻，每对 +4，最多三对</span><strong>+12</strong></li>
            <li><span>今日邮戳：第 {dailyPattern.featuredSlot + 1} 拍放{seedInfo(dailyPattern.featuredKind).name}</span><strong>+25</strong></li>
            <li><span>今日留白：六颗种下后，第 {dailyPattern.quietSlot + 1} 拍仍为空</span><strong>+15</strong></li>
          </ul>
          <small>同类图案只奖励一次；唱片是圆的，第 8 格与第 1 格也相邻。</small>
          <button ref={rulesActionRef} className="echo-main-button" type="button" onClick={closeRules}>知道啦，继续种歌 <span>↗</span></button>
        </section>
      </div>}
    </main>
  )
}

export default EchoGarden

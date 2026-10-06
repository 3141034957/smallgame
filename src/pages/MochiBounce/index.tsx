import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  aimFromDrag,
  DEFAULT_AIM,
  HEIGHT,
  LAUNCH,
  makeGarden,
  replayRound,
  SHOTS,
  simulateShot,
  todayRoute,
  validDay,
  WIDTH,
} from '@/features/bounce/rules.mjs'
import type {
  Aim,
  BounceRound,
  GardenNode,
  HitEvent,
  ShotResult,
} from '@/features/bounce/rules.mjs'
import { loadBest, saveBest } from '@/features/bounce/progress'
import {
  ACTS,
  CAST,
  decodeShow,
  encodeShow,
  replayTour,
  simulateTourShot,
} from '@/features/bounce/tour.mjs'
import type { Character, TourAim, TourRound } from '@/features/bounce/tour.mjs'
import { ListeningCard } from './ListeningCard'
import { qqSongLink } from '@/features/bounce/music'
import type { SongContext } from './ListeningCard'
import { MelodyAudio } from '@/features/melody/audio'
import { loadPlayer } from '@/features/melody/leaderboard'
import { Mascot } from '../MochiMelody/Mascot'
import { BounceBoard, BounceSubmit } from './BounceBoard'
import './index.less'

const COLORS = ['#efa48e', '#bda6df', '#dfb77c', '#98c8a5']
const ICONS = ['●', '✿', '♧', '♪']
type Flight = {
  result: ShotResult
  aim: TourAim
  elapsed: number
  cursor: number
  pathCursor: number
  base: number
}
type Stage = 'ready' | 'flying' | 'settling'

function Flower({
  node,
  hit,
  world = 'garden',
}: {
  node: GardenNode
  hit: boolean
  world?: string
}) {
  const burst = node.kind === 'burst',
    gold = node.kind === 'gold'
  const color = burst ? '#ef94ac' : gold ? '#f0c76b' : COLORS[node.lane]
  return (
    <g
      className={`bounce-flower${hit ? ' is-hit' : ''}${burst ? ' is-burst' : ''}${gold ? ' is-gold' : ''}`}
      transform={`translate(${node.x} ${node.y})`}
    >
      <ellipse cy="21" rx="23" ry="5" fill="#849b6e" opacity=".14" />
      {world === 'soda' ? (
        <>
          <circle r="27" fill={color} opacity=".45" stroke="#fffdf2" strokeWidth="2" />
          <path
            d="M-17-7q1-12 14-13"
            stroke="#fffefa"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
        </>
      ) : (
        Array.from({ length: 6 }, (_, petal) => (
          <ellipse
            key={petal}
            cy="-16"
            rx="12"
            ry="14"
            fill={color}
            stroke={burst ? '#da7b98' : gold ? '#d5aa53' : '#fff6e7'}
            strokeWidth="1.4"
            transform={`rotate(${petal * 60})`}
          />
        ))
      )}
      <circle
        r="17"
        fill={gold ? '#fff1b7' : '#fff9e9'}
        stroke={burst ? '#ce7895' : '#b49c78'}
        strokeWidth="1.2"
      />
      <text
        y="5"
        textAnchor="middle"
        fontSize={burst ? 22 : 20}
        fill={burst ? '#c76b91' : gold ? '#ba8836' : color}
      >
        {burst ? '✦' : gold ? '★' : ICONS[node.lane]}
      </text>
      {burst && (
        <g fill="#a9657c">
          <circle cx="-6" cy="-6" r="1.5" />
          <circle cx="6" cy="-6" r="1.5" />
        </g>
      )}
    </g>
  )
}

export default function MochiBounce() {
  const [params] = useSearchParams()
  const [day] = useState(() => (validDay(params.get('day')) ? params.get('day')! : todayRoute()))
  const mode =
    params.get('mode') === 'classic' || (params.has('target') && !params.has('mode'))
      ? 'classic'
      : 'tour'
  const [character, setCharacter] = useState<Character>('rabbit')
  const member = CAST.find((item) => item.id === character)!
  const [song, setSong] = useState<SongContext>(() => ({
    title: (params.get('song') || '').slice(0, 40),
    link: qqSongLink(params.get('qq') || ''),
  }))
  const sharedShots = useMemo(() => decodeShow(params.get('show')), [params])
  const sharedRound = useMemo(
    () => (sharedShots ? replayTour(day, sharedShots) : null),
    [day, sharedShots],
  )
  const target =
    sharedRound?.score ?? Math.min(30000, Math.max(0, Number(params.get('target')) || 0))
  const [player, setPlayer] = useState(loadPlayer)
  const [scene, setScene] = useState<'play' | 'result' | 'board'>('play')
  const [stage, setStage] = useState<Stage>('ready')
  const [shots, setShots] = useState<TourAim[]>([])
  const [aim, setAim] = useState<Aim>(DEFAULT_AIM)
  const [dragging, setDragging] = useState(false)
  const [ball, setBall] = useState({ ...LAUNCH })
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([])
  const [hits, setHits] = useState<HitEvent[]>([])
  const [effects, setEffects] = useState<HitEvent[]>([])
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [fever, setFever] = useState(false)
  const [feedback, setFeedback] = useState('撞粉色炸花，周围的乐器会一起开唱！')
  const [round, setRound] = useState<BounceRound | TourRound | null>(null)
  const [best, setBest] = useState(() => loadBest(day, mode))
  const [bestBefore, setBestBefore] = useState(() => loadBest(day, mode))
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [help, setHelp] = useState(false)
  const [boardRevision, setBoardRevision] = useState(0)
  const [shareUrl, setShareUrl] = useState('')
  const [toast, setToast] = useState('')
  const [storageWarning, setStorageWarning] = useState(false)
  const pageRef = useRef<HTMLElement>(null)
  const fieldRef = useRef<HTMLDivElement>(null)
  const launchRef = useRef<HTMLButtonElement>(null)
  const helpTrigger = useRef<HTMLButtonElement>(null)
  const closeHelp = useRef<HTMLButtonElement>(null)
  const helpReplay = useRef<HTMLButtonElement>(null)
  const pauseResume = useRef<HTMLButtonElement>(null)
  const pauseRestart = useRef<HTMLButtonElement>(null)
  const dragRef = useRef<{ pointer: number; x: number; y: number } | null>(null)
  const flightRef = useRef<Flight | null>(null)
  const shotsRef = useRef<TourAim[]>([])
  const completedScore = useRef(0)
  const allNotes = useRef<HitEvent[]>([])
  const audioRef = useRef<MelodyAudio | null>(null)
  if (!audioRef.current) audioRef.current = new MelodyAudio()
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const serial = useRef(0)
  const act = ACTS[Math.min(shots.length, SHOTS - 1)]
  const garden = useMemo(
    () => makeGarden(day, Math.min(shots.length, SHOTS - 1)),
    [day, shots.length],
  )
  const hitIds = useMemo(
    () => new Set(hits.filter((hit) => hit.id >= 0).map((hit) => hit.id)),
    [hits],
  )
  const preview = useMemo(() => {
    if (stage !== 'ready') return []
    const shot = (
      mode === 'tour'
        ? simulateTourShot(day, Math.min(shots.length, SHOTS - 1), { ...aim, character })
        : simulateShot(day, Math.min(shots.length, SHOTS - 1), aim)
    )!
    const end = Math.min(0.4, shot.events[0]?.t ?? 0.4)
    return shot.path.filter((point, index) => point.t <= end && index % 2 === 0)
  }, [day, shots.length, aim, stage, mode, character])
  const reducedMotion = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  const notify = (message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = setTimeout(() => setToast(''), 3500)
  }
  useEffect(
    () => () => {
      serial.current++
      audioRef.current?.dispose()
      if (toastTimer.current) clearTimeout(toastTimer.current)
    },
    [],
  )
  useEffect(() => {
    pageRef.current?.scrollTo({ top: 0 })
    pageRef.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true })
    if (scene !== 'play') audioRef.current?.stop()
  }, [scene])
  useEffect(() => {
    if (scene === 'play' && stage === 'ready' && !paused && !help)
      launchRef.current?.focus({ preventScroll: true })
  }, [scene, stage, paused, help])
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) {
        if (flightRef.current) setPaused(true)
        audioRef.current?.stop()
        dragRef.current = null
        setDragging(false)
      }
    }
    document.addEventListener('visibilitychange', hidden)
    return () => document.removeEventListener('visibilitychange', hidden)
  }, [])
  useEffect(() => {
    if (paused || help) audioRef.current?.stop()
  }, [paused, help])
  useEffect(() => {
    if (!help) return
    closeHelp.current?.focus()
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHelp(false)
        helpTrigger.current?.focus()
      }
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [help])

  const restart = () => {
    serial.current++
    audioRef.current?.stop()
    flightRef.current = null
    dragRef.current = null
    shotsRef.current = []
    completedScore.current = 0
    allNotes.current = []
    const stored = loadBest(day, mode)
    setBestBefore({
      score: Math.max(best.score, stored.score),
      maxCombo: Math.max(best.maxCombo, stored.maxCombo),
    })
    setShots([])
    setAim(DEFAULT_AIM)
    setBall({ ...LAUNCH })
    setTrail([])
    setHits([])
    setEffects([])
    setScore(0)
    setCombo(0)
    setFever(false)
    setRound(null)
    setDragging(false)
    setStage('ready')
    setPaused(false)
    setShareUrl('')
    setScene('play')
    setFeedback('换个角度试试，下一次可能就是大连锁！')
    pageRef.current?.scrollTo({ top: 0 })
    launchRef.current?.focus({ preventScroll: true })
  }
  const launch = (chosen: Aim) => {
    if (
      flightRef.current ||
      stage !== 'ready' ||
      shotsRef.current.length >= SHOTS ||
      help ||
      paused
    )
      return
    audioRef.current?.stop()
    const performed = { ...chosen, character }
    const result = (
      mode === 'tour'
        ? simulateTourShot(day, shotsRef.current.length, performed)
        : simulateShot(day, shotsRef.current.length, chosen)
    )!
    flightRef.current = {
      result,
      aim: performed,
      elapsed: 0,
      cursor: 0,
      pathCursor: 0,
      base: completedScore.current,
    }
    setHits([])
    setEffects([])
    setCombo(0)
    setFever(false)
    setTrail([])
    setDragging(false)
    dragRef.current = null
    setStage('flying')
    const generation = serial.current
    void audioRef.current!.prepare().then((ready) => {
      if (ready && generation === serial.current) audioRef.current?.playLane(1, 72)
    })
  }

  useEffect(() => {
    if (stage === 'ready' || scene !== 'play' || paused || help) return
    let animation = 0,
      last = 0
    const tick = (now: number) => {
      const flight = flightRef.current
      if (!flight) return
      const delta = last ? Math.min(0.08, (now - last) / 1000) : 0
      last = now
      flight.elapsed += delta
      const newly = []
      while (
        flight.cursor < flight.result.events.length &&
        flight.result.events[flight.cursor].t <= flight.elapsed
      )
        newly.push(flight.result.events[flight.cursor++])
      if (newly.length) {
        const latest = newly.at(-1)!
        setScore(flight.base + latest.total)
        setCombo(latest.combo)
        setHits(flight.result.events.slice(0, flight.cursor))
        const sounds = newly.filter((event) => event.id >= 0).slice(0, 6)
        sounds.forEach((event, index) =>
          audioRef.current?.playLane(event.lane, event.midi, index * 0.045),
        )
        if (newly.some((event) => event.fever)) {
          setFever(true)
          ;[72, 76, 79, 84].forEach((midi, index) =>
            audioRef.current?.playLane(1, midi, index * 0.08),
          )
          if (!reducedMotion.current) navigator.vibrate?.([20, 25, 30])
        } else if (!reducedMotion.current) navigator.vibrate?.(12)
      }
      setEffects(
        flight.result.events
          .slice(0, flight.cursor)
          .filter((event) => flight.elapsed - event.t < 0.95),
      )
      const path = flight.result.path
      while (flight.pathCursor < path.length - 1 && path[flight.pathCursor + 1].t <= flight.elapsed)
        flight.pathCursor++
      const point = path[flight.pathCursor]
      const following = path[flight.pathCursor + 1] ?? point
      const fraction = following.jump
        ? 0
        : Math.min(1, Math.max(0, (flight.elapsed - point.t) / (following.t - point.t || 1)))
      setBall({
        x: point.x + (following.x - point.x) * fraction,
        y: point.y + (following.y - point.y) * fraction,
      })
      const lastJump = path.slice(0, flight.pathCursor + 1).findLastIndex((point) => point.jump)
      setTrail(path.slice(Math.max(0, lastJump, flight.pathCursor - 8), flight.pathCursor + 1))
      if (flight.elapsed >= flight.result.duration && stage === 'flying') setStage('settling')
      if (flight.elapsed >= flight.result.duration + 0.85) {
        const next = [...shotsRef.current, flight.aim]
        shotsRef.current = next
        completedScore.current = flight.base + flight.result.score
        allNotes.current.push(...flight.result.events.filter((event) => event.id >= 0))
        flightRef.current = null
        setScore(completedScore.current)
        setShots(next)
        if (next.length === SHOTS) {
          const finished = (mode === 'tour' ? replayTour(day, next) : replayRound(day, next))!
          setRound(finished)
          setBest({
            score: Math.max(bestBefore.score, finished.score),
            maxCombo: Math.max(bestBefore.maxCombo, finished.maxCombo),
          })
          if (!saveBest(finished, mode)) setStorageWarning(true)
          setScene('result')
          setStage('ready')
          setBoardRevision((value) => value + 1)
        } else {
          setStage('ready')
          setHits([])
          setEffects([])
          setFever(false)
          setTrail([])
          setBall({ ...LAUNCH })
          setAim(DEFAULT_AIM)
          setFeedback(
            flight.result.combo >= 6
              ? `漂亮！${flight.result.combo} 连击，+${flight.result.score.toLocaleString()} 分。下一发，试试另一侧的炸花！`
              : `这一发 +${flight.result.score} 分。瞄准粉色炸花，试试更大的连锁！`,
          )
          launchRef.current?.focus({ preventScroll: true })
        }
        return
      }
      animation = requestAnimationFrame(tick)
    }
    animation = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animation)
  }, [stage, scene, paused, help, day, bestBefore, mode])

  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (stage !== 'ready' || help || paused || event.button !== 0) return
    event.preventDefault()
    fieldRef.current?.setPointerCapture(event.pointerId)
    dragRef.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY }
    setAim(DEFAULT_AIM)
    setDragging(true)
    void audioRef.current?.prepare()
  }
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointer !== event.pointerId) return
    const scale = WIDTH / fieldRef.current!.getBoundingClientRect().width
    setAim(aimFromDrag((event.clientX - drag.x) * scale, (event.clientY - drag.y) * scale))
  }
  const release = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointer !== event.pointerId) return
    const scale = WIDTH / fieldRef.current!.getBoundingClientRect().width
    const chosen = aimFromDrag((event.clientX - drag.x) * scale, (event.clientY - drag.y) * scale)
    dragRef.current = null
    setDragging(false)
    if (fieldRef.current?.hasPointerCapture(event.pointerId))
      fieldRef.current.releasePointerCapture(event.pointerId)
    launch(chosen)
  }
  const share = async () => {
    if (!round) return
    const url = new URL(window.location.href)
    url.hash = `/bounce?${new URLSearchParams({ day, mode, target: String(round.score), ...(mode === 'tour' ? { show: encodeShow(shotsRef.current), song: song.title, qq: qqSongLink(song.link) } : {}) })}`
    setShareUrl(url.toString())
    try {
      await navigator.clipboard.writeText(
        `我为你弹了一首歌，演奏拿到 ${round.maxCombo} 连击、${round.score} 分！点开听我的伴奏，再用自己的方式弹一次！ ${url}`,
      )
      notify('挑战链接已复制，发给朋友一起弹！')
    } catch {
      setShareUrl(url.toString())
      notify('复制下方链接，就能邀请朋友挑战同一张花园。')
    }
  }
  const openBoard = () => {
    if (stage !== 'ready') setPaused(true)
    setScene('board')
    audioRef.current?.stop()
  }
  const returnPlay = () => {
    setScene(round ? 'result' : 'play')
    if (flightRef.current) setPaused(true)
  }
  const latestFever = effects.some((event) => event.fever)

  return (
    <main
      ref={pageRef}
      className={`mochi-bounce${mode === 'tour' ? ' is-tour' : ''}${fever && stage !== 'ready' ? ' is-fever' : ''}`}
    >
      <div className="bounce-shell">
        <header className="bounce-header">
          <a className="bounce-logo" href="#/">
            ♫
            <span>
              软糖乐队<small>LISTEN. PLAY. SEND LOVE.</small>
            </span>
          </a>
          <div>
            <button type="button" className="bounce-chart-link" onClick={openBoard}>
              🏆 排行榜
            </button>
            <button
              type="button"
              className="bounce-icon-button"
              aria-label={muted ? '开启弹弹乐声音' : '静音弹弹乐'}
              aria-pressed={muted}
              onClick={() => {
                setMuted(!muted)
                audioRef.current?.setMuted(!muted)
              }}
            >
              {muted ? '♩' : '♫'}
            </button>
            <button
              ref={helpTrigger}
              type="button"
              className="bounce-icon-button"
              aria-label="弹弹乐玩法"
              onClick={() => setHelp(true)}
            >
              ?
            </button>
          </div>
        </header>

        {scene === 'play' && (
          <>
            <section className="bounce-title">
              <span className="bounce-eyebrow">
                {mode === 'tour' ? 'QQ 音乐听歌互动 · 概念试玩' : 'PULL. BOUNCE. BOOM! ✦'}
              </span>
              <h1 tabIndex={-1}>
                {mode === 'tour' ? (
                  <>
                    弹一首歌<span>给你</span>
                  </>
                ) : (
                  <>
                    小兔<span>弹弹乐</span>
                  </>
                )}
                <i>♪</i>
              </h1>
              <p>
                {mode === 'tour'
                  ? '拉一下小动物，给喜欢的歌加一段你的伴奏'
                  : '拖住小兔，往下拉，松手开炸！'}
              </p>
              {target > 0 && (
                <div className="bounce-challenge">
                  ✉ 朋友邀你挑战 {target.toLocaleString()} 分，试试能不能超过 TA！
                </div>
              )}
            </section>
            <div className="bounce-layout">
              <section className="bounce-game">
                {mode === 'tour' && (
                  <>
                    <ListeningCard
                      song={song}
                      onChange={setSong}
                      locked={shots.length > 0 || stage !== 'ready'}
                      stopped={paused || help || scene !== 'play'}
                      muted={muted}
                    />
                    {sharedRound && (
                      <div className="bounce-friend-show">
                        <span>✉ 朋友送来了一段伴奏</span>
                        <button
                          type="button"
                          disabled={stage !== 'ready'}
                          onClick={() => {
                            const generation = serial.current
                            void audioRef.current!.prepare().then((ready) => {
                              if (!ready || generation !== serial.current) return
                              audioRef.current?.stop()
                              sharedShots!
                                .flatMap((shot, index) =>
                                  simulateTourShot(day, index, shot)!.events.filter(
                                    (event) => event.id >= 0,
                                  ),
                                )
                                .forEach((note, index) =>
                                  audioRef.current?.playLane(note.lane, note.midi, index * 0.13),
                                )
                              notify('正在播放朋友弹出的伴奏 ♫')
                            })
                          }}
                        >
                          ♫ 听 TA 弹的
                        </button>
                      </div>
                    )}
                    <div className="bounce-cast">
                      {CAST.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          disabled={stage !== 'ready'}
                          aria-pressed={character === item.id}
                          onClick={() => setCharacter(item.id)}
                        >
                          <Mascot lane={item.lane} happy />
                          <strong>{item.name}</strong>
                          <small>{item.skill}</small>
                        </button>
                      ))}
                    </div>
                    <div className="bounce-act-line">
                      {ACTS.map((item, index) => (
                        <span key={item.id} className={shots.length === index ? 'is-current' : ''}>
                          {item.emoji} {['前奏', '副歌', '尾奏'][index]}
                        </span>
                      ))}
                      <small>{member.detail}</small>
                    </div>
                  </>
                )}
                <div className="bounce-hud">
                  <div className="bounce-score" key={score}>
                    <small>快乐分</small>
                    <strong>{score.toLocaleString()}</strong>
                  </div>
                  <div className={`bounce-combo${combo >= 6 ? ' is-hot' : ''}`}>
                    <strong>
                      {combo || '—'}
                      <span>连击</span>
                    </strong>
                    <small>
                      {combo
                        ? `×${Math.min(5, 1 + Math.floor(combo / 4))} 分数加成`
                        : '撞得越多，分越高'}
                    </small>
                  </div>
                  <div className="bounce-shots">
                    <small>这局还剩</small>
                    <div>
                      {Array.from({ length: SHOTS }, (_, index) => (
                        <span
                          key={index}
                          className={
                            index < shots.length || (index === shots.length && stage !== 'ready')
                              ? 'is-used'
                              : ''
                          }
                        >
                          ♡
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div
                  ref={fieldRef}
                  className={`bounce-field${mode === 'tour' ? ` world-${act.id}` : ''}${dragging ? ' is-aiming' : ''}${latestFever ? ' is-booming' : ''}`}
                  role="group"
                  aria-label="弹弹花园，拖动底部小兔瞄准并松手弹射"
                  onPointerMove={moveDrag}
                  onPointerUp={release}
                  onPointerCancel={() => {
                    dragRef.current = null
                    setDragging(false)
                    setAim(DEFAULT_AIM)
                  }}
                  onLostPointerCapture={() => {
                    dragRef.current = null
                    setDragging(false)
                  }}
                >
                  <svg
                    className="bounce-garden"
                    viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient id="bounce-grass" x2="0" y2="1">
                        <stop
                          stopColor={
                            mode === 'tour' && act.id === 'moon'
                              ? '#f2ecfb'
                              : mode === 'tour' && act.id === 'soda'
                                ? '#e6f4f3'
                                : '#ecf5d9'
                          }
                        />
                        <stop
                          offset="1"
                          stopColor={
                            mode === 'tour' && act.id === 'moon'
                              ? '#dfd5ef'
                              : mode === 'tour' && act.id === 'soda'
                                ? '#cde7e8'
                                : '#dcebc8'
                          }
                        />
                      </linearGradient>
                    </defs>
                    <rect
                      x="5"
                      y="6"
                      width="350"
                      height="479"
                      rx="30"
                      fill="url(#bounce-grass)"
                      stroke="#bcd3a0"
                      strokeWidth="2"
                    />
                    <path
                      d="M20 42Q38 23 57 39M301 40q18-17 36 0M27 360l5-9 4 9m280 13 4-8 5 8"
                      fill="none"
                      stroke="#b5ce96"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <text
                      x="180"
                      y="29"
                      textAnchor="middle"
                      fill="#7b956c"
                      fontSize="8"
                      letterSpacing="2"
                    >
                      {mode === 'tour' ? act.name : 'A GARDEN OF LITTLE SURPRISES'}
                    </text>
                    {mode === 'tour' &&
                      act.id === 'moon' &&
                      [
                        { x: 28, y: 342 },
                        { x: 332, y: 78 },
                      ].map((gate, index) => (
                        <g key={index} transform={`translate(${gate.x} ${gate.y})`}>
                          <circle r="25" fill="#c2b4e5" stroke="#fff5fd" strokeWidth="3" />
                          <text y="10" textAnchor="middle" fill="#fff7eb" fontSize="30">
                            ☾
                          </text>
                        </g>
                      ))}
                    {effects
                      .filter((event) => event.origin)
                      .map((event) => (
                        <line
                          key={`link-${event.id}`}
                          x1={event.origin!.x}
                          y1={event.origin!.y}
                          x2={event.x}
                          y2={event.y}
                          stroke={COLORS[event.lane]}
                          strokeWidth="3"
                          opacity=".6"
                        />
                      ))}
                    {garden.map((node) => (
                      <Flower
                        key={`${shots.length}-${node.id}`}
                        node={node}
                        world={mode === 'tour' ? act.id : 'garden'}
                        hit={hitIds.has(node.id)}
                      />
                    ))}
                    {stage === 'ready' &&
                      preview.map((point, index) => (
                        <circle
                          key={index}
                          cx={point.x}
                          cy={point.y}
                          r={dragging ? 3.5 : 2.5}
                          fill="#8caa70"
                          opacity={0.3 + (index / Math.max(1, preview.length)) * 0.45}
                        />
                      ))}
                    {!reducedMotion.current && stage !== 'ready' && (
                      <polyline
                        points={trail.map((point) => `${point.x},${point.y}`).join(' ')}
                        fill="none"
                        stroke={fever ? '#eda79e' : '#d7bbeb'}
                        strokeWidth="16"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity=".45"
                      />
                    )}
                    <path
                      d="M37 475Q83 459 128 475T219 475T310 475"
                      fill="none"
                      stroke="#fff8e9"
                      strokeWidth="12"
                      strokeLinecap="round"
                    />
                  </svg>
                  {stage === 'ready' ? (
                    <button
                      ref={launchRef}
                      type="button"
                      className={`bounce-launcher${dragging ? ' is-pulled' : ''}`}
                      aria-label={`弹射${mode === 'tour' ? member.name : '小兔'}，第 ${shots.length + 1} 发，可拖动瞄准或点击发射`}
                      style={
                        {
                          left: `${(LAUNCH.x / WIDTH) * 100}%`,
                          top: `${(LAUNCH.y / HEIGHT) * 100}%`,
                          '--pull': dragging ? `${aim.power * 0.09}px` : '0px',
                        } as CSSProperties
                      }
                      onPointerDown={startDrag}
                      onClick={(event) => {
                        if (event.detail === 0) launch(aim)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                          event.preventDefault()
                          setAim((value) => ({
                            ...value,
                            angle: Math.max(
                              -65,
                              Math.min(65, value.angle + (event.key === 'ArrowLeft' ? -5 : 5)),
                            ),
                          }))
                        }
                        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                          event.preventDefault()
                          setAim((value) => ({
                            ...value,
                            power: Math.max(
                              45,
                              Math.min(100, value.power + (event.key === 'ArrowUp' ? 5 : -5)),
                            ),
                          }))
                        }
                      }}
                    >
                      <Mascot lane={mode === 'tour' ? member.lane : 1} happy />
                      <span>
                        {dragging
                          ? '松手，开炸！'
                          : shots.length
                            ? '再弹一下 ↓'
                            : '拖住我，往下拉 ↓'}
                      </span>
                    </button>
                  ) : (
                    <div
                      className="bounce-flying-rabbit"
                      style={{
                        left: `${(ball.x / WIDTH) * 100}%`,
                        top: `${(ball.y / HEIGHT) * 100}%`,
                      }}
                    >
                      <Mascot
                        lane={
                          mode === 'tour'
                            ? (CAST.find((item) => item.id === flightRef.current?.aim.character)
                                ?.lane ?? member.lane)
                            : 1
                        }
                        happy
                      />
                    </div>
                  )}
                  {effects.map((event) => (
                    <div
                      key={event.id}
                      className={`bounce-pop${event.fever ? ' is-fever-pop' : ''}${event.kind === 'burst' ? ' is-burst-pop' : ''}`}
                      style={{
                        left: `${(event.x / WIDTH) * 100}%`,
                        top: `${(event.y / HEIGHT) * 100}%`,
                        color: COLORS[event.lane],
                      }}
                    >
                      <i>{event.fever ? '✦' : event.kind === 'burst' ? '♡' : '♪'}</i>
                      <b>
                        {event.points
                          ? `+${event.points}`
                          : event.kind === 'portal'
                            ? '穿越！'
                            : '技能！'}
                      </b>
                    </div>
                  ))}
                  {latestFever && (
                    <div className="bounce-fever-banner" role="status">
                      <span>✦ 合奏爆发 ✦</span>
                      <strong>{combo} 连击！</strong>
                      <small>所有声音，为你一起开唱</small>
                    </div>
                  )}
                  {stage === 'ready' && (
                    <div className="bounce-aim-label">
                      {dragging
                        ? `力度 ${aim.power}% · 瞄准粉色炸花`
                        : mode === 'tour'
                          ? act.hint
                          : '也可以点一下小兔，直接弹！'}
                    </div>
                  )}
                </div>
                <div className="bounce-feedback" role="status">
                  <span>{stage !== 'ready' ? (fever ? '✦' : '♪') : '♡'}</span>
                  <p>
                    {stage !== 'ready'
                      ? combo >= 6
                        ? `${combo} 连击！声音越来越热闹啦！`
                        : combo
                          ? `${combo} 连击，继续弹！`
                          : `${mode === 'tour' ? member.name : '小兔'}出发啦，听听会撞出什么声音…`
                      : feedback}
                  </p>
                </div>
                <div className="bounce-game-foot">
                  <span>
                    今日最佳 <b>{best.score.toLocaleString()}</b>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPaused(true)}
                    disabled={stage === 'ready'}
                  >
                    Ⅱ 暂停
                  </button>
                  <span>
                    第 {Math.min(SHOTS, shots.length + 1)} / {SHOTS} 发
                  </span>
                </div>
              </section>
              <aside className="bounce-sidebar">
                <section className="bounce-little-tip">
                  <div>
                    <Mascot lane={0} happy />
                    <span>奶糖的小提示</span>
                  </div>
                  <h2>
                    {mode === 'tour' ? (
                      <>
                        把一首喜欢的歌，
                        <br />
                        变成两个人的回忆。
                      </>
                    ) : (
                      <>
                        不用追拍子，
                        <br />
                        只管弹出好心情。
                      </>
                    )}
                  </h2>
                  <p>
                    <b>✦ 粉色炸花</b> 让周围乐器连锁开唱
                    <br />
                    <b>★ 金色音符</b> 每颗基础 150 分<br />
                    <b>♫ 六连击</b> 合奏爆发，额外 +400 分
                  </p>
                  <small>
                    拉向左边，小兔就会弹向右边。
                    <br />
                    利用墙壁反弹，找到你的神级角度。
                  </small>
                </section>
                <BounceBoard
                  mode={mode}
                  day={day}
                  player={player}
                  revision={boardRevision}
                  compact
                />
              </aside>
            </div>
            <footer className="bounce-footer">
              <a href="#/bounce?mode=classic">经典弹弹乐</a>
              <a href="#/island">声音探险</a>
              <a href="#/rhythm">节奏舞台</a>
              <span>三发一局，下一发可能更漂亮 ♡</span>
            </footer>
          </>
        )}

        {scene === 'result' && round && (
          <section className="bounce-result">
            <span className="bounce-eyebrow">YOUR LITTLE MUSIC MOMENT</span>
            <h1 tabIndex={-1}>
              {round.score > bestBefore.score
                ? '新纪录！小兔为你尖叫啦'
                : round.maxCombo >= 12
                  ? '这一弹，简直是神级合奏！'
                  : '又弹出了一口袋好心情！'}
            </h1>
            {mode === 'tour' && 'title' in round && (
              <div className="bounce-song-card">
                <div className="bounce-vinyl">
                  ♫<span>FOR YOU</span>
                </div>
                <div>
                  <small>你的三幕演奏 · {day}</small>
                  <h2>{song.title ? `给《${song.title}》的伴奏` : round.title}</h2>
                  <p>
                    {round.skills} 次动物招式 · {round.portals} 次声音穿越
                  </p>
                  <div className="bounce-voice-bars">
                    {round.voices.map((count, lane) => (
                      <span
                        key={lane}
                        style={{ height: `${12 + count * 1.5}px`, background: COLORS[lane] }}
                      />
                    ))}
                  </div>
                  {qqSongLink(song.link) && (
                    <a href={qqSongLink(song.link)} target="_blank" rel="noopener noreferrer">
                      去 QQ 音乐听原曲 ↗
                    </a>
                  )}
                </div>
              </div>
            )}
            <div className="bounce-result-band">
              {[0, 1, 2, 3].map((lane) => (
                <Mascot key={lane} lane={lane as 0 | 1 | 2 | 3} happy />
              ))}
            </div>
            <div className="bounce-result-score">
              <span>
                {'★'.repeat(round.stars)}
                {'☆'.repeat(3 - round.stars)}
              </span>
              <small>这一局的演奏分</small>
              <strong>{round.score.toLocaleString()}</strong>
              <p>
                {round.score > bestBefore.score
                  ? bestBefore.score
                    ? `比上次最佳多了 ${round.score - bestBefore.score} 分，角度越来越准啦！`
                    : '你的第一份弹弹纪录，诞生啦！'
                  : `今日最佳 ${best.score.toLocaleString()} 分 · 再拿 ${best.score - round.score + 1} 分就能破纪录！`}
              </p>
              <div>
                <span>
                  <b>{round.maxCombo}</b>最高连击
                </span>
                <span>
                  <b>{round.fevers}</b>合奏爆发
                </span>
                <span>
                  <b>{round.hits}</b>击中乐器
                </span>
              </div>
              {target > 0 && (
                <p>
                  {round.score > target
                    ? `超过朋友 ${round.score - target} 分！把新挑战寄回去吧。`
                    : `距离朋友的纪录还差 ${target - round.score + 1} 分，换个角度再来！`}
                </p>
              )}
            </div>
            <div className="bounce-result-actions">
              <button type="button" className="bounce-primary" onClick={restart}>
                再弹一局，冲破纪录 <span>↗</span>
              </button>
              <button type="button" className="bounce-secondary" onClick={() => void share()}>
                {mode === 'tour' ? '把这首演奏送给 TA ✉' : '邀朋友来超我 ✉'}
              </button>
            </div>
            <button
              type="button"
              className="bounce-listen"
              onClick={() => {
                const generation = serial.current
                void audioRef.current!.prepare().then((ready) => {
                  if (!ready || generation !== serial.current) return
                  audioRef.current?.stop()
                  allNotes.current.forEach((note, index) =>
                    audioRef.current?.playLane(note.lane, note.midi, index * 0.13),
                  )
                  notify('正在播放这一局生成的伴奏 ♫')
                })
              }}
            >
              ♫ 听听刚才炸出来的合奏
            </button>
            <BounceSubmit
              round={round}
              player={player}
              onPlayer={setPlayer}
              onSubmitted={() => setBoardRevision((value) => value + 1)}
            />
            <BounceBoard mode={mode} day={day} player={player} revision={boardRevision} compact />
            <button type="button" className="bounce-text-button" onClick={openBoard}>
              看看完整排行榜 ↗
            </button>
            {storageWarning && (
              <p className="bounce-save-warning" role="status">
                本机存档暂时不可用，本次成绩仍可提交排行榜。
              </p>
            )}
          </section>
        )}
        {scene === 'board' && (
          <div className="bounce-full-board">
            <h1 tabIndex={-1}>谁把快乐，弹得最高？</h1>
            <BounceBoard
              mode={mode}
              day={day}
              player={player}
              revision={boardRevision}
              onPlay={restart}
            />
            <button type="button" className="bounce-text-button" onClick={returnPlay}>
              {round ? '回到我的成绩' : '回到我的这一局'}
            </button>
          </div>
        )}
        {shareUrl && (
          <div className="bounce-share">
            <label htmlFor="bounce-share">复制这个链接，邀请朋友挑战：</label>
            <input
              id="bounce-share"
              readOnly
              value={shareUrl}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
        )}
      </div>
      {toast && (
        <div className="bounce-toast" role="status">
          {toast}
        </div>
      )}
      {paused && scene === 'play' && !help && (
        <div className="bounce-backdrop">
          <section
            className="bounce-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="弹射暂停"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                void audioRef.current?.prepare()
                setPaused(false)
              }
              if (event.key === 'Tab') {
                if (event.shiftKey && document.activeElement === pauseResume.current) {
                  event.preventDefault()
                  pauseRestart.current?.focus()
                } else if (!event.shiftKey && document.activeElement === pauseRestart.current) {
                  event.preventDefault()
                  pauseResume.current?.focus()
                }
              }
            }}
          >
            <Mascot lane={1} happy />
            <h2>小兔休息一下 ♡</h2>
            <p>这一发还在，回来继续弹。</p>
            <button
              type="button"
              ref={pauseResume}
              className="bounce-primary"
              autoFocus
              onClick={() => {
                void audioRef.current?.prepare()
                setPaused(false)
              }}
            >
              继续这一发 ↗
            </button>
            <button
              ref={pauseRestart}
              type="button"
              className="bounce-text-button"
              onClick={restart}
            >
              重新开始三次弹射
            </button>
          </section>
        </div>
      )}
      {help && (
        <div
          className="bounce-backdrop"
          onClick={() => {
            setHelp(false)
            helpTrigger.current?.focus()
          }}
        >
          <section
            className="bounce-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="弹弹乐玩法说明"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Tab') {
                if (event.shiftKey && document.activeElement === closeHelp.current) {
                  event.preventDefault()
                  helpReplay.current?.focus()
                } else if (!event.shiftKey && document.activeElement === helpReplay.current) {
                  event.preventDefault()
                  closeHelp.current?.focus()
                }
              }
            }}
          >
            <button
              ref={closeHelp}
              type="button"
              className="bounce-close"
              aria-label="关闭弹弹乐玩法"
              onClick={() => {
                setHelp(false)
                helpTrigger.current?.focus()
              }}
            >
              ×
            </button>
            <Mascot lane={1} happy />
            <h2>拉一下，乐队就开唱！</h2>
            <p>
              拖住底部小兔，往下拉，松手弹出去。
              <br />
              也可以直接点小兔，或按空格发射。
            </p>
            <ul>
              <li>拉左边 → 弹右边，左右键也能瞄准。</li>
              <li>粉色炸花触发连锁，金色音符分更高。</li>
              <li>连击越高，加成越大；6、12、18 连击各送 400 分。</li>
              {mode === 'tour' && (
                <>
                  <li>每发可以换乐手：回声、鼓浪、穿透、三色和声。</li>
                  <li>副歌泡泡同色接力，尾奏月亮门带你穿越。</li>
                  <li>可以选本地歌曲试听，结束后把自己的伴奏分享给朋友。</li>
                </>
              )}
              <li>每发软垫自动反弹两次，一局三发。</li>
              <li>同一天同一花园，把最佳成绩送上今日榜。</li>
            </ul>
            <button
              ref={helpReplay}
              type="button"
              className="bounce-primary"
              onClick={() => {
                setHelp(false)
                helpTrigger.current?.focus()
              }}
            >
              知道啦，弹出去！ ↗
            </button>
          </section>
        </div>
      )}
    </main>
  )
}

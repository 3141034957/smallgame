import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  adjacent,
  CHARGE,
  createWave,
  DURATION,
  findMove,
  playWave,
  replayWave,
  SIZE,
  todayRoute,
  validDay,
} from '@/features/wave/rules.mjs'
import type { Tile, WaveAction, WaveNotes, WaveResult, WaveRound } from '@/features/wave/rules.mjs'
import { MelodyAudio } from '@/features/melody/audio'
import type { Lane } from '@/features/melody/engine'
import { Mascot } from '../MochiMelody/Mascot'
import { WaveBoard } from './WaveBoard'
import './index.less'

const NAMES = ['奶糖', '泡芙', '布丁', '啾啾']
const COLORS = ['#df968e', '#a394d5', '#ccab70', '#91bfa6']
function Face({ lane }: { lane: Lane }) {
  return (
    <svg viewBox="0 0 60 60" aria-hidden="true">
      {lane === 0 ? (
        <path
          d="M12 26 12 9 24 18M36 18 48 9 48 26"
          fill="#fff3dd"
          stroke="#927062"
          strokeWidth="1.5"
        />
      ) : lane === 1 ? (
        <g fill="#fffaf1" stroke="#9980a9" strokeWidth="1.5">
          <ellipse cx="22" cy="14" rx="5" ry="12" transform="rotate(-12 22 14)" />
          <ellipse cx="38" cy="14" rx="5" ry="12" transform="rotate(12 38 14)" />
        </g>
      ) : lane === 2 ? (
        <g fill="#d5b184" stroke="#9b7a50" strokeWidth="1.5">
          <circle cx="15" cy="18" r="7" />
          <circle cx="45" cy="18" r="7" />
        </g>
      ) : (
        <path
          d="m27 17-3-9q7-1 10 7l5-7q5 3-2 11"
          fill="#ffeaa0"
          stroke="#8b9575"
          strokeWidth="1.5"
        />
      )}
      <ellipse
        cx="30"
        cy="35"
        rx="22"
        ry="20"
        fill={['#fff3dd', '#fffaf1', '#d5b184', '#ffeaa0'][lane]}
        stroke={COLORS[lane]}
        strokeWidth="1.7"
      />
      <ellipse cx="16" cy="39" rx="5" ry="3" fill="#efa9ac" opacity=".65" />
      <ellipse cx="44" cy="39" rx="5" ry="3" fill="#efa9ac" opacity=".65" />
      <path
        d="M19 31q3-5 6 0m10 0q3-5 6 0"
        stroke="#766151"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {lane === 3 ? (
        <path d="m26 36 8 0-4 5z" fill="#cf956b" />
      ) : (
        <path
          d="M26 39q4 5 8 0"
          stroke="#8b6c5b"
          strokeWidth="1.7"
          strokeLinecap="round"
          fill="none"
        />
      )}
      {lane === 0 && <path d="m23 18 2 5m5-6v5m7-4-2 5" stroke="#e5b08c" strokeWidth="2" />}
    </svg>
  )
}
function storedBest(day: string) {
  try {
    return Math.max(
      0,
      Number(JSON.parse(localStorage.getItem('mochi-wave-best-v1') || '{}')[day]) || 0,
    )
  } catch {
    return 0
  }
}
export default function SoundWave() {
  const [params] = useSearchParams()
  const day = validDay(params.get('day')) ? params.get('day')! : todayRoute()
  const target = Math.max(0, Math.min(200000, Number(params.get('target')) || 0))
  const [run, setRun] = useState(() => createWave(day))
  const runRef = useRef(run)
  const [status, setStatus] = useState<'ready' | 'playing' | 'result'>('ready')
  const statusRef = useRef(status)
  const [elapsed, setElapsed] = useState(0)
  const timeRef = useRef(0)
  const [selection, setSelection] = useState<number[]>([])
  const selectionRef = useRef<number[]>([])
  const [flash, setFlash] = useState<WaveResult | null>(null)
  const [message, setMessage] = useState('连起 3 只同色小动物，松手让它们开唱！')
  const [paused, setPaused] = useState(false)
  const [help, setHelp] = useState(false)
  const [muted, setMuted] = useState(false)
  const [round, setRound] = useState<WaveRound | null>(null)
  const [best, setBest] = useState(() => storedBest(day))
  const [shareUrl, setShareUrl] = useState('')
  const [showBoard, setShowBoard] = useState(false)
  const [hint, setHint] = useState<number[]>([])
  const [storageError, setStorageError] = useState(false)
  const actionsRef = useRef<WaveAction[]>([])
  const notesRef = useRef<WaveNotes>([])
  const audioRef = useRef<MelodyAudio | null>(null)
  if (!audioRef.current) audioRef.current = new MelodyAudio()
  const dragging = useRef<number | null>(null)
  const busyUntil = useRef(0)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const musicBeat = useRef(-1)
  const generation = useRef(0)
  const helpClose = useRef<HTMLButtonElement>(null)
  const pauseClose = useRef<HTMLButtonElement>(null)
  const helpTrigger = useRef<HTMLButtonElement>(null)
  const resultHeading = useRef<HTMLHeadingElement>(null)
  const pageRef = useRef<HTMLElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const reduced = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const remaining = Math.max(0, Math.ceil((DURATION - elapsed) / 1000))
  const multiplier = Math.min(5, 1 + Math.floor((run.combo - 1) / 3))
  const comboActive = run.turn > 0 && elapsed - run.lastTime < 3000
  const pathLength = selection.length

  const select = useCallback((path: number[]) => {
    selectionRef.current = path
    setSelection(path)
  }, [])
  const prepare = () => {
    const token = generation.current
    void audioRef.current!.prepare().then((ready) => {
      if (!ready || token !== generation.current || document.hidden) return
      audioRef.current?.playLane(1, 72)
    })
  }
  const start = () => {
    if (statusRef.current === 'ready') {
      statusRef.current = 'playing'
      setStatus('playing')
      prepare()
    }
  }
  const finish = useCallback(() => {
    if (statusRef.current !== 'playing') return
    statusRef.current = 'result'
    setStatus('result')
    generation.current++
    audioRef.current?.stop()
    dragging.current = null
    select([])
    const result = replayWave(day, actionsRef.current) ?? {
      day,
      actions: [],
      score: 0,
      maxCombo: 0,
      clears: 0,
      bombs: 0,
      boosts: 0,
      stars: 0,
    }
    setRound(result)
    setBest((old) => Math.max(old, result.score))
    try {
      const stored = JSON.parse(localStorage.getItem('mochi-wave-best-v1') || '{}')
      stored[day] = Math.max(storedBest(day), result.score)
      localStorage.setItem(
        'mochi-wave-best-v1',
        JSON.stringify(
          Object.fromEntries(
            Object.entries(stored)
              .sort(([a], [b]) => b.localeCompare(a))
              .slice(0, 30),
          ),
        ),
      )
    } catch {
      setStorageError(true)
    }
  }, [day, select])
  const perform = (path: number[], boost = false) => {
    if (
      paused ||
      help ||
      showBoard ||
      statusRef.current === 'result' ||
      performance.now() < busyUntil.current
    ) {
      select([])
      return
    }
    const action: WaveAction = boost
      ? { t: Math.floor(timeRef.current), boost: true }
      : { t: Math.floor(timeRef.current), path }
    const result = playWave(runRef.current, action)
    select([])
    if (!result) {
      setMessage(
        path.length < 3
          ? '再多连一只！同色 3 只起唱，横竖斜着都能连。'
          : '只能连相邻的同色小动物，试试另一条音浪。',
      )
      return
    }
    start()
    runRef.current = result.state
    setRun(result.state)
    actionsRef.current.push(action)
    notesRef.current.push(...result.notes)
    busyUntil.current = performance.now() + 210
    setFlash(result)
    setHint([])
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 420)
    setMessage(
      result.boost
        ? '全场合奏！最多的那种音色一起爆发！'
        : result.triggered
          ? `唱片炸开！一口气带响 ${result.removed.length} 只！`
          : result.created === 'rainbow'
            ? '10 连！做出了同色全消唱片，点它引爆！'
            : result.created
              ? '6 连！留下了一张十字唱片，点它引爆！'
              : result.reshuffled
                ? '新音符补好啦，继续连！'
                : `${path.length} 只一起唱！3 秒内再连一组，保持连唱加成。`,
    )
    result.notes
      .slice(0, 16)
      .forEach((note, index) => audioRef.current?.playLane(note.lane, note.midi, index * 0.025))
    if (result.boost || result.triggered)
      [72, 76, 79, 84].forEach((midi, index) => audioRef.current?.playLane(1, midi, index * 0.08))
    if (!reduced.current) navigator.vibrate?.(result.triggered || result.boost ? [20, 30, 20] : 10)
  }
  const extend = (index: number) => {
    const path = selectionRef.current
    if (!path.length) {
      select([index])
      setHint([])
      audioRef.current?.playLane(runRef.current.board[index].lane, 60)
      return
    }
    if (index === path.at(-2)) {
      select(path.slice(0, -1))
      return
    }
    if (
      path.includes(index) ||
      runRef.current.board[index].lane !== runRef.current.board[path[0]].lane ||
      !adjacent(path.at(-1)!, index)
    )
      return
    select([...path, index])
    audioRef.current?.playLane(
      runRef.current.board[index].lane,
      [60, 64, 67, 69, 72][path.length % 5],
    )
  }
  const pointIndex = (event: PointerEvent) => {
    const element = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-note]')
    if (!element || !gridRef.current?.contains(element)) return -1
    return Number(element.dataset.note)
  }
  const restart = () => {
    generation.current++
    audioRef.current?.stop()
    if (flashTimer.current) clearTimeout(flashTimer.current)
    const next = createWave(day)
    runRef.current = next
    setRun(next)
    statusRef.current = 'ready'
    setStatus('ready')
    timeRef.current = 0
    setElapsed(0)
    musicBeat.current = -1
    actionsRef.current = []
    notesRef.current = []
    dragging.current = null
    busyUntil.current = 0
    select([])
    setFlash(null)
    setRound(null)
    setPaused(false)
    setShowBoard(false)
    setHint([])
    setShareUrl('')
    setMessage('底排泡芙排好队啦，先连 3 只试试！')
  }
  useEffect(
    () => () => {
      generation.current++
      audioRef.current?.dispose()
      if (flashTimer.current) clearTimeout(flashTimer.current)
    },
    [],
  )
  useEffect(() => {
    if (status !== 'playing' || paused || help || showBoard) return
    let frame = 0,
      last = 0,
      rendered = timeRef.current
    const tick = (now: number) => {
      if (document.hidden) {
        last = 0
        frame = requestAnimationFrame(tick)
        return
      }
      if (last) timeRef.current = Math.min(DURATION, timeRef.current + now - last)
      last = now
      if (timeRef.current - rendered >= 80 || timeRef.current >= DURATION) {
        rendered = timeRef.current
        setElapsed(rendered)
      }
      const beat = Math.floor(timeRef.current / (60000 / 112))
      if (beat !== musicBeat.current) {
        musicBeat.current = beat
        audioRef.current?.accompany(beat, 0, 0)
        if (beat % 2 === 0)
          audioRef.current?.playLane(2, [36, 33, 29, 31][Math.floor(beat / 4) % 4])
      }
      if (timeRef.current >= DURATION) {
        finish()
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [status, paused, help, showBoard, day, finish])
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        if (statusRef.current === 'playing') setPaused(true)
        generation.current++
        audioRef.current?.stop()
        dragging.current = null
        select([])
      }
    }
    document.addEventListener('visibilitychange', hide)
    return () => document.removeEventListener('visibilitychange', hide)
  }, [select])
  useEffect(() => {
    if (help || paused || showBoard) {
      generation.current++
      audioRef.current?.stop()
      dragging.current = null
      select([])
    }
  }, [help, paused, showBoard, select])
  useEffect(() => {
    if (help) helpClose.current?.focus()
    else if (paused) pauseClose.current?.focus()
    else if (status === 'result') {
      pageRef.current?.scrollTo({ top: 0 })
      resultHeading.current?.focus({ preventScroll: true })
    }
  }, [help, paused, status])
  const share = async () => {
    if (!round) return
    const url = new URL(window.location.href)
    url.hash = `/wave?${new URLSearchParams({ day, target: String(round.score) })}`
    setShareUrl(url.toString())
    try {
      await navigator.clipboard.writeText(
        `音浪连连，我在 45 秒里唱出 ${round.score} 分、${round.maxCombo} 连唱！同一片音符池，你来接力？ ${url}`,
      )
      setMessage('挑战链接已复制 ♡')
    } catch {
      setMessage('复制下方链接，邀请朋友挑战。')
    }
  }
  return (
    <main ref={pageRef} className={`sound-wave${flash?.boost ? ' is-exploding' : ''}`}>
      <div className="wave-shell" inert={help || (paused && !showBoard)}>
        <header className="wave-header">
          <a href="#/wave" className="wave-logo">
            ♫
            <span>
              软糖音乐派对<small>MAKE SOME HAPPY NOISE</small>
            </span>
          </a>
          <div>
            <button type="button" onClick={() => setShowBoard(true)} aria-label="查看音浪排行榜">
              🏆
            </button>
            <button
              type="button"
              aria-label={muted ? '开启音浪声音' : '静音音浪'}
              aria-pressed={muted}
              onClick={() => {
                setMuted(!muted)
                audioRef.current?.setMuted(!muted)
              }}
            >
              {muted ? '♩' : '♫'}
            </button>
            <button
              type="button"
              ref={helpTrigger}
              aria-label="音浪玩法说明"
              onClick={() => setHelp(true)}
            >
              ?
            </button>
          </div>
        </header>
        {status !== 'result' && !showBoard && (
          <>
            <section className="wave-title">
              <span>QQ 音乐互动玩法 · 核心试玩</span>
              <h1>
                音浪<span>连连</span>
                <i>♪</i>
              </h1>
              <p>连起同色小动物，松手一起开唱！</p>
              {target > 0 && (
                <div className="wave-invite">
                  ✉ 朋友唱到了 {target.toLocaleString()} 分，你来接力！
                </div>
              )}
            </section>
            <div className="wave-layout">
              <section className="wave-game">
                <div className="wave-live-stage">
                  <div className="wave-track">
                    <span>♫</span>
                    <div>
                      <small>原创伴奏 · 112 BPM</small>
                      <strong>软糖开场曲</strong>
                    </div>
                    <div
                      className={`wave-equalizer${status === 'playing' && !paused ? ' is-playing' : ''}`}
                    >
                      {[0, 1, 2, 3, 4].map((i) => (
                        <i key={i} />
                      ))}
                    </div>
                  </div>
                  <div className="wave-band">
                    {[0, 1, 2, 3].map((lane) => (
                      <div key={lane} className={flash?.lead === lane ? 'is-singing' : ''}>
                        <Mascot lane={lane as Lane} happy />
                        <span>{['鼓点', '旋律', '低音', '和声'][lane]}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="wave-hud">
                  <div>
                    <small>演奏分</small>
                    <strong key={run.score}>{run.score.toLocaleString()}</strong>
                  </div>
                  <div className={`wave-chain${comboActive ? ' is-active' : ''}`}>
                    <strong>
                      {comboActive ? run.combo : '—'}
                      <small>连唱</small>
                    </strong>
                    <span>{comboActive ? `×${multiplier} 加成` : '连着消，分更高'}</span>
                    <i
                      style={
                        {
                          '--remaining': `${comboActive ? Math.max(0, 1 - (elapsed - run.lastTime) / 3000) * 100 : 0}%`,
                        } as CSSProperties
                      }
                    />
                  </div>
                  <div className={`wave-time${remaining <= 10 ? ' is-urgent' : ''}`}>
                    <small>剩余</small>
                    <strong>
                      {remaining}
                      <span>s</span>
                    </strong>
                  </div>
                </div>
                <div className="wave-pool-wrap">
                  <div
                    className="wave-pool"
                    ref={gridRef}
                    role="group"
                    aria-label="六乘六音符池，连起三个相邻的同色小动物"
                    onPointerDown={(event) => {
                      if (
                        paused ||
                        help ||
                        statusRef.current === 'result' ||
                        performance.now() < busyUntil.current ||
                        event.button !== 0
                      )
                        return
                      const index = pointIndex(event)
                      if (index < 0) return
                      event.preventDefault()
                      event.currentTarget.setPointerCapture(event.pointerId)
                      dragging.current = event.pointerId
                      select([])
                      start()
                      extend(index)
                    }}
                    onPointerMove={(event) => {
                      if (dragging.current !== event.pointerId) return
                      const index = pointIndex(event)
                      if (index >= 0) extend(index)
                    }}
                    onPointerUp={(event) => {
                      if (dragging.current !== event.pointerId) return
                      dragging.current = null
                      perform(selectionRef.current)
                      if (event.currentTarget.hasPointerCapture(event.pointerId))
                        event.currentTarget.releasePointerCapture(event.pointerId)
                    }}
                    onPointerCancel={() => {
                      dragging.current = null
                      select([])
                    }}
                    onLostPointerCapture={() => {
                      dragging.current = null
                      select([])
                    }}
                  >
                    {run.board.map((tile: Tile, index) => (
                      <button
                        key={tile.id}
                        type="button"
                        data-note={index}
                        className={`wave-tile color-${tile.lane}${selection.includes(index) ? ' is-selected' : ''}${hint.includes(index) || (status === 'ready' && index >= 30 && index < 33) ? ' is-hint' : ''}${tile.kind !== 'note' ? ' is-record' : ''}`}
                        aria-label={`${Math.floor(index / SIZE) + 1}行${(index % SIZE) + 1}列，${NAMES[tile.lane]}${tile.kind === 'bomb' ? '，十字唱片，点击引爆' : tile.kind === 'rainbow' ? '，同色唱片，点击引爆' : ''}`}
                        aria-pressed={selection.includes(index)}
                        onClick={(event) => {
                          if (
                            event.detail !== 0 ||
                            paused ||
                            help ||
                            performance.now() < busyUntil.current
                          )
                            return
                          start()
                          prepare()
                          if (tile.kind !== 'note' && !selectionRef.current.length) perform([index])
                          else if (
                            selectionRef.current.at(-1) === index &&
                            selectionRef.current.length >= 3
                          )
                            perform(selectionRef.current)
                          else extend(index)
                        }}
                        onKeyDown={(event) => {
                          const directions: Record<string, number> = {
                            ArrowLeft: -1,
                            ArrowRight: 1,
                            ArrowUp: -SIZE,
                            ArrowDown: SIZE,
                          }
                          if (event.key in directions) {
                            event.preventDefault()
                            const next = index + directions[event.key]
                            if (
                              next >= 0 &&
                              next < SIZE * SIZE &&
                              (Math.abs(directions[event.key]) !== 1 ||
                                Math.floor(next / SIZE) === Math.floor(index / SIZE))
                            )
                              gridRef.current
                                ?.querySelector<HTMLButtonElement>(`[data-note="${next}"]`)
                                ?.focus()
                          }
                          if (event.key === 'Escape') select([])
                        }}
                      >
                        <Face lane={tile.lane} />
                        {tile.kind !== 'note' && (
                          <span className="wave-record">{tile.kind === 'rainbow' ? '★' : '✦'}</span>
                        )}
                        {selection.includes(index) && <em>{selection.indexOf(index) + 1}</em>}
                      </button>
                    ))}
                    <svg className="wave-thread" viewBox="0 0 600 600" aria-hidden="true">
                      <polyline
                        points={selection
                          .map(
                            (index) =>
                              `${(index % SIZE) * 100 + 50},${Math.floor(index / SIZE) * 100 + 50}`,
                          )
                          .join(' ')}
                        fill="none"
                        stroke={COLORS[run.board[selection[0]]?.lane ?? 1]}
                        strokeWidth="13"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {flash && (
                      <div className="wave-sparkles" aria-hidden="true">
                        {flash.removed.map((index) => (
                          <span
                            key={index}
                            style={{
                              left: `${(((index % SIZE) + 0.5) / SIZE) * 100}%`,
                              top: `${((Math.floor(index / SIZE) + 0.5) / SIZE) * 100}%`,
                            }}
                          >
                            ✦
                          </span>
                        ))}
                        <strong>
                          +{flash.earned.toLocaleString()}
                          {flash.boost && <small>全场合奏！</small>}
                        </strong>
                      </div>
                    )}
                  </div>
                  <div
                    className={`wave-selection${pathLength >= 6 ? ' is-long' : ''}`}
                    role="status"
                  >
                    {pathLength ? (
                      <>
                        <b>{pathLength} 连</b>
                        <span>
                          {pathLength >= 10
                            ? '松手，生成同色全消唱片！'
                            : pathLength >= 6
                              ? '松手，生成十字唱片！'
                              : pathLength >= 3
                                ? '松手开唱，还能继续连！'
                                : '再连同色的小伙伴 →'}
                        </span>
                        <button
                          type="button"
                          disabled={
                            pathLength < 3 && !selection.some((i) => run.board[i].kind !== 'note')
                          }
                          onClick={() => perform(selectionRef.current)}
                        >
                          开唱 ↗
                        </button>
                      </>
                    ) : (
                      <span>
                        {status === 'ready'
                          ? '底排泡芙等你连，第一下就开唱 ♡'
                          : '横着、竖着、斜着连都可以'}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className={`wave-boost${run.charge >= CHARGE ? ' is-ready' : ''}`}
                  disabled={run.charge < CHARGE || paused || help}
                  onClick={() => perform([], true)}
                >
                  <span>✦</span>
                  <div>
                    <strong>
                      {run.charge >= CHARGE ? '合奏满啦！点我一键炸场' : '再连一点，全场一起唱'}
                    </strong>
                    <small>
                      {run.charge >= CHARGE
                        ? '清掉最多的那种音色 · 额外加分'
                        : `${run.charge} / ${CHARGE} 个音符`}
                    </small>
                    <i style={{ width: `${(run.charge / CHARGE) * 100}%` }} />
                  </div>
                  <b>{run.charge >= CHARGE ? 'BOOM!' : '♫'}</b>
                </button>
                <p className="wave-message" role="status">
                  {message}
                </p>
                <div className="wave-game-foot">
                  <span>
                    今日最佳 <b>{best.toLocaleString()}</b>
                  </span>
                  <button
                    type="button"
                    disabled={status !== 'playing'}
                    onClick={() => setPaused(true)}
                  >
                    Ⅱ 暂停
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHint(findMove(run.board) || [])
                      setMessage('亮起来的小伙伴可以连。先试这一组！')
                    }}
                  >
                    给个提示 ♡
                  </button>
                </div>
              </section>
              <aside className="wave-aside">
                <section className="wave-tip">
                  <span>奶糖的演出秘籍</span>
                  <h2>
                    手指不停，
                    <br />
                    整支乐队都听你的。
                  </h2>
                  <p>
                    <b>3 连</b> 松手开唱，立刻补上新音符
                    <br />
                    <b>6 连</b> 做出十字唱片，留着炸下一波
                    <br />
                    <b>10 连</b> 做出同色全消唱片
                    <br />
                    <b>24 音符</b> 点亮合奏，自己决定何时引爆
                  </p>
                  <small>
                    连得长，还是连得快？
                    <br />3 秒内接上下一组，连唱加成能涨到 ×5。
                  </small>
                </section>
                <WaveBoard day={day} />
              </aside>
            </div>
            <footer className="wave-footer">
              <a href="#/bounce">弹射旧版</a>
              <span>一首小曲，一场由你指挥的派对 ♡</span>
            </footer>
          </>
        )}
        {status === 'result' && round && !showBoard && (
          <section className="wave-result">
            <span className="wave-eyebrow">THAT WAS YOUR MUSIC MOMENT</span>
            <h1 ref={resultHeading} tabIndex={-1}>
              {round.score >= best && round.score > 0
                ? '这场演出，值得再来一次！'
                : '45 秒，你把乐队点燃了！'}
            </h1>
            <div className="wave-result-band">
              {[0, 1, 2, 3].map((lane) => (
                <Mascot key={lane} lane={lane as Lane} happy />
              ))}
            </div>
            <div className="wave-score-card">
              <span>
                {'★'.repeat(round.stars)}
                {'☆'.repeat(3 - round.stars)}
              </span>
              <strong>{round.score.toLocaleString()}</strong>
              <p>你的音浪演奏分</p>
              <div>
                <span>
                  <b>{round.maxCombo}</b>最高连唱
                </span>
                <span>
                  <b>{round.bombs}</b>唱片爆炸
                </span>
                <span>
                  <b>{round.boosts}</b>全场合奏
                </span>
              </div>
              {target > 0 && (
                <p>
                  {round.score > target
                    ? `超过朋友 ${round.score - target} 分！`
                    : `再多 ${target - round.score + 1} 分就能超过朋友！`}
                </p>
              )}
            </div>
            <div className="wave-result-actions">
              <button type="button" className="wave-primary" onClick={restart}>
                再来 45 秒 ↗
              </button>
              <button type="button" onClick={() => void share()}>
                邀朋友接力 ✉
              </button>
            </div>
            <button
              className="wave-listen"
              type="button"
              onClick={() => {
                const token = generation.current
                void audioRef.current!.prepare().then((ready) => {
                  if (!ready || token !== generation.current) return
                  audioRef.current?.stop()
                  notesRef.current
                    .slice(-48)
                    .forEach((note, index) =>
                      audioRef.current?.playLane(note.lane, note.midi, index * 0.09),
                    )
                  setMessage('正在回听最后一段音浪 ♫')
                })
              }}
            >
              ♫ 回听我连出来的小曲
            </button>
            <WaveBoard key="result-board" day={day} round={round} />
            <p className="wave-message" role="status">
              {message}
            </p>
            {shareUrl && (
              <label className="wave-share">
                复制挑战链接
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
            )}
            {storageError && <p role="status">本机纪录暂时无法保存，仍可提交排行榜。</p>}
          </section>
        )}
        {showBoard && (
          <section className="wave-full-board">
            <h1>谁把音浪连得最热闹？</h1>
            <WaveBoard day={day} />
            <button
              type="button"
              className="wave-primary"
              onClick={() => {
                setShowBoard(false)
                if (status === 'playing') setPaused(true)
              }}
            >
              回到我的演出 ↗
            </button>
          </section>
        )}
      </div>
      {(help || (paused && !showBoard)) && (
        <div className="wave-backdrop">
          <section
            className="wave-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={help ? '音浪玩法说明' : '演出暂停'}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                if (help) {
                  setHelp(false)
                  if (!paused) prepare()
                } else {
                  setPaused(false)
                  prepare()
                }
                helpTrigger.current?.focus()
              }
              if (event.key === 'Tab') {
                const elements = Array.from(
                  event.currentTarget.querySelectorAll<HTMLButtonElement>('button'),
                )
                if (event.shiftKey && document.activeElement === elements[0]) {
                  event.preventDefault()
                  elements.at(-1)?.focus()
                } else if (!event.shiftKey && document.activeElement === elements.at(-1)) {
                  event.preventDefault()
                  elements[0]?.focus()
                }
              }
            }}
          >
            <Mascot lane={1} happy />
            <h2>{help ? '连起来，就会唱！' : '乐队等你回来 ♡'}</h2>
            {help ? (
              <>
                <p>
                  手指按住一只小动物，滑过相邻的同色伙伴，连够 3
                  只后松手。横竖斜着都可以，往回滑能撤回一格。
                </p>
                <p>
                  6 连造十字唱片，10 连造同色唱片。唱片可以直接点爆！消够 24
                  个音符，点底部合奏按钮炸场。
                </p>
                <p>第一下触碰开始 45 秒。3 秒内连续消除会增加连唱倍率；不需要踩准节拍。</p>
                <p>键盘：方向键移动，空格或回车选取，再按已选终点或「开唱」确认；Esc 清空选择。</p>
                <button
                  ref={helpClose}
                  className="wave-primary"
                  type="button"
                  onClick={() => {
                    setHelp(false)
                    if (!paused) prepare()
                    helpTrigger.current?.focus()
                  }}
                >
                  懂啦，连起来！ ↗
                </button>
              </>
            ) : (
              <>
                <p>倒计时已经停住，这局还在。</p>
                <button
                  ref={pauseClose}
                  type="button"
                  className="wave-primary"
                  onClick={() => {
                    setPaused(false)
                    prepare()
                  }}
                >
                  继续演出 ↗
                </button>
                <button type="button" className="wave-dialog-restart" onClick={restart}>
                  重开这一局
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  )
}

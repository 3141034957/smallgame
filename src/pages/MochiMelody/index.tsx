import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  BAND, DIFFICULTIES, SONGS, NOTE_TRAVEL_SECONDS, advanceRun, blankPattern, decodePattern,
  emptyRun, hitNote, makeChart, parseProgress, PRESETS, PROGRESS_KEY, presetPattern,
  encodePattern, runAccuracy, runStars, saveRun, totalStars,
} from '@/features/melody/engine'
import type { Difficulty, Lane, MelodyNote, Pattern, PerformanceHit, RunState } from '@/features/melody/engine'
import { MelodyAudio } from '@/features/melody/audio'
import { Mascot } from './Mascot'
import { Leaderboard, SubmitScore } from './Leaderboard'
import { loadPlayer } from '@/features/melody/leaderboard'
import type { Tap } from '@/features/melody/leaderboard'
import './index.less'

type Scene = 'home' | 'playing' | 'paused' | 'result' | 'studio' | 'leaderboard'
type LiveRun = {
  songIndex: number; difficulty: Difficulty; notes: MelodyNote[]; run: RunState; hits: PerformanceHit[]; taps: Tap[]; offset: number;
  origin: number; baseElapsed: number; elapsed: number; nextBeat: number; practice: boolean; duration: number; audioReady: boolean;
}
const clock = () => performance.now() / 1000
const starText = (count: number) => '★'.repeat(count) + '☆'.repeat(3 - count)
const loadProgress = () => {
  try { return parseProgress(localStorage.getItem(PROGRESS_KEY)) } catch { return parseProgress(null) }
}

export default function MochiMelody() {
  const [params, setParams] = useSearchParams()
  const [player, setPlayer] = useState(loadPlayer)
  const [progress, setProgress] = useState(loadProgress)
  const progressRef = useRef(progress)
  progressRef.current = progress
  const [scene, setScene] = useState<Scene>(() => decodePattern(params.get('mix')) ? 'studio' : 'home')
  const [songIndex, setSongIndex] = useState(() => Math.max(0, SONGS.findIndex((song) => song.id === params.get('song'))))
  const [difficulty, setDifficulty] = useState<Difficulty>(() => DIFFICULTIES.find((item) => item.id === params.get('difficulty'))?.id ?? 'cozy')
  const [frame, setFrame] = useState({ elapsed: 0, run: emptyRun(), countdown: 0 })
  const [feedback, setFeedback] = useState({ text: '', kind: '', until: 0 })
  const [pulse, setPulse] = useState<number[]>([0, 0, 0, 0])
  const [muted, setMuted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [shareFallback, setShareFallback] = useState('')
  const [audioUnavailable, setAudioUnavailable] = useState(false)
  const [storageUnavailable, setStorageUnavailable] = useState(false)
  const [pattern, setPattern] = useState<Pattern>(() => decodePattern(params.get('mix')) ?? decodePattern(progress.lastMix) ?? presetPattern(0))
  const patternRef = useRef(pattern)
  patternRef.current = pattern
  const [bpm, setBpm] = useState(() => {
    const value = Number(params.get('bpm'))
    return Number.isInteger(value) && value >= 80 && value <= 140 ? value : 108
  })
  const [studioPlaying, setStudioPlaying] = useState(false)
  const [studioStep, setStudioStep] = useState(-1)
  const [studioPage, setStudioPage] = useState(0)
  const [replaying, setReplaying] = useState(false)
  const [newBest, setNewBest] = useState(false)
  const audioRef = useRef<MelodyAudio | null>(null)
  if (!audioRef.current) audioRef.current = new MelodyAudio()
  const gameRef = useRef<LiveRun | null>(null)
  const animationRef = useRef(0)
  const asyncSerialRef = useRef(0)
  const busyRef = useRef(false)
  const pageRef = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const helpTriggerRef = useRef<HTMLButtonElement>(null)
  const helpCloseRef = useRef<HTMLButtonElement>(null)
  const helpLastRef = useRef<HTMLButtonElement>(null)
  const pauseResumeRef = useRef<HTMLButtonElement>(null)
  const pauseHomeRef = useRef<HTMLButtonElement>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hitRef = useRef<(lane: Lane) => void>(() => {})
  const pauseRef = useRef<() => void>(() => {})
  const song = SONGS[songIndex]
  const stars = totalStars(progress)
  const best = progress.records[`${song.id}:${difficulty}`]
  const live = gameRef.current
  const currentNotes = live?.notes ?? []
  const currentSong = live ? SONGS[live.songIndex] : song
  const resultStars = live ? runStars(live.run, live.notes.length) : 0

  const notify = (message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(message)
    toastTimerRef.current = setTimeout(() => setToast(''), 4200)
  }

  const persist = (next: typeof progress) => {
    progressRef.current = next
    setProgress(next)
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(next)) }
    catch { setStorageUnavailable(true) }
  }

  const stop = () => {
    asyncSerialRef.current++
    cancelAnimationFrame(animationRef.current)
    animationRef.current = 0
    audioRef.current?.stop()
    setStudioPlaying(false)
    setReplaying(false)
    setStudioStep(-1)
    setPulse([0, 0, 0, 0])
  }

  useEffect(() => () => {
    asyncSerialRef.current++
    cancelAnimationFrame(animationRef.current)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    audioRef.current?.dispose()
  }, [])

  useEffect(() => {
    if (scene !== 'paused' && pageRef.current) pageRef.current.scrollTop = 0
    if (scene === 'paused') pauseResumeRef.current?.focus({ preventScroll: true })
    else headingRef.current?.focus({ preventScroll: true })
  }, [scene])

  useEffect(() => {
    if (!helpOpen) return
    helpCloseRef.current?.focus()
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setHelpOpen(false); helpTriggerRef.current?.focus() } }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [helpOpen])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLInputElement || helpOpen) return
      const lane = ['d', 'f', 'j', 'k'].indexOf(event.key.toLowerCase())
      if (scene === 'playing' && lane >= 0) { event.preventDefault(); hitRef.current(lane as Lane) }
      if (scene === 'playing' && event.key === 'Escape') { event.preventDefault(); pauseRef.current() }
    }
    const onVisibility = () => {
      if (!document.hidden) return
      if (scene === 'playing') pauseRef.current()
      else if (scene === 'studio' || scene === 'result') stop()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVisibility)
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVisibility) }
  }, [scene, helpOpen])

  const bump = (lane: Lane) => setPulse((current) => current.map((value, index) => index === lane ? clock() + 0.18 : value))

  const finishRun = (run: LiveRun) => {
    run.run = advanceRun(run.run, run.notes, run.duration + 1)
    audioRef.current?.stop()
    setFrame({ elapsed: run.duration, run: run.run, countdown: 0 })
    setPulse([0, 0, 0, 0])
    if (!run.practice) {
      const previous = progressRef.current.records[`${SONGS[run.songIndex].id}:${run.difficulty}`]
      setNewBest(run.run.score > (previous?.score ?? 0))
      persist(saveRun(progressRef.current, SONGS[run.songIndex], run.difficulty, run.run, run.notes.length))
    } else setNewBest(false)
    setScene('result')
  }

  const tickGame = () => {
    const run = gameRef.current
    if (!run) return
    const now = clock()
    const countdown = Math.max(0, run.origin - now)
    const elapsed = run.baseElapsed + Math.max(0, now - run.origin)
    run.elapsed = elapsed
    if (!countdown) {
      if (audioRef.current?.context?.state === 'suspended' && run.audioReady) { pauseRef.current(); return }
      const beatSeconds = 60 / SONGS[run.songIndex].bpm
      while (run.nextBeat * beatSeconds <= elapsed + 0.12 && run.nextBeat < (run.practice ? 20 : SONGS[run.songIndex].beats)) {
        audioRef.current?.accompany(run.nextBeat, run.nextBeat * beatSeconds - elapsed, run.songIndex)
        run.nextBeat++
      }
      run.run = advanceRun(run.run, run.notes, elapsed - run.offset / 1000)
    }
    setFrame({ elapsed, run: run.run, countdown })
    if (elapsed >= run.duration) { animationRef.current = 0; finishRun(run); return }
    animationRef.current = requestAnimationFrame(tickGame)
  }

  const startRun = async (practice = false) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    stop()
    const serial = asyncSerialRef.current
    const ready = await audioRef.current!.prepare()
    busyRef.current = false
    setBusy(false)
    if (serial !== asyncSerialRef.current) return
    setAudioUnavailable(!ready)
    if (!ready) notify('设备未能开启声音，当前可静音游玩。')
    const run: LiveRun = {
      songIndex, difficulty: practice ? 'cozy' : difficulty, notes: makeChart(song, practice ? 'cozy' : difficulty, practice), run: emptyRun(), hits: [], taps: [], offset: progressRef.current.offset,
      origin: clock(), baseElapsed: 0, elapsed: 0, nextBeat: 0, practice, duration: (practice ? 20 : song.beats) * 60 / song.bpm, audioReady: ready,
    }
    gameRef.current = run
    setNewBest(false)
    setFeedback({ text: '', kind: '', until: 0 })
    setFrame({ elapsed: 0, run: run.run, countdown: 0 })
    setScene('playing')
    animationRef.current = requestAnimationFrame(tickGame)
  }

  const pressLane = (lane: Lane) => {
    const run = gameRef.current
    if (scene !== 'playing' || !run || clock() < run.origin) return
    const elapsed = run.baseElapsed + Math.max(0, clock() - run.origin)
    if (elapsed >= run.duration) return
    // During the four-beat count-in, pad taps are a friendly sound check.
    if (elapsed < run.notes[0].time - 0.22) { audioRef.current?.playLane(lane); bump(lane); return }
    const judgedTime = elapsed - run.offset / 1000
    run.taps.push({ lane, time: judgedTime })
    const result = hitNote(run.run, run.notes, lane, judgedTime)
    run.run = result.run
    if (result.note) {
      audioRef.current?.playLane(lane, result.note.midi)
      run.hits.push({ lane, time: elapsed, midi: result.note.midi })
      setFeedback({ text: result.grade === 'perfect' ? run.run.combo >= 10 ? '甜蜜连击！' : '刚刚好！' : '接住啦！', kind: result.grade!, until: clock() + 0.7 })
    } else setFeedback({ text: '跟着音符，再轻轻拍', kind: 'early', until: clock() + 0.7 })
    bump(lane)
    setFrame({ elapsed, run: run.run, countdown: 0 })
  }
  hitRef.current = pressLane

  const pauseGame = () => {
    const run = gameRef.current
    if (!run) return
    run.elapsed = run.baseElapsed + Math.max(0, clock() - run.origin)
    stop()
    setScene('paused')
  }
  pauseRef.current = pauseGame

  const resumeRun = async () => {
    if (busyRef.current) return
    const run = gameRef.current
    if (!run) return
    busyRef.current = true
    setBusy(true)
    const serial = asyncSerialRef.current
    const ready = await audioRef.current!.prepare()
    busyRef.current = false
    setBusy(false)
    if (serial !== asyncSerialRef.current) return
    setAudioUnavailable(!ready)
    run.baseElapsed = run.elapsed
    run.audioReady = ready
    run.origin = clock() + 2
    run.nextBeat = Math.ceil(run.elapsed / (60 / SONGS[run.songIndex].bpm))
    setScene('playing')
    animationRef.current = requestAnimationFrame(tickGame)
  }

  const goHome = () => { stop(); setScene('home'); setShareFallback(''); setParams({}, { replace: true }) }
  const openLeaderboard = () => { stop(); setScene('leaderboard'); setShareFallback('') }
  const openStudio = () => { stop(); setScene('studio'); setShareFallback('') }

  const previewLane = async (lane: Lane) => {
    if (await audioRef.current!.prepare()) { audioRef.current?.playLane(lane); bump(lane) }
    else notify('设备暂时无法播放声音。')
  }

  const toggleCell = (lane: Lane, step: number) => {
    const next = patternRef.current.map((row, index) => index === lane ? row.map((value, column) => column === step ? !value : value) : [...row])
    patternRef.current = next
    setPattern(next)
    persist({ ...progressRef.current, lastMix: encodePattern(next) })
    setShareFallback('')
    if (next[lane][step] && !studioPlaying) void previewLane(lane)
  }

  const playStudio = async () => {
    if (studioPlaying) { stop(); return }
    if (busyRef.current) return
    stop()
    const serial = asyncSerialRef.current
    busyRef.current = true
    setBusy(true)
    const ready = await audioRef.current!.prepare()
    busyRef.current = false
    setBusy(false)
    if (serial !== asyncSerialRef.current) return
    setAudioUnavailable(!ready)
    if (!ready) notify('设备未能开启声音，仍可以编辑乐谱。')
    const start = clock() + 0.08
    const stepSeconds = 60 / bpm / 2
    let nextStep = 0
    setStudioPlaying(true)
    const animate = () => {
      const elapsed = clock() - start
      while (nextStep * stepSeconds <= elapsed + 0.12) {
        const step = nextStep % 16
        patternRef.current.forEach((row, lane) => {
          if (row[step]) audioRef.current?.playLane(lane as Lane, lane === 2 ? [36, 33, 41, 43][Math.floor(step / 4)] : [72, 76, 79, 81, 79, 76, 74, 72][Math.floor(step / 2)] + (lane === 3 ? 12 : 0), nextStep * stepSeconds - elapsed)
        })
        nextStep++
      }
      const currentStep = elapsed < 0 ? -1 : Math.floor(elapsed / stepSeconds) % 16
      setStudioStep(currentStep)
      if (currentStep >= 0) setPulse(patternRef.current.map((row) => row[currentStep] ? clock() + 0.02 : 0))
      animationRef.current = requestAnimationFrame(animate)
    }
    animationRef.current = requestAnimationFrame(animate)
  }

  const replayRun = async () => {
    if (replaying) { stop(); return }
    const run = gameRef.current
    if (!run || !run.hits.length || busyRef.current) return
    stop()
    const serial = asyncSerialRef.current
    busyRef.current = true
    setBusy(true)
    const ready = await audioRef.current!.prepare()
    busyRef.current = false
    setBusy(false)
    if (serial !== asyncSerialRef.current) return
    if (!ready) { notify('设备暂时无法播放演出。'); return }
    const start = clock() + 0.05
    let nextHit = 0
    let nextBeat = 0
    const beatSeconds = 60 / SONGS[run.songIndex].bpm
    setReplaying(true)
    const animate = () => {
      const elapsed = clock() - start
      while (nextBeat * beatSeconds <= elapsed + 0.12 && nextBeat * beatSeconds < run.duration) {
        audioRef.current?.accompany(nextBeat, nextBeat * beatSeconds - elapsed, run.songIndex)
        nextBeat++
      }
      while (nextHit < run.hits.length && run.hits[nextHit].time <= elapsed + 0.12) {
        const hit = run.hits[nextHit++]
        audioRef.current?.playLane(hit.lane, hit.midi, hit.time - elapsed)
        bump(hit.lane)
      }
      setStudioStep(Math.floor(Math.max(0, elapsed) / beatSeconds))
      if (elapsed >= run.duration + 0.5) { stop(); return }
      animationRef.current = requestAnimationFrame(animate)
    }
    animationRef.current = requestAnimationFrame(animate)
  }

  const share = async (studio: boolean) => {
    const url = new URL(window.location.href)
    const query = studio ? new URLSearchParams({ mix: encodePattern(pattern), bpm: String(bpm) }) : new URLSearchParams({ song: currentSong.id, difficulty: live?.difficulty ?? difficulty })
    url.hash = `#/rhythm?${query}`
    const message = studio ? `我和软糖乐队一起编了一首小曲。点开就能听，也可以接着改：${url}` : `来软糖乐队一起演奏《${currentSong.name}》！看看你能接住多少音符：${url}`
    try { await navigator.clipboard.writeText(message); setShareFallback(''); notify(studio ? '小曲链接已复制，发给朋友就能一起改谱 ♡' : '演出邀请已复制，叫上朋友来挑战 ♡') }
    catch { setShareFallback(url.toString()); notify('长按或选中下方链接，复制给朋友吧。') }
  }

  const chooseSong = (index: number) => {
    if (stars < SONGS[index].unlock) { notify(`再收集 ${SONGS[index].unlock - stars} 颗星，就能解锁这首小曲 ♡`); return }
    setSongIndex(index)
  }

  return <main ref={pageRef} className={`mochi-page scene-${scene}`}>
    <div className="mochi-app">
      <header className="mochi-header">
        <button type="button" className="mochi-logo" onClick={goHome} aria-label="软糖乐队，返回节奏舞台"><span className="mochi-logo-mark">♫<i>✦</i></span><span>软糖乐队<small>MOCHI MELODY</small></span></button>
        <nav className="mochi-nav" aria-label="游戏导航"><button type="button" className={['home', 'playing', 'paused', 'result'].includes(scene) ? 'is-active' : ''} onClick={goHome}>节拍舞台</button><button type="button" className={scene === 'studio' ? 'is-active' : ''} onClick={openStudio}>自由排练</button><button type="button" className={scene === 'leaderboard' ? 'is-active' : ''} onClick={openLeaderboard}>甜蜜榜单</button><a href="#/" className="mochi-text-button">声音探险 ↗</a></nav>
        <div className="mochi-header-actions"><span className="mochi-stars" aria-label={`已收集 ${stars} 颗星`}>✦ <strong>{stars}</strong></span><button type="button" className="mochi-icon-button" onClick={() => { setMuted(!muted); audioRef.current?.setMuted(!muted) }} aria-label={muted ? '开启声音' : '关闭声音'} aria-pressed={muted}>{muted ? '♩' : '♫'}</button><button ref={helpTriggerRef} type="button" className="mochi-icon-button" onClick={() => { if (scene === 'playing') pauseGame(); setHelpOpen(true) }} aria-label="玩法说明">?</button></div>
      </header>

      {scene === 'home' && <>
        <section className="mochi-hero">
          <div className="mochi-hero-copy"><span className="mochi-eyebrow"><i /> 小小节拍，大大快乐</span><h1 ref={headingRef} tabIndex={-1}>把心情，弹成<br />一首<span>甜甜的歌<i>♪</i></span></h1><p>欢迎来到软糖乐队的小小舞台。<br />跟着音符轻轻拍，让四位小伙伴为你奏响好心情。</p><div className="mochi-hero-buttons"><button type="button" className="mochi-primary" disabled={busy} onClick={() => void startRun()}>{busy ? '小伙伴准备中…' : `来演奏 · ${song.name}`} <span>↗</span></button><button type="button" className="mochi-text-button" disabled={busy} onClick={() => void startRun(true)}>第一次来？先练一小段</button></div><div className="mochi-hero-note"><span>♡</span> 不需要懂乐理，会点点就能玩。</div></div>
          <div className="mochi-hero-art"><img src="./assets/mochi-melody/band-hero.png" alt="奶糖小猫、泡芙小兔、布丁小熊和啾啾小鸟在花园里一起演奏" /><span className="mochi-art-tag">OUR LITTLE HAPPY BAND <i>✿</i></span><span className="mochi-floating-note note-one">♫</span><span className="mochi-floating-note note-two">✦</span><div className="mochi-art-caption"><span>✿</span><strong>今日份的快乐，正在发芽</strong><small>四位小小音乐家，等你来开场</small></div></div>
        </section>
        <section className="mochi-song-section" aria-label="选择演奏曲目"><div className="mochi-section-heading"><div><span className="mochi-section-kicker">PICK YOUR LITTLE MOOD</span><h2>今天，想听哪一种心情？ <span>✧</span></h2></div><span>每次演出约 30 秒</span></div><div className="mochi-song-grid">{SONGS.map((item, index) => {
          const locked = stars < item.unlock
          const record = progress.records[`${item.id}:${difficulty}`]
          return <button type="button" className={`mochi-song-card${songIndex === index ? ' is-selected' : ''}${locked ? ' is-locked' : ''}`} key={item.id} onClick={() => chooseSong(index)} aria-pressed={songIndex === index} aria-label={`${item.name}，${locked ? `收集 ${item.unlock} 星解锁` : `最佳 ${record?.stars ?? 0} 星`}`}><span className="mochi-song-art" style={{ background: item.color }}>{item.emoji}<i>♪</i></span><span className="mochi-song-info"><strong>{item.name}</strong><small>{item.subtitle}</small><span>{locked ? `✧ ${item.unlock} 星解锁` : <><b>{starText(record?.stars ?? 0)}</b> · {item.bpm} BPM</>}</span></span><span className="mochi-song-check">{locked ? '♡' : songIndex === index ? '✓' : '↗'}</span></button>
        })}</div><div className="mochi-difficulty-row"><span>选个舒服的节奏</span><div className="mochi-difficulties" role="group" aria-label="选择难度">{DIFFICULTIES.map((item, index) => <button type="button" key={item.id} className={difficulty === item.id ? 'is-selected' : ''} onClick={() => setDifficulty(item.id)} aria-pressed={difficulty === item.id} title={item.description}><span>{['❀', '♫', '✦'][index]}</span> {item.name}</button>)}</div><span className="mochi-personal-best">{best ? `本机最佳 ${best.score.toLocaleString()} 分` : '从轻轻拍开始吧 ♡'}</span></div></section>
        <button type="button" className="mochi-board-entry" onClick={openLeaderboard}><span>🏆</span><div><strong>甜蜜排行榜</strong><small>谁和小伙伴最合拍？看看榜单，挑战自己的下一场演出。</small></div><b>去看看 ↗</b></button>
        <section className="mochi-studio-entry"><span>♪</span><div><strong>还想自己写一首？</strong><p>让小动物们各唱一拍，拼成只属于你的小曲。</p></div><button type="button" onClick={openStudio}>去自由排练 <span>↗</span></button></section>
        <footer className="mochi-footer"><span>一点点节奏，一大口快乐。<i>♡</i></span><div><a href="#/">声音探险</a><a href="#/echo">回声花房</a><a href="#/mochi">跳跃小游戏</a></div><small>戴上耳机，快乐加倍 ♪</small></footer>
      </>}

      {(scene === 'playing' || scene === 'paused') && live && <section className="mochi-play-area">
        <div className="mochi-game-top"><button type="button" className="mochi-back" onClick={scene === 'playing' ? pauseGame : goHome} aria-label={scene === 'playing' ? '暂停演出' : '返回首页'}>↖</button><div><span>{live.practice ? '轻松练习 · 不计星星' : DIFFICULTIES.find((item) => item.id === live.difficulty)?.name}</span><h1 ref={headingRef} tabIndex={-1}>{currentSong.name}</h1></div><button type="button" className="mochi-icon-button" onClick={pauseGame} aria-label="暂停演出">Ⅱ</button></div>
        <div className="mochi-game-hud"><div><small>甜蜜得分</small><strong>{frame.run.score.toLocaleString()}</strong></div><div className={frame.run.combo >= 10 ? 'is-fever' : ''}><small>{frame.run.combo >= 10 ? '糖分超标 ♡' : '连续接住'}</small><strong>{frame.run.combo}<span> COMBO</span></strong></div><div><small>剩余时间</small><strong>{Math.max(0, Math.ceil(live.duration - frame.elapsed))}<span> s</span></strong></div></div>
        <div className="mochi-song-progress" role="progressbar" aria-label="演出进度" aria-valuenow={Math.floor(frame.elapsed / live.duration * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${frame.elapsed / live.duration * 100}%` }} /></div>
        <div className="mochi-live-band">{BAND.map((member, lane) => <div key={member.id} className={pulse[lane] > clock() ? 'is-bouncing' : ''}><Mascot lane={lane as Lane} happy={pulse[lane] > clock()} /></div>)}<span className="mochi-band-speech">{frame.run.combo >= 10 ? '我们合奏得超棒！♡' : '音符到了，就轻轻拍 ♪'}</span></div>
        <div className={`mochi-track${frame.run.combo >= 10 ? ' is-fever' : ''}`}>
          <div className="mochi-hit-line" aria-hidden="true"><span>✧</span><i /><span>✧</span></div>
          <div className="mochi-lanes">{BAND.map((member, lane) => <button type="button" className={`mochi-lane lane-${lane}${pulse[lane] > clock() ? ' is-hit' : ''}`} key={member.id} onPointerDown={(event) => { event.preventDefault(); pressLane(lane as Lane) }} onClick={(event) => { if (event.detail === 0) pressLane(lane as Lane) }} aria-label={`${member.name}音轨，按 ${member.key} 接住音符`} disabled={scene === 'paused' || frame.countdown > 0}>
            {currentNotes.filter((note) => note.lane === lane && !frame.run.grades[note.id] && note.time - frame.elapsed < NOTE_TRAVEL_SECONDS && note.time - frame.elapsed > -0.22).map((note) => <span className="mochi-falling-note" key={note.id} style={{ top: `${80 - (note.time - frame.elapsed) / NOTE_TRAVEL_SECONDS * 75}%` }} aria-hidden="true"><i>{member.symbol}</i><b>♪</b></span>)}
            <span className="mochi-lane-target" aria-hidden="true">{member.symbol}</span>
          </button>)}</div>
          {feedback.until > clock() && <div className={`mochi-hit-feedback feedback-${feedback.kind}`} aria-live="off">{feedback.text}</div>}
          {frame.elapsed < (currentNotes[0]?.time ?? 0) - 0.4 && <div className="mochi-count-in"><strong>{Math.max(1, Math.ceil((currentNotes[0].time - frame.elapsed) / (60 / currentSong.bpm)))}</strong><span>跟着小节拍，准备开场 ♪</span></div>}
          {frame.countdown > 0 && <div className="mochi-count-in is-resume"><strong>{Math.ceil(frame.countdown)}</strong><span>准备继续，音符在等你</span></div>}
        </div>
        <div className="mochi-pad-row">{BAND.map((member, lane) => <button type="button" key={member.id} className={`mochi-pad lane-${lane}${pulse[lane] > clock() ? ' is-hit' : ''}`} disabled={scene === 'paused' || frame.countdown > 0} onPointerDown={(event) => { event.preventDefault(); pressLane(lane as Lane) }} onClick={(event) => { if (event.detail === 0) pressLane(lane as Lane) }} aria-label={`${member.name}，${member.instrument}，快捷键 ${member.key}`}><strong>{member.name}</strong><small>{member.instrument}</small><kbd>{member.key}</kbd></button>)}</div><p className="mochi-play-help">点音轨或底部按钮 · 键盘 D / F / J / K · Esc 暂停</p>
        {scene === 'paused' && <div className="mochi-pause-overlay"><div className="mochi-pause-card" role="dialog" aria-modal="true" aria-label="演出已暂停" onKeyDown={(event) => {
          if (event.key !== 'Tab') return
          if (event.shiftKey && document.activeElement === pauseResumeRef.current) { event.preventDefault(); pauseHomeRef.current?.focus() }
          else if (!event.shiftKey && document.activeElement === pauseHomeRef.current) { event.preventDefault(); pauseResumeRef.current?.focus() }
        }}><Mascot lane={0} happy /><span className="mochi-eyebrow">小小休息时间</span><h2>先吃颗软糖吧 ♡</h2><p>音符已经停好，随时可以继续。</p><button ref={pauseResumeRef} type="button" className="mochi-primary" disabled={busy} onClick={() => void resumeRun()}>继续演出 <span>▶</span></button><button ref={pauseHomeRef} type="button" className="mochi-text-button" onClick={goHome}>返回小舞台</button></div></div>}
      </section>}

      {scene === 'result' && live && <section className="mochi-result-area"><div className="mochi-result-top"><span className="mochi-eyebrow">{live.practice ? '第一次合奏，完成啦' : 'A LITTLE CONCERT, A BIG SMILE'}</span><h1 ref={headingRef} tabIndex={-1}>{resultStars === 3 ? '这场演出，甜度满分！' : resultStars > 0 ? '小小乐队，为你欢呼！' : '快乐，不止一次开场'}</h1><p>《{currentSong.name}》 · {live.practice ? '轻松练习' : DIFFICULTIES.find((item) => item.id === live.difficulty)?.name}</p></div><div className="mochi-result-band">{BAND.map((member, lane) => <div key={member.id} className={pulse[lane] > clock() ? 'is-bouncing' : ''}><Mascot lane={lane as Lane} happy /><strong>{member.name}</strong></div>)}</div><div className="mochi-result-card"><div className="mochi-result-stars" aria-label={`${resultStars} 星`}>{starText(resultStars)}</div><div className="mochi-result-score"><small>本次甜蜜得分 {newBest && <b>NEW BEST!</b>}</small><strong>{live.run.score.toLocaleString()}</strong></div><div className="mochi-result-stats"><div><strong>{Math.round(runAccuracy(live.run, live.notes.length) * 100)}<span>%</span></strong><small>节拍准确度</small></div><div><strong>{live.run.maxCombo}</strong><small>最长连击</small></div><div><strong>{live.run.perfect + live.run.good}<span>/{live.notes.length}</span></strong><small>接住的音符</small></div></div><div className="mochi-result-grades"><span>✦ 刚刚好 {live.run.perfect}</span><span>♡ 接住啦 {live.run.good}</span><span>· 走散了 {live.run.misses}</span></div><p className="mochi-result-message">{live.practice ? '练习完成！回小舞台，来一场正式演出吧。' : resultStars > 0 ? `本机已收集 ${stars} 颗星。${stars < 1 ? '下一颗星会带来一首新曲。' : stars < 4 ? `再收集 ${4 - stars} 颗，解锁「星星的晚安」。` : '全部曲目已开放，试试更活泼的节奏吧！'}` : '每次接住音符都在演奏。再试一次，把快乐连起来。'}</p></div>{!live.practice && <SubmitScore submission={{ songId: currentSong.id, difficulty: live.difficulty, score: live.run.score, taps: live.taps }} player={player} onPlayer={setPlayer} onBoard={openLeaderboard} />}<div className="mochi-result-actions"><button type="button" className="mochi-primary" disabled={busy} onClick={() => void startRun(live.practice)}>再来一首 <span>↗</span></button><button type="button" className="mochi-secondary" onClick={goHome}>回小舞台</button></div><div className="mochi-result-extras"><button type="button" disabled={!live.hits.length || busy} onClick={() => void replayRun()}>{replaying ? '■ 停止回放' : '♫ 听听我的演出'}</button><button type="button" onClick={() => void share(false)}>↗ 邀请朋友挑战</button><button type="button" onClick={openStudio}>✧ 自己写首小曲</button></div>{replaying && <p className="mochi-play-help" role="status">正在回放你实际接住的音符，跟着你的小伙伴再听一次 ♪</p>}</section>}

      {scene === 'leaderboard' && <Leaderboard initialSong={songIndex} initialDifficulty={difficulty} player={player} onChallenge={(index, mode) => {
        if (stars < SONGS[index].unlock) { notify(`再收集 ${SONGS[index].unlock - stars} 颗星，就能挑战这首小曲 ♡`); return }
        setSongIndex(index); setDifficulty(mode); goHome()
      }} />}

      {scene === 'studio' && <section className="mochi-studio"><div className="mochi-section-heading"><div><span className="mochi-section-kicker">YOUR OWN LITTLE MELODY</span><h1 ref={headingRef} tabIndex={-1}>自由排练室 <span>♫</span></h1><p>点亮小格子，让每个小伙伴在那一拍发声。</p></div><span className="mochi-studio-badge">只属于你的小曲 ♡</span></div><div className="mochi-studio-band">{BAND.map((member, lane) => <button type="button" key={member.id} className={pulse[lane] > clock() ? 'is-bouncing' : ''} onClick={() => void previewLane(lane as Lane)}><Mascot lane={lane as Lane} happy={pulse[lane] > clock()} /><strong>{member.name}</strong><small>{member.instrument}</small></button>)}</div><div className="mochi-studio-toolbar"><div className="mochi-preset-buttons">{PRESETS.map((preset, index) => <button type="button" key={preset.name} onClick={() => { const next = presetPattern(index); setPattern(next); patternRef.current = next; persist({ ...progressRef.current, lastMix: encodePattern(next) }); setShareFallback('') }}>{preset.name}</button>)}</div><button type="button" className="mochi-text-button" onClick={() => { const next = blankPattern(); setPattern(next); patternRef.current = next; persist({ ...progressRef.current, lastMix: encodePattern(next) }); setShareFallback('') }}>清空乐谱</button></div><div className="mochi-studio-page-tabs" role="group" aria-label="切换小节"><button type="button" onClick={() => setStudioPage(0)} aria-pressed={studioPage === 0} className={studioPage === 0 ? 'is-active' : ''}>第一小节 · 1—8</button><button type="button" onClick={() => setStudioPage(1)} aria-pressed={studioPage === 1} className={studioPage === 1 ? 'is-active' : ''}>第二小节 · 9—16</button></div><div className="mochi-sequencer" data-page={studioPage}><div className="mochi-sequencer-label">拍点 ↗</div>{Array.from({ length: 16 }, (_, step) => <span className={`mochi-step-label half-${Math.floor(step / 8)}${studioStep === step ? ' is-current' : ''}`} key={`label-${step}`}>{step + 1}</span>)}{BAND.map((member, lane) => <div className="mochi-sequencer-row" key={member.id}><span className={`mochi-sequencer-label lane-${lane}`}><i>{member.symbol}</i>{member.name}</span>{pattern[lane].map((active, step) => <button type="button" key={step} className={`mochi-studio-cell lane-${lane} half-${Math.floor(step / 8)}${active ? ' is-on' : ''}${studioStep === step ? ' is-current' : ''}${step % 4 === 0 ? ' is-downbeat' : ''}`} onClick={() => toggleCell(lane as Lane, step)} aria-pressed={active} aria-label={`${member.name}第 ${step + 1} 小拍，${active ? '已发声' : '留白'}`}>{active ? member.symbol : '·'}</button>)}</div>)}</div><div className="mochi-tempo"><label htmlFor="mochi-tempo">慢慢的 <span>♪</span></label><input id="mochi-tempo" aria-label="排练速度，每分钟拍数" type="range" min={80} max={140} step={2} value={bpm} disabled={studioPlaying} onChange={(event) => { setBpm(Number(event.target.value)); setShareFallback('') }} /><span>蹦蹦的 <strong>{bpm} BPM</strong></span></div><div className="mochi-studio-actions"><button type="button" className="mochi-primary" disabled={busy || pattern.every((row) => row.every((cell) => !cell))} onClick={() => void playStudio()}>{studioPlaying ? '停止合奏' : '听听我们的小曲'} <span>{studioPlaying ? '■' : '▶'}</span></button><button type="button" className="mochi-secondary" onClick={() => void share(true)}>寄给朋友 <span>↗</span></button></div><p className="mochi-studio-footnote">可以边听边改；小曲自动保存在当前浏览器。朋友打开链接就能听，也能接着创作。</p></section>}

      {shareFallback && <div className="mochi-share-fallback"><label htmlFor="mochi-share-url">手动复制这条快乐链接 ♡</label><input id="mochi-share-url" readOnly value={shareFallback} onFocus={(event) => event.currentTarget.select()} /></div>}
      {audioUnavailable && scene !== 'home' && <p className="mochi-status-note" role="status">当前声音暂不可用，可继续静音游玩或编辑乐谱。</p>}
      {storageUnavailable && <p className="mochi-status-note" role="status">浏览器暂时无法保存，本次成绩仍会保留到离开页面。</p>}
    </div>
    {toast && <div className="mochi-toast" role="status"><span>♡</span>{toast}</div>}
    {helpOpen && <div className="mochi-help-backdrop" onClick={() => { setHelpOpen(false); helpTriggerRef.current?.focus() }}><section className="mochi-help-card" role="dialog" aria-modal="true" aria-label="软糖乐队玩法说明" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
      if (event.key !== 'Tab') return
      if (event.shiftKey && document.activeElement === helpCloseRef.current) { event.preventDefault(); helpLastRef.current?.focus() }
      else if (!event.shiftKey && document.activeElement === helpLastRef.current) { event.preventDefault(); helpCloseRef.current?.focus() }
    }}><button ref={helpCloseRef} type="button" className="mochi-help-close" onClick={() => { setHelpOpen(false); helpTriggerRef.current?.focus() }} aria-label="关闭玩法说明">×</button><Mascot lane={1} happy /><span className="mochi-eyebrow">给第一次来玩的你</span><h2>三步，开一场小演唱会</h2><ol><li><span>01</span><div><strong>选一首小曲</strong><p>先选「轻轻拍」，音符会慢慢来到你面前。</p></div></li><li><span>02</span><div><strong>到了虚线，轻轻拍</strong><p>点对应音轨或小动物按钮；电脑也能按 D、F、J、K。</p></div></li><li><span>03</span><div><strong>连起来，一起合奏</strong><p>命中会发声，连续接住增加得分。三星要准确度达到 90%，二星 70%，一星 40%；多拍会影响准确度。</p></div></li></ol><label className="mochi-calibration" htmlFor="mochi-offset"><span>音画校准 <strong>{progress.offset > 0 ? '+' : ''}{progress.offset} ms</strong></span><input id="mochi-offset" type="range" min={-150} max={150} step={10} value={progress.offset} onChange={(event) => persist({ ...progressRef.current, offset: Number(event.target.value) })} /><small>蓝牙耳机觉得声音偏晚？向右调一点，或使用有线耳机。调整从下一场演出生效。</small></label><button ref={helpLastRef} type="button" className="mochi-primary" onClick={() => { setHelpOpen(false); helpTriggerRef.current?.focus() }}>准备好快乐啦 <span>♡</span></button></section></div>}
  </main>
}

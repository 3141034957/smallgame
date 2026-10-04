import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { advanceFarmPosition, farmPointerTarget, farmWorldBounds } from '@/features/farm/presentation'
import { bindFarmControls } from '@/features/farm/controls'
import { MelodyAudio } from '@/features/melody/audio'
import { chooseTalent, clampPoint, createFarm, DURATION, evolved, FPS, FRAMES, MOVE_STEP, RECIPES, replayFarm, stepFarm, TALENTS, THRESHOLDS, todayRoute, validDay } from '@/features/farm/rules.mjs'
import type { Choice, FarmEvent, FarmRound, Point, TalentId } from '@/features/farm/rules.mjs'
import { drawFarm } from './render'
import { FarmBoard } from './FarmBoard'
import './style.css'

type Phase = 'ready' | 'play' | 'result'
type Panel = 'help' | 'board' | 'pause' | null
const talent = (id: TalentId) => TALENTS.find((item) => item.id === id)!
const number = (value: number) => value.toLocaleString()

export default function MusicFarm() {
  const [params] = useSearchParams()
  const day = validDay(params.get('day')) ? params.get('day')! : todayRoute()
  const [initial] = useState(() => createFarm(day))
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
  const [muted, setMuted] = useState(false)
  const [audioError, setAudioError] = useState(false)
  const [celebration, setCelebration] = useState('')
  const [notice, setNotice] = useState('')
  const [best, setBest] = useState(() => { try { return Number(localStorage.getItem(`farm-best-v3:${day}`)) || 0 } catch { return 0 } })
  const canvas = useRef<HTMLCanvasElement>(null)
  const page = useRef<HTMLDivElement>(null)
  const modal = useRef<HTMLElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const field = useRef<HTMLDivElement>(null)
  const audio = useRef<MelodyAudio | null>(null)
  const pointerTarget = useRef<Point | null>(null)
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
  const start = () => { phaseRef.current = 'play'; setPhase('play'); void prepare(); field.current?.focus({ preventScroll: true }) }
  const restart = () => {
    audio.current?.stop(); audioSerial.current++; model.current = createFarm(day); desired.current = [...model.current.position]; displayPosition.current = [...model.current.position]; controls.current?.reset(); logs.current = { frames: [], choices: [], surges: [] }; effects.current = []; surge.current = false; keys.current.clear(); setView(model.current); setRound(null); setCelebration(''); setNotice(''); celebrationUntil.current = 0; noticeUntil.current = 0; panelRef.current = null; setPanel(null); phaseRef.current = 'ready'; setPhase('ready'); page.current?.scrollIntoView({ block: 'start' })
  }
  const select = (id: TalentId) => {
    const before = model.current
    const next = chooseTalent(before, id)
    if (!next) return
    logs.current.choices.push({ tick: before.tick, id }); model.current = next; setView(next)
    const newForm = evolved(next.gear).find((weapon) => !evolved(before.gear).includes(weapon))
    if (newForm) { setCelebration(RECIPES.find((recipe) => recipe.weapon === newForm)!.name); celebrationUntil.current = performance.now() + 2800; audio.current?.playLane(1, 72); audio.current?.playLane(3, 84, .12); audio.current?.playLane(1, 79, .24) }
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
      target: (point, mode) => { pointerTarget.current = point; desired.current = farmPointerTarget(model.current.position, point); keys.current.clear(); if (inputModeRef.current !== mode) { inputModeRef.current = mode; setInputMode(mode) } },
      stop: () => { pointerTarget.current = null; desired.current = [...displayPosition.current] },
    })
    const input = controls.current
    let previousEnemies = new Map<number, { x: number; y: number }>()
    let previousShots = new Map<number, { x: number; y: number }>()
    let previousLoot = new Map<number, { x: number; y: number }>()
    let frame = 0, last = 0, elapsed = 0, published = 0
    let drawnState = model.current, hasDrawn = false
    let sampleStart = 0, draws = 0, drawMs = 0, moves = 0
    const animate = (now: number) => {
      const delta = last ? Math.min(125, now - last) : 0; last = now
      let state = model.current
      const running = phaseRef.current === 'play' && !panelRef.current && !state.offered.length
      if (running) {
        elapsed += delta
        while (elapsed >= 1000 / FPS && state.tick < FRAMES && state.hp > 0 && !state.offered.length) {
          elapsed -= 1000 / FPS
          const held = keys.current
          const dx = Number(held.has('ArrowRight') || held.has('d')) - Number(held.has('ArrowLeft') || held.has('a'))
          const dy = Number(held.has('ArrowDown') || held.has('s')) - Number(held.has('ArrowUp') || held.has('w'))
          if (pointerTarget.current) desired.current = farmPointerTarget(state.position, pointerTarget.current)
          if (dx || dy) desired.current = [state.position[0] + dx * MOVE_STEP, state.position[1] + dy * MOVE_STEP]
          const point = clampPoint(state.position, desired.current)
          const useSurge = surge.current && state.charge >= 100; surge.current = false
          const result = stepFarm(state, point, useSurge)
          if (!result) break
          logs.current.frames.push(point); if (useSurge) logs.current.surges.push(state.tick)
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
          if (result.events.some((event) => event.kind === 'arrival')) { setNotice('鼓噪巨兽登场！躲开红圈，击败它爆经验'); noticeUntil.current = now + 2400 }
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
          if (state.tick >= FRAMES || state.hp <= 0) {
            const finished = replayFarm(day, logs.current.frames, logs.current.choices, logs.current.surges)
            setRound(finished); phaseRef.current = 'result'; setPhase('result'); audio.current?.stop(); setView(state)
            if (finished) setBest((previous) => { const value = Math.max(previous, finished.score); try { localStorage.setItem(`farm-best-v3:${day}`, String(value)) } catch { /* Storage optional. */ } return value })
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
        const previous = displayPosition.current
        displayPosition.current = advanceFarmPosition(previous, desired.current, state.position, delta)
        if (previous[0] !== displayPosition.current[0] || previous[1] !== displayPosition.current[1]) moves++
      }
      if (!document.hidden && phaseRef.current !== 'result' && (running || effects.current.length || !hasDrawn || drawnState !== state || resized)) {
        const started = showPerformance ? performance.now() : 0
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
        drawFarm(ctx, state, effects.current, now, width, height, { position: displayPosition.current, tick: state.tick + elapsed * FPS / 1000, previousLoot, previousEnemies, previousShots, alpha: Math.min(1, elapsed * FPS / 1000) })
        if (showPerformance) { drawMs += performance.now() - started; draws++ }
        drawnState = state; hasDrawn = true; resized = false
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
  const progress = nextThreshold > previousThreshold ? Math.min(100, (view.xp - previousThreshold) / (nextThreshold - previousThreshold) * 100) : 100
  const forms = evolved(view.gear)
  const trap = (event: React.KeyboardEvent<HTMLElement>) => { if (event.key === 'Escape' && panel) closePanel(); if (event.key !== 'Tab') return; const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button,input,a')); if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus() } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus() } }
  const rack = <div className="farm-rack">{RECIPES.map((recipe) => { const weapon = talent(recipe.weapon), chip = talent(recipe.chip), terminal = forms.includes(recipe.weapon); return <div key={recipe.weapon} className={terminal ? 'is-terminal' : ''} title={`${weapon.name} Lv.${view.gear[weapon.id]} ＋ ${chip.name} Lv.${view.gear[chip.id]} → ${recipe.name}`}><span>{recipe.icon}</span><strong>{terminal ? recipe.name : weapon.name}</strong><small>{terminal ? '终极形态 ✦' : <>乐器 {view.gear[weapon.id]}/3 · 芯片 {view.gear[chip.id]}/3</>}</small></div> })}</div>
  return <div className={`music-farm ${phase === 'result' ? 'is-result-page' : ''}`} ref={page}><div className="farm-shell" inert={!!panel || upgrade}><header className="farm-header"><a className="farm-brand" href="#/farm"><span>♬</span><div><h1>节拍幸存者</h1><small>TINY BEATS · BIG BATTLES</small></div></a><nav><button aria-label="查看生存排行榜" onClick={() => openPanel('board')}>🏆</button><button aria-label={muted ? '开启声音' : '静音'} aria-pressed={muted} onClick={() => { setMuted(!muted); audio.current?.setMuted(!muted); if (muted || audioError) void prepare(!muted) }}>{muted ? '♩' : '♫'}</button><button aria-label="查看进化配方" onClick={() => openPanel('help')}>?</button></nav></header>
    <div className={`farm-layout ${phase === 'result' ? 'is-result' : ''}`}>
    <section className="farm-game" aria-label="节拍幸存者游戏"><div className="farm-hud"><div><small>清怪分数</small><strong>{number(view.score)}</strong></div><div className="farm-combo"><b>{view.combo}</b><small>连击 · 最高 ×5</small></div><div className="farm-time"><b>{DURATION - Math.floor(view.tick / FPS)}<small>s</small></b>{phase === 'play' && <button aria-label="暂停游戏" onClick={() => openPanel('pause')}>Ⅱ</button>}</div></div><div className="farm-xp"><span>Lv.{view.level + 1}</span><div role="progressbar" aria-label="经验进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><i style={{ width: `${progress}%` }} /></div><span>{view.level >= THRESHOLDS.length ? 'MAX' : '击败怪物，捡经验'}</span></div>
    <div className={`farm-health ${view.hp <= 30 ? 'is-low' : ''}`}><span>♥</span><div role="progressbar" aria-label="生命值" aria-valuemin={0} aria-valuemax={view.maxHp} aria-valuenow={view.hp}><i style={{ width: `${view.hp / view.maxHp * 100}%` }} /></div><b>{view.hp}/{view.maxHp}</b><small>第 {Math.min(4, 1 + Math.floor(view.tick / (FPS * 15)))} 波</small></div>
    <div className="farm-field" ref={field} tabIndex={0} role="application" aria-label="生存战场：手机按住拖动，电脑移动鼠标，或使用方向键和 WASD，空格释放音浪爆发" onKeyDown={(event) => { if (event.target !== event.currentTarget || phaseRef.current !== 'play') return; if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','w','a','s','d',' '].includes(event.key)) { event.preventDefault(); if (event.key === ' ') { if (phaseRef.current === 'play' && model.current.charge >= 100) surge.current = true } else { pointerTarget.current = null; keys.current.add(event.key); const movement: Record<string, Point> = { ArrowLeft: [-MOVE_STEP,0], a: [-MOVE_STEP,0], ArrowRight: [MOVE_STEP,0], d: [MOVE_STEP,0], ArrowUp: [0,-MOVE_STEP], w: [0,-MOVE_STEP], ArrowDown: [0,MOVE_STEP], s: [0,MOVE_STEP] }; const delta = movement[event.key]; desired.current = [model.current.position[0] + delta[0], model.current.position[1] + delta[1]] } } }} onKeyUp={(event) => keys.current.delete(event.key)} onBlur={() => keys.current.clear()}><canvas ref={canvas} aria-label="音乐怪物与兔兔乐手的生存战场" />{phase === 'ready' && <div className="farm-ready"><div className="farm-start-card"><span className="farm-ready-icon">♫</span><h2>带上乐器，冲出怪潮！</h2><p>无限舞台 · 拖动走位 · 自动攻击</p><button className="farm-primary" onClick={start}>开始玩 <span>60 秒 ↗</span></button><small>躲怪、捡经验、选升级，撑过 60 秒！</small></div></div>}{phase === 'play' && notice && <div className="farm-notice" role="status">{notice}</div>}{phase === 'play' && celebration && !upgrade && <div className="farm-evolution" role="status"><small>武器 × 芯片 · 终极进化</small><b>✦ {celebration} ✦</b><span>奏响你的最强乐器！</span></div>}{phase === 'play' && view.tick < FPS * 4 && <div className="farm-drag-hint">{inputMode === 'touch' ? '↔ 按住方向持续移动，松手停住' : '↔ 鼠标指向前方持续前进，移回中央停住'}</div>}</div>
    <div className="farm-controls"><div><b>✦ {number(view.coins)}</b><small>{view.harvested} 击败 · {view.bosses} Boss</small></div><button className={`farm-surge ${view.charge >= 100 ? 'is-ready' : ''}`} disabled={phase !== 'play' || view.charge < 100} onClick={() => { surge.current = true }}><i style={{ width: `${view.charge}%` }} /><span>{view.charge >= 100 ? '✦ 音浪爆发！' : `音浪爆发 ${view.charge}%`}</span></button></div>{rack}<div className="farm-bottom-note">乐器 Lv.3 ＋ 对应芯片 Lv.3 ＝ 终极形态</div></section>
    {phase === 'result' && <section className="farm-result"><small>SURVIVOR ENCORE</small><h2 tabIndex={-1}>{view.hp > 0 ? '守住了，演出大成功！' : '差一点！再来一场？'}</h2><div className="farm-stars">{'★'.repeat(round?.stars ?? 0)}</div><strong className="farm-final-score">{number(view.score)}</strong><small className="farm-personal-best">今日最佳 {number(best)} 分</small><p>生存 {(view.tick / FPS).toFixed(1)} 秒 · {view.harvested} 击败 · {view.maxCombo} 连击</p>{forms.length > 0 && <p className="farm-final-build">✦ {RECIPES.filter((recipe) => forms.includes(recipe.weapon)).map((recipe) => recipe.name).join(' ＋ ')}</p>}<button className="farm-primary" onClick={restart}>再来一局，换种奏法 ↗</button><FarmBoard day={day} round={round} /></section>}
    </div>{showPerformance && <output className="farm-performance" aria-label="性能诊断">渲染 {performanceView.fps} FPS · 绘制 {performanceView.drawMs} ms · 位移 {performanceView.moves} 次/秒 · 坐标 {view.position.join(",")} </output>}{audioError && <p role="status" className="farm-audio-error">声音暂时无法开启，仍可继续战斗。点右上角声音按钮重试。</p>}<footer className="farm-footer">一点音乐，一整场快乐 ♡ <span>原创合成音乐 · 演示版</span></footer></div>
    {(panel || upgrade) && <div className="farm-backdrop"><section className={`farm-dialog ${upgrade ? 'farm-upgrade-dialog' : ''}`} ref={modal} role="dialog" aria-modal="true" aria-label={upgrade ? '选择升级' : panel === 'board' ? '生存排行榜' : panel === 'help' ? '玩法与进化配方' : '游戏暂停'} onKeyDown={trap}>
    {upgrade ? <><small className="farm-eyebrow">LEVEL UP · 时间已暂停</small><h2>新节拍，选你喜欢的！</h2><p>乐器负责攻击，芯片负责强化。都满级，自动进化。</p><div className="farm-choices">{view.offered.map((id) => { const item = talent(id), recipe = RECIPES.find((entry) => entry.weapon === id || entry.chip === id)!; const nextGear = { ...view.gear, [id]: view.gear[id] + 1 }; const willEvolve = evolved(nextGear).includes(recipe.weapon) && !forms.includes(recipe.weapon); return <button key={id} onClick={() => select(id)} style={{ '--talent-color': item.color } as React.CSSProperties}><span className="farm-choice-icon">{item.icon}</span><small>{item.kind === 'weapon' ? '乐器 / 武器' : '提升芯片'} · {item.tag}</small><b>{item.name}<em>Lv.{view.gear[id]} → {view.gear[id] + 1}</em></b><p>{item.description}</p><div className="farm-recipe-progress"><span>{talent(recipe.weapon).name} {nextGear[recipe.weapon]}/3</span><span>{talent(recipe.chip).name} {nextGear[recipe.chip]}/3</span></div><strong>{willEvolve ? `✦ 这次解锁 ${recipe.name}` : `满级进化 → ${recipe.name}`}</strong></button> })}</div></> : <><button className="farm-close" aria-label="关闭弹窗" onClick={closePanel}>×</button>{panel === 'board' ? <FarmBoard day={day} /> : panel === 'pause' ? <><div className="farm-modal-icon">☾</div><h2>乐队等你回来 ♡</h2><p>倒计时已停住，乐队和构筑都还在。</p><button className="farm-primary" onClick={closePanel}>继续战斗 ↗</button><button className="farm-text-button" onClick={restart}>重新开始</button></> : <><small className="farm-eyebrow">YOUR LITTLE BAND</small><h2>用你的乐队，击退怪潮</h2><p>手机按住拖动、松手停住；电脑移动鼠标指针即可走位，镜头跟随角色，无边界探索。鼠标移回中央或移出战场可停住，乐器自动攻击附近怪物。注意血条，躲开怪物、粉色弹幕和红色预警圈，捡爱心回血。捡经验升级，三选一获得新乐器或强化已有装备；能量满了，点「音浪爆发」清弹幕并获得短暂无敌。</p><div className="farm-recipes">{RECIPES.map((recipe) => <div key={recipe.weapon}><span>{recipe.icon}</span><div><b>{recipe.name}</b><small>{talent(recipe.weapon).name} Lv.3 ＋ {talent(recipe.chip).name} Lv.3</small><p>{recipe.description}</p></div></div>)}</div><p className="farm-help-keyboard">方向键 / WASD 移动，空格释放音浪爆发。离开页面自动暂停。一局 60 秒，今日榜保留最高分。</p><button className="farm-primary" onClick={closePanel}>懂啦，开战！ ↗</button></>}</>}
    </section></div>}
  </div>
}

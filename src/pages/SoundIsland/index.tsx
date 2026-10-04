import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BAND } from '@/features/melody/engine'
import type { Lane } from '@/features/melody/engine'
import { MelodyAudio } from '@/features/melody/audio'
import { loadPlayer } from '@/features/melody/leaderboard'
import { ISLANDS, FRIENDS, SPELLS, HOME, playTurn, canInvite, createJourney, decodeRoute, encodeRoute, journeyStars, reachable, replayJourney, todayRoute, validDay } from '@/features/island/rules.mjs'
import type { IslandAction, Journey } from '@/features/island/rules.mjs'
import { loadIslandProgress, saveIslandProgress } from '@/features/island/progress'
import { FIRST_SONG_PATH, firstSongStep, hasPlayedFirstSong, rememberFirstSong } from '@/features/island/welcome'
import { Mascot } from '../MochiMelody/Mascot'
import { Camp, SoundPlant } from './Scenery'
import { IslandBoard, IslandSubmit } from './IslandBoard'
import './index.less'

type Scene = 'intro' | 'explore' | 'result' | 'chart'
const symbols = ['●', '✿', '♧', '♪']
const plantNames = ['咚咚蘑菇', '泡芙花', '布丁浆果', '啾啾风铃']
const starsText = (count: number) => '★'.repeat(count) + '☆'.repeat(3 - count)

export default function SoundIsland() {
  const [params, setParams] = useSearchParams()
  const [day] = useState(() => validDay(params.get('day')) ? params.get('day')! : todayRoute())
  const [islandId, setIslandId] = useState(() => ISLANDS.find((island) => island.id === params.get('island'))?.id ?? 'picnic')
  const [progress, setProgress] = useState(loadIslandProgress)
  const [player, setPlayer] = useState(loadPlayer)
  const [journey, setJourney] = useState(() => createJourney(islandId, day))
  const [shared] = useState(() => {
    const actions = decodeRoute(params.get('route'))
    return actions ? replayJourney(islandId, day, actions) : null
  })
  const [scene, setScene] = useState<Scene>(() => shared ? 'intro' : 'explore')
  const [firstSong, setFirstSong] = useState(() => !hasPlayedFirstSong())
  const [magicOpen, setMagicOpen] = useState(false)
  const [listeningShared, setListeningShared] = useState(false)
  const [musicOn, setMusicOn] = useState(false)
  const [muted, setMuted] = useState(false)
  const [beat, setBeat] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [help, setHelp] = useState(false)
  const [toast, setToast] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const [storageWarning, setStorageWarning] = useState(false)
  const pageRef = useRef<HTMLElement>(null)
  const closeHelpRef = useRef<HTMLButtonElement>(null)
  const lastHelpRef = useRef<HTMLButtonElement>(null)
  const helpTriggerRef = useRef<HTMLButtonElement>(null)
  const journeyRef = useRef(journey)
  journeyRef.current = journey
  const soundtrackRef = useRef<Journey>(journey)
  soundtrackRef.current = listeningShared && shared ? shared : journey
  const audioRef = useRef<MelodyAudio | null>(null)
  if (!audioRef.current) audioRef.current = new MelodyAudio()
  const serialRef = useRef(0)
  const actionRef = useRef<(action: IslandAction) => void>(() => {})
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const island = ISLANDS.find((item) => item.id === islandId)!
  const totalStars = Object.values(progress).reduce((sum, record) => sum + record.stars, 0)
  const friendHere = FRIENDS.find((friend) => friend.cell === journey.position && !journey.friends.includes(friend.lane))
  const firstStep = firstSongStep(journey)
  const firstComplete = firstSong && firstStep === 4
  const guidedTarget = firstSong && !firstComplete ? FIRST_SONG_PATH[firstStep] : null
  const guideCells = new Set([0, 1, 2, 5, 6, 7, 10, 11, 12])
  const visibleTiles = firstSong ? journey.tiles.filter((tile) => guideCells.has(tile.cell)) : journey.tiles
  const firstPrompt = ['点一下发光的格子 ♪', '第一颗声音亮啦，再点这里 ♪', '再点一朵花，听听小曲怎么变', '点一下小兔，她要开始唱歌啦！', '泡芙入队啦！你们已经能一起合奏了 ♡'][firstStep]
  const canCelebrate = journey.position === HOME && journey.friends.length === 3

  const notify = (message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(message); toastTimer.current = setTimeout(() => setToast(''), 4200)
  }
  useEffect(() => () => { serialRef.current++; audioRef.current?.dispose(); if (toastTimer.current) clearTimeout(toastTimer.current) }, [])
  useEffect(() => {
    if (pageRef.current) { pageRef.current.scrollTop = 0; pageRef.current.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true }) }
  }, [scene])
  useEffect(() => {
    if (!help) return
    closeHelpRef.current?.focus()
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setHelp(false); helpTriggerRef.current?.focus() } }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [help])
  useEffect(() => {
    const hidden = () => { if (document.hidden) { setMusicOn(false); audioRef.current?.stop() } }
    document.addEventListener('visibilitychange', hidden)
    return () => document.removeEventListener('visibilitychange', hidden)
  }, [])
  useEffect(() => {
    if (scene !== 'explore' || help) return
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      const direction = { ArrowUp: -5, ArrowDown: 5, ArrowLeft: -1, ArrowRight: 1 }[event.key as 'ArrowUp']
      if (direction === undefined) return
      event.preventDefault()
      actionRef.current({ type: 'move', cell: journeyRef.current.position + direction })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scene, help])

  useEffect(() => {
    if (!musicOn) { audioRef.current?.stop(); setBeat(-1); return }
    let animation = 0
    let next = 0
    const origin = performance.now() / 1000
    const stepSeconds = 60 / 96 / 2
    const loop = () => {
      const elapsed = performance.now() / 1000 - origin
      while (next * stepSeconds < elapsed + 0.1) {
        const slot = next % 16
        const delay = next * stepSeconds - elapsed
        const state = soundtrackRef.current
        const notes = state.melody.slice(-16)
        const note = notes[slot] ?? (notes.length > 0 && notes.length < 4 && slot % 4 === 0 ? notes[slot / 4 % notes.length] : null)
        if (note) audioRef.current?.playLane(note.lane, note.midi, delay)
        if (next % 2 === 0) audioRef.current?.accompany(Math.floor(next / 2), delay, ISLANDS.findIndex((item) => item.id === state.islandId))
        if (slot === 0) state.friends.forEach((lane) => audioRef.current?.playLane(lane, lane === 2 ? 36 : lane === 3 ? 84 : 72, delay + lane * 0.04))
        next++
      }
      setBeat(Math.floor(elapsed / stepSeconds) % 16)
      animation = requestAnimationFrame(loop)
    }
    animation = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(animation); audioRef.current?.stop() }
  }, [musicOn])

  const enableMusic = async () => {
    const serial = serialRef.current
    const ready = await audioRef.current!.prepare()
    if (serial !== serialRef.current) return false
    if (ready) setMusicOn(true)
    else notify('暂时无法开启声音，仍可正常探险。')
    return ready
  }
  const home = () => { serialRef.current++; setMusicOn(false); setListeningShared(false); setScene('intro'); setShareUrl('') }
  const chart = () => { serialRef.current++; setMusicOn(false); setListeningShared(false); setScene('chart'); setShareUrl('') }
  const start = async (replayFirst = false) => {
    if (busy) return
    setBusy(true)
    const serial = ++serialRef.current
    const ready = await audioRef.current!.prepare()
    if (serial !== serialRef.current) { setBusy(false); return }
    const next = createJourney(islandId, day)
    journeyRef.current = next; setJourney(next)
    setFirstSong(replayFirst || !hasPlayedFirstSong()); setMagicOpen(false)
    setBusy(false); setMusicOn(ready); setListeningShared(false); setShareUrl(''); setScene('explore')
    if (!ready) notify('声音暂时未开启，先探索也没关系 ♡')
  }
  const takeAction = (action: IslandAction) => {
    const previous = journeyRef.current
    if (firstSong && firstSongStep(previous) < 4 && (action.type !== 'move' || action.cell !== FIRST_SONG_PATH[firstSongStep(previous)])) return
    const next = playTurn(previous, action)
    if (!next) return
    journeyRef.current = next; setJourney(next)
    const freshNotes = next.melody.slice(previous.melody.length)
    if (musicOn) freshNotes.forEach((note, index) => audioRef.current?.playLane(note.lane, note.midi, index * 0.12))
    else {
      const serial = serialRef.current
      void audioRef.current!.prepare().then((ready) => {
        if (!ready || serial !== serialRef.current) return
        setMusicOn(true)
        freshNotes.forEach((note, index) => audioRef.current?.playLane(note.lane, note.midi, index * 0.12))
      })
    }
    if (!previous.friends.includes(1) && next.friends.includes(1)) rememberFirstSong()
    next.friends.filter((lane) => !previous.friends.includes(lane)).forEach((lane) => {
      audioRef.current?.playLane(lane, lane === 2 ? 48 : 79)
      audioRef.current?.playLane(lane, lane === 2 ? 55 : 84, 0.16)
    })
    if (next.finished) {
      const old = progress[next.islandId]
      const updated = { ...progress, [next.islandId]: { score: Math.max(old?.score ?? 0, next.score), stars: Math.max(old?.stars ?? 0, journeyStars(next)) } }
      setProgress(updated); if (!saveIslandProgress(updated)) setStorageWarning(true)
      setScene('result')
    }
  }
  actionRef.current = takeAction
  const chooseIsland = (id: string) => {
    const target = ISLANDS.find((item) => item.id === id)!
    if (totalStars < target.unlock) { notify(`再收集 ${target.unlock - totalStars} 颗星，就能去${target.name}啦 ♡`); return }
    setIslandId(id); home(); setParams({ island: id, day }, { replace: true })
  }
  const share = async () => {
    const url = new URL(window.location.href)
    url.hash = `#/?${new URLSearchParams({ island: journey.islandId, day: journey.day, route: encodeRoute(journey) })}`
    try { await navigator.clipboard.writeText(`我在软糖小岛走出了一首歌，${journey.score} 分！点开听听，也来试试你的路线：${url}`); notify('旅途小曲链接已复制，发给朋友就能听 ♡') }
    catch { setShareUrl(url.toString()); notify('选中下方链接，复制给朋友就能听。') }
  }

  return <main className={`sound-island scene-${scene} theme-${islandId}${scene === 'explore' && firstSong ? ` is-first-song${firstComplete ? ' is-first-complete' : ''}` : ''}`} ref={pageRef}><div className="island-shell">
    <header className="island-header"><button type="button" className="island-logo" onClick={home}><span>♫<i>✦</i></span><div>软糖乐队<small>SOUND ISLAND ADVENTURE</small></div></button><nav aria-label="游戏导航"><button type="button" aria-current={scene !== 'chart' ? 'page' : undefined} onClick={home}>声音探险</button><button type="button" aria-current={scene === 'chart' ? 'page' : undefined} onClick={chart}>旅途榜</button><a href="#/rhythm">节奏舞台 ↗</a></nav><div className="island-header-tools"><span>✦ {totalStars}</span><button type="button" aria-label={muted ? '开启声音' : '静音'} aria-pressed={muted} onClick={() => { setMuted(!muted); audioRef.current?.setMuted(!muted) }}>{muted ? '♩' : '♫'}</button><button ref={helpTriggerRef} type="button" aria-label="探险玩法" onClick={() => setHelp(true)}>?</button></div></header>

    {scene === 'intro' && <>
      <section className="island-intro"><div className="island-intro-copy"><span className="island-eyebrow"><i /> 一场会唱歌的小小冒险</span><h1 tabIndex={-1}>把走过的路，<br />变成一首<span>你的歌<i>♪</i></span></h1><p>跟着奶糖去小岛捡声音，<br />用一口袋旋律，接回走散的小伙伴。</p><div className="island-intro-chips"><span>↗ 规划路线</span><span>✿ 声音魔法</span><span>♫ 走路编曲</span></div><button type="button" className="island-primary" onClick={() => void start()} disabled={busy}>{busy ? '正在收拾小背包…' : '出发，接朋友回家！'}<span>↗</span></button><small className="island-intro-note">慢慢想，再出发。没有倒计时，也不用追音符 ♡</small></div><div className="island-intro-art"><img src="./assets/mochi-melody/band-hero.png" alt="四只可爱的小动物在花园里演奏，等待一起去声音小岛探险" /><span className="island-art-stamp">A LITTLE WALK<br />A LITTLE SONG <b>✿</b></span><div className="island-art-message"><span>♪</span><strong>沿途捡起的，都是好心情</strong><small>让你的路线，决定小岛的配乐</small></div></div></section>
      {shared && shared.islandId === islandId && <section className="island-shared"><span>✉</span><div><strong>朋友寄来了一段旅途小曲</strong><p>{shared.score.toLocaleString()} 分 · 接回 {shared.friends.length} 位伙伴 · {shared.day} 的同一张地图</p></div><button type="button" onClick={() => { if (listeningShared && musicOn) { setMusicOn(false); setListeningShared(false) } else { setListeningShared(true); void enableMusic() } }}>{listeningShared && musicOn ? '■ 停止试听' : '♫ 听听 TA 的小曲'}</button></section>}
      <section className="island-destinations"><div className="island-section-title"><div><span className="island-eyebrow">WHERE SHALL WE WANDER?</span><h2>今天想把歌，带去哪儿？ <span>✧</span></h2></div><small>{day} 航线 · 每天换一张地图</small></div><div className="island-destination-grid">{ISLANDS.map((item) => <button type="button" key={item.id} aria-pressed={islandId === item.id} className={`${islandId === item.id ? 'is-picked' : ''} ${totalStars < item.unlock ? 'is-locked' : ''}`} onClick={() => chooseIsland(item.id)}><span style={{ background: item.tint }}>{item.emoji}<i>♪</i></span><div><strong>{item.name}</strong><small>{item.mood}</small><b>{totalStars < item.unlock ? `✧ ${item.unlock} 星解锁` : `${starsText(progress[item.id]?.stars ?? 0)} · ${item.steps} 步起程`}</b></div><em>{islandId === item.id ? '✓' : totalStars < item.unlock ? '♡' : '↗'}</em></button>)}</div></section>
      <section className="island-how-strip"><div><b>01</b><strong>捡声音</strong><p>点相邻格子，沿途收集四种乐器。</p></div><div><b>02</b><strong>做选择</strong><p>声音用来接伙伴，也能换旅行魔法。</p></div><div><b>03</b><strong>开音乐会</strong><p>接齐伙伴，留几步回到营地。</p></div></section>
      <button type="button" className="island-board-entry" onClick={chart}><span>🏆</span><div><strong>同一张地图，走出不同的歌</strong><small>看看今天的旅途榜，发现更聪明的小路线。</small></div><b>去看看 ↗</b></button>
      <footer className="island-footer"><span>一步一音，一路好心情。♡</span><div><a href="#/rhythm">节奏舞台 / 自由编曲</a><a href="#/echo">回声花房</a></div><small>推荐戴耳机出发 ♪</small></footer>
    </>}

    {scene === 'explore' && <section className="island-expedition"><div className="island-expedition-title"><div><span className="island-eyebrow">YOUR WALK IS THE MELODY</span><h1 tabIndex={-1}>{firstSong ? firstComplete ? '听！小兔开始唱歌啦' : '点亮声音，让小兔唱起来' : `${island.emoji} ${island.name}`}</h1><p>{firstSong ? firstComplete ? '第一位朋友入队了，接着去找另外两位吧。' : '跟着发光的小格子点几下，就能叫醒泡芙。' : '点相邻格子捡声音，接齐朋友回小帐篷。'}</p></div><div className="island-step-counter" aria-label={firstSong ? `已点亮 ${Math.min(firstStep, 3)} 颗声音` : undefined}><small>{firstSong ? '已经点亮' : '还可以走'}</small><strong>{firstSong ? Math.min(firstStep, 3) : journey.steps}<span>{firstSong ? '颗' : '步'}</span></strong></div></div>
      <div className="island-game-layout"><div className="island-map-panel"><div className="island-map-toolbar">{firstSong && <strong className="island-first-prompt" role="status">{firstPrompt}</strong>}<span>✦ {journey.score} 旅途分</span><span>{journey.friends.length}/3 位伙伴</span><button type="button" className="island-pocket-shortcut" onClick={() => { setMagicOpen(true); pageRef.current?.querySelector('.island-pocket')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}>✿ 声音魔法 ↘</button>{journey.skip && <b>↗ 捷径已就绪</b>}{journey.bloom && <b>✿ 下一颗双倍</b>}</div><div className="island-map" role="group" aria-label={firstSong ? "第一首小曲，三行三列地图" : "声音小岛，五行五列地图"}><span className="island-map-cloud cloud-a">☁</span><span className="island-map-cloud cloud-b">☁</span><div className="island-map-grid">{visibleTiles.map((tile) => {
        const friend = FRIENDS.find((friend) => friend.cell === tile.cell)
        const picked = tile.collected
        const current = journey.position === tile.cell
        const available = reachable(journey, tile.cell) && (!firstSong || tile.cell === guidedTarget)
        const rescued = friend && journey.friends.includes(friend.lane)
        const visited = journey.actions.some((action) => action.type === 'move' && action.cell === tile.cell)
        const label = `第 ${Math.floor(tile.cell / 5) + 1} 行第 ${tile.cell % 5 + 1} 列，${current ? '奶糖在这里，' : ''}${tile.cell === HOME ? '小营地' : friend ? `${friend.name}，${rescued ? '已经入队' : '等待邀请'}` : tile.lane === null || picked ? '走过的小草地' : plantNames[tile.lane]}${available ? '，可以前往' : ''}`
        return <button type="button" key={tile.cell} className={`island-tile${available ? ' is-reachable' : ''}${tile.cell === guidedTarget ? ' is-guided' : ''}${current ? ' is-current' : ''}${picked ? ' is-collected' : ''}${friend ? ' is-friend' : ''}${tile.cell === HOME ? ' is-camp' : ''}`} aria-label={label} disabled={!available} onClick={() => takeAction({ type: 'move', cell: tile.cell })}>
          <span className="island-tile-ground" />{tile.cell === HOME ? <Camp /> : friend && !rescued ? <><Mascot lane={friend.lane} sleeping={firstSong && friend.lane === 1} /><span className="island-friend-tag">{friend.name}</span></> : tile.lane !== null && !picked ? <SoundPlant lane={tile.lane} /> : <span className="island-grass">{rescued ? '♡' : visited ? '· ·' : '❀'}</span>}
          {current && <span className="island-avatar" key={`player-${journey.actions.length}`}><Mascot lane={0} happy /><i>你</i></span>}{available && <span className="island-tile-dot">{journey.skip ? '↗' : '·'}</span>}{tile.cell === guidedTarget && <span className="island-tap-hint" aria-hidden="true"><i>☝</i>点我 ♪</span>}
        </button>
      })}</div><span className="island-map-label">{firstSong ? '一颗声音，叫醒一点点快乐' : 'SOFT LITTLE SOUNDS, EVERYWHERE'}</span></div><div className="island-map-legend">{plantNames.map((name, lane) => <span key={name}><i className={`voice-${lane}`}>{symbols[lane]}</i>{name}</span>)}</div><div className="island-event" role="status" key={journey.actions.length}><span>{journey.motifs > 0 ? '✦' : '♪'}</span>{journey.event}</div>
      {!firstSong && friendHere && <div className="island-invite-card"><Mascot lane={friendHere.lane} happy /><div><strong>{friendHere.name}，一起去野餐吧！</strong><p>需要 {symbols[friendHere.lane]} 一颗 TA 的声音 + 一颗任意声音</p></div><button type="button" disabled={!canInvite(journey, friendHere.lane)} onClick={() => takeAction({ type: 'invite' })}>邀请入队 ♡</button></div>}
      {canCelebrate && <button type="button" className="island-primary island-celebrate" onClick={() => takeAction({ type: 'finish' })}>小伙伴到齐，开场野餐音乐会！<span>♫</span></button>}
      {journey.steps === 0 && !canCelebrate && <div className="island-no-steps"><strong>今天的脚步走完啦 ♡</strong><p>{!journey.rested && journey.bag[2] > 0 ? '你还有午睡补给，使用后可以再走三步。' : '可以先邀请身边的伙伴，再收起旅途。下次试试捷径和补给，走得更远。'}</p></div>}
      {firstComplete && <section className="island-first-reward" role="status"><span><Mascot lane={1} happy /></span><div><strong>泡芙加入你的乐队啦！</strong><p>听见了吗？刚才点下的声音，已经变成了小曲。</p></div><button type="button" className="island-primary" onClick={() => setFirstSong(false)}>带小兔，去接更多朋友 <span>↗</span></button><button type="button" className="island-text-button" onClick={() => takeAction({ type: 'finish' })}>先保存这首小曲 ♡</button></section>}
      {firstSong && !firstComplete && <button type="button" className="island-first-skip" onClick={() => { setFirstSong(false); rememberFirstSong() }}>我会玩了，自由探索 ↗</button>}
      </div>{firstSong ? <aside className="island-first-companion"><div className={`island-sleepy-rabbit${firstComplete ? ' is-awake' : ''}`}><Mascot lane={1} happy={firstComplete} sleeping={!firstComplete} /><span>{firstComplete ? '♫' : 'Z z'}</span></div><span className="island-eyebrow">{firstComplete ? 'YOUR FIRST LITTLE BAND' : 'SOMEONE IS WAITING FOR YOUR SONG'}</span><h2>{firstComplete ? '谢谢你，我听见啦！' : '奶糖，来叫醒我吧 ♡'}</h2><p>{firstComplete ? '你点亮的每一颗声音，我都唱进歌里了。' : '点发光的格子，把沿途的声音带过来。'}</p><div className="island-first-dots" aria-label={`已完成 ${firstStep} / 4 步`}>{[0, 1, 2, 3].map((step) => <span key={step} className={firstStep > step ? 'is-done' : ''}>{firstStep > step ? '✓' : '♪'}</span>)}</div><small>{firstComplete ? '第一位朋友，已经就位 ♡' : '点几下，一起唱出第一首歌。'}</small></aside> : <aside className="island-backpack"><section className="island-pocket"><div className="island-panel-title"><span>✿</span><h2>声音小口袋</h2><small>一颗声音，一点魔法</small></div><div className="island-pocket-counts">{BAND.map((member, lane) => <div key={member.id} className={`voice-${lane}`}><span>{symbols[lane]}</span><strong>{journey.bag[lane]}</strong><small>{member.name}</small></div>)}</div><button type="button" className="island-magic-toggle" aria-expanded={magicOpen} onClick={() => setMagicOpen(!magicOpen)}>{magicOpen ? '收好魔法 ↑' : '想走得更远？试试声音魔法 ✦'}</button>{magicOpen && <div className="island-spells">{SPELLS.map((spell) => {
        const disabled = (journey.steps <= 0 && spell.id !== 'rest') || journey.bag[spell.lane] < 1 || (spell.id === 'skip' && journey.skip) || (spell.id === 'bloom' && journey.bloom) || (spell.id === 'rest' && journey.rested) || (spell.id === 'wind' && !journey.tiles.some((tile) => tile.lane !== null && !tile.collected && Math.abs(tile.cell % 5 - journey.position % 5) + Math.abs(Math.floor(tile.cell / 5) - Math.floor(journey.position / 5)) === 1))
        return <button type="button" key={spell.id} disabled={disabled} aria-label={`${spell.name}，消耗一颗${BAND[spell.lane].name}声音，${spell.detail}`} onClick={() => takeAction({ type: 'spell', id: spell.id })}><span className={`voice-${spell.lane}`}>{spell.symbol}</span><div><strong>{spell.name}{spell.id === 'rest' && journey.rested ? ' · 已用' : ''}</strong><small>{spell.detail}</small></div><b>{symbols[spell.lane]} ×1</b></button>
      })}</div>}<p>留两颗声音给小伙伴，或者换一次更聪明的走法？</p><button type="button" className="island-pocket-return" onClick={() => pageRef.current?.querySelector('.island-expedition-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>收好口袋，继续走 ↑</button></section>
      <section className="island-companions"><div className="island-panel-title"><span>♡</span><h2>一起去野餐</h2><small>接齐后回营地</small></div>{FRIENDS.map((friend) => <div key={friend.lane} className={journey.friends.includes(friend.lane) ? 'is-joined' : ''}><Mascot lane={friend.lane} happy={journey.friends.includes(friend.lane)} /><span><strong>{friend.name}</strong><small>{journey.friends.includes(friend.lane) ? '已经入队，和声 +1' : `${symbols[friend.lane]} + 任意一颗声音`}</small></span><b>{journey.friends.includes(friend.lane) ? '✓' : '♡'}</b></div>)}</section>
      <section className="island-mini-score"><div className="island-panel-title"><span>♫</span><h2>旅途正在成曲</h2><button type="button" onClick={() => { if (musicOn) setMusicOn(false); else void enableMusic() }}>{musicOn ? '■ 停止' : '▶ 听听'}</button></div><div className="island-melody-strip">{Array.from({ length: 16 }, (_, index) => {
        const note = journey.melody.slice(-16)[index]
        return <span key={index} className={`${note ? `voice-${note.lane}` : ''}${musicOn && beat === index ? ' is-sounding' : ''}`}>{note ? symbols[note.lane] : '·'}</span>
      })}</div><p>连捡三种不同声音 = 音乐花火<br />+60 分，恢复一步。已经绽放 {journey.motifs} 次 ✦</p></section>
      <button type="button" className="island-pack-up" onClick={() => takeAction({ type: 'finish' })}>收起这段旅途 ↗</button><p className="island-pack-note">随时收尾并保存；接齐三位伙伴回营地得三星。</p></aside>}</div>
    </section>}

    {scene === 'result' && <section className="island-result"><span className="island-eyebrow">EVERY JOURNEY HAS ITS OWN SONG</span><h1 tabIndex={-1}>{journey.won ? '走着走着，我们成了一支乐队！' : journey.friends.length ? '这条路，唱出了新的友谊' : '你的第一首旅途小曲，完成啦'}</h1><p>{island.name} · {day} 的声音故事</p><div className="island-result-band">{BAND.map((member, lane) => <div key={member.id} className={lane === 0 || journey.friends.includes(lane as Lane) ? 'is-joined' : ''}><Mascot lane={lane as Lane} happy={lane === 0 || journey.friends.includes(lane as Lane)} /><small>{lane === 0 || journey.friends.includes(lane as Lane) ? member.name : '下次见 ♡'}</small></div>)}</div><div className="island-result-card"><span className="island-result-stars">{starsText(journeyStars(journey))}</span><small>一路走出来的甜蜜</small><strong>{journey.score.toLocaleString()}</strong><div className="island-result-stats"><div><b>{journey.friends.length}<small>/3</small></b><span>接回的伙伴</span></div><div><b>{journey.collected}<small>/21</small></b><span>收集的声音</span></div><div><b>{journey.motifs}</b><span>音乐花火</span></div><div><b>{journey.steps}</b><span>剩余脚步</span></div></div><p>{journey.won ? `野餐音乐会奖励 400 分，剩余每步加 20 分。${totalStars >= 3 ? '新的小岛已经在等你了！' : '继续找找更聪明的路线吧。'}` : journey.friends.length === 3 ? '小伙伴已到齐，下次记得留几步回到营地，就能开三星音乐会。' : '下次试试换一条路，留两颗声音给小伙伴，或者用魔法走得更远。'}</p></div><div className="island-result-song"><span>♫ 这首小曲，是你一步一步写出来的</span><button type="button" onClick={() => { if (musicOn) setMusicOn(false); else void enableMusic() }}>{musicOn ? '■ 停止合奏' : '▶ 听听我的旅途'}</button><div className="island-melody-strip">{journey.melody.slice(-16).map((note, index) => <span key={index} className={`voice-${note.lane}${musicOn && beat === index ? ' is-sounding' : ''}`}>{symbols[note.lane]}</span>)}</div></div><IslandSubmit journey={journey} player={player} onPlayer={setPlayer} onBoard={chart} /><div className="island-result-actions"><button type="button" className="island-primary" disabled={busy} onClick={() => void start()}>同地图，换条路线 <span>↗</span></button><button type="button" className="island-secondary" onClick={() => void share()}>寄出旅途小曲 ✉</button></div><button type="button" className="island-text-button" onClick={home}>回去挑一座新岛</button></section>}

    {scene === 'chart' && <IslandBoard initialIsland={islandId} day={day} player={player} onChallenge={chooseIsland} />}
    {shareUrl && <div className="island-share-fallback"><label htmlFor="island-share">手动复制这段旅途 ♡</label><input id="island-share" readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} /></div>}
    {storageWarning && <p className="island-fine-print" role="status">浏览器暂时无法保存，本次旅途仍保留到离开页面。</p>}
  </div>{toast && <div className="island-toast" role="status">♡ {toast}</div>}
  {help && <div className="island-help-backdrop" onClick={() => { setHelp(false); helpTriggerRef.current?.focus() }}><section className="island-help" role="dialog" aria-modal="true" aria-label="声音探险玩法" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
    if (event.key !== 'Tab') return
    if (event.shiftKey && document.activeElement === closeHelpRef.current) { event.preventDefault(); lastHelpRef.current?.focus() }
    else if (!event.shiftKey && document.activeElement === lastHelpRef.current) { event.preventDefault(); closeHelpRef.current?.focus() }
  }}><button ref={closeHelpRef} type="button" className="island-help-close" aria-label="关闭探险玩法" onClick={() => { setHelp(false); helpTriggerRef.current?.focus() }}>×</button><Mascot lane={0} happy /><span className="island-eyebrow">奶糖的旅行小纸条</span><h2>走一条路，写一首歌</h2><ol><li><strong>点相邻格子，收集声音</strong><p>每移动一次消耗一步。走过的声音不会重复收集，会加入旅途配乐。</p></li><li><strong>口袋里的声音，有两种用法</strong><p>带着一颗 TA 的声音和一颗任意声音，走到伙伴身边就会自动入队。想走得更远，再展开声音魔法试试。</p></li><li><strong>留几步，带大家回营地</strong><p>接齐三位伙伴，走回小帐篷就会自动开音乐会，获得三星。接回一位得一星，两位得二星；随时可以收起旅途。</p></li></ol><p className="island-help-bonus">连续收集三种不同声音会绽放花火：+60 分，再送你一步。没有时间限制，先看路线再走 ♡</p><button ref={lastHelpRef} type="button" className="island-primary" onClick={() => { setHelp(false); helpTriggerRef.current?.focus() }}>明白啦，去捡好心情 <span>↗</span></button></section></div>}
  </main>
}

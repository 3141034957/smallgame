import { useEffect, useRef, useState } from 'react'
import { ISLANDS } from '@/features/island/rules.mjs'
import type { Journey } from '@/features/island/rules.mjs'
import { melodyRequest, savePlayer } from '@/features/melody/leaderboard'
import type { Board, Player, ScoreEntry } from '@/features/melody/leaderboard'

function Rank({ entry }: { entry: ScoreEntry }) {
  return <li className={entry.isYou ? 'is-you' : ''}><span>{entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}</span><div><strong>{entry.name}{entry.isYou && <b>你</b>}</strong><small>{'★'.repeat(entry.stars)}{'☆'.repeat(3 - entry.stars)} · 探索 {entry.accuracy.toFixed(0)}% · 花火 {entry.maxCombo}</small></div><strong>{entry.score.toLocaleString()}<small>旅途分</small></strong></li>
}

export function IslandBoard({ initialIsland, day, player, onChallenge }: { initialIsland: string; day: string; player: Player; onChallenge: (id: string) => void }) {
  const [id, setId] = useState(initialIsland)
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setBoard(null); setError(''); setLoading(true)
    void melodyRequest<Board>(`leaderboard?${new URLSearchParams({ island: id, day, playerId: player.id })}`, controller.signal, undefined, 'island').then((data) => {
      if (!controller.signal.aborted) setBoard(data)
    }).catch(() => { if (!controller.signal.aborted) setError('航线榜暂时连不上，本机旅途记录还在。') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [id, day, player.id, revision])
  return <section className="island-chart"><span className="island-eyebrow">SAME ISLAND · DIFFERENT LITTLE STORIES</span><h1 tabIndex={-1}>同一座岛，谁的旅途最精彩？</h1><p>{day} 航线 · 同地图规划路线，比探索、音乐花火和剩余脚步。</p><div className="island-chart-tabs" role="group" aria-label="航线榜小岛">{ISLANDS.map((island) => <button type="button" key={island.id} aria-pressed={id === island.id} onClick={() => setId(island.id)}>{island.emoji} {island.name}</button>)}</div><div className="island-chart-card"><div className="island-chart-title"><strong>{ISLANDS.find((island) => island.id === id)?.name}<small>{board ? `${board.total} 位声音旅行家` : '旅途最佳成绩'}</small></strong><button type="button" disabled={loading} onClick={() => setRevision((value) => value + 1)}>刷新 ↻</button></div>
    {loading && <div className="island-empty" role="status">✿<strong>风正在送来旅途记录…</strong></div>}
    {error && <div className="island-empty" role="status">☁<strong>{error}</strong><button type="button" onClick={() => setRevision((value) => value + 1)}>再试一次</button></div>}
    {board && <>{board.data.length ? <ol className="island-ranks">{board.data.map((entry) => <Rank key={entry.rank} entry={entry} />)}</ol> : <div className="island-empty">♡<strong>这张航线还没有故事，等你来写。</strong></div>}<div className="island-own-rank">{board.own ? <><span>你的最佳旅途</span><ol className="island-ranks"><Rank entry={board.own} /></ol></> : <p>完成探险后，填昵称留下你的旅途。</p>}</div></>}
    </div><button type="button" className="island-primary" onClick={() => onChallenge(id)}>去规划我的路线 <span>↗</span></button><p className="island-fine-print">每人每座岛每天保留最佳成绩，展示前 50 名和个人名次。<br />同分依次比较探索率、音乐花火、先达成的时间。</p></section>
}

export function IslandSubmit({ journey, player, onPlayer, onBoard }: { journey: Journey; player: Player; onPlayer: (player: Player) => void; onBoard: () => void }) {
  const [name, setName] = useState(player.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [rank, setRank] = useState<ScoreEntry | null>(null)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  return <div className="island-submit">{rank ? <div role="status"><strong>旅途已寄到航线榜 ♡</strong><p>当前第 {rank.rank} 名 · 最佳 {rank.score.toLocaleString()} 分</p><button type="button" onClick={onBoard}>看看同行的小伙伴 ↗</button></div> : <form onSubmit={(event) => {
    event.preventDefault()
    if (busy) return
    const trimmed = name.trim()
    if (!trimmed) { setError('先给自己起个小昵称吧 ♡'); return }
    const next = { ...player, name: trimmed }
    savePlayer(next); onPlayer(next)
    const controller = new AbortController(); request.current = controller
    setBusy(true); setError('')
    void melodyRequest<Board>('score', controller.signal, { islandId: journey.islandId, day: journey.day, actions: journey.actions, score: journey.score, name: trimmed, playerId: player.id }, 'island').then((data) => {
      if (!controller.signal.aborted) setRank(data.own)
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error && reason.name === 'Error' ? reason.message : '暂时寄不出去，本机成绩已保存，稍后可重试。') }).finally(() => { if (!controller.signal.aborted) setBusy(false) })
  }}><strong>把你的旅途，寄到今天的航线榜</strong><div><input aria-label="旅行家昵称" placeholder="你的可爱昵称" value={name} maxLength={12} disabled={busy} onChange={(event) => setName(event.target.value)} /><button type="submit" disabled={busy || journey.score === 0}>{busy ? '正在寄出…' : '留下旅途 ↗'}</button></div>{error && <p role="alert">{error}</p>}</form>}</div>
}

import { useEffect, useRef, useState } from 'react'
import { loadPlayer, melodyRequest, savePlayer } from '@/features/melody/leaderboard'
import type { Board } from '@/features/melody/leaderboard'
import type { FarmRound } from '@/features/farm/rules.mjs'
import './FarmBoard.css'

export function FarmBoard({ day, round }: { day: string; round?: FarmRound | null }) {
  const [player, setPlayer] = useState(loadPlayer)
  const [name, setName] = useState(player.name)
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [submittedRound, setSubmittedRound] = useState<FarmRound | null>(null)
  const boardRef = useRef<AbortController | null>(null)
  const submitRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    boardRef.current = controller
    setError('')
    void melodyRequest<Board>(`leaderboard?${new URLSearchParams({ day, playerId: player.id })}`, controller.signal, undefined, 'farm')
      .then((value) => { if (!controller.signal.aborted) setBoard(value) })
      .catch(() => { if (!controller.signal.aborted) setError('生存榜暂时连不上，点刷新再试一次。') })
    return () => controller.abort()
  }, [day, player.id, revision])

  useEffect(() => {
    setBusy(false)
    return () => submitRef.current?.abort()
  }, [round, day])

  const submitted = !!round && submittedRound === round
  return <section className="farm-board" aria-label="今日无限榜">
    <div className="farm-board-heading"><div><span>SURVIVOR CLUB</span><h2>🏆 今日无限榜</h2></div><button type="button" aria-label="刷新生存榜" disabled={busy} onClick={() => setRevision((value) => value + 1)}>↻</button></div>
    <p className="farm-board-caption">每日同一怪潮 · 无限生存 · 每人保留最高分</p>
    {round && round.score > 0 && (submitted ? <p role="status" className="farm-board-success">上榜啦！{board?.own && `今天第 ${board.own.rank} 名`}，下次冲得更高 ♡</p> : <form onSubmit={(event) => {
      event.preventDefault()
      if (busy) return
      if (!name.trim()) { setError('给你的乐手取个昵称吧。'); return }
      const next = { ...player, name: name.trim() }
      savePlayer(next); setPlayer(next)
      boardRef.current?.abort()
      const controller = new AbortController(); submitRef.current = controller
      setBusy(true); setError('')
      const submission = { day: round.day, frames: round.frames, choices: round.choices, surges: round.surges, score: round.score, playerId: next.id, name: next.name }
      void melodyRequest<Board>('score', controller.signal, submission, 'farm')
        .then((value) => { if (!controller.signal.aborted) { setBoard(value); setSubmittedRound(round) } })
        .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '暂时连不上，点上榜再试一次。') })
        .finally(() => { if (!controller.signal.aborted) setBusy(false) })
    }}>
      <label htmlFor="farm-player-name">留下这一局的战绩</label>
      <div><input id="farm-player-name" maxLength={12} value={name} onChange={(event) => setName(event.target.value)} disabled={busy} placeholder="你的乐手昵称" autoComplete="nickname" /><button type="submit" disabled={busy}>{busy ? '正在上榜…' : '上榜 ↗'}</button></div>
    </form>)}
    {error && <p role="alert" className="farm-board-error">{error}</p>}
    {!board && !error && <p role="status" className="farm-board-empty">乐手们的成绩正在赶来…</p>}
    {board && <>
      {board.data.length ? <ol>{board.data.slice(0, 10).map((entry) => <li key={entry.rank} className={entry.isYou ? 'is-you' : ''}>
        <span className="farm-board-rank">{entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}</span>
        <div><strong>{entry.name}{entry.isYou ? ' · 你' : ''}</strong><small>最高 {entry.maxCombo} 连击 <span aria-label={`${entry.stars} 星`}>{'★'.repeat(entry.stars)}</span></small></div>
        <b>{entry.score.toLocaleString()}<small>战斗分</small></b>
      </li>)}</ol> : <p className="farm-board-empty">今天的首位幸存者，等你来挑战 ♫</p>}
      {board.own && <p className="farm-board-own">你的最佳 {board.own.score.toLocaleString()} 分 · 第 {board.own.rank} / {board.total} 名</p>}
    </>}
    <p className="farm-board-note">当前浏览器记住你的昵称和上榜身份</p>
  </section>
}

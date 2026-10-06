import { useEffect, useRef, useState } from 'react'
import { loadPlayer, melodyRequest, savePlayer } from '@/features/melody/leaderboard'
import type { Board } from '@/features/melody/leaderboard'
import type { WaveRound } from '@/features/wave/rules.mjs'

export function WaveBoard({ day, round }: { day: string; round?: WaveRound | null }) {
  const [player, setPlayer] = useState(loadPlayer)
  const [name, setName] = useState(player.name)
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef<AbortController | null>(null)
  useEffect(() => () => submitRef.current?.abort(), [])
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    void melodyRequest<Board>(
      `leaderboard?${new URLSearchParams({ day, playerId: player.id })}`,
      controller.signal,
      undefined,
      'wave',
    )
      .then((value) => {
        if (!controller.signal.aborted) setBoard(value)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('排行榜暂时连不上，点击刷新重试。')
      })
    return () => controller.abort()
  }, [day, player.id, revision])
  return (
    <section className="wave-board">
      <div className="wave-section-head">
        <h2>🏆 今日音浪榜</h2>
        <button
          type="button"
          aria-label="刷新音浪榜"
          onClick={() => setRevision((value) => value + 1)}
        >
          ↻
        </button>
      </div>
      <p>同一片音符池 · 45 秒 · 每人保留最高分</p>
      {round && round.score > 0 && (
        <>
          {submitted ? (
            <p role="status" className="wave-submitted">
              上榜啦！{board?.own && `今日第 ${board.own.rank} 名`} ♡
            </p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (busy) return
                if (!name.trim()) {
                  setError('填一个昵称再上榜吧。')
                  return
                }
                const next = { ...player, name: name.trim() }
                savePlayer(next)
                setPlayer(next)
                const controller = new AbortController()
                submitRef.current = controller
                setBusy(true)
                setError('')
                void melodyRequest<Board>(
                  'score',
                  controller.signal,
                  { ...round, playerId: next.id, name: next.name },
                  'wave',
                )
                  .then((value) => {
                    if (!controller.signal.aborted) {
                      setBoard(value)
                      setSubmitted(true)
                    }
                  })
                  .catch((reason) => {
                    if (!controller.signal.aborted)
                      setError(reason instanceof Error ? reason.message : '暂时连不上，请重试。')
                  })
                  .finally(() => {
                    if (!controller.signal.aborted) setBusy(false)
                  })
              }}
            >
              <label htmlFor="wave-name">把这一局留在榜上</label>
              <div>
                <input
                  id="wave-name"
                  maxLength={12}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={busy}
                  placeholder="你的昵称"
                />
                <button type="submit" disabled={busy}>
                  {busy ? '正在上榜…' : '冲上榜 ↗'}
                </button>
              </div>
            </form>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {!board && !error && <p role="status">正在加载成绩…</p>}
      {board && (
        <>
          {board.data.length ? (
            <ol>
              {board.data.slice(0, 10).map((entry) => (
                <li key={entry.rank} className={entry.isYou ? 'is-you' : ''}>
                  <span>{entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}</span>
                  <div>
                    <strong>
                      {entry.name}
                      {entry.isYou ? ' · 你' : ''}
                    </strong>
                    <small>
                      {entry.maxCombo} 连唱 · {'★'.repeat(entry.stars)}
                    </small>
                  </div>
                  <b>{entry.score.toLocaleString()}</b>
                </li>
              ))}
            </ol>
          ) : (
            <p className="wave-empty">今天的第一场演出，等你开唱 ♪</p>
          )}
          {board.own && (
            <p className="wave-own">
              你在第 {board.own.rank} 名 · 最佳 {board.own.score.toLocaleString()} 分 · 共{' '}
              {board.total} 人
            </p>
          )}
        </>
      )}
    </section>
  )
}

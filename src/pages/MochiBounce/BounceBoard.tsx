import { useEffect, useRef, useState } from 'react'
import { melodyRequest, savePlayer } from '@/features/melody/leaderboard'
import type { Board, Player, ScoreEntry } from '@/features/melody/leaderboard'
import type { TourRound } from '@/features/bounce/tour.mjs'
import type { BounceRound } from '@/features/bounce/rules.mjs'

export function BounceRank({ entry }: { entry: ScoreEntry }) {
  return (
    <li className={entry.isYou ? 'is-you' : ''}>
      <span>{entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}</span>
      <div>
        <strong>
          {entry.name}
          {entry.isYou && <b>你</b>}
        </strong>
        <small>
          最高 {entry.maxCombo} 连击 · {'★'.repeat(entry.stars)}
          {'☆'.repeat(3 - entry.stars)}
        </small>
      </div>
      <em>{entry.score.toLocaleString()}</em>
    </li>
  )
}
export function BounceBoard({
  day,
  player,
  mode = 'classic',
  revision = 0,
  compact = false,
  onPlay,
}: {
  day: string
  player: Player
  mode?: string
  revision?: number
  compact?: boolean
  onPlay?: () => void
}) {
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setBoard(null)
    setError('')
    void melodyRequest<Board>(
      `leaderboard?${new URLSearchParams({ day, mode, playerId: player.id })}`,
      controller.signal,
      undefined,
      'bounce',
    )
      .then((data) => {
        if (!controller.signal.aborted) setBoard(data)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('今日榜暂时连不上，你的本机最佳成绩还在。')
      })
    return () => controller.abort()
  }, [day, mode, player.id, revision, refresh])
  return (
    <section className={`bounce-board${compact ? ' is-compact' : ''}`}>
      <div className="bounce-board-heading">
        <div>
          <span>🏆</span>
          <h2>{mode === 'tour' ? '今日演奏榜' : '今日弹弹榜'}</h2>
        </div>
        <button
          type="button"
          aria-label="刷新弹弹榜"
          onClick={() => setRefresh((value) => value + 1)}
        >
          ↻
        </button>
      </div>
      <p>{day} · 同地图、三次弹射，比谁连锁更漂亮。</p>
      {!board && !error && (
        <p role="status" className="bounce-board-empty">
          正在送来好成绩…
        </p>
      )}
      {error && (
        <div className="bounce-board-empty" role="status">
          <p>{error}</p>
          <button type="button" onClick={() => setRefresh((value) => value + 1)}>
            再试一次 ↻
          </button>
        </div>
      )}
      {board && (
        <>
          {board.data.length ? (
            <ol>
              {board.data.slice(0, compact ? 3 : 50).map((entry) => (
                <BounceRank key={entry.rank} entry={entry} />
              ))}
            </ol>
          ) : (
            <p className="bounce-board-empty">今天还没有人上榜，第一位会是你吗？ ♡</p>
          )}
          {board.own && (
            <div className="bounce-own-rank">
              <small>你的今日最佳 · 共 {board.total} 位玩家</small>
              <ol>
                <BounceRank entry={board.own} />
              </ol>
              {(() => {
                const above = [...board.data]
                  .reverse()
                  .find((entry) => entry.rank < board.own!.rank)
                return above ? (
                  <p>
                    再拿 {Math.max(0, above.score - board.own.score) + 1} 分，就能超过第{' '}
                    {above.rank} 名！
                  </p>
                ) : board.own.rank === 1 ? (
                  <p>你暂时领跑今天的花园！ ✦</p>
                ) : null
              })()}
            </div>
          )}
          {!compact && (
            <small className="bounce-board-foot">
              每人每天保留最佳成绩。展示前 50 名及个人名次；同分比较击中数量、最高连击和达成时间。
            </small>
          )}
        </>
      )}
      {onPlay && (
        <button type="button" className="bounce-primary" onClick={onPlay}>
          我来挑战一下 ↗
        </button>
      )}
    </section>
  )
}

export function BounceSubmit({
  round,
  player,
  onPlayer,
  onSubmitted,
}: {
  round: BounceRound | TourRound
  player: Player
  onPlayer: (next: Player) => void
  onSubmitted: () => void
}) {
  const [name, setName] = useState(player.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [rank, setRank] = useState<ScoreEntry | null>(null)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  return (
    <div className="bounce-submit">
      {rank ? (
        <p role="status">
          <strong>上榜啦！今日第 {rank.rank} 名 🏆</strong>
          <small>今日最佳 {rank.score.toLocaleString()} 分 · 再来一次，把名次往上弹！</small>
        </p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (busy) return
            const trimmed = name.trim()
            if (!trimmed) {
              setError('起个小昵称，就能上榜啦。')
              return
            }
            const next = { ...player, name: trimmed }
            savePlayer(next)
            onPlayer(next)
            const controller = new AbortController()
            request.current = controller
            setBusy(true)
            setError('')
            void melodyRequest<Board>(
              'score',
              controller.signal,
              {
                mode: 'mode' in round ? round.mode : 'classic',
                day: round.day,
                shots: round.shots,
                score: round.score,
                playerId: player.id,
                name: trimmed,
              },
              'bounce',
            )
              .then((data) => {
                if (!controller.signal.aborted) {
                  setRank(data.own)
                  onSubmitted()
                }
              })
              .catch((reason) => {
                if (!controller.signal.aborted)
                  setError(
                    reason instanceof Error && reason.name === 'Error'
                      ? reason.message
                      : '暂时连不上，成绩还在这里，稍后重试就好。',
                  )
              })
              .finally(() => {
                if (!controller.signal.aborted) setBusy(false)
              })
          }}
        >
          <label htmlFor="bounce-name">让你的连击，在今日榜上发光 ✦</label>
          <div>
            <input
              id="bounce-name"
              value={name}
              maxLength={12}
              disabled={busy}
              placeholder="你的可爱昵称"
              onChange={(event) => setName(event.target.value)}
            />
            <button type="submit" disabled={busy || round.score === 0}>
              {busy ? '正在上榜…' : '冲上排行榜 ↗'}
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </div>
  )
}

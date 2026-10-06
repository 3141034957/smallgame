import { useEffect, useRef, useState } from 'react'
import { SONGS, DIFFICULTIES } from '@/features/melody/engine'
import type { Difficulty } from '@/features/melody/engine'
import { melodyRequest, savePlayer } from '@/features/melody/leaderboard'
import type { Board, Player, ScoreEntry, Submission } from '@/features/melody/leaderboard'
import { Mascot } from './Mascot'

function Entry({ entry }: { entry: ScoreEntry }) {
  return (
    <li className={`mochi-rank-row${entry.isYou ? ' is-you' : ''}`}>
      <span className={`mochi-rank-number rank-${entry.rank}`}>
        {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : String(entry.rank).padStart(2, '0')}
      </span>
      <span className="mochi-rank-name">
        <strong>
          {entry.name}
          {entry.isYou && <b>你</b>}
        </strong>
        <small>
          {'★'.repeat(entry.stars)}
          {'☆'.repeat(3 - entry.stars)} · 准确度 {entry.accuracy.toFixed(1)}% · 连击{' '}
          {entry.maxCombo}
        </small>
      </span>
      <strong className="mochi-rank-score">
        {entry.score.toLocaleString()}
        <small>甜蜜分</small>
      </strong>
    </li>
  )
}

export function Leaderboard({
  initialSong,
  initialDifficulty,
  player,
  onChallenge,
}: {
  initialSong: number
  initialDifficulty: Difficulty
  player: Player
  onChallenge: (songIndex: number, difficulty: Difficulty) => void
}) {
  const [songIndex, setSongIndex] = useState(initialSong)
  const [difficulty, setDifficulty] = useState(initialDifficulty)
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setBoard(null)
    setError('')
    const query = new URLSearchParams({
      song: SONGS[songIndex].id,
      difficulty,
      playerId: player.id,
    })
    void melodyRequest<Board>(`leaderboard?${query}`, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setBoard(data)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error && !['TimeoutError', 'TypeError'].includes(reason.name)
              ? reason.message
              : '排行榜暂时连不上，你的本机成绩仍然保留。',
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [songIndex, difficulty, player.id, revision])

  return (
    <section className="mochi-leaderboard">
      <div className="mochi-board-hero">
        <div>
          <span className="mochi-section-kicker">THE SWEETEST LITTLE CHART</span>
          <h1 ref={headingRef} tabIndex={-1}>
            甜蜜排行榜 <span>✦</span>
          </h1>
          <p>同一首小曲，同一种节奏。看看谁和小伙伴最合拍？</p>
        </div>
        <Mascot lane={2} happy />
      </div>
      <div className="mochi-board-filters">
        <div role="group" aria-label="排行榜曲目">
          {SONGS.map((song, index) => (
            <button
              type="button"
              key={song.id}
              aria-pressed={songIndex === index}
              className={songIndex === index ? 'is-selected' : ''}
              onClick={() => setSongIndex(index)}
            >
              {song.emoji} {song.name}
            </button>
          ))}
        </div>
        <div role="group" aria-label="排行榜难度">
          {DIFFICULTIES.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={difficulty === item.id}
              className={difficulty === item.id ? 'is-selected' : ''}
              onClick={() => setDifficulty(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>
      <div className="mochi-board-card">
        <div className="mochi-board-title">
          <div>
            <strong>{SONGS[songIndex].name}</strong>
            <span>
              {DIFFICULTIES.find((item) => item.id === difficulty)?.name} ·{' '}
              {board ? `${board.total} 位小小音乐家` : '线上最佳成绩'}
            </span>
          </div>
          <button
            type="button"
            className="mochi-text-button"
            disabled={loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            刷新 ↻
          </button>
        </div>
        {loading && (
          <div className="mochi-board-empty" role="status">
            <span className="mochi-board-flower">✿</span>
            <strong>小伙伴正在整理成绩…</strong>
          </div>
        )}
        {error && (
          <div className="mochi-board-empty" role="status">
            <span className="mochi-board-flower">☁</span>
            <strong>稍等一下，云朵挡住了排行榜</strong>
            <p>{error}</p>
            <button
              type="button"
              className="mochi-secondary"
              onClick={() => setRevision((value) => value + 1)}
            >
              再试一次
            </button>
          </div>
        )}
        {!loading && board && (
          <>
            {board.data.length > 0 ? (
              <ol className="mochi-rank-list" aria-label="前 50 名演出成绩">
                {board.data.map((entry) => (
                  <Entry key={entry.rank} entry={entry} />
                ))}
              </ol>
            ) : (
              <div className="mochi-board-empty">
                <span className="mochi-board-flower">♡</span>
                <strong>第一位音乐家，会是你吗？</strong>
                <p>这里还没有成绩。完成正式演出，留下你的名字吧。</p>
              </div>
            )}
            <div className="mochi-own-rank">
              {board.own ? (
                <>
                  <span>你的最佳演出</span>
                  <ol className="mochi-rank-list">
                    <Entry entry={board.own} />
                  </ol>
                </>
              ) : (
                <p>你还没在这个榜单留下成绩，去开一场小演唱会吧 ♡</p>
              )}
            </div>
          </>
        )}
      </div>
      <div className="mochi-board-bottom">
        <button
          type="button"
          className="mochi-primary"
          onClick={() => onChallenge(songIndex, difficulty)}
        >
          去挑战这首小曲 <span>↗</span>
        </button>
        <p>
          每个浏览器每个榜单保留一个最佳成绩 · 展示前 50 名<br />
          同分时依次比较准确度、最长连击、先达成的时间。
        </p>
      </div>
    </section>
  )
}

export function SubmitScore({
  submission,
  player,
  onPlayer,
  onBoard,
}: {
  submission: Submission
  player: Player
  onPlayer: (player: Player) => void
  onBoard: () => void
}) {
  const [name, setName] = useState(player.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [board, setBoard] = useState<Board | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  useEffect(() => () => requestRef.current?.abort(), [])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy || board) return
    const nickname = name.trim().replace(/\s+/g, ' ').slice(0, 12)
    if (!nickname) {
      setError('给自己起一个小小昵称吧 ♡')
      return
    }
    const next = { ...player, name: nickname }
    savePlayer(next)
    onPlayer(next)
    const controller = new AbortController()
    requestRef.current = controller
    setBusy(true)
    setError('')
    try {
      const data = await melodyRequest<Board>('score', controller.signal, {
        ...submission,
        name: nickname,
        playerId: player.id,
      })
      if (!controller.signal.aborted) setBoard(data)
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error && !['TimeoutError', 'TypeError'].includes(reason.name)
            ? reason.message
            : '暂时无法上榜，本机成绩已保存。网络恢复后可以重试。',
        )
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }
  return (
    <section className="mochi-submit-score" aria-label="演出成绩上榜">
      {board?.own ? (
        <div className="mochi-submit-success" role="status">
          <span>✦</span>
          <div>
            <strong>已留下你的甜蜜成绩 ♡</strong>
            <p>
              当前排名第 {board.own.rank} 名 · 个人最佳 {board.own.score.toLocaleString()} 分
            </p>
          </div>
          <button type="button" className="mochi-text-button" onClick={onBoard}>
            看看榜单 ↗
          </button>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <div>
            <strong>把这场小演出，留在甜蜜榜上</strong>
            <p>同曲同难度比一比，更新时保留你的最佳成绩。</p>
          </div>
          <div className="mochi-nickname-row">
            <label className="sr-only" htmlFor="mochi-nickname">
              上榜昵称
            </label>
            <input
              id="mochi-nickname"
              value={name}
              maxLength={12}
              autoComplete="nickname"
              placeholder="你的可爱昵称"
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
            <button
              type="submit"
              className="mochi-secondary"
              disabled={busy || submission.score === 0}
            >
              {busy ? '正在上榜…' : '留下成绩 ↗'}
            </button>
          </div>
          {submission.score === 0 && <p>先接住一个音符，再来留下成绩吧 ♡</p>}
          {error && (
            <p className="mochi-submit-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  )
}

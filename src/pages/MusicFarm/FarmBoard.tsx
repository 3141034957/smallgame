import { FARM_RULESET } from '@/features/farm/monsters.mjs'
import { useAccount } from '@/features/auth/context'
import { activeAccountId } from '@/utils/accountStorage'
import { useCallback, useEffect, useRef, useState } from 'react'
import { farmRequest } from '@/features/farm/leaderboard'
import type { Board } from '@/features/farm/leaderboard'
import { FARM_CHARACTERS } from '@/features/farm/characters'
import type { FarmRound } from '@/features/farm/rules.mjs'
import { migrateCharacterId } from '@/features/farm/characterRoster.mjs'
import './FarmBoard.css'

import {
  getOrCreatePlayerId,
  getStoredNickname,
  MAX_NAME_LENGTH,
  normalizeNickname,
  saveNickname,
} from '@/utils/playerIdentity'

const avatarFor = (characterId: string | undefined) =>
  FARM_CHARACTERS.find((character) => character.id === migrateCharacterId(characterId)) ??
  FARM_CHARACTERS[0]

// `compact` renders the read-only board that greets players on the start screen:
// heading, scrollable top list — no submit form.
export function FarmBoard({
  round,
  characterId,
  compact = false,
}: {
  round?: FarmRound | null
  characterId?: string
  compact?: boolean
}) {
  const account = useAccount()
  const authenticated = account ? !!account.user : !!activeAccountId()
  const [guestId] = useState(getOrCreatePlayerId)
  const playerId = account?.user?.id ?? activeAccountId() ?? guestId
  const [name, setName] = useState(getStoredNickname)
  const [draft, setDraft] = useState('')
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [submittedRound, setSubmittedRound] = useState<FarmRound | null>(null)
  const boardRef = useRef<AbortController | null>(null)
  const submitRef = useRef<AbortController | null>(null)
  const attempted = useRef<FarmRound | null>(null)

  // StrictMode replays setup after cleanup; a cancelled attempt must be allowed
  // to restart, and its old promise must not clear a newer request's busy state.
  useEffect(() => {
    setBusy(false)
    return () => {
      submitRef.current?.abort()
      submitRef.current = null
      attempted.current = null
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    boardRef.current = controller
    setError('')
    setBoard(null)
    void farmRequest<Board>(`leaderboard?${new URLSearchParams({ playerId })}`, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setBoard(value)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('生存榜暂时连不上，点刷新再试一次。')
      })
    return () => controller.abort()
  }, [playerId, revision])

  const submitted = !!round && submittedRound === round
  const submit = useCallback(
    (nickname: string, target: FarmRound | null | undefined) => {
      if (!authenticated || !target || submitRef.current) return
      const next = normalizeNickname(nickname)
      if (!next) {
        setError('给你的乐手取个昵称吧。')
        return
      }
      saveNickname(next)
      attempted.current = target
      setName(next)
      boardRef.current?.abort()
      const controller = new AbortController()
      submitRef.current = controller
      setBusy(true)
      setError('')
      const submission = {
        ruleset: FARM_RULESET,
        day: target.day,
        frames: target.frames,
        choices: target.choices,
        surges: target.surges,
        permanent: target.permanent,
        score: target.score,
        playerId,
        name: next,
        characterId: characterId ?? '',
      }
      void farmRequest<Board>('score', controller.signal, submission)
        .then((value) => {
          if (!controller.signal.aborted) {
            setBoard(value)
            setSubmittedRound(target)
          }
        })
        .catch((reason) => {
          if (!controller.signal.aborted)
            setError(reason instanceof Error ? reason.message : '暂时连不上，再试一次。')
        })
        .finally(() => {
          if (submitRef.current === controller) {
            submitRef.current = null
            setBusy(false)
          }
        })
    },
    [playerId, characterId, authenticated],
  )

  // A player who already picked a nickname is on the board the moment the run
  // ends; a failure is retried from the button, never in a loop.
  const submitNow = useRef(submit)
  submitNow.current = submit
  useEffect(() => {
    if (!authenticated || compact || !round || round.score <= 0 || !name) return
    if (attempted.current === round) return
    // Through a ref: the submission itself must not be cancelled by the state
    // updates it triggers.
    submitNow.current(name, round)
  }, [round, name, compact, authenticated, playerId])

  return (
    <section className={`farm-board${compact ? ' is-compact' : ''}`} aria-label="无限总榜">
      <div className="farm-board-heading">
        <div>
          <span>SURVIVOR CLUB</span>
          <h2>🏆 无限总榜</h2>
        </div>
        {!compact && <em>TOP {board?.total ?? '—'}</em>}
        <button
          type="button"
          aria-label="刷新生存榜"
          disabled={busy}
          onClick={() => setRevision((value) => value + 1)}
        >
          ↻
        </button>
      </div>
      {!compact && <p className="farm-board-caption">历史总排名 · 每位乐手只保留最高分</p>}
      {!compact && round && !authenticated && (
        <div className="farm-board-guest">
          <p>这一局的金币和成长已保存在本机。注册账号，把进度保存到云端。</p>
          <button onClick={() => account?.openAccount('register')}>注册并保存本局进度</button>
          <button onClick={() => account?.openAccount('login')}>已有账号，登录恢复</button>
          <small>不注册也可以继续玩；上榜需要登录。</small>
        </div>
      )}
      {!compact &&
        round &&
        round.score > 0 &&
        authenticated &&
        (submitted ? (
          <p role="status" className="farm-board-success">
            上榜啦！{board?.own && `总榜第 ${board.own.rank} 名`}，下次冲得更高 ♡
          </p>
        ) : (
          !name && (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                submit(draft || name, round)
              }}
            >
              <label htmlFor="farm-player-name">取个昵称，把这一局送上总榜</label>
              <div>
                <input
                  id="farm-player-name"
                  maxLength={MAX_NAME_LENGTH}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  disabled={busy}
                  placeholder="你的乐手昵称"
                  autoComplete="nickname"
                />
                <button type="submit" disabled={busy}>
                  {busy ? '正在上榜…' : '上榜 ↗'}
                </button>
              </div>
            </form>
          )
        ))}
      {!compact && round && round.score > 0 && authenticated && !submitted && name && error && (
        <button
          type="button"
          className="farm-board-retry"
          disabled={busy}
          onClick={() => submit(name, round)}
        >
          {busy ? '正在上榜…' : '重新上榜 ↗'}
        </button>
      )}
      {error && (
        <p role="alert" className="farm-board-error">
          {error}
        </p>
      )}
      {!board && !error && (
        <p role="status" className="farm-board-empty">
          乐手们的成绩正在赶来…
        </p>
      )}
      {board && (
        <>
          <div className="farm-board-columns" aria-hidden="true">
            <span>角色</span>
            <span>名次</span>
            <span>玩家</span>
            <span>分数</span>
          </div>
          <ol className="farm-board-list">
            {board.data.length ? (
              board.data.slice(0, 10).map((entry) => {
                const avatar = avatarFor(entry.characterId)
                return (
                  <li key={entry.rank} className={entry.isYou ? 'is-you' : ''}>
                    <span className="farm-board-avatar">
                      <img src={avatar.image} alt="" loading="lazy" />
                    </span>
                    <span className="farm-board-rank">
                      {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}
                    </span>
                    <strong>{entry.name}</strong>
                    <b>{entry.score.toLocaleString()}</b>
                  </li>
                )
              })
            ) : (
              <li className="farm-board-empty">总榜首位幸存者，等你来挑战 ♫</li>
            )}
          </ol>
          {board.own && !compact && (
            <p className="farm-board-own">
              你在总榜第 {board.own.rank} / {board.total} 名
            </p>
          )}
        </>
      )}
    </section>
  )
}

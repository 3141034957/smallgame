import { FARM_RULESET } from '@/features/farm/monsters.mjs'
import { useAccount } from '@/features/auth/context'
import { activeAccountId } from '@/utils/accountStorage'
import { useCallback, useEffect, useRef, useState } from 'react'
import { farmRequest } from '@/features/farm/leaderboard'
import type { Board } from '@/features/farm/leaderboard'
import { FARM_CHARACTERS, FARM_DEFAULT_CHARACTER } from '@/features/farm/characters'
import type { FarmRound } from '@/features/farm/rules.mjs'
import { migrateCharacterId } from '@/features/farm/characterRoster.mjs'
import './FarmBoard.css'
import { Icon } from './icons'

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
  const [storedName, setStoredName] = useState(getStoredNickname)
  // A signed-in player is ranked under the account name: there is nothing to
  // type, and the run goes on the board as soon as it ends.
  const name = account?.user?.username ?? storedName
  const [draft, setDraft] = useState('')
  const [board, setBoard] = useState<Board | null>(null)
  // Reading the board and uploading a run are independent: a refresh must
  // never clear the result of an upload (or it would hide the retry button of
  // a run that was never accepted by the server).
  const [boardError, setBoardError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [submittedRound, setSubmittedRound] = useState<FarmRound | null>(null)
  const boardRef = useRef<AbortController | null>(null)
  const submitRef = useRef<AbortController | null>(null)
  const attempted = useRef<FarmRound | null>(null)

  // StrictMode replays setup after cleanup. An in-flight score is never
  // aborted: cancelling the fetch does not undo a request the server already
  // handled, and `attempted` survives the replay so the run is posted once.
  useEffect(() => {
    setBusy(false)
    return () => {
      submitRef.current = null
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    boardRef.current = controller
    setBoardError('')
    setBoard(null)
    void farmRequest<Board>(`leaderboard?${new URLSearchParams({ playerId })}`, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setBoard(value)
      })
      .catch(() => {
        if (!controller.signal.aborted) setBoardError('连不上，点刷新重试')
      })
    return () => controller.abort()
  }, [playerId, revision])

  const submitted = !!round && submittedRound === round
  const submit = useCallback(
    (nickname: string, target: FarmRound | null | undefined) => {
      if (!authenticated || !target || submitRef.current) return
      const next = normalizeNickname(nickname || account?.user?.username || '')
      if (!next) {
        setSubmitError('先填昵称')
        return
      }
      saveNickname(next)
      attempted.current = target
      setStoredName(next)
      boardRef.current?.abort()
      const controller = new AbortController()
      submitRef.current = controller
      setBusy(true)
      setSubmitError('')
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
        // A voluntary stop is part of the replay: the server has to know the
        // band was still alive when the player banked the run.
        retired: target.retired === true,
        // The member is frozen into the run: switching characters in the shop
        // after it must not change the loadout this replay is checked against.
        // An empty member would replay as a legacy run without an opening
        // instrument and fail verification, so always name the member.
        characterId: target.characterId || characterId || FARM_DEFAULT_CHARACTER,
      }
      void farmRequest<Board>('score', controller.signal, submission)
        .then((value) => {
          if (!controller.signal.aborted) {
            setBoard(value)
            setSubmittedRound(target)
            setSubmitError('')
          }
        })
        .catch((reason) => {
          if (!controller.signal.aborted)
            setSubmitError(reason instanceof Error ? reason.message : '连不上，重试')
        })
        .finally(() => {
          if (submitRef.current === controller) {
            submitRef.current = null
            setBusy(false)
          }
        })
    },
    [playerId, characterId, authenticated, account?.user?.username],
  )

  // A player who already picked a nickname is on the board the moment the run
  // ends; a failure is retried from the button, never in a loop.
  const submitNow = useRef(submit)
  submitNow.current = submit
  useEffect(() => {
    if (!authenticated || compact || !round || round.score <= 0) return
    if (!account?.user?.username && !storedName) return
    if (attempted.current === round) return
    // Through a ref: the submission itself must not be cancelled by the state
    // updates it triggers.
    submitNow.current(name, round)
  }, [round, name, storedName, compact, authenticated, playerId, account?.user?.username])

  // Everything about *this* run lives in `.farm-board-status`, everything about
  // the ranking itself in `.farm-board-ladder`: narrow screens drop the ladder
  // without hiding the upload state.
  const showStatus = !compact && !!round && round.score > 0
  const needsName = !account?.user?.username && !storedName
  const nameForm = (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit(draft || name, round)
      }}
    >
      <label htmlFor="farm-player-name">昵称</label>
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
        <button type="submit" disabled={busy} aria-label="上榜">
          <Icon name="upgrade" /> 上榜
        </button>
      </div>
    </form>
  )
  // One thing at a time, most important first: the player always knows what
  // happened to the run they just finished.
  const status = (() => {
    if (!showStatus) return null
    if (submitted)
      return (
        <p role="status" className="farm-board-success">
          {board?.own ? `总榜第 ${board.own.rank} 名` : '已上榜'}
        </p>
      )
    if (busy)
      return (
        <p role="status" className="farm-board-pending">
          正在上榜…
        </p>
      )
    if (!authenticated)
      return (
        <div className="farm-board-guest">
          <button
            type="button"
            aria-label="登录后可把本局成绩提交到生存榜"
            onClick={() => account?.openAccount()}
          >
            登录
          </button>
          <small>上榜需登录</small>
        </div>
      )
    if (submitError)
      return (
        <>
          <p role="alert" className="farm-board-error">
            {submitError}
          </p>
          {/* Without a nickname the retry would fail the same way, so the form
              stays open instead of offering a button that cannot work. */}
          {needsName ? (
            nameForm
          ) : (
            <button
              type="button"
              className="farm-board-retry"
              disabled={busy}
              aria-label="重新提交本局成绩到生存榜"
              onClick={() => submit(name, round)}
            >
              <Icon name="upgrade" /> 重新上榜
            </button>
          )}
        </>
      )
    if (needsName) return nameForm
    return null
  })()

  return (
    <section className={`farm-board${compact ? ' is-compact' : ''}`} aria-label="无限总榜">
      <div className="farm-board-ladder">
        <div className="farm-board-heading">
          <div>
            <span>SURVIVOR CLUB</span>
            <h2>
              <Icon name="board" /> 无限总榜
            </h2>
          </div>
          {!compact && <em>TOP {board?.total ?? '—'}</em>}
          <button
            type="button"
            aria-label="刷新生存榜"
            disabled={busy}
            onClick={() => setRevision((value) => value + 1)}
          >
            <Icon name="refresh" />
          </button>
        </div>
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
                <li className="farm-board-empty">等你上榜</li>
              )}
            </ol>
            {board.own && !compact && (
              <p className="farm-board-own">
                你在总榜第 {board.own.rank} / {board.total} 名
              </p>
            )}
          </>
        )}
        {boardError && (
          <p role="alert" className="farm-board-error">
            {boardError}
          </p>
        )}
        {!board && !boardError && (
          <p role="status" className="farm-board-empty">
            载入中…
          </p>
        )}
      </div>
      <div className="farm-board-status">{status}</div>
    </section>
  )
}

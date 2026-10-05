import { useCallback, useEffect, useRef, useState } from 'react'
import { melodyRequest } from '@/features/melody/leaderboard'
import type { Board } from '@/features/melody/leaderboard'
import { FARM_CHARACTERS } from '@/features/farm/characters'
import type { FarmRound } from '@/features/farm/rules.mjs'
import './FarmBoard.css'

// Identity follows the reference project: a stable player id plus a nickname,
// both kept in this browser, so a returning player never types a name twice.
const PLAYER_ID_STORAGE_KEY = 'clockwork-player-id-v1'
const NICKNAME_STORAGE_KEY = 'clockwork-player-nickname-v1'
const LEGACY_PLAYER_KEY = 'mochi-melody-player-v1'
const MAX_NAME_LENGTH = 12

const read = (key: string) => {
  try { return localStorage.getItem(key) } catch { return null }
}
const write = (key: string, value: string) => {
  try { localStorage.setItem(key, value) } catch { /* Storage is optional. */ }
}

function createCompatiblePlayerId() {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  } catch {
    // Some browsers expose randomUUID but block it on non-HTTPS origins.
  }
  const bytes = new Uint8Array(16)
  if (typeof globalThis.crypto?.getRandomValues === 'function') globalThis.crypto.getRandomValues(bytes)
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'))
  return [hex.slice(0, 4).join(''), hex.slice(4, 6).join(''), hex.slice(6, 8).join(''), hex.slice(8, 10).join(''), hex.slice(10).join('')].join('-')
}

// Players from the earlier build keep their id and name on the first visit.
function readLegacyPlayer() {
  try {
    const stored = JSON.parse(read(LEGACY_PLAYER_KEY) ?? 'null')
    return stored && typeof stored.id === 'string' ? { id: stored.id, name: typeof stored.name === 'string' ? stored.name : '' } : null
  } catch { return null }
}

function getOrCreatePlayerId() {
  const stored = read(PLAYER_ID_STORAGE_KEY)
  if (stored) return stored
  const legacy = readLegacyPlayer()
  if (legacy?.id) { write(PLAYER_ID_STORAGE_KEY, legacy.id); return legacy.id }
  const playerId = createCompatiblePlayerId()
  write(PLAYER_ID_STORAGE_KEY, playerId)
  return playerId
}

function getStoredNickname() {
  const stored = read(NICKNAME_STORAGE_KEY)?.trim()
  if (stored) return stored.slice(0, MAX_NAME_LENGTH)
  return readLegacyPlayer()?.name.trim().slice(0, MAX_NAME_LENGTH) ?? ''
}

const avatarFor = (characterId: string | undefined) =>
  FARM_CHARACTERS.find((character) => character.id === characterId) ?? FARM_CHARACTERS[0]

// `compact` renders the read-only board that greets players on the start screen:
// heading, scrollable top list — no submit form.
export function FarmBoard({ round, characterId, compact = false }: { round?: FarmRound | null; characterId?: string; compact?: boolean }) {
  const [playerId] = useState(getOrCreatePlayerId)
  const [name, setName] = useState(getStoredNickname)
  const [draft, setDraft] = useState('')
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
    setBoard(null)
    void melodyRequest<Board>(`leaderboard?${new URLSearchParams({ playerId })}`, controller.signal, undefined, 'farm')
      .then((value) => { if (!controller.signal.aborted) setBoard(value) })
      .catch(() => { if (!controller.signal.aborted) setError('生存榜暂时连不上，点刷新再试一次。') })
    return () => controller.abort()
  }, [playerId, revision])

  const submitted = !!round && submittedRound === round
  const submit = useCallback((nickname: string, target: FarmRound | null | undefined) => {
    if (!target || busy) return
    const next = nickname.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH)
    if (!next) { setError('给你的乐手取个昵称吧。'); return }
    write(NICKNAME_STORAGE_KEY, next); setName(next)
    boardRef.current?.abort()
    const controller = new AbortController(); submitRef.current = controller
    setBusy(true); setError('')
    const submission = { day: target.day, frames: target.frames, choices: target.choices, surges: target.surges, score: target.score, playerId, name: next, characterId: characterId ?? '' }
    void melodyRequest<Board>('score', controller.signal, submission, 'farm')
      .then((value) => { if (!controller.signal.aborted) { setBoard(value); setSubmittedRound(target) } })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '暂时连不上，再试一次。') })
      .finally(() => { if (!controller.signal.aborted) setBusy(false) })
  }, [busy, playerId, characterId])

  // A player who already picked a nickname is on the board the moment the run
  // ends; a failure is retried from the button, never in a loop.
  const attempted = useRef<FarmRound | null>(null)
  const submitNow = useRef(submit)
  submitNow.current = submit
  useEffect(() => {
    if (compact || !round || round.score <= 0 || !name) return
    if (attempted.current === round) return
    attempted.current = round
    // Through a ref: the submission itself must not be cancelled by the state
    // updates it triggers.
    submitNow.current(name, round)
  }, [round, name, compact])
  useEffect(() => () => submitRef.current?.abort(), [])

  return <section className={`farm-board${compact ? ' is-compact' : ''}`} aria-label="无限总榜">
    <div className="farm-board-heading"><div><span>SURVIVOR CLUB</span><h2>🏆 无限总榜</h2></div>{compact ? <button type="button" aria-label="刷新生存榜" onClick={() => setRevision((value) => value + 1)}>↻</button> : <em>TOP {board?.total || 100}</em>}</div>
    {!compact && <p className="farm-board-caption">历史总排名 · 每位乐手只保留最高分</p>}
    {!compact && round && round.score > 0 && (submitted ? <p role="status" className="farm-board-success">上榜啦！{board?.own && `总榜第 ${board.own.rank} 名`}，下次冲得更高 ♡</p> : !name && <form onSubmit={(event) => { event.preventDefault(); submit(draft || name, round) }}>
      <label htmlFor="farm-player-name">取个昵称，把这一局送上总榜</label>
      <div><input id="farm-player-name" maxLength={MAX_NAME_LENGTH} value={draft} onChange={(event) => setDraft(event.target.value)} disabled={busy} placeholder="你的乐手昵称" autoComplete="nickname" /><button type="submit" disabled={busy}>{busy ? '正在上榜…' : '上榜 ↗'}</button></div>
    </form>)}
    {!compact && !submitted && name && error && <button type="button" className="farm-board-retry" disabled={busy} onClick={() => submit(name, round)}>{busy ? '正在上榜…' : '重新上榜 ↗'}</button>}
    {error && <p role="alert" className="farm-board-error">{error}</p>}
    {!board && !error && <p role="status" className="farm-board-empty">乐手们的成绩正在赶来…</p>}
    {board && <>
      <div className="farm-board-columns" aria-hidden="true"><span>角色</span><span>名次</span><span>玩家</span><span>分数</span></div>
      <ol className="farm-board-list">{board.data.length ? board.data.slice(0, 10).map((entry) => {
        const avatar = avatarFor(entry.characterId)
        return <li key={entry.rank} className={entry.isYou ? 'is-you' : ''}>
          <span className="farm-board-avatar"><img src={avatar.image} alt="" loading="lazy" /></span>
          <span className="farm-board-rank">{entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}</span>
          <strong>{entry.name}</strong>
          <b>{entry.score.toLocaleString()}</b>
        </li>
      }) : <li className="farm-board-empty">总榜首位幸存者，等你来挑战 ♫</li>}</ol>
      {board.own && !compact && <p className="farm-board-own">你在总榜第 {board.own.rank} / {board.total} 名</p>}
    </>}
  </section>
}

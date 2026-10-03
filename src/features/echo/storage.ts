import { DAILY_ROUNDS } from './daily'
import { CHAPTERS, decodeBoard, encodeBoard } from './engine'
import type { Board } from './engine'

export type EchoSkin = 'night' | 'print'

export type SavedSong = {
  code: string
  title: string
  savedAt: number
}

export type StoryProgress = {
  board: Board
  chapter: number
}

export type DailyProgress = {
  board: Board
  round: number
}

export type DailyRecord = {
  date: string
  score: number
}

const LEGACY_SONG_KEY = 'echo-garden-last-song-v1'
const COLLECTION_KEY = 'echo-garden-collection-v1'
const SKIN_KEY = 'echo-garden-skin-v1'
const MUTED_KEY = 'echo-garden-muted-v1'
const STORY_KEY = 'echo-garden-story-v1'
const COLLECTION_LIMIT = 12
const HISTORY_DAYS = 7

const dailyProgressKey = (date: string) => `echo-garden-daily-progress-v1-${date}`
const dailyBestKey = (date: string) => `echo-garden-daily-best-v1-${date}`

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // A private-browsing session can still play; it just forgets afterwards.
  }
}

function removeRaw(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function shiftDate(date: string, days: number): string {
  if (!DATE_PATTERN.test(date)) return date
  const timestamp = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(timestamp)) return date
  return new Date(timestamp + days * 86_400_000).toISOString().slice(0, 10)
}

function isSavedSong(value: unknown): value is SavedSong {
  if (!value || typeof value !== 'object') return false
  const song = value as Partial<SavedSong>
  return typeof song.code === 'string'
    && typeof song.title === 'string'
    && typeof song.savedAt === 'number'
    && decodeBoard(song.code) !== null
}

/** Songs are kept newest first, and the very first one adopts the legacy slot. */
export function readCollection(): SavedSong[] {
  const raw = readRaw(COLLECTION_KEY)
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.filter(isSavedSong).slice(0, COLLECTION_LIMIT)
      }
    } catch {
      // A corrupted list is replaced by whatever the player saves next.
    }
    return []
  }

  const legacyBoard = decodeBoard(readRaw(LEGACY_SONG_KEY) ?? '')
  if (!legacyBoard) return []
  const migrated: SavedSong[] = [{ code: encodeBoard(legacyBoard), title: '花房 1', savedAt: 0 }]
  writeRaw(COLLECTION_KEY, JSON.stringify(migrated))
  return migrated
}

function writeCollection(songs: SavedSong[]): SavedSong[] {
  const next = songs.slice(0, COLLECTION_LIMIT)
  writeRaw(COLLECTION_KEY, JSON.stringify(next))
  return next
}

function nextSongTitle(songs: SavedSong[]): string {
  const highest = songs.reduce((max, song) => {
    const match = /^花房 (\d+)$/.exec(song.title)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `花房 ${highest + 1}`
}

export function saveToCollection(board: Board): { collection: SavedSong[]; title: string; added: boolean; dropped: number } {
  const code = encodeBoard(board)
  const current = readCollection()
  const existing = current.find((song) => song.code === code)
  if (existing) return { collection: current, title: existing.title, added: false, dropped: 0 }

  const song: SavedSong = { code, title: nextSongTitle(current), savedAt: Date.now() }
  const merged = [song, ...current]
  const collection = writeCollection(merged)
  return { collection, title: song.title, added: true, dropped: merged.length - collection.length }
}

export function removeFromCollection(code: string): SavedSong[] {
  return writeCollection(readCollection().filter((song) => song.code !== code))
}

export function renameSong(code: string, title: string): SavedSong[] {
  const trimmed = title.trim().replace(/\s+/g, ' ')
  const current = readCollection()
  const target = current.find((song) => song.code === code)
  if (!target || !trimmed || trimmed === target.title) return current
  return writeCollection(current.map((song) => song.code === code ? { ...song, title: trimmed } : song))
}

export function readSkin(): EchoSkin {
  return readRaw(SKIN_KEY) === 'print' ? 'print' : 'night'
}

export function writeSkin(skin: EchoSkin): void {
  writeRaw(SKIN_KEY, skin)
}

export function readMuted(): boolean {
  return readRaw(MUTED_KEY) === 'true'
}

export function writeMuted(muted: boolean): void {
  writeRaw(MUTED_KEY, String(muted))
}

export function readStoryProgress(): StoryProgress | null {
  const raw = readRaw(STORY_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !('code' in parsed) || !('chapter' in parsed)) return null
    const { code, chapter } = parsed as { code: unknown; chapter: unknown }
    if (typeof code !== 'string' || typeof chapter !== 'number') return null
    if (!Number.isInteger(chapter) || chapter < 0 || chapter >= CHAPTERS.length) return null
    const board = decodeBoard(code)
    if (!board) return null
    return { board, chapter }
  } catch {
    return null
  }
}

export function writeStoryProgress(board: Board, chapter: number): void {
  writeRaw(STORY_KEY, JSON.stringify({ code: encodeBoard(board), chapter }))
}

export function clearStoryProgress(): void {
  removeRaw(STORY_KEY)
}

export function readDailyProgress(date: string): DailyProgress | null {
  const raw = readRaw(dailyProgressKey(date))
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !('code' in parsed) || !('round' in parsed)) return null
    const { code, round } = parsed as { code: unknown; round: unknown }
    if (typeof code !== 'string' || typeof round !== 'number') return null
    if (!Number.isInteger(round) || round < 0 || round > DAILY_ROUNDS) return null
    const board = decodeBoard(code)
    if (!board || board.filter(Boolean).length !== round) return null
    return { board, round }
  } catch {
    return null
  }
}

export function writeDailyProgress(date: string, board: Board, round: number): void {
  writeRaw(dailyProgressKey(date), JSON.stringify({ code: encodeBoard(board), round }))
}

export function readDailyBest(date: string): number {
  const score = Number(readRaw(dailyBestKey(date)))
  return Number.isInteger(score) && score > 0 ? score : 0
}

export function writeDailyBest(date: string, score: number): number {
  const best = Math.max(readDailyBest(date), score)
  writeRaw(dailyBestKey(date), String(best))
  return best
}

/** The last `days` days, oldest first, so a strip reads left to right. */
export function recentDailyBest(today: string, days = HISTORY_DAYS): DailyRecord[] {
  return Array.from({ length: days }, (_, index) => {
    const date = shiftDate(today, index - (days - 1))
    return { date, score: readDailyBest(date) }
  })
}

/** Consecutive days with a finished flower score. Today may still be unplayed. */
export function dailyStreak(today: string): number {
  let streak = 0
  for (let offset = 0; offset < 365; offset += 1) {
    if (readDailyBest(shiftDate(today, -offset)) > 0) {
      streak += 1
    } else if (offset > 0) {
      break
    }
  }
  return streak
}

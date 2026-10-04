import { describe, expect, it } from 'vitest'
import {
  DIFFICULTIES, SONGS, advanceRun, blankPattern, decodePattern, emptyProgress, emptyRun,
  encodePattern, hitNote, makeChart, parseProgress, presetPattern, runStars, saveRun, totalStars,
} from './engine'
import type { MelodyNote } from './engine'

describe('playable music charts', () => {
  it('keeps invitations deterministic and all notes inside the playable duration', () => {
    for (const song of SONGS) for (const difficulty of DIFFICULTIES) {
      const notes = makeChart(song, difficulty.id)
      expect(notes).toEqual(makeChart(song, difficulty.id))
      expect(notes.length).toBeGreaterThan(10)
      expect(notes.map((note) => note.id)).toEqual(notes.map((_, index) => index))
      expect(notes.every((note, index) => note.lane >= 0 && note.lane < 4 && note.time >= 4 * 60 / song.bpm && note.time + 0.22 < song.beats * 60 / song.bpm && (index === 0 || note.time >= notes[index - 1].time))).toBe(true)
      for (const lane of [0, 1, 2, 3]) {
        const laneNotes = notes.filter((note) => note.lane === lane)
        expect(laneNotes.length).toBeGreaterThan(0)
        expect(laneNotes.every((note, index) => index === 0 || note.time - laneNotes[index - 1].time > 0.22)).toBe(true)
      }
    }
  })

  it('introduces more notes and simultaneous lanes only in the party mode', () => {
    const [cozy, groove, party] = DIFFICULTIES.map(({ id }) => makeChart(SONGS[0], id))
    expect(cozy.length).toBeLessThan(groove.length)
    expect(groove.length).toBeLessThan(party.length)
    expect(new Set(cozy.map(({ time }) => time)).size).toBe(cozy.length)
    expect(new Set(groove.map(({ time }) => time)).size).toBe(groove.length)
    expect(new Set(party.map(({ time }) => time)).size).toBeLessThan(party.length)
    expect(makeChart(SONGS[0], 'cozy', true).length).toBeLessThan(cozy.length)
  })
})

describe('rhythm judgement', () => {
  const notes: MelodyNote[] = [{ id: 0, lane: 0, time: 2, midi: 48 }, { id: 1, lane: 1, time: 2, midi: 72 }, { id: 2, lane: 0, time: 3, midi: 48 }]

  it('judges separate simultaneous notes and prevents scoring a note twice', () => {
    const first = hitNote(emptyRun(), notes, 0, 2.02)
    expect(first.grade).toBe('perfect')
    expect(first.run.score).toBe(100)
    const second = hitNote(first.run, notes, 1, 2.14)
    expect(second.grade).toBe('good')
    expect(second.run.combo).toBe(2)
    const duplicate = hitNote(second.run, notes, 0, 2.03)
    expect(duplicate.note).toBeNull()
    expect(duplicate.run.perfect).toBe(1)
    expect(duplicate.run.score).toBe(140)
    expect(duplicate.run.ghosts).toBe(1)
    expect(duplicate.run.combo).toBe(0)
  })

  it('expires missed notes once, resets the combo, and retains the best combo', () => {
    let run = hitNote(emptyRun(), notes, 0, 2).run
    run = advanceRun(run, notes, 2.23)
    expect(run.misses).toBe(1)
    expect(run.combo).toBe(0)
    expect(run.maxCombo).toBe(1)
    expect(run.grades[1]).toBe('miss')
    expect(advanceRun(run, notes, 2.3)).toBe(run)
    expect(advanceRun(run, notes, 4).misses).toBe(2)
  })

  it('does not award an early or late press and chooses the nearest available note', () => {
    expect(hitNote(emptyRun(), notes, 0, 1.77).note).toBeNull()
    expect(hitNote(emptyRun(), notes, 0, 2.23).note).toBeNull()
    const nearby: MelodyNote[] = [{ id: 0, lane: 0, time: 1, midi: 48 }, { id: 1, lane: 0, time: 1.3, midi: 48 }]
    expect(hitNote(emptyRun(), nearby, 0, 1.19).note?.id).toBe(1)
  })

  it('awards stars for accuracy and penalizes button spamming', () => {
    const chart = makeChart(SONGS[0], 'cozy')
    let run = emptyRun()
    for (const note of chart) run = hitNote(run, chart, note.lane, note.time).run
    expect(runStars(run, chart.length)).toBe(3)
    expect(run.maxCombo).toBe(chart.length)
    expect(runStars({ ...run, ghosts: chart.length * 4 }, chart.length)).toBe(0)
    expect(runStars(emptyRun(), chart.length)).toBe(0)
    expect(runStars({ ...emptyRun(), good: 10 }, 10)).toBe(2)
    expect(runStars({ ...emptyRun(), perfect: 4 }, 10)).toBe(1)
  })
})

describe('small songs and local progress', () => {
  it('shares all sixteen steps in all four tracks without losing leading zeroes', () => {
    for (const pattern of [blankPattern(), ...[0, 1, 2].map(presetPattern)]) {
      expect(decodePattern(encodePattern(pattern))).toEqual(pattern)
    }
    const sparse = blankPattern()
    sparse[3][15] = true
    expect(encodePattern(sparse)).toBe('0000000000000001')
    expect(decodePattern(encodePattern(sparse))).toEqual(sparse)
    expect(decodePattern('invalid')).toBeNull()
    expect(decodePattern(null)).toBeNull()
    expect(() => encodePattern([[]])).toThrow()
  })

  it('keeps personal bests and awards each song/difficulty only its best stars', () => {
    const run = { ...emptyRun(), score: 500, perfect: 10 }
    const first = saveRun(emptyProgress(), SONGS[0], 'cozy', run, 10)
    expect(totalStars(first)).toBe(3)
    const replay = saveRun(first, SONGS[0], 'cozy', { ...run, score: 100, perfect: 5 }, 10)
    expect(totalStars(replay)).toBe(3)
    expect(replay.records['strawberry:cozy'].score).toBe(500)
    const next = saveRun(replay, SONGS[1], 'groove', run, 10)
    expect(totalStars(next)).toBe(6)
    expect(first.records).not.toHaveProperty('cloud:groove')
  })

  it('recovers safely from malformed progress and rejects fake or out-of-range records', () => {
    expect(parseProgress('broken')).toEqual(emptyProgress())
    expect(parseProgress('null')).toEqual(emptyProgress())
    expect(parseProgress(JSON.stringify({ offset: 400, lastMix: 'bad', records: { 'strawberry:cozy': { score: -1, stars: 99 }, other: { score: 3, stars: 3 } } }))).toEqual(emptyProgress())
    const progress = { ...emptyProgress(), offset: -70, lastMix: encodePattern(presetPattern(0)), records: { 'cloud:party': { score: 3000, stars: 2 } } }
    expect(parseProgress(JSON.stringify(progress))).toEqual(progress)
  })
})

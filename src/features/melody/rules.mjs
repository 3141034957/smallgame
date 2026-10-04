export const SONGS = [
  { id: 'strawberry', name: '草莓汽水', subtitle: '打开一罐，冒泡的好心情', bpm: 96, beats: 48, seed: 118, unlock: 0, color: '#f6d8d1', emoji: '🍓', melody: [72, 76, 79, 76, 74, 72, 69, 67] },
  { id: 'cloud', name: '云朵摇摇', subtitle: '让小小烦恼，跟着云飘走', bpm: 108, beats: 48, seed: 826, unlock: 1, color: '#e0dcf3', emoji: '☁', melody: [76, 79, 81, 79, 76, 74, 72, 74] },
  { id: 'starlight', name: '星星的晚安', subtitle: '最后一颗星，还想跳支舞', bpm: 120, beats: 64, seed: 314, unlock: 4, color: '#ddebdc', emoji: '✦', melody: [79, 81, 84, 81, 79, 76, 74, 72] },
]

export const DIFFICULTIES = [
  { id: 'cozy', name: '轻轻拍', description: '慢一点，第一次也能玩' },
  { id: 'groove', name: '摇摇摆', description: '跟着节拍，连起来！' },
  { id: 'party', name: '蹦蹦跳', description: '双音与半拍，小高手上场' },
]
export const PERFECT_WINDOW = 0.085
export const HIT_WINDOW = 0.22
export const NOTE_TRAVEL_SECONDS = 2.4

function randomGenerator(seed) {
  let value = seed >>> 0
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0
    return value / 4294967296
  }
}

export function makeChart(song, difficulty, practice = false) {
  const random = randomGenerator(song.seed)
  const notes = []
  const beatSeconds = 60 / song.bpm
  const totalBeats = practice ? 20 : song.beats
  let lastLane = 3
  for (let beat = 4; beat < totalBeats - 1; beat += difficulty === 'cozy' ? 2 : 1) {
    const lane = ((lastLane + 1 + Math.floor(random() * 3)) % 4)
    const midi = song.melody[Math.floor(beat / 2) % song.melody.length] + (lane === 2 ? -36 : lane === 3 ? 12 : 0)
    notes.push({ id: notes.length, lane, time: beat * beatSeconds, midi })
    lastLane = lane
    if (difficulty === 'party' && beat % 4 === 2) {
      const secondLane = ((lane + 2) % 4)
      notes.push({ id: notes.length, lane: secondLane, time: beat * beatSeconds, midi: song.melody[Math.floor(beat / 2) % song.melody.length] + (secondLane === 2 ? -36 : secondLane === 3 ? 12 : 0) })
    }
    if (difficulty === 'party' && beat % 2 === 1) {
      const halfLane = ((lane + 1) % 4)
      notes.push({ id: notes.length, lane: halfLane, time: (beat + 0.5) * beatSeconds, midi: song.melody[(Math.floor(beat / 2) + 1) % song.melody.length] + (halfLane === 2 ? -36 : halfLane === 3 ? 12 : 0) })
    }
  }
  return notes.sort((a, b) => a.time - b.time || a.id - b.id).map((note, id) => ({ ...note, id }))
}

export const emptyRun = () => ({ grades: {}, score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, misses: 0, ghosts: 0 })

export function advanceRun(run, notes, time) {
  const missed = notes.filter((note) => !run.grades[note.id] && time - note.time > HIT_WINDOW)
  if (!missed.length) return run
  const grades = { ...run.grades }
  missed.forEach((note) => { grades[note.id] = 'miss' })
  return { ...run, grades, misses: run.misses + missed.length, combo: 0 }
}

export function hitNote(run, notes, lane, time) {
  const updated = advanceRun(run, notes, time)
  const candidates = notes.filter((note) => note.lane === lane && !updated.grades[note.id] && Math.abs(time - note.time) <= HIT_WINDOW)
  const note = candidates.sort((a, b) => Math.abs(a.time - time) - Math.abs(b.time - time))[0]
  if (!note) return { run: { ...updated, combo: 0, ghosts: updated.ghosts + 1, score: Math.max(0, updated.score - 25) }, note: null, grade: null }
  const grade = Math.abs(time - note.time) <= PERFECT_WINDOW ? 'perfect' : 'good'
  const combo = updated.combo + 1
  return {
    run: {
      ...updated, grades: { ...updated.grades, [note.id]: grade }, combo,
      maxCombo: Math.max(updated.maxCombo, combo),
      score: updated.score + (grade === 'perfect' ? 100 : 65) + Math.min(50, Math.floor(combo / 5) * 5),
      perfect: updated.perfect + (grade === 'perfect' ? 1 : 0), good: updated.good + (grade === 'good' ? 1 : 0),
    }, note, grade,
  }
}

export function runAccuracy(run, count) {
  return count > 0 ? Math.max(0, Math.min(1, (run.perfect + run.good * 0.7) / (count + run.ghosts * 0.5))) : 0
}

export function runStars(run, count) {
  const accuracy = runAccuracy(run, count)
  return accuracy >= 0.9 ? 3 : accuracy >= 0.7 ? 2 : accuracy >= 0.4 ? 1 : 0
}

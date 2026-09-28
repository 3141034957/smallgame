import { useEffect, useRef } from 'react'
import { SLOT_COUNT, STEP_SECONDS } from './engine'
import type { Board, SeedKind } from './engine'

export type Playback = {
  startTimeSec: number
  durationSec: number
  nowSec: () => number
  isSilent?: () => boolean
}

type Voice = {
  source: AudioScheduledSourceNode
  nodes: AudioNode[]
}

type VoiceSet = Set<Voice>

// Pentatonic notes stay consonant even when the player changes the board.
const BELL_NOTES = [523.25, 587.33, 659.25, 783.99, 880, 783.99, 659.25, 587.33]
const CHORDS = [
  [130.81, 164.81, 196],
  [110, 130.81, 164.81],
  [130.81, 174.61, 220],
  [98, 146.83, 196],
]

function stopVoices(voices: VoiceSet) {
  for (const voice of voices) {
    voice.source.onended = null
    try {
      voice.source.stop()
    } catch {
      // The source may already have finished.
    }
    for (const node of voice.nodes) node.disconnect()
  }
  voices.clear()
}

function resumeContext(context: AudioContext, onFailure?: () => void) {
  if (context.state !== 'suspended') return
  try {
    void context.resume().catch(() => onFailure?.())
  } catch {
    onFailure?.()
  }
}

function trackVoice(
  voices: VoiceSet,
  source: AudioScheduledSourceNode,
  nodes: AudioNode[],
  when: number,
  duration: number,
) {
  const voice = { source, nodes }
  voices.add(voice)
  source.onended = () => {
    voices.delete(voice)
    for (const node of nodes) node.disconnect()
  }
  source.start(when)
  source.stop(when + duration)
}

function scheduleTone(
  context: AudioContext,
  master: GainNode,
  voices: VoiceSet,
  options: {
    frequency: number
    when: number
    duration: number
    volume: number
    type?: OscillatorType
    attack?: number
    endFrequency?: number
  },
) {
  const { frequency, when, duration, volume, type = 'sine', attack = 0.012, endFrequency } = options
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, when)
  if (endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, when + Math.min(duration * 0.7, 0.18))
  }
  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.linearRampToValueAtTime(volume, when + Math.min(attack, duration * 0.5))
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration)
  oscillator.connect(gain)
  gain.connect(master)
  trackVoice(voices, oscillator, [oscillator, gain], when, duration + 0.01)
}

function makeRainBuffer(context: AudioContext) {
  const length = Math.ceil(context.sampleRate * 0.18)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let index = 0; index < length; index += 1) samples[index] = Math.random() * 2 - 1
  return buffer
}

function scheduleRain(
  context: AudioContext,
  master: GainNode,
  voices: VoiceSet,
  buffer: AudioBuffer,
  when: number,
  volume = 0.09,
) {
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const gain = context.createGain()
  source.buffer = buffer
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(4500, when)
  filter.Q.value = 0.55
  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.linearRampToValueAtTime(volume, when + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.15)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(master)
  trackVoice(voices, source, [source, filter, gain], when, 0.18)

  // A tiny pitched droplet gives the noise a distinct, gentle identity.
  scheduleTone(context, master, voices, {
    frequency: 1108.73,
    endFrequency: 783.99,
    when: when + 0.015,
    duration: 0.11,
    volume: volume * 0.34,
  })
}

function scheduleHeart(context: AudioContext, master: GainNode, voices: VoiceSet, when: number, softer = false) {
  scheduleTone(context, master, voices, {
    frequency: 112,
    endFrequency: 51,
    when,
    duration: 0.24,
    volume: softer ? 0.10 : 0.22,
    attack: 0.004,
  })
  scheduleTone(context, master, voices, {
    frequency: 520,
    endFrequency: 290,
    when,
    duration: 0.028,
    volume: softer ? 0.015 : 0.029,
    attack: 0.003,
  })
}

function scheduleBell(
  context: AudioContext,
  master: GainNode,
  voices: VoiceSet,
  frequency: number,
  when: number,
  volume = 0.105,
) {
  scheduleTone(context, master, voices, {
    frequency,
    when,
    duration: 0.72,
    volume,
    attack: 0.005,
  })
  scheduleTone(context, master, voices, {
    frequency: frequency * 2.01,
    when,
    duration: 0.39,
    volume: volume * 0.26,
    attack: 0.004,
  })
}

function scheduleEcho(
  context: AudioContext,
  master: GainNode,
  voices: VoiceSet,
  frequency: number,
  when: number,
  round: number,
) {
  const intervals = round % 2 === 0 ? [0, 0.19] : [0, 0.16, 0.31]
  intervals.forEach((offset, index) => {
    scheduleTone(context, master, voices, {
      frequency: index === 0 ? frequency : frequency * (round % 2 === 0 ? 1 : 1.5),
      when: when + offset,
      duration: index === 0 ? 0.52 : 0.35,
      volume: 0.078 * (index === 0 ? 1 : index === 1 ? 0.52 : 0.25),
      attack: 0.012,
      type: 'triangle',
    })
  })
}

function schedulePad(context: AudioContext, master: GainNode, voices: VoiceSet, when: number, round: number) {
  const chord = CHORDS[round % CHORDS.length]
  for (const frequency of chord) {
    scheduleTone(context, master, voices, {
      frequency,
      when,
      duration: SLOT_COUNT * STEP_SECONDS * 0.96,
      volume: 0.022,
      attack: 0.32,
      type: 'triangle',
    })
  }
}

function scheduleSeed(
  context: AudioContext,
  master: GainNode,
  voices: VoiceSet,
  rainBuffer: AudioBuffer,
  kind: SeedKind,
  when: number,
  slot: number,
  round: number,
  previousKind: SeedKind | null,
) {
  switch (kind) {
    case 'heart':
      scheduleHeart(context, master, voices, when)
      if (round % 2 === 1) scheduleHeart(context, master, voices, when + STEP_SECONDS * 0.5, true)
      break
    case 'rain':
      scheduleRain(context, master, voices, rainBuffer, when)
      if (round % 2 === 1) scheduleRain(context, master, voices, rainBuffer, when + 0.22, 0.045)
      break
    case 'bell':
      scheduleBell(context, master, voices, BELL_NOTES[slot], when)
      if (round % 2 === 1) {
        scheduleTone(context, master, voices, {
          frequency: BELL_NOTES[slot] * 1.5,
          when: when + 0.11,
          duration: 0.48,
          volume: 0.027,
        })
      }
      break
    case 'echo':
      if (previousKind === 'heart') {
        scheduleHeart(context, master, voices, when, true)
      } else if (previousKind === 'rain') {
        scheduleRain(context, master, voices, rainBuffer, when, 0.045)
      } else {
        scheduleEcho(
          context,
          master,
          voices,
          previousKind === 'bell' ? BELL_NOTES[(slot + SLOT_COUNT - 1) % SLOT_COUNT] * 1.5 : 392,
          when,
          round,
        )
      }
      break
  }
}

export function useEchoAudio() {
  const contextRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)
  const voicesRef = useRef<VoiceSet>(new Set())
  const previewVoicesRef = useRef<VoiceSet>(new Set())
  const rainBufferRef = useRef<AudioBuffer | null>(null)
  const playbackSerialRef = useRef(0)

  const ensureContext = () => {
    if (typeof window === 'undefined') return null
    if (!contextRef.current || contextRef.current.state === 'closed') {
      const AudioContextConstructor = window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextConstructor) return null
      try {
        const context = new AudioContextConstructor()
        const master = context.createGain()
        master.gain.value = 0.58
        master.connect(context.destination)
        contextRef.current = context
        masterRef.current = master
        rainBufferRef.current = makeRainBuffer(context)
      } catch {
        return null
      }
    }
    return contextRef.current
  }

  const stop = () => {
    playbackSerialRef.current += 1
    stopVoices(voicesRef.current)
    stopVoices(previewVoicesRef.current)
  }

  const previewSeed = (kind: SeedKind) => {
    stopVoices(previewVoicesRef.current)
    const context = ensureContext()
    const master = masterRef.current
    const rainBuffer = rainBufferRef.current
    if (!context || !master || !rainBuffer) return
    scheduleSeed(context, master, previewVoicesRef.current, rainBuffer, kind, context.currentTime + 0.025, 0, 0, null)
    resumeContext(context)
  }

  const playLoop = (board: Board, repeats = 2): Playback | null => {
    stop()
    const context = ensureContext()
    const master = masterRef.current
    const rainBuffer = rainBufferRef.current
    if (!context || !master || !rainBuffer) return null

    const rounds = Number.isFinite(repeats) ? Math.max(1, Math.min(8, Math.floor(repeats))) : 2
    const openingEcho = rounds < 4 && board[SLOT_COUNT - 1] === 'bell' && board[0] === 'echo'
    const contextTimeAtStart = context.currentTime
    const wallTimeAtStart = performance.now()
    const startTimeSec = contextTimeAtStart + (openingEcho ? 0.30 : 0.065)
    const durationSec = rounds * SLOT_COUNT * STEP_SECONDS
    if (openingEcho) {
      // The last slot is the previous beat of slot zero. Let the player hear
      // that bell once before the first circle so its echo has a real call.
      scheduleBell(context, master, voicesRef.current, BELL_NOTES[SLOT_COUNT - 1], startTimeSec - 0.24, 0.055)
    }
    for (let round = 0; round < rounds; round += 1) {
      const roundStart = startTimeSec + round * SLOT_COUNT * STEP_SECONDS
      schedulePad(context, master, voicesRef.current, roundStart, round)
      for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
        const kind = board[slot]
        if (!kind) continue
        if (rounds >= 4) {
          if (kind === 'rain' && round === 0) continue
          if (kind === 'bell' && round < 2) continue
          if (kind === 'echo' && round < 3) continue
        }
        const previousKind = board[(slot + SLOT_COUNT - 1) % SLOT_COUNT]
        scheduleSeed(
          context,
          master,
          voicesRef.current,
          rainBuffer,
          kind,
          roundStart + slot * STEP_SECONDS,
          slot,
          round,
          previousKind,
        )
      }
    }
    const playbackSerial = ++playbackSerialRef.current
    let silentFallback = false
    const activateSilentFallback = () => {
      if (playbackSerialRef.current !== playbackSerial || silentFallback) return
      silentFallback = true
      stopVoices(voicesRef.current)
    }
    resumeContext(context, activateSilentFallback)
    return {
      startTimeSec,
      durationSec,
      isSilent: () => silentFallback,
      nowSec: () => {
        if (silentFallback) return contextTimeAtStart + (performance.now() - wallTimeAtStart) / 1000
        if (context.state === 'running') return context.currentTime
        // A rejected or indefinitely pending resume must not trap the UI in
        // its listening phase. Keep the same clock origin for silent playback.
        if (performance.now() - wallTimeAtStart > 400) {
          activateSilentFallback()
          return contextTimeAtStart + (performance.now() - wallTimeAtStart) / 1000
        }
        return context.currentTime
      },
    }
  }

  useEffect(() => () => {
    stopVoices(voicesRef.current)
    stopVoices(previewVoicesRef.current)
    masterRef.current?.disconnect()
    const context = contextRef.current
    contextRef.current = null
    masterRef.current = null
    rainBufferRef.current = null
    if (context && context.state !== 'closed') void context.close()
  }, [])

  return { previewSeed, playLoop, stop }
}

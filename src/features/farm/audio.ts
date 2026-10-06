import type { Lane } from './rules.mjs'

type Voice = { source: AudioScheduledSourceNode; nodes: AudioNode[] }
const midiFrequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

export class FarmAudio {
  context: AudioContext | null = null
  private master: GainNode | null = null
  private voices = new Set<Voice>()
  private muted = false

  async prepare(): Promise<boolean> {
    try {
      if (!this.context || this.context.state === 'closed') {
        const Constructor =
          window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Constructor) return false
        this.context = new Constructor()
        this.master = this.context.createGain()
        this.master.gain.value = this.muted ? 0 : 0.45
        this.master.connect(this.context.destination)
      }
      if (this.context.state === 'suspended') {
        let timer: ReturnType<typeof setTimeout> | undefined
        await Promise.race([
          this.context.resume(),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, 1200)
          }),
        ])
        clearTimeout(timer)
      }
      return this.context.state === 'running'
    } catch {
      return false
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(muted ? 0 : 0.45, this.context.currentTime, 0.02)
  }

  private tone(
    midi: number,
    when: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine',
    endFrequency?: number,
  ) {
    const context = this.context
    if (!context || !this.master || context.state !== 'running') return
    const source = context.createOscillator()
    const gain = context.createGain()
    source.type = type
    source.frequency.setValueAtTime(midiFrequency(midi), when)
    if (endFrequency) source.frequency.exponentialRampToValueAtTime(endFrequency, when + 0.14)
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.linearRampToValueAtTime(volume, when + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration)
    source.connect(gain)
    gain.connect(this.master)
    const voice = { source, nodes: [source, gain] }
    this.voices.add(voice)
    source.onended = () => {
      this.voices.delete(voice)
      voice.nodes.forEach((node) => node.disconnect())
    }
    source.start(when)
    source.stop(when + duration + 0.02)
  }

  playLane(lane: Lane, midi = [48, 76, 36, 84][lane], delay = 0) {
    if (!this.context || this.context.state !== 'running') return
    const when = this.context.currentTime + Math.max(0.008, delay)
    if (lane === 0) {
      this.tone(45, when, 0.19, 0.42, 'sine', 45)
      this.tone(81, when, 0.03, 0.065, 'triangle')
    } else if (lane === 1) {
      this.tone(midi, when, 0.45, 0.2)
      this.tone(midi + 12, when, 0.24, 0.035)
    } else if (lane === 2) {
      this.tone(midi, when, 0.25, 0.26, 'triangle')
    } else {
      this.tone(midi, when, 0.2, 0.12, 'sine')
      this.tone(midi + 7, when + 0.08, 0.15, 0.045)
    }
  }

  accompany(beat: number, delay: number, songIndex: number) {
    if (!this.context || this.context.state !== 'running') return
    const when = this.context.currentTime + Math.max(0.005, delay)
    const chords = [
      [48, 52, 55],
      [45, 48, 52],
      [41, 45, 48],
      [43, 47, 50],
    ]
    if (beat % 4 === 0) {
      const chord = chords[(Math.floor(beat / 4) + songIndex) % 4]
      chord.forEach((midi) => this.tone(midi, when, 1.7, 0.027, 'triangle'))
    }
    // A gentle click keeps the pulse audible even when the player misses notes.
    this.tone(beat % 4 === 0 ? 84 : 79, when, 0.035, beat % 4 === 0 ? 0.055 : 0.026)
  }

  stop() {
    for (const voice of this.voices) {
      voice.source.onended = null
      try {
        voice.source.stop()
      } catch {
        /* Already ended. */
      }
      voice.nodes.forEach((node) => node.disconnect())
    }
    this.voices.clear()
  }

  dispose() {
    this.stop()
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {})
    this.context = null
  }
}

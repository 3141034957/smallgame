import { useEffect, useRef } from 'react'
import { NOTE_FREQUENCIES } from '@/features/game/engine'
import type { GameStatus, Platform } from '@/features/game/engine'

const EFFECTS_TRACK = '/audio/pigen-pop.mp3'

export function useGameAudio() {
  const backgroundMusicRef = useRef<HTMLAudioElement>(null)
  const effectsTrackRef = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const activeAudioNodesRef = useRef(new Map<OscillatorNode, GainNode>())

  const ensureAudioContext = () => {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext()
    if (audioContextRef.current.state === 'suspended') {
      void audioContextRef.current.resume()
    }
    return audioContextRef.current
  }

  const playNoteSound = (platform: Platform, perfect: boolean, fever: boolean) => {
    const context = ensureAudioContext()
    const now = context.currentTime
    const frequency = NOTE_FREQUENCIES[platform.id % NOTE_FREQUENCIES.length]

    const addVoice = (
      voiceFrequency: number,
      duration: number,
      volume: number,
      type: OscillatorType,
    ) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = type
      oscillator.frequency.setValueAtTime(voiceFrequency, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.018)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
      oscillator.connect(gain)
      gain.connect(context.destination)
      activeAudioNodesRef.current.set(oscillator, gain)
      oscillator.onended = () => {
        activeAudioNodesRef.current.delete(oscillator)
        oscillator.disconnect()
        gain.disconnect()
      }
      oscillator.start(now)
      oscillator.stop(now + duration + 0.03)
    }

    addVoice(frequency, perfect ? 0.42 : 0.28, perfect ? 0.18 : 0.11, 'sine')
    if (perfect) addVoice(frequency * 1.5, 0.34, 0.075, 'triangle')
    if (fever) addVoice(frequency / 2, 0.2, 0.09, 'square')
  }

  const syncBackgroundMusic = (status: GameStatus) => {
    const backgroundMusic = backgroundMusicRef.current
    if (!backgroundMusic) return
    if (status === 'playing') {
      backgroundMusic.volume = 0.42
      void backgroundMusic.play().catch(() => {})
    } else {
      backgroundMusic.pause()
    }
  }

  const startGameAudio = () => {
    ensureAudioContext()
    if (!effectsTrackRef.current) {
      effectsTrackRef.current = new Audio(EFFECTS_TRACK)
      effectsTrackRef.current.loop = true
    }
    effectsTrackRef.current.currentTime = 0
    void effectsTrackRef.current.play().catch(() => {})
    if (backgroundMusicRef.current) backgroundMusicRef.current.currentTime = 2
  }

  const pauseGameAudio = () => effectsTrackRef.current?.pause()
  const resumeGameAudio = () => {
    void effectsTrackRef.current?.play().catch(() => {})
  }
  const stopGameAudio = () => {
    effectsTrackRef.current?.pause()
    if (effectsTrackRef.current) effectsTrackRef.current.currentTime = 0
  }

  useEffect(() => {
    const activeAudioNodes = activeAudioNodesRef.current
    const backgroundMusic = backgroundMusicRef.current
    return () => {
      activeAudioNodes.forEach((gain, oscillator) => {
        oscillator.onended = null
        try {
          oscillator.stop()
        } catch {
          // The oscillator may already have stopped.
        }
        oscillator.disconnect()
        gain.disconnect()
      })
      activeAudioNodes.clear()

      backgroundMusic?.pause()
      if (backgroundMusic) {
        backgroundMusic.currentTime = 0
        backgroundMusic.removeAttribute('src')
        backgroundMusic.load()
      }

      const effectsTrack = effectsTrackRef.current
      effectsTrackRef.current = null
      effectsTrack?.pause()
      if (effectsTrack) {
        effectsTrack.removeAttribute('src')
        effectsTrack.load()
      }

      const audioContext = audioContextRef.current
      audioContextRef.current = null
      if (audioContext && audioContext.state !== 'closed') {
        void audioContext.close().catch(() => {})
      }
    }
  }, [])

  return {
    backgroundMusicRef,
    ensureAudioContext,
    pauseGameAudio,
    playNoteSound,
    resumeGameAudio,
    startGameAudio,
    stopGameAudio,
    syncBackgroundMusic,
  }
}

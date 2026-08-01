import { useEffect, useRef } from 'react'
import { NOTE_FREQUENCIES } from '@/features/game/engine'
import type { GameStatus, Platform } from '@/features/game/engine'

export function useGameAudio() {
  const backgroundMusicRef = useRef<HTMLAudioElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const activeAudioNodesRef = useRef(new Map<OscillatorNode, GainNode>())
  const isDisposedRef = useRef(false)

  const ensureAudioContext = () => {
    if (isDisposedRef.current) return null
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      try {
        audioContextRef.current = new AudioContext()
      } catch {
        return null
      }
    }
    if (audioContextRef.current.state === 'suspended') {
      void audioContextRef.current.resume().catch(() => {})
    }
    return audioContextRef.current
  }

  const playNoteSound = (platform: Platform, perfect: boolean, fever: boolean) => {
    const context = ensureAudioContext()
    if (!context) return
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
      if (backgroundMusic.paused) void backgroundMusic.play().catch(() => {})
    } else if (!backgroundMusic.paused) {
      backgroundMusic.pause()
    }
  }

  const startGameAudio = () => {
    ensureAudioContext()
    if (backgroundMusicRef.current) backgroundMusicRef.current.currentTime = 2
  }

  const stopGameAudio = () => {
    const backgroundMusic = backgroundMusicRef.current
    if (!backgroundMusic) return
    backgroundMusic.pause()
    backgroundMusic.currentTime = 0
  }

  useEffect(() => {
    isDisposedRef.current = false
    const activeAudioNodes = activeAudioNodesRef.current
    const backgroundMusic = backgroundMusicRef.current
    return () => {
      isDisposedRef.current = true
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
    playNoteSound,
    startGameAudio,
    stopGameAudio,
    syncBackgroundMusic,
  }
}

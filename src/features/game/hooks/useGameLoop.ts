import { useEffect, useRef } from 'react'

export function useGameLoop(onFrame: (delta: number) => void) {
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame

  useEffect(() => {
    let animationFrame = 0
    let lastTime = performance.now()

    const tick = (time: number) => {
      const delta = Math.min(34, time - lastTime)
      lastTime = time
      onFrameRef.current(delta)
      animationFrame = requestAnimationFrame(tick)
    }

    animationFrame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrame)
  }, [])
}

import { useEffect, useState } from 'react'

export interface Countdown {
  remainingSeconds: number
  formatted: string
  expired: boolean
}

function remainingSeconds(startedAt: string, durationMinutes: number): number {
  const deadline = new Date(startedAt).getTime() + durationMinutes * 60_000
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1_000))
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function useCountdown(startedAt: string, durationMinutes: number): Countdown {
  const [remaining, setRemaining] = useState(() =>
    remainingSeconds(startedAt, durationMinutes)
  )

  useEffect(() => {
    const update = (): void => setRemaining(remainingSeconds(startedAt, durationMinutes))
    update()
    const interval = window.setInterval(update, 1_000)
    return () => window.clearInterval(interval)
  }, [startedAt, durationMinutes])

  return {
    remainingSeconds: remaining,
    formatted: formatDuration(remaining),
    expired: remaining === 0
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '../../../../shared/contracts'

const AUTOSAVE_DELAY_MS = 400

interface Autosave {
  error: string | null
  flush(): Promise<void>
}

export function useAutosave(session: Session, code: string): Autosave {
  const latestRef = useRef({ session, code })
  const savedCodeRef = useRef(session.code)
  const timerRef = useRef<number | undefined>(undefined)
  const flushRef = useRef<Promise<void> | null>(null)
  const [error, setError] = useState<string | null>(null)

  latestRef.current = { session, code }

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current)
      timerRef.current = undefined
    }

    if (flushRef.current) {
      await flushRef.current
      if (savedCodeRef.current === latestRef.current.code) return
    }

    setError(null)
    const operation = (async () => {
      while (savedCodeRef.current !== latestRef.current.code) {
        const latest = latestRef.current
        const snapshot: Session = {
          ...latest.session,
          code: latest.code,
          updatedAt: new Date().toISOString()
        }
        await window.obakeman.sessions.save(snapshot)
        savedCodeRef.current = latest.code
      }
    })()

    flushRef.current = operation
    try {
      await operation
    } catch (saveError) {
      setError('Latest changes could not be saved.')
      throw saveError
    } finally {
      if (flushRef.current === operation) flushRef.current = null
    }
  }, [])

  useEffect(() => {
    if (savedCodeRef.current === code) return

    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = undefined
      void flush().catch(() => undefined)
    }, AUTOSAVE_DELAY_MS)

    return () => {
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current)
        timerRef.current = undefined
      }
    }
  }, [code, flush])

  useEffect(() => {
    const beforeUnload = (): void => {
      void flush().catch(() => undefined)
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [flush])

  return { error, flush }
}

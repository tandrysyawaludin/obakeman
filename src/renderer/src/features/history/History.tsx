import { useEffect, useState } from 'react'
import type {
  ProblemSummary,
  Session,
  SessionSummary
} from '../../../../shared/contracts'

interface HistoryItem {
  session: SessionSummary
  detail: Session | null
  problem: ProblemSummary
}

interface HistoryProps {
  sessions: SessionSummary[]
  problems: ProblemSummary[]
  loading: boolean
  error: string | null
}

export function History({
  sessions,
  problems,
  loading,
  error
}: HistoryProps): React.JSX.Element {
  const [items, setItems] = useState<HistoryItem[]>([])
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const completed = sessions
      .filter((session) => session.completedAt)
      .sort((left, right) =>
        Date.parse(right.completedAt as string) - Date.parse(left.completedAt as string)
      )

    if (completed.length === 0) {
      setItems([])
      setDetailsLoading(false)
      return () => {
        active = false
      }
    }

    setDetailsLoading(true)
    setDetailsError(null)
    Promise.all(completed.map(async (session): Promise<HistoryItem | null> => {
      const problem = problems.find((candidate) => candidate.id === session.problemId)
      if (!problem) return null
      return {
        session,
        detail: await window.obakeman.sessions.get(session.id),
        problem
      }
    }))
      .then((loaded) => {
        if (active) setItems(loaded.filter((item): item is HistoryItem => item !== null))
      })
      .catch(() => {
        if (active) setDetailsError('Practice history details could not be loaded.')
      })
      .finally(() => {
        if (active) setDetailsLoading(false)
      })

    return () => {
      active = false
    }
  }, [problems, sessions])

  return (
    <div className="page history-page">
      <header className="library-header">
        <div>
          <p className="eyebrow">Practice archive</p>
          <h1>History</h1>
          <p className="hero-copy">Revisit completed interviews and turn results into progress.</p>
        </div>
      </header>

      {(loading || detailsLoading) && <p className="notice">Loading practice history…</p>}
      {(error || detailsError) && (
        <p className="notice error-notice" role="alert">{error ?? detailsError}</p>
      )}
      {!loading && !detailsLoading && !error && !detailsError && items.length === 0 && (
        <div className="empty-state">
          <span className="empty-symbol" aria-hidden="true">○</span>
          <p>No completed interviews yet. Finish a practice session to see it here.</p>
        </div>
      )}
      {!loading && !detailsLoading && items.length > 0 && (
        <ol className="history-list" aria-label="Practice history">
          {items.map(({ session, detail, problem }) => (
            <li key={session.id}>
              <a className="history-card" href={`#review/${session.id}`}>
                <div>
                  <span className={`difficulty difficulty-${problem.difficulty}`}>
                    {problem.difficulty}
                  </span>
                  <h2>{problem.title}</h2>
                  <time dateTime={session.completedAt}>
                    {formatDate(session.completedAt as string)}
                  </time>
                </div>
                <div className="history-facts">
                  <span><strong>{elapsedMinutes(session)} min</strong> elapsed</span>
                  <span><strong>{testRatio(detail)}</strong> tests</span>
                  <span aria-hidden="true">→</span>
                </div>
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function elapsedMinutes(session: SessionSummary): number {
  if (!session.completedAt) return session.durationMinutes
  const elapsed = Date.parse(session.completedAt) - Date.parse(session.startedAt)
  return Math.max(0, Math.round(elapsed / 60_000))
}

function testRatio(session: Session | null): string {
  const result = session?.testResult
  if (!result) return '—'
  const passed = result.visible.filter((test) => test.passed).length +
    (result.hidden?.passed ?? 0)
  const total = result.visible.length + (result.hidden?.total ?? 0)
  return `${passed}/${total}`
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

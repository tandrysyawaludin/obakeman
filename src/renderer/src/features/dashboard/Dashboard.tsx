import type { ProblemSummary, SessionSummary } from '../../../../shared/contracts'

interface DashboardProps {
  problems: ProblemSummary[]
  sessions: SessionSummary[]
  loading: boolean
  error: string | null
}

function sessionDestination(session: SessionSummary): string {
  return session.status === 'in_progress'
    ? `#practice/${session.id}`
    : `#review/${session.id}`
}

export function Dashboard({
  problems,
  sessions,
  loading,
  error
}: DashboardProps): React.JSX.Element {
  const completed = sessions.filter((session) => session.completedAt !== undefined).length
  const practicedMinutes = sessions.reduce(
    (total, session) => total + session.durationMinutes,
    0
  )
  const recentSessions = [...sessions]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 4)

  return (
    <div className="page dashboard-page">
      <header className="hero">
        <div>
          <p className="eyebrow">Focused interview practice</p>
          <h1>{sessions.length === 0 ? 'Your next interview starts here' : 'Welcome back'}</h1>
          <p className="hero-copy">
            Pick a problem, set the clock, and practice out loud.
          </p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            window.location.hash = 'library'
          }}
        >
          Start practice
          <span aria-hidden="true">↗</span>
        </button>
      </header>

      {error && <p className="notice error-notice" role="alert">{error}</p>}

      <section aria-labelledby="progress-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Momentum</p>
            <h2 id="progress-heading">Practice progress</h2>
          </div>
          <span className="section-meta">Stored on this device</span>
        </div>
        <div className="progress-grid">
          <article className="metric-card">
            <span className="metric-value">{loading ? '—' : sessions.length}</span>
            <span className="metric-label">sessions started</span>
          </article>
          <article className="metric-card">
            <span className="metric-value">
              {loading ? '—' : `${completed} completed`}
            </span>
            <span className="metric-label">finished sessions</span>
          </article>
          <article className="metric-card">
            <span className="metric-value">{loading ? '—' : practicedMinutes}</span>
            <span className="metric-label">minutes scheduled</span>
          </article>
        </div>
      </section>

      <section aria-labelledby="recent-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Continue the work</p>
            <h2 id="recent-heading">Recent practice</h2>
          </div>
          {sessions.length > 0 && <a className="text-link" href="#history">View history</a>}
        </div>

        {loading ? (
          <p className="notice" role="status">Loading your practice history…</p>
        ) : recentSessions.length === 0 ? (
          <div className="empty-state">
            <span className="empty-symbol" aria-hidden="true">⌁</span>
            <div>
              <h3>No sessions yet</h3>
              <p>Choose one of {problems.length} problems and make your first attempt.</p>
            </div>
          </div>
        ) : (
          <div className="recent-list">
            {recentSessions.map((session) => {
              const problem = problems.find((item) => item.id === session.problemId)
              return (
                <a
                  className="recent-row"
                  href={sessionDestination(session)}
                  key={session.id}
                >
                  <span className={`status-dot status-${session.status}`} aria-hidden="true" />
                  <span className="recent-main">
                    <strong>{problem?.title ?? session.problemId}</strong>
                    <small>{session.durationMinutes} minute session</small>
                  </span>
                  <span className="session-status">
                    {session.status.replaceAll('_', ' ')}
                  </span>
                  <span aria-hidden="true">→</span>
                </a>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

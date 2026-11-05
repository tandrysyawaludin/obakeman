import { useEffect, useState } from 'react'
import type { ProblemSummary, SessionSummary } from '../../shared/contracts'
import { AppShell } from './components/AppShell'
import { Dashboard } from './features/dashboard/Dashboard'
import { ProblemLibrary } from './features/library/ProblemLibrary'
import { Workspace } from './features/workspace/Workspace'

export type Route =
  | { page: 'dashboard' }
  | { page: 'library' }
  | { page: 'practice'; sessionId: string }
  | { page: 'history' }
  | { page: 'review'; sessionId: string }
  | { page: 'settings' }

function routeFromHash(): Route {
  const [page, id] = window.location.hash
    .slice(1)
    .replace(/^\/+/, '')
    .split('/')

  if (page === 'library') return { page: 'library' }
  if (page === 'practice' && id) return { page: 'practice', sessionId: id }
  if (page === 'history') return { page: 'history' }
  if (page === 'review' && id) return { page: 'review', sessionId: id }
  if (page === 'settings') return { page: 'settings' }
  return { page: 'dashboard' }
}

function PlaceholderPage({
  eyebrow,
  title,
  description
}: {
  eyebrow: string
  title: string
  description: string
}): React.JSX.Element {
  return (
    <div className="page placeholder-page">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="hero-copy">{description}</p>
    </div>
  )
}

export function App(): React.JSX.Element {
  const [route, setRoute] = useState<Route>(routeFromHash)
  const [problems, setProblems] = useState<ProblemSummary[]>([])
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [problemsLoading, setProblemsLoading] = useState(true)
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [problemsError, setProblemsError] = useState<string | null>(null)
  const [sessionsError, setSessionsError] = useState<string | null>(null)

  useEffect(() => {
    const updateRoute = (): void => setRoute(routeFromHash())
    window.addEventListener('hashchange', updateRoute)

    if (!window.location.hash) {
      window.location.hash = 'dashboard'
    }

    return () => window.removeEventListener('hashchange', updateRoute)
  }, [])

  useEffect(() => {
    let active = true

    window.obakeman.problems.list()
      .then((problemList) => {
        if (active) setProblems(problemList)
      })
      .catch(() => {
        if (active) {
          setProblemsError('The problem library could not be loaded.')
        }
      })
      .finally(() => {
        if (active) setProblemsLoading(false)
      })

    window.obakeman.sessions.list()
      .then((sessionList) => {
        if (active) setSessions(sessionList)
      })
      .catch(() => {
        if (active) {
          setSessionsError('Practice history could not be loaded.')
        }
      })
      .finally(() => {
        if (active) setSessionsLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const activePage = route.page === 'library' || route.page === 'practice'
    ? 'library'
    : route.page === 'review'
      ? 'history'
      : route.page

  let page: React.JSX.Element
  switch (route.page) {
    case 'dashboard':
      page = (
        <Dashboard
          problems={problems}
          sessions={sessions}
          loading={problemsLoading || sessionsLoading}
          error={problemsError ?? sessionsError}
        />
      )
      break
    case 'library':
      page = (
        <ProblemLibrary
          problems={problems}
          loading={problemsLoading}
          error={problemsError}
        />
      )
      break
    case 'practice':
      page = <Workspace sessionId={route.sessionId} />
      break
    case 'history':
      page = (
        <PlaceholderPage
          eyebrow="Practice archive"
          title="History"
          description="Your completed and in-progress sessions will live here."
        />
      )
      break
    case 'review':
      page = (
        <PlaceholderPage
          eyebrow="Session review"
          title="Review"
          description={`Review session ${route.sessionId} and turn feedback into a next step.`}
        />
      )
      break
    case 'settings':
      page = (
        <PlaceholderPage
          eyebrow="Workspace preferences"
          title="Settings"
          description="Shape the practice environment around how you work best."
        />
      )
      break
  }

  return <AppShell activePage={activePage}>{page}</AppShell>
}

import type { ReactNode } from 'react'

type NavigationPage = 'dashboard' | 'library' | 'history' | 'settings'

const navigation: Array<{
  page: NavigationPage
  label: string
  description: string
}> = [
  { page: 'dashboard', label: 'Dashboard', description: 'Overview and progress' },
  { page: 'library', label: 'Practice', description: 'Choose a problem' },
  { page: 'history', label: 'History', description: 'Past interviews' },
  { page: 'settings', label: 'Settings', description: 'Preferences' }
]

interface AppShellProps {
  activePage: NavigationPage
  children: ReactNode
}

export function AppShell({ activePage, children }: AppShellProps): React.JSX.Element {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar">
        <a className="brand" href="#dashboard" aria-label="Obakeman dashboard">
          <span className="brand-mark" aria-hidden="true">O</span>
          <span>
            Obakeman
            <small>Interview studio</small>
          </span>
        </a>
        <nav aria-label="Primary navigation">
          {navigation.map((item) => (
            <a
              className={item.page === activePage ? 'nav-link active' : 'nav-link'}
              href={`#${item.page}`}
              aria-current={item.page === activePage ? 'page' : undefined}
              key={item.page}
            >
              <span>{item.label}</span>
              <small>{item.description}</small>
            </a>
          ))}
        </nav>
        <p className="sidebar-note">
          Quiet repetition builds clear thinking.
        </p>
      </aside>
      <main className="content" id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}

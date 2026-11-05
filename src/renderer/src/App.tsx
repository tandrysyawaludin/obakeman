import { useEffect, useState } from 'react'

const sections = ['Dashboard', 'Practice', 'History', 'Settings'] as const
type Section = (typeof sections)[number]

function sectionFromHash(): Section {
  const requestedSection = window.location.hash.slice(1).toLowerCase()

  return (
    sections.find((section) => section.toLowerCase() === requestedSection) ??
    'Dashboard'
  )
}

export function App(): React.JSX.Element {
  const [activeSection, setActiveSection] = useState(sectionFromHash)

  useEffect(() => {
    const updateActiveSection = (): void => setActiveSection(sectionFromHash())
    window.addEventListener('hashchange', updateActiveSection)

    if (!window.location.hash) {
      window.location.hash = 'dashboard'
    }

    return () => window.removeEventListener('hashchange', updateActiveSection)
  }, [])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#dashboard" aria-label="Obakeman dashboard">
          Obakeman
        </a>
        <nav aria-label="Primary navigation">
          {sections.map((section) => (
            <a
              className={section === activeSection ? 'nav-link active' : 'nav-link'}
              href={`#${section.toLowerCase()}`}
              key={section}
            >
              {section}
            </a>
          ))}
        </nav>
      </aside>
      <main className="content">
        <p className="eyebrow">Interview practice</p>
        <h1>{activeSection}</h1>
        <p className="placeholder">
          {activeSection} features will be added in a later task.
        </p>
      </main>
    </div>
  )
}

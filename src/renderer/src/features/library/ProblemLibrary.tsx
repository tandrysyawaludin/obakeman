import { useMemo, useState } from 'react'
import type { ProblemSummary } from '../../../../shared/contracts'
import { SessionSetup } from './SessionSetup'

type DifficultyFilter = 'all' | ProblemSummary['difficulty']

interface ProblemLibraryProps {
  problems: ProblemSummary[]
  loading: boolean
  error: string | null
}

const difficulties: Array<{ value: DifficultyFilter; label: string }> = [
  { value: 'all', label: 'All levels' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' }
]

export function ProblemLibrary({
  problems,
  loading,
  error
}: ProblemLibraryProps): React.JSX.Element {
  const [difficulty, setDifficulty] = useState<DifficultyFilter>('all')
  const [topic, setTopic] = useState('all')
  const [selectedProblem, setSelectedProblem] = useState<ProblemSummary | null>(null)

  const topics = useMemo(
    () => [...new Set(problems.flatMap((problem) => problem.topics))].sort(),
    [problems]
  )
  const visibleProblems = problems.filter((problem) => {
    const matchesDifficulty = difficulty === 'all' || problem.difficulty === difficulty
    const matchesTopic = topic === 'all' || problem.topics.includes(topic)
    return matchesDifficulty && matchesTopic
  })

  return (
    <div className="page library-page">
      <header className="library-header">
        <div>
          <p className="eyebrow">Problem library</p>
          <h1>Choose a problem</h1>
          <p className="hero-copy">
            Train the reasoning, communication, and code—not memorized answers.
          </p>
        </div>
        <span className="problem-count" aria-live="polite">
          {loading ? 'Loading…' : `${visibleProblems.length} available`}
        </span>
      </header>

      <div className="filter-bar">
        <fieldset className="difficulty-filter">
          <legend>Difficulty</legend>
          <div className="segmented-control">
            {difficulties.map((option) => (
              <button
                type="button"
                className={difficulty === option.value ? 'selected' : undefined}
                aria-pressed={difficulty === option.value}
                onClick={() => setDifficulty(option.value)}
                key={option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="topic-filter">
          <span>Topic</span>
          <select value={topic} onChange={(event) => setTopic(event.target.value)}>
            <option value="all">All topics</option>
            {topics.map((item) => (
              <option value={item} key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="notice error-notice" role="alert">{error}</p>}
      {loading ? (
        <p className="notice" role="status">Loading the problem library…</p>
      ) : visibleProblems.length === 0 ? (
        <div className="empty-state">
          <span className="empty-symbol" aria-hidden="true">∅</span>
          <div>
            <h2>No matching problems</h2>
            <p>Try another difficulty or topic.</p>
          </div>
        </div>
      ) : (
        <div className="problem-grid">
          {visibleProblems.map((problem, index) => (
            <button
              className="problem-card"
              type="button"
              onClick={() => setSelectedProblem(problem)}
              key={problem.id}
            >
              <span className="card-index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="problem-card-heading">
                <strong>{problem.title}</strong>
                <span className={`difficulty difficulty-${problem.difficulty}`}>
                  {problem.difficulty}
                </span>
              </span>
              <span className="problem-description">{problem.description}</span>
              <span className="topic-list">
                {problem.topics.map((item) => (
                  <span className="topic-pill" key={item}>{item}</span>
                ))}
              </span>
              <span className="card-action">
                Configure session <span aria-hidden="true">→</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {selectedProblem && (
        <SessionSetup
          problem={selectedProblem}
          onClose={() => setSelectedProblem(null)}
        />
      )}
    </div>
  )
}

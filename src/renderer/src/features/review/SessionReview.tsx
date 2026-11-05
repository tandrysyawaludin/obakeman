import { useEffect, useState } from 'react'
import type {
  ProblemSummary,
  ReviewFeedback,
  Session,
  TestRunResult
} from '../../../../shared/contracts'

interface ReviewData {
  session: Session
  problem: ProblemSummary
}

export function SessionReview({ sessionId }: { sessionId: string }): React.JSX.Element {
  const [data, setData] = useState<ReviewData | null>(null)
  const [feedback, setFeedback] = useState<ReviewFeedback | null>(null)
  const [feedbackState, setFeedbackState] = useState<
    'idle' | 'loading' | 'failed'
  >('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load(): Promise<void> {
      try {
        const session = await window.obakeman.sessions.get(sessionId)
        if (!session || !session.completedAt || !session.testResult) {
          throw new Error('incomplete session')
        }
        const problem = await window.obakeman.problems.get(session.problemId)
        if (!problem) throw new Error('missing problem')
        if (!active) return

        setData({ session, problem })
        setFeedback(session.feedback ?? null)
        if (!session.feedback && session.status === 'feedback_pending') {
          setFeedbackState('loading')
          try {
            const requested = await window.obakeman.ai.requestReview(session.id)
            if (active) {
              setFeedback(requested)
              setFeedbackState('idle')
            }
          } catch {
            try {
              await window.obakeman.sessions.save({
                ...session,
                status: 'feedback_failed'
              })
            } catch {
              // The retry control remains available even if failure state cannot persist.
            }
            if (active) setFeedbackState('failed')
          }
        } else if (!session.feedback && session.status === 'feedback_failed') {
          setFeedbackState('failed')
        }
      } catch {
        if (active) setError('This session review could not be loaded.')
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [sessionId])

  async function retryFeedback(): Promise<void> {
    if (!data || feedbackState === 'loading') return
    setFeedbackState('loading')
    try {
      setFeedback(await window.obakeman.ai.requestReview(data.session.id))
      setFeedbackState('idle')
    } catch {
      setFeedbackState('failed')
    }
  }

  if (error) {
    return <div className="page"><p className="notice error-notice" role="alert">{error}</p></div>
  }
  if (!data) {
    return <div className="page"><p className="notice">Loading session review…</p></div>
  }

  const { problem, session } = data
  return (
    <div className="page review-page">
      <header className="review-header">
        <div>
          <p className="eyebrow">Session review · {problem.difficulty}</p>
          <h1>{problem.title}</h1>
          <p className="hero-copy">
            Deterministic results are preserved whether or not AI feedback is available.
          </p>
        </div>
        <a className="secondary-button" href="#history">Back to history</a>
      </header>

      <DeterministicResults session={session} problem={problem} />

      <section className="feedback-section" aria-labelledby="feedback-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">AI coaching</p>
            <h2 id="feedback-heading">Feedback</h2>
          </div>
          {feedbackState === 'failed' && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => void retryFeedback()}
            >
              Retry AI feedback
            </button>
          )}
        </div>

        {feedbackState === 'loading' && (
          <p className="notice" role="status">Generating feedback…</p>
        )}
        {feedbackState === 'failed' && (
          <p className="notice error-notice" role="alert">
            AI feedback is unavailable. Your test results are still saved.
          </p>
        )}
        {feedback && <Feedback feedback={feedback} />}
      </section>
    </div>
  )
}

function DeterministicResults({
  session,
  problem
}: {
  session: Session
  problem: ProblemSummary
}): React.JSX.Element {
  const result = session.testResult as TestRunResult
  const visiblePassed = result.visible.filter((test) => test.passed).length
  const passed = visiblePassed + (result.hidden?.passed ?? 0)
  const total = result.visible.length + (result.hidden?.total ?? 0)

  return (
    <section className="review-results" aria-labelledby="results-heading">
      <div>
        <p className="eyebrow">Verified outcome</p>
        <h2 id="results-heading">{passed} of {total} tests passed</h2>
      </div>
      <div className="result-facts">
        <span>
          <strong>Reference complexity</strong>
          {problem.referenceComplexity.time} time · {problem.referenceComplexity.space} space
        </span>
        <span>
          <strong>Completed</strong>
          {formatDateTime(session.completedAt as string)}
        </span>
      </div>
    </section>
  )
}

function Feedback({ feedback }: { feedback: ReviewFeedback }): React.JSX.Element {
  if (feedback.format === 'plain_text') {
    return <div className="feedback-card plain-feedback">{feedback.text}</div>
  }

  return (
    <div className="feedback-grid">
      <article className="feedback-card">
        <h3>Correctness</h3>
        <p>{feedback.correctness}</p>
      </article>
      <article className="feedback-card">
        <h3>Complexity</h3>
        <p>{feedback.timeComplexity} time</p>
        <p>{feedback.spaceComplexity} space</p>
      </article>
      <article className="feedback-card">
        <h3>Code quality</h3>
        <p>{feedback.codeQuality}</p>
      </article>
      <article className="feedback-card">
        <h3>Strengths</h3>
        <ul>{feedback.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
      </article>
      <article className="feedback-card">
        <h3>Improvements</h3>
        <ul>{feedback.improvements.map((item) => <li key={item}>{item}</li>)}</ul>
      </article>
      <article className="feedback-card feedback-wide">
        <h3>Suggested solution</h3>
        <p>{feedback.suggestedSolution}</p>
        <p>{feedback.explanation}</p>
      </article>
    </div>
  )
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

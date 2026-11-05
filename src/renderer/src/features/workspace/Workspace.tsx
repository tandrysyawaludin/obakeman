import Editor from '@monaco-editor/react'
import { useEffect, useState } from 'react'
import type {
  ProblemSummary,
  PublicSettings,
  Session,
  TestRunResult
} from '../../../../shared/contracts'
import { HintPanel } from './HintPanel'
import { TestResults } from './TestResults'
import { useAutosave } from './useAutosave'
import { useCountdown } from './useCountdown'

interface WorkspaceData {
  session: Session
  problem: ProblemSummary
  settings: PublicSettings
}

export function Workspace({ sessionId }: { sessionId: string }): React.JSX.Element {
  const [data, setData] = useState<WorkspaceData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load(): Promise<void> {
      try {
        const [session, settings] = await Promise.all([
          window.obakeman.sessions.get(sessionId),
          window.obakeman.settings.get()
        ])
        if (!session) throw new Error('missing session')
        const problem = await window.obakeman.problems.get(session.problemId)
        if (!problem) throw new Error('missing problem')
        if (active) setData({ session, problem, settings })
      } catch {
        if (active) setError('This practice session could not be loaded.')
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [sessionId])

  if (error) {
    return <div className="page"><p className="notice error-notice" role="alert">{error}</p></div>
  }
  if (!data) {
    return <div className="page"><p className="notice">Loading practice workspace…</p></div>
  }
  if (data.session.status !== 'in_progress') {
    return (
      <div className="page">
        <p className="notice">This interview has already been finished.</p>
        <a className="text-link" href={`#review/${sessionId}`}>Open review</a>
      </div>
    )
  }

  return <ActiveWorkspace {...data} />
}

function ActiveWorkspace({
  session,
  problem,
  settings
}: WorkspaceData): React.JSX.Element {
  const [code, setCode] = useState(session.code)
  const [result, setResult] = useState<TestRunResult | null>(session.testResult ?? null)
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [hintLoading, setHintLoading] = useState(false)
  const [hintError, setHintError] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)
  const [closeSaveFailed, setCloseSaveFailed] = useState(false)
  const countdown = useCountdown(session.startedAt, session.durationMinutes)
  const autosave = useAutosave(session, code)

  useEffect(() => window.obakeman.onBeforeClose(async () => {
    try {
      await autosave.flush()
    } catch {
      setCloseSaveFailed(true)
    } finally {
      window.obakeman.closeReady()
    }
  }), [autosave.flush])

  async function runTests(): Promise<void> {
    if (running) return
    setRunning(true)
    setRunError(null)
    try {
      setResult(await window.obakeman.runner.run({
        sessionId: session.id,
        code,
        includeHidden: false
      }))
    } catch {
      setRunError('Tests could not run. Please try again.')
    } finally {
      setRunning(false)
    }
  }

  async function requestHint(): Promise<void> {
    if (hintLoading || !settings.hasApiKey) return
    setHintLoading(true)
    setHintError(null)
    try {
      const response = await window.obakeman.ai.requestHint({
        sessionId: session.id,
        code
      })
      setHint(response.text)
    } catch {
      setHintError('Hint unavailable. Check your connection and try again.')
    } finally {
      setHintLoading(false)
    }
  }

  async function finish(): Promise<void> {
    if (finishing) return
    const completionCode = code
    setFinishing(true)
    setFinishError(null)
    try {
      await autosave.flush()
      const hiddenResult = await window.obakeman.runner.run({
        sessionId: session.id,
        code: completionCode,
        includeHidden: true
      })
      await window.obakeman.sessions.complete({
        id: session.id,
        code: completionCode,
        testResult: hiddenResult
      })
      window.location.hash = `review/${session.id}`
    } catch {
      setFinishError('The interview could not be finished. Please try again.')
      setFinishing(false)
    }
  }

  return (
    <div className="page workspace-page">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Practice room · {problem.difficulty}</p>
          <h1>{problem.title}</h1>
        </div>
        <div className={`workspace-timer${countdown.expired ? ' timer-expired' : ''}`}>
          <span>{countdown.expired ? 'Time elapsed' : 'Time remaining'}</span>
          <strong role="timer" aria-live="off">{countdown.formatted}</strong>
        </div>
      </header>

      <div className="workspace-grid">
        <aside className="problem-panel">
          <h2>Prompt</h2>
          <p>{problem.description}</p>
          <h3>Constraints</h3>
          <ul>
            {problem.constraints.map((constraint) => <li key={constraint}>{constraint}</li>)}
          </ul>
          <h3>Examples</h3>
          {problem.examples.map((example) => (
            <div className="problem-example" key={`${example.input}-${example.output}`}>
              <code>{example.input}</code>
              <span>→</span>
              <code>{example.output}</code>
            </div>
          ))}
        </aside>

        <section className="editor-panel" aria-label="Solution editor">
          <Editor
            height="460px"
            language="javascript"
            theme="vs-dark"
            value={code}
            onChange={(value) => setCode(value ?? '')}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              automaticLayout: true,
              scrollBeyondLastLine: false,
              readOnly: finishing
            }}
          />
          <div className="workspace-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={running || finishing}
              onClick={() => void runTests()}
            >
              {running ? 'Running tests…' : 'Run tests'}
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={finishing || running}
              onClick={() => void finish()}
            >
              {finishing ? 'Finishing…' : 'Finish interview'}
            </button>
          </div>
          {running && <p className="operation-status" role="status">Executing visible tests…</p>}
          {finishing && (
            <p className="operation-status" role="status">
              Running hidden tests and saving your interview…
            </p>
          )}
          {runError && <p className="form-error" role="alert">{runError}</p>}
          {finishError && <p className="form-error" role="alert">{finishError}</p>}
          {(autosave.error || closeSaveFailed) && (
            <div className="form-error" role="alert">
              <span>
                {closeSaveFailed
                  ? 'The final save failed. Obakeman will still close, and the latest edits may be lost.'
                  : autosave.error}
              </span>
              {!closeSaveFailed && (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => void autosave.flush().catch(() => undefined)}
                >
                  Retry save
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {result && <TestResults result={result} />}
      <HintPanel
        hasApiKey={settings.hasApiKey}
        loading={hintLoading}
        hint={hint}
        error={hintError}
        onRequest={() => void requestHint()}
      />
    </div>
  )
}

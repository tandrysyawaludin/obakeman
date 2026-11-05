import { useEffect, useRef, useState, type FormEvent, type SyntheticEvent } from 'react'
import type { ProblemSummary } from '../../../../shared/contracts'

interface SessionSetupProps {
  problem: ProblemSummary
  onClose: () => void
}

export function SessionSetup({
  problem,
  onClose
}: SessionSetupProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const durationRef = useRef<HTMLSelectElement>(null)
  const [durationMinutes, setDurationMinutes] = useState(30)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    dialog.showModal()
    durationRef.current?.focus()

    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  function closeDialog(): void {
    const dialog = dialogRef.current
    if (dialog?.open) dialog.close()
    onClose()
  }

  function cancelDialog(event: SyntheticEvent<HTMLDialogElement>): void {
    event.preventDefault()
    closeDialog()
  }

  async function beginInterview(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const session = await window.obakeman.sessions.create({
        problemId: problem.id,
        durationMinutes
      })
      window.location.hash = `practice/${session.id}`
    } catch {
      setError('The session could not be created. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="setup-dialog"
      aria-labelledby="setup-title"
      aria-describedby="setup-description"
      onCancel={cancelDialog}
    >
      <button
        className="icon-button dialog-close"
        type="button"
        aria-label="Close session setup"
        onClick={closeDialog}
      >
        ×
      </button>
      <p className="eyebrow">Session setup</p>
      <h2 id="setup-title">Set up your interview</h2>
      <p id="setup-description" className="dialog-copy">
        You chose <strong>{problem.title}</strong>. Pick a timebox and enter a
        distraction-free practice room.
      </p>

      <div className="setup-summary">
        <span className={`difficulty difficulty-${problem.difficulty}`}>
          {problem.difficulty}
        </span>
        <span>{problem.topics.join(' · ')}</span>
      </div>

      <form onSubmit={beginInterview}>
        <label className="field-label" htmlFor="session-duration">Duration</label>
        <select
          ref={durationRef}
          id="session-duration"
          value={durationMinutes}
          onChange={(event) => setDurationMinutes(Number(event.target.value))}
        >
          <option value="15">15 minutes · quick run</option>
          <option value="30">30 minutes · focused</option>
          <option value="45">45 minutes · standard</option>
          <option value="60">60 minutes · deep dive</option>
        </select>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={closeDialog}>
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Preparing room…' : 'Begin interview'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

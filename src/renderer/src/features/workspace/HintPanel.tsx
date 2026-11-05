interface HintPanelProps {
  hasApiKey: boolean
  loading: boolean
  hint: string | null
  error: string | null
  onRequest: () => void
}

export function HintPanel({
  hasApiKey,
  loading,
  hint,
  error,
  onRequest
}: HintPanelProps): React.JSX.Element {
  return (
    <section className="hint-panel">
      <div>
        <p className="eyebrow">Interview coach</p>
        <h2>Need a nudge?</h2>
      </div>
      <button
        className="secondary-button"
        type="button"
        disabled={!hasApiKey || loading}
        onClick={onRequest}
      >
        {loading ? 'Getting hint…' : 'Get a hint'}
      </button>
      {!hasApiKey && <p className="hint-status">Configure AI in Settings to use hints</p>}
      {hint && <p className="hint-copy">{hint}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  )
}

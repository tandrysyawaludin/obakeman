import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { PublicSettings } from '../../../../shared/contracts'

interface ValidationErrors {
  endpoint?: string
  model?: string
}

type OperationState = 'idle' | 'working' | 'success' | 'failed'

export function Settings(): React.JSX.Element {
  const keyRef = useRef<HTMLInputElement>(null)
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [endpoint, setEndpoint] = useState('')
  const [model, setModel] = useState('')
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<OperationState>('idle')
  const [connectionState, setConnectionState] = useState<OperationState>('idle')
  const [clearState, setClearState] = useState<OperationState>('idle')

  useEffect(() => {
    let active = true
    window.obakeman.settings.get()
      .then((loaded) => {
        if (!active) return
        setSettings(loaded)
        setEndpoint(loaded.endpoint)
        setModel(loaded.model)
      })
      .catch(() => {
        if (active) setLoadError('Settings could not be loaded.')
      })
    return () => {
      active = false
    }
  }, [])

  function validate(): { endpoint: string; model: string } | null {
    const nextErrors: ValidationErrors = {}
    let url: URL | null = null
    try {
      url = new URL(endpoint)
    } catch {
      nextErrors.endpoint = 'Enter a valid HTTP or HTTPS endpoint.'
    }
    if (url && url.protocol !== 'http:' && url.protocol !== 'https:') {
      nextErrors.endpoint = 'Enter a valid HTTP or HTTPS endpoint.'
    }

    const trimmedModel = model.trim()
    if (!trimmedModel) nextErrors.model = 'Enter a model name.'
    setValidationErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return null
    return { endpoint: endpoint.trim(), model: trimmedModel }
  }

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault()
    const apiKey = keyRef.current?.value ?? ''
    if (keyRef.current) keyRef.current.value = ''
    const input = validate()
    if (!input || saveState === 'working') return

    setSaveState('working')
    setConnectionState('idle')
    try {
      const saved = await window.obakeman.settings.save(input)
      let hasApiKey = saved.hasApiKey
      if (apiKey) {
        await window.obakeman.settings.saveCredential(apiKey)
        hasApiKey = true
      }
      setSettings({ ...saved, hasApiKey })
      setEndpoint(saved.endpoint)
      setModel(saved.model)
      setSaveState('success')
    } catch {
      setSaveState('failed')
    }
  }

  async function testConnection(): Promise<void> {
    const input = validate()
    if (!input || connectionState === 'working') return
    setConnectionState('working')
    try {
      const saved = await window.obakeman.settings.save(input)
      setSettings(saved)
      await window.obakeman.ai.testConnection()
      setConnectionState('success')
    } catch {
      setConnectionState('failed')
    }
  }

  async function clearCredential(): Promise<void> {
    if (clearState === 'working') return
    setClearState('working')
    try {
      await window.obakeman.settings.clearCredential()
      setSettings((current) => current ? { ...current, hasApiKey: false } : current)
      setConnectionState('idle')
      setClearState('idle')
    } catch {
      setClearState('failed')
    }
  }

  if (loadError) {
    return <div className="page"><p className="notice error-notice" role="alert">{loadError}</p></div>
  }
  if (!settings) {
    return <div className="page"><p className="notice">Loading settings…</p></div>
  }

  return (
    <div className="page settings-page">
      <header className="settings-header">
        <p className="eyebrow">Workspace preferences</p>
        <h1>Settings</h1>
        <p className="hero-copy">
          Connect an OpenAI-compatible provider without exposing credentials to the renderer.
        </p>
      </header>

      <form className="settings-form" onSubmit={(event) => void save(event)} noValidate>
        <section className="settings-section" aria-labelledby="provider-heading">
          <div>
            <h2 id="provider-heading">AI provider</h2>
            <p>Configure the endpoint and model used for hints and reviews.</p>
          </div>
          <div className="settings-fields">
            <label>
              <span className="field-label">Endpoint</span>
              <input
                name="endpoint"
                type="url"
                value={endpoint}
                aria-invalid={Boolean(validationErrors.endpoint)}
                aria-describedby={validationErrors.endpoint ? 'endpoint-error' : undefined}
                onChange={(event) => setEndpoint(event.target.value)}
              />
            </label>
            {validationErrors.endpoint && (
              <p className="form-error" id="endpoint-error">{validationErrors.endpoint}</p>
            )}
            <label>
              <span className="field-label">Model</span>
              <input
                name="model"
                value={model}
                aria-invalid={Boolean(validationErrors.model)}
                aria-describedby={validationErrors.model ? 'model-error' : undefined}
                onChange={(event) => setModel(event.target.value)}
              />
            </label>
            {validationErrors.model && (
              <p className="form-error" id="model-error">{validationErrors.model}</p>
            )}
          </div>
        </section>

        <section className="settings-section" aria-labelledby="credential-heading">
          <div>
            <h2 id="credential-heading">Credential</h2>
            <p>The API key is stored by the operating system credential service.</p>
          </div>
          <div className="settings-fields">
            <label>
              <span className="field-label">API key</span>
              <input
                ref={keyRef}
                name="apiKey"
                type="password"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <div className="credential-status">
              <span className={settings.hasApiKey ? 'key-present' : ''}>
                {settings.hasApiKey ? 'API key configured' : 'No API key configured'}
              </span>
              {settings.hasApiKey && (
                <button
                  className="text-button"
                  type="button"
                  disabled={clearState === 'working'}
                  onClick={() => void clearCredential()}
                >
                  {clearState === 'working' ? 'Clearing…' : 'Clear API key'}
                </button>
              )}
            </div>
            {clearState === 'failed' && (
              <p className="form-error" role="alert">
                The API key could not be cleared. Please try again.
              </p>
            )}
          </div>
        </section>

        <div className="settings-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={!settings.hasApiKey || connectionState === 'working'}
            onClick={() => void testConnection()}
          >
            {connectionState === 'working'
              ? 'Testing connection…'
              : connectionState === 'failed'
                ? 'Retry connection'
                : 'Test connection'}
          </button>
          <button className="primary-button" type="submit" disabled={saveState === 'working'}>
            {saveState === 'working'
              ? 'Saving…'
              : saveState === 'failed'
                ? 'Retry save'
                : 'Save settings'}
          </button>
        </div>

        <div className="settings-messages" aria-live="polite">
          {saveState === 'success' && <p role="status">Settings saved.</p>}
          {saveState === 'failed' && (
            <p className="form-error" role="alert">
              Settings could not be saved. Please try again.
            </p>
          )}
          {connectionState === 'success' && <p role="status">Connection successful.</p>}
          {connectionState === 'failed' && (
            <p className="form-error" role="alert">
              Connection failed. Check the endpoint, model, API key, and network.
            </p>
          )}
        </div>
      </form>
    </div>
  )
}

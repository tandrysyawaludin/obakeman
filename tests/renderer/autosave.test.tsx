// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '../../src/shared/contracts'
import { App } from '../../src/renderer/src/App'
import { createBridge, problems } from '../fixtures/bridge'

vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    onChange
  }: {
    value?: string
    onChange?: (value: string | undefined) => void
  }) => (
    <textarea
      aria-label="Code editor"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    />
  )
}))

const activeSession: Session = {
  id: 'session-active',
  problemId: 'pair-sum',
  status: 'in_progress',
  createdAt: '2026-11-05T07:00:00.000Z',
  updatedAt: '2026-11-05T07:00:00.000Z',
  startedAt: '2026-11-05T07:00:00.000Z',
  durationMinutes: 30,
  code: 'starter'
}

function setup() {
  const bridge = createBridge({ problems })
  vi.mocked(bridge.sessions.get).mockResolvedValue(activeSession)
  vi.mocked(bridge.settings.get).mockResolvedValue({
    endpoint: 'https://api.example.com',
    model: 'test-model',
    hasApiKey: true
  })
  window.obakeman = bridge
  window.location.hash = '#practice/session-active'
  return bridge
}

describe('workspace autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-11-05T07:05:00.000Z'))
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('debounces saves for 400ms and persists only the newest code', async () => {
    const bridge = setup()
    render(<App />)

    const editor = await screen.findByLabelText('Code editor')
    fireEvent.change(editor, { target: { value: 'first' } })
    fireEvent.change(editor, { target: { value: 'latest' } })

    expect(bridge.sessions.save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(399)
    expect(bridge.sessions.save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(bridge.sessions.save).toHaveBeenCalledOnce()
    expect(bridge.sessions.save).toHaveBeenLastCalledWith(expect.objectContaining({
      code: 'latest'
    }))
  })

  it('flushes a rapid edit before signaling close readiness', async () => {
    const bridge = setup()
    let beforeClose: (() => void | Promise<void>) | undefined
    let resolveSave: ((session: Session) => void) | undefined
    vi.mocked(bridge.onBeforeClose).mockImplementation((callback) => {
      beforeClose = callback
      return vi.fn()
    })
    vi.mocked(bridge.sessions.save).mockImplementation((saved) => new Promise((resolve) => {
      resolveSave = resolve
    }))
    render(<App />)

    const editor = await screen.findByLabelText('Code editor')
    fireEvent.change(editor, { target: { value: 'latest rapid edit' } })
    expect(bridge.sessions.save).not.toHaveBeenCalled()

    const closing = beforeClose?.()
    expect(bridge.sessions.save).toHaveBeenCalledWith(expect.objectContaining({
      code: 'latest rapid edit'
    }))
    expect(bridge.closeReady).not.toHaveBeenCalled()

    resolveSave?.({ ...activeSession, code: 'latest rapid edit' })
    await closing
    expect(bridge.closeReady).toHaveBeenCalledOnce()
  })

  it('always signals close readiness after a failed flush', async () => {
    const bridge = setup()
    let beforeClose: (() => void | Promise<void>) | undefined
    vi.mocked(bridge.onBeforeClose).mockImplementation((callback) => {
      beforeClose = callback
      return vi.fn()
    })
    vi.mocked(bridge.sessions.save).mockRejectedValue(new Error('disk unavailable'))
    render(<App />)

    await screen.findByLabelText('Code editor')
    await beforeClose?.()

    expect(bridge.closeReady).toHaveBeenCalledOnce()
  })

  it('shows a background save failure and retries the latest code', async () => {
    const bridge = setup()
    vi.mocked(bridge.sessions.save)
      .mockRejectedValueOnce(new Error('disk unavailable'))
      .mockImplementationOnce(async (saved) => saved)
    render(<App />)

    const editor = await screen.findByLabelText('Code editor')
    fireEvent.change(editor, { target: { value: 'latest unsaved edit' } })
    await vi.advanceTimersByTimeAsync(400)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Latest changes could not be saved.'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))

    expect(bridge.sessions.save).toHaveBeenCalledTimes(2)
    expect(bridge.sessions.save).toHaveBeenLastCalledWith(expect.objectContaining({
      code: 'latest unsaved edit'
    }))
    expect(screen.queryByText('Latest changes could not be saved.')).not.toBeInTheDocument()
  })

  it('signals that close proceeds after an attempted failed flush', async () => {
    const bridge = setup()
    let beforeClose: (() => void | Promise<void>) | undefined
    vi.mocked(bridge.onBeforeClose).mockImplementation((callback) => {
      beforeClose = callback
      return vi.fn()
    })
    vi.mocked(bridge.sessions.save).mockRejectedValue(new Error('disk unavailable'))
    render(<App />)

    const editor = await screen.findByLabelText('Code editor')
    fireEvent.change(editor, { target: { value: 'not persisted' } })
    await beforeClose?.()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The final save failed. Obakeman will still close'
    )
    expect(bridge.sessions.save).toHaveBeenCalledOnce()
    expect(bridge.closeReady).toHaveBeenCalledOnce()
  })

  it('subscribes only while mounted and unsubscribes on unmount', async () => {
    const bridge = setup()
    const unsubscribe = vi.fn()
    vi.mocked(bridge.onBeforeClose).mockReturnValue(unsubscribe)

    const view = render(<App />)
    await screen.findByLabelText('Code editor')
    expect(bridge.onBeforeClose).toHaveBeenCalledOnce()

    view.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})

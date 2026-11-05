// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session, TestRunResult } from '../../src/shared/contracts'
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

const startedAt = '2026-11-05T07:00:00.000Z'

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-active',
    problemId: 'pair-sum',
    status: 'in_progress',
    createdAt: startedAt,
    updatedAt: startedAt,
    startedAt,
    durationMinutes: 30,
    code: '',
    ...overrides
  }
}

function runResult(overrides: Partial<TestRunResult> = {}): TestRunResult {
  return {
    status: 'passed',
    visible: [
      { name: 'first', passed: true },
      { name: 'second', passed: true },
      { name: 'third', passed: true }
    ],
    console: [],
    outputTruncated: false,
    ...overrides
  }
}

function renderWorkspace(options: {
  hasApiKey?: boolean
  activeSession?: Session
} = {}) {
  const bridge = createBridge({ problems })
  vi.mocked(bridge.sessions.get).mockResolvedValue(options.activeSession ?? session())
  vi.mocked(bridge.settings.get).mockResolvedValue({
    endpoint: 'https://api.example.com',
    model: 'test-model',
    hasApiKey: options.hasApiKey ?? true
  })
  vi.mocked(bridge.runner.run).mockResolvedValue(runResult())
  vi.mocked(bridge.ai.requestHint).mockResolvedValue({ text: 'Track each value by index.' })
  vi.mocked(bridge.sessions.complete).mockImplementation(async (input) => ({
    ...session(),
    status: 'feedback_pending',
    code: input.code,
    testResult: input.testResult,
    completedAt: '2026-11-05T07:12:00.000Z'
  }))
  window.obakeman = bridge
  window.location.hash = '#practice/session-active'
  return { bridge, user: userEvent.setup() }
}

describe('practice workspace', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-11-05T07:10:00.000Z'))
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('runs edited code and renders visible test results', async () => {
    const { bridge, user } = renderWorkspace()
    render(<App />)

    const editor = await screen.findByLabelText('Code editor')
    fireEvent.change(editor, {
      target: { value: 'function pairSum() { return [0, 1] }' }
    })
    await user.click(screen.getByRole('button', { name: 'Run tests' }))

    expect(bridge.runner.run).toHaveBeenCalledWith({
      sessionId: 'session-active',
      code: expect.stringContaining('pairSum'),
      includeHidden: false
    })
    expect(await screen.findByText('3 of 3 visible tests passed')).toBeVisible()
  })

  it('keeps practice available when AI is not configured', async () => {
    renderWorkspace({ hasApiKey: false })
    render(<App />)

    expect(await screen.findByRole('button', { name: 'Run tests' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Get a hint' })).toBeDisabled()
    expect(screen.getByText('Configure AI in Settings to use hints')).toBeVisible()
  })

  it('derives the countdown from the persisted start time', async () => {
    renderWorkspace()
    render(<App />)

    expect(await screen.findByRole('timer')).toHaveTextContent('20:00')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(screen.getByRole('timer')).toHaveTextContent('19:58')
  })

  it('renders timeout, runtime failures, failed assertions, and truncated output', async () => {
    const { bridge, user } = renderWorkspace()
    vi.mocked(bridge.runner.run)
      .mockResolvedValueOnce(runResult({
        status: 'failed',
        visible: [{
          name: 'finds a pair',
          passed: false,
          expected: [0, 1],
          actual: [1, 2]
        }],
        console: ['debug line'],
        outputTruncated: true
      }))
      .mockResolvedValueOnce(runResult({
        status: 'timeout',
        visible: [],
        error: 'Execution exceeded the time limit.'
      }))
      .mockResolvedValueOnce(runResult({
        status: 'runtime_error',
        visible: [],
        error: 'pairSum is not defined'
      }))
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Run tests' }))
    expect(await screen.findByText(/Expected.*0.*1.*received.*1.*2/i)).toBeVisible()
    expect(screen.getByText('Output was truncated.')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Run tests' }))
    expect(await screen.findByText('Execution timed out')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Run tests' }))
    expect(await screen.findByText('Runtime error')).toBeVisible()
    expect(screen.getByText('pairSum is not defined')).toBeVisible()
  })

  it('shows retryable hint failures and prevents duplicate hint requests', async () => {
    const { bridge, user } = renderWorkspace()
    let rejectHint: ((error: Error) => void) | undefined
    vi.mocked(bridge.ai.requestHint).mockImplementation(() => new Promise((_, reject) => {
      rejectHint = reject
    }))
    render(<App />)

    const hintButton = await screen.findByRole('button', { name: 'Get a hint' })
    await user.click(hintButton)
    expect(screen.getByRole('button', { name: 'Getting hint…' })).toBeDisabled()
    expect(bridge.ai.requestHint).toHaveBeenCalledOnce()

    rejectHint?.(new Error('network unavailable'))
    expect(await screen.findByText('Hint unavailable. Check your connection and try again.'))
      .toBeVisible()
  })

  it('finishes with hidden results and navigates without requesting AI review', async () => {
    const { bridge, user } = renderWorkspace({
      activeSession: session({ code: 'function pairSum() { return [0, 1] }' })
    })
    const hiddenResult = runResult({
      hidden: { passed: 4, total: 5 }
    })
    vi.mocked(bridge.runner.run).mockResolvedValue(hiddenResult)
    render(<App />)

    const finishButton = await screen.findByRole('button', { name: 'Finish interview' })
    await user.click(finishButton)

    await waitFor(() => expect(bridge.sessions.complete).toHaveBeenCalledWith({
      id: 'session-active',
      code: 'function pairSum() { return [0, 1] }',
      testResult: hiddenResult
    }))
    expect(bridge.runner.run).toHaveBeenCalledWith(expect.objectContaining({
      includeHidden: true
    }))
    expect(bridge.ai.requestReview).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('#review/session-active')
  })
})

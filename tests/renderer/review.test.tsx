// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReviewFeedback, Session, TestRunResult } from '../../src/shared/contracts'
import { App } from '../../src/renderer/src/App'
import { createBridge, problems } from '../fixtures/bridge'

const testResult: TestRunResult = {
  status: 'failed',
  visible: [
    { name: 'sample one', passed: true },
    { name: 'sample two', passed: false, expected: [0, 1], actual: [1, 2] }
  ],
  hidden: { passed: 7, total: 8 },
  console: [],
  outputTruncated: false
}

const structuredFeedback: ReviewFeedback = {
  format: 'structured',
  correctness: 'The solution handles the main path but misses duplicate values.',
  timeComplexity: 'O(n²)',
  spaceComplexity: 'O(1)',
  codeQuality: 'The naming is clear and the control flow is easy to follow.',
  strengths: ['Readable variable names', 'Returns as soon as a match is found'],
  improvements: ['Use a map to avoid the nested scan'],
  suggestedSolution: 'Track each value and index in a map while scanning once.',
  explanation: 'A map trades linear extra space for linear running time.'
}

function completedSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-review',
    problemId: 'pair-sum',
    status: 'feedback_failed',
    createdAt: '2026-11-05T07:00:00.000Z',
    updatedAt: '2026-11-05T07:15:00.000Z',
    startedAt: '2026-11-05T07:00:00.000Z',
    completedAt: '2026-11-05T07:15:00.000Z',
    durationMinutes: 30,
    code: 'function pairSum(values, target) { return [] }',
    testResult,
    ...overrides
  }
}

function renderReview(session = completedSession()) {
  const bridge = createBridge({ problems })
  vi.mocked(bridge.sessions.get).mockResolvedValue(session)
  vi.mocked(bridge.ai.requestReview).mockResolvedValue(structuredFeedback)
  window.obakeman = bridge
  window.location.hash = '#review/session-review'
  return { bridge, user: userEvent.setup() }
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

it('shows deterministic results while failed feedback is retryable', async () => {
  const { bridge } = renderReview()
  render(<App />)

  expect(await screen.findByText('8 of 10 tests passed')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Retry AI feedback' })).toBeVisible()
  expect(screen.getByText('O(n) time · O(n) space')).toBeVisible()
  expect(bridge.ai.requestReview).not.toHaveBeenCalled()
})

it('requests absent feedback once and renders structured sections', async () => {
  const { bridge } = renderReview(completedSession({ status: 'feedback_pending' }))
  render(<App />)

  expect(await screen.findByRole('heading', { name: 'Complexity' })).toBeVisible()
  expect(screen.getByText('O(n²) time')).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Strengths' })).toBeVisible()
  expect(bridge.ai.requestReview).toHaveBeenCalledOnce()
  expect(bridge.ai.requestReview).toHaveBeenCalledWith('session-review')
})

it('records a failed automatic request so reopening requires an explicit retry', async () => {
  const pending = completedSession({ status: 'feedback_pending' })
  const { bridge } = renderReview(pending)
  vi.mocked(bridge.ai.requestReview).mockRejectedValue(new Error('offline'))
  render(<App />)

  expect(await screen.findByRole('button', { name: 'Retry AI feedback' })).toBeVisible()
  expect(bridge.sessions.save).toHaveBeenCalledWith({
    ...pending,
    status: 'feedback_failed'
  })
})

it('renders saved feedback without requesting AI again', async () => {
  const { bridge } = renderReview(completedSession({
    status: 'completed',
    feedback: structuredFeedback
  }))
  render(<App />)

  expect(await screen.findByRole('heading', { name: 'Complexity' })).toBeVisible()
  expect(bridge.ai.requestReview).not.toHaveBeenCalled()
})

it('renders bounded plain-text feedback as text', async () => {
  const text = '<script>alert("no")</script>\nKeep the nested loops only for tiny inputs.'
  renderReview(completedSession({
    status: 'completed',
    feedback: { format: 'plain_text', text }
  }))
  render(<App />)

  const fallback = await screen.findByText(/Keep the nested loops only for tiny inputs/)
  expect(fallback.textContent).toBe(text)
  expect(document.querySelector('script')).not.toBeInTheDocument()
})

it('retries feedback only after an explicit retry', async () => {
  const { bridge, user } = renderReview()
  render(<App />)

  await user.click(await screen.findByRole('button', { name: 'Retry AI feedback' }))

  await waitFor(() => expect(bridge.ai.requestReview).toHaveBeenCalledOnce())
  expect(await screen.findByRole('heading', { name: 'Complexity' })).toBeVisible()
})

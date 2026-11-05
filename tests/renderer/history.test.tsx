// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import type { Session, SessionSummary } from '../../src/shared/contracts'
import { App } from '../../src/renderer/src/App'
import { createBridge, problems } from '../fixtures/bridge'

const sessions: SessionSummary[] = [
  {
    id: 'session-older',
    problemId: 'easy-array',
    status: 'completed',
    createdAt: '2026-11-03T07:00:00.000Z',
    updatedAt: '2026-11-03T07:20:00.000Z',
    startedAt: '2026-11-03T07:00:00.000Z',
    completedAt: '2026-11-03T07:20:00.000Z',
    durationMinutes: 30
  },
  {
    id: 'session-newer',
    problemId: 'pair-sum',
    status: 'completed',
    createdAt: '2026-11-05T07:00:00.000Z',
    updatedAt: '2026-11-05T07:12:00.000Z',
    startedAt: '2026-11-05T07:00:00.000Z',
    completedAt: '2026-11-05T07:12:00.000Z',
    durationMinutes: 45
  }
]

const savedSession: Session = {
  ...sessions[1],
  code: 'function pairSum(values, target) { return [0, 1] }',
  testResult: {
    status: 'failed',
    visible: [{ name: 'sample', passed: true }],
    hidden: { passed: 7, total: 9 },
    console: [],
    outputTruncated: false
  },
  feedback: {
    format: 'structured',
    correctness: 'Correct for the supplied cases.',
    timeComplexity: 'O(n)',
    spaceComplexity: 'O(n)',
    codeQuality: 'Clear and focused.',
    strengths: ['Single pass'],
    improvements: ['Document duplicate handling'],
    suggestedSolution: 'Keep the map-based approach.',
    explanation: 'Each value is visited once.'
  }
}

function renderHistory() {
  const bridge = createBridge({ problems, sessions })
  vi.mocked(bridge.sessions.get).mockResolvedValue(savedSession)
  window.obakeman = bridge
  window.location.hash = '#history'
  return { bridge, user: userEvent.setup() }
}

afterEach(cleanup)

it('sorts sessions newest-first and shows complete session facts', async () => {
  const { bridge } = renderHistory()
  vi.mocked(bridge.sessions.get)
    .mockImplementation(async (id) => id === 'session-newer'
      ? savedSession
      : {
          ...sessions[0],
          code: 'function firstItem(values) { return values[0] }',
          testResult: {
            status: 'passed',
            visible: [{ name: 'sample', passed: true }],
            hidden: { passed: 4, total: 4 },
            console: [],
            outputTruncated: false
          }
        })
  render(<App />)

  const list = await screen.findByRole('list', { name: 'Practice history' })
  const links = within(list).getAllByRole('link')
  expect(links.map((link) => link.textContent)).toEqual([
    expect.stringContaining('Pair Sum'),
    expect.stringContaining('Easy Array')
  ])
  expect(links[0]).toHaveTextContent(/medium/i)
  expect(links[0]).toHaveTextContent('12 min')
  expect(links[0]).toHaveTextContent('8/10 tests')
  expect(links[0]).toHaveTextContent('Nov 5, 2026')
})

it('opens a saved session without requesting AI again', async () => {
  const { bridge, user } = renderHistory()
  render(<App />)

  await user.click(await screen.findByRole('link', { name: /Pair Sum/ }))

  expect(await screen.findByRole('heading', { name: 'Complexity' })).toBeVisible()
  expect(bridge.ai.requestReview).not.toHaveBeenCalled()
})

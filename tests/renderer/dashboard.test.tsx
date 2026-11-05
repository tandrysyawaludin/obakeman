// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/renderer/src/App'
import type { SessionSummary } from '../../src/shared/contracts'
import { createBridge } from '../fixtures/bridge'

describe('dashboard', () => {
  beforeEach(() => {
    window.location.hash = '#dashboard'
  })

  afterEach(() => {
    cleanup()
  })

  it('shows first-run guidance and starts practice', async () => {
    window.obakeman = createBridge({ sessions: [] })
    const user = userEvent.setup()

    render(<App />)

    expect(await screen.findByText('Your next interview starts here')).toBeVisible()
    expect(screen.getByText('Pick a problem, set the clock, and practice out loud.')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Start practice' }))

    expect(await screen.findByRole('heading', { name: 'Choose a problem' })).toBeVisible()
    expect(window.location.hash).toBe('#library')
  })

  it('shows recent practice and progress', async () => {
    const session: SessionSummary = {
      id: 'session-one',
      problemId: 'pair-sum',
      status: 'feedback_pending',
      createdAt: '2026-11-04T10:00:00.000Z',
      updatedAt: '2026-11-04T10:45:00.000Z',
      startedAt: '2026-11-04T10:00:00.000Z',
      completedAt: '2026-11-04T10:45:00.000Z',
      durationMinutes: 45
    }
    window.obakeman = createBridge({ sessions: [session] })

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeVisible()
    expect(screen.getByText('1 completed')).toBeVisible()
    expect(screen.getByRole('link', { name: /Pair Sum/ })).toHaveAttribute(
      'href',
      '#review/session-one'
    )
  })

  it('reports a session-history failure without losing problem data', async () => {
    const bridge = createBridge()
    vi.mocked(bridge.sessions.list).mockRejectedValue(new Error('history unavailable'))
    window.obakeman = bridge

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Practice history could not be loaded.'
    )
    expect(screen.getByText(/Choose one of 3 problems/)).toBeVisible()
  })
})

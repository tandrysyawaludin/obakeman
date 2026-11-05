// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/renderer/src/App'
import { createBridge, problems } from '../fixtures/bridge'

describe('problem library', () => {
  beforeEach(() => {
    window.location.hash = '#library'
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: vi.fn(function showModal(this: HTMLDialogElement) {
        this.open = true
      })
    })
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: vi.fn(function close(this: HTMLDialogElement) {
        this.open = false
      })
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('filters problems by difficulty and topic', async () => {
    window.obakeman = createBridge({ problems })
    const user = userEvent.setup()

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Choose a problem' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Medium' }))

    expect(screen.queryByText('Easy Array')).not.toBeInTheDocument()
    expect(screen.getByText('Pair Sum')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'All levels' }))
    await user.selectOptions(screen.getByLabelText('Topic'), 'Graphs')

    expect(screen.getByText('Graph Route')).toBeVisible()
    expect(screen.queryByText('Pair Sum')).not.toBeInTheDocument()
  })

  it('creates a timed session and navigates to practice', async () => {
    window.obakeman = createBridge({ problems })
    const user = userEvent.setup()

    render(<App />)

    await user.click(await screen.findByRole('button', { name: /Pair Sum/ }))

    const dialog = screen.getByRole('dialog', { name: 'Set up your interview' })
    await user.selectOptions(within(dialog).getByLabelText('Duration'), '45')
    await user.click(within(dialog).getByRole('button', { name: 'Begin interview' }))

    expect(window.obakeman.sessions.create).toHaveBeenCalledWith({
      problemId: 'pair-sum',
      durationMinutes: 45
    })
    expect(window.location.hash).toBe('#practice/session-new')
  })

  it('opens a modal, moves focus inside, and closes on cancel', async () => {
    window.obakeman = createBridge({ problems })
    const user = userEvent.setup()

    render(<App />)

    await user.click(await screen.findByRole('button', { name: /Pair Sum/ }))

    const dialog = screen.getByRole('dialog', { name: 'Set up your interview' })
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce()
    await waitFor(() => expect(within(dialog).getByLabelText('Duration')).toHaveFocus())

    fireEvent(dialog, new Event('cancel', { cancelable: true }))

    expect(HTMLDialogElement.prototype.close).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog', { name: 'Set up your interview' }))
      .not.toBeInTheDocument()
  })

  it('keeps the problem library available when session history fails', async () => {
    const bridge = createBridge({ problems })
    vi.mocked(bridge.sessions.list).mockRejectedValue(new Error('history unavailable'))
    window.obakeman = bridge

    render(<App />)

    expect(await screen.findByText('Pair Sum')).toBeVisible()
    expect(screen.getByText('3 available')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reports a problem-library failure specifically', async () => {
    const bridge = createBridge()
    vi.mocked(bridge.problems.list).mockRejectedValue(new Error('catalog unavailable'))
    window.obakeman = bridge

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The problem library could not be loaded.'
    )
    expect(screen.queryByText('practice history')).not.toBeInTheDocument()
  })
})

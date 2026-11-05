// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from '../../src/renderer/src/App'
import { createBridge, problems } from '../fixtures/bridge'

describe('problem library', () => {
  beforeEach(() => {
    window.location.hash = '#library'
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
})

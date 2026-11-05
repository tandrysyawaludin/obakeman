// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { App } from '../../src/renderer/src/App'
import { createBridge } from '../fixtures/bridge'

function renderSettings(hasApiKey = false) {
  const bridge = createBridge()
  vi.mocked(bridge.settings.get).mockResolvedValue({
    endpoint: 'https://api.example.com/v1/chat/completions',
    model: 'example-model',
    hasApiKey
  })
  vi.mocked(bridge.settings.save).mockImplementation(async (input) => ({
    ...input,
    hasApiKey
  }))
  window.obakeman = bridge
  window.location.hash = '#settings'
  return { bridge, user: userEvent.setup() }
}

beforeEach(() => window.localStorage.clear())
afterEach(cleanup)

it('submits the credential without putting it in browser storage or settings', async () => {
  const { bridge, user } = renderSettings()
  render(<App />)

  const password = await screen.findByLabelText('API key')
  await user.type(password, 'secret-value')
  await user.click(screen.getByRole('button', { name: 'Save settings' }))

  await waitFor(() => {
    expect(bridge.settings.saveCredential).toHaveBeenCalledWith('secret-value')
  })
  expect(bridge.settings.save).toHaveBeenCalledWith({
    endpoint: 'https://api.example.com/v1/chat/completions',
    model: 'example-model'
  })
  expect(window.localStorage.length).toBe(0)
  expect(password).toHaveValue('')
})

it('validates endpoint and model before saving', async () => {
  const { bridge, user } = renderSettings()
  render(<App />)

  const endpoint = await screen.findByLabelText('Endpoint')
  const model = screen.getByLabelText('Model')
  const password = screen.getByLabelText('API key')
  await user.clear(endpoint)
  await user.type(endpoint, 'not-a-url')
  await user.clear(model)
  await user.type(password, 'discarded-secret')
  await user.click(screen.getByRole('button', { name: 'Save settings' }))

  expect(await screen.findByText('Enter a valid HTTP or HTTPS endpoint.')).toBeVisible()
  expect(screen.getByText('Enter a model name.')).toBeVisible()
  expect(bridge.settings.save).not.toHaveBeenCalled()
  expect(bridge.settings.saveCredential).not.toHaveBeenCalled()
  expect(password).toHaveValue('')
})

it('tests the saved connection and exposes retry after failure', async () => {
  const { bridge, user } = renderSettings(true)
  vi.mocked(bridge.ai.testConnection)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ ok: true })
  render(<App />)

  await user.click(await screen.findByRole('button', { name: 'Test connection' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Connection failed. Check the endpoint, model, API key, and network.'
  )

  await user.click(screen.getByRole('button', { name: 'Retry connection' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Connection successful.')
  expect(bridge.ai.testConnection).toHaveBeenCalledTimes(2)
})

it('shows key status and clears the stored credential', async () => {
  const { bridge, user } = renderSettings(true)
  render(<App />)

  expect(await screen.findByText('API key configured')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Clear API key' }))

  await waitFor(() => expect(bridge.settings.clearCredential).toHaveBeenCalledOnce())
  expect(screen.getByText('No API key configured')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Clear API key' })).not.toBeInTheDocument()
})

it('shows a retryable save error and always clears the credential field', async () => {
  const { bridge, user } = renderSettings()
  vi.mocked(bridge.settings.saveCredential).mockRejectedValueOnce(new Error('locked'))
  render(<App />)

  const password = await screen.findByLabelText('API key')
  await user.type(password, 'temporary-secret')
  await user.click(screen.getByRole('button', { name: 'Save settings' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Settings could not be saved. Please try again.'
  )
  expect(screen.getByRole('button', { name: 'Retry save' })).toBeVisible()
  expect(password).toHaveValue('')
})

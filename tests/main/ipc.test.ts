import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import {
  installCloseHandshake,
  registerIpcHandlers,
  type IpcDependencies,
  type IpcMainLike
} from '../../src/main/ipc'
import { CHANNELS } from '../../src/shared/channels'
import type { IpcResponse, Problem, Session, Settings } from '../../src/shared/contracts'

const problem: Problem = {
  id: 'pair-sum',
  title: 'Pair Sum',
  difficulty: 'easy',
  topics: ['arrays'],
  description: 'Find a matching pair.',
  constraints: ['Two or more values'],
  examples: [{ input: '[2, 7], 9', output: '[0, 1]' }],
  functionName: 'pairSum',
  starterCode: 'function pairSum() {}',
  visibleTests: [{ name: 'visible', args: [[2, 7], 9], expected: [0, 1] }],
  hiddenTests: [{ name: 'hidden', args: [[3, 6], 9], expected: [0, 1] }],
  referenceComplexity: { time: 'O(n)', space: 'O(n)' }
}

const session: Session = {
  id: 'session-one',
  problemId: problem.id,
  status: 'in_progress',
  createdAt: '2026-11-05T07:00:00.000Z',
  updatedAt: '2026-11-05T07:00:00.000Z',
  startedAt: '2026-11-05T07:00:00.000Z',
  durationMinutes: 30,
  code: problem.starterCode
}

const settings: Settings = {
  endpoint: 'https://provider.example/v1/chat/completions',
  model: 'interview-model',
  hasApiKey: true
}

function setup(overrides: Partial<IpcDependencies> = {}) {
  const handlers = new Map<string, (event: unknown, input?: unknown) => Promise<IpcResponse<unknown>>>()
  const ipcMain: IpcMainLike = {
    handle: (channel, handler) => {
      handlers.set(channel, handler)
    },
    removeHandler: vi.fn()
  }
  const dependencies: IpcDependencies = {
    problems: {
      listProblems: vi.fn(() => [{ ...problem, hiddenTests: undefined }]),
      getProblem: vi.fn(() => problem)
    },
    sessions: {
      listSessions: vi.fn(async () => [session]),
      getSession: vi.fn(async () => session),
      saveSession: vi.fn(async () => undefined)
    },
    runner: {
      runProblemCode: vi.fn(async () => ({
        status: 'passed',
        visible: [{ name: 'visible', passed: true }],
        hidden: { passed: 1, total: 1 },
        console: [],
        outputTruncated: false
      }))
    },
    credentials: {
      hasApiKey: vi.fn(async () => true),
      getApiKey: vi.fn(async () => 'super-secret'),
      setApiKey: vi.fn(async () => undefined),
      clearApiKey: vi.fn(async () => undefined)
    },
    ai: {
      requestHint: vi.fn(async () => ({ text: 'Use a map.' })),
      requestReview: vi.fn(async () => ({
        format: 'plain_text' as const,
        text: 'Good work.'
      })),
      testConnection: vi.fn(async () => ({ ok: true as const }))
    },
    settings: {
      getSettings: vi.fn(async () => settings),
      saveSettings: vi.fn(async () => undefined)
    },
    now: () => new Date('2026-11-05T07:30:00.000Z'),
    createId: () => 'created-session',
    ...overrides
  }
  registerIpcHandlers(ipcMain, dependencies)

  async function invoke<T>(channel: string, input?: unknown): Promise<T> {
    const response = await handlers.get(channel)!({}, input)
    if (!response.ok) throw response.error
    return response.value as T
  }

  return { dependencies, invoke }
}

describe('validated IPC handlers', () => {
  it('rejects invalid IDs before reaching services', async () => {
    const { dependencies, invoke } = setup()

    await expect(invoke(CHANNELS.sessionsGet, { id: '../secrets' })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      retryable: false
    })
    expect(dependencies.sessions.getSession).not.toHaveBeenCalled()
  })

  it('never returns plaintext credentials', async () => {
    const { invoke } = setup()

    const result = await invoke<{ hasApiKey: boolean }>(CHANNELS.settingsGet)

    expect(JSON.stringify(result)).not.toContain('super-secret')
    expect(result.hasApiKey).toBe(true)
  })

  it('returns a serializable error envelope without stack or secret details', async () => {
    const { invoke } = setup({
      runner: {
        runProblemCode: vi.fn(async () => {
          throw new Error('boom super-secret')
        })
      }
    })

    let error: unknown
    try {
      await invoke(CHANNELS.runnerRun, {
        sessionId: session.id,
        code: session.code,
        includeHidden: false
      })
    } catch (caught) {
      error = caught
    }

    expect(error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'The request could not be completed.',
      retryable: false
    })
    expect(JSON.stringify(error)).not.toContain('stack')
    expect(() => structuredClone(error)).not.toThrow()
  })

  it('validates service outputs before returning them', async () => {
    const { invoke } = setup({
      sessions: {
        listSessions: vi.fn(async () => [{ ...session, id: '../invalid' } as Session]),
        getSession: vi.fn(async () => session),
        saveSession: vi.fn(async () => undefined)
      }
    })

    await expect(invoke(CHANNELS.sessionsList)).rejects.toEqual({
      code: 'INTERNAL_ERROR',
      message: 'The request could not be completed.',
      retryable: false
    })
  })

  it('creates and persists a validated session', async () => {
    const { dependencies, invoke } = setup()

    const created = await invoke<Session>(CHANNELS.sessionsCreate, {
      problemId: problem.id,
      durationMinutes: 45
    })

    expect(created).toMatchObject({
      id: 'created-session',
      problemId: problem.id,
      durationMinutes: 45,
      status: 'in_progress',
      code: problem.starterCode
    })
    expect(dependencies.sessions.saveSession).toHaveBeenCalledWith(created)
  })

  it('runs code using the main-process problem catalog', async () => {
    const { dependencies, invoke } = setup()

    await invoke(CHANNELS.runnerRun, {
      sessionId: session.id,
      code: 'function pairSum() { return [0, 1] }',
      includeHidden: false
    })

    expect(dependencies.runner.runProblemCode).toHaveBeenCalledWith({
      problem,
      code: 'function pairSum() { return [0, 1] }',
      includeHidden: false
    })
  })

  it('does not persist a credential in public settings', async () => {
    const { dependencies, invoke } = setup()

    const result = await invoke(CHANNELS.settingsSaveCredential, { apiKey: 'new-secret' })

    expect(dependencies.credentials.setApiKey).toHaveBeenCalledWith('new-secret')
    expect(result).toEqual({ hasApiKey: true })
    expect(dependencies.settings.saveSettings).not.toHaveBeenCalled()
  })
})

class FakeIpcMain extends EventEmitter implements IpcMainLike {
  handle(): void {}
  removeHandler(): void {}
}

class FakeWindow extends EventEmitter {
  readonly webContents = {
    id: 42,
    send: vi.fn()
  }
  destroy = vi.fn()
  isDestroyed = vi.fn(() => false)
}

describe('close handshake', () => {
  it('does not prevent close when no renderer listener is active', () => {
    const ipcMain = new FakeIpcMain()
    const window = new FakeWindow()
    installCloseHandshake(window, ipcMain, { timeoutMs: 2_000 })
    const event = { preventDefault: vi.fn() }

    window.emit('close', event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(window.webContents.send).not.toHaveBeenCalled()
  })

  it('waits for renderer readiness and then force-closes', () => {
    vi.useFakeTimers()
    const ipcMain = new FakeIpcMain()
    const window = new FakeWindow()
    installCloseHandshake(window, ipcMain, { timeoutMs: 2_000 })
    ipcMain.emit(CHANNELS.closeListenerChanged, { sender: window.webContents }, true)
    const event = { preventDefault: vi.fn() }

    window.emit('close', event)
    ipcMain.emit(CHANNELS.closeReady, { sender: window.webContents })

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(window.webContents.send).toHaveBeenCalledWith(CHANNELS.beforeClose)
    expect(window.destroy).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('force-closes after the two-second ceiling and cleans up listeners', () => {
    vi.useFakeTimers()
    const ipcMain = new FakeIpcMain()
    const window = new FakeWindow()
    installCloseHandshake(window, ipcMain, { timeoutMs: 2_000 })
    ipcMain.emit(CHANNELS.closeListenerChanged, { sender: window.webContents }, true)
    const event = { preventDefault: vi.fn() }

    window.emit('close', event)
    vi.advanceTimersByTime(1_999)
    expect(window.destroy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(window.destroy).toHaveBeenCalledOnce()

    window.emit('closed')
    expect(ipcMain.listenerCount(CHANNELS.closeReady)).toBe(0)
    expect(ipcMain.listenerCount(CHANNELS.closeListenerChanged)).toBe(0)
    vi.useRealTimers()
  })
})

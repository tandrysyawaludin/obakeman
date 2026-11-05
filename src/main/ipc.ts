import { z } from 'zod'
import { AiClientError, type AiClient } from './ai/client'
import { CredentialError, type CredentialStore } from './persistence/credentials'
import { StoreError, type LocalStore } from './persistence/store'
import { CHANNELS } from '../shared/channels'
import {
  completeSessionInputSchema,
  createSessionInputSchema,
  hintRequestSchema,
  hintSchema,
  idSchema,
  ipcErrorSchema,
  problemSummarySchema,
  publicSettingsInputSchema,
  publicSettingsSchema,
  reviewFeedbackSchema,
  runRequestSchema,
  sessionSchema,
  sessionSummarySchema,
  testRunResultSchema,
  type IpcError,
  type IpcResponse,
  type Problem,
  type ProblemSummary,
  type Session,
  type Settings
} from '../shared/contracts'

const emptyInputSchema = z.undefined()
const idInputSchema = z.object({ id: idSchema })
const apiKeyInputSchema = z.object({ apiKey: z.string().min(1).max(16_384) })
const okSchema = z.object({ ok: z.literal(true) })
const hasApiKeyTrueSchema = z.object({ hasApiKey: z.literal(true) })
const hasApiKeyFalseSchema = z.object({ hasApiKey: z.literal(false) })
const nullableProblemSummarySchema = problemSummarySchema.nullable()
const nullableSessionSchema = sessionSchema.nullable()

const DEFAULT_SETTINGS: Settings = {
  endpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4o-mini',
  hasApiKey: false
}

type Handler = (event: unknown, input?: unknown) => Promise<IpcResponse<unknown>>

export interface IpcMainLike {
  handle(channel: string, handler: Handler): void
  removeHandler(channel: string): void
  on?(
    channel: string,
    listener: (event: { sender: WebContentsLike }, value?: unknown) => void
  ): unknown
  removeListener?(
    channel: string,
    listener: (event: { sender: WebContentsLike }, value?: unknown) => void
  ): unknown
}

export interface IpcDependencies {
  problems: {
    listProblems(): ProblemSummary[]
    getProblem(id: string): Problem | undefined
  }
  sessions: Pick<LocalStore, 'listSessions' | 'getSession' | 'saveSession'>
  runner: {
    runProblemCode(input: {
      problem: Problem
      code: string
      includeHidden: boolean
    }): Promise<unknown>
  }
  credentials: Pick<
    CredentialStore,
    'hasApiKey' | 'getApiKey' | 'setApiKey' | 'clearApiKey'
  >
  ai: Pick<AiClient, 'requestHint' | 'requestReview' | 'testConnection'>
  settings: Pick<LocalStore, 'getSettings' | 'saveSettings'>
  now?: () => Date
  createId?: () => string
}

class RequestError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'AI_CONFIGURATION',
    message: string
  ) {
    super(message)
  }
}

export function registerIpcHandlers(
  ipcMain: IpcMainLike,
  dependencies: IpcDependencies
): () => void {
  const now = dependencies.now ?? (() => new Date())
  const createId = dependencies.createId ?? (() => crypto.randomUUID())
  const channels: string[] = []

  const register = <TInput>(
    channel: string,
    inputSchema: z.ZodType<TInput>,
    outputSchema: z.ZodType,
    operation: (input: TInput) => unknown | Promise<unknown>
  ): void => {
    channels.push(channel)
    ipcMain.handle(channel, async (_event, input) => {
      const parsedInput = inputSchema.safeParse(input)
      if (!parsedInput.success) {
        return failure({
          code: 'INVALID_REQUEST',
          message: 'The request is invalid.',
          retryable: false
        })
      }

      let output: unknown
      try {
        output = await operation(parsedInput.data)
      } catch (error) {
        return failure(toIpcError(error))
      }

      const parsedOutput = outputSchema.safeParse(output)
      return parsedOutput.success
        ? { ok: true, value: parsedOutput.data }
        : failure(internalError())
    })
  }

  register(CHANNELS.problemsList, emptyInputSchema, z.array(problemSummarySchema), () =>
    dependencies.problems.listProblems()
  )
  register(CHANNELS.problemsGet, idInputSchema, nullableProblemSummarySchema, ({ id }) => {
    const problem = dependencies.problems.getProblem(id)
    if (!problem) return null
    const { hiddenTests: _hiddenTests, ...summary } = problem
    return summary
  })
  register(CHANNELS.sessionsList, emptyInputSchema, z.array(sessionSummarySchema), async () =>
    (await dependencies.sessions.listSessions()).map(toSessionSummary)
  )
  register(CHANNELS.sessionsGet, idInputSchema, nullableSessionSchema, async ({ id }) =>
    (await dependencies.sessions.getSession(id)) ?? null
  )
  register(CHANNELS.sessionsCreate, createSessionInputSchema, sessionSchema, async (input) => {
    const problem = getProblemOrThrow(dependencies, input.problemId)
    const instant = now().toISOString()
    const created = sessionSchema.parse({
      id: createId(),
      problemId: problem.id,
      status: 'in_progress',
      createdAt: instant,
      updatedAt: instant,
      startedAt: instant,
      durationMinutes: input.durationMinutes,
      code: problem.starterCode
    })
    await dependencies.sessions.saveSession(created)
    return created
  })
  register(CHANNELS.sessionsSave, sessionSchema, sessionSchema, async (session) => {
    await dependencies.sessions.saveSession(session)
    return session
  })
  register(CHANNELS.sessionsComplete, completeSessionInputSchema, sessionSchema, async (input) => {
    const session = await getSessionOrThrow(dependencies, input.id)
    const instant = now().toISOString()
    const completed = sessionSchema.parse({
      ...session,
      status: 'feedback_pending',
      code: input.code,
      testResult: input.testResult,
      updatedAt: instant,
      completedAt: instant
    })
    await dependencies.sessions.saveSession(completed)
    return completed
  })
  register(CHANNELS.runnerRun, runRequestSchema, testRunResultSchema, async (input) => {
    const session = await getSessionOrThrow(dependencies, input.sessionId)
    const problem = getProblemOrThrow(dependencies, session.problemId)
    return dependencies.runner.runProblemCode({
      problem,
      code: input.code,
      includeHidden: input.includeHidden
    })
  })
  register(CHANNELS.aiRequestHint, hintRequestSchema, hintSchema, async (input) => {
    const session = await getSessionOrThrow(dependencies, input.sessionId)
    const problem = getProblemOrThrow(dependencies, session.problemId)
    return dependencies.ai.requestHint({
      problem,
      session: { ...session, code: input.code },
      settings: await getPublicSettings(dependencies)
    })
  })
  register(
    CHANNELS.aiRequestReview,
    z.object({ sessionId: idSchema }),
    reviewFeedbackSchema,
    async ({ sessionId }) => {
      const session = await getSessionOrThrow(dependencies, sessionId)
      const problem = getProblemOrThrow(dependencies, session.problemId)
      const feedback = await dependencies.ai.requestReview({
        problem,
        session,
        settings: await getPublicSettings(dependencies)
      })
      await dependencies.sessions.saveSession(sessionSchema.parse({
        ...session,
        status: 'completed',
        feedback,
        updatedAt: now().toISOString()
      }))
      return feedback
    }
  )
  register(CHANNELS.aiTestConnection, emptyInputSchema, okSchema, async () => {
    const apiKey = await dependencies.credentials.getApiKey()
    if (!apiKey) {
      throw new RequestError('AI_CONFIGURATION', 'Add an API key before testing the connection.')
    }
    return dependencies.ai.testConnection(await getPublicSettings(dependencies), apiKey)
  })
  register(CHANNELS.settingsGet, emptyInputSchema, publicSettingsSchema, () =>
    getPublicSettings(dependencies)
  )
  register(CHANNELS.settingsSave, publicSettingsInputSchema, publicSettingsSchema, async (input) => {
    const saved = publicSettingsSchema.parse({
      ...input,
      hasApiKey: await dependencies.credentials.hasApiKey()
    })
    await dependencies.settings.saveSettings(saved)
    return saved
  })
  register(
    CHANNELS.settingsSaveCredential,
    apiKeyInputSchema,
    hasApiKeyTrueSchema,
    async ({ apiKey }) => {
      await dependencies.credentials.setApiKey(apiKey)
      return { hasApiKey: true }
    }
  )
  register(
    CHANNELS.settingsClearCredential,
    emptyInputSchema,
    hasApiKeyFalseSchema,
    async () => {
      await dependencies.credentials.clearApiKey()
      return { hasApiKey: false }
    }
  )

  return () => {
    for (const channel of channels) ipcMain.removeHandler(channel)
  }
}

async function getPublicSettings(dependencies: IpcDependencies): Promise<Settings> {
  const persisted = (await dependencies.settings.getSettings()) ?? DEFAULT_SETTINGS
  return publicSettingsSchema.parse({
    endpoint: persisted.endpoint,
    model: persisted.model,
    hasApiKey: await dependencies.credentials.hasApiKey()
  })
}

function getProblemOrThrow(dependencies: IpcDependencies, id: string): Problem {
  const problem = dependencies.problems.getProblem(id)
  if (!problem) throw new RequestError('NOT_FOUND', 'The requested problem was not found.')
  return problem
}

async function getSessionOrThrow(
  dependencies: IpcDependencies,
  id: string
): Promise<Session> {
  const session = await dependencies.sessions.getSession(id)
  if (!session) throw new RequestError('NOT_FOUND', 'The requested session was not found.')
  return session
}

function toSessionSummary(session: Session) {
  const { code: _code, testResult: _testResult, feedback: _feedback, ...summary } = session
  return summary
}

function failure(error: IpcError): IpcResponse<never> {
  return { ok: false, error: ipcErrorSchema.parse(error) }
}

function internalError(): IpcError {
  return {
    code: 'INTERNAL_ERROR',
    message: 'The request could not be completed.',
    retryable: false
  }
}

function toIpcError(error: unknown): IpcError {
  if (error instanceof AiClientError) {
    return { code: error.code, message: error.message, retryable: error.retryable }
  }
  if (error instanceof CredentialError) {
    return { code: error.code, message: error.message, retryable: false }
  }
  if (error instanceof StoreError) {
    const message = error.code === 'CORRUPT_STORE'
      ? 'Saved application data is corrupt.'
      : 'Saved application data uses an unsupported version.'
    return { code: error.code, message, retryable: false }
  }
  if (error instanceof RequestError) {
    return { code: error.code, message: error.message, retryable: false }
  }
  return internalError()
}

interface WebContentsLike {
  id: number
  send(channel: string): void
}

interface CloseWindowLike {
  webContents: WebContentsLike
  on(event: 'close', listener: (event: { preventDefault(): void }) => void): unknown
  on(event: 'closed', listener: () => void): unknown
  destroy(): void
  isDestroyed(): boolean
}

export function installCloseHandshake(
  window: CloseWindowLike,
  ipcMain: IpcMainLike,
  options: { timeoutMs?: number } = {}
): () => void {
  if (!ipcMain.on || !ipcMain.removeListener) {
    throw new Error('Close handshake requires IPC event listeners.')
  }

  const timeoutMs = options.timeoutMs ?? 2_000
  let subscribed = false
  let closing = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const isSender = (event: { sender: WebContentsLike }): boolean =>
    event.sender.id === window.webContents.id

  const forceClose = (): void => {
    if (!closing) return
    if (timer) clearTimeout(timer)
    timer = undefined
    closing = false
    if (!window.isDestroyed()) window.destroy()
  }

  const onListenerChanged = (
    event: { sender: WebContentsLike },
    active?: unknown
  ): void => {
    if (isSender(event) && typeof active === 'boolean') subscribed = active
  }
  const onReady = (event: { sender: WebContentsLike }): void => {
    if (isSender(event)) forceClose()
  }
  const cleanup = (): void => {
    if (timer) clearTimeout(timer)
    timer = undefined
    ipcMain.removeListener!(CHANNELS.closeListenerChanged, onListenerChanged)
    ipcMain.removeListener!(CHANNELS.closeReady, onReady)
  }

  ipcMain.on(CHANNELS.closeListenerChanged, onListenerChanged)
  ipcMain.on(CHANNELS.closeReady, onReady)
  window.on('close', (event) => {
    if (!subscribed) return
    event.preventDefault()
    if (closing) return
    closing = true
    window.webContents.send(CHANNELS.beforeClose)
    timer = setTimeout(forceClose, timeoutMs)
  })
  window.on('closed', cleanup)

  return cleanup
}

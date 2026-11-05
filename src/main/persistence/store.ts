import { randomUUID } from 'node:crypto'
import {
  mkdir,
  open,
  readFile,
  rename,
  unlink
} from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { z } from 'zod'
import {
  sessionSchema,
  settingsSchema,
  type Session,
  type Settings
} from '../../shared/contracts'

const STORE_VERSION = 1

const sessionsFileSchema = z.object({
  version: z.literal(STORE_VERSION),
  sessions: z.array(sessionSchema)
})

const settingsFileSchema = z.object({
  version: z.literal(STORE_VERSION),
  settings: settingsSchema
})

const fileQueues = new Map<string, Promise<void>>()

export class StoreError extends Error {
  constructor(
    public readonly code: 'CORRUPT_STORE' | 'UNSUPPORTED_VERSION',
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'StoreError'
  }
}

export function withFileQueue<T>(
  path: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = fileQueues.get(path) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(operation)
  const settled = current.then(
    () => undefined,
    () => undefined
  )
  fileQueues.set(path, settled)
  void settled.finally(() => {
    if (fileQueues.get(path) === settled) fileQueues.delete(path)
  })
  return current
}

export async function atomicWrite(
  destination: string,
  contents: string | Uint8Array
): Promise<void> {
  await mkdir(dirname(destination), { recursive: true })
  const temporary = join(
    dirname(destination),
    `.${basename(destination)}.${randomUUID()}.tmp`
  )
  let handle
  try {
    handle = await open(temporary, 'wx')
    await handle.writeFile(contents)
    await handle.sync()
    await handle.close()
    handle = undefined
    await rename(temporary, destination)
  } catch (error) {
    await handle?.close()
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

async function readStoreFile<T>(
  path: string,
  schema: z.ZodType<T>
): Promise<T | undefined> {
  let source: string
  try {
    source = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }

  let value: unknown
  try {
    value = JSON.parse(source)
  } catch (error) {
    throw new StoreError('CORRUPT_STORE', `Store file is not valid JSON: ${path}`, {
      cause: error
    })
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof value.version === 'number' &&
    value.version > STORE_VERSION
  ) {
    throw new StoreError(
      'UNSUPPORTED_VERSION',
      `Store version ${value.version} is newer than supported version ${STORE_VERSION}`
    )
  }

  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new StoreError('CORRUPT_STORE', `Store file has invalid data: ${path}`, {
      cause: parsed.error
    })
  }
  return parsed.data
}

export class LocalStore {
  private readonly sessionsPath: string
  private readonly settingsPath: string

  constructor(directory: string) {
    this.sessionsPath = join(directory, 'sessions.json')
    this.settingsPath = join(directory, 'settings.json')
  }

  async listSessions(): Promise<Session[]> {
    const file = await readStoreFile(this.sessionsPath, sessionsFileSchema)
    return file?.sessions ?? []
  }

  async getSession(id: string): Promise<Session | undefined> {
    return (await this.listSessions()).find((session) => session.id === id)
  }

  async saveSession(value: Session): Promise<void> {
    const session = sessionSchema.parse(value)
    await withFileQueue(this.sessionsPath, async () => {
      const file = await readStoreFile(this.sessionsPath, sessionsFileSchema)
      const sessions = file?.sessions ?? []
      const existingIndex = sessions.findIndex(({ id }) => id === session.id)

      if (existingIndex === -1) {
        sessions.push(session)
      } else if (session.updatedAt > sessions[existingIndex].updatedAt) {
        sessions[existingIndex] = session
      }

      await atomicWrite(
        this.sessionsPath,
        JSON.stringify({ version: STORE_VERSION, sessions }, null, 2)
      )
    })
  }

  async saveSettings(value: Settings): Promise<void> {
    const settings = settingsSchema.parse(value)
    await withFileQueue(this.settingsPath, () =>
      atomicWrite(
        this.settingsPath,
        JSON.stringify({ version: STORE_VERSION, settings }, null, 2)
      )
    )
  }

  async getSettings(): Promise<Settings | undefined> {
    const file = await readStoreFile(this.settingsPath, settingsFileSchema)
    return file?.settings
  }
}

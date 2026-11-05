import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalStore } from '../../src/main/persistence/store'
import type { Session } from '../../src/shared/contracts'

const session: Session = {
  id: 'pair-sum-session',
  problemId: 'pair-sum',
  status: 'in_progress',
  createdAt: '2026-11-05T07:00:00.000Z',
  updatedAt: '2026-11-05T07:00:00.000Z',
  startedAt: '2026-11-05T07:00:00.000Z',
  durationMinutes: 30,
  code: 'initial'
}

describe('LocalStore', () => {
  let directory: string
  let sessionsPath: string
  let store: LocalStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'obakeman-store-'))
    sessionsPath = join(directory, 'sessions.json')
    store = new LocalStore(directory)
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('atomically preserves the latest concurrent session save', async () => {
    await Promise.all([
      store.saveSession({ ...session, code: 'first' }),
      store.saveSession({
        ...session,
        code: 'latest',
        updatedAt: '2026-11-05T07:00:01.000Z'
      })
    ])

    expect((await store.getSession(session.id))?.code).toBe('latest')
  })

  it('resolves session conflicts by updatedAt rather than write order', async () => {
    await Promise.all([
      store.saveSession({
        ...session,
        code: 'latest',
        updatedAt: '2026-11-05T07:00:01.000Z'
      }),
      store.saveSession({ ...session, code: 'stale' })
    ])

    expect((await store.getSession(session.id))?.code).toBe('latest')
  })

  it('lets the later queued save win for equal instants with variable precision', async () => {
    await store.saveSession({
      ...session,
      code: 'first',
      updatedAt: '2026-11-05T07:00:00.1Z'
    })
    await store.saveSession({
      ...session,
      code: 'later',
      updatedAt: '2026-11-05T07:00:00.100Z'
    })

    expect((await store.getSession(session.id))?.code).toBe('later')
  })

  it('lets the later queued save win for identical updatedAt values', async () => {
    await store.saveSession({ ...session, code: 'first' })
    await store.saveSession({ ...session, code: 'later' })

    expect((await store.getSession(session.id))?.code).toBe('later')
  })

  it('does not lose distinct sessions saved concurrently', async () => {
    await Promise.all([
      store.saveSession(session),
      store.saveSession({ ...session, id: 'second-session' })
    ])

    expect((await store.listSessions()).map(({ id }) => id).sort()).toEqual([
      'pair-sum-session',
      'second-session'
    ])
  })

  it('does not overwrite corrupt input', async () => {
    await writeFile(sessionsPath, '{broken', 'utf8')

    await expect(store.listSessions()).rejects.toMatchObject({ code: 'CORRUPT_STORE' })
    expect(await readFile(sessionsPath, 'utf8')).toBe('{broken')
  })

  it('rejects a future schema version without rewriting it', async () => {
    const futureStore = JSON.stringify({ version: 999, sessions: [] })
    await writeFile(sessionsPath, futureStore, 'utf8')

    await expect(store.listSessions()).rejects.toMatchObject({
      code: 'UNSUPPORTED_VERSION'
    })
    expect(await readFile(sessionsPath, 'utf8')).toBe(futureStore)
  })

  it('rejects invalid sessions before writing', async () => {
    await expect(
      store.saveSession({ ...session, id: '../escape' } as Session)
    ).rejects.toThrow()

    await expect(readFile(sessionsPath, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('persists schema-valid settings without returning extra credential fields', async () => {
    await store.saveSettings({
      endpoint: 'https://api.example.com',
      model: 'interviewer',
      hasApiKey: true,
      apiKey: 'plaintext-secret'
    } as never)

    const settings = await store.getSettings()
    expect(settings).toEqual({
      endpoint: 'https://api.example.com',
      model: 'interviewer',
      hasApiKey: true
    })
    expect(JSON.stringify(settings)).not.toContain('plaintext-secret')
    expect(await readFile(join(directory, 'settings.json'), 'utf8')).not.toContain(
      'plaintext-secret'
    )
  })

  it('does not replace corrupt settings during save', async () => {
    const settingsPath = join(directory, 'settings.json')
    await writeFile(settingsPath, '{broken', 'utf8')

    await expect(
      store.saveSettings({
        endpoint: 'https://api.example.com',
        model: 'interviewer',
        hasApiKey: false
      })
    ).rejects.toMatchObject({ code: 'CORRUPT_STORE' })
    expect(await readFile(settingsPath, 'utf8')).toBe('{broken')
  })

  it('does not replace future-version settings during save', async () => {
    const settingsPath = join(directory, 'settings.json')
    const futureStore = JSON.stringify({
      version: 999,
      settings: {
        endpoint: 'https://api.example.com',
        model: 'future',
        hasApiKey: false
      }
    })
    await writeFile(settingsPath, futureStore, 'utf8')

    await expect(
      store.saveSettings({
        endpoint: 'https://api.example.com',
        model: 'interviewer',
        hasApiKey: false
      })
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_VERSION' })
    expect(await readFile(settingsPath, 'utf8')).toBe(futureStore)
  })
})

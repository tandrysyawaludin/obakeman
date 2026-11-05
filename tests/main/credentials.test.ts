import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CredentialStore,
  type SafeStorageAdapter
} from '../../src/main/persistence/credentials'

class FakeSafeStorage implements SafeStorageAdapter {
  constructor(private readonly available = true) {}

  isEncryptionAvailable(): boolean {
    return this.available
  }

  encryptString(value: string): Buffer {
    return Buffer.from(`encrypted:${Buffer.from(value).toString('base64')}`)
  }

  decryptString(value: Buffer): string {
    return Buffer.from(
      value.toString().replace(/^encrypted:/, ''),
      'base64'
    ).toString()
  }
}

describe('CredentialStore', () => {
  let directory: string
  let credentialsPath: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'obakeman-credentials-'))
    credentialsPath = join(directory, 'credentials.bin')
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('encrypts API keys at rest and decrypts them on demand', async () => {
    const store = new CredentialStore(directory, new FakeSafeStorage())
    const apiKey = 'sk-plaintext-secret'

    await store.setApiKey(apiKey)

    expect(await store.hasApiKey()).toBe(true)
    expect(await store.getApiKey()).toBe(apiKey)
    const persisted = (await readFile(credentialsPath)).toString()
    expect(persisted).not.toContain(apiKey)
    expect(JSON.parse(persisted)).toMatchObject({
      version: 1,
      ciphertext: expect.any(String)
    })
  })

  it('serializes concurrent credential writes', async () => {
    const store = new CredentialStore(directory, new FakeSafeStorage())

    await Promise.all([
      store.setApiKey('first-key'),
      store.setApiKey('latest-key')
    ])

    expect(await store.getApiKey()).toBe('latest-key')
  })

  it('clears a stored API key', async () => {
    const store = new CredentialStore(directory, new FakeSafeStorage())
    await store.setApiKey('sk-secret')

    await store.clearApiKey()

    expect(await store.hasApiKey()).toBe(false)
    expect(await store.getApiKey()).toBeUndefined()
  })

  it('returns ENCRYPTION_UNAVAILABLE without writing plaintext', async () => {
    const store = new CredentialStore(directory, new FakeSafeStorage(false))

    await expect(store.setApiKey('sk-plaintext-secret')).rejects.toMatchObject({
      code: 'ENCRYPTION_UNAVAILABLE'
    })
    await expect(readFile(credentialsPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects corrupt credential records without replacing them', async () => {
    const store = new CredentialStore(directory, new FakeSafeStorage())
    await writeFile(credentialsPath, 'not-an-envelope', 'utf8')

    await expect(store.hasApiKey()).rejects.toMatchObject({ code: 'CORRUPT_STORE' })
    await expect(store.setApiKey('replacement')).rejects.toMatchObject({
      code: 'CORRUPT_STORE'
    })
    expect(await readFile(credentialsPath, 'utf8')).toBe('not-an-envelope')
  })

  it('rejects future-version credential records without replacing them', async () => {
    const store = new CredentialStore(directory, new FakeSafeStorage())
    const futureRecord = JSON.stringify({
      version: 999,
      ciphertext: Buffer.from('encrypted:value').toString('base64')
    })
    await writeFile(credentialsPath, futureRecord, 'utf8')

    await expect(store.hasApiKey()).rejects.toMatchObject({
      code: 'UNSUPPORTED_VERSION'
    })
    await expect(store.setApiKey('replacement')).rejects.toMatchObject({
      code: 'UNSUPPORTED_VERSION'
    })
    expect(await readFile(credentialsPath, 'utf8')).toBe(futureRecord)
  })

  it('can explicitly clear and recover a corrupt credential record', async () => {
    const store = new CredentialStore(directory, new FakeSafeStorage())
    await writeFile(credentialsPath, 'not-an-envelope', 'utf8')

    await store.clearApiKey()
    await store.setApiKey('recovered')

    expect(await store.getApiKey()).toBe('recovered')
  })
})

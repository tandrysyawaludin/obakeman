import { readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { atomicWrite, withFileQueue } from './store'

export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

export class CredentialError extends Error {
  constructor(
    public readonly code: 'ENCRYPTION_UNAVAILABLE',
    message: string
  ) {
    super(message)
    this.name = 'CredentialError'
  }
}

export class CredentialStore {
  private readonly credentialsPath: string

  constructor(
    directory: string,
    private readonly safeStorage: SafeStorageAdapter
  ) {
    this.credentialsPath = join(directory, 'credentials.bin')
  }

  async setApiKey(apiKey: string): Promise<void> {
    this.ensureEncryptionAvailable()
    const encrypted = this.safeStorage.encryptString(apiKey)
    await withFileQueue(this.credentialsPath, () =>
      atomicWrite(this.credentialsPath, encrypted)
    )
  }

  async hasApiKey(): Promise<boolean> {
    try {
      await readFile(this.credentialsPath)
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    }
  }

  async getApiKey(): Promise<string | undefined> {
    let encrypted: Buffer
    try {
      encrypted = await readFile(this.credentialsPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
    this.ensureEncryptionAvailable()
    return this.safeStorage.decryptString(encrypted)
  }

  async clearApiKey(): Promise<void> {
    await withFileQueue(this.credentialsPath, async () => {
      try {
        await unlink(this.credentialsPath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    })
  }

  private ensureEncryptionAvailable(): void {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new CredentialError(
        'ENCRYPTION_UNAVAILABLE',
        'Secure credential encryption is unavailable'
      )
    }
  }
}

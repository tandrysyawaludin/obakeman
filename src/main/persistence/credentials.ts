import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { atomicWrite, readStoreFile, withFileQueue } from './store'

const CREDENTIAL_STORE_VERSION = 1

const credentialFileSchema = z.object({
  version: z.literal(CREDENTIAL_STORE_VERSION),
  ciphertext: z.string().min(1).refine(
    (value) => Buffer.from(value, 'base64').toString('base64') === value,
    'Ciphertext must use canonical base64 encoding'
  )
})

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
    await withFileQueue(this.credentialsPath, async () => {
      await this.readCredentialFile()
      const encrypted = this.safeStorage.encryptString(apiKey)
      await atomicWrite(
        this.credentialsPath,
        JSON.stringify({
          version: CREDENTIAL_STORE_VERSION,
          ciphertext: encrypted.toString('base64')
        })
      )
    })
  }

  async hasApiKey(): Promise<boolean> {
    return (await this.readCredentialFile()) !== undefined
  }

  async getApiKey(): Promise<string | undefined> {
    const file = await this.readCredentialFile()
    if (!file) return undefined
    this.ensureEncryptionAvailable()
    return this.safeStorage.decryptString(Buffer.from(file.ciphertext, 'base64'))
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

  private readCredentialFile() {
    return readStoreFile(this.credentialsPath, credentialFileSchema)
  }
}

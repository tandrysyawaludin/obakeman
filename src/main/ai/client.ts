import { z } from 'zod'
import {
  reviewFeedbackSchema,
  settingsSchema,
  type Problem,
  type ReviewFeedback,
  type Session,
  type Settings
} from '../../shared/contracts'
import {
  buildHintMessages,
  buildReviewMessages,
  type ChatMessage
} from './prompts'

export const AI_RESPONSE_BYTE_LIMIT = 1_048_576
const PLAIN_TEXT_REVIEW_LIMIT = 16_384
const HINT_TEXT_LIMIT = 4_096
const REQUEST_TIMEOUT_MS = 20_000

const chatCompletionSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string()
    })
  })).min(1)
})

const structuredReviewSchema = reviewFeedbackSchema.options[0]

export interface Hint {
  text: string
}

export interface AiRequestInput {
  problem: Problem
  session: Session
  settings: Settings
}

export interface CredentialAccess {
  getApiKey(): Promise<string | undefined>
}

export type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

export type AiErrorCode =
  | 'AI_CONFIGURATION'
  | 'AI_RETRYABLE'
  | 'AI_RESPONSE_TOO_LARGE'
  | 'AI_INVALID_RESPONSE'

export class AiClientError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    public readonly retryable: boolean
  ) {
    super(message)
    this.name = 'AiClientError'
  }
}

export class AiClient {
  constructor(
    private readonly credentials: CredentialAccess,
    private readonly fetchImplementation: FetchImplementation = fetch
  ) {}

  async requestHint(input: AiRequestInput): Promise<Hint> {
    const apiKey = await this.credentials.getApiKey()
    if (!apiKey) {
      throw configurationError('Add an API key in Settings to enable AI hints.')
    }

    const content = await this.complete(
      input.settings,
      apiKey,
      buildHintMessages(input)
    )
    const text = content.trim().slice(0, HINT_TEXT_LIMIT)
    if (!text) {
      throw invalidResponseError()
    }
    return { text }
  }

  async requestReview(input: AiRequestInput): Promise<ReviewFeedback> {
    const apiKey = await this.credentials.getApiKey()
    if (!apiKey) {
      throw configurationError('Add an API key in Settings to enable AI review.')
    }

    const content = await this.complete(
      input.settings,
      apiKey,
      buildReviewMessages(input)
    )
    try {
      const value: unknown = JSON.parse(content)
      const structured = structuredReviewSchema.safeParse(value)
      if (structured.success) return structured.data
    } catch {
      // A provider may ignore the requested JSON format. Preserve bounded text.
    }

    const text = content.trim().slice(0, PLAIN_TEXT_REVIEW_LIMIT)
    if (!text) {
      throw invalidResponseError()
    }
    return reviewFeedbackSchema.parse({ format: 'plain_text', text })
  }

  async testConnection(
    settings: Settings,
    apiKey: string
  ): Promise<{ ok: true }> {
    if (!apiKey) {
      throw configurationError('Enter an API key before testing the connection.')
    }
    await this.complete(settings, apiKey, [
      {
        role: 'user',
        content: 'Reply with the single word ok.'
      }
    ])
    return { ok: true }
  }

  private async complete(
    settings: Settings,
    apiKey: string,
    messages: ChatMessage[]
  ): Promise<string> {
    const parsedSettings = settingsSchema.safeParse(settings)
    if (!parsedSettings.success) {
      throw configurationError(
        'Check the AI endpoint URL and model name in Settings.'
      )
    }

    let response: Response
    try {
      response = await this.fetchImplementation(parsedSettings.data.endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: parsedSettings.data.model,
          messages
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
    } catch {
      throw retryableError(
        'The AI provider could not be reached. Check your connection and try again.'
      )
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      throw classifyHttpError(response.status)
    }

    const bytes = await readBoundedBody(response)
    let envelope: unknown
    try {
      envelope = JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      throw invalidResponseError()
    }

    const completion = chatCompletionSchema.safeParse(envelope)
    if (!completion.success) {
      throw invalidResponseError()
    }
    return completion.data.choices[0].message.content
  }
}

async function readBoundedBody(response: Response): Promise<Uint8Array> {
  if (!response.body) throw invalidResponseError()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > AI_RESPONSE_BYTE_LIMIT) {
        await reader.cancel()
        throw new AiClientError(
          'AI_RESPONSE_TOO_LARGE',
          'The AI provider response exceeded the 1 MiB safety limit.',
          false
        )
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof AiClientError) throw error
    throw retryableError(
      'The AI provider response was interrupted. Try the request again.'
    )
  } finally {
    reader.releaseLock()
  }

  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function classifyHttpError(status: number): AiClientError {
  if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) {
    return retryableError(
      `The AI provider is temporarily unavailable (HTTP ${status}). Try again.`
    )
  }
  return configurationError(
    `The AI provider rejected the request (HTTP ${status}). Check the endpoint, model, and API key in Settings.`
  )
}

function configurationError(message: string): AiClientError {
  return new AiClientError('AI_CONFIGURATION', message, false)
}

function retryableError(message: string): AiClientError {
  return new AiClientError('AI_RETRYABLE', message, true)
}

function invalidResponseError(): AiClientError {
  return new AiClientError(
    'AI_INVALID_RESPONSE',
    'The AI provider returned an invalid response. Try again or check provider compatibility.',
    true
  )
}

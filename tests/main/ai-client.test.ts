import { describe, expect, it, vi } from 'vitest'
import { getProblem } from '../../src/main/problems/catalog'
import {
  AI_RESPONSE_BYTE_LIMIT,
  AiClient,
  AiClientError,
  type FetchImplementation
} from '../../src/main/ai/client'
import { buildHintMessages, buildReviewMessages } from '../../src/main/ai/prompts'
import type { ReviewFeedback, Session, Settings } from '../../src/shared/contracts'

const apiKey = 'sk-ultra-secret'
const settings: Settings = {
  endpoint: 'https://provider.example/v1/chat/completions',
  model: 'interview-model',
  hasApiKey: true
}
const problem = getProblem('pair-sum')!
const session: Session = {
  id: 'session-one',
  problemId: problem.id,
  status: 'completed',
  createdAt: '2026-11-05T00:00:00.000Z',
  updatedAt: '2026-11-05T00:30:00.000Z',
  startedAt: '2026-11-05T00:00:00.000Z',
  completedAt: '2026-11-05T00:30:00.000Z',
  durationMinutes: 30,
  code: 'function pairSum(values, target) { return [0, 1] }',
  testResult: {
    status: 'passed',
    visible: [{ name: 'finds a pair', passed: true }],
    hidden: { passed: 2, total: 2 },
    console: [],
    outputTruncated: false
  }
}
const reviewInput = { problem, session, settings }
const hintInput = { problem, session, settings }
const validFeedback: ReviewFeedback = {
  format: 'structured',
  correctness: 'The solution returns a valid pair.',
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(n)',
  codeQuality: 'Clear and focused.',
  strengths: ['Simple control flow'],
  improvements: ['Handle missing pairs explicitly'],
  suggestedSolution: 'Track prior values in a map.',
  explanation: 'A map allows one-pass complement lookup.'
}

function jsonResponse(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function successfulResponse(content: string): Response {
  return jsonResponse(200, {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 1,
    model: settings.model,
    choices: [{
      index: 0,
      finish_reason: 'stop',
      message: { role: 'assistant', content }
    }]
  })
}

function createClient(fetchImplementation: FetchImplementation): AiClient {
  return new AiClient(
    { getApiKey: async () => apiKey },
    fetchImplementation
  )
}

describe('OpenAI-compatible AI client', () => {
  it('parses Zod-validated structured review feedback', async () => {
    const client = createClient(async () =>
      successfulResponse(JSON.stringify(validFeedback))
    )

    await expect(client.requestReview(reviewInput)).resolves.toEqual(validFeedback)
  })

  it('falls back to bounded plain text for malformed JSON', async () => {
    const client = createClient(async () => successfulResponse('Start with a map.'))

    await expect(client.requestReview(reviewInput)).resolves.toEqual({
      format: 'plain_text',
      text: 'Start with a map.'
    })
  })

  it('bounds plain-text fallback to the review contract limit', async () => {
    const client = createClient(async () => successfulResponse('x'.repeat(20_000)))

    const feedback = await client.requestReview(reviewInput)

    expect(feedback).toEqual({
      format: 'plain_text',
      text: 'x'.repeat(16_384)
    })
  })

  it.each([
    [401, 'AI_CONFIGURATION', false],
    [403, 'AI_CONFIGURATION', false],
    [429, 'AI_RETRYABLE', true],
    [500, 'AI_RETRYABLE', true]
  ] as const)(
    'classifies HTTP %i without exposing provider or credential text',
    async (status, code, retryable) => {
      const client = createClient(async () =>
        jsonResponse(status, {
          error: { message: `provider rejected ${apiKey}` }
        })
      )

      const error = await client.requestHint(hintInput).catch((value) => value)

      expect(error).toMatchObject({ code, retryable })
      expect(JSON.stringify(error)).not.toContain(apiKey)
      expect(error.message).not.toContain(`provider rejected ${apiKey}`)
    }
  )

  it('rejects streamed responses over one mebibyte before JSON parsing', async () => {
    const oversized = new Uint8Array(AI_RESPONSE_BYTE_LIMIT + 1)
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(oversized)
        controller.close()
      }
    }), { status: 200 })
    const client = createClient(async () => response)

    await expect(client.requestReview(reviewInput)).rejects.toMatchObject({
      code: 'AI_RESPONSE_TOO_LARGE',
      retryable: false
    })
  })

  it('uses the configured endpoint, model, bearer credential, and JSON request', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined
    const client = createClient(async (url, init) => {
      capturedUrl = String(url)
      capturedInit = init
      return successfulResponse('Inspect the target complement.')
    })

    await client.requestHint(hintInput)

    expect(capturedUrl).toBe(settings.endpoint)
    expect(capturedInit?.method).toBe('POST')
    expect(capturedInit?.headers).toEqual({
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    })
    expect(JSON.parse(String(capturedInit?.body))).toMatchObject({
      model: settings.model,
      messages: expect.any(Array)
    })
    expect(capturedInit?.signal).toBeInstanceOf(AbortSignal)
  })

  it('bounds provider requests with a 20-second timeout signal', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const client = createClient(async () => successfulResponse('One clue.'))

    try {
      await client.requestHint(hintInput)
      expect(timeout).toHaveBeenCalledWith(20_000)
    } finally {
      timeout.mockRestore()
    }
  })

  it('classifies timeout and network failures as retryable without leaking details', async () => {
    const client = createClient(async () => {
      throw new Error(`socket failed with ${apiKey}`)
    })

    const error = await client.requestHint(hintInput).catch((value) => value)

    expect(error).toBeInstanceOf(AiClientError)
    expect(error).toMatchObject({ code: 'AI_RETRYABLE', retryable: true })
    expect(JSON.stringify(error)).not.toContain(apiKey)
    expect(error.cause).toBeUndefined()
  })

  it('returns an actionable configuration error when no credential exists', async () => {
    const fetchImplementation = vi.fn<FetchImplementation>()
    const client = new AiClient(
      { getApiKey: async () => undefined },
      fetchImplementation
    )

    await expect(client.requestHint(hintInput)).rejects.toMatchObject({
      code: 'AI_CONFIGURATION',
      retryable: false,
      message: expect.stringContaining('API key')
    })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('rejects malformed provider envelopes after Zod validation', async () => {
    const client = createClient(async () =>
      jsonResponse(200, { choices: [{ message: { content: 42 } }] })
    )

    await expect(client.requestReview(reviewInput)).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
      retryable: true
    })
  })

  it('tests a connection with explicit settings and credential', async () => {
    const client = createClient(async () => successfulResponse('ok'))

    await expect(client.testConnection(settings, apiKey)).resolves.toEqual({ ok: true })
  })
})

describe('provider-neutral prompts', () => {
  it('asks for one next-step hint and forbids complete code', () => {
    const prompt = JSON.stringify(buildHintMessages({ problem, session }))

    expect(prompt).toContain(problem.title)
    expect(prompt).toContain(session.code)
    expect(prompt).toMatch(/one next-step clue/i)
    expect(prompt).toMatch(/do not provide (a )?complete (solution|code)/i)
  })

  it('requests every structured review field without including credentials', () => {
    const messages = buildReviewMessages({ problem, session })
    const prompt = JSON.stringify(messages)
    const submittedContext = JSON.parse(messages[1].content)

    for (const field of [
      'correctness',
      'timeComplexity',
      'spaceComplexity',
      'codeQuality',
      'strengths',
      'improvements',
      'suggestedSolution',
      'explanation'
    ]) {
      expect(prompt).toContain(field)
    }
    expect(prompt).not.toContain(apiKey)
    expect(prompt).toContain(session.code)
    expect(submittedContext.submission.testResult).toEqual(session.testResult)
  })
})

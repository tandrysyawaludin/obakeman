import { z } from 'zod'

export const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const timestampSchema = z.string().datetime()

export const testCaseSchema = z.object({
  name: z.string().min(1),
  args: z.array(z.unknown()),
  expected: z.unknown()
})

export const problemExampleSchema = z.object({
  input: z.string().min(1),
  output: z.string().min(1),
  explanation: z.string().min(1).optional()
})

export const referenceComplexitySchema = z.object({
  time: z.string().min(1),
  space: z.string().min(1)
})

export const problemSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  topics: z.array(z.string().min(1)).min(1),
  description: z.string().min(1),
  constraints: z.array(z.string().min(1)).min(1),
  examples: z.array(problemExampleSchema).min(1),
  functionName: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/),
  starterCode: z.string().min(1),
  visibleTests: z.array(testCaseSchema).min(1),
  hiddenTests: z.array(testCaseSchema).min(1),
  referenceComplexity: referenceComplexitySchema
})

export const problemSummarySchema = problemSchema.omit({ hiddenTests: true })

export const visibleTestResultSchema = z.object({
  name: z.string().min(1),
  passed: z.boolean(),
  expected: z.unknown().optional(),
  actual: z.unknown().optional(),
  error: z.string().optional()
})

export const testRunResultSchema = z.object({
  status: z.enum(['passed', 'failed', 'runtime_error', 'timeout']),
  visible: z.array(visibleTestResultSchema),
  hidden: z.object({
    passed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative()
  }).optional(),
  console: z.array(z.string()),
  outputTruncated: z.boolean(),
  error: z.string().optional()
})

const structuredReviewFeedbackSchema = z.object({
  format: z.literal('structured'),
  correctness: z.string().min(1),
  timeComplexity: z.string().min(1),
  spaceComplexity: z.string().min(1),
  codeQuality: z.string().min(1),
  strengths: z.array(z.string().min(1)),
  improvements: z.array(z.string().min(1)),
  suggestedSolution: z.string().min(1),
  explanation: z.string().min(1)
})

const plainTextReviewFeedbackSchema = z.object({
  format: z.literal('plain_text'),
  text: z.string().min(1).max(16_384)
})

export const reviewFeedbackSchema = z.discriminatedUnion('format', [
  structuredReviewFeedbackSchema,
  plainTextReviewFeedbackSchema
])

export const sessionSchema = z.object({
  id: idSchema,
  problemId: idSchema,
  status: z.enum(['in_progress', 'completed', 'feedback_pending', 'feedback_failed']),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  startedAt: timestampSchema,
  completedAt: timestampSchema.optional(),
  durationMinutes: z.number().int().positive(),
  code: z.string(),
  testResult: testRunResultSchema.optional(),
  feedback: reviewFeedbackSchema.optional()
})

export const sessionSummarySchema = sessionSchema.omit({
  code: true,
  testResult: true,
  feedback: true
})

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

export function isSecureEndpoint(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ||
      (url.protocol === 'http:' && loopbackHosts.has(url.hostname))
  } catch {
    return false
  }
}

export const endpointSchema = z.string().url().refine(isSecureEndpoint, {
  message: 'Endpoint must use HTTPS, except for explicit loopback hosts.'
})

export const settingsSchema = z.object({
  endpoint: endpointSchema,
  model: z.string().min(1),
  hasApiKey: z.boolean()
})

export const createSessionInputSchema = z.object({
  problemId: idSchema,
  durationMinutes: z.number().int().min(5).max(180)
})

export const completeSessionInputSchema = z.object({
  id: idSchema,
  code: z.string(),
  testResult: testRunResultSchema
})

export const runRequestSchema = z.object({
  sessionId: idSchema,
  code: z.string(),
  includeHidden: z.boolean()
})

export const hintRequestSchema = z.object({
  sessionId: idSchema,
  code: z.string()
})

export const hintSchema = z.object({
  text: z.string().min(1).max(4_096)
})

export const publicSettingsSchema = settingsSchema

export const publicSettingsInputSchema = z.object({
  endpoint: endpointSchema,
  model: z.string().min(1)
})

export const ipcErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean()
})

export type TestCase = z.infer<typeof testCaseSchema>
export type Problem = z.infer<typeof problemSchema>
export type ProblemSummary = z.infer<typeof problemSummarySchema>
export type TestRunResult = z.infer<typeof testRunResultSchema>
export type ReviewFeedback = z.infer<typeof reviewFeedbackSchema>
export type Session = z.infer<typeof sessionSchema>
export type SessionSummary = z.infer<typeof sessionSummarySchema>
export type Settings = z.infer<typeof settingsSchema>
export type CreateSessionInput = z.infer<typeof createSessionInputSchema>
export type CompleteSessionInput = z.infer<typeof completeSessionInputSchema>
export type RunRequest = z.infer<typeof runRequestSchema>
export type HintRequest = z.infer<typeof hintRequestSchema>
export type Hint = z.infer<typeof hintSchema>
export type PublicSettings = z.infer<typeof publicSettingsSchema>
export type PublicSettingsInput = z.infer<typeof publicSettingsInputSchema>
export type IpcError = z.infer<typeof ipcErrorSchema>

export type IpcResponse<T> =
  | { ok: true; value: T }
  | { ok: false; error: IpcError }

export interface ObakemanBridge {
  problems: {
    list(): Promise<ProblemSummary[]>
    get(id: string): Promise<ProblemSummary | null>
  }
  sessions: {
    list(): Promise<SessionSummary[]>
    get(id: string): Promise<Session | null>
    create(input: CreateSessionInput): Promise<Session>
    save(session: Session): Promise<Session>
    complete(input: CompleteSessionInput): Promise<Session>
  }
  runner: {
    run(request: RunRequest): Promise<TestRunResult>
  }
  ai: {
    requestHint(input: HintRequest): Promise<Hint>
    requestReview(sessionId: string): Promise<ReviewFeedback>
    testConnection(): Promise<{ ok: true }>
  }
  settings: {
    get(): Promise<PublicSettings>
    save(input: PublicSettingsInput): Promise<PublicSettings>
    saveCredential(apiKey: string): Promise<{ hasApiKey: true }>
    clearCredential(): Promise<{ hasApiKey: false }>
  }
  onBeforeClose(callback: () => void | Promise<void>): () => void
  closeReady(): void
}

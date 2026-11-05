import { z } from 'zod'

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
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

export const settingsSchema = z.object({
  endpoint: z.string().url(),
  model: z.string().min(1),
  hasApiKey: z.boolean()
})

export type TestCase = z.infer<typeof testCaseSchema>
export type Problem = z.infer<typeof problemSchema>
export type ProblemSummary = z.infer<typeof problemSummarySchema>
export type TestRunResult = z.infer<typeof testRunResultSchema>
export type ReviewFeedback = z.infer<typeof reviewFeedbackSchema>
export type Session = z.infer<typeof sessionSchema>
export type Settings = z.infer<typeof settingsSchema>

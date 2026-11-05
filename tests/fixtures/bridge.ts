import { vi } from 'vitest'
import type {
  CreateSessionInput,
  ObakemanBridge,
  ProblemSummary,
  Session,
  SessionSummary
} from '../../src/shared/contracts'

export const problems: ProblemSummary[] = [
  {
    id: 'easy-array',
    title: 'Easy Array',
    difficulty: 'easy',
    topics: ['Arrays'],
    description: 'Return the first item in an array.',
    constraints: ['The array contains at least one item.'],
    examples: [{ input: '[3, 7]', output: '3' }],
    functionName: 'firstItem',
    starterCode: 'function firstItem(values) {\n  return values[0]\n}',
    visibleTests: [{ name: 'returns the first value', args: [[3, 7]], expected: 3 }],
    referenceComplexity: { time: 'O(1)', space: 'O(1)' }
  },
  {
    id: 'pair-sum',
    title: 'Pair Sum',
    difficulty: 'medium',
    topics: ['Arrays', 'Hash maps'],
    description: 'Find two values that add up to a target.',
    constraints: ['Each input has exactly one answer.'],
    examples: [{ input: '[2, 7, 11], 9', output: '[0, 1]' }],
    functionName: 'pairSum',
    starterCode: 'function pairSum(values, target) {\n  // Your solution\n}',
    visibleTests: [{
      name: 'finds a pair',
      args: [[2, 7, 11], 9],
      expected: [0, 1]
    }],
    referenceComplexity: { time: 'O(n)', space: 'O(n)' }
  },
  {
    id: 'graph-route',
    title: 'Graph Route',
    difficulty: 'hard',
    topics: ['Graphs'],
    description: 'Determine whether a route exists between two nodes.',
    constraints: ['The graph is directed.'],
    examples: [{ input: 'A → B', output: 'true' }],
    functionName: 'hasRoute',
    starterCode: 'function hasRoute(graph, start, end) {\n  // Your solution\n}',
    visibleTests: [{ name: 'finds a direct route', args: [{ A: ['B'] }, 'A', 'B'], expected: true }],
    referenceComplexity: { time: 'O(V + E)', space: 'O(V)' }
  }
]

export function createBridge(overrides: {
  problems?: ProblemSummary[]
  sessions?: SessionSummary[]
} = {}): ObakemanBridge {
  const problemList = overrides.problems ?? problems
  const sessions = overrides.sessions ?? []

  return {
    problems: {
      list: vi.fn(async () => problemList),
      get: vi.fn(async (id: string) =>
        problemList.find((problem) => problem.id === id) ?? null
      )
    },
    sessions: {
      list: vi.fn(async () => sessions),
      get: vi.fn(async () => null),
      create: vi.fn(async (input: CreateSessionInput): Promise<Session> => {
        const timestamp = '2026-11-05T07:00:00.000Z'
        return {
          id: 'session-new',
          ...input,
          status: 'in_progress',
          createdAt: timestamp,
          updatedAt: timestamp,
          startedAt: timestamp,
          code: ''
        }
      }),
      save: vi.fn(async (session: Session) => session),
      complete: vi.fn(async () => {
        throw new Error('Not implemented in renderer fixtures')
      })
    },
    runner: {
      run: vi.fn(async () => {
        throw new Error('Not implemented in renderer fixtures')
      })
    },
    ai: {
      requestHint: vi.fn(async () => {
        throw new Error('Not implemented in renderer fixtures')
      }),
      requestReview: vi.fn(async () => {
        throw new Error('Not implemented in renderer fixtures')
      }),
      testConnection: vi.fn(async () => ({ ok: true as const }))
    },
    settings: {
      get: vi.fn(async () => ({
        endpoint: 'https://api.example.com',
        model: 'test-model',
        hasApiKey: false
      })),
      save: vi.fn(async (input) => ({ ...input, hasApiKey: false })),
      saveCredential: vi.fn(async () => ({ hasApiKey: true as const })),
      clearCredential: vi.fn(async () => ({ hasApiKey: false as const }))
    },
    onBeforeClose: vi.fn(() => () => undefined),
    closeReady: vi.fn()
  }
}

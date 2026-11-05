import type { Problem, Session } from '../../shared/contracts'

export interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

export interface PromptInput {
  problem: Problem
  session: Session
}

function problemContext(problem: Problem): object {
  return {
    title: problem.title,
    difficulty: problem.difficulty,
    topics: problem.topics,
    description: problem.description,
    constraints: problem.constraints,
    examples: problem.examples,
    functionName: problem.functionName,
    referenceComplexity: problem.referenceComplexity
  }
}

function sessionContext(session: Session): object {
  return {
    code: session.code,
    durationMinutes: session.durationMinutes,
    testResult: session.testResult
  }
}

export function buildHintMessages({ problem, session }: PromptInput): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You are a provider-neutral coding interview coach.',
        'Give exactly one next-step clue that helps the candidate reason forward.',
        'Do not provide a complete solution or complete code.',
        'Keep the hint concise and return plain text only.'
      ].join(' ')
    },
    {
      role: 'user',
      content: JSON.stringify({
        problem: problemContext(problem),
        attempt: sessionContext(session)
      })
    }
  ]
}

export function buildReviewMessages({ problem, session }: PromptInput): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You are a provider-neutral coding interview reviewer.',
        'Return only one JSON object with exactly these fields:',
        'format (the literal "structured"), correctness, timeComplexity,',
        'spaceComplexity, codeQuality, strengths (string array),',
        'improvements (string array), suggestedSolution, and explanation.',
        'All string fields must be non-empty.'
      ].join(' ')
    },
    {
      role: 'user',
      content: JSON.stringify({
        problem: problemContext(problem),
        submission: sessionContext(session)
      })
    }
  ]
}

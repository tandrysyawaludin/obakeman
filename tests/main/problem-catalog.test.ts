import { describe, expect, it } from 'vitest'
import { problemSchema } from '../../src/shared/contracts'
import { getProblem, listProblems } from '../../src/main/problems/catalog'

type ReferenceSolution = (args: unknown[]) => unknown

const referenceSolutions: Record<string, ReferenceSolution> = {
  'pair-sum': ([rawValues, rawTarget]) => {
    const values = rawValues as number[]
    const target = rawTarget as number
    const seen = new Map<number, number>()
    for (const [index, value] of values.entries()) {
      const match = seen.get(target - value)
      if (match !== undefined) return [match, index]
      seen.set(value, index)
    }
    return []
  },
  'compress-runs': ([rawText]) => {
    const text = rawText as string
    let compressed = ''
    for (let start = 0; start < text.length;) {
      let end = start + 1
      while (text[end] === text[start]) end += 1
      compressed += `${text[start]}${end - start}`
      start = end
    }
    return compressed
  },
  'most-common-tag': ([rawTags]) => {
    const tags = rawTags as string[]
    const counts = new Map<string, number>()
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    return tags.reduce((winner, tag) =>
      (counts.get(tag) ?? 0) > (counts.get(winner) ?? 0) ? tag : winner
    )
  },
  'balanced-markers': ([rawText]) => {
    const text = rawText as string
    const opening = new Set(['(', '[', '{'])
    const matching: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
    const stack: string[] = []
    for (const marker of text) {
      if (opening.has(marker)) stack.push(marker)
      else if (stack.pop() !== matching[marker]) return false
    }
    return stack.length === 0
  },
  'closest-pair': ([rawValues, rawTarget]) => {
    const values = rawValues as number[]
    const target = rawTarget as number
    let best = [values[0], values[1]]
    for (let left = 0; left < values.length - 1; left += 1) {
      for (let right = left + 1; right < values.length; right += 1) {
        const candidate = [values[left], values[right]]
        const candidateDistance = Math.abs(candidate[0] + candidate[1] - target)
        const bestDistance = Math.abs(best[0] + best[1] - target)
        if (candidateDistance < bestDistance ||
          (candidateDistance === bestDistance && candidate[0] < best[0])) {
          best = candidate
        }
      }
    }
    return best
  }
}

describe('problem catalog', () => {
  it('contains unique, schema-valid problems without exposing hidden tests in summaries', () => {
    const summaries = listProblems()
    expect(summaries.length).toBeGreaterThanOrEqual(5)
    expect(new Set(summaries.map((item) => item.id)).size).toBe(summaries.length)
    expect(summaries.every((item) => !('hiddenTests' in item))).toBe(true)
    for (const summary of summaries) {
      expect(problemSchema.parse(getProblem(summary.id))).toBeTruthy()
    }
  })

  it('returns undefined for an unknown problem', () => {
    expect(getProblem('../settings')).toBeUndefined()
  })

  it('uses correct expected values for every catalog test case', () => {
    for (const summary of listProblems()) {
      const problem = getProblem(summary.id)!
      const solve = referenceSolutions[problem.id]
      expect(solve, `missing reference solution for ${problem.id}`).toBeTypeOf('function')
      for (const testCase of [...problem.visibleTests, ...problem.hiddenTests]) {
        expect(
          solve(testCase.args),
          `${problem.id}: ${testCase.name}`
        ).toEqual(testCase.expected)
      }
    }
  })
})

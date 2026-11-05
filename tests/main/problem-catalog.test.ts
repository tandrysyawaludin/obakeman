import { describe, expect, it } from 'vitest'
import { problemSchema } from '../../src/shared/contracts'
import { getProblem, listProblems } from '../../src/main/problems/catalog'

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
})

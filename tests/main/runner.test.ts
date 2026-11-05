import { describe, expect, it } from 'vitest'
import { getProblem } from '../../src/main/problems/catalog'
import { runProblemCode } from '../../src/main/runner/service'

describe('runProblemCode', () => {
  it('reports visible test results and hides hidden case details', async () => {
    const result = await runProblemCode({
      problem: getProblem('pair-sum')!,
      code: 'function pairSum(values, target) { return [0, 1] }',
      includeHidden: true
    })

    expect(result.visible[0]).toMatchObject({ name: expect.any(String), passed: true })
    expect(result.hidden).toEqual({ passed: expect.any(Number), total: expect.any(Number) })
    expect(JSON.stringify(result.hidden)).not.toContain('expected')
  })

  it('terminates infinite loops within three seconds', async () => {
    const startedAt = Date.now()
    const result = await runProblemCode({
      problem: getProblem('pair-sum')!,
      code: 'function pairSum() { while (true) {} }',
      includeHidden: false
    })

    expect(result.status).toBe('timeout')
    expect(Date.now() - startedAt).toBeLessThan(3_000)
  })

  it.each(['process', 'require', 'globalThis.process'])('does not expose %s', async (name) => {
    const code = `function pairSum() { return typeof ${name} }`
    const result = await runProblemCode({
      problem: getProblem('pair-sum')!,
      code,
      includeHidden: false
    })

    expect(result.console.join(' ')).not.toContain(process.env.HOME ?? '__never__')
    expect(result.visible.every((test) => !test.passed)).toBe(true)
  })

  it('disables string code generation', async () => {
    const code = `function pairSum() {
      return (() => {}).constructor("return [0, 1]")()
    }`
    const result = await runProblemCode({
      problem: getProblem('pair-sum')!,
      code,
      includeHidden: false
    })

    expect(result.visible.every((test) => !test.passed)).toBe(true)
  })

  it('truncates excessive console output', async () => {
    const code = `function pairSum() { for(let i=0;i<10000;i++) console.log("x"); return [] }`
    const result = await runProblemCode({
      problem: getProblem('pair-sum')!,
      code,
      includeHidden: false
    })

    expect(result.outputTruncated).toBe(true)
    expect(result.console.join('').length).toBeLessThanOrEqual(16_384)
  })
})

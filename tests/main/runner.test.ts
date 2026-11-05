import { ChildProcess } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { getProblem } from '../../src/main/problems/catalog'
import { runProblemCode } from '../../src/main/runner/service'

function activeChildProcesses(): ChildProcess[] {
  const getActiveHandles = (
    process as NodeJS.Process & { _getActiveHandles(): unknown[] }
  )._getActiveHandles
  return getActiveHandles.call(process).filter(
    (handle): handle is ChildProcess => handle instanceof ChildProcess
  )
}

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
    const childrenBeforeRun = new Set(activeChildProcesses())
    const startedAt = Date.now()
    const result = await runProblemCode({
      problem: getProblem('pair-sum')!,
      code: 'function pairSum() { while (true) {} }',
      includeHidden: false
    })

    expect(result.status).toBe('timeout')
    expect(Date.now() - startedAt).toBeLessThan(3_000)
    const spawnedChildren = activeChildProcesses().filter(
      (child) => !childrenBeforeRun.has(child)
    )
    expect(
      spawnedChildren.every(
        (child) => child.exitCode !== null || child.signalCode !== null
      )
    ).toBe(true)
  })

  it('keeps hidden cases and their console output outside the candidate realm', async () => {
    const hiddenArgument = 'hidden-argument-secret'
    const hiddenExpected = 'hidden-expected-secret'
    const problem = {
      ...getProblem('pair-sum')!,
      hiddenTests: [{
        name: 'hidden-case-secret',
        args: [[hiddenArgument], 99],
        expected: [hiddenExpected]
      }]
    }
    const code = `
      const originalMap = Array.prototype.map;
      Array.prototype.map = function (callback) {
        for (const item of this) console.log(JSON.stringify(item));
        return originalMap.call(this, callback);
      };
      function pairSum(values, target) {
        console.log(JSON.stringify([values, target]));
        return [];
      }
    `

    const result = await runProblemCode({ problem, code, includeHidden: true })
    const visibleOutput = result.console.join('')

    expect(visibleOutput).not.toContain(hiddenArgument)
    expect(visibleOutput).not.toContain(hiddenExpected)
    expect(visibleOutput).not.toContain('hidden-case-secret')
    expect(visibleOutput).toContain('[2,7,11,15]')
    expect(result.hidden).toEqual({ passed: 0, total: 1 })
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

  it('bounds oversized visible values before returning them over IPC', async () => {
    const result = await runProblemCode({
      problem: getProblem('pair-sum')!,
      code: 'function pairSum() { return "x".repeat(200_000) }',
      includeHidden: false
    })

    expect(result.status).toBe('failed')
    expect(result.visible[0].actual).toBeTypeOf('string')
    expect(String(result.visible[0].actual).length).toBeLessThanOrEqual(8_192)
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(64 * 1_024)
  })

  it.each([
    {
      name: 'aggressive allocation',
      code: 'function pairSum() { return new ArrayBuffer(256 * 1024 * 1024) }'
    },
    {
      name: 'unbounded recursion',
      code: 'function pairSum() { return pairSum() }'
    }
  ])('bounds $name without leaving a worker alive', async ({ code }) => {
    const childrenBeforeRun = new Set(activeChildProcesses())
    const result = await runProblemCode({
      problem: getProblem('pair-sum')!,
      code,
      includeHidden: false
    })

    expect(result.status).toBe('runtime_error')
    expect(result.error).toMatch(/resource limit/i)
    expect(Buffer.byteLength(result.error ?? '')).toBeLessThanOrEqual(4_096)
    const spawnedChildren = activeChildProcesses().filter(
      (child) => !childrenBeforeRun.has(child)
    )
    expect(
      spawnedChildren.every(
        (child) => child.exitCode !== null || child.signalCode !== null
      )
    ).toBe(true)
  })
})

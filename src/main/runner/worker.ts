import { isDeepStrictEqual } from 'node:util'
import {
  getQuickJS,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSRuntime
} from 'quickjs-emscripten'
import type { TestRunResult } from '../../shared/contracts'
import { z } from 'zod'

const testCaseSchema = z.object({
  name: z.string().min(1),
  args: z.array(z.unknown()),
  expected: z.unknown()
})

const requestSchema = z.object({
  problem: z.object({
    functionName: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/),
    visibleTests: z.array(testCaseSchema),
    hiddenTests: z.array(testCaseSchema)
  }),
  code: z.string(),
  includeHidden: z.boolean()
})

const visibleResultSchema = z.object({
  name: z.string().min(1),
  passed: z.boolean(),
  expected: z.unknown().optional(),
  actual: z.unknown().optional(),
  error: z.string().optional()
})

const resultSchema = z.object({
  status: z.enum(['passed', 'failed', 'runtime_error', 'timeout']),
  visible: z.array(visibleResultSchema),
  hidden: z.object({
    passed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative()
  }).optional(),
  console: z.array(z.string()),
  outputTruncated: z.boolean(),
  error: z.string().optional()
})

const CONSOLE_LIMIT = 16_384
const EXECUTION_LIMIT_MS = 1_500
const VALUE_LIMIT_BYTES = 8_192
const ERROR_LIMIT_BYTES = 4_096
const RESPONSE_LIMIT_BYTES = 64 * 1_024

class ExecutionTimeoutError extends Error {}

interface ConsoleCapture {
  output: string[]
  length: number
  truncated: boolean
}

function stringifyConsoleValue(context: QuickJSContext, handle: QuickJSHandle): string {
  const value = context.dump(handle)
  if (typeof value === 'string') return value
  if (value === undefined) return 'undefined'
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function truncateUtf8(value: string, maximumBytes: number): string {
  if (Buffer.byteLength(value) <= maximumBytes) return value

  let low = 0
  let high = value.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (Buffer.byteLength(value.slice(0, middle)) <= maximumBytes) low = middle
    else high = middle - 1
  }
  return value.slice(0, low)
}

function normalizeValue(value: unknown): unknown {
  if (value === undefined) return undefined
  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) return '[value omitted: not JSON-serializable]'
    if (Buffer.byteLength(serialized) <= VALUE_LIMIT_BYTES) return JSON.parse(serialized)
    return `[value omitted: exceeded ${VALUE_LIMIT_BYTES}-byte limit]`
  } catch {
    return '[value omitted: not serializable]'
  }
}

function formatError(value: unknown): string {
  const text = typeof value === 'string'
    ? value
    : (() => {
        try {
          return JSON.stringify(value)
        } catch {
          return String(value)
        }
      })()
  return truncateUtf8(text ?? String(value), ERROR_LIMIT_BYTES)
}

function installConsole(
  context: QuickJSContext,
  capture: ConsoleCapture | undefined
): void {
  const consoleHandle = context.newObject()
  const logHandle = context.newFunction('log', (...handles) => {
    if (!capture) return

    const message = `${handles
      .map((handle) => stringifyConsoleValue(context, handle))
      .join(' ')}\n`
    const remaining = CONSOLE_LIMIT - capture.length
    if (remaining > 0) {
      const captured = truncateUtf8(message, remaining)
      capture.output.push(captured)
      capture.length += Buffer.byteLength(captured)
    }
    if (Buffer.byteLength(message) > remaining || remaining === 0) capture.truncated = true
  })
  try {
    context.setProp(consoleHandle, 'log', logHandle)
    context.setProp(context.global, 'console', consoleHandle)
  } finally {
    logHandle.dispose()
    consoleHandle.dispose()
  }
}

function candidateSource(code: string, functionName: string, args: unknown[]): string {
  return `
      "use strict";
      (() => {
        const denyCodeGeneration = () => {
          throw new EvalError("String code generation is disabled");
        };
        const constructors = [
          Object.getPrototypeOf(function () {}).constructor,
          Object.getPrototypeOf(async function () {}).constructor,
          Object.getPrototypeOf(function* () {}).constructor,
          Object.getPrototypeOf(async function* () {}).constructor
        ];
        for (const constructor of constructors) {
          Object.defineProperty(constructor.prototype, "constructor", {
            value: denyCodeGeneration,
            writable: false,
            configurable: false
          });
        }
      })();
      globalThis.eval = undefined;
      globalThis.Function = undefined;
      globalThis.WebAssembly = undefined;
      ${code}
      ${functionName}(...${JSON.stringify(args)});
    `
}

function executeCase(
  runtime: QuickJSRuntime,
  code: string,
  functionName: string,
  args: unknown[],
  deadline: number,
  capture: ConsoleCapture | undefined
): { actual?: unknown; error?: string } {
  const context = runtime.newContext()
  try {
    installConsole(context, capture)
    const evaluation = context.evalCode(
      candidateSource(code, functionName, args),
      'candidate.js'
    )
    if (evaluation.error) {
      const errorHandle = evaluation.error
      let error: unknown
      try {
        error = context.dump(errorHandle)
      } finally {
        errorHandle.dispose()
      }
      if (Date.now() > deadline || formatError(error).toLowerCase().includes('interrupted')) {
        throw new ExecutionTimeoutError('Execution exceeded the QuickJS deadline.')
      }
      return { error: formatError(error) }
    }

    const valueHandle = evaluation.value!
    try {
      return { actual: context.dump(valueHandle) }
    } finally {
      valueHandle.dispose()
    }
  } finally {
    context.dispose()
  }
}

async function executeRequest(rawRequest: unknown): Promise<TestRunResult> {
  const request = requestSchema.parse(rawRequest)
  const QuickJS = await getQuickJS()
  const runtime = QuickJS.newRuntime()
  const deadline = Date.now() + EXECUTION_LIMIT_MS
  const capture: ConsoleCapture = { output: [], length: 0, truncated: false }

  runtime.setInterruptHandler(() => Date.now() > deadline)

  try {
    const visible = request.problem.visibleTests.map((testCase) => {
      const result = executeCase(
        runtime,
        request.code,
        request.problem.functionName,
        testCase.args,
        deadline,
        capture
      )
      const passed = result.error === undefined &&
        isDeepStrictEqual(result.actual, testCase.expected)
      return {
        name: testCase.name,
        passed,
        expected: normalizeValue(testCase.expected),
        ...(result.error === undefined
          ? { actual: normalizeValue(result.actual) }
          : { error: result.error })
      }
    })

    let hiddenPassed = 0
    if (request.includeHidden) {
      for (const testCase of request.problem.hiddenTests) {
        const result = executeCase(
          runtime,
          request.code,
          request.problem.functionName,
          testCase.args,
          deadline,
          undefined
        )
        if (result.error === undefined && isDeepStrictEqual(result.actual, testCase.expected)) {
          hiddenPassed += 1
        }
      }
    }

    const hidden = request.includeHidden
      ? { passed: hiddenPassed, total: request.problem.hiddenTests.length }
      : undefined
    const allPassed = visible.every((test) => test.passed) &&
      (!hidden || hidden.passed === hidden.total)
    return {
      status: allPassed ? 'passed' : 'failed',
      visible,
      hidden,
      console: capture.output,
      outputTruncated: capture.truncated
    }
  } catch (error) {
    const timedOut = error instanceof ExecutionTimeoutError || Date.now() > deadline
    return {
      status: timedOut ? 'timeout' : 'runtime_error',
      visible: [],
      console: capture.output,
      outputTruncated: capture.truncated,
      error: formatError(error instanceof Error ? error.message : error)
    }
  } finally {
    runtime.dispose()
  }
}

function serializeResult(result: TestRunResult): string {
  const validated = resultSchema.parse(result)
  const serialized = JSON.stringify(validated)
  if (Buffer.byteLength(serialized) <= RESPONSE_LIMIT_BYTES) return serialized

  return JSON.stringify(resultSchema.parse({
    status: 'runtime_error',
    visible: [],
    console: [],
    outputTruncated: true,
    error: 'Worker response exceeded the 64 KiB limit.'
  }))
}

process.once('message', async (message: unknown) => {
  try {
    process.send?.(serializeResult(await executeRequest(message)))
  } catch (error) {
    process.send?.(serializeResult({
      status: 'runtime_error',
      visible: [],
      console: [],
      outputTruncated: false,
      error: formatError(error instanceof Error ? error.message : error)
    }))
  }
})

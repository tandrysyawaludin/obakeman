import { getQuickJS, type QuickJSContext, type QuickJSHandle } from 'quickjs-emscripten'
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

const CONSOLE_LIMIT = 16_384
const EXECUTION_LIMIT_MS = 1_500

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

async function executeRequest(rawRequest: unknown): Promise<TestRunResult> {
  const request = requestSchema.parse(rawRequest)
  const QuickJS = await getQuickJS()
  const runtime = QuickJS.newRuntime()
  const deadline = Date.now() + EXECUTION_LIMIT_MS
  const consoleOutput: string[] = []
  let outputLength = 0
  let outputTruncated = false

  runtime.setInterruptHandler(() => Date.now() > deadline)
  let context: QuickJSContext | undefined

  try {
    context = runtime.newContext()
    const activeContext = context
    const consoleHandle = context.newObject()
    const logHandle = context.newFunction('log', (...handles) => {
      const message = `${handles.map((handle) => stringifyConsoleValue(activeContext, handle)).join(' ')}\n`
      const remaining = CONSOLE_LIMIT - outputLength
      if (remaining > 0) {
        const captured = message.slice(0, remaining)
        consoleOutput.push(captured)
        outputLength += captured.length
      }
      if (message.length > remaining || remaining === 0) outputTruncated = true
    })
    try {
      context.setProp(consoleHandle, 'log', logHandle)
      context.setProp(context.global, 'console', consoleHandle)
    } finally {
      logHandle.dispose()
      consoleHandle.dispose()
    }

    const visibleTests = JSON.stringify(request.problem.visibleTests)
    const hiddenTests = JSON.stringify(request.includeHidden ? request.problem.hiddenTests : [])
    const source = `
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
      ${request.code}
      const __deepEqual = (left, right) => {
        if (Object.is(left, right)) return true;
        if (typeof left !== "object" || left === null ||
            typeof right !== "object" || right === null) return false;
        const leftKeys = Object.keys(left);
        const rightKeys = Object.keys(right);
        return leftKeys.length === rightKeys.length &&
          leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) &&
            __deepEqual(left[key], right[key]));
      };
      const __run = (test) => {
        try {
          const actual = ${request.problem.functionName}(...test.args);
          return {
            name: test.name,
            passed: __deepEqual(actual, test.expected),
            expected: test.expected,
            actual
          };
        } catch (error) {
          return {
            name: test.name,
            passed: false,
            expected: test.expected,
            error: String(error)
          };
        }
      };
      JSON.stringify({
        visible: ${visibleTests}.map(__run),
        hiddenPassed: ${hiddenTests}.map(__run).filter((test) => test.passed).length
      });
    `

    const evaluation = context.evalCode(source, 'candidate.js')
    if (evaluation.error) {
      const errorHandle = evaluation.error
      const error = String(context.dump(errorHandle))
      errorHandle.dispose()
      const timedOut = Date.now() > deadline || error.toLowerCase().includes('interrupted')
      return {
        status: timedOut ? 'timeout' : 'runtime_error',
        visible: [],
        console: consoleOutput,
        outputTruncated,
        error
      }
    }

    const valueHandle = evaluation.value!
    let serialized: string
    try {
      serialized = context.getString(valueHandle)
    } finally {
      valueHandle.dispose()
    }
    const evaluated = JSON.parse(serialized) as {
      visible: TestRunResult['visible']
      hiddenPassed: number
    }
    const hidden = request.includeHidden
      ? { passed: evaluated.hiddenPassed, total: request.problem.hiddenTests.length }
      : undefined
    const allPassed = evaluated.visible.every((test) => test.passed) &&
      (!hidden || hidden.passed === hidden.total)

    return {
      status: allPassed ? 'passed' : 'failed',
      visible: evaluated.visible,
      hidden,
      console: consoleOutput,
      outputTruncated
    }
  } catch (error) {
    const timedOut = Date.now() > deadline ||
      (error instanceof Error && error.message.toLowerCase().includes('interrupted'))
    return {
      status: timedOut ? 'timeout' : 'runtime_error',
      visible: [],
      console: consoleOutput,
      outputTruncated,
      error: error instanceof Error ? error.message : String(error)
    }
  } finally {
    context?.dispose()
    runtime.dispose()
  }
}

process.once('message', async (message: unknown) => {
  try {
    process.send?.(await executeRequest(message))
  } catch (error) {
    process.send?.({
      status: 'runtime_error',
      visible: [],
      console: [],
      outputTruncated: false,
      error: error instanceof Error ? error.message : String(error)
    } satisfies TestRunResult)
  }
})

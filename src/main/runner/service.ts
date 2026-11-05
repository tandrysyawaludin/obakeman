import { fork, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import {
  problemSchema,
  testRunResultSchema,
  type Problem,
  type TestRunResult
} from '../../shared/contracts'

const requestSchema = z.object({
  problem: problemSchema,
  code: z.string(),
  includeHidden: z.boolean()
})

const WALL_CLOCK_LIMIT_MS = 2_000
const RESPONSE_LIMIT_BYTES = 64 * 1_024

function workerPath(): string {
  const compiledWorker = resolve(__dirname, 'worker.js')
  return existsSync(compiledWorker) ? compiledWorker : resolve(__dirname, 'worker.ts')
}

function stopChild(child: ChildProcess): void {
  if (child.connected) child.disconnect()
  if (!child.killed) child.kill()
}

function failure(status: 'runtime_error' | 'timeout', error: string): TestRunResult {
  return testRunResultSchema.parse({
    status,
    visible: [],
    console: [],
    outputTruncated: false,
    error
  })
}

export async function runProblemCode(input: {
  problem: Problem
  code: string
  includeHidden: boolean
}): Promise<TestRunResult> {
  const request = requestSchema.parse(input)
  const child = fork(workerPath(), [], {
    env: {},
    execArgv: [],
    stdio: ['ignore', 'ignore', 'ignore', 'ipc']
  })

  return new Promise((resolveResult) => {
    let settled = false

    const finish = (result: TestRunResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      stopChild(child)
      resolveResult(result)
    }

    const timer = setTimeout(() => {
      finish(failure('timeout', 'Execution exceeded the 2-second limit.'))
    }, WALL_CLOCK_LIMIT_MS)

    child.once('message', (message: unknown) => {
      let serialized: string
      try {
        serialized = JSON.stringify(message)
      } catch {
        finish(failure('runtime_error', 'Worker returned a non-serializable response.'))
        return
      }

      if (Buffer.byteLength(serialized) > RESPONSE_LIMIT_BYTES) {
        finish(failure('runtime_error', 'Worker response exceeded the 64 KiB limit.'))
        return
      }

      const parsed = testRunResultSchema.safeParse(message)
      finish(parsed.success
        ? parsed.data
        : failure('runtime_error', 'Worker returned an invalid response.'))
    })

    child.once('error', (error) => {
      finish(failure('runtime_error', error.message))
    })

    child.once('exit', (code, signal) => {
      if (!settled) {
        finish(failure(
          'runtime_error',
          `Worker exited before responding (code ${String(code)}, signal ${String(signal)}).`
        ))
      }
    })

    child.send(request, (error) => {
      if (error) finish(failure('runtime_error', error.message))
    })
  })
}

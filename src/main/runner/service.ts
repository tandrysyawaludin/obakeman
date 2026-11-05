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
const TERMINATION_GRACE_MS = 100

function workerPath(): string {
  const compiledWorker = resolve(__dirname, 'worker.js')
  return existsSync(compiledWorker) ? compiledWorker : resolve(__dirname, 'worker.ts')
}

function waitForExit(child: ChildProcess): Promise<void> {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve()
  }
  return new Promise((resolveExit) => child.once('exit', () => resolveExit()))
}

async function stopChild(child: ChildProcess): Promise<void> {
  const exited = waitForExit(child)
  if (child.connected) child.disconnect()
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return

  child.kill('SIGTERM')
  const exitedGracefully = await Promise.race([
    exited.then(() => true),
    new Promise<false>((resolveGrace) => {
      setTimeout(() => resolveGrace(false), TERMINATION_GRACE_MS)
    })
  ])

  if (!exitedGracefully && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
  }
  await exited
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
    let settling = false

    const finish = async (result: TestRunResult): Promise<void> => {
      if (settling) return
      settling = true
      clearTimeout(timer)
      await stopChild(child)
      resolveResult(result)
    }

    const timer = setTimeout(() => {
      void finish(failure('timeout', 'Execution exceeded the 2-second limit.'))
    }, WALL_CLOCK_LIMIT_MS)

    child.once('message', (message: unknown) => {
      if (typeof message !== 'string') {
        void finish(failure('runtime_error', 'Worker returned an invalid response encoding.'))
        return
      }

      if (Buffer.byteLength(message) > RESPONSE_LIMIT_BYTES) {
        void finish(failure('runtime_error', 'Worker response exceeded the 64 KiB limit.'))
        return
      }

      let decoded: unknown
      try {
        decoded = JSON.parse(message)
      } catch {
        void finish(failure('runtime_error', 'Worker returned invalid JSON.'))
        return
      }

      const parsed = testRunResultSchema.safeParse(decoded)
      void finish(parsed.success
        ? parsed.data
        : failure('runtime_error', 'Worker returned an invalid response.'))
    })

    child.once('error', (error) => {
      void finish(failure('runtime_error', error.message))
    })

    child.once('exit', (code, signal) => {
      if (!settling) {
        void finish(failure(
          'runtime_error',
          `Worker exited before responding (code ${String(code)}, signal ${String(signal)}).`
        ))
      }
    })

    child.send(request, (error) => {
      if (error) void finish(failure('runtime_error', error.message))
    })
  })
}

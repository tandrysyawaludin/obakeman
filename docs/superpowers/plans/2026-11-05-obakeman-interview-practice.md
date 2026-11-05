# Obakeman Interview Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the disguised tabbed browser with a secure, local-first Electron application for timed JavaScript interview practice, test execution, AI hints, and saved session reviews.

**Architecture:** Electron's main process owns persistence, encrypted credentials, AI calls, and a child-process QuickJS runner. A context-isolated preload bridge exposes validated operations to a React/Vite renderer, which contains dashboard, library, workspace, history, review, and settings screens.

**Tech Stack:** Electron 42, TypeScript, React, Vite through electron-vite, Monaco Editor, Zod, QuickJS Emscripten, Vitest, Testing Library, and Playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-obakeman-interview-practice-design.md`

## Global Constraints

- The MVP supports JavaScript only.
- All product data stays under Electron's local user-data directory; there are no accounts or cloud synchronization.
- Practice and local tests remain usable without AI credentials.
- AI uses a user-configured OpenAI-compatible chat-completions endpoint.
- The API key is encrypted with Electron `safeStorage` and is never written to renderer storage, logs, settings JSON, or session records.
- The key exists transiently only in the password field and IPC request used to save it; do not put it in React state.
- Candidate code runs outside the renderer and main process with strict time and output limits and no Node or Electron APIs.
- Remove content protection, screen-share concealment, always-on-top behavior, browser tabs, header rewriting, and 1Password/Cloudflare impersonation.
- Use original Obakeman branding, copy, layout, and assets.
- Every persisted record and IPC payload is validated.

## Review Focus

- Candidate code containing infinite loops must terminate and return a timeout without leaving a child process alive; covered by Task 3.
- Candidate code attempting to read `process`, `require`, filesystem, or environment variables must see those capabilities as unavailable; covered by Task 3.
- Corrupt or unsupported local JSON must produce a recoverable error without overwriting the source file; covered by Task 4.
- An AI endpoint returning non-JSON, oversized, or error responses must preserve the session and return retryable feedback state; covered by Task 5.
- Rapid autosaves followed immediately by window close must persist the latest code atomically; covered by Tasks 4 and 8.

---

## File Structure

```text
package.json                         scripts and dependency manifest
electron.vite.config.ts             Electron/Vite build configuration
tsconfig.json                       shared TypeScript configuration
tsconfig.node.json                  main/preload TypeScript configuration
src/
  shared/
    contracts.ts                    domain and IPC schemas/types
    channels.ts                     allowlisted IPC channel constants
  main/
    index.ts                        application lifecycle and secure window
    ipc.ts                          validated IPC registration
    persistence/
      store.ts                      versioned atomic JSON store
      credentials.ts                safeStorage credential adapter
    problems/
      catalog.ts                    built-in problem catalog
    runner/
      service.ts                    child-process lifecycle and limits
      worker.ts                     QuickJS evaluation and test harness
    ai/
      client.ts                     OpenAI-compatible HTTP client
      prompts.ts                    hint and review prompts
  preload/
    index.ts                        narrow window.obakeman bridge
    index.d.ts                      renderer bridge typing
  renderer/
    index.html                      renderer document
    src/
      main.tsx                      React entry point
      App.tsx                       route and application shell
      styles.css                    design tokens and global styles
      components/                   focused reusable UI components
      features/dashboard/           progress and recent sessions
      features/library/             problem filters and setup
      features/workspace/           timer, editor, tests, hints, autosave
      features/history/             completed session list
      features/review/              saved deterministic and AI feedback
      features/settings/            endpoint, model, and credential form
tests/
  fixtures/                         reusable test data
  main/                             domain/main-process tests
  renderer/                         React behavior tests
  e2e/                              packaged application smoke tests
```

### Task 1: Secure Electron and React Foundation

**Files:**
- Modify: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/preload/index.d.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/styles.css`
- Create: `tests/main/window-options.test.ts`

**Interfaces:**
- Produces: `createWindowOptions(): Electron.BrowserWindowConstructorOptions`
- Produces: a minimal `window.obakeman` object that Task 6 expands with application operations.

- [ ] **Step 1: Write a failing secure-window test**

```ts
import { describe, expect, it } from 'vitest'
import { createWindowOptions } from '../../src/main/index'

describe('createWindowOptions', () => {
  it('isolates the renderer and does not conceal the application', () => {
    const options = createWindowOptions()
    expect(options.alwaysOnTop).not.toBe(true)
    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    })
  })
})
```

- [ ] **Step 2: Install the application and test toolchain**

Run:

```bash
npm install react react-dom @monaco-editor/react zod quickjs-emscripten
npm install --save-dev electron-vite typescript vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @types/node @types/react @types/react-dom playwright
```

Then replace scripts and package identity:

```json
{
  "name": "obakeman",
  "productName": "Obakeman",
  "version": "0.1.0",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "start": "electron-vite preview",
    "build": "electron-vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 3: Run the test and verify the missing module failure**

Run: `npm test -- tests/main/window-options.test.ts`

Expected: FAIL because `src/main/index.ts` does not exist.

- [ ] **Step 4: Create the secure window and minimal renderer**

Implement:

```ts
export function createWindowOptions(): BrowserWindowConstructorOptions {
  return {
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    title: 'Obakeman',
    backgroundColor: '#0b0d12',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  }
}
```

Create the app lifecycle without `setContentProtection`, `setAlwaysOnTop`, dock hiding, product impersonation, `webviewTag`, or header interception. Render an Obakeman shell with working hash navigation for Dashboard, Practice, History, and Settings; feature content is added in Tasks 7–9.

- [ ] **Step 5: Verify foundation**

Run:

```bash
npm test -- tests/main/window-options.test.ts
npm run typecheck
npm run build
```

Expected: all commands exit 0 and build outputs main, preload, and renderer bundles.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json electron.vite.config.ts tsconfig*.json src tests/main/window-options.test.ts
git commit -m "feat: establish secure Obakeman application shell"
```

### Task 2: Domain Contracts and Built-In Problem Catalog

**Files:**
- Create: `src/shared/contracts.ts`
- Create: `src/shared/channels.ts`
- Create: `src/main/problems/catalog.ts`
- Create: `tests/main/problem-catalog.test.ts`

**Interfaces:**
- Produces: `Problem`, `ProblemSummary`, `Session`, `TestRunResult`, `ReviewFeedback`, and `Settings` Zod schemas and inferred types.
- Produces: `listProblems(): ProblemSummary[]`
- Produces: `getProblem(id: string): Problem | undefined`

- [ ] **Step 1: Write failing catalog validation tests**

```ts
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/main/problem-catalog.test.ts`

Expected: FAIL because catalog and contracts do not exist.

- [ ] **Step 3: Define exact schemas and five problems**

Define `problemSchema` with `id`, `title`, `difficulty`, `topics`, `description`, `constraints`, `examples`, `functionName`, `starterCode`, `visibleTests`, `hiddenTests`, and reference complexity. Define session status as `in_progress | completed | feedback_pending | feedback_failed`.

Add five original problems spanning arrays, strings, hash maps, stacks, and two pointers. Tests use JSON-serializable arguments and expected values:

```ts
export const testCaseSchema = z.object({
  name: z.string().min(1),
  args: z.array(z.unknown()),
  expected: z.unknown()
})

export function listProblems(): ProblemSummary[] {
  return catalog.map(({ hiddenTests: _hidden, ...problem }) =>
    problemSummarySchema.parse(problem)
  )
}
```

- [ ] **Step 4: Verify catalog and types**

Run:

```bash
npm test -- tests/main/problem-catalog.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared src/main/problems tests/main/problem-catalog.test.ts
git commit -m "feat: add typed JavaScript problem catalog"
```

### Task 3: Isolated JavaScript Test Runner

**Files:**
- Create: `src/main/runner/service.ts`
- Create: `src/main/runner/worker.ts`
- Create: `tests/main/runner.test.ts`

**Interfaces:**
- Consumes: `Problem`, `TestRunResult`.
- Produces: `runProblemCode(input: { problem: Problem; code: string; includeHidden: boolean }): Promise<TestRunResult>`

- [ ] **Step 1: Write failing correctness, timeout, isolation, and output-limit tests**

```ts
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

  it('terminates infinite loops', async () => {
    const result = await runProblemCode({
      problem: getProblem('pair-sum')!,
      code: 'function pairSum() { while (true) {} }',
      includeHidden: false
    })
    expect(result.status).toBe('timeout')
  })

  it.each(['process', 'require', 'globalThis.process'])('does not expose %s', async (name) => {
    const code = `function pairSum() { return typeof ${name} }`
    const result = await runProblemCode({ problem: getProblem('pair-sum')!, code, includeHidden: false })
    expect(result.console.join(' ')).not.toContain(process.env.HOME ?? '__never__')
    expect(result.visible.every((test) => !test.passed)).toBe(true)
  })

  it('truncates excessive console output', async () => {
    const code = `function pairSum() { for(let i=0;i<10000;i++) console.log("x"); return [] }`
    const result = await runProblemCode({ problem: getProblem('pair-sum')!, code, includeHidden: false })
    expect(result.outputTruncated).toBe(true)
    expect(result.console.join('').length).toBeLessThanOrEqual(16_384)
  })
})
```

- [ ] **Step 2: Run the runner tests and verify they fail**

Run: `npm test -- tests/main/runner.test.ts`

Expected: FAIL because runner modules do not exist.

- [ ] **Step 3: Implement the child-process QuickJS runner**

`service.ts` forks the compiled worker with an empty environment, sends one validated request, enforces a 2-second wall-clock timeout, caps the response at 64 KiB, and always kills/disconnects the child after completion.

`worker.ts` creates a fresh QuickJS runtime per request, sets an interrupt handler using a deadline, disables string/wasm code generation, injects only a capped `console.log`, evaluates the submitted function plus JSON test harness, and returns normalized values.

```ts
runtime.setInterruptHandler(() => Date.now() > deadline)
const context = runtime.newContext()
context.evalCode(`
  "use strict";
  ${code}
  globalThis.__result = ${functionName}(...${JSON.stringify(args)});
`)
```

Do not inject `process`, `require`, paths, environment, Electron, network, or filesystem capabilities. Dispose every QuickJS handle, context, and runtime in `finally`.

- [ ] **Step 4: Verify runner behavior**

Run:

```bash
npm test -- tests/main/runner.test.ts
npm run typecheck
```

Expected: PASS, including timeout under 3 seconds and no surviving worker.

- [ ] **Step 5: Commit**

```bash
git add src/main/runner tests/main/runner.test.ts
git commit -m "feat: run candidate code in isolated QuickJS worker"
```

### Task 4: Atomic Persistence and Encrypted Credentials

**Files:**
- Create: `src/main/persistence/store.ts`
- Create: `src/main/persistence/credentials.ts`
- Create: `tests/main/store.test.ts`
- Create: `tests/main/credentials.test.ts`

**Interfaces:**
- Consumes: session and settings schemas.
- Produces: `LocalStore` methods `listSessions`, `getSession`, `saveSession`, `saveSettings`, and `getSettings`.
- Produces: `CredentialStore` methods `setApiKey`, `hasApiKey`, `getApiKey`, and `clearApiKey`.

- [ ] **Step 1: Write failing persistence tests**

```ts
it('atomically preserves the latest concurrent session save', async () => {
  await Promise.all([
    store.saveSession({ ...session, code: 'first' }),
    store.saveSession({ ...session, code: 'latest', updatedAt: '2026-11-05T07:00:01.000Z' })
  ])
  expect((await store.getSession(session.id))?.code).toBe('latest')
})

it('does not overwrite corrupt input', async () => {
  await writeFile(sessionsPath, '{broken', 'utf8')
  await expect(store.listSessions()).rejects.toMatchObject({ code: 'CORRUPT_STORE' })
  expect(await readFile(sessionsPath, 'utf8')).toBe('{broken')
})

it('rejects a future schema version without rewriting it', async () => {
  await writeFile(sessionsPath, JSON.stringify({ version: 999, sessions: [] }))
  await expect(store.listSessions()).rejects.toMatchObject({ code: 'UNSUPPORTED_VERSION' })
})
```

Add credential tests using an injected `safeStorage` adapter; assert disk content does not contain the plaintext key and unavailable encryption returns `ENCRYPTION_UNAVAILABLE`.

- [ ] **Step 2: Run tests and verify missing-module failures**

Run: `npm test -- tests/main/store.test.ts tests/main/credentials.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement queued atomic writes and credential encryption**

Use a per-file promise queue. Write JSON to a sibling temporary file, `fsync`, and rename it over the destination. Reject invalid data before any write. Resolve conflicts by `updatedAt`, not completion order.

Store encrypted credentials in `credentials.bin`:

```ts
const encrypted = safeStorage.encryptString(apiKey)
await atomicWrite(credentialsPath, encrypted)
```

Never include the key in settings return values; return only `hasApiKey`.

- [ ] **Step 4: Verify persistence**

Run:

```bash
npm test -- tests/main/store.test.ts tests/main/credentials.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/persistence tests/main/store.test.ts tests/main/credentials.test.ts
git commit -m "feat: persist sessions and encrypt API credentials"
```

### Task 5: OpenAI-Compatible AI Client

**Files:**
- Create: `src/main/ai/client.ts`
- Create: `src/main/ai/prompts.ts`
- Create: `tests/main/ai-client.test.ts`

**Interfaces:**
- Consumes: problem, session, settings, and credential access.
- Produces: `requestHint(input): Promise<Hint>`
- Produces: `requestReview(input): Promise<ReviewFeedback>`
- Produces: `testConnection(settings, apiKey): Promise<{ ok: true }>`

- [ ] **Step 1: Write failing AI response and failure tests**

```ts
it('parses structured review feedback', async () => {
  server.respondWith(200, {
    choices: [{ message: { content: JSON.stringify(validFeedback) } }]
  })
  await expect(client.requestReview(reviewInput)).resolves.toEqual(validFeedback)
})

it('falls back to bounded plain text for malformed JSON', async () => {
  server.respondWith(200, { choices: [{ message: { content: 'Start with a map.' } }] })
  await expect(client.requestReview(reviewInput)).resolves.toMatchObject({
    format: 'plain_text',
    text: 'Start with a map.'
  })
})

it.each([401, 429, 500])('classifies HTTP %i as retryable or configuration error', async (status) => {
  server.respondWith(status, { error: { message: 'provider error' } })
  await expect(client.requestHint(hintInput)).rejects.toMatchObject({
    code: status === 401 ? 'AI_CONFIGURATION' : 'AI_RETRYABLE'
  })
})

it('rejects responses over one megabyte', async () => {
  server.respondWith(200, { choices: [{ message: { content: 'x'.repeat(1_048_577) } }] })
  await expect(client.requestReview(reviewInput)).rejects.toMatchObject({ code: 'AI_RESPONSE_TOO_LARGE' })
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- tests/main/ai-client.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement prompts, fetch timeout, size cap, and parsing**

Use `AbortSignal.timeout(20_000)`, an explicit authorization header, and the configured endpoint/model. Hint prompts forbid complete code and request one next-step clue. Review prompts request schema fields for correctness, complexity, quality, strengths, improvements, and suggested solution.

Read the response stream with a 1 MiB cap before parsing. Validate structured output with Zod; retain bounded plain text when parsing fails. Never include credentials in error objects.

- [ ] **Step 4: Verify AI behavior**

Run:

```bash
npm test -- tests/main/ai-client.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/ai tests/main/ai-client.test.ts
git commit -m "feat: add resilient OpenAI-compatible feedback client"
```

### Task 6: Validated IPC and Preload Bridge

**Files:**
- Create: `src/main/ipc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/shared/channels.ts`
- Modify: `src/shared/contracts.ts`
- Create: `tests/main/ipc.test.ts`

**Interfaces:**
- Consumes: catalog, runner, persistence, credentials, and AI services.
- Produces: `window.obakeman.problems`, `.sessions`, `.runner`, `.ai`, and `.settings`.

- [ ] **Step 1: Write failing IPC validation tests**

```ts
it('rejects invalid IDs before reaching services', async () => {
  await expect(invoke('sessions:get', { id: '../secrets' })).rejects.toMatchObject({
    code: 'INVALID_REQUEST'
  })
  expect(store.getSession).not.toHaveBeenCalled()
})

it('never returns plaintext credentials', async () => {
  credentials.getApiKey.mockResolvedValue('super-secret')
  const settings = await invoke('settings:get', {})
  expect(JSON.stringify(settings)).not.toContain('super-secret')
  expect(settings.hasApiKey).toBe(true)
})

it('returns a serializable error envelope', async () => {
  runner.runProblemCode.mockRejectedValue(new Error('boom'))
  await expect(invoke('runner:run', validRunRequest)).rejects.toMatchObject({
    code: 'INTERNAL_ERROR',
    message: expect.any(String)
  })
})
```

- [ ] **Step 2: Run test and verify failure**

Run: `npm test -- tests/main/ipc.test.ts`

Expected: FAIL.

- [ ] **Step 3: Register allowlisted handlers and expose narrow bridge**

Every handler parses input and output schemas. The preload object contains explicit methods rather than a generic `invoke`:

```ts
contextBridge.exposeInMainWorld('obakeman', {
  problems: {
    list: () => ipcRenderer.invoke(CHANNELS.problemsList),
    get: (id: string) => ipcRenderer.invoke(CHANNELS.problemsGet, { id })
  },
  runner: {
    run: (request: RunRequest) => ipcRenderer.invoke(CHANNELS.runnerRun, request)
  }
})
```

Expose these exact additional methods with the same pattern:

```ts
sessions: {
  list(): Promise<SessionSummary[]>
  get(id: string): Promise<Session | null>
  create(input: CreateSessionInput): Promise<Session>
  save(session: Session): Promise<Session>
  complete(input: CompleteSessionInput): Promise<Session>
}
ai: {
  requestHint(input: HintRequest): Promise<Hint>
  requestReview(sessionId: string): Promise<ReviewFeedback>
  testConnection(): Promise<{ ok: true }>
}
settings: {
  get(): Promise<PublicSettings>
  save(input: PublicSettingsInput): Promise<PublicSettings>
  saveCredential(apiKey: string): Promise<{ hasApiKey: true }>
  clearCredential(): Promise<{ hasApiKey: false }>
}
```

Convert errors to `{ code, message, retryable }`; do not send stacks or secrets.

- [ ] **Step 4: Verify IPC contract**

Run:

```bash
npm test -- tests/main/ipc.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts src/main/index.ts src/preload src/shared tests/main/ipc.test.ts
git commit -m "feat: expose validated application bridge"
```

### Task 7: Dashboard, Problem Library, and Session Setup

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles.css`
- Create: `src/renderer/src/components/AppShell.tsx`
- Create: `src/renderer/src/features/dashboard/Dashboard.tsx`
- Create: `src/renderer/src/features/library/ProblemLibrary.tsx`
- Create: `src/renderer/src/features/library/SessionSetup.tsx`
- Create: `tests/renderer/dashboard.test.tsx`
- Create: `tests/renderer/library.test.tsx`
- Create: `tests/fixtures/bridge.ts`

**Interfaces:**
- Consumes: `window.obakeman.problems.list`, `window.obakeman.sessions.list`, and `.create`.
- Produces: navigation to `/practice/:sessionId`.

- [ ] **Step 1: Write failing dashboard and library interaction tests**

```tsx
it('shows first-run guidance and starts practice', async () => {
  render(<App />, { bridge: createBridge({ sessions: [] }) })
  expect(await screen.findByText('Your next interview starts here')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Start practice' }))
  expect(await screen.findByRole('heading', { name: 'Choose a problem' })).toBeVisible()
})

it('filters problems and creates a timed session', async () => {
  render(<App />, { bridge: createBridge({ problems }) })
  await user.click(screen.getByRole('button', { name: 'Medium' }))
  expect(screen.queryByText('Easy Array')).not.toBeInTheDocument()
  await user.click(screen.getByText('Pair Sum'))
  await user.selectOptions(screen.getByLabelText('Duration'), '45')
  await user.click(screen.getByRole('button', { name: 'Begin interview' }))
  expect(window.obakeman.sessions.create).toHaveBeenCalledWith(
    expect.objectContaining({ problemId: 'pair-sum', durationMinutes: 45 })
  )
})
```

- [ ] **Step 2: Run renderer tests and verify failure**

Run: `npm test -- tests/renderer/dashboard.test.tsx tests/renderer/library.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Build the original Obakeman shell and selection flow**

Create a dark application shell with keyboard-visible navigation, progress cards, recent sessions, problem cards, topic/difficulty filters, and setup dialog. Use CSS custom properties for color, spacing, radii, and focus rings. Do not copy Interview Coder text or visual assets.

Keep route state in the URL hash to avoid adding a router dependency:

```ts
type Route =
  | { page: 'dashboard' }
  | { page: 'library' }
  | { page: 'practice'; sessionId: string }
  | { page: 'history' }
  | { page: 'review'; sessionId: string }
  | { page: 'settings' }
```

- [ ] **Step 4: Verify dashboard and library**

Run:

```bash
npm test -- tests/renderer/dashboard.test.tsx tests/renderer/library.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer tests/renderer tests/fixtures
git commit -m "feat: add practice dashboard and problem library"
```

### Task 8: Timed Workspace, Autosave, Tests, and Hints

**Files:**
- Create: `src/renderer/src/features/workspace/Workspace.tsx`
- Create: `src/renderer/src/features/workspace/useCountdown.ts`
- Create: `src/renderer/src/features/workspace/useAutosave.ts`
- Create: `src/renderer/src/features/workspace/TestResults.tsx`
- Create: `src/renderer/src/features/workspace/HintPanel.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles.css`
- Create: `tests/renderer/workspace.test.tsx`
- Create: `tests/renderer/autosave.test.tsx`

**Interfaces:**
- Consumes: session/problem APIs, `runner.run`, `ai.requestHint`, and `sessions.save`.
- Produces: completed-session navigation to `/review/:sessionId`.

- [ ] **Step 1: Write failing workspace behavior tests**

```tsx
it('runs edited code and renders test results', async () => {
  renderWorkspace()
  editor.change('function pairSum() { return [0, 1] }')
  await user.click(screen.getByRole('button', { name: 'Run tests' }))
  expect(window.obakeman.runner.run).toHaveBeenCalledWith(
    expect.objectContaining({ code: expect.stringContaining('pairSum') })
  )
  expect(await screen.findByText('3 of 3 visible tests passed')).toBeVisible()
})

it('keeps practice available when AI is not configured', async () => {
  renderWorkspace({ hasApiKey: false })
  expect(screen.getByRole('button', { name: 'Run tests' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Get a hint' })).toBeDisabled()
  expect(screen.getByText('Configure AI in Settings to use hints')).toBeVisible()
})

it('autosaves the newest code before close', async () => {
  vi.useFakeTimers()
  renderWorkspace()
  editor.change('first')
  editor.change('latest')
  await vi.advanceTimersByTimeAsync(500)
  window.dispatchEvent(new Event('beforeunload'))
  expect(window.obakeman.sessions.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ code: 'latest' })
  )
})
```

- [ ] **Step 2: Run workspace tests and verify failure**

Run: `npm test -- tests/renderer/workspace.test.tsx tests/renderer/autosave.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement editor, timer, execution, hint, and finish flow**

Use Monaco with JavaScript defaults and starter code. The countdown derives from persisted `startedAt` and duration instead of decrement-only state. Debounce autosave at 400 ms and flush the latest queued snapshot when finishing or unloading.

Disable duplicate run/hint/finish requests while each operation is active. Render timeout, runtime, failed assertion, truncated output, AI configuration, and retryable network states explicitly.

Finishing first flushes autosave, requests hidden tests, persists deterministic results, marks feedback pending, and navigates to review. AI review is requested from the review screen so a failure cannot block completion.

- [ ] **Step 4: Verify workspace**

Run:

```bash
npm test -- tests/renderer/workspace.test.tsx tests/renderer/autosave.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/features/workspace src/renderer/src/App.tsx src/renderer/src/styles.css tests/renderer
git commit -m "feat: add timed coding practice workspace"
```

### Task 9: Review, History, and Settings

**Files:**
- Create: `src/renderer/src/features/review/SessionReview.tsx`
- Create: `src/renderer/src/features/history/History.tsx`
- Create: `src/renderer/src/features/settings/Settings.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles.css`
- Create: `tests/renderer/review.test.tsx`
- Create: `tests/renderer/history.test.tsx`
- Create: `tests/renderer/settings.test.tsx`

**Interfaces:**
- Consumes: completed sessions, AI review/retry, settings, credential save/clear, and connection test.
- Produces: complete user-facing history, review, and configuration flows.

- [ ] **Step 1: Write failing review, history, and credential tests**

```tsx
it('shows deterministic results while feedback is retryable', async () => {
  renderReview({ feedbackStatus: 'failed', testResult })
  expect(screen.getByText('8 of 10 tests passed')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Retry AI feedback' })).toBeVisible()
})

it('opens a saved session without requesting AI again', async () => {
  renderHistory({ sessions: [completedSession] })
  await user.click(screen.getByText(completedSession.problemTitle))
  expect(window.obakeman.ai.requestReview).not.toHaveBeenCalled()
  expect(await screen.findByText('Complexity')).toBeVisible()
})

it('submits the credential without storing it in component state or browser storage', async () => {
  renderSettings()
  const password = screen.getByLabelText('API key')
  await user.type(password, 'secret-value')
  await user.click(screen.getByRole('button', { name: 'Save settings' }))
  expect(window.obakeman.settings.saveCredential).toHaveBeenCalledWith('secret-value')
  expect(localStorage.length).toBe(0)
  expect(password).toHaveValue('')
})
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `npm test -- tests/renderer/review.test.tsx tests/renderer/history.test.tsx tests/renderer/settings.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement review, history, and settings**

Review requests feedback only when absent or explicitly retried, while always displaying deterministic results. Render structured feedback sections and bounded plain-text fallback.

History sorts newest first and shows problem, difficulty, completion time, duration, and passed-test ratio.

Settings uses an uncontrolled password input:

```tsx
const keyRef = useRef<HTMLInputElement>(null)
async function save(event: FormEvent) {
  event.preventDefault()
  const key = keyRef.current?.value ?? ''
  await window.obakeman.settings.save({ endpoint, model })
  if (key) await window.obakeman.settings.saveCredential(key)
  if (keyRef.current) keyRef.current.value = ''
}
```

Never log the key, include it in settings objects, or store it in component state. Add endpoint/model validation, connection test, key-present status, and clear-key action.

- [ ] **Step 4: Verify all user-facing flows**

Run:

```bash
npm test -- tests/renderer/review.test.tsx tests/renderer/history.test.tsx tests/renderer/settings.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/features src/renderer/src/App.tsx src/renderer/src/styles.css tests/renderer
git commit -m "feat: add session reviews history and AI settings"
```

### Task 10: Migration Cleanup, Accessibility, and Packaged Smoke Test

**Files:**
- Modify: `README.md`
- Modify: `package.json`
- Delete: `main.js`
- Delete: `index.html`
- Delete: `icon.icns`
- Delete: `icon.png`
- Delete: `1Password-darwin-arm64/`
- Create: `build/icon.svg`
- Create: `playwright.config.ts`
- Create: `tests/e2e/app.spec.ts`
- Create: `.gitignore`

**Interfaces:**
- Consumes: the complete application.
- Produces: a clean repository and verified packaged Obakeman build.

- [ ] **Step 1: Add a failing packaged smoke test**

```ts
test('launches Obakeman and completes local practice without concealment', async () => {
  const app = await electron.launch({ args: ['out/main/index.js'] })
  const window = await app.firstWindow()
  await expect(window).toHaveTitle(/Obakeman/)
  await expect(window.getByText('Your next interview starts here')).toBeVisible()
  expect(await app.evaluate(({ BrowserWindow }) => {
    const current = BrowserWindow.getAllWindows()[0]
    return { alwaysOnTop: current.isAlwaysOnTop(), visible: current.isVisible() }
  })).toEqual({ alwaysOnTop: false, visible: true })
  await app.close()
})
```

- [ ] **Step 2: Run build and smoke test to expose remaining packaging failures**

Run:

```bash
npm run build
npm run test:e2e
```

Expected: smoke test fails until Playwright configuration and packaging paths are complete.

- [ ] **Step 3: Remove disguise artifacts and document the product**

Delete the old root renderer/main files after confirming electron-vite owns entry points. Remove the bundled 1Password app and old impersonating icons. Add an original SVG icon and package metadata naming only Obakeman.

Update README with:

- Product purpose and ethical-use boundary.
- Installation and development commands.
- How to configure an OpenAI-compatible endpoint.
- Local-data and credential behavior.
- Test, typecheck, build, and smoke-test commands.

Add `.gitignore` entries for `node_modules`, `out`, `dist`, coverage, Playwright output, `.DS_Store`, logs, and local data.

- [ ] **Step 4: Add accessibility assertions and finish smoke coverage**

Extend the smoke test to keyboard-navigate dashboard → library → setup, assert visible focus, begin a problem, run starter tests, restart the app with a temporary user-data directory, and confirm the session remains. Use no external AI call in smoke tests.

- [ ] **Step 5: Run the complete verification suite**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
```

Expected: all commands exit 0.

Also launch `npm run dev` and manually verify:

1. The dock and window identify as Obakeman.
2. The window appears in ordinary screen capture.
3. No always-on-top or click-through behavior exists.
4. JavaScript practice works without AI configuration.
5. A test OpenAI-compatible credential can be saved, tested, and cleared without appearing in logs or local JSON.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: finalize Obakeman practice app migration"
```

# Obakeman Interview Practice — Design Specification

## Purpose

Obakeman is a legitimate desktop application for practicing JavaScript coding interviews. It provides realistic timed sessions, local test execution, optional AI hints, and structured post-session feedback.

The product is for candidates preparing before interviews. It must not provide covert assistance during live interviews or include screen-share evasion, app disguise, click-through concealment, hidden process identity, or similar detection-avoidance behavior.

## MVP Goals

- Let a candidate choose a built-in JavaScript interview problem.
- Provide a focused, timed coding workspace with a capable editor.
- Run visible and hidden tests safely outside the renderer.
- Offer optional hints from a user-configured OpenAI-compatible API.
- Generate structured feedback after the candidate finishes.
- Save settings, progress, code, and completed sessions locally.
- Present an original, polished dark interface inspired by modern interview tools without copying third-party branding or assets.

## Non-Goals

- Live-interview assistance.
- Screen-capture blocking or concealment.
- App, dock, tray, or process disguise.
- User accounts, cloud synchronization, subscriptions, or payments.
- Languages other than JavaScript.
- User-authored problems or remote problem catalogs.
- Collaborative sessions, audio capture, or transcription.

## Architecture

The application remains an Electron desktop app, with a React and Vite renderer.

### Main Process

The Electron main process owns:

- Window lifecycle and native application behavior.
- Local persistence.
- Encrypted API-key storage through Electron `safeStorage`.
- Requests to the configured OpenAI-compatible endpoint.
- Sandboxed JavaScript test execution.

It exposes no unrestricted Node or Electron APIs to the renderer.

### Preload Bridge

A context-isolated preload script exposes narrow, typed operations for:

- Reading and updating settings.
- Listing, loading, autosaving, and completing sessions.
- Running problem tests.
- Requesting a hint.
- Requesting or retrying final feedback.

All inputs crossing the bridge are validated by the main process.

### Renderer

The React renderer owns presentation and transient UI state. It uses Monaco Editor for code editing and does not receive plaintext API credentials.

The renderer contains four primary areas:

1. Dashboard.
2. Problem library and interview setup.
3. Interview workspace.
4. Session review and history.

## Product Flow

### Dashboard

The dashboard shows recent sessions, basic progress summaries, and a primary action to start practice. Empty-state guidance leads first-time users to the problem library.

### Problem Library and Setup

The library ships with a small curated set of JavaScript problems. Candidates can filter by difficulty and topic, inspect a problem summary, and choose:

- Problem.
- Session duration.
- Configured AI model.

Starting creates a local in-progress session.

### Interview Workspace

The workspace contains:

- Problem statement, constraints, and examples.
- Monaco code editor with JavaScript syntax support.
- Countdown timer.
- Run-tests and finish-session actions.
- Console and test-result output.
- Optional AI hint panel.

Hints guide the candidate toward the next reasoning step. The default hint prompt explicitly avoids returning a complete solution. Candidates can continue practicing and running tests without configuring AI.

The current code and remaining time are autosaved. Reopening an incomplete session restores it.

### Test Execution

Each built-in problem defines:

- Function signature.
- Starter code.
- Visible tests.
- Hidden tests.
- Reference metadata used for scoring and feedback.

Submitted code runs in a dedicated child process with:

- A strict execution timeout.
- Bounded output.
- Serialized test inputs and outputs.
- No Electron access.
- No direct access to the renderer.
- A restricted execution environment with no app secrets.

The result reports compilation/runtime errors, visible test details, and aggregate hidden-test status. Hidden inputs and expected outputs are not exposed.

### Session Completion and Review

Finishing a session freezes the timer, runs the final test suite, and persists the session before requesting AI feedback.

The AI request includes the problem, submitted code, test summary, elapsed time, and a structured response schema. It does not include the API key or unrelated local data.

The review displays:

- Correctness and passed-test summary.
- Time and space complexity assessment.
- Code-quality feedback.
- Strengths.
- Prioritized improvements.
- A suggested solution and explanation.

If AI feedback is unavailable, deterministic test results remain visible and the candidate can retry feedback later.

### History

History lists completed sessions with problem, difficulty, date, duration, and result. Opening an item displays the saved code and review without rerunning AI.

### Settings

Settings include:

- OpenAI-compatible endpoint.
- Model name.
- API key.
- Connection-test action.

The API key is encrypted through `safeStorage`. Local settings store only the encrypted value and non-secret configuration.

## Local Data Model

The app stores versioned JSON records under Electron's user-data directory:

- `settings`: endpoint, model, encrypted credential reference, and schema version.
- `sessions`: session ID, problem ID, status, timestamps, duration, code, test results, and feedback.

Writes use an atomic replace pattern to reduce corruption risk. Invalid or unsupported records are rejected with a recoverable error rather than silently overwritten.

## AI Integration

The main process calls an OpenAI-compatible chat-completions endpoint. Provider-specific behavior is kept behind a small client interface so a different compatible provider can be configured without changing product components.

Responses are requested as structured JSON and validated before persistence. If structured parsing fails, the app preserves the response as plain-text feedback and marks it accordingly.

AI operations have explicit loading, success, retryable error, and configuration-required states.

## Error Handling

- Missing credentials disable AI actions without blocking practice or tests.
- Network and provider failures preserve session state and allow retry.
- Invalid endpoint or model configuration produces actionable settings guidance.
- Execution timeout terminates the child process and returns a clear timeout result.
- Excessive console output is truncated with an explicit notice.
- Renderer crashes or window closure do not discard autosaved work.
- Persistence failures are shown to the user and never reported as successful saves.

## Security Boundaries

- `contextIsolation` is enabled.
- `nodeIntegration` is disabled in the renderer.
- The renderer cannot access Electron IPC directly.
- IPC channels are allowlisted and validate request and response shapes.
- Plaintext API credentials never enter renderer state, browser storage, logs, or session records.
- Candidate code executes outside the renderer and main process with time and output limits.
- The app uses its own name and icon and does not impersonate another product.
- Content protection, screen-share invisibility, always-on-top coercion, and browser-header bypasses are removed.

## Visual Direction

The interface uses an original dark design with restrained accent colors, strong typography, compact status indicators, and a workspace optimized for sustained focus. Layout and interaction quality may take inspiration from polished interview-preparation products, but third-party logos, copy, screenshots, testimonials, and proprietary assets are excluded.

The workspace prioritizes code and problem context over decorative content. Keyboard navigation, visible focus states, semantic labels, and sufficient contrast are required.

## Testing Strategy

### Unit Tests

- Problem-definition validation.
- Test-runner result normalization.
- Execution timeout and output limits.
- Session scoring and state transitions.
- Versioned persistence and recovery behavior.
- AI request construction and response parsing.

### Integration Tests

- Preload bridge and main-process IPC contracts.
- Settings updates and encrypted credential handling.
- Session creation, autosave, completion, and feedback retry.
- Visible and hidden test execution through the child-process boundary.

### Renderer Tests

- First-run and empty states.
- Problem filtering and setup.
- Editing, running tests, and finishing a session.
- AI-disabled and AI-error states.
- History and review rendering.

### Smoke Test

A packaged-app smoke test verifies launch, navigation, local JavaScript execution, persistence after restart, and absence of the former disguise and content-protection behavior.

## Acceptance Criteria

The MVP is complete when:

1. A fresh install launches as Obakeman without concealment or third-party impersonation.
2. A candidate can start and resume a timed built-in JavaScript problem.
3. Candidate code runs against visible and hidden tests within enforced limits.
4. Practice remains fully usable without an API key.
5. A configured OpenAI-compatible endpoint can provide hints and final feedback.
6. AI and execution failures preserve the candidate's work and present retryable states.
7. Completed sessions and reviews remain available after restart.
8. Automated tests cover the critical execution, persistence, and AI boundaries.
9. The packaged application passes the defined smoke test.

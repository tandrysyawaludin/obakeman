# Obakeman

Obakeman is a local-first desktop app for practicing technical interviews. Choose a
JavaScript problem, work in a timed editor, run tests, and review previous attempts.
Optional AI hints and reviews can use an OpenAI-compatible endpoint.

Obakeman is for preparation before an interview. It is intentionally an ordinary,
visible desktop window and must not be used to conceal assistance during a real
interview or assessment.

## Install and run

Requirements: a current Node.js release and npm.

```bash
npm install
npm run dev
```

`npm start` previews a previously built application. `npm run package` builds the
app and creates an unsigned unpacked distributable under `dist/`. The directory
artifact is used so local and CI smoke tests do not depend on signing credentials.

## Optional AI configuration

Open Settings in Obakeman and enter:

- The HTTPS base URL for an OpenAI-compatible endpoint.
- The model name accepted by that endpoint.
- An API key, if the endpoint requires one.

Save the settings, then use **Test connection**. Hints and AI review remain
unavailable until a credential is configured; JavaScript practice and local tests
work without AI or network access.

## Local data and credentials

Sessions and non-secret settings are JSON files in Electron's per-user application
data directory. The API key is encrypted with Electron `safeStorage`, written only
as ciphertext, and is never exposed to the renderer or stored in the JSON settings.
Clearing the credential removes its encrypted file. Obakeman does not sync local
practice data.

## Verification

```bash
npm test
npm run typecheck
npm run build
npm run package
npm run test:e2e
npm audit
```

The Playwright smoke suite packages the app, launches both the electron-vite entry
and the unsigned distributable, keyboard-navigates into practice, runs local
JavaScript tests, restarts with an isolated user-data directory, and checks
persistence and ordinary window behavior. It makes no external AI request.

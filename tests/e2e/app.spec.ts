import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page
} from 'playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const builtEntry = resolve('out/main/index.js')
const packagedExecutable = process.platform === 'darwin'
  ? resolve(
    `dist/${process.arch === 'arm64' ? 'mac-arm64' : 'mac'}/Obakeman.app/Contents/MacOS/Obakeman`
  )
  : process.platform === 'win32'
    ? resolve('dist/win-unpacked/Obakeman.exe')
    : resolve('dist/linux-unpacked/obakeman')

async function launchBuiltApp(userDataDir: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [builtEntry, `--user-data-dir=${userDataDir}`]
  })
}

async function launchPackagedApp(userDataDir: string): Promise<ElectronApplication> {
  expect(existsSync(packagedExecutable), `packaged artifact at ${packagedExecutable}`).toBe(true)
  return electron.launch({
    executablePath: packagedExecutable,
    args: [`--user-data-dir=${userDataDir}`]
  })
}

async function stopApp(app: ElectronApplication): Promise<void> {
  const closed = app.waitForEvent('close')
  await app.evaluate(({ app: electronApp }) => electronApp.exit(0))
  await closed
}

async function expectOrdinaryVisibleWindow(app: ElectronApplication): Promise<void> {
  expect(await app.evaluate(async ({ BrowserWindow, desktopCapturer }) => {
    const current = BrowserWindow.getAllWindows()[0]
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 320, height: 200 }
    })
    const source = sources.find(
      ({ id }) => id === current.getMediaSourceId()
    )
    return {
      alwaysOnTop: current.isAlwaysOnTop(),
      captureSourceNamedObakeman: source?.name.includes('Obakeman') ?? false,
      captureSourceFound: source !== undefined,
      captureThumbnailEmpty: source?.thumbnail.isEmpty() ?? true,
      focusable: current.isFocusable(),
      visible: current.isVisible()
    }
  })).toEqual({
    alwaysOnTop: false,
    captureSourceNamedObakeman: true,
    captureSourceFound: true,
    captureThumbnailEmpty: false,
    focusable: true,
    visible: true
  })
}

async function tabTo(window: Page, target: Locator, limit = 20): Promise<void> {
  for (let index = 0; index < limit; index += 1) {
    await window.keyboard.press('Tab')
    if (await target.evaluate((element) => element === document.activeElement)) return
  }
  throw new Error(`Tab did not reach ${await target.getAttribute('aria-label') ?? 'target'}`)
}

async function expectVisibleFocus(window: Page): Promise<void> {
  expect(await window.evaluate(() => document.activeElement?.matches(':focus-visible'))).toBe(true)
}

type AppLauncher = (userDataDir: string) => Promise<ElectronApplication>

function captureCspViolations(window: Page, violations: string[]): void {
  window.on('console', (message) => {
    const text = message.text()
    if (/content security policy|violates.*directive|refused to/i.test(text)) {
      violations.push(text)
    }
  })
}

async function runPracticeAndPersistenceFlow(
  launchApp: AppLauncher,
  temporaryDirectoryPrefix: string
): Promise<void> {
  const userDataDir = await mkdtemp(join(tmpdir(), temporaryDirectoryPrefix))
  const cspViolations: string[] = []
  let app = await launchApp(userDataDir)

  try {
    let window = await app.firstWindow()
    captureCspViolations(window, cspViolations)
    await expect(window).toHaveTitle(/Obakeman/)
    await expect(window.getByRole('heading', {
      name: 'Your next interview starts here'
    })).toBeVisible()
    await expectOrdinaryVisibleWindow(app)

    await window.keyboard.press('Tab')
    await expect(window.getByRole('link', { name: 'Skip to content' })).toBeFocused()
    expect(await window.evaluate(() => document.activeElement?.matches(':focus-visible'))).toBe(true)
    await window.keyboard.press('Enter')
    await window.keyboard.press('Tab')
    await expect(window.getByRole('button', { name: 'Start practice' })).toBeFocused()
    await window.keyboard.press('Enter')

    await expect(window.getByRole('heading', { name: 'Choose a problem' })).toBeVisible()
    const pairSumCard = window.getByRole('button', { name: /Pair Sum/ })
    await tabTo(window, pairSumCard)
    await expect(pairSumCard).toBeFocused()
    await expectVisibleFocus(window)
    await window.keyboard.press('Shift+Tab')
    await expect(window.getByLabel('Topic')).toBeFocused()
    await window.keyboard.press('Tab')
    await expect(pairSumCard).toBeFocused()
    await expectVisibleFocus(window)
    await window.keyboard.press('Enter')
    await expect(window.getByRole('dialog')).toBeVisible()
    await expect(window.getByLabel('Duration')).toBeFocused()
    await expectVisibleFocus(window)
    await window.keyboard.press('Shift+Tab')
    await expect(window.getByRole('button', { name: 'Close session setup' })).toBeFocused()
    await window.keyboard.press('Tab')
    await expect(window.getByLabel('Duration')).toBeFocused()
    await window.keyboard.press('Tab')
    await window.keyboard.press('Tab')
    await expect(window.getByRole('button', { name: 'Begin interview' })).toBeFocused()
    await expectVisibleFocus(window)
    await window.keyboard.press('Enter')

    await expect(window.getByRole('heading', { name: 'Pair Sum' })).toBeVisible()
    await expect(window.locator('.monaco-editor')).toBeVisible()
    await window.getByRole('button', { name: 'Run tests' }).click()
    await expect(window.getByRole('heading', { name: 'Test results' })).toBeVisible()

    await stopApp(app)
    app = await launchApp(userDataDir)
    window = await app.firstWindow()
    captureCspViolations(window, cspViolations)
    await expect(window.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    await expect(window.getByRole('link', { name: /Pair Sum/ })).toBeVisible()
    expect(cspViolations).toEqual([])
  } finally {
    await stopApp(app).catch(() => undefined)
    await rm(userDataDir, { recursive: true, force: true })
  }
}

test('launches the built app, supports keyboard practice, and persists locally', async () => {
  await runPracticeAndPersistenceFlow(launchBuiltApp, 'obakeman-e2e-')
})

test('runs and persists practice in the packaged distributable without CSP violations', async () => {
  await runPracticeAndPersistenceFlow(launchPackagedApp, 'obakeman-package-e2e-')
})

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication
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
  expect(await app.evaluate(async ({ BrowserWindow }) => {
    const current = BrowserWindow.getAllWindows()[0]
    const capture = await current.capturePage()
    return {
      alwaysOnTop: current.isAlwaysOnTop(),
      captureEmpty: capture.isEmpty(),
      focusable: current.isFocusable(),
      visible: current.isVisible()
    }
  })).toEqual({
    alwaysOnTop: false,
    captureEmpty: false,
    focusable: true,
    visible: true
  })
}

test('launches the built app, supports keyboard practice, and persists locally', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'obakeman-e2e-'))
  let app = await launchBuiltApp(userDataDir)

  try {
    let window = await app.firstWindow()
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
    await window.getByRole('button', { name: /Pair Sum/ }).focus()
    expect(await window.evaluate(() => document.activeElement?.matches(':focus-visible'))).toBe(true)
    await window.keyboard.press('Enter')
    await expect(window.getByRole('dialog')).toBeVisible()
    await expect(window.getByLabel('Duration')).toBeFocused()
    await window.keyboard.press('Tab')
    await window.keyboard.press('Tab')
    await expect(window.getByRole('button', { name: 'Begin interview' })).toBeFocused()
    await window.keyboard.press('Enter')

    await expect(window.getByRole('heading', { name: 'Pair Sum' })).toBeVisible()
    await window.getByRole('button', { name: 'Run tests' }).click()
    await expect(window.getByRole('heading', { name: 'Test results' })).toBeVisible()

    await stopApp(app)
    app = await launchBuiltApp(userDataDir)
    window = await app.firstWindow()
    await expect(window.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    await expect(window.getByRole('link', { name: /Pair Sum/ })).toBeVisible()
  } finally {
    await stopApp(app).catch(() => undefined)
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('launches the packaged distributable as Obakeman', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'obakeman-package-e2e-'))
  const app = await launchPackagedApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await expect(window).toHaveTitle(/Obakeman/)
    await expect(window.getByText('Your next interview starts here')).toBeVisible()
    await expectOrdinaryVisibleWindow(app)
  } finally {
    await stopApp(app)
    await rm(userDataDir, { recursive: true, force: true })
  }
})

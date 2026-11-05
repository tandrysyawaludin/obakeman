import {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  type BrowserWindowConstructorOptions
} from 'electron'
import { join } from 'node:path'
import { AiClient } from './ai/client'
import {
  installCloseHandshake,
  registerIpcHandlers
} from './ipc'
import { CredentialStore } from './persistence/credentials'
import { LocalStore } from './persistence/store'
import { getProblem, listProblems } from './problems/catalog'
import { runProblemCode } from './runner/service'

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

function createWindow(): void {
  const mainWindow = new BrowserWindow(createWindowOptions())
  installCloseHandshake(mainWindow, ipcMain)

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

if (app) {
  void app.whenReady().then(() => {
    const store = new LocalStore(app.getPath('userData'))
    const credentials = new CredentialStore(app.getPath('userData'), safeStorage)
    registerIpcHandlers(ipcMain, {
      problems: { listProblems, getProblem },
      sessions: store,
      runner: { runProblemCode },
      credentials,
      ai: new AiClient(credentials),
      settings: store
    })
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}

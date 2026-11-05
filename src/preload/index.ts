import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS } from '../shared/channels'
import type {
  CompleteSessionInput,
  CreateSessionInput,
  HintRequest,
  IpcResponse,
  ObakemanBridge,
  PublicSettingsInput,
  RunRequest,
  Session
} from '../shared/contracts'

async function invoke<T>(channel: string, input?: unknown): Promise<T> {
  const response = input === undefined
    ? await ipcRenderer.invoke(channel)
    : await ipcRenderer.invoke(channel, input)
  const envelope = response as IpcResponse<T>
  if (!envelope.ok) throw envelope.error
  return envelope.value
}

const beforeCloseCallbacks = new Set<() => void | Promise<void>>()

ipcRenderer.on(CHANNELS.beforeClose, () => {
  for (const callback of [...beforeCloseCallbacks]) {
    void Promise.resolve(callback()).catch(() => undefined)
  }
})

const obakeman: ObakemanBridge = {
  problems: {
    list: () => invoke(CHANNELS.problemsList),
    get: (id: string) => invoke(CHANNELS.problemsGet, { id })
  },
  sessions: {
    list: () => invoke(CHANNELS.sessionsList),
    get: (id: string) => invoke(CHANNELS.sessionsGet, { id }),
    create: (input: CreateSessionInput) => invoke(CHANNELS.sessionsCreate, input),
    save: (session: Session) => invoke(CHANNELS.sessionsSave, session),
    complete: (input: CompleteSessionInput) => invoke(CHANNELS.sessionsComplete, input)
  },
  runner: {
    run: (request: RunRequest) => invoke(CHANNELS.runnerRun, request)
  },
  ai: {
    requestHint: (input: HintRequest) => invoke(CHANNELS.aiRequestHint, input),
    requestReview: (sessionId: string) =>
      invoke(CHANNELS.aiRequestReview, { sessionId }),
    testConnection: () => invoke(CHANNELS.aiTestConnection)
  },
  settings: {
    get: () => invoke(CHANNELS.settingsGet),
    save: (input: PublicSettingsInput) => invoke(CHANNELS.settingsSave, input),
    saveCredential: (apiKey: string) =>
      invoke(CHANNELS.settingsSaveCredential, { apiKey }),
    clearCredential: () => invoke(CHANNELS.settingsClearCredential)
  },
  onBeforeClose(callback) {
    beforeCloseCallbacks.add(callback)
    if (beforeCloseCallbacks.size === 1) {
      ipcRenderer.send(CHANNELS.closeListenerChanged, true)
    }
    return () => {
      beforeCloseCallbacks.delete(callback)
      if (beforeCloseCallbacks.size === 0) {
        ipcRenderer.send(CHANNELS.closeListenerChanged, false)
      }
    }
  },
  closeReady() {
    ipcRenderer.send(CHANNELS.closeReady)
  }
}

contextBridge.exposeInMainWorld('obakeman', obakeman)

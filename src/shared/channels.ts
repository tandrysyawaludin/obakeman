export const CHANNELS = {
  problemsList: 'problems:list',
  problemsGet: 'problems:get',
  sessionsList: 'sessions:list',
  sessionsGet: 'sessions:get',
  sessionsCreate: 'sessions:create',
  sessionsSave: 'sessions:save',
  sessionsComplete: 'sessions:complete',
  runnerRun: 'runner:run',
  aiRequestHint: 'ai:request-hint',
  aiRequestReview: 'ai:request-review',
  aiTestConnection: 'ai:test-connection',
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  settingsSaveCredential: 'settings:save-credential',
  settingsClearCredential: 'settings:clear-credential',
  beforeClose: 'lifecycle:before-close',
  closeReady: 'lifecycle:close-ready',
  closeListenerChanged: 'lifecycle:close-listener-changed'
} as const

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS]

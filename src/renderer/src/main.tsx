import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/editor/editor.api.js'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import 'monaco-editor/language/typescript/monaco.contribution.js'
import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker.js?worker'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import './styles.css'

self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    return label === 'javascript' || label === 'typescript'
      ? new TypeScriptWorker()
      : new EditorWorker()
  }
}
loader.config({ monaco })

const root = document.getElementById('root')

if (!root) {
  throw new Error('Unable to find the application root')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)

import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          worker: resolve(__dirname, 'src/main/runner/worker.ts')
        }
      }
    }
  },
  preload: {},
  renderer: {
    root: 'src/renderer'
  }
})

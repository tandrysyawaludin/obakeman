import type { ObakemanBridge } from '../../shared/contracts'

declare global {
  interface Window {
    obakeman: ObakemanBridge
  }
}

export {}

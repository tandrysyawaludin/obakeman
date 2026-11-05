import type { ObakemanBridge } from '../shared/contracts'

declare module '*.css'

interface Window {
  obakeman: ObakemanBridge
}

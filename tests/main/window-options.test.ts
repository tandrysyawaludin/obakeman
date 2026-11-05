import { describe, expect, it } from 'vitest'
import { createWindowOptions } from '../../src/main/index'

describe('createWindowOptions', () => {
  it('isolates the renderer and does not conceal the application', () => {
    const options = createWindowOptions()
    expect(options.alwaysOnTop).not.toBe(true)
    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    })
  })
})

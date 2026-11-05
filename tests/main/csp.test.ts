import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('renderer content security policy', () => {
  it('restricts scripts to packaged resources without unsafe eval', async () => {
    const html = await readFile(resolve('src/renderer/index.html'), 'utf8')

    expect(html).toContain('Content-Security-Policy')
    expect(html).toContain("default-src 'self'")
    expect(html).toContain("script-src 'self'")
    expect(html).toContain("worker-src 'self' blob:")
    expect(html).not.toContain("'unsafe-eval'")
  })
})

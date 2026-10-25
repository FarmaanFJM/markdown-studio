import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // The document stylesheet is imported with ?raw and must reach the tests intact.
    css: { include: [/document\.css/] }
  }
})

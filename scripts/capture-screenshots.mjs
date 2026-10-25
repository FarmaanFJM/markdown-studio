// Captures the documentation screenshots from the built application (see docs/ARCHITECTURE.md).
import { spawnSync } from 'node:child_process'

const result = spawnSync('npx', ['playwright', 'test', 'tests/e2e/screenshots.spec.ts'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, CAPTURE_SCREENSHOTS: '1' }
})
process.exit(result.status ?? 1)

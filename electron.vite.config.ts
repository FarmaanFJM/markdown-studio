import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const alias = { '@shared': resolve(__dirname, 'src/shared') }

// Images inside the preview are served by the privileged `msfile:` protocol; remote images are
// allowed so badges keep working. Scripts are restricted to the bundled application code.
const productionCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: msfile: https: http:",
  "font-src 'self' data:",
  "connect-src 'self' msfile: blob: data:",
  "frame-src 'self' about:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

// The Vite dev server injects inline scripts (React refresh) and talks over websockets, so the
// development policy is looser. Packaged builds always receive the strict policy above.
const developmentCsp = productionCsp
  .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
  .replace("connect-src 'self'", "connect-src 'self' ws: http://localhost:*")

function contentSecurityPolicy(): Plugin {
  return {
    name: 'markdown-studio-csp',
    transformIndexHtml(html, ctx) {
      const policy = ctx.server ? developmentCsp : productionCsp
      return html.replace('%CONTENT_SECURITY_POLICY%', policy)
    }
  }
}

export default defineConfig({
  main: {
    resolve: { alias }
  },
  preload: {
    resolve: { alias }
  },
  renderer: {
    resolve: { alias },
    plugins: [react(), contentSecurityPolicy()],
    worker: { format: 'es' },
    build: { minify: true, chunkSizeWarningLimit: 6000 }
  }
})

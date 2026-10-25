/// <reference types="vite/client" />
import type { MarkdownStudioApi } from '@shared/ipc'

declare global {
  interface Window {
    markdownStudio: MarkdownStudioApi
  }
}

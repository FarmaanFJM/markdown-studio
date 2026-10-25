import type { MarkdownStudioApi } from '@shared/ipc'

/** The only gateway from the renderer to the operating system. */
export const api: MarkdownStudioApi = window.markdownStudio

/** Turns an error thrown across IPC into a message suitable for the user. */
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')
}

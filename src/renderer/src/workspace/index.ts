import type { DirEntry } from '@shared/ipc'
import { analyzeDocument, type Heading } from '@shared/markdown/analysis'
import { api } from '../bridge'
import { useWorkspace } from '../state/workspace'

/**
 * Cached views of the workspace for suggestions and validation. Directory listings are cached
 * briefly, the recursive file list until the workspace changes, so typing never triggers a scan.
 */

const DIRECTORY_TTL_MS = 2000
const FILE_LIST_TTL_MS = 30_000
const HEADINGS_TTL_MS = 2000

const directories = new Map<string, { at: number; entries: Promise<DirEntry[]> }>()
let fileList: { at: number; files: Promise<string[]> } | null = null
const headings = new Map<string, { at: number; value: Promise<Heading[] | null> }>()

export function invalidateWorkspaceIndex(): void {
  directories.clear()
  fileList = null
  headings.clear()
}

let subscribed = false
function subscribe(): void {
  if (subscribed) return
  subscribed = true
  // The index lives as long as the application; these subscriptions are never torn down.
  api.workspace.onChanged(() => invalidateWorkspaceIndex())
  useWorkspace.subscribe((state, previous) => {
    if (state.root !== previous.root) invalidateWorkspaceIndex()
  })
}

/** Entries of a workspace directory; folders that cannot be listed yield an empty list. */
export function listDirectory(path: string): Promise<DirEntry[]> {
  subscribe()
  const cached = directories.get(path)
  if (cached && Date.now() - cached.at < DIRECTORY_TTL_MS) return cached.entries
  const entries = api.fs.readDir(path).catch(() => [] as DirEntry[])
  directories.set(path, { at: Date.now(), entries })
  return entries
}

/** All files of the workspace (capped), shallow files first. */
export function workspaceFiles(): Promise<string[]> {
  subscribe()
  if (fileList && Date.now() - fileList.at < FILE_LIST_TTL_MS) return fileList.files
  const files = api.fs
    .listFiles({ limit: 5000 })
    .then((listing) => listing.files)
    .catch(() => [] as string[])
  fileList = { at: Date.now(), files }
  return files
}

/** Headings of another Markdown file, or null when it cannot be read. */
export function headingsOfFile(path: string): Promise<Heading[] | null> {
  subscribe()
  const cached = headings.get(path)
  if (cached && Date.now() - cached.at < HEADINGS_TTL_MS) return cached.value
  const value = api.fs
    .readText(path)
    .then((file) => analyzeDocument(file.content).headings)
    .catch(() => null)
  headings.set(path, { at: Date.now(), value })
  return value
}

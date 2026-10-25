import { watch, type FSWatcher } from 'node:fs'
import path from 'node:path'

const IGNORED_SEGMENTS = new Set(['.git', 'node_modules', '.markdown-studio'])

/**
 * Watches the workspace recursively and reports the directories whose contents changed,
 * batched so a burst of file-system events produces a single Explorer refresh.
 */
export class WorkspaceWatcher {
  private watcher: FSWatcher | null = null
  private pending = new Set<string>()
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly onChange: (directories: string[]) => void) {}

  start(root: string): void {
    this.stop()
    try {
      this.watcher = watch(root, { recursive: true }, (_event, fileName) => {
        if (!fileName) {
          this.queue(root)
          return
        }
        const relative = fileName.toString()
        if (relative.split(/[\\/]/).some((segment) => IGNORED_SEGMENTS.has(segment))) return
        const full = path.join(root, relative)
        this.queue(path.dirname(full))
        // A changed directory entry may itself be expanded in the Explorer.
        this.queue(full)
      })
      this.watcher.on('error', () => this.stop())
    } catch (error) {
      // Watching is a convenience; the Explorer also refreshes after its own operations.
      console.warn(`Workspace watching is unavailable: ${(error as Error).message}`)
    }
  }

  stop(): void {
    this.watcher?.close()
    this.watcher = null
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.pending.clear()
  }

  private queue(directory: string): void {
    this.pending.add(directory)
    if (this.timer) return
    this.timer = setTimeout(() => {
      const directories = [...this.pending]
      this.pending.clear()
      this.timer = null
      this.onChange(directories)
    }, 200)
  }
}

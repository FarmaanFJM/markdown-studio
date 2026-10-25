import path from 'node:path'

export class AccessDeniedError extends Error {
  constructor(target: string) {
    super(`Access to "${target}" is not permitted. Open its folder as a workspace first.`)
    this.name = 'AccessDeniedError'
  }
}

const caseInsensitive = process.platform === 'win32' || process.platform === 'darwin'

function key(p: string): string {
  const resolved = path.resolve(p)
  return caseInsensitive ? resolved.toLowerCase() : resolved
}

function inside(parent: string, child: string): boolean {
  const relative = path.relative(key(parent), key(child))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/**
 * Tracks which parts of the file system the renderer may touch.
 *
 * - The open workspace folder grants full read/write access to everything beneath it.
 * - Files chosen through native dialogs are granted individually.
 * - The directories of those files may serve images and receive imported assets, so documents
 *   opened outside a workspace still display and accept images.
 *
 * Paths outside these grants are rejected before any file-system call is made, which limits the
 * damage any compromise of the renderer could cause.
 */
export class AccessControl {
  private workspaceRoot: string | null = null
  private readonly files = new Set<string>()
  private readonly documentDirectories = new Set<string>()

  setWorkspace(root: string | null): void {
    this.workspaceRoot = root ? path.resolve(root) : null
  }

  getWorkspace(): string | null {
    return this.workspaceRoot
  }

  grantFile(file: string): void {
    const resolved = path.resolve(file)
    this.files.add(key(resolved))
    this.documentDirectories.add(path.dirname(resolved))
  }

  isInWorkspace(target: string): boolean {
    return this.workspaceRoot !== null && inside(this.workspaceRoot, target)
  }

  isWorkspaceRoot(target: string): boolean {
    return this.workspaceRoot !== null && key(this.workspaceRoot) === key(target)
  }

  canAccessFile(target: string): boolean {
    return this.isInWorkspace(target) || this.files.has(key(target))
  }

  /** Images may also be read next to individually opened documents. */
  canReadImage(target: string): boolean {
    if (this.canAccessFile(target)) return true
    for (const dir of this.documentDirectories) if (inside(dir, target)) return true
    return false
  }

  /** Imported assets may be written into the workspace or beside an opened document. */
  canWriteAsset(target: string): boolean {
    return this.canReadImage(target)
  }

  /** Resolves and checks a path the renderer wants to read or modify. */
  assertFile(target: unknown): string {
    if (typeof target !== 'string' || target.length === 0) throw new AccessDeniedError(String(target))
    const resolved = path.resolve(target)
    if (!this.canAccessFile(resolved)) throw new AccessDeniedError(resolved)
    return resolved
  }

  /** Resolves and checks a path that must be inside the open workspace. */
  assertWorkspace(target: unknown): string {
    if (typeof target !== 'string' || target.length === 0) throw new AccessDeniedError(String(target))
    const resolved = path.resolve(target)
    if (!this.isInWorkspace(resolved)) throw new AccessDeniedError(resolved)
    return resolved
  }
}

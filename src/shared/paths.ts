/**
 * Platform-neutral path helpers.
 *
 * The renderer has no access to Node's `path` module, yet it must compute relative image
 * references and resolve links for documents on Windows, macOS and Linux. These helpers accept
 * both separators and always return forward-slash paths. Windows-style paths (drive letters or
 * UNC shares) are compared case-insensitively, matching the behaviour of their file systems.
 */

interface ParsedPath {
  /** Root including its trailing slash: `/`, `C:/`, `//server/share/` or `` for relative paths. */
  root: string
  segments: string[]
  windows: boolean
}

export function toForwardSlashes(value: string): string {
  return value.replace(/\\/g, '/')
}

function parse(value: string): ParsedPath {
  const p = toForwardSlashes(value)
  let root = ''
  let rest = p
  let windows = false
  const unc = /^\/\/([^/]+)\/([^/]+)(\/|$)/.exec(p)
  const drive = /^([a-zA-Z]):(\/|$)/.exec(p)
  if (unc) {
    root = `//${unc[1]}/${unc[2]}/`
    rest = p.slice(unc[0].length)
    windows = true
  } else if (drive) {
    root = `${drive[1].toUpperCase()}:/`
    rest = p.slice(drive[0].length)
    windows = true
  } else if (p.startsWith('/')) {
    root = '/'
    rest = p.slice(1)
  }

  const segments: string[] = []
  for (const segment of rest.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (segments.length > 0 && segments[segments.length - 1] !== '..') segments.pop()
      else if (!root) segments.push('..')
      continue
    }
    segments.push(segment)
  }
  return { root, segments, windows }
}

function format({ root, segments }: ParsedPath): string {
  const body = segments.join('/')
  if (!root) return body || '.'
  return root + body
}

export function isAbsolutePath(value: string): boolean {
  return parse(value).root !== ''
}

export function normalizePath(value: string): string {
  return format(parse(value))
}

export function joinPath(base: string, ...parts: string[]): string {
  let result = toForwardSlashes(base)
  for (const part of parts) {
    if (!part) continue
    const p = toForwardSlashes(part)
    if (isAbsolutePath(p)) result = p
    else result = result.endsWith('/') ? result + p : `${result}/${p}`
  }
  return normalizePath(result)
}

export function dirname(value: string): string {
  const parsed = parse(value)
  if (parsed.segments.length === 0) return format(parsed)
  return format({ ...parsed, segments: parsed.segments.slice(0, -1) })
}

export function basename(value: string): string {
  const parsed = parse(value)
  return parsed.segments[parsed.segments.length - 1] ?? ''
}

/** Extension including the leading dot, lower-cased (`.png`), or an empty string. */
export function extname(value: string): string {
  const name = basename(value)
  const index = name.lastIndexOf('.')
  if (index <= 0) return ''
  return name.slice(index).toLowerCase()
}

export function stripExtension(name: string): string {
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(0, index) : name
}

function sameSegment(a: string, b: string, windows: boolean): boolean {
  return windows ? a.toLowerCase() === b.toLowerCase() : a === b
}

/** A key suitable for comparing two paths for identity. */
export function pathKey(value: string): string {
  const parsed = parse(value)
  const formatted = format(parsed)
  return parsed.windows ? formatted.toLowerCase() : formatted
}

export function pathsEqual(a: string, b: string): boolean {
  return pathKey(a) === pathKey(b)
}

/** True when `child` is `parent` itself or located somewhere beneath it. */
export function isPathInside(parent: string, child: string): boolean {
  const p = parse(parent)
  const c = parse(child)
  if (!p.root || !c.root) return false
  if (!sameSegment(p.root, c.root, p.windows || c.windows)) return false
  if (c.segments.length < p.segments.length) return false
  return p.segments.every((segment, i) => sameSegment(segment, c.segments[i], p.windows))
}

/**
 * Relative path from the directory `fromDir` to `to`, using forward slashes.
 * Returns `null` when the two paths do not share a root (for example different drives).
 */
export function relativePath(fromDir: string, to: string): string | null {
  const from = parse(fromDir)
  const target = parse(to)
  const windows = from.windows || target.windows
  if (!from.root || !target.root || !sameSegment(from.root, target.root, windows)) return null

  let common = 0
  while (
    common < from.segments.length &&
    common < target.segments.length &&
    sameSegment(from.segments[common], target.segments[common], windows)
  ) {
    common++
  }
  const up = from.segments.slice(common).map(() => '..')
  const down = target.segments.slice(common)
  const result = [...up, ...down].join('/')
  return result || '.'
}

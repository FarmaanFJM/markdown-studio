import { extname } from './paths'

export const MARKDOWN_EXTENSIONS = ['.md', '.markdown'] as const

export const IMAGE_MIME_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon'
}

export const IMAGE_EXTENSIONS = Object.keys(IMAGE_MIME_TYPES)

export type FileKind = 'markdown' | 'image' | 'pdf' | 'html' | 'code' | 'text' | 'other'

const CODE_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.json',
  '.css',
  '.scss',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cs',
  '.php',
  '.sh',
  '.ps1',
  '.bat',
  '.yml',
  '.yaml',
  '.toml',
  '.xml',
  '.sql',
  '.lua',
  '.swift'
])

const TEXT_EXTENSIONS = new Set(['.txt', '.log', '.csv', '.ini', '.cfg', '.env', '.gitignore'])

export function isMarkdownPath(path: string): boolean {
  return (MARKDOWN_EXTENSIONS as readonly string[]).includes(extname(path))
}

export function isImagePath(path: string): boolean {
  return extname(path) in IMAGE_MIME_TYPES
}

export function imageMimeType(path: string): string | undefined {
  return IMAGE_MIME_TYPES[extname(path)]
}

export function fileKind(path: string): FileKind {
  const ext = extname(path)
  if (isMarkdownPath(path)) return 'markdown'
  if (ext in IMAGE_MIME_TYPES) return 'image'
  if (ext === '.pdf') return 'pdf'
  if (ext === '.html' || ext === '.htm') return 'html'
  if (CODE_EXTENSIONS.has(ext)) return 'code'
  if (TEXT_EXTENSIONS.has(ext)) return 'text'
  return 'other'
}

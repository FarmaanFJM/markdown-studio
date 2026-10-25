import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { nativeImage, protocol } from 'electron'
import { imageMimeType } from '@shared/fileTypes'
import { DOCUMENT_CSP, MSFILE_SCHEME } from '@shared/ipc'
import type { AccessControl } from './accessControl'

/**
 * The `msfile:` protocol is the only way rendered documents can reach local files.
 *
 *   msfile://local/<encoded path>      an image file the user is allowed to read
 *   msfile://thumb/<encoded path>?s=N  a cached thumbnail of such an image
 *   msfile://render/<token>            a one-off HTML document used for PDF generation
 *
 * Only image types are served from disk, so a Markdown document cannot use the protocol to
 * read arbitrary files.
 */
export function registerSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MSFILE_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
    }
  ])
}

const THUMBNAIL_CACHE_LIMIT = 400
const NATIVE_THUMBNAILS = process.platform === 'win32' || process.platform === 'darwin'

export class MsFileProtocol {
  private readonly renderDocuments = new Map<string, string>()
  private readonly thumbnails = new Map<string, Buffer>()

  constructor(private readonly access: AccessControl) {}

  register(): void {
    protocol.handle(MSFILE_SCHEME, (request) => this.handle(request))
  }

  /** Makes an HTML document available to a hidden window; returns its URL and a disposer. */
  hostDocument(html: string): { url: string; dispose: () => void } {
    const token = randomUUID()
    this.renderDocuments.set(token, html)
    return {
      url: `${MSFILE_SCHEME}://render/${token}`,
      dispose: () => this.renderDocuments.delete(token)
    }
  }

  private async handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    try {
      switch (url.hostname) {
        case 'local':
          return await this.serveImage(decodePath(url))
        case 'thumb':
          return await this.serveThumbnail(decodePath(url), Number(url.searchParams.get('s')) || 128)
        case 'render':
          return this.serveRenderDocument(url.pathname.slice(1))
        default:
          return notFound()
      }
    } catch {
      return notFound()
    }
  }

  private assertImage(file: string): string {
    const resolved = path.resolve(file)
    if (!imageMimeType(resolved) || !this.access.canReadImage(resolved)) {
      throw new Error('forbidden')
    }
    return resolved
  }

  private async serveImage(file: string): Promise<Response> {
    const resolved = this.assertImage(file)
    const data = await fs.readFile(resolved)
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': imageMimeType(resolved)!,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        // Lets the HTML exporter read images to embed them as data URIs.
        'Access-Control-Allow-Origin': '*',
        // Relevant for SVG opened directly: never allow embedded scripts.
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:"
      }
    })
  }

  private async serveThumbnail(file: string, size: number): Promise<Response> {
    const resolved = this.assertImage(file)
    const isSvg = path.extname(resolved).toLowerCase() === '.svg'
    if (!NATIVE_THUMBNAILS || isSvg) return this.serveImage(resolved)

    const stat = await fs.stat(resolved)
    const edge = Math.min(512, Math.max(32, Math.round(size)))
    const cacheKey = `${resolved}|${stat.mtimeMs}|${stat.size}|${edge}`
    let png = this.thumbnails.get(cacheKey)
    if (!png) {
      try {
        const image = await nativeImage.createThumbnailFromPath(resolved, { width: edge, height: edge })
        if (image.isEmpty()) return this.serveImage(resolved)
        png = image.toPNG()
      } catch {
        // Formats without a system thumbnail provider fall back to the original image.
        return this.serveImage(resolved)
      }
      this.thumbnails.set(cacheKey, png)
      if (this.thumbnails.size > THUMBNAIL_CACHE_LIMIT) {
        this.thumbnails.delete(this.thumbnails.keys().next().value!)
      }
    }
    return new Response(new Uint8Array(png), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400' }
    })
  }

  private serveRenderDocument(token: string): Response {
    const html = this.renderDocuments.get(token)
    if (html === undefined) return notFound()
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': DOCUMENT_CSP
      }
    })
  }
}

function decodePath(url: URL): string {
  return decodeURIComponent(url.pathname.slice(1))
}

function notFound(): Response {
  return new Response('Not found', { status: 404 })
}

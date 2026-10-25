import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PDF_OPTIONS } from '@shared/export/pdf'
import { validateExportRequest } from '@shared/export/job'
import { writeFileAtomic } from '../../src/main/services/atomicWrite'

// The export service only needs the PDF engine's interface; Electron is not available here.
vi.mock('electron', () => ({ BrowserWindow: class {} }))

const { ExportService } = await import('../../src/main/services/exportService')
const { PdfJobCancelled } = await import('../../src/main/services/pdfService')

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(600, 'x'), Buffer.from('\n%%EOF\n')])

let dir: string
let exported: string[]
let target: string | null
let print: ReturnType<typeof vi.fn>

function service() {
  return new ExportService({
    pdf: { print } as never,
    chooseTarget: async () => target,
    exported: (file) => exported.push(file)
  })
}

const request = (extra: Record<string, unknown> = {}) => ({
  jobId: 'job-1',
  format: 'pdf',
  html: '<!DOCTYPE html><html><body>x</body></html>',
  defaultPath: path.join(dir, 'doc.pdf'),
  title: 'My <doc>',
  fileName: 'doc.md',
  pdf: DEFAULT_PDF_OPTIONS,
  ...extra
})

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'ms-export-'))
  exported = []
  target = path.join(dir, 'out.pdf')
  print = vi.fn(async () => PDF)
})

describe('export jobs', () => {
  it('writes a complete PDF atomically and reports it', async () => {
    const result = await service().run(request())
    expect(result).toEqual({ status: 'saved', path: target, bytes: PDF.length })
    expect(readFileSync(target!).equals(PDF)).toBe(true)
    expect(readdirSync(dir)).toEqual(['out.pdf'])
    expect(exported).toEqual([target])
  })

  it('passes the page setup, in inches, and the header values to the engine', async () => {
    await service().run(
      request({
        pdf: {
          ...DEFAULT_PDF_OPTIONS,
          pageSize: 'Letter',
          orientation: 'landscape',
          footer: { enabled: true, text: 'Page {page} of {pages}', align: 'center' }
        }
      })
    )
    const options = print.mock.calls[0][1]
    expect(options.pageSize.width).toBeCloseTo(11, 2)
    expect(options.pageSize.height).toBeCloseTo(8.5, 2)
    expect(options.footerTemplate).toContain('class="totalPages"')
    const jobOptions = print.mock.calls[0][1]
    expect(jobOptions.headerTemplate).toBe('<div></div>')
  })

  it('adds the extension the format needs', async () => {
    target = path.join(dir, 'report')
    expect((await service().run(request())).status).toBe('saved')
    expect(existsSync(path.join(dir, 'report.pdf'))).toBe(true)
  })

  it('leaves an existing file untouched when the user cancels the dialog', async () => {
    writeFileSync(target!, 'precious')
    target = null
    expect(await service().run(request())).toEqual({ status: 'cancelled' })
    expect(print).not.toHaveBeenCalled()
    expect(readFileSync(path.join(dir, 'out.pdf'), 'utf8')).toBe('precious')
  })

  it('keeps the previous file and leaves no temporary files when printing fails', async () => {
    writeFileSync(target!, 'previous export')
    print.mockRejectedValueOnce(new Error('The PDF engine took too long.'))
    const result = await service().run(request())
    expect(result).toEqual({ status: 'failed', message: 'The PDF engine took too long.' })
    expect(readFileSync(target!, 'utf8')).toBe('previous export')
    expect(readdirSync(dir)).toEqual(['out.pdf'])
    expect(exported).toEqual([])
    // The service is still usable.
    expect((await service().run(request())).status).toBe('saved')
  })

  it('reports cancellation of a running job without writing', async () => {
    writeFileSync(target!, 'previous export')
    const svc = service()
    print.mockImplementationOnce(
      (_html: string, _options: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new PdfJobCancelled()))
        )
    )
    const running = svc.run(request())
    await vi.waitFor(() => expect(print).toHaveBeenCalled())
    svc.cancel('job-1')
    expect(await running).toEqual({ status: 'cancelled' })
    expect(readFileSync(target!, 'utf8')).toBe('previous export')
    expect(readdirSync(dir)).toEqual(['out.pdf'])
  })

  it('refuses to export over a folder', async () => {
    target = path.join(dir, 'folder.pdf')
    mkdirSync(target)
    const result = await service().run(request())
    expect(result.status).toBe('failed')
  })

  it('exports HTML only when it is a complete document', async () => {
    target = path.join(dir, 'page.html')
    const ok = await service().run(request({ format: 'html', pdf: undefined }))
    expect(ok.status).toBe('saved')
    expect(readFileSync(target, 'utf8')).toContain('<body>x</body>')

    target = path.join(dir, 'broken.html')
    const bad = await service().run(request({ format: 'html', html: '<p>fragment</p>', pdf: undefined }))
    expect(bad).toMatchObject({ status: 'failed' })
    expect(existsSync(target)).toBe(false)
  })

  it('does not run two jobs with the same id', async () => {
    const svc = service()
    let release!: () => void
    print.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(PDF))))
    const first = svc.run(request())
    await vi.waitFor(() => expect(print).toHaveBeenCalled())
    expect(await svc.run(request())).toMatchObject({ status: 'failed' })
    release()
    expect((await first).status).toBe('saved')
  })
})

describe('export request validation', () => {
  it('rejects invalid page setups with a readable message', () => {
    const bad = validateExportRequest({
      ...request(),
      pdf: { ...DEFAULT_PDF_OPTIONS, margins: { top: -1, right: 20, bottom: 20, left: 20 } }
    })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.message).toMatch(/margin/i)
  })

  it('rejects malformed requests', () => {
    for (const input of [null, 'x', {}, { ...request(), format: 'docx' }, { ...request(), html: '' }, { ...request(), jobId: '' }]) {
      expect(validateExportRequest(input).ok).toBe(false)
    }
  })

  it('does not require page settings for HTML', () => {
    expect(validateExportRequest({ ...request(), format: 'html', pdf: undefined }).ok).toBe(true)
  })
})

describe('atomic writes', () => {
  it('replaces an existing file completely and cleans up', async () => {
    const file = path.join(dir, 'a.txt')
    writeFileSync(file, 'old')
    await writeFileAtomic(file, 'new content')
    expect(readFileSync(file, 'utf8')).toBe('new content')
    expect(readdirSync(dir)).toEqual(['a.txt'])
  })

  it('leaves the target alone when the destination folder is missing', async () => {
    await expect(writeFileAtomic(path.join(dir, 'missing', 'a.txt'), 'x')).rejects.toThrow()
    expect(readdirSync(dir)).toEqual([])
  })
})

/**
 * Mermaid runs here, in a hidden, sandboxed window of its own (see `DiagramService`).
 *
 * The page has no preload script, no Node.js and no access to the application's files or IPC.
 * It receives untrusted diagram text, turns it into an SVG string and hands the string back; the
 * application then sanitises that string again before it touches any document.
 */
import mermaid from 'mermaid'
import type { DiagramRenderRequest, DiagramRenderResult } from '@shared/diagram'
import { mixColors } from '@shared/presentation/theme'

let configuredFor = ''

function configure(request: DiagramRenderRequest): void {
  const key = `${request.variant}|${request.fontFamily}|${request.accent}|${request.text}|${request.background}|${request.svgId}`
  if (key === configuredFor) return
  configuredFor = key
  const dark = request.variant === 'dark'
  mermaid.initialize({
    startOnLoad: false,
    // Labels cannot contain HTML or script in strict mode.
    securityLevel: 'strict',
    suppressErrorRendering: true,
    // The `base` theme is the one Mermaid lets us colour completely, so diagrams take the
    // document's own text, page and accent colours.
    theme: 'base',
    fontFamily: request.fontFamily,
    // SVG text instead of <foreignObject> HTML: the output is a static, self-contained SVG that
    // also prints correctly with JavaScript disabled.
    htmlLabels: false,
    deterministicIds: true,
    deterministicIDSeed: request.svgId,
    maxTextSize: 50_000,
    themeVariables: {
      darkMode: dark,
      fontFamily: request.fontFamily,
      background: request.background,
      textColor: request.text,
      primaryTextColor: request.text,
      titleColor: request.text,
      primaryColor: mixColors(request.background, request.accent, dark ? 0.3 : 0.12),
      primaryBorderColor: request.accent,
      nodeBorder: request.accent,
      secondaryColor: mixColors(request.background, request.text, dark ? 0.12 : 0.06),
      secondaryBorderColor: mixColors(request.background, request.text, 0.4),
      tertiaryColor: mixColors(request.background, request.text, dark ? 0.08 : 0.04),
      tertiaryBorderColor: mixColors(request.background, request.text, 0.3),
      lineColor: mixColors(request.text, request.background, 0.3),
      clusterBkg: mixColors(request.background, request.text, dark ? 0.08 : 0.04),
      clusterBorder: mixColors(request.background, request.text, 0.35),
      edgeLabelBackground: request.background,
      noteBkgColor: mixColors(request.background, request.accent, 0.1),
      noteTextColor: request.text,
      noteBorderColor: request.accent,
      actorBkg: mixColors(request.background, request.accent, dark ? 0.3 : 0.12),
      actorBorder: request.accent,
      actorTextColor: request.text,
      signalColor: request.text,
      signalTextColor: request.text
    },
    flowchart: { htmlLabels: false, useMaxWidth: true },
    sequence: { useMaxWidth: true },
    class: { htmlLabels: false, useMaxWidth: true },
    state: { useMaxWidth: true },
    er: { useMaxWidth: true },
    gantt: { useMaxWidth: true },
    journey: { useMaxWidth: true },
    pie: { useMaxWidth: true },
    timeline: { useMaxWidth: true }
  })
}

function failure(id: string, error: unknown): DiagramRenderResult {
  const raw = error instanceof Error ? error.message : String(error)
  const message = raw.replace(/\s+\n/g, '\n').split('\n').slice(0, 6).join('\n').slice(0, 600)
  const match = /line\s+(\d+)/i.exec(raw)
  return { id, ok: false, message, line: match ? Number(match[1]) : null }
}

async function render(request: DiagramRenderRequest): Promise<DiagramRenderResult> {
  try {
    configure(request)
    await mermaid.parse(request.source)
    const { svg } = await mermaid.render(request.svgId, request.source)
    return { id: request.id, ok: true, svg }
  } catch (error) {
    return failure(request.id, error)
  } finally {
    // Mermaid leaves temporary containers behind when a render fails half-way.
    document
      .querySelectorAll(`[id$="${request.svgId}"], #d${request.svgId}`)
      .forEach((n) => n.remove())
  }
}

declare global {
  interface Window {
    msDiagram: { render(request: DiagramRenderRequest): Promise<DiagramRenderResult> }
  }
}

window.msDiagram = { render }

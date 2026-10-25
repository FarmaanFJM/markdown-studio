import { describe, expect, it } from 'vitest'
import { THEME_CSS } from '@shared/presentation/themeCss'
import { analyzeCss } from '@shared/presentation/css'
import {
  BUILTIN_THEMES,
  buildThemeStyles,
  contrastRatio,
  diagramVariant,
  mixColors,
  normalizeColor,
  normalizeFont,
  resolveTheme,
  sanitizeCustomization,
  themeAttributes,
  THEME_IDS
} from '@shared/presentation/theme'
import {
  DEFAULT_DOCUMENT_SETTINGS,
  resolvePresentation,
  sanitizeDocumentSettings,
  sanitizeWorkspacePresentation
} from '@shared/presentation/settings'
import { DEFAULT_SETTINGS, sanitizeSettings } from '@shared/settings'

describe('built-in document themes', () => {
  it('provides at least four themes', () => {
    expect(THEME_IDS.length).toBeGreaterThanOrEqual(4)
    expect(THEME_IDS).toEqual(['minimal', 'technical', 'editorial', 'report'])
  })

  it('differ in typography, structure and composition, not only in accent colour', () => {
    const themes = THEME_IDS.map((id) => resolveTheme(id))
    const css = themes.map((t) => buildThemeStyles(t))
    expect(new Set(css).size).toBe(THEME_IDS.length)
    // Each aspect varies across the set.
    expect(new Set(themes.map((t) => t.bodyFont)).size).toBeGreaterThanOrEqual(3)
    expect(new Set(themes.map((t) => t.bodyFontSize)).size).toBeGreaterThanOrEqual(3)
    expect(new Set(themes.map((t) => t.headingSizes[0])).size).toBe(4)
    expect(new Set(themes.map((t) => t.tableStyle)).size).toBe(4)
    expect(new Set(themes.map((t) => t.quoteStyle)).size).toBe(4)
    expect(new Set(themes.map((t) => t.codeStyle)).size).toBeGreaterThanOrEqual(3)
    expect(new Set(themes.map((t) => t.contentWidth)).size).toBe(4)
    expect(new Set(themes.map((t) => t.lineHeight)).size).toBeGreaterThanOrEqual(3)
    // The CSS that is specific to each theme is not shared.
    expect(new Set(THEME_IDS.map((id) => THEME_CSS[id])).size).toBe(4)
    for (const id of THEME_IDS) expect(THEME_CSS[id].length).toBeGreaterThan(300)
  })

  it('has readable text and link contrast in every theme', () => {
    for (const id of THEME_IDS) {
      const t = resolveTheme(id)
      expect(contrastRatio(t.text, t.background), `${id} text`).toBeGreaterThanOrEqual(7)
      expect(contrastRatio(t.link, t.background), `${id} link`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(t.heading, t.background), `${id} heading`).toBeGreaterThanOrEqual(7)
    }
  })

  it('has a name and description for the picker', () => {
    for (const theme of Object.values(BUILTIN_THEMES)) {
      expect(theme.name.length).toBeGreaterThan(3)
      expect(theme.description.length).toBeGreaterThan(20)
    }
  })

  it('ships stylesheets that satisfy the same CSS policy as user CSS', () => {
    for (const id of THEME_IDS) {
      const analysis = analyzeCss(buildThemeStyles(resolveTheme(id)))
      expect(analysis.problems, id).toEqual([])
    }
  })
})

describe('theme customisation', () => {
  it('keeps valid values and drops invalid ones', () => {
    const c = sanitizeCustomization({
      bodyFontSize: 99,
      lineHeight: 1.8,
      textColor: '#ABC',
      linkColor: 'red; background:url(x)',
      accentColor: 'javascript:alert(1)',
      bodyFont: 'serif',
      headingFont: "custom:Evil';}body{",
      tableStyle: 'grid',
      codeStyle: 'neon',
      unknownField: 1
    })
    expect(c).toEqual({
      bodyFontSize: 28,
      lineHeight: 1.8,
      textColor: '#aabbcc',
      bodyFont: 'serif',
      tableStyle: 'grid'
    })
  })

  it('validates fonts and colours', () => {
    expect(normalizeFont('custom:Inter Tight')).toBe('custom:Inter Tight')
    expect(normalizeFont('custom:a;b')).toBeNull()
    expect(normalizeFont('unknown')).toBeNull()
    expect(normalizeColor('#FFF')).toBe('#ffffff')
    expect(normalizeColor('rgb(0,0,0)')).toBeNull()
    expect(normalizeColor(12)).toBeNull()
  })

  it('applies customisation over the theme and quotes custom families', () => {
    const t = resolveTheme('minimal', {
      bodyFont: 'custom:Inter Tight',
      headingScale: 1.2,
      contentWidth: 1000,
      accentColor: '#ff0000'
    })
    expect(t.bodyFont.startsWith("'Inter Tight', ")).toBe(true)
    expect(t.headingSizes[0]).toBeCloseTo(2.4)
    expect(t.contentWidth).toBe(1000)
    expect(t.accent).toBe('#ff0000')
  })

  it('adapts text, links and diagrams to a dark page', () => {
    const dark = resolveTheme('minimal', { pageBackground: '#0d1117' })
    expect(dark.dark).toBe(true)
    expect(contrastRatio(dark.text, dark.background)).toBeGreaterThan(7)
    expect(diagramVariant(dark)).toBe('dark')
    expect(diagramVariant(resolveTheme('minimal'))).toBe('light')
    expect(themeAttributes(dark)['data-code-tone']).toBe('dark')
  })

  it('falls back to the default theme for unknown ids', () => {
    expect(resolveTheme('nope').id).toBe('minimal')
  })

  it('mixes colours', () => {
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  it('emits variant attributes for the stylesheet', () => {
    expect(themeAttributes(resolveTheme('technical'))).toMatchObject({
      'data-theme': 'technical',
      'data-table': 'grid',
      'data-code': 'dark',
      'data-quote': 'boxed'
    })
  })
})

describe('layered presentation settings', () => {
  it('uses defaults, then workspace overrides, then export overrides', () => {
    const defaults = { ...DEFAULT_DOCUMENT_SETTINGS, theme: 'technical' as const }
    expect(resolvePresentation(defaults, null).origin.theme).toBe('default')
    const workspace = resolvePresentation(defaults, { theme: 'editorial' })
    expect(workspace.themeId).toBe('editorial')
    expect(workspace.origin.theme).toBe('workspace')
    const exported = resolvePresentation(defaults, { theme: 'editorial' }, { theme: 'report' })
    expect(exported.themeId).toBe('report')
    expect(exported.origin.theme).toBe('export')
    expect(exported.origin.math).toBe('default')
  })

  it('lets a workspace switch math and diagrams off', () => {
    const effective = resolvePresentation(DEFAULT_DOCUMENT_SETTINGS, {
      math: { enabled: false },
      diagrams: { enabled: false }
    })
    expect(effective.math).toBe(false)
    expect(effective.diagrams).toBe(false)
    expect(effective.origin.math).toBe('workspace')
  })

  it('sanitises workspace override files', () => {
    expect(
      sanitizeWorkspacePresentation({
        theme: 'nope',
        customization: { bodyFontSize: 20, junk: 1 },
        math: { enabled: 'yes' },
        diagrams: { enabled: false },
        other: true
      })
    ).toEqual({ customization: { bodyFontSize: 20 }, diagrams: { enabled: false } })
    expect(sanitizeWorkspacePresentation('garbage')).toEqual({})
  })
})

describe('configuration backward compatibility', () => {
  it('adds document defaults to settings written by Phase 1 and 2', () => {
    const phase2 = {
      version: 1,
      theme: 'light',
      editor: { fontSize: 18 },
      markdown: { toolbar: false }
    }
    const settings = sanitizeSettings(phase2)
    expect(settings.editor.fontSize).toBe(18)
    expect(settings.theme).toBe('light')
    expect(settings.document).toEqual(DEFAULT_SETTINGS.document)
  })

  it('survives malformed or hostile document settings', () => {
    const settings = sanitizeSettings({
      document: {
        theme: 42,
        customization: 'x',
        customCss: { source: 'file', path: '/etc/passwd' },
        math: null,
        pdf: { pageSize: 'Tabloid', margins: { top: -4, left: 9999 }, scale: 50 },
        exportPreset: '../../x'
      }
    })
    expect(settings.document.theme).toBe('minimal')
    expect(settings.document.customization).toEqual({})
    expect(settings.document.customCss).toEqual({ source: 'none', text: '', path: null })
    expect(settings.document.math.enabled).toBe(true)
    expect(settings.document.pdf.pageSize).toBe('A4')
    expect(settings.document.pdf.margins.top).toBe(20)
    expect(settings.document.pdf.scale).toBe(1)
    expect(settings.document.exportPreset).toBe('standard-pdf')
  })

  it('round-trips valid document settings', () => {
    const doc = sanitizeDocumentSettings({
      theme: 'report',
      customization: { accentColor: '#112233' },
      customCss: { source: 'inline', text: 'h1{color:red}', path: null },
      math: { enabled: false },
      pdf: { pageSize: 'Letter', orientation: 'landscape' }
    })
    expect(sanitizeDocumentSettings(doc)).toEqual(doc)
    expect(doc.pdf.orientation).toBe('landscape')
    expect(doc.math.enabled).toBe(false)
  })
})

import katexCss from 'katex/dist/katex.min.css?raw'

// The fonts are bundled with the application and embedded as data URIs, so equations look the
// same in the preview, in PDF and in a standalone HTML file opened anywhere offline.
const fontFiles = import.meta.glob('../../../../node_modules/katex/dist/fonts/*.woff2', {
  query: '?inline',
  import: 'default',
  eager: true
}) as Record<string, string>

let built: string | null = null

/** KaTeX's stylesheet with every font face reduced to an embedded WOFF2 data URI. */
export function katexStylesheet(): string {
  if (built !== null) return built
  const fonts = new Map<string, string>()
  for (const [file, data] of Object.entries(fontFiles)) {
    fonts.set(file.slice(file.lastIndexOf('/') + 1), data)
  }
  built = katexCss.replace(
    /src:url\(fonts\/([^)]+\.woff2)\) format\("woff2"\)(?:,url\([^)]*\) format\("[^"]*"\))*/g,
    (whole, name: string) => {
      const data = fonts.get(name)
      return data ? `src:url(${data}) format("woff2")` : whole
    }
  )
  return built
}

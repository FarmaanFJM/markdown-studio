// Writes THIRD_PARTY_NOTICES.md for every package bundled into the application.
// Run with `npm run notices` after changing runtime dependencies.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
// Packages imported by application code; their dependencies are added automatically.
const BUNDLED = [
  'react',
  'react-dom',
  'zustand',
  'monaco-editor',
  'markdown-it',
  'dompurify',
  'highlight.js',
  'pdfjs-dist',
  'lucide-react'
]

function packageDir(name, from = ROOT) {
  let dir = from
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name)
    if (existsSync(path.join(candidate, 'package.json'))) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error(`Cannot find ${name}`)
    dir = parent
  }
}

const seen = new Map()
function visit(name, from) {
  const dir = packageDir(name, from)
  if (seen.has(dir)) return
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
  seen.set(dir, pkg)
  for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, dir)
}
BUNDLED.forEach((name) => visit(name, ROOT))

const entries = [...seen.entries()].sort(([, a], [, b]) => a.name.localeCompare(b.name))
let out = `# Third-party notices

Markdown Studio is distributed under the MIT License (see \`LICENSE\`). It bundles the
following open-source packages. Electron and Chromium notices are shipped alongside the
executable as \`LICENSE\` and \`LICENSES.chromium.html\`.

| Package | Version | License |
| ------- | ------- | ------- |
${entries.map(([, p]) => `| ${p.name} | ${p.version} | ${p.license ?? 'see below'} |`).join('\n')}
`
for (const [dir, pkg] of entries) {
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f))
  const text = file ? readFileSync(path.join(dir, file), 'utf8').trim() : `License: ${pkg.license}`
  out += `\n## ${pkg.name} ${pkg.version}\n\n\`\`\`text\n${text}\n\`\`\`\n`
}
writeFileSync(path.join(ROOT, 'THIRD_PARTY_NOTICES.md'), out)
process.stdout.write(`Wrote notices for ${entries.length} packages.\n`)

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
  'lucide-react',
  'katex',
  'mermaid',
  'css-tree'
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

const OFL = readFileSync(path.join(import.meta.dirname, 'OFL-1.1.txt'), 'utf8').trim()
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
out += `
## KaTeX fonts (bundled with katex, embedded in documents and exports)

\`\`\`text
Copyright (c) 2009-2010, Design Science, Inc. (<www.mathjax.org>)
Copyright (c) 2014-2018 Khan Academy (<www.khanacademy.org>),
Copyright (c) 1995, 2009 American Mathematical Society (<www.ams.org>),
with Reserved Font Names KaTeX_AMS, KaTeX_Caligraphic, KaTeX_Fraktur, KaTeX_Main, KaTeX_Math,
KaTeX_SansSerif, KaTeX_Script, KaTeX_Size1, KaTeX_Size2, KaTeX_Size3, KaTeX_Size4 and KaTeX_Typewriter.

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at: http://scripts.sil.org/OFL

${OFL}
\`\`\`
`
writeFileSync(path.join(ROOT, 'THIRD_PARTY_NOTICES.md'), out)
process.stdout.write(`Wrote notices for ${entries.length} packages.\n`)

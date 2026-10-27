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
  'css-tree',
  '@citation-js/core',
  '@citation-js/plugin-csl',
  '@citation-js/plugin-bibtex',
  'yaml'
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

Citations are formatted with citeproc-js, which is offered under the Common Public Attribution
License 1.0 (CPAL) or the GNU AGPL 3.0; this application uses it under the CPAL, and the
attribution below applies. The APA citation style and the CSL locales bundled by
\`@citation-js/plugin-csl\` come from the Citation Style Language project
(https://citationstyles.org) and are licensed CC BY-SA 3.0 (styles) and CC BY-SA 3.0 (locales).

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
// Redistributed executable (not bundled JavaScript): one platform build per installer.
const COPILOT = 'node_modules/@github/copilot-language-server-linux-x64'
if (existsSync(path.join(ROOT, COPILOT, 'package.json'))) {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, COPILOT, 'package.json'), 'utf8'))
  out += `
## GitHub Copilot language server ${pkg.version} (executable shipped in resources/copilot)

The installer for each platform includes that platform's build of \`@github/copilot-language-server\`, published by
GitHub under the MIT License. Use of the GitHub Copilot service is governed by GitHub's terms, not by this licence.

\`\`\`text
MIT License

Copyright (c) 2025 GitHub

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
\`\`\`
`
}
writeFileSync(path.join(ROOT, 'THIRD_PARTY_NOTICES.md'), out)
process.stdout.write(`Wrote notices for ${entries.length} packages.\n`)

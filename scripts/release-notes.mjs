// Prints the release notes for a tag (for example `v0.3.0`): the matching CHANGELOG section plus
// the verification and signing status. Used by the release workflow; safe to run locally.
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const tag =
  process.argv[2] ?? `v${JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version}`
const version = tag.replace(/^v/, '')
const changelog = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
const heading = new RegExp(`^## ${version.replace(/\./g, '\\.')}\\b.*$`, 'm')
const start = changelog.search(heading)
let section
if (start >= 0) {
  const rest = changelog.slice(start)
  const next = rest.slice(3).search(/^## /m)
  section = (next >= 0 ? rest.slice(0, next + 3) : rest).replace(/^## .*\n/, '').trim()
} else {
  section = `No CHANGELOG entry was found for ${version}.`
}

process.stdout.write(`${section}

## Downloads

- **Windows:** \`Markdown-Studio-Setup-${version}.exe\`
- **Linux:** \`Markdown-Studio-${version}-x86_64.AppImage\`
- **macOS:** \`Markdown-Studio-${version}-*.dmg\`

## Verification

Every artifact attached to this draft was built by the release workflow after the lint,
formatting, typecheck, unit, security, export-rendering and desktop E2E gates passed on Linux and
Windows, and after the packaged Windows and Linux applications were smoke-tested. The Windows
installer was also installed silently and launched. macOS packaging is built and smoke-tested by
the macOS job; see the workflow run for its result.

## Signing

Artifacts are code-signed **only** when signing certificates are configured as repository secrets
(see docs/RELEASING.md). If the Windows installer shows "UNSIGNED" in the workflow summary, it is
unsigned: Windows SmartScreen will warn on first launch, and macOS Gatekeeper will require
right-click → Open. This draft is a pre-release and must be reviewed and published manually.
`)

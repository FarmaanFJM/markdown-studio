# Development guide

How to run, build and test Markdown Studio, and where the code lives. For design decisions and data flows read [ARCHITECTURE.md](ARCHITECTURE.md).

## Running from source

### Requirements

- [Node.js](https://nodejs.org/) 22 or newer and npm
- Windows 10/11 (primary target), macOS or Linux

### Install and start

```bash
git clone https://github.com/FarmaanFJM/markdown-studio.git
cd markdown-studio
npm ci          # also downloads the Electron runtime
npm run dev     # starts the app with hot reload
```

`npm run build` compiles to `out/`, and `npm start` runs that build.

### Build the Windows installer

On a Windows machine:

```bash
npm ci
npm run package:win
```

The NSIS installer is written to `release/<version>/Markdown-Studio-Setup-<version>.exe`
(unpacked app: `release/<version>/win-unpacked/MarkdownStudio.exe`). Building the Windows
installer on Linux or macOS requires Wine, so use a Windows host or CI.

The CI workflow builds the installer on GitHub Actions (`windows-latest`) for `main`, release tags and manual
runs (not ordinary development pushes; see [CI policy](CI.md)) and attaches it to the workflow run as the
**markdown-studio-windows-installer** artifact. Pushing a `v*` tag also creates a draft
GitHub Release with the installer. The installer is not code-signed yet, so Windows
SmartScreen will warn on first launch.

`npm run package:linux` (AppImage) and `npm run package:mac` (DMG) are configured for their
own platforms.

## Release status

- Version 0.4.0 pre-release builds are produced by CI as GitHub Actions artifacts and, when a
  release tag is pushed, attached to a **draft** GitHub release for manual review. No release is
  published automatically.
- **The Windows installer is not code-signed.** Windows SmartScreen will warn on first launch.
  The release workflow contains a signing path that activates only when the repository secrets
  `WINDOWS_CERTIFICATE_BASE64` and `WINDOWS_CERTIFICATE_PASSWORD` (and, for macOS,
  `MAC_CERTIFICATE_BASE64`, `MAC_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
  `APPLE_TEAM_ID`) exist; without them the artifacts are plainly unsigned. See
  [docs/RELEASING.md](RELEASING.md).
- CI verifies each platform as far as its job goes. Linux runs the unit and full E2E suites and
  smoke-tests the packaged AppImage. Windows runs them against the unpacked application, silently
  installs the installer and tests the installed application. macOS builds the DMG and runs the
  packaged-app smoke test only (not the full E2E suite); it is unsigned and not notarised.

## Testing

| Command                | What it runs                                                                                                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`         | ESLint (TypeScript, React hooks)                                                                                                                                                                                                 |
| `npm run format:check` | Prettier                                                                                                                                                                                                                         |
| `npm run typecheck`    | TypeScript for the main, preload and renderer projects                                                                                                                                                                           |
| `npm run test:unit`    | Vitest: paths, image references, rendering and sanitisation, file, asset and template services, settings, and the Markdown tooling (analysis, tables, lists, formatting, references, rename planning, TOC, link checks, linting) |
| `npm run test:e2e`     | Playwright driving the real Electron app (run `npm run build` first)                                                                                                                                                             |
| `npm test`             | Unit tests, build, then E2E                                                                                                                                                                                                      |
| `npm run screenshots`  | Rebuilds and recaptures the Phase 2 and Phase 3 screenshots in `docs/screenshots/` from the running application                                                                                                                  |
| `npm run benchmark`    | Performance benchmark (typing latency, render and PDF time, memory growth, tab switching, repeated exports); see [docs/PERFORMANCE.md](PERFORMANCE.md)                                                                           |

The end-to-end suite launches the application with an isolated settings folder and a copy of
`tests/fixtures/`, and covers opening folders, editing and saving, unsaved-change prompts,
tabs, file operations, thumbnails, Explorer and operating-system image drops, relative paths,
the HTML and PDF previews, untrusted HTML, exports, pane resizing, shortcuts and settings
persistence across restarts — and, for Phase 2, suggestions, formatting, smart lists, table
formatting and the graphical table editor, templates (scopes, variables, restarts, assets),
the outline and table of contents, link and image completion, problem markers and quick
fixes, reference-aware rename and move (including drag-and-drop, unsaved documents and
on-disk conflicts), the toolbar, menus, palette and settings, and CRLF/BOM preservation.

Phase 3 adds E2E coverage for math and Mermaid rendering (including malformed input and
diagram caching), document themes and persistence, workspace overrides, custom CSS (valid, unsafe
and file-based), PDF page sizes and orientations, headers, footers and real page numbers (read
back from the PDF with PDF.js and rasterised to images), standalone HTML export opened in a plain
window, export presets, cancel/failure recovery, hostile Markdown, diagram-renderer isolation,
IPC validation, keyboard and focus behaviour, contrast, reduced motion and small windows. Unit
tests cover the CSS policy, math and Mermaid parsing, themes, page options, presets, services and
the examples of the mathematics guide.

Levels 1 and 2 add `data-safety.spec.ts` (paste, conflicts, crash recovery, session restore,
relinking on Save As, moved project folder, missing images), `publishing-core.spec.ts`,
`layout-stress.spec.ts` (140-row and 12-column tables, large images and long code lines in one and
two columns, checked on the rasterised PDF) and `school-workflow.spec.ts`, which drives the whole
Playful Tech workflow through the real interface — project, formatted writing, pasted and
dragged images, tables, captions, citations, contents, restart, multi-page PDF, two columns and
a three-chapter publication. Unit tests cover front matter, document settings, labels and
numbering, cross-references, citations and APA output, sources, BibTeX import, the publication
builder and the templates.

The newest specs are `ide-polish.spec.ts` (context menu, Quick Fixes, title bar, image drops, Settings page, AI), `markdown-shortcuts.spec.ts` (standard formatting shortcuts, undo, toolbar equivalence, Settings search) and `student-workflow.spec.ts` (Professional Report numbering and PDF text, a wide comparison table, an image drop checked in the preview and the PDF). Unit tests added with them cover the shared shortcut definition (including a check that `docs/KEYBOARD_SHORTCUTS.md` is in sync), image placement with rendered HTML, table width, Quick Fixes, heading numbers, the AI service, settings and window options.

Run a single spec with `npx playwright test tests/e2e/markdown-shortcuts.spec.ts` (after `npm run build`), or one test with `-g "part of its title"`. A packaged build can be tested on Linux with `npx electron-builder --linux dir --publish never` and `MARKDOWN_STUDIO_EXECUTABLE=release/<version>/linux-unpacked/markdown-studio`.

On Linux without a display, run it under Xvfb:

```bash
xvfb-run -a npm run test:e2e
```

To test a packaged build instead of `out/`, point the suite at its executable:

```bash
MARKDOWN_STUDIO_EXECUTABLE="release/0.1.0/win-unpacked/MarkdownStudio.exe" npm run test:e2e
```

## Where the code lives

Markdown Studio is an Electron application with a strict split between a privileged main
process and a sandboxed React renderer. A short overview:

| Area                             | Location                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App lifecycle, window, IPC, menu | `src/main/index.ts`, `src/main/menu.ts`                                                                                                                      |
| File access policy               | `src/main/services/accessControl.ts`                                                                                                                         |
| File operations, watching        | `src/main/services/fileService.ts`, `workspaceWatcher.ts`                                                                                                    |
| Image import                     | `src/main/services/assetService.ts`                                                                                                                          |
| Template storage                 | `src/main/services/templateService.ts`                                                                                                                       |
| Local image protocol, thumbnails | `src/main/services/protocol.ts`                                                                                                                              |
| PDF generation, export jobs      | `src/main/services/pdfService.ts`, `exportService.ts`, `atomicWrite.ts`                                                                                      |
| Mermaid renderer (isolated)      | `src/main/services/diagramService.ts`, `src/renderer/src/diagram-host/`                                                                                      |
| Presets, workspace appearance    | `src/main/services/presetService.ts`, `presentationService.ts`                                                                                               |
| Themes, CSS policy, page options | `src/shared/presentation/`, `src/shared/export/`                                                                                                             |
| Settings persistence             | `src/main/services/settingsService.ts`                                                                                                                       |
| Preload bridge (the only API)    | `src/preload/index.ts`, contract in `src/shared/ipc.ts`                                                                                                      |
| Shared, process-neutral logic    | `src/shared/` (paths, settings schema, image references)                                                                                                     |
| Markdown language tooling        | `src/shared/markdown/` (analysis, tables, lists, formatting, references, rename planning, TOC, link checks), `src/shared/lint.ts`, `src/shared/templates.ts` |
| Markdown pipeline                | `src/renderer/src/markdown/` (render → sanitise → document)                                                                                                  |
| Editor, tabs, image drops        | `src/renderer/src/editor/`                                                                                                                                   |
| Editor commands and providers    | `src/renderer/src/editor/markdown/`                                                                                                                          |
| Command registry, palette        | `src/renderer/src/commands/`, `src/renderer/src/palette/`                                                                                                    |
| Outline, tables, templates       | `src/renderer/src/outline/`, `tables/`, `templates/`                                                                                                         |
| Problems, reference updates      | `src/renderer/src/diagnostics/`, `references/`                                                                                                               |
| Explorer                         | `src/renderer/src/explorer/`                                                                                                                                 |
| Previews                         | `src/renderer/src/preview/`                                                                                                                                  |
| State (Zustand stores)           | `src/renderer/src/state/`                                                                                                                                    |

See [docs/ARCHITECTURE.md](ARCHITECTURE.md) for data flows, the security model and the
extension points prepared for later phases.

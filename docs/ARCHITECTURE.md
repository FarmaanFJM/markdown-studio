# Markdown Studio architecture

This document describes how Markdown Studio is put together: the Phase 1 foundation, the Phase 2
Markdown intelligence and the Phase 3 presentation and publishing pipeline. The user-facing
descriptions are in [AUTHORING.md](AUTHORING.md), [MATHEMATICS.md](MATHEMATICS.md) and
[PUBLISHING.md](PUBLISHING.md); measured performance is in [PERFORMANCE.md](PERFORMANCE.md).

## Technology

| Concern           | Choice                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Desktop shell     | Electron (main, preload and renderer processes)                                                                            |
| UI                | React + TypeScript, bundled by Vite through electron-vite                                                                  |
| Source editor     | Monaco Editor, bundled locally (no CDN)                                                                                    |
| Markdown          | markdown-it (CommonMark + GFM tables, strikethrough, autolinks) with small in-house plugins for task lists and heading ids |
| Code highlighting | highlight.js (common languages)                                                                                            |
| Mathematics       | KaTeX (bundled, fonts embedded as data URIs); in-house markdown-it plugin for the delimiters                               |
| Diagrams          | Mermaid, in an isolated hidden `BrowserWindow`; SVG output sanitised and cached                                            |
| CSS policy        | css-tree (a real CSS parser) behind one validation module                                                                  |
| Sanitisation      | DOMPurify                                                                                                                  |
| PDF generation    | Chromium printing (`webContents.printToPDF`)                                                                               |
| PDF display       | PDF.js (`pdfjs-dist`)                                                                                                      |
| State             | Zustand stores                                                                                                             |
| Packaging         | electron-builder (NSIS on Windows)                                                                                         |
| Style checks      | markdownlint, run in a Web Worker                                                                                          |
| Tests             | Vitest (unit, jsdom for DOM code) and Playwright's Electron driver (E2E)                                                   |

There is no server and no network dependency; documents stay on the local file system.

## Processes and boundaries

```
┌────────────────────────── main process (Node.js, privileged) ──────────────────────────┐
│ index.ts      lifecycle, window, IPC handlers (sender-checked), security policies     │
│ menu.ts       native menu → "menu:command" messages                                   │
│ services/     accessControl · fileService · workspaceWatcher · assetService           │
│               settingsService · protocol (msfile:) · pdfService                       │
└───────────────▲───────────────────────────────────────────────────────────▲───────────┘
                │ ipcRenderer.invoke (typed contract: src/shared/ipc.ts)     │ msfile://
┌───────────────┴─────── preload (sandboxed, contextBridge) ──────┐          │
│ window.markdownStudio — the only API the renderer can use       │          │
└───────────────▲─────────────────────────────────────────────────┘          │
┌───────────────┴──────────────── renderer (sandboxed, no Node) ─────────────┴───────────┐
│ React UI · Monaco · Markdown pipeline · Explorer · previews · Zustand stores           │
│   └─ preview iframe: sandbox="allow-same-origin" (no scripts), strict CSP               │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

`src/shared/` holds code used by both sides and has no dependency on Node or the DOM: path
arithmetic that understands Windows and POSIX paths, the settings schema and validation,
file-type detection, image-reference formatting and the IPC contract.

## Main-process services

- **AccessControl** decides what the renderer may touch. The open workspace grants full access
  beneath it; files chosen in native dialogs are granted individually, and their folders may
  serve images and receive imported assets. Every file-system request is resolved and checked
  before any I/O.
- **FileService** lists directories (folders first, natural sort, `.git` hidden), reads and
  writes text byte-for-byte (a UTF-8 BOM is remembered and restored), creates, renames and
  deletes entries with name validation that is safe on Windows, and never deletes the workspace
  root.
- **WorkspaceWatcher** watches the workspace recursively and reports changed directories in
  batches so the Explorer refreshes after outside changes.
- **TemplateService** stores templates and snippets as validated JSON, one file per template
  (`<id>.json`): global ones in the user-data folder, workspace ones in
  `<workspace>/.markdown-studio/templates/`. File names come only from validated ids, writes
  are atomic (temporary file, then rename), damaged or foreign files are skipped, and contents
  are data that is parsed, never evaluated. The Explorer hides `.markdown-studio`.
- **FileService** also lists the workspace's files (bounded, breadth-first, skipping hidden
  and dependency folders), checks many paths for existence in one call (paths outside the
  permitted areas answer `unknown`, never "missing"), moves entries without overwriting, and
  refuses a write when the file changed on disk after a given modification time.
- **AssetService** imports images. Workspace images are referenced in place; external images
  are copied with `COPYFILE_EXCL`, so an existing file is never overwritten, using `name-1`,
  `name-2`… for different files and reusing a byte-identical copy.
- **MsFileProtocol** (`msfile:`) is the only way rendered documents reach local files. It
  serves image types only, after the access check, plus cached thumbnails (system thumbnail
  provider on Windows/macOS) and one-off HTML documents for PDF printing.
- **PdfService** loads a document in a hidden window with JavaScript disabled and prints it with
  the validated page options (size, margins, scale, header/footer templates). Jobs are serialised
  and cancellable. **ExportService** writes results atomically; **DiagramService** hosts Mermaid;
  **PresetService** and **PresentationService** store presets and workspace appearance (Phase 3,
  below).
- **SettingsService** stores validated JSON in the user-data folder with debounced atomic
  writes and a synchronous flush when the application quits.

## Renderer modules

| Folder      | Responsibility                                                                                                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state/`    | `settings` (optimistic updates, batched persistence), `workspace` (directory cache, expansion, selection), `documents` (tabs, dirty tracking, save/close flows), `ui` (dialogs, toasts, context menu) |
| `editor/`   | Monaco setup and themes, one text model per document (independent undo), tabs, image drop handling                                                                                                    |
| `markdown/` | `render` (markdown-it + plugins) → `sanitize` (DOMPurify + image resolution) → `document` (standalone HTML shell, `document.css`) and `exporters`                                                     |
| `preview/`  | HTML preview iframe, PDF preview (PDF.js), link handling                                                                                                                                              |
| `explorer/` | Tree and thumbnail views, file actions, context menus                                                                                                                                                 |
| `commands/` | Command implementations shared by menus, toolbars and keyboard shortcuts                                                                                                                              |

## Key flows

**Rendering.** `renderDocumentBody(source, context)` renders Markdown with HTML enabled,
sanitises the result and rewrites every image source: relative paths are resolved against the
document's folder (a leading `/` means the workspace root) and become `msfile://local/…` URLs.
The same function feeds the HTML preview, the PDF pipeline and HTML export, so they cannot
drift apart.

**HTML preview.** The iframe is created once from the standalone document shell; updates
replace the body in place after a 120 ms pause, which keeps the scroll position. Clicks are
intercepted by the parent: fragments scroll, `.md` links open tabs, `http(s)`/`mailto` links go
to the system browser through a validated IPC call, and the iframe never navigates.

**PDF.** The renderer builds the document HTML (theme, math, diagrams, page height), the main
process prints it to PDF bytes with the configured page options, and PDF.js renders the pages to
canvases lazily. Export prints the identical HTML with the identical options and writes the
bytes atomically to the file chosen in the save dialog.

**HTML export.** The body is rendered, local images are fetched through `msfile:` and embedded
as data URIs, and the result is wrapped with the stylesheet and a restrictive CSP.

**Image drop.** The editor listens for drops in the capture phase. Explorer drags carry a
private MIME type with the file path; operating-system drops carry `File` objects whose paths
come from `webUtils.getPathForFile`. External files are imported by the main process. The
reference is built by `src/shared/imageReference.ts` relative to the document's folder and
inserted at the drop position (tracked with a decoration while files are copied) as one undoable
edit, with the alt text selected.

**Closing.** Closing the window is intercepted; the renderer resolves unsaved documents (Save
All / Don't Save / Cancel), flushes settings and then confirms the close.

## Phase 2: Markdown language tooling

The Markdown features are layered so that every feature reasons about a document the same way.

```
src/shared/markdown/            pure TypeScript, tested in Node (no DOM, no Monaco)
  plugins.ts   the one markdown-it configuration (heading ids, task lists) — used by the
               preview, the PDF/HTML export and all of the tooling below
  slug.ts      heading slugs and duplicate suffixes (#usage, #usage-1)
  analysis.ts  DocumentAnalysis from markdown-it tokens: headings (with the id the preview
               renders), fences, code, HTML blocks, tables, inline regions, HTML anchors
  references.ts exact positions of links, images, definitions, <img src>, <a href>; classify;
               render a rewritten destination in the written style; apply text replacements
  resolve.ts   resolveLocalPath: how a reference maps to a file (shared with the preview)
  tables.ts    GFM table parse/format/edit, display width, cursor ↔ cell mapping, problems
  lists.ts     Enter/Tab rules for lists and quotes
  formatting.ts toggles and line transformations returning *edit plans*
  toc.ts, linkProblems.ts, moves.ts, snippets.ts
src/shared/lint.ts, templates.ts, builtinTemplates.ts, templateAssets.ts
```

**One parse, one meaning.** `analysis.ts` parses with the preview's own markdown-it instance
(`createApplicationMarkdownIt`). The outline reads each heading's `id` from the token the
preview renders, the table of contents links to those ids, tables are found from the parser's
`table_open` ranges (so fenced "tables" are ignored), and references are scanned only inside
the inline and HTML regions the parser identified. Cell splitting mirrors markdown-it's table
rule character for character, and a test renders formatted tables to check the preview shows
the same cells. `resolveLocalPath` is the single definition of how a link or image maps to a
file: the preview, link completion, validation, template asset handling and rename planning all
call it.

**Edit plans.** Formatting functions never touch an editor. They take lines and a selection and
return `EditPlan`s (a range, replacement text, and where the selection should end up).
`editor/markdown/apply.ts` applies the plans of all cursors with a single `executeEdits`
(one undo step), converts line breaks to the model's EOL, and computes the final selections
deterministically from the plans. Only the planned ranges change, so unrelated text, CRLF and
the BOM (kept in `EditorDocument.hasBom`) are preserved.

**Parse cache.** `analysisFor(model)` memoises the analysis per Monaco model and version, so
completions, commands, the outline, the context menu and diagnostics share one parse until the
text changes. Anything that runs while typing is debounced (outline 200 ms, problem markers
600 ms, context key 120 ms).

**Commands.** `commands/registry.ts` lists every user-facing command once. The command palette,
the keyboard shortcuts (`KEYBINDINGS[].command`), the formatting toolbar, native menus (via a
generic `app.command` menu message), the editor's context menu and slash/completion items
(through `editor/markdown/runners.ts`) all run commands from the registry, so a command behaves
identically wherever it is started. Feature modules add their commands with `registerCommands`
in `commands/phase2.ts`.

**Editor features** (`editor/markdown/`):

- `completions.ts` — one completion provider for the `markdown` language. It decides the
  context from the parse (inside fenced code: nothing; after an opening fence: languages;
  inside `](…)`: path or anchor items; a lone `/` after a blank line: slash commands; in a
  table: table actions; otherwise block or inline snippets). Snippets are Monaco snippet
  strings from `snippets.ts`, inserted by the editor's own snippet controller. Directory
  listings come from `workspace/index.ts`, a cache with a short TTL that is invalidated by
  file-watcher events, so typing never scans the workspace.
- `smartEditing.ts` — `addCommand` registrations for Enter, Tab and Shift+Tab that apply only
  when nothing else owns the key (no selection, no suggest widget, no snippet session) and fall
  back to Monaco's own command otherwise.
- `tableCommands.ts`, `commands.ts`, `insert.ts`, `contextMenu.ts`, `navigation.ts`.

**Diagnostics** (`diagnostics/`). After typing stops, three independent checks refresh Monaco
markers with distinct owners: table problems (synchronous, from the analysis); link problems
(`findLinkProblems` with injected I/O: one batched `statMany`, anchors of other files read
through the cached index); style notes (markdownlint in `lint.worker.ts`, so a large document
cannot freeze the interface; results of an out-of-date version are discarded). Corrections are
stored with the markers and offered by one `CodeActionProvider`. Nothing is rewritten without a
command. markdownlint is bundled for the browser; because workers have no `document`, the
bundler aliases `decode-named-character-reference` to its table-based build
(`electron.vite.config.ts`).

**Templates.** `TemplateService` (main) stores data; `templates/store.ts` mirrors it for the UI
and feeds saved snippets to the completion provider. `expandTemplate` does one pass over the
body (no recursion, `\{{x}}` escapes, unknown names untouched). A document is created by
`templates/flows.tsx`: variables → managed table of contents → local-reference re-basing
(`prepareAssetsForDocument`), with a cursor marker carried through the text transformations;
then `FileService.createFile` (exclusive create, so nothing is overwritten) and `writeText`.

**Reference-aware rename/move.** `references/moveWithReferences.tsx` scans the workspace's
Markdown files (editor text for open documents), `planReferenceUpdates` (shared, pure) computes
the replacements for references to the moved item and for the moved documents' own relative
links, and a confirmation lists them. After the file-system operation, open documents are
edited through their models (saved only if they had no unsaved work and their file still
matches what was scanned); other files are rewritten with `writeText(…, expectedMtimeMs)`, which
the main process refuses if the file changed since it was read. Failures are listed, never
hidden.

**Dialogs.** `DialogHost` renders a stack, so confirmations can sit on top of the template
manager; `dialogs.custom` hosts feature dialogs (table editor, palette, templates, folder
picker) with the shared `Modal` (focus in, focus restored, Escape cancels).

## Phase 3: the document-presentation pipeline

One pipeline produces every output, so the four of them (HTML preview, HTML export, PDF preview,
PDF export) cannot disagree about what a document means:

```
Markdown source
  → shared markdown-it parse (src/shared/markdown/plugins.ts: headings, tasks, math, mermaid, page breaks)
  → render extensions: KaTeX (cached, sanitised once per expression) · Mermaid placeholders
  → sanitisation (DOMPurify; inline styles and <style> go through the CSS policy)
  → diagram stage: placeholders → cached SVG from the isolated renderer (sanitised again)
  → document presentation: theme CSS + math CSS + validated custom CSS + variant attributes
  → HTML preview │ standalone HTML (audited) │ PDF source → Chromium print → PDF preview / export
```

Presentation differences come from explicit settings, never from separate Markdown code paths.

### Modules and dependency boundaries

```
src/shared/                              pure TypeScript, no Node/DOM; unit-tested in Node
  markdown/math.ts, blocks.ts            delimiter rules; mermaid fences; <!-- pagebreak -->
  presentation/css.ts                    THE CSS security policy (css-tree)
  presentation/theme.ts, themeCss.ts     tokens, validation, resolution, stylesheets of 4 themes
  presentation/settings.ts               DocumentSettings, workspace overrides, layered resolve
  export/pdf.ts                          page sizes, margins, header/footer placeholders, inches
  export/presets.ts, setup.ts, job.ts    presets (validate, migrate, built-ins), export setups, job contract
  diagram.ts                             request validation for the isolated Mermaid renderer
src/main/services/
  diagramService.ts                      hidden sandboxed window, serial queue, cancel, timeouts
  pdfService.ts, exportService.ts        serialised print jobs; temp file + atomic rename; cancellation
  presetService.ts, presentationService.ts   preset files; workspace overrides; CSS file reads (gated)
src/renderer/src/
  markdown/   render (slots) · math · svg · diagrams (client+cache) · document · exporters · audit
  presentation/  dialogs and form components (Export dialog, appearance, CSS, page setup, presets)
  state/presentation.ts, exportSetup.ts  effective presentation; active export setup; presets
  diagram-host/                          the page loaded inside the isolated Mermaid window
```

- `shared/` knows nothing about Electron or the DOM; the renderer builds documents; the main
  process owns files, windows and printing. The renderer never receives a file-system handle:
  every new capability is a typed, validated IPC method (`src/shared/ipc.ts`).
- **Settings layering.** `resolvePresentation(defaults, workspace, exportOverrides)` applies three
  layers in order (application defaults, `.markdown-studio/presentation.json`, export-specific
  overrides) and records the origin of each value for the UI. Nothing is stored in a document.
- **Themes** are data: design tokens + variant attributes (`data-table`, `data-code`, …) + a theme
  stylesheet; customisation is validated (hex colours, ranges, font keys or safe family names).
  Mermaid receives the same colours and font, so diagrams match the page, light or dark.
- **Math.** The markdown-it plugin recognises `$…$`, `$$…$$`, `\(…\)`, `\[…\]` with Pandoc's
  conservative rules and emits tokens only; the host supplies the renderer. The editor tooling
  parses with the same plugin (so `$` never confuses link or table analysis) and uses the token
  positions for diagnostics. KaTeX runs with `trust: false`, a macro-expansion cap and
  `throwOnError`; each distinct expression is rendered and sanitised once, and documents carry
  only slots (with an unforgeable per-session marker) that are filled after sanitisation.
- **Mermaid** never runs in the application's renderer. `DiagramService` creates one hidden
  window (sandbox, context isolation, no preload, no Node, private session whose network requests
  are limited to the bundled host page) and calls `window.msDiagram.render` through
  `executeJavaScript` with a validated request. Labels are SVG text (`htmlLabels: false`), so
  output is static; the SVG is sanitised again (scripts, handlers, external references, `use`,
  `image`, animation and policy-violating CSS removed) and cached by source + presentation.
  Requests are serial, cancellable while queued, time out after 20 s and are limited to 50,000
  characters. Hydration discards answers for text that has been replaced, so a slow diagram never
  appears in the wrong place, and diagram edits are debounced.
- **PDF.** `PdfOptions` (mm) are validated once (`validatePdfOptions`) and converted to
  `printToPDF` arguments in inches. Headers and footers are expanded from escaped placeholders;
  `{page}` and `{pages}` use Chromium's own page-number elements. Print CSS keeps headings with
  their text, repeats table headers, wraps code and fits images, diagrams and equations to the
  printable area (`--ms-page-height`). The preview and the export call the same code with the
  same options. Jobs are serialised; a cancelled job destroys its window and leaves the queue
  usable; the result must be a structurally complete PDF.
- **Export jobs** (`ExportService`) return values instead of throwing for expected failures
  (`saved`, `cancelled`, `failed`). The file is written beside its destination and renamed into
  place, so cancellation or failure leaves existing files untouched.
- **Standalone HTML** embeds fonts (KaTeX WOFF2 as data URIs), SVG, images (optional) and the
  validated CSS, carries a CSP without scripts, and is **audited** (`markdown/audit.ts`) before it
  is written: scripts, frames, handlers, active URLs, remote CSS and private-protocol references
  refuse the export; links and images that cannot work after moving the file are reported.
- **Presets** are one validated JSON file each (global: user-data folder; workspace:
  `.markdown-studio/export-presets/`). Unknown fields are ignored, future versions are read with
  the fields we know, damaged files are skipped and never rewritten. An edited built-in is stored
  under the built-in's id (shown as "modified"); restoring deletes the copy.

### The CSS security boundary

All CSS that can reach a document passes through `shared/presentation/css.ts`: user CSS (strict:
anything the policy removes rejects the stylesheet and is reported with line numbers), `<style>`
blocks and `style` attributes inside Markdown (lenient: offending rules/declarations are dropped),
and the styles inside Mermaid SVG. The policy parses with css-tree and allows only a small set of
at-rules, `url()` only for embedded `data:` images and fonts, no resource-loading functions,
no escaped function names, and serialises from the syntax tree with `<` escaped so a string can
never close the `<style>` element. Custom CSS reaches the document through a dedicated
`<style id="ms-custom-css">` inside the preview frame or export file, so it cannot style the
application.

### Test strategy

- **Unit** (Vitest, Node + jsdom): markdown plugins, CSS policy (accepted, rejected, escaped,
  serialisation), themes and layering, page options and placeholders, presets and services
  (temporary directories), export job recovery, SVG and document sanitisation, an audit of
  hostile documents, KaTeX behaviour and the executable examples of the mathematics guide.
- **E2E** (Playwright's Electron driver): the real application renders math and diagrams, exports
  PDF and HTML, restarts, and is attacked with hostile input. PDFs are checked with PDF.js (page
  sizes, positioned text for headers/footers/numbers) **and rasterised to images** (ink inside
  margins; screenshots are inspected). IPC channels can be observed from the main process to
  assert caching and debouncing.
- **Benchmarks** (`scripts/benchmark.mjs`) against representative documents, compared with the
  Phase 2 baseline (`docs/PERFORMANCE.md`).

## Security model

- Renderer: `contextIsolation`, `sandbox`, no Node integration, no `<webview>`, strict CSP
  (`script-src 'self'`), all new windows denied, navigation away from the app blocked, all
  permission requests denied except clipboard writes.
- IPC: a minimal, typed API; handlers reject calls from anything but the main window's
  top-level frame and validate every argument; file paths go through `AccessControl`. The
  Phase 2 additions follow the same rules: `listFiles` and `statMany` are limited to what the
  renderer may read, `move` stays inside the workspace and never overwrites, template ids are
  validated before they become file names, and `writeText` can refuse to overwrite a changed
  file.
- Untrusted Markdown: DOMPurify removes scripts, frames, plugins, forms and event handlers; the
  preview iframe has no script permission and its own CSP; links are handled by the
  application; `msfile:` serves only images the user may read.
- PDF printing: hidden window with JavaScript disabled, sandboxed, with the document CSP.
- Exported HTML: carries a CSP that forbids scripts and is audited before it is written.
- Mermaid: isolated window without preload or Node, private network-less session, validated
  requests, sanitised SVG. KaTeX: untrusted commands disabled, output sanitised.
- Custom CSS and Markdown styles: one parser-based policy (no files, no network, no `@import`).
- IPC additions (`export:*`, `presets:*`, `presentation:*`, `css:*`, `diagram:*`) validate every
  argument in the main process; CSS files are readable only inside the workspace or when chosen
  in the file dialog.
- DOMPurify's DOM-clobbering protection is off (`SANITIZE_DOM: false`) so heading ids such as
  `#title` keep working; output is only placed in script-free documents, which the application
  reads with methods, never with `document[name]`.

## Extension points for later work

See the [academic publishing roadmap](ACADEMIC_PUBLISHING_ROADMAP.md) (not implemented):
labels and cross-references would extend the markdown-it configuration with attribute parsing and
a pure numbering function; definitions would extend the macro table handed to KaTeX (and the
render-cache key); a reference manager would add parsers in `shared/` and a CSL engine in the
renderer; book projects would build on the export pipeline and the reference-aware file moves.
- **Image tooling** (resizing, optimisation, clipboard screenshots) — all asset writes go through
  `AssetService` and all references through `imageReference.ts`.

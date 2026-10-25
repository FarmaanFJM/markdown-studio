# Markdown Studio architecture

This document describes how Markdown Studio is put together (Phase 1 foundation, Phase 2
Markdown intelligence), why, and where the features planned for Phase 3 are meant to plug in.
The user-facing description of the Phase 2 tools is in [AUTHORING.md](AUTHORING.md).

## Technology

| Concern           | Choice                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Desktop shell     | Electron (main, preload and renderer processes)                                                                            |
| UI                | React + TypeScript, bundled by Vite through electron-vite                                                                  |
| Source editor     | Monaco Editor, bundled locally (no CDN)                                                                                    |
| Markdown          | markdown-it (CommonMark + GFM tables, strikethrough, autolinks) with small in-house plugins for task lists and heading ids |
| Code highlighting | highlight.js (common languages)                                                                                            |
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
- **PdfService** loads a document in a hidden window with JavaScript disabled and prints it to
  A4. Jobs are serialised.
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

**PDF.** The renderer builds the standalone HTML, the main process prints it to PDF bytes and
PDF.js renders the pages to canvases lazily. Export prints the identical HTML and writes the
bytes to the file chosen in the save dialog.

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

### Extension points for Phase 3

- **Mermaid and math** — `DocumentAnalysis.fences` already records each fence's info string;
  render plugins go in `shared/markdown/plugins.ts` (so the preview, exports and the tooling stay
  in agreement), and language names are suggested from `FENCE_LANGUAGES` in `completions.ts`.
- **New commands, menus, palette entries** — `registerCommands`; a shortcut is a
  `bind(commandId, …)` line in `commands/keybindings.ts`.
- **Template-like assets** (export presets, document themes) — the template store, scopes
  (global/workspace) and validation in `shared/templates.ts` are generic over `kind`.
- **More diagnostics** — add a producer next to `diagnostics/manager.ts` with its own marker
  owner; fixes attach to markers the same way.
- **Document transformations** — add a pure function returning edit plans in
  `shared/markdown/formatting.ts` and an adapter command next to `editor/markdown/commands.ts`.

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
- Exported HTML: carries a CSP that forbids scripts.

## Extension points for later phases

These boundaries exist so later phases can add features without restructuring Phase 1:

- **Phase 2 (delivered)** — see _Phase 2: Markdown language tooling_ above. The completion
  provider, formatting commands, outline and link checks all build on the shared token stream
  and `resolveLocalPath`.
- **Phase 3 Mermaid and math** — additional markdown-it plugins in `markdown/render.ts`; the
  sanitiser configuration is centralised in `markdown/sanitize.ts`.
- **Phase 3 themes and custom CSS** — document styling lives only in `markdown/document.css`
  and is injected by `buildHtmlDocument`, independent of the UI theme.
- **Phase 3 print settings** — page size and margins are defined once in `PDF_OPTIONS`
  (`main/services/pdfService.ts`).
- **Image tooling** (resizing, optimisation, clipboard screenshots) — all asset writes go
  through `AssetService` and all references through `imageReference.ts`; updating references
  after file operations is done by `shared/markdown/moves.ts`.

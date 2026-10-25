# Markdown Studio architecture

This document describes how Markdown Studio is put together in Phase 1, why, and where the
features planned for Phases 2 and 3 are meant to plug in.

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

## Security model

- Renderer: `contextIsolation`, `sandbox`, no Node integration, no `<webview>`, strict CSP
  (`script-src 'self'`), all new windows denied, navigation away from the app blocked, all
  permission requests denied except clipboard writes.
- IPC: a minimal, typed API; handlers reject calls from anything but the main window's
  top-level frame and validate every argument; file paths go through `AccessControl`.
- Untrusted Markdown: DOMPurify removes scripts, frames, plugins, forms and event handlers; the
  preview iframe has no script permission and its own CSP; links are handled by the
  application; `msfile:` serves only images the user may read.
- PDF printing: hidden window with JavaScript disabled, sandboxed, with the document CSP.
- Exported HTML: carries a CSP that forbids scripts.

## Extension points for later phases

These boundaries exist so later phases can add features without restructuring Phase 1:

- **Phase 2 intelligence** — Monaco completion/formatting providers register against the
  `markdown` language in `editor/monaco.ts`; new commands are added to `commands/commands.ts`
  and bound in `commands/keybindings.ts` (which also feeds the shortcut reference). An outline
  can be derived from the same markdown-it token stream used for heading ids.
- **Phase 2 link validation** — `markdown/resolve.ts` already resolves document links and
  images to paths.
- **Phase 3 Mermaid and math** — additional markdown-it plugins in `markdown/render.ts`; the
  sanitiser configuration is centralised in `markdown/sanitize.ts`.
- **Phase 3 themes and custom CSS** — document styling lives only in `markdown/document.css`
  and is injected by `buildHtmlDocument`, independent of the UI theme.
- **Phase 3 print settings** — page size and margins are defined once in `PDF_OPTIONS`
  (`main/services/pdfService.ts`).
- **Image tooling** (resizing, optimisation, clipboard screenshots, reference updates) — all
  asset writes go through `AssetService` and all references through `imageReference.ts`.

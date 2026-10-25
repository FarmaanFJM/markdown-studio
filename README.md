<p align="center">
  <img src="resources/branding/logo.png" width="140" alt="Markdown Studio logo">
</p>

<h1 align="center">Markdown Studio</h1>

<p align="center">
  A dedicated desktop editor for writing, previewing and exporting Markdown.
</p>

Markdown Studio is a standalone desktop application for Markdown authoring. It will feel
familiar if you use Visual Studio Code — an activity bar and file explorer on the left, a
Monaco source editor in the middle and a live preview on the right — but every part of it is
built for Markdown documents rather than general programming.

Its distinguishing feature is visual asset management: browse a project's images as
thumbnails and drag them straight into a document to get a correct, relative image reference.
Images dragged in from Windows File Explorer are copied into the project for you.

> **Status:** Phase 1 (foundation and core editor) of three. See [Roadmap](#roadmap) for what
> is planned and not yet implemented.

## Screenshots

These are unedited captures of the application, taken by the automated test environment
(Linux, virtual display, 1440 × 900) with the repository's test fixtures.

![Editor with the live HTML preview](docs/screenshots/editor-html-preview.png)

![Thumbnail Explorer next to the editor](docs/screenshots/thumbnail-explorer.png)

![PDF preview with page and zoom controls](docs/screenshots/pdf-preview.png)

## Features (Phase 1)

**Workspace and files**

- Open a folder as a workspace; the last folder is reopened on startup (optional) and recent
  folders are listed in the Welcome view, the Explorer and _File → Open Recent Folder_.
- Real file-system Explorer: nested folders, file-type icons, create Markdown files and
  folders, rename, delete (to the Recycle Bin/Trash, with confirmation), reveal in File
  Explorer, copy path and relative path. Changes made outside the app appear automatically.
- Two Explorer presentations, switchable at any time:
  - **List** — a compact tree with keyboard navigation (arrows, Enter, F2, Delete).
  - **Thumbnails** — a folder-at-a-time grid with real previews of PNG, JPEG, WebP, GIF, SVG,
    BMP and AVIF images, adjustable size, breadcrumbs and aspect-ratio-preserving tiles.
    Thumbnails load lazily; on Windows and macOS they come from the system thumbnail
    provider and are cached in memory.

**Editing**

- Monaco editor with Markdown highlighting (including embedded HTML and fenced code in common
  languages), line numbers, find and replace, multi-cursor, folding, automatic indentation,
  configurable font size, word wrap and minimap.
- Multiple tabs with independent undo history, unsaved-change markers and Save / Don't Save /
  Cancel prompts when closing a tab or the window.
- Files are written exactly as edited: line endings (LF or CRLF) and a UTF-8 byte-order mark
  are preserved, and nothing is reformatted.

**Images**

- Drag an image from the Explorer (list or thumbnails) into the editor to insert
  `![Alt text](relative/path.png)` exactly where you drop it.
- Paths are relative to the document, so a file in `docs/` gets `../assets/…`.
- File names with spaces, parentheses, Unicode or Markdown characters produce valid
  references (`![Team Photo 2024](<assets/Team Photo (2024).png>)`).
- Alt text is generated from the file name and selected after insertion, so you can type over
  it immediately. One undo removes the insertion.
- Images dragged from outside the project are copied into the asset folder (default
  `assets/`, configurable). Existing files are never overwritten: a different file with the
  same name becomes `name-1.png`; the identical file is reused. Images that already live in
  the project are referenced in place.

**Preview and export**

- Live HTML preview (GitHub Flavored Markdown: tables, task lists, strikethrough, autolinks,
  fenced code with syntax highlighting) that updates as you type and keeps its scroll position.
- HTML inside Markdown is rendered, including inline styles, while scripts, frames, forms and
  event handlers are removed.
- Links work: `#headings` scroll, links to other `.md` files open them in a tab, web links
  open in your browser.
- Real PDF preview: the document is printed to an A4 PDF by Chromium and displayed with
  PDF.js, with page navigation, zoom, fit-to-width, fit-to-page and automatic or manual
  refresh.
- **Export as PDF** uses the same pipeline as the preview, so what you see is what you get.
- **Export as HTML** produces a standalone file with the stylesheet inlined and local images
  embedded, so it can be opened anywhere.

**Application**

- Resizable, collapsible Explorer and preview panes; source-only, source + HTML and
  source + PDF layouts. Sizes, visibility and preview mode are remembered.
- Dark theme by default, optional light theme, settings panel, status bar (save state, cursor
  position, word count, line endings, encoding), native menus, About dialog and a keyboard
  shortcut reference (_Help → Keyboard Shortcuts_).

## Keyboard shortcuts

On macOS use <kbd>Cmd</kbd> instead of <kbd>Ctrl</kbd>.

| Action                                    | Shortcut                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| New Markdown file                         | <kbd>Ctrl</kbd>+<kbd>N</kbd>                                                                                 |
| Open file                                 | <kbd>Ctrl</kbd>+<kbd>O</kbd>                                                                                 |
| Save / Save as                            | <kbd>Ctrl</kbd>+<kbd>S</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>                                 |
| Close editor tab                          | <kbd>Ctrl</kbd>+<kbd>W</kbd>                                                                                 |
| Next / previous tab                       | <kbd>Ctrl</kbd>+<kbd>Tab</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Tab</kbd>                             |
| Undo / redo                               | <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> |
| Find / replace                            | <kbd>Ctrl</kbd>+<kbd>F</kbd> / <kbd>Ctrl</kbd>+<kbd>H</kbd>                                                  |
| Toggle sidebar / show Explorer            | <kbd>Ctrl</kbd>+<kbd>B</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd>                                 |
| Toggle preview                            | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd>                                                                |
| Settings                                  | <kbd>Ctrl</kbd>+<kbd>,</kbd>                                                                                 |
| Toggle word wrap                          | <kbd>Alt</kbd>+<kbd>Z</kbd>                                                                                  |
| Editor font size larger / smaller / reset | <kbd>Ctrl</kbd>+<kbd>=</kbd> / <kbd>Ctrl</kbd>+<kbd>-</kbd> / <kbd>Ctrl</kbd>+<kbd>0</kbd>                   |

Monaco's own editing shortcuts (multi-cursor, line moves, comment toggling and so on) work as
in VS Code. Export, Open Folder and the layout options are in the menus and toolbars.

## Getting started

### Requirements

- [Node.js](https://nodejs.org/) 22 or newer and npm
- Windows 10/11 (primary target), macOS or Linux

### Run from source

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

The CI workflow builds the installer on GitHub Actions (`windows-latest`) for every push and
attaches it to the workflow run as the
**markdown-studio-windows-installer** artifact. Pushing a `v*` tag also creates a draft
GitHub Release with the installer. The installer is not code-signed yet, so Windows
SmartScreen will warn on first launch.

`npm run package:linux` (AppImage) and `npm run package:mac` (DMG) are configured for their
own platforms.

## Testing

| Command                | What it runs                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `npm run lint`         | ESLint (TypeScript, React hooks)                                                                        |
| `npm run format:check` | Prettier                                                                                                |
| `npm run typecheck`    | TypeScript for the main, preload and renderer projects                                                  |
| `npm run test:unit`    | Vitest: paths, image references, Markdown rendering and sanitisation, file and asset services, settings |
| `npm run test:e2e`     | Playwright driving the real Electron app (run `npm run build` first)                                    |
| `npm test`             | Unit tests, build, then E2E                                                                             |

The end-to-end suite launches the application with an isolated settings folder and a copy of
`tests/fixtures/`, and covers opening folders, editing and saving, unsaved-change prompts,
tabs, file operations, thumbnails, Explorer and operating-system image drops, relative paths,
the HTML and PDF previews, untrusted HTML, exports, pane resizing, shortcuts and settings
persistence across restarts.

On Linux without a display, run it under Xvfb:

```bash
xvfb-run -a npm run test:e2e
```

To test a packaged build instead of `out/`, point the suite at its executable:

```bash
MARKDOWN_STUDIO_EXECUTABLE="release/0.1.0/win-unpacked/MarkdownStudio.exe" npm run test:e2e
```

## Architecture

Markdown Studio is an Electron application with a strict split between a privileged main
process and a sandboxed React renderer. A short overview:

| Area                             | Location                                                    |
| -------------------------------- | ----------------------------------------------------------- |
| App lifecycle, window, IPC, menu | `src/main/index.ts`, `src/main/menu.ts`                     |
| File access policy               | `src/main/services/accessControl.ts`                        |
| File operations, watching        | `src/main/services/fileService.ts`, `workspaceWatcher.ts`   |
| Image import                     | `src/main/services/assetService.ts`                         |
| Local image protocol, thumbnails | `src/main/services/protocol.ts`                             |
| PDF generation                   | `src/main/services/pdfService.ts`                           |
| Settings persistence             | `src/main/services/settingsService.ts`                      |
| Preload bridge (the only API)    | `src/preload/index.ts`, contract in `src/shared/ipc.ts`     |
| Shared, process-neutral logic    | `src/shared/` (paths, settings schema, image references)    |
| Markdown pipeline                | `src/renderer/src/markdown/` (render → sanitise → document) |
| Editor, tabs, image drops        | `src/renderer/src/editor/`                                  |
| Explorer                         | `src/renderer/src/explorer/`                                |
| Previews                         | `src/renderer/src/preview/`                                 |
| State (Zustand stores)           | `src/renderer/src/state/`                                   |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for data flows, the security model and the
extension points prepared for later phases.

### Settings

Settings are stored as JSON on your computer only — no account, telemetry or network
connection is involved — in the application data folder:

- Windows: `%APPDATA%\Markdown Studio\settings.json`
- macOS: `~/Library/Application Support/Markdown Studio/settings.json`
- Linux: `~/.config/Markdown Studio/settings.json`

Settings contain preferences, pane sizes and folder paths, never document content.

## Roadmap

**Phase 2 — Markdown intelligence and productivity (planned, not implemented):** Markdown
IntelliSense and completions, formatting commands, table alignment and a graphical table
editor, templates and snippets, smart lists, document outline, table-of-contents generation,
link validation and more Markdown shortcuts.

**Phase 3 — Professional polish and release (planned, not implemented):** advanced PDF
settings (page sizes, headers, footers), document and export themes, custom CSS, Mermaid
diagrams, math notation, export presets, accessibility and performance work, broader
end-to-end coverage, documentation and signed release builds.

### Known limitations of Phase 1

- Documents are read and written as UTF-8. Mixed line endings within one file are
  normalised to the file's dominant style by the editor.
- A file changed on disk while it is open is not reloaded automatically.
- Images dropped into an unsaved document are referenced relative to the workspace root.
- Images referenced from outside the workspace (or outside an opened file's folder) are not
  displayed, by design.
- Remote images (`https://…`) are loaded in the preview and in PDFs, and are left as links in
  HTML exports rather than embedded.
- Image thumbnails are generated by the operating system on Windows and macOS; on Linux the
  original image is scaled by the browser engine.
- PDF output is A4 with fixed 18 mm margins.

## License

Markdown Studio is released under the [MIT License](LICENSE). Bundled open-source packages and
their licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) (regenerate with
`npm run notices`); Electron and Chromium notices ship with the application.

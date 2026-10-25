<p align="center">
  <img src="resources/branding/logo.png" width="140" alt="Markdown Studio logo">
</p>

<h1 align="center">Markdown Studio</h1>

<p align="center">
  A dedicated Markdown IDE: write with intelligent assistance, preview live, export anywhere.
</p>

Markdown Studio is a standalone desktop application for Markdown authoring. It will feel
familiar if you use Visual Studio Code — an activity bar and file explorer on the left, a
Monaco source editor in the middle and a live preview on the right — but every part of it is
built for Markdown documents rather than general programming.

You always edit the real Markdown source; the application does the tedious parts. It
suggests syntax as you write, formats text and tables, continues lists, builds a table of
contents, completes and checks the links and images between your files, creates documents
from templates, and keeps references valid when you rename or move files.

It also has visual asset management: browse a project's images as thumbnails and drag them
straight into a document to get a correct, relative image reference. Images dragged in from
Windows File Explorer are copied into the project for you.

> **Status:** Phases 1 (foundation and core editor) and 2 (Markdown intelligence and
> productivity) of three. See [Roadmap](#roadmap) for what is planned and not yet implemented.
> The authoring features are described in the [Authoring guide](docs/AUTHORING.md).

## Screenshots

These are unedited captures of the application, taken by the automated test environment
(Linux, virtual display, 1440 × 900) with the repository's test fixtures.

![Editor with the live HTML preview](docs/screenshots/editor-html-preview.png)

![Thumbnail Explorer next to the editor](docs/screenshots/thumbnail-explorer.png)

![PDF preview with page and zoom controls](docs/screenshots/pdf-preview.png)

Phase 2 (captured by `npm run screenshots` from the running application):

![Context-aware Markdown suggestions, the formatting toolbar and the outline](docs/screenshots/intellisense.png)

![The graphical table editor](docs/screenshots/table-editor.png)

![Outline, generated table of contents and preview](docs/screenshots/outline-and-toc.png)

![Broken links, images and malformed tables reported as problems](docs/screenshots/problems.png)

![Templates](docs/screenshots/templates.png)

![The command palette](docs/screenshots/command-palette.png)

![Renaming a file offers to update the Markdown references to it](docs/screenshots/rename-references.png)

## Features (Phase 2): authoring assistance

A full description with examples is in the [Authoring guide](docs/AUTHORING.md).

**Suggestions (Markdown IntelliSense)**

- Press <kbd>Ctrl</kbd>+<kbd>Space</kbd> for suggestions that fit the place you are in:
  block constructs at the start of a line (headings, lists, task lists, quotes, code blocks,
  rules, tables, collapsible sections, document sections), inline constructs inside a
  sentence, table actions inside a table, language names after an opening code fence.
  Each entry shows a short explanation and the Markdown it will insert.
- Type <kbd>/</kbd> on an empty line for a small, searchable slash menu.
- Inside `[text](` and `![alt](`, suggestions are the files and folders relative to the
  document (images only for images, plus matching images and Markdown files from the whole
  workspace) and, after `#`, the headings of this or the linked document. Names with spaces,
  parentheses and Unicode are inserted in the same form image drag-and-drop uses.
- Nothing opens while you type ordinary prose, and nothing is offered inside code blocks.
  Automatic triggers can be switched off in Settings; <kbd>Ctrl</kbd>+<kbd>Space</kbd> always
  works.
- Snippets use the editor's native placeholders: <kbd>Tab</kbd> moves to the next one. A new
  code block puts the cursor inside it.

**Formatting commands**

- Bold, italic, strikethrough, inline code, heading levels, bulleted, numbered and task
  lists, blockquotes, links, images, code blocks, horizontal rules and tables — from
  shortcuts, the formatting toolbar, the **Format** and **Insert** menus, the right-click
  menu and the command palette. All of them run the same command.
- They wrap selections (or the word at the cursor), toggle off when applied again, handle
  multi-line selections and multiple cursors, never touch code blocks, change only the lines
  you selected, are one undo step, and keep LF/CRLF line endings and the UTF-8 BOM.
- <kbd>Enter</kbd> continues lists (bullets, numbers, task items) and quotes; <kbd>Enter</kbd>
  on an empty item ends the list; <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> nest and
  un-nest list items together with their children. This can be turned off in Settings.

**Tables**

- **Format Table** aligns the table under the cursor (or the tables in a selection, or all
  tables), keeping `:---`, `:---:` and `---:` alignments, escaped pipes, inline formatting
  and empty cells, and measuring Unicode by display width. Tables in code blocks are ignored.
  A table that cannot be formatted without losing cells is reported, never rewritten.
- <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> move between cells, tidy the table, and add
  a row after the last cell. Commands insert and delete rows and columns and change alignment.
- **Edit Table Visually…** opens the table in a grid: edit cells and headers, add and remove
  rows and columns, set alignment, then _Apply_ (one undoable edit of exactly that table) or
  _Cancel_. If the table changes in the document while the grid is open, applying is blocked
  until you reload it from the document.

**Templates and snippets**

- Built in: README, Technical documentation, Project notes, Meeting notes, Report and a blank
  document. Create your own from the active document, a selection, or from scratch; rename,
  edit, duplicate and delete (after confirmation) them in _Manage Templates and Snippets…_.
- **Global** templates are available everywhere; **workspace** templates live inside the
  project (`.markdown-studio/templates/`, hidden in the Explorer) and move with it.
- Placeholders `{{title}}`, `{{date}}`, `{{datetime}}`, `{{author}}` and `{{cursor}}` are
  filled in when a document is created. The title and author are asked for; the author is
  never guessed. Nothing in a template is executed.
- Creating a document never overwrites an existing file and cancelling creates nothing.
  Local images and links in templates are made independent of their folder where possible
  and reported when they cannot be resolved.
- Saved snippets (templates of type _Snippet_) are inserted at the cursor from the palette,
  the slash menu and the suggestion list.

**Navigation**

- The **Outline** section of the Explorer shows the headings of the active document as a
  tree (ATX and underlined headings, never text in code blocks), follows the cursor, and
  jumps to a heading on click. Groups collapse and expand; it works with the preview hidden.
  <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd> opens a searchable heading list.
- **Insert / Update Table of Contents** maintains a list between
  `<!-- markdown-studio:toc:start -->` and `<!-- markdown-studio:toc:end -->`. Only text
  between the markers is ever replaced; anchors match the preview exactly, including
  duplicate headings (`#usage`, `#usage-1`).
- The **command palette** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>) lists every command
  with its shortcut.

**Links, references and problems**

- Missing files, missing images and missing heading anchors are underlined and counted in the
  status bar; quick fixes (<kbd>Ctrl</kbd>+<kbd>.</kbd>) are offered only when there is one
  clear correction. Web addresses are never contacted.
- Tables that the preview would not show as written (header and delimiter row disagree,
  surplus cells) are reported.
- Style notes (spacing, structure) come from [markdownlint](https://github.com/DavidAnson/markdownlint)
  with a curated rule set; individual rules can be switched off in Settings, and automatic
  fixes are applied only by an explicit command.
- **Rename and move keep references valid.** Renaming or moving a file or folder in the
  Explorer (menu, folder picker or drag-and-drop) finds the Markdown links, images and
  definitions that point at it — and the relative links of a moved document — shows what will
  change, and updates them after you confirm. Open documents are updated in their editors
  (unsaved work is never written to disk), other files only if they have not changed on
  disk, and anything that cannot be updated is reported.

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
  are preserved, and nothing is reformatted. New documents use LF on every platform.

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
| Command palette                           | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>                                                                |
| Go to heading                             | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd>                                                                |
| New file from template                    | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd>                                                                |
| Toggle word wrap                          | <kbd>Alt</kbd>+<kbd>Z</kbd>                                                                                  |
| Editor font size larger / smaller / reset | <kbd>Ctrl</kbd>+<kbd>=</kbd> / <kbd>Ctrl</kbd>+<kbd>-</kbd> / <kbd>Ctrl</kbd>+<kbd>0</kbd>                   |

Monaco's own editing shortcuts (multi-cursor, line moves, comment toggling and so on) work as
in VS Code. Export, Open Folder and the layout options are in the menus and toolbars.

**Markdown editing** (while the source editor has focus):

| Action                             | Shortcut                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Show suggestions                   | <kbd>Ctrl</kbd>+<kbd>Space</kbd>                                                                        |
| Bold                               | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> (<kbd>Ctrl</kbd>+<kbd>B</kbd> keeps toggling the sidebar) |
| Italic / inline code               | <kbd>Ctrl</kbd>+<kbd>I</kbd> / <kbd>Ctrl</kbd>+<kbd>E</kbd>                                             |
| Strikethrough                      | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>                                                           |
| Insert link / image                | <kbd>Ctrl</kbd>+<kbd>K</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>                            |
| Heading level up / down            | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>]</kbd> / <kbd>[</kbd>                                            |
| Numbered / bulleted / task list    | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>7</kbd> / <kbd>8</kbd> / <kbd>9</kbd>                             |
| Blockquote                         | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>.</kbd>                                                           |
| Insert code block                  | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd>                                                           |
| Insert table (grid)                | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>                                                           |
| Format table / edit table visually | <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> / <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>             |
| Next table cell / previous         | <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> (inside a table)                                       |
| Continue list or quote             | <kbd>Enter</kbd>                                                                                        |
| Next problem                       | <kbd>F8</kbd>                                                                                           |
| Quick fix                          | <kbd>Ctrl</kbd>+<kbd>.</kbd>                                                                            |

`Ctrl`+`B` toggles the sidebar since Phase 1, so Bold uses `Ctrl`+`Shift`+`B`. Every command
is also available in the palette, so shortcuts are optional. The _Help → Keyboard Shortcuts_
dialog lists them all.

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

| Command                | What it runs                                                                                                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`         | ESLint (TypeScript, React hooks)                                                                                                                                                                                                 |
| `npm run format:check` | Prettier                                                                                                                                                                                                                         |
| `npm run typecheck`    | TypeScript for the main, preload and renderer projects                                                                                                                                                                           |
| `npm run test:unit`    | Vitest: paths, image references, rendering and sanitisation, file, asset and template services, settings, and the Markdown tooling (analysis, tables, lists, formatting, references, rename planning, TOC, link checks, linting) |
| `npm run test:e2e`     | Playwright driving the real Electron app (run `npm run build` first)                                                                                                                                                             |
| `npm test`             | Unit tests, build, then E2E                                                                                                                                                                                                      |
| `npm run screenshots`  | Rebuilds and recaptures the Phase 2 screenshots in `docs/screenshots/` from the running application                                                                                                                              |

The end-to-end suite launches the application with an isolated settings folder and a copy of
`tests/fixtures/`, and covers opening folders, editing and saving, unsaved-change prompts,
tabs, file operations, thumbnails, Explorer and operating-system image drops, relative paths,
the HTML and PDF previews, untrusted HTML, exports, pane resizing, shortcuts and settings
persistence across restarts — and, for Phase 2, suggestions, formatting, smart lists, table
formatting and the graphical table editor, templates (scopes, variables, restarts, assets),
the outline and table of contents, link and image completion, problem markers and quick
fixes, reference-aware rename and move (including drag-and-drop, unsaved documents and
on-disk conflicts), the toolbar, menus, palette and settings, and CRLF/BOM preservation.

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

| Area                             | Location                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App lifecycle, window, IPC, menu | `src/main/index.ts`, `src/main/menu.ts`                                                                                                                      |
| File access policy               | `src/main/services/accessControl.ts`                                                                                                                         |
| File operations, watching        | `src/main/services/fileService.ts`, `workspaceWatcher.ts`                                                                                                    |
| Image import                     | `src/main/services/assetService.ts`                                                                                                                          |
| Template storage                 | `src/main/services/templateService.ts`                                                                                                                       |
| Local image protocol, thumbnails | `src/main/services/protocol.ts`                                                                                                                              |
| PDF generation                   | `src/main/services/pdfService.ts`                                                                                                                            |
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

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for data flows, the security model and the
extension points prepared for later phases.

### Settings

Settings are stored as JSON on your computer only — no account, telemetry or network
connection is involved — in the application data folder:

- Windows: `%APPDATA%\Markdown Studio\settings.json`
- macOS: `~/Library/Application Support/Markdown Studio/settings.json`
- Linux: `~/.config/Markdown Studio/settings.json`

Settings contain preferences, pane sizes and folder paths, never document content. The
Phase 2 options (smart lists, table navigation, automatic suggestions, toolbar, problem checks
and disabled style rules, table-of-contents depth, the author name offered to templates) are
in _Settings_ (<kbd>Ctrl</kbd>+<kbd>,</kbd>). Global templates are stored beside the settings,
in a `templates` folder.

## Roadmap

**Phase 1 — Foundation and core editor:** implemented.

**Phase 2 — Markdown intelligence and productivity:** implemented (see above).

**Phase 3 — Professional polish and release (planned, not implemented):** advanced PDF
settings (page sizes, headers, footers), document and export themes, custom CSS, Mermaid
diagrams, math notation, export presets, accessibility and performance work, broader
end-to-end coverage, documentation and signed release builds.

### Known limitations

**Phase 2**

- Tables are GitHub Flavored Markdown tables: no merged cells, and a cell is a single line
  (line breaks become `<br>`). A table that starts on a list-item marker line, or that has
  non-empty cells beyond its header's columns, is reported instead of being formatted.
- The heading commands change `#` headings; underlined (Setext) headings appear in the outline
  but are left alone by the commands.
- Link checks cover inline links and images, reference definitions, and `<img src>` /
  `<a href>` in HTML; they do not look at web addresses. Documents over 400,000 characters
  are not style-checked.
- Reference updates apply to renames and moves made in the Explorer, not to changes made
  outside the application, deletions or _Save As_, and only to Markdown files (up to 5,000
  files of up to 4 MB are scanned; the dialog says when that limit was reached).
- Slash commands start only on an empty line that follows a blank line, so paths and URLs in
  prose are never affected.
- Bold is <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> because <kbd>Ctrl</kbd>+<kbd>B</kbd>
  has toggled the sidebar since Phase 1. Because <kbd>Ctrl</kbd>+<kbd>K</kbd> inserts a link,
  the editor's `Ctrl`+`K` chords are not available.
- Workspace templates are plain files; if two people edit the same template, the project's
  version control is what merges them.

**Phase 1**

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

# Feature reference

Everything Markdown Studio can do today, grouped by the development phases in which it was built. The [README](../README.md) is the short overview; the [Getting started guide](GETTING_STARTED.md) walks through a first document. This page lists what exists and where to read more; it describes implemented functionality only (see the [roadmap](ROADMAP.md) for what is planned).

The sections are historical: a feature introduced in an earlier phase may have been refined since (for example the keyboard shortcuts, which are listed in [KEYBOARD_SHORTCUTS.md](KEYBOARD_SHORTCUTS.md)).

## Features (Levels 1 and 2): core and professional publishing

Full guide: [Writing publications](PUBLICATIONS.md).

**Core (Level 1)**

- **Safe writing.** Unsaved text is mirrored to the application's data folder and offered back
  after a crash; open documents are restored at the next start; files changed by another program
  are never overwritten silently (follow, or ask: Save As / Overwrite / Reload); files are
  written atomically; failed saves keep the text open and mark the tab.
- **Images.** Paste screenshots and copied pictures (<kbd>Ctrl</kbd>+<kbd>V</kbd>) or drag files
  from the file explorer; they are stored in the project's asset folder (never overwriting) and
  referenced relatively. _Save As_ into another folder offers to update the relative paths; a
  missing image is reported in the preview and exports.
- **Tables.** Insert with a chosen number of rows and columns, edit cells, add and delete rows
  and columns, set column alignment, reformat existing tables without losing content, with
  undo/redo (grid editor and source commands).
- **Writing help.** Toolbar and shortcuts for headings, bold/italic, lists, links, quotes and
  code (they insert their marker on an empty line); completions for `@` references and
  citations; a shortcut overview in the Help menu.
- **Print layout.** Wide tables stay inside the page, small tables are not split, long tables
  repeat their header, large images and long code lines fit.

**Professional publishing (Level 2)**

- **Document settings** in front matter: page size, margins, header, footer and page numbers,
  one or two columns, theme, language, automatic contents, section numbering — with a dialog.
- **Figures and tables** with captions and automatic numbers, **cross-references** (`@fig-…`,
  `@tbl-…`, `@sec-…`) that renumber when the document changes, duplicate and missing-target
  diagnostics, lists of figures and tables.
- **Sources and citations** with a source manager (add, edit, import BibTeX/CSL JSON), citation
  syntax `[@key, p. 3]`, and an automatic **APA Style 7th edition** reference list (citeproc-js).
- **Two-column layout** (whole document) with full-width headings, figures and tables.
- **Templates:** research report (English and Dutch), Health UI research (Playful Tech), and a
  two-column article.
- **Publications:** combine several Markdown documents as chapters, in a chosen order, into one
  publication with a shared contents list, numbering, cross-references, bibliography and
  per-chapter image paths; chapters remain separate, editable files.

## Features (Phase 3): publishing

**Diagrams and mathematics** — see the [Mathematics guide](MATHEMATICS.md).

- ` ```mermaid ` blocks render flowcharts, sequence, class, state, entity-relationship, Gantt,
  pie and other Mermaid diagrams as static SVG in the preview, PDF and HTML export. Mermaid
  runs in a separate, sandboxed, network-less window; results are sanitised and cached, and a
  broken diagram shows an explained error (with a link to its source line) without affecting
  the rest of the document.
- `$…$`, `$$…$$`, `\(…\)` and `\[…\]` render with KaTeX (fonts bundled). Currency like `$5 and
$10` stays text; code is never touched. Manual numbering with `\tag{…}` works in all four
  outputs. Invalid equations are explained in the preview and as editor problems.
- Completion for mermaid fences and starters, snippets and commands for inline math, display
  equations, diagrams and page breaks.

**Document themes** — see the [Publishing guide](PUBLISHING.md).

- Four built-in document themes (Minimal, Technical, Editorial, Professional Report), fully
  customisable (fonts, sizes, colours, tables, code, quotes), independent of the application's
  dark/light theme. Global defaults with workspace overrides; theme changes never disturb your
  editing position.
- Custom CSS (written or from a file), validated with a real CSS parser, applied to documents
  only; unsafe CSS (remote or file URLs, `@import`, …) is rejected with line-numbered messages.

**PDF and HTML export**

- One pipeline for preview and export. PDF: A4, A5, Letter, Legal or custom size, portrait or
  landscape, margins in mm/cm/in, headers and footers with `{title}`, `{date}`, `{page}`,
  `{pages}` (real pagination), backgrounds, scale, explicit page breaks
  (`<!-- pagebreak -->`) and print-aware pagination.
- Standalone HTML: self-contained and offline, with theme, fonts, math, diagrams and embedded
  images; audited before writing.
- Export presets (five built in; custom, duplicate, rename, delete, restore; global or
  per-workspace) and a keyboard-accessible Export dialog (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>U</kbd>)
  with a live preview. Exports are written atomically; cancelling or failing never damages an
  existing file.

**Accessibility and reliability** — WCAG AA colour contrast in the application, modal focus
trapping and restoration, screen-reader labels and live regions, reduced-motion support, a
small-window layout; debounced, cached and cancellable rendering (see
[Performance](PERFORMANCE.md)).

## Features (Phase 2): authoring assistance

A full description with examples is in the [Authoring guide](AUTHORING.md).

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

- Resizable, collapsible Explorer and preview panes; source and source + HTML or PDF layouts
  (the preview panel's ✕ closes the preview, the HTML and PDF buttons next to the tabs open it).
  Sizes, visibility and preview mode are remembered.
- An integrated title bar with the application menu (Windows and Linux; the system's own
  minimise, maximise and close buttons are kept, so Snap layouts and double-click maximise work),
  and a full Settings page (<kbd>Ctrl</kbd>+<kbd>,</kbd>) with categories and search.
- Quick Fixes (<kbd>Ctrl</kbd>+<kbd>.</kbd> or the lightbulb) for style problems, repeated spaces,
  skipped heading levels and mismatched tables; _Format Markdown Block_, _Format Table_ and
  _Repair Table_ in the right-click menu and the command palette.
- Optional AI assistant (off by default). **GitHub Copilot**: sign in with GitHub in Settings → AI and get inline
  ghost-text suggestions in the editor (<kbd>Tab</kbd> accepts, <kbd>Esc</kbd> dismisses, one undo step), through
  GitHub's official language server; needs your own Copilot plan and an internet connection, and sends document
  context to GitHub for each suggestion. Verified with a mock server and by starting the real bundled server; **not
  yet accepted with a real Copilot account**. Rewrite Selection and chat are not available with Copilot. The
  **OpenAI-compatible** provider offers continue-writing and rewrite-selection (including local models). See
  [docs/AI.md](AI.md).
- Dark theme by default, optional light theme, a full Settings page, status bar (save state, cursor
  position, word count, line endings, encoding), native menus, About dialog and a keyboard
  shortcut reference (_Help → Keyboard Shortcuts_).

## Limitations

**Levels 1 and 2**

- Columns (one or two) apply to a whole document or publication, not to sections. A heading
  directly above a full-width table or figure can end up at the bottom of the previous column.
- The table of contents has links but no page numbers; there are no footnotes and no automatic
  equation numbering.
- Citations are formatted as APA Style 7th edition only; a locator after a narrative citation
  (`@key [p. 3]`) is not supported (use `[@key, p. 3]`).
- A publication takes the layout from its own settings; chapter front matter `studio:` settings
  are ignored inside it. Links to other files from a chapter resolve from the active document in
  the preview.
- The PDF is produced by Chromium's print engine (see Phase 3); tables with many columns are
  shrunk and may break long words.
- Recovery copies, session restore and the conflict check were verified by automated tests on
  Linux; no human test on Windows or macOS has been done.
- citeproc-js is used under the CPAL licence (attribution in About and in
  `THIRD_PARTY_NOTICES.md`); review this if you plan to distribute the application commercially.

**Phase 3**

- Equations are typeset by KaTeX, which is not complete LaTeX: no automatic document-wide
  numbering, `\label`/`\ref`, persistent macros or packages. Manual `\tag{…}` works; see the
  [Mathematics guide](MATHEMATICS.md#what-is-not-supported).
- Mermaid diagrams are limited to 50,000 characters and a 20-second drawing time; very large
  diagrams are reported as errors rather than drawn. Diagram text uses system fonts.
- PDFs are produced by Chromium's print engine: pagination can differ slightly between
  computers that have different fonts installed; a single element taller than a page is split
  where the engine must; header and footer text is plain (no images or HTML).
- Custom CSS rejects remote and local file references by design; to use an image, embed it as a
  `data:` URL. Fonts for themes are system fonts; there is no font download or bundling of
  additional document fonts.
- Standalone HTML keeps links to other local files as written (and reports them); remote images
  stay online.
- Export presets and the document theme from Settings are not stored inside the Markdown
  document; a shared `.md` file carries only what you put in its front matter (Document
  Settings), so share the workspace's `.markdown-studio` folder for the rest.
- The Windows installer is unsigned (see [Release status](DEVELOPMENT.md#release-status)). The macOS build is
  unsigned and not notarised, and only the packaged-app smoke test runs against it.

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
- Bold and italic use the standard <kbd>Ctrl</kbd>+<kbd>B</kbd> and <kbd>Ctrl</kbd>+<kbd>I</kbd>
  (the sidebar toggle moved to <kbd>Ctrl</kbd>+<kbd>\</kbd>). Because <kbd>Ctrl</kbd>+<kbd>K</kbd>
  inserts a link, the editor's `Ctrl`+`K` chords are not available.
- Workspace templates are plain files; if two people edit the same template, the project's
  version control is what merges them.

**Phase 1**

- Documents are read and written as UTF-8. Mixed line endings within one file are
  normalised to the file's dominant style by the editor.
- (Level 1 reloads unmodified documents when their file changes and asks when there are edits.)
- Images dropped into an unsaved document are referenced relative to the workspace root (and
  _Save As_ offers to update them).
- Images referenced from outside the workspace (or outside an opened file's folder) are not
  displayed, by design.
- Remote images (`https://…`) are loaded in the preview and in PDFs, and are left as links in
  HTML exports rather than embedded.
- Image thumbnails are generated by the operating system on Windows and macOS; on Linux the
  original image is scaled by the browser engine.
- (Phase 1 limited PDF output to A4 with fixed margins; Phase 3 replaces this with the page
  setup described above.)

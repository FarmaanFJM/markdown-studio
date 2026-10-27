# Changelog

Markdown Studio follows [Semantic Versioning](https://semver.org). While the major version is 0,
each development phase raises the minor version, fixes raise the patch version, and 1.0.0 is
reserved for the first stable, code-signed release. The version in `package.json` stayed at 0.1.0
through Phases 1 and 2; Phase 3 is the first release to be versioned and packaged as a candidate.

## 0.4.0 — Level 1 (core) and Level 2 (professional publishing) (unreleased)

### GitHub Copilot integration

- **Added:** GitHub Copilot as an AI provider, through GitHub's official Copilot language server
  (`@github/copilot-language-server`, MIT) run as a managed child process by the main process. Settings → AI →
  _Sign in with GitHub_ uses the server's device-code flow (not a pasted token); account, status, sign-out,
  expired/revoked sign-in, missing Copilot access and network errors are shown. The sign-in stays in the language
  server's private folder, outside the page and the settings file.
- **Added:** Copilot inline suggestions as Monaco ghost text (Tab accepts, Esc dismisses, one undo step), with
  incremental document synchronisation and versions, request cancellation, stale-answer checks, restart after a
  crash, and shown / partially-accepted / accepted reports as the protocol requires. Tab keeps its list, table and
  snippet behaviour when no suggestion is visible.
- **Added:** _Automatic inline suggestions_ and _Suggestion delay_ settings; the per-folder and per-document
  switches apply to Copilot. Switching providers keeps the other provider's settings. Rewrite Selection is declined
  with an explanation for Copilot instead of silently using another provider.
- **Added:** the platform's language-server executable is packaged into `resources/copilot/` (lockfile-pinned
  optional npm packages; no download at run time). Linux x64 development and unpacked builds verified; Windows and
  macOS packaging configured but not verified in this environment.
- **Fixed/verified:** the provider choice is persisted reliably (a test read the debounced settings file too early; store and restart tests added); sign-out now also deletes the server's stored session folder; the account folders are created mode 0700.
- **Verified in CI (manual full run):** Windows installer builds, installs, and the installed application starts the bundled server; the packaged macOS arm64 app starts its arm64 server. Windows/macOS not hand-tested.
- **Added:** tests with a deterministic mock language server (unit and Electron E2E with real Monaco), and a start-up
  test of the real bundled server. **Not done:** acceptance with a real Copilot account (manual procedure in
  [docs/AI.md](docs/AI.md#acceptance-with-a-real-copilot-account)); Copilot Chat / SDK integration (evaluated, not
  built).

### Added

- Safe writing: crash recovery of unsaved text, restoring open documents, detection of files
  changed by other programs (follow or ask; never overwritten silently), atomic document writes,
  visible failed-save state.
- Pasting images from the clipboard; relinking relative paths on _Save As_; "image not found"
  reporting in the preview and exports; table size chosen when inserting a table; heading, list and
  quote buttons that insert their marker on an empty line.
- YAML front matter, hidden in the output, with a Document Settings dialog (page, margins, header,
  footer, columns, theme, language, contents, section numbering).
- Figure and table captions with automatic numbers, cross-references to figures, tables and
  sections, `[TOC]`, `[LOF]`, `[LOT]`, numbered sections, identifier diagnostics and `@` completion.
- Sources manager (project library or per-document), BibTeX and CSL JSON import, citations and an
  automatic APA Style 7th edition reference list through citeproc-js.
- Real two-column documents (whole document), full-width figures and tables.
- Publications: several Markdown chapters combined with shared contents, numbering,
  cross-references and bibliography; Publication panel with preview and export.
- Templates: Research report, Onderzoeksverslag (Nederlands), Health UI research (Playful Tech),
  Two-column article.
- Print layout: wide tables stay inside the page, small tables are kept whole, wide tables span
  both columns.
- Documentation: [Writing publications](docs/PUBLICATIONS.md), [Level 1 and 2 status](docs/LEVEL_1_2_STATUS.md).

### Mature-IDE pass (playtest findings)

- **Fixed:** the editor's right-click menu had no background and unreadable text. Cause: Monaco
  renders context menus in a shadow root that cannot see the theme variables defined on the editor
  element; the menu now renders in the page and the Monaco themes define the menu colours.
- **Added:** Quick Fixes for repeated spaces, skipped heading levels (`MD001`) and tables with
  mismatched columns; _Format Markdown Block_, _Repair Table_, _Remove Extra Spaces_ and _Quick Fix…_
  in the context menu and the command palette.
- **Added:** width-aware table formatting (new setting _Table source width_, default 100): wide
  tables are balanced instead of padded to their longest cell; the rendered table is unchanged.
- **Added:** integrated title bar with the application menu; system caption buttons are kept.
- **Changed:** an image dropped on a line that already has text goes on a new line below it (kept
  inside a list item or quote).
- **Added:** AI assistant foundation: provider abstraction, an OpenAI-compatible provider, a
  sidebar section and settings. Off by default. GitHub Copilot is documented, not faked.
- **Fixed:** switching to thumbnails returned to the project root; it now opens at the selected
  folder (or the folder of the selected file).
- **Changed:** the duplicate _Source only_ control is gone; the preview's ✕ closes it.
- **Fixed:** Professional Report printed typed section numbers twice (`1. 1. Inleiding`).
- **Changed:** Settings is a full page with categories and search instead of a sidebar.

### Student workflow follow-ups

- **Fixed (release-blocking):** standard Markdown shortcuts. <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>B</kbd> is bold
  (it toggled the sidebar, which moved to <kbd>Ctrl</kbd>+<kbd>\\</kbd>; bold was <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>),
  <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>9</kbd> is the blockquote (it was the task list, now
  <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>0</kbd>; the blockquote was <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>.</kbd>).
  All shortcuts now come from one definition (`src/shared/shortcuts.ts`) used by the key handler, the menu
  accelerators and the shortcuts dialog; a unit test rejects duplicate bindings on every platform.
- **Changed:** a dropped image is now a separate Markdown block: a blank line separates it from the text above,
  and one follows it when text comes next (a single line break would have kept it inside the paragraph). It stays
  inside list items and quotes; blank lines are added only where missing.
- **Added:** _Fit Table to Editor Width_, and a notice after formatting a table that is wider than the editor
  (with a shortcut to turn word wrap off). Tables are never reformatted automatically.
- **Verified:** Professional Report heading numbers on a realistic document, in the preview counters, the table of
  contents links and the exported PDF text; the section-numbering option no longer doubles typed numbers either.
- **Documentation:** new Getting started, Keyboard shortcuts, Tables and Quick Fixes, Images and assets, Feature
  reference and Development guides; README shortened; AI, Publishing, Authoring, Architecture and Roadmap updated;
  a unit test checks documentation links and that the shortcut reference matches the application.

### Changed

- Exports that refer to missing images now report them (an info notice instead of success).
- Documents opened from disk remember their modification time; saving checks it.
- README statements about settings never being stored in a document were corrected.

### Dependencies

- Added `@citation-js/core`, `@citation-js/plugin-csl`, `@citation-js/plugin-bibtex` (MIT),
  `yaml` (ISC); citeproc-js (CPAL-1.0 OR AGPL) comes with them. See `THIRD_PARTY_NOTICES.md`.

## 0.3.0 — Phase 3: Professional polish and release (unreleased)

### Added

- Mermaid diagrams (` ```mermaid `), drawn in an isolated, sandboxed, network-less window and
  embedded as static, sanitised SVG in the preview, PDF and HTML export; cached and debounced.
- KaTeX mathematics (`$…$`, `$$…$$`, `\(…\)`, `\[…\]`), bundled fonts, manual `\tag{…}` numbering,
  diagnostics; [mathematics guide](docs/MATHEMATICS.md).
- Four document themes (Minimal, Technical, Editorial, Professional Report) with customisation,
  global defaults and workspace overrides; custom CSS under a parser-based security policy.
- PDF publishing: page sizes and orientations, margins, headers and footers with real page
  numbers, backgrounds, scale, explicit page breaks and print-aware pagination.
- Standalone, offline HTML export, audited before writing.
- Export presets (built in, custom, workspace), the Export dialog with live preview, atomic export
  jobs with cancellation and failure recovery.
- Commands, menus, completions and snippets for math, diagrams, themes and export.
- Accessibility: AA contrast, focus trapping and restoration, labels and live regions,
  reduced motion, small-window layout.
- CI: security, export and packaged-application test gates on Linux and Windows, Windows installer
  verification, macOS packaging, benchmark artifact, draft release workflow with optional signing.
- Documentation: publishing guide, performance report, release guide, academic publishing roadmap.

### Changed

- Exporting opens the Export dialog (the toolbar and menu entries still say Export as HTML / PDF).
- PDF margins default to 20 mm (was 18 mm), now configurable.
- Heading ids that collide with `document` property names (for example "Title") now keep their
  anchors.
- Application secondary text colours were darkened/lightened to meet WCAG AA.

### Known limitations

See the README. The installer is unsigned unless signing credentials are configured.

## 0.2.0 — Phase 2: Markdown intelligence and productivity

Markdown IntelliSense, formatting commands, smart lists, tables, templates, outline, table of
contents, link diagnostics, reference-aware rename and move. (Delivered under package version
0.1.0.)

## 0.1.0 — Phase 1: foundation and core editor

Electron shell, Monaco editor, Explorer, image management, HTML and PDF previews and basic
exports.

# Changelog

Markdown Studio follows [Semantic Versioning](https://semver.org). While the major version is 0,
each development phase raises the minor version, fixes raise the patch version, and 1.0.0 is
reserved for the first stable, code-signed release. The version in `package.json` stayed at 0.1.0
through Phases 1 and 2; Phase 3 is the first release to be versioned and packaged as a candidate.

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

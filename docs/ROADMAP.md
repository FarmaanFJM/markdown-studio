# Markdown Studio — Product Roadmap

**Vision:** A fast, offline-first, extensible Markdown editor that grows from everyday
documentation into a professional writing and publishing environment.

**Product principle:** Simple by default, powerful when needed.

**Status:** Long-term proposal; the table below is the current implementation status. Everything
under a future milestone is **not implemented** and is not a commitment. What exists today is described in the
[README](../README.md) and the [feature reference](FEATURES.md); the detailed plan for equation numbering,
references and books is in the [academic publishing roadmap](ACADEMIC_PUBLISHING_ROADMAP.md), which this
document builds on.

**Current priority:** a reliable student documentation tool. Milestone 0 is not closed (see below), so the
next work is real Windows playtesting and bug fixing, not new features.

## Implementation status

"Verified" means automated tests (unit, and Playwright E2E on Linux and, in CI, Windows). **No human has
playtested on Windows or macOS** except where a playtest finding is listed.

| Status                                       | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Implemented and verified**                 | Folder/file management, tabs, safe saving and recovery; Markdown editor with toolbar, standard formatting shortcuts, smart lists, completions and slash commands; tables (insert, format, repair, visual editor); style and link checks with Quick Fixes; reference-aware rename and move; image drops, pasting and thumbnails; HTML and PDF preview; four document themes, custom CSS, export presets and PDF/HTML export; mathematics and Mermaid; front matter, captions, cross-references, citations (APA 7), contents, two columns, publications; templates; full-page Settings; integrated title bar |
| **Implemented, awaiting human verification** | Windows behaviour of the integrated title bar (maximise, Snap layouts, menu popups); drag-and-drop of images from Windows Explorer; the installer's first-run experience; high-DPI layouts                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Implemented, optional**                    | AI assistant (off by default): OpenAI-compatible provider (tested against a local fake server only, not a real provider) and GitHub Copilot inline suggestions through the official language server (mock-server and real-binary start-up tests pass; **awaiting acceptance with a real Copilot account**, see docs/AI.md)                                                                                                                                                                                                                                                                                 |
| **Planned**                                  | Milestones 1 onward below: section-level layout, equation numbering and reusable definitions, footnotes, more citation styles, EPUB, extension system                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Deferred**                                 | Copilot Chat / agent features (Copilot SDK); AI streaming and document-aware actions; code signing of the installers (needs certificates)                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### Milestone 0 — School-ready: status

Milestone 0 is **not complete**. Its exit criterion — a student completes and submits a real school project
without another editor — has been exercised only by automated tests that replay the workflow
(`school-workflow.spec.ts`, `student-workflow.spec.ts`) and by one developer's playtest, which produced the ten
findings fixed in the _Student Workflow Polish Pass_ (context menu, Quick Fixes, table formatter, title bar, image
drops, AI foundation, thumbnail navigation, duplicate preview control, Professional Report numbering, Settings
page) plus the shortcut, image-spacing and wide-table follow-ups. It closes after a further playtest on Windows
finds no blocking problems.

## Product direction

Markdown Studio Core is the default: write Markdown, organise folders, insert images, preview
documents and export PDFs.

Optional capabilities sit on top of the core and are only visible when relevant or enabled:

- Academic Writing
- Book Publishing
- Chess Authoring
- Technical Docs
- Page Design
- Extensions

The editor stays simple. The possibilities expand through optional capabilities.

### Reference products

Markdown Studio does not need to replace any of these. It can combine selected strengths in a
much simpler experience.

- **Overleaf:** academic papers, equations, bibliography management, templates and collaborative
  writing.
- **Quarto:** multiple chapters, cross-references, and books published as PDF, EPUB or websites.
- **Typst:** sophisticated page composition, columns, figures, footnotes and mathematical
  publishing.
- **Obsidian:** extensibility through optional plugins and themes, including community-built
  chessboard rendering.

---

## Milestone 0 — School-ready Markdown Studio

**Priority: immediate.**

Make Markdown Studio genuinely useful for ordinary school, work and personal documentation.

**Main workflow.** A student opens a project folder, creates Markdown documents, writes analysis
or technical documentation, inserts screenshots and diagrams, and exports the finished result as
a PDF.

```text
Playful-Tech/
├── 01-Research/
│   ├── Research.md
│   └── Competitor-Analysis.md
├── 02-Design/
│   ├── Requirements.md
│   └── Architecture.md
├── 03-Implementation/
│   └── Technical-Documentation.md
├── 04-Testing/
│   └── Test-Results.md
└── assets/
    ├── architecture.png
    └── screenshot.png
```

**Required experience**

- Reliable folder and file management.
- Comfortable Markdown editing with the existing productivity features.
- Easy image insertion and management.
- Live preview with tables, code, diagrams and mathematics.
- A usable document outline and table of contents.
- Reliable PDF export with professional default styling.
- Simple settings and predictable keyboard shortcuts.
- Safe saving and recovery from ordinary editing errors.
- No accounts, subscriptions, servers or online services.

The advanced publishing capabilities developed in Phase 3 should remain unobtrusive and should
not delay basic usability unnecessarily.

**Exit criterion:** A student can complete and submit a real school project using Markdown Studio
without needing Word, LaTeX or another document editor for normal formatting and export.

After this milestone, prioritise real Windows playtesting and bug fixing over adding features.

---

## Milestone 1 — Professional document layout

**Priority: high, after the stable core.**

Turn Markdown Studio into a more capable document designer while retaining Markdown as the
source.

**Page layouts.** Support:

- Single-column and two-column pages.
- Customisable column widths and gaps.
- Landscape and portrait sections where the publishing engine permits them.
- Manual page breaks and column breaks.
- Full-width figures inside multi-column documents.
- Configurable margins, page dimensions and paragraph spacing.
- Headers, footers, page numbers and running chapter titles.
- Footnotes and endnotes.
- Image captions, figure placement and text wrapping.
- Better pagination for tables, equations and code blocks.

Two-column layouts are particularly useful for journal articles, academic papers, newsletters
and chess books. This means real paginated columns, with figures that can span both columns,
suitable captions and consistent page breaks, not merely two visual panes.

Page layout belongs primarily to document settings and publishing presets. Users should not need
to write complex CSS for ordinary configurations.

**Visual layout selector.** A simple Page Layout panel offering one column, two equal columns,
two unequal columns and document-specific layout presets. An advanced mode may expose additional
settings.

For complex pagination, investigate a dedicated publishing backend rather than assuming
Chromium printing can reliably solve every layout problem.

**Exit criterion:** Users can produce consistent, readable single-column and two-column PDFs
without manually adjusting every page.

---

## Milestone 2 — Structured documents and references

**Priority: high.**

Introduce reliable document structure and automatic referencing.

**Cross-references.** Identifiers and automatically updated references for headings and
sections, figures and images, tables, equations, diagrams and code listings.

Prefer interoperable syntax inspired by Quarto/Pandoc where practical. Illustrative example:

```markdown
![Architecture](assets/architecture.png)
{#fig-architecture}

See @fig-architecture.
```

The renderer would generate an appropriately numbered caption and reference. The exact supported
Markdown extension syntax must be documented, validated and independently tested.

**Additional document tools**

- Automatic figure and table lists.
- Numbered headings and sections.
- Footnotes and endnotes.
- Glossaries and abbreviation lists.
- Named equations and reusable mathematical definitions.
- Visual equation editing backed by LaTeX-style source.
- Document validation for duplicate identifiers and broken references.

**Project-wide indexing.** References must work across multiple Markdown files that belong to
one document project. Reordering content must not require manually updating every figure,
section or equation number.

**Exit criterion:** Long technical documents maintain their own numbering and references as the
author reorganises content.

---

## Milestone 3 — Extension architecture

**Priority: foundational, but not an immediate public marketplace.**

Design a controlled extension system that allows new authoring capabilities without continuously
expanding the core application.

| Category       | Possible capabilities                                         |
| -------------- | ------------------------------------------------------------- |
| Renderers      | Chessboards, chemical structures, timelines, special diagrams |
| Editors        | Equation editor, chess position editor, specialised tables    |
| Document tools | Reference manager, bibliography, glossary, index              |
| Exporters      | EPUB, DOCX, book PDF, website publishing                      |
| Themes         | Academic papers, books, reports, journals                     |
| Integrations   | Zotero, Git, selected developer documentation systems         |
| Validators     | Academic citation checks, document quality checks             |

**Extension API.** Narrowly scoped, versioned capabilities for registering commands, adding
panels, rendering specific Markdown constructs, adding diagnostics and contributing export
formats.

Extensions must not receive unrestricted filesystem or operating-system access. Use explicit user
permissions, isolated execution and validated inputs and outputs. A document must remain safe to
open even when it contains syntax belonging to an extension that is disabled or unavailable.

**Distribution.** Start with internally maintained, explicitly installed extensions. Introduce a
community extension directory only after the security model, compatibility strategy,
documentation and update mechanism have been proven.

**Exit criterion:** A first-party extension can add a specialised editor and renderer without
modifying Markdown Studio's core document parser or compromising its security boundaries.

---

## Milestone 4A — Chess authoring extension

**Priority: high-value specialist extension.**

A professional chess-writing environment for lessons, instructional articles, opening manuals,
puzzle collections and chess books: insert positions with a visual board editor, annotate them,
and have consistent printable diagrams produced automatically, without manual screenshots.

**Chess diagram insertion.** A graphical position editor with:

- Drag-and-drop pieces.
- Standard and custom starting positions.
- FEN import and export.
- White and black board orientation.
- Board coordinates.
- Coloured squares and arrows.
- Last-move highlights.
- Multiple board and piece styles.
- Captions and automatically numbered diagrams.
- Crisp vector output suitable for printing.

The position must be stored in portable text form within the Markdown source.

**PGN support.** Import games and select positions from their move sequences, with main lines and
variations, move comments and annotations, move-by-move navigation, legal-move validation, NAG
symbols such as `!`, `?`, `!?` and `??`, move numbering, diagram insertion at any relevant move
and preservation of the underlying PGN data. An interactive board is available in the
application, but exported PDFs contain static, fully rendered diagrams and move text.

**Chess publishing.** Templates and formatting options for an opening repertoire book, endgame
training manual, tactical puzzle collection, annotated games collection, chess lesson handout and
tournament analysis report. Support two-column layouts, compact figurine notation, solution
sections, chapter-based numbering and configurable diagram placement. Puzzle collections can keep
exercises separate from their solutions.

**Illustrative future syntax** (not an existing Markdown standard, not implemented):

```text
fen: 8/8/8/8/8/8/4K3/6k1 w - - 0 1
orientation: white
caption: Example position
```

**Licensing note.** Lichess's Chessground is a useful reference for board interactions, but it is
licensed GPL-3.0. Incorporating it directly into Markdown Studio's MIT-licensed architecture
requires careful licence-compatibility consideration. A purpose-built board renderer or an
appropriately licensed alternative may be simpler.

**Exit criterion:** An author can create a professional chess lesson or small chess book with
diagrams, annotations and PDF export without manually preparing board images.

---

## Milestone 4B — Academic writing extension

**Priority: optional specialist capability.**

Tools for research papers, theses, essays and technical reports.

**Reference manager.** Bibliographic sources in interoperable formats: BibTeX, CSL JSON and RIS
where practical. A searchable citation-insertion interface. A standards-based CSL processor
formats citations and bibliographies, with styles including APA 7, IEEE, Chicago, Harvard
variants and any installed CSL file. Do not implement citation standards with informal string
templates.

**Research workflows**

- Insert citations from a bibliography.
- Generate and update reference lists.
- Detect missing or unused citation keys.
- Select document-wide citation styles.
- Search and navigate cited references.
- Associate PDFs or notes with bibliography entries where permitted.
- Import and export references to work with external reference managers.
- Optional Zotero integration.

**Academic document templates.** Research report, scientific article, literature review, thesis,
conference paper and technical dissertation, supporting equations, tables, figures, numbering,
appendices and reference lists together.

**Exit criterion:** A student can create a properly referenced academic paper, export it and
update its citations without manually maintaining the bibliography.

---

## Milestone 5 — Book publishing

**Priority: long-term.**

Introduce a Book Project that combines multiple Markdown documents into one publication. Each
chapter remains an ordinary Markdown file.

**Book project management**

- Choose chapter files and arrange them in order.
- Support nested chapters and sections.
- Create title, copyright, dedication and preface pages.
- Generate chapter numbering and contents pages.
- Maintain references across chapters.
- Create appendices and indexes.
- Manage images, diagrams, equations and bibliography assets.
- Provide a whole-book preview.
- Support per-book themes and export settings.
- Report unresolved references and missing assets before publication.

**Publishing formats,** in priority order: PDF for printing and distribution; EPUB for
e-readers; HTML for browsers; static websites for documentation and online books. DOCX can be
evaluated when there is demonstrated demand.

A professional print-production workflow involving printer profiles, bleed, colour management and
commercial press requirements is a more advanced capability. Do not assume it works merely
because PDF export exists.

**Book templates.** Technical textbook, chess instruction book, university study guide,
programming handbook, research monograph, non-fiction book, novel and illustrated educational
book.

**Exit criterion:** An author can write and publish a coherent multi-chapter book while keeping
every chapter as a portable Markdown source file.

---

## Milestone 6 — Knowledge and developer documentation

**Priority: optional, driven by user demand.**

For people maintaining larger collections of technical knowledge. Possible features:

- Workspace-wide full-text search.
- Backlinks and document relationships.
- Documentation navigation trees.
- API documentation templates.
- Link integrity reports.
- Versioned documentation projects.
- Git-aware history and change previews.
- Static documentation website export.
- Multi-project documentation workspaces.
- Optional automatic navigation indexes.
- Documentation coverage and validation reports.

Avoid replacing Git itself or recreating a complete IDE.

**Exit criterion:** A development team can manage a documentation repository and publish it
without a complex external documentation build process for common cases.

---

## Milestone 7 — Additional specialist extensions

Opportunities, not planned commitments.

- **Education:** worksheets and revision guides; multiple-choice and short-answer blocks; hidden
  solutions and answer keys; printable tests; flashcard exports; learning objectives and
  exercise numbering.
- **Science and engineering:** chemical formula and reaction diagrams; circuit and block diagrams;
  unit-aware equation tools; charts and plotted functions; technical drawing integration;
  scientific figures.
- **Publishing and creative writing:** newsletters; magazine layouts; screenplay formatting;
  fiction writing templates; story outlines and character references; multilingual publication
  workflows.
- **Business documentation:** meeting reports; proposals; decision records; project handbooks;
  technical specifications; branded reports and reusable company templates.

Each specialist capability should justify itself through real user demand and should not add
unnecessary controls to the default editing interface.

---

## Long-term product requirements

These rules apply to every milestone.

1. **Markdown remains the source of truth.** No proprietary binary document format becomes
   mandatory. Advanced syntax is documented, versioned and reasonably interoperable.
2. **Simple by default.** The initial workspace remains an Explorer, source editor and preview.
   Advanced capabilities appear only when relevant or explicitly enabled.
3. **Local-first and offline-capable.** Ordinary editing and supported exports require no server
   or account.
4. **Reproducible publishing.** Identical source, assets, settings and renderer versions produce
   equivalent results, without hidden online dependencies.
5. **Secure extensibility.** Extensions never silently inherit unrestricted access to user files,
   operating-system capabilities or the network.
6. **Reliable interoperability.** Favour established formats (Markdown, HTML, PDF, SVG, FEN, PGN,
   BibTeX, CSL JSON, EPUB) when the corresponding feature is implemented.
7. **Release quality over feature count.** New capabilities require testing, documentation,
   predictable failure handling and genuine packaged-application verification.
8. **User-driven progression.** Do not begin a milestone simply because it is listed here. Choose
   subsequent work from actual use, demonstrated limitations and demand.

## Release strategy

| Stage                       | Main value                                 | Decision to proceed                        |
| --------------------------- | ------------------------------------------ | ------------------------------------------ |
| School-ready core           | Dependable everyday Markdown documentation | Real school workflow succeeds              |
| Professional layouts        | High-quality PDF publishing                | Printing and pagination are reliable       |
| Structured documents        | Automatic numbering and references         | Cross-reference correctness is proven      |
| Extension foundation        | Safe modular capabilities                  | A first-party extension works securely     |
| Chess / academic extensions | Specialist authoring                       | Genuine authors can complete sample works  |
| Book projects               | Long-form multi-file publishing            | Full-book export is reliable               |
| Broader ecosystem           | Community innovation                       | Extension governance and demand justify it |

Milestones 4A and 4B can be developed independently once the extension foundation is adequate.
The exact versions, dates and order beyond the foundational dependencies remain flexible.

## Long-term position

Markdown Studio should not attempt to outgrow every existing editor. Its central value is that
someone can start by writing a simple `.md` file, then gradually reach powerful authoring and
publishing tools without giving up the simplicity and portability of Markdown.

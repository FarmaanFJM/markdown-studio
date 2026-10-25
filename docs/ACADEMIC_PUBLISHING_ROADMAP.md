# Roadmap: scientific writing and book publishing

> **Status: planned. Nothing in this document is implemented.** It describes a possible future
> direction for Markdown Studio. What exists today is documented in the
> [mathematics guide](MATHEMATICS.md), the [authoring guide](AUTHORING.md) and the
> [publishing guide](PUBLISHING.md). Phase 3 deliberately stops at manual equation tags
> (`\tag{…}`), KaTeX rendering, Mermaid diagrams, themes, and PDF/HTML export.

## Vision

Markdown Studio grows from a Markdown authoring tool into a **Markdown-first scientific writing
and book-publishing application**: a place to write a paper, a thesis or a multi-chapter book as
plain Markdown files, with equations, figures, tables, citations and cross-references that stay
correct as the text changes, and with a PDF (and later EPUB) that looks professionally typeset.

Principles, inherited from the application and applied to every item below:

1. **Markdown is the source of truth.** Every feature reads and writes ordinary Markdown text.
   Nothing is hidden in a database or a proprietary file; a document opened in any other editor
   still makes sense.
2. **Interoperate before inventing.** Prefer the conventions of
   [Pandoc](https://pandoc.org/MANUAL.html) and [Quarto](https://quarto.org/docs/authoring/markdown-basics.html)
   for citations and cross-references, so a project can be built by those tools too. Where a
   convention is missing, extend it conservatively and document the extension.
3. **Deterministic output.** The same files always produce the same numbers, labels and pages,
   independent of editing order, open tabs, or earlier renders.
4. **Offline, local, private.** No accounts, no network lookups required (a DOI lookup, if ever
   added, is an explicit, optional action).
5. **Safe by construction.** All new input (BibTeX, CSL, macro files, project files) is untrusted
   data parsed with validated parsers; the existing sanitisation, CSP and IPC rules apply.
6. **No silent expansion.** Each feature ships behind its own settings, with diagnostics rather
   than silent rewrites, and with documented limits.

## Where Phase 3 ends

| Capability                                    | Phase 3 (today)                                        |
| --------------------------------------------- | ------------------------------------------------------ |
| KaTeX inline and display math                 | Implemented                                            |
| Manual equation numbers (`\tag{…}`)           | Implemented, verified in HTML/PDF preview and export   |
| Numbers inside one `align`/`equation` block   | KaTeX's own, restarting at (1) in every equation       |
| Labels, `\ref`, `\eqref`, cross-references    | **Not implemented**                                    |
| Document-wide automatic numbering             | **Not implemented**                                    |
| Persistent macros                             | **Not implemented** (a macro lives for one expression) |
| Citations, bibliography, CSL styles           | **Not implemented**                                    |
| Figure/table/section numbering and references | **Not implemented**                                    |
| Multi-file book projects, EPUB                | **Not implemented**                                    |
| Mermaid diagrams, themes, page setup, presets | Implemented                                            |

## Proposed syntax (Quarto/Pandoc compatible)

The roadmap standardises on these forms. They are plain text, readable without tooling, and
understood by Pandoc/Quarto.

```markdown
---
title: 'On Gaussian integrals'
bibliography: references.bib
csl: apa.csl
---

# Introduction {#sec-intro}

As shown by @gauss1809 and [-@laplace1812, p. 12; @euler1748], see @eq-gauss and @fig-bell.

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$ {#eq-gauss}

![The bell curve](images/bell.png){#fig-bell}

| Quantity | Value |
| -------- | ----- |
| mean     | 0     |

: Summary statistics {#tbl-stats}

Refer to @sec-intro, @tbl-stats and @eq-gauss anywhere in the book.
$$
```

| Object   | Label prefix | Reference form                     | Pandoc/Quarto equivalent                |
| -------- | ------------ | ---------------------------------- | --------------------------------------- |
| Equation | `eq-`        | `@eq-name`                         | Quarto `{#eq-name}` after `$$ … $$`     |
| Figure   | `fig-`       | `@fig-name`                        | Quarto `{#fig-name}` on an image        |
| Table    | `tbl-`       | `@tbl-name`                        | Quarto `{#tbl-name}` on a table caption |
| Section  | `sec-`       | `@sec-name`                        | Quarto `{#sec-name}` on a heading       |
| Citation | citation key | `@key`, `[@key]`, `[@a; @b, p. 3]` | Pandoc citation syntax                  |

Where Pandoc/Quarto behaviour is ambiguous or version-dependent, the roadmap items name the
exact subset Markdown Studio will support and add tests against that subset.

---

## 1. Visual Equation Editor

**Goal.** Make mathematics approachable without hiding the source.

**Behaviour**

- Opened from **Insert → Equation…**, the command palette, a toolbar button, or on an existing
  equation (**Edit Equation…** from the context menu and from the equation's gutter marker).
- A dialog with three parts: a **template gallery** (fraction, root, sum, product, limit,
  integral, derivative, matrix, cases, aligned system, common environments), a **source field**
  (monospace, with KaTeX command completion), and a **live preview** rendered by the same KaTeX
  configuration as the document, including the inline/display choice.
- **Inline or display** is explicit. For display math the editor offers an optional label
  (`{#eq-…}`) and a manual `\tag`, with validation.
- **Source-preserving.** Opening an equation shows exactly the text in the document. Saving
  replaces only that range, as one undoable edit, and never reformats text it did not touch.
  Unknown or advanced LaTeX is edited as plain source; the template gallery only inserts.
- Errors are shown beside the field using the existing KaTeX diagnostics, with the same message
  that the preview shows.
- Fully keyboard operable, focus-trapped and restored like every dialog.

**Out of scope:** a drag-and-drop formula canvas, handwriting input, or storing equations as
anything other than source text.

**Acceptance:** round-trip tests (open → no change → text identical byte for byte), undo
granularity, CRLF/BOM preservation, and E2E tests for insert, edit, cancel and error cases.

## 2. Equations & Definitions panel

**Goal.** A document-wide, navigable index of mathematical objects.

**Contents** of a sidebar panel, built from the same parse as the outline and kept current while
typing (debounced, cached per document version like the existing analysis):

- **Equations** with their identifier (`eq-gauss`), manual tag, resolved number (once item 3
  exists), a rendered preview and the surrounding heading.
- **Named expressions and functions** declared in definitions (item 4): `f(x) := …`.
- **Macros** from definition files, with their scope (global, workspace, document), expansion and
  the file they come from.
- **Identifiers in use:** duplicates, unused identifiers, and references to missing ones are
  flagged here and in the editor's problem list.

**Interactions:** click or press Enter to jump to the source; filter by text, scope or problem;
insert a reference to the selected item at the cursor (`@eq-gauss`); "show usages".

**Acceptance:** the panel never mutates the document by itself; results are identical to what the
build produces; performance budgets for a 1 MB document are measured with the existing benchmark
suite.

## 3. Automatic equation numbering, labels and references

**Goal.** Replace hand-typed `\tag{…}` numbers with stable, checked ones, without leaving
Markdown.

**Syntax.** A display equation ends with a Pandoc/Quarto attribute block:
`$$ … $$ {#eq-gauss}`. Inside a block, `@eq-gauss` is a reference. Equations without an
identifier are unnumbered; an explicit `\tag{…}` always wins and is never overwritten.

**Numbering rules (deterministic)**

- Numbers are assigned in document order, from 1, across the whole document (single file) or
  the whole book (item 7, with a configurable per-chapter prefix, e.g. `2.3`).
- Numbering is computed by a pure function of the Markdown text; render order, tabs and caching
  cannot change it.
- Rendered as `(1)` by default, with the style configurable per theme.

**Diagnostics**

- Duplicate identifiers (all occurrences are flagged, with a related-location link).
- Reference to an unknown identifier (with "did you mean…" suggestions).
- Identifier with invalid characters; unreferenced identifiers (optional hint).

**Safe reference updates.** Renaming an identifier from the Equations panel previews every
reference (like the existing reference-aware file rename), updates open documents as one undoable
edit, and writes other files with the existing stale-write protection.

**Compatibility.** The text is valid Pandoc/Quarto Markdown. KaTeX's own `\label`/`\ref` stay
unsupported; Markdown Studio does not invent LaTeX-level labels.

**Acceptance:** golden tests comparing the produced numbers with Pandoc/Quarto output for a
shared corpus; property tests for stability under edits elsewhere; E2E tests for diagnostics and
rename.

## 4. Reusable mathematical definitions

**Goal.** Define a macro or named expression once and use it everywhere, without surprises.

**Definition files.** Plain text, no code execution. Proposed form is a Markdown fenced block or
a `.tex`-style file of `\newcommand`-like entries that is **parsed and validated, never
evaluated**:

````markdown
```math-definitions
\newcommand{\RR}{\mathbb{R}}
\newcommand{\norm}[1]{\left\lVert #1 \right\rVert}
f(x) := x^2 + 1
```
````

**Scopes and precedence** (narrowest wins):

| Scope         | Stored in                                                 | Visible to                 |
| ------------- | --------------------------------------------------------- | -------------------------- |
| **Document**  | the document itself (front matter or a definitions block) | that document only         |
| **Workspace** | `.markdown-studio/definitions.md` in the project          | every document in it       |
| **Global**    | the user's data folder                                    | every document, everywhere |

Shadowing is reported by a diagnostic, not applied silently.

**Determinism and isolation**

- Every equation is rendered from a **fresh macro table** built only from the definitions in
  scope; one equation can never define or change anything seen by another (this is already true
  today because macros are per expression, and it stays true).
- The macro table is a pure function of (global + workspace + document definitions); it is part
  of the render-cache key, and exports embed or resolve it so a shared file renders identically
  on another computer.
- Macro expansion keeps KaTeX's expansion limits; recursion and size limits are enforced when
  definitions are loaded.
- Exported HTML and PDF never depend on files outside the exported project.

**Acceptance:** tests for scope resolution, shadowing diagnostics, cache invalidation when a
definition changes, no leakage between equations, and identical output for the same inputs on all
platforms.

## 5. Academic Reference Manager

**Goal.** Cite sources and generate bibliographies from local files.

**Data**

- **Import and use `.bib` (BibTeX/BibLaTeX) and CSL JSON.** Files stay where they are; a library
  is a list of files in the document's front matter (`bibliography: refs.bib`) or in the
  workspace settings. Parsers are validated, size-limited and run outside the UI thread.
- A **reference view** lists entries (key, authors, year, title, type), with search and filters.
  Adding an entry writes it to the user's chosen `.bib`/CSL JSON file (never to a hidden store);
  edits show a diff before they are written.

**Citations**

- Insert with **Insert → Citation…** (searchable list); Markdown form `[@smith2020]`,
  `[@smith2020, p. 33]`, `[-@smith2020]`, `[@a; @b]`, `@smith2020` — the Pandoc syntax.
- Completion of citation keys after `@` and `[@`, using the existing completion provider.

**Styles and output**

- **Citation Style Language** styles: APA 7 (bundled), plus any `.csl` file the user adds; a
  curated set of other common styles (for example Chicago, IEEE, Harvard, Vancouver, Nature) can
  be bundled with their licences if their redistribution terms allow, otherwise offered as
  "add a file".
- Bibliography generated at the end of the document or where `::: {#refs}` appears, in preview,
  PDF and HTML. A CSL engine (for example the MIT-licensed `citeproc-js`) runs locally.
- Output is deterministic: sorted per style, with stable disambiguation (`2020a`, `2020b`).

**Diagnostics:** unresolved citation keys, duplicate keys across files, malformed entries,
missing required fields for the chosen style, and unused entries (optional).

**Acceptance:** fixtures compared with Pandoc `--citeproc` output for APA 7 and at least two more
styles; malformed-file fuzzing; E2E for insert, preview, export and diagnostics.

## 6. Numbered figures, tables, sections and other objects

**Goal.** One numbering and reference system for everything a reader refers to.

- **Figures:** `![Caption](image.png){#fig-bell}`; **tables:** a caption line `: Caption {#tbl-stats}`
  after the table; **sections:** `# Title {#sec-intro}`; **equations:** item 3. Further object
  types (listings, theorems, definitions) follow the Quarto prefixes (`lst-`, `thm-`, `def-`)
  only once the first four are solid.
- **Numbering** in document order, per type, with optional chapter prefixes in books; captions are
  rendered as "Figure 3: Caption", "Table 2: …", localisable and themeable.
- **References** with `@fig-bell`, `@tbl-stats`, `@sec-intro`, resolved to "Figure 3", "Table 2",
  "Section 1.1" (the label text is configurable per language).
- **Lists** of figures and tables can be generated on request.
- **Diagnostics and safe renaming** share the machinery of item 3: duplicates, missing targets,
  and previewed updates.

**Acceptance:** golden comparisons with Pandoc/Quarto for numbering and caption text; accessible
output (captions associated with their figure/table, link text meaningful for screen readers).

## 7. Book projects

**Goal.** Write a book from many Markdown files and publish it consistently.

**Project definition.** A small, human-editable file at the project root — proposed to be a
subset of Quarto's `_quarto.yml` book configuration so the same folder builds elsewhere:

```yaml
project:
  type: book
book:
  title: 'A Book About Integrals'
  author: 'Ada Lovelace'
  chapters:
    - index.md
    - part: 'Foundations'
      chapters:
        - limits.md
        - derivatives.md
    - appendix.md
bibliography: references.bib
csl: apa.csl
```

**Behaviour**

- A **Book** view in the Explorer shows ordered parts/chapters, with drag-to-reorder that edits
  the project file (previewed, undoable).
- **Front and back matter:** title page, copyright page, dedication, preface, appendices,
  bibliography, index placeholders — as ordinary Markdown files with designated roles.
- **Generated contents:** table of contents (and lists of figures/tables) across all chapters
  with working links and page numbers in PDF.
- **Consistent cross-chapter references:** numbering with chapter prefixes (`Figure 2.3`),
  `@fig-…`/`@eq-…`/`@sec-…` resolved across files; diagnostics report duplicates and missing
  targets across the whole book; moving or renaming a chapter file updates references with the
  existing reference-aware move.
- **Page numbering:** roman numerals for front matter, arabic from chapter 1, running headers
  (chapter title) and footers (page number), chapter starts on a new (optionally right-hand)
  page, using the existing page-setup, header/footer and print pipeline.
- **Publishing:** one PDF for the whole book (through the existing Chromium print pipeline),
  **EPUB 3** (reflowable, with embedded fonts, math as MathML or SVG, navigation document,
  cover and metadata), and a multi-page standalone HTML site. Each output is validated (EPUB with
  the W3C EPUBCheck in CI) and built from actual generated content, never screenshots.
- **Reliability:** builds run as isolated, cancellable jobs with temporary files and atomic
  replacement, like current exports; a broken chapter produces a diagnostic and a clearly marked
  placeholder rather than a failed book.

**Acceptance:** build the same project with Markdown Studio and with Quarto/Pandoc and compare
numbering, references and bibliography; EPUBCheck-clean output; large-book performance budgets
(for example 40 chapters, 500 equations, 100 figures); deterministic byte-stable output for
unchanged inputs where the format allows.

---

## Suggested delivery order

Each stage is useful on its own and builds on the previous one.

1. **Foundations:** a document model for labelled objects (attribute blocks, `{#id}` parsing in
   the shared markdown-it configuration), identifier diagnostics, numbering as a pure function.
   _(items 3 and 6, equations first)_
2. **Equation Editor and Equations & Definitions panel** on top of that model. _(items 1, 2)_
3. **Definitions with scopes**, with deterministic macro tables and cache keys. _(item 4)_
4. **References:** BibTeX/CSL JSON parsing, citation syntax and completion, CSL rendering,
   bibliography output, diagnostics. _(item 5)_
5. **Books:** project file, multi-file numbering and references, front matter, contents, page
   numbering, PDF. _(item 7)_
6. **EPUB** and a multi-page HTML site. _(item 7)_

## Cross-cutting requirements

- **Security:** parsers for `.bib`, CSL, CSL JSON, definition files and project files are
  treated as untrusted input, size- and depth-limited, and covered by adversarial tests;
  rendered output continues through the existing sanitiser and Content Security Policy; no
  network access is introduced; filesystem access stays behind the validated, access-controlled
  main-process API.
- **Performance:** every new analysis is cached per document version, debounced, cancellable and
  measured with the benchmark suite (`docs/PERFORMANCE.md`); a documented size limit with clear
  feedback replaces silent slowdowns.
- **Accessibility:** new dialogs and panels follow the existing focus, keyboard, screen-reader
  and contrast rules; generated captions, references and bibliographies are semantic HTML.
- **Compatibility:** CRLF/LF and UTF-8 BOM are preserved by every edit; existing Phase 1–3
  documents render unchanged when none of the new syntax is used.
- **Documentation and tests:** each feature ships with a user guide section whose examples are
  executed by tests (as `docs/MATHEMATICS.md` already is), unit tests for the pure model,
  Electron E2E tests, and visual inspection of generated PDF pages.

## Non-goals

- A WYSIWYG or rich-text editor; Markdown stays the editing surface.
- Cloud sync, collaboration, accounts, telemetry, or remote reference lookups as a requirement.
- Full LaTeX document compilation (packages, classes, TikZ). KaTeX remains the math engine; a
  LaTeX engine is not planned.
- Reimplementing Pandoc. Where Pandoc or Quarto already do the job, Markdown Studio aims to be
  compatible with their conventions, not to replace them.

## Open questions

- Should the definitions file be Markdown-fenced, a separate file format, or both?
- Which CSL styles can be bundled under their licences, and which should be "bring your own"?
- How closely should the project file track Quarto's `_quarto.yml`, and which keys are out of
  scope for a first release?
- What is the best math representation inside EPUB readers (MathML versus pre-rendered SVG with
  alternative text) given current reader support?

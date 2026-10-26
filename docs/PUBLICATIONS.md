# Writing publications: captions, references, citations, columns and chapters

This guide describes what Markdown Studio adds for longer, structured documents: figure and table
captions with automatic numbers, cross-references, a table of contents, citations with an APA
reference list, page layout and two columns, and publications that combine several Markdown
files. Everything is plain Markdown plus a few Pandoc/Quarto-style conventions, so the files stay
readable (and, for the common cases, buildable) in other tools.

The completeness of each feature against its requirement is tracked in
[LEVEL_1_2_STATUS.md](LEVEL_1_2_STATUS.md).

## Where things are stored

| What                                      | Where                                                         |
| ----------------------------------------- | ------------------------------------------------------------- |
| Text, captions, references, citations     | In the Markdown file itself                                   |
| Page, columns, theme, contents, language  | In the file's **front matter** (YAML at the top)              |
| Sources of the whole project              | `.markdown-studio/sources.json` (CSL JSON) in the folder      |
| Sources of one document (optional)        | `references:` in that document's front matter                 |
| A publication (chapter order and options) | `.markdown-studio/publication.json` in the folder             |
| Images                                    | The project's asset folder (`assets/`), as normal image files |

Nothing is hidden in a database. The `.markdown-studio` folder is not shown in the Explorer; you
can copy, move or version the whole project folder, and every path in it is relative.

## Document settings (front matter)

**Publish → Document Settings…** (Ctrl+Shift+D, or the sliders button in the toolbar) edits the
settings below and writes them to the top of the file:

```yaml
---
title: Health UI in games
author: Student Name
lang: en # en, nl, de, fr, es — caption words and citation terms
toc: true # automatic table of contents
toc-depth: 3
number-sections: true
studio:
  theme: report # overrides the theme from Settings for this document
  columns: { count: 2, gap: 8 } # the whole document (see Columns)
  page:
    size: A4
    orientation: portrait
    margins: { top: 20, right: 18, bottom: 20, left: 18 }
  header: { text: '{title}', align: left }
  footer: { text: 'Page {page} of {pages}', align: center }
---
```

- The standard keys (`title`, `author`, `lang`, `toc`, `number-sections`) mean what they mean in
  Pandoc and Quarto. A `bibliography:` key is kept for those tools but not loaded here (a warning
  says so): import the file under **Manage Sources** instead. Everything specific to Markdown Studio is under `studio:`, which
  other tools ignore.
- Values the application cannot use are **reported** (Problems panel and a warning at line 1), not
  dropped silently. Damaged YAML is never rewritten: the dialog refuses to edit it and says why.
- The dialog changes only the keys it knows. Other keys, their order and comments stay.
- **Precedence.** The document's own page size, margins, header and footer win over the active
  export preset (the Export dialog says which fields the document sets). Its theme wins over the
  Settings and workspace theme, but an explicit theme in an export preset still wins over both.
  Columns and numbering always come from the document.

## Figures, tables and numbering

| You write                                     | You get                                       |
| --------------------------------------------- | --------------------------------------------- |
| `![Health bar](assets/bar.png){#fig-bar}`     | a figure captioned "Figure 1: Health bar"     |
| `: Compared games {#tbl-games}` under a table | the table captioned "Table 1: Compared games" |
| `## Method {#sec-method}`                     | a heading other text can refer to             |
| `@fig-bar`, `@tbl-games`, `@sec-method`       | "Figure 1", "Table 1", "Section 2" as links   |

- **Insert → Figure with Caption…** (Ctrl+Shift+F) chooses an image file, copies it into the asset
  folder (never overwriting) and inserts the figure. With the cursor on an existing image it adds
  the caption and identifier instead. **Insert → Table Caption…** does the same for the table at
  the cursor (blank line, then the `: Caption {#tbl-…}` line).
- Identifiers start with `fig-`, `tbl-` or `sec-`, then letters, digits, `-` and `_`.
- **Insert → Cross-reference…** (Ctrl+Shift+R) lists the labels with their current numbers.
  Typing `@` also suggests labels and source keys.
- Numbers follow the order of the document. Move a section, add a figure or reorder chapters and
  every caption and reference renumbers; the Markdown never contains a number you typed.
- Add `.full-width` to the attributes (`{#fig-map .full-width}`) to let a figure or table span both
  columns of a two-column document.
- A figure must be alone in its paragraph. Captions may contain inline Markdown.
- The language sets the words: "Figure/Table/Section", "Figuur/Tabel/Paragraaf", "Abbildung/…".
- **Problems are shown, not hidden.** A reference to something that does not exist is rendered
  as `?@fig-nope` in red in the preview and exports and is listed in Problems; a duplicate
  identifier is reported (references go to the first one); a figure or table identifier with the
  wrong prefix is reported.
- Equations are **not** numbered automatically (use `\tag{…}`, see the
  [mathematics guide](MATHEMATICS.md)). Footnotes are not supported.

## Table of contents and lists

- Turn on **Automatic table of contents** in Document Settings (or put `[TOC]` alone on a line to
  choose the position). It is generated from the headings when the document is rendered, so it is
  always current in the preview, the PDF and the HTML export. Links work; page numbers are not
  printed (Chromium's printing cannot compute them).
- `[LOF]` and `[LOT]` insert a list of figures and a list of tables.
- Switch on **Number sections** for 1, 1.1, 1.2 …; `{.unnumbered}` on a heading skips it. A single
  leading `#` title is not numbered; the sections below it start at 1.
- The older **Insert → Table of Contents** (a list written into the document between markers)
  still works and is unrelated; use whichever you prefer, not both.

## Sources, citations and the reference list

**Publish → Manage Sources…** is the source manager: add, edit, delete and import sources
(BibTeX/BibLaTeX or CSL JSON files). Each source has a key (`smith2020`) and the usual fields.

- Sources are stored as **CSL JSON** in the project library, or in the document's own front matter
  (`references:`); the manager asks where when you add one. A document can cite both.
- Only what you type is stored. A source without an author or year stays without one; the form
  lists what APA expects but is missing, and the output shows the gap exactly as APA does
  (title first, "n.d."). Nothing is looked up or filled in.
- **Insert → Citation…** (Ctrl+Shift+C) picks one or more sources, optionally a page, and writes
  Pandoc syntax:

| Syntax                  | Result (APA)                             |
| ----------------------- | ---------------------------------------- |
| `[@smith2020]`          | (Smith & Lee, 2020)                      |
| `[@smith2020, p. 33]`   | (Smith & Lee, 2020, p. 33)               |
| `[see @a; @b, chap. 2]` | (see Author, 2019; Other, 2020, chap. 2) |
| `[-@smith2020]`         | (2020)                                   |
| `@smith2020`            | Smith and Lee (2020) — narrative         |

- The reference list is added at the end under "References" when there are citations, or where
  you put `::: {#refs}` followed by `:::` (**Insert → Bibliography Here**).
- Same author and year are disambiguated (2020a, 2020b) across the whole document or publication.
- **Style: APA Style 7th edition** (the CSL style `apa`, with the CSL locales for English, Dutch,
  German, French and Spanish), formatted by citeproc-js. Other styles are not offered yet.
- An unknown key is shown as `(key?)` in red and listed in Problems; unused sources are simply not
  listed.

## Columns and page layout

- **Columns** in Document Settings sets one or two text columns for the **whole document**. Section
  by section column changes are not supported. The title (first heading), the table of contents,
  items marked `.full-width` and tables with five or more columns span both columns; everything
  else flows from the first column into the second and on to the next page.
- A heading directly above a full-width table or figure can end up at the bottom of the previous
  column; move the heading below the item or add a page break if that happens.
- **Page** sets size, orientation and margins; **Header/Footer** take text with `{title}`, `{file}`,
  `{date}`, `{page}` and `{pages}` (the footer menu has ready-made page-number styles).
- Leave a field on "Use the export preset" to keep the preset's value.
- `<!-- pagebreak -->` still starts a new page.

## Templates

**File → New File from Template** (Ctrl+Shift+N) includes, next to the existing templates:

- **Research report** and **Onderzoeksverslag (Nederlands)**: summary, introduction, research
  question, method, findings with a table caption, discussion, conclusion, reference list, appendix.
- **Health UI research (Playful Tech)**: research question, scope and method, a repeatable
  per-game analysis (health UI elements table, screenshots, notes), a comparison table, conclusions
  and design principles, a **design ideas** table with a column for links to Figma, sources,
  and an appendix with a screenshot log.
- **Two-column article**: a layout with columns, margins and a page-number footer already set.

The templates contain instructions and empty tables only: no findings, games, sources or links are
invented. Save your own variations with the template manager.

## Publications: several chapters, one document

Open the **Publication** panel (book icon, Ctrl+Shift+J) in a project folder.

1. **Create Publication**, then **Add chapters…** and tick the Markdown files. Drag chapters or
   use the arrows to change the order; the order is stored in `publication.json`.
2. Fill in title, subtitle, author, date and language, and choose the structure: title block,
   table of contents, numbering of chapters and sections, figures numbered per chapter
   ("Figure 2.1") or continuously, new page per chapter. **Page, columns and theme** sets the
   layout of the whole publication.
3. **Preview publication** shows all chapters combined in the HTML and PDF preview;
   **Export…** opens the normal Export dialog for the combined document.

How the chapters are combined:

- Each chapter is rendered on its own, so **images resolve from the chapter's own folder**, and
  the combined output is checked to have unique anchors (headings get a per-chapter prefix; labels
  you write with `{#…}` keep their name and must be unique across chapters).
- Numbers run across chapters: chapter 1, 2, 3; sections 2.1, 2.2; Figure 2.1; Table 3.2.
  `@fig-…` and `@sec-…` work between chapters; duplicates and missing targets are listed, with the
  chapter file, in the panel and as markers in the editor.
- One table of contents, one citation numbering and one reference list for the whole publication
  (sources of the project library plus every chapter's own `references:`).
- The chapters stay ordinary documents: click a chapter to open it, edit it and cite or caption as
  usual. Unsaved edits in open tabs are used in the preview and the export.
- Renaming or moving a chapter in the Explorer updates the chapter list; a chapter whose file is
  missing is shown as a visible placeholder and a problem, not as a failed build.
- A chapter's own `studio:` settings (columns, page, theme) are ignored inside a publication; the
  publication's settings apply. Front matter is never printed.

## Writing safely

- **Unsaved text survives crashes.** A copy of every unsaved document is kept in the application's
  data folder; after a crash or a killed process the next start offers to restore it.
- **Open documents come back** after restarting (files that still exist and are inside the folder).
- **Files changed by another program** are never overwritten silently: a saved document that has
  not been edited follows the file; one with unsaved edits asks whether to Save As, Overwrite or
  Reload when you save. Failed saves keep the text open and mark the tab.
- Files are written next to the original and renamed into place, so a crash cannot leave a half
  written document.
- **Pasting an image** (Ctrl+V: a screenshot, a picture copied from a program or web page, or
  copied image files) stores it in the asset folder and inserts a relative reference with the
  alt text selected. Pasting text always pastes text.
- **Save As** into another folder offers to update the relative links and images so they keep
  pointing at the same files. Moving or renaming through the Explorer already updates references.
- A missing image shows "image not found" with its path in the preview and the PDF/HTML export
  (and the export reports it).

## Keyboard

| Action                          | Shortcut     |
| ------------------------------- | ------------ |
| Document settings               | Ctrl+Shift+D |
| Insert figure with caption      | Ctrl+Shift+F |
| Insert cross-reference          | Ctrl+Shift+R |
| Insert citation                 | Ctrl+Shift+C |
| Publication panel               | Ctrl+Shift+J |
| Insert table (grid editor)      | Ctrl+Shift+T |
| Command palette (every command) | Ctrl+Shift+P |

On macOS use Cmd instead of Ctrl. Every command is also in the **Insert** and **Publish** menus and
the command palette; **Help → Keyboard Shortcuts** lists them all.

## Limits

- Two columns (and one column) apply to a whole document or publication, not to sections.
- No page numbers in the table of contents, no footnotes, no automatic equation numbering, no
  bibliography styles other than APA 7, no EPUB output.
- `@key [p. 3]` (a locator after a narrative citation) is not supported; use `[@key, p. 3]`.
- PDF pagination comes from Chromium's print engine and may differ slightly between computers
  with different fonts.

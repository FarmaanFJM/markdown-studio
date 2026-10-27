# Tables and Quick Fixes

How to write Markdown tables, keep their source readable, repair broken ones, and use the editor's Quick Fixes.
The rendered table (preview, PDF, HTML) and the table _source_ are separate: formatting changes only spaces and
the dashes of the delimiter row in the source, never what the table shows.

## Writing a table

A table is lines of cells separated by pipes `|`. The second line, made of dashes, separates the header from
the body:

```markdown
| Game                | Type health-weergave | Toegankelijkheid |
| :------------------ | :------------------- | ---------------: |
| The Legend of Zelda | Hartjes              |             Goed |
| Hades               | Balk onder de held   |        Zeer goed |
```

- **Delimiter row.** `---` is the default alignment, `:---` aligns left, `:---:` centres, `---:` aligns right.
  Every column needs one delimiter cell, and the delimiter row must have as many cells as the header.
- **Escaped pipes.** A pipe inside a cell is written `\|`.
- **One line per row.** A cell cannot contain a line break; `<br>` gives one in the output.
- **Missing cells** at the end of a row are shown as empty.
- Outer pipes are optional but make tables easier to read. This is GitHub Flavored Markdown: no merged cells.

Create one with **Insert Table…** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>): you choose the size and fill
a grid. **Edit Table Visually…** (<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>) opens the table under the cursor in
that grid; _Apply_ replaces the table in one undoable edit.

## Format Table

Put the cursor in the table and press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> (**Table → Format Table**,
the right-click menu, or the palette; search "reformat"). Columns are padded so the pipes line up, alignment
markers are kept, and cell text is untouched — including escaped pipes, inline Markdown and empty cells. Wide
characters (CJK, emoji) are measured by display width. Formatting is explicit: it never runs when you open or
close the preview or while you type, and a table that is already formatted is left alone (formatting twice
changes nothing). One undo restores the text exactly. _Format Tables in Selection_ and _Format All Tables_ do
the same for several tables; tables in code blocks are skipped.

### Table source width

Aligning every column to its longest cell can make very long lines. **Settings → Markdown → Table source
width** (default **100** characters; `0` = always align fully) sets the target:

| The table…                      | Format Table…                                                                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fits in the width               | aligns every column.                                                                                                                                                                            |
| is wider                        | _balances_ it: the widest columns are narrowed to a shared width so short cells still line up, and a cell longer than its column simply runs past it. The table stays valid and shows the same. |
| has too many columns to balance | writes it compactly, one space around each cell, no padding.                                                                                                                                    |

The width is a target for readability, not a rule that changes content: cells are never wrapped, split or
shortened, because a Markdown cell cannot hold line breaks without changing the table.

### Wide tables and the editor

Source lines can still be wider than the editor — especially with the preview open beside it. Markdown Studio
does not rewrite the document for you when the window changes. Instead:

- After you format a table that is wider than the editor, a notice says so and, when word wrap is on, offers
  **Turn off word wrap** (<kbd>Alt</kbd>+<kbd>Z</kbd> toggles it). With wrap off the editor scrolls sideways and the
  aligned columns stay readable; with wrap on, long rows wrap and the alignment breaks visually (the table is still
  correct).
- **Fit Table to Editor Width** (palette, right-click menu in a table) formats the table for the editor as it
  is right now. Run it again after you resize or open the preview if you want to re-fit.
- A very wide comparison table (for example five columns of full sentences) is easier to edit in the visual table
  editor.

In the **PDF**, tables are laid out by the page, not by the source: wide tables shrink to the printable width
(many columns can break long words), header rows repeat on each page and small tables are kept whole. See
[PUBLISHING.md](PUBLISHING.md#pdf-export).

## Repairing a table

The checker marks tables that do not render as written:

| Problem                                              | Why                                 | Fix                                                                  |
| ---------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------- |
| The header has 3 columns but the delimiter row has 2 | The renderer shows it as plain text | **Repair Table** / Quick Fix _Repair table: add the missing columns_ |
| A row has more cells than the header                 | The extra cells are not displayed   | Repair adds columns so nothing is lost                               |
| Fewer cells in a row                                 | Fine — shown empty                  | _Format Table_ completes the row                                     |

**Repair Table** uses as many columns as the widest row, adds empty header cells and delimiter cells, and keeps
every cell. **Format Table** itself refuses to drop cells and tells you to repair instead.

## Quick Fixes

A Quick Fix is a correction the editor offers for a marked problem. Press <kbd>Ctrl</kbd>+<kbd>.</kbd>
(<kbd>Cmd</kbd>+<kbd>.</kbd> on macOS) with the cursor on it, click the lightbulb, or choose **Quick Fix…** in the
right-click menu or palette. Nothing changes until you pick one, and each is one undo step.

| Problem (source)                                                                                                 | Quick Fix                                |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Repeated spaces between words (a faint hint)                                                                     | Remove extra spaces                      |
| Trailing spaces, several blank lines, missing blank lines around headings, lists, tables and code (markdownlint) | The rule's own fix                       |
| `#Title` or `##  Title`                                                                                          | Add or normalise the space after `#`     |
| Inconsistent bullet marker, list spacing or numbering                                                            | Normalise the list                       |
| Spaces inside `** bold **`, `[ link ]` or code                                                                   | Remove them                              |
| A skipped heading level (`#` then `###`)                                                                         | Change the heading to the expected level |
| Mismatched table columns                                                                                         | Repair table                             |
| A link to a moved file, an anchor with one obvious spelling                                                      | Update the link                          |

On a block with something to tidy, **Format Markdown Block** (right-click menu, palette, and the lightbulb) formats
the block under the cursor: a table, a heading, a list (one marker style, one space, renumbered) or a paragraph
(repeated spaces removed; a deliberate two-space line break is kept). **Remove Extra Spaces** does the same for repeated
spaces in the selection, or the whole document. **Fix All Automatic Style Problems** applies all of markdownlint's own fixes at
once. Suggestions are deterministic and appear only where there is something to fix; style notes can be turned
off in **Settings → Markdown → Problems**.

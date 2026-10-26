# Getting started

This guide takes you from an empty folder to a finished PDF. It assumes you have never used Markdown
Studio — or Markdown — before. Everything here describes what the application does today.

Markdown Studio is a desktop editor for Markdown documents: plain text files (`.md`) in which you mark
headings, lists, tables and images with a few simple symbols. You always edit that text; the preview next
to the editor shows how it will look, and **Export** turns it into a PDF or a web page.

## 1. Open or create a project folder

A _project_ is just a folder on your computer. Markdown Studio shows its files in the **Explorer** on the
left.

1. Choose **File → Open Folder…** (or **Open Folder** on the welcome screen) and pick a folder — for
   example `Onderzoek Health UI`. Create the folder first in your file manager if it does not exist.
2. The folder is remembered and reopened the next time you start the application.

Starting a new school project? **File → New File from Template…** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd>)
offers a research report, a Dutch _onderzoeksverslag_, a Health UI research template and a two-column
article, filled in with the title and author you type. Templates are optional.

## 2. Create a Markdown document

- In the Explorer, use the **New Markdown File** button (or <kbd>Ctrl</kbd>+<kbd>N</kbd>) and give it a name
  ending in `.md`, such as `verslag.md`.
- It opens in a tab. The editor is on the left, the live preview on the right.
- Save with <kbd>Ctrl</kbd>+<kbd>S</kbd>. Until you save, the tab shows a dot; unsaved text is also kept
  safe for crash recovery.

## 3. Organise documents into folders

Create folders with **New Folder** in the Explorer, then drag files onto them or use **Move…** from the
right-click menu. Renaming or moving a file offers to update every link and image reference that points to
it, so your documents keep working. The Explorer can show a tree (**list**) or a grid of image
**thumbnails**; switching between them keeps you in the folder you were in.

## 4. Write headings, paragraphs and lists

```markdown
# Onderzoek naar Health UI in games

## 1. Inleiding

Dit onderzoek gaat over de weergave van gezondheid in games.

- een opsomming
- met meerdere punten

1. een genummerde lijst
2. met stappen
```

Type it directly, or use the toolbar above the editor, the **Format** menu, or shortcuts such as
<kbd>Ctrl</kbd>+<kbd>B</kbd> (bold) and <kbd>Ctrl</kbd>+<kbd>I</kbd> (italic). Select a word and press
<kbd>Ctrl</kbd>+<kbd>B</kbd>: `important` becomes `**important**`; press it again to remove the bold.
<kbd>Enter</kbd> continues a list. All shortcuts are in [KEYBOARD_SHORTCUTS.md](KEYBOARD_SHORTCUTS.md); the
Markdown syntax itself is explained in the [authoring guide](AUTHORING.md#markdown-syntax).

## 5. Insert screenshots and images

Drag an image from the Explorer or from your file manager into the text, or paste a screenshot
(<kbd>Ctrl</kbd>+<kbd>V</kbd>). Markdown Studio writes the image line for you — `![Health UI screenshot](assets/health-ui.png)` —
on its own line below the text it was dropped on, and copies files that came from outside the project into
the project's `assets` folder. See [IMAGES_AND_ASSETS.md](IMAGES_AND_ASSETS.md).

## 6. Create and format tables

Insert a table with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd> (a grid where you choose the size) and
fill it in, or type one by hand. Put the cursor in a table and press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>
(**Format Table**) to line up the columns. See [TABLES_AND_QUICK_FIXES.md](TABLES_AND_QUICK_FIXES.md).

## 7. Use Quick Fixes

Faint underlines mark problems such as repeated spaces, a skipped heading level, a missing link target or a
table that will not render as a table. Put the cursor there and press <kbd>Ctrl</kbd>+<kbd>.</kbd> (or click
the lightbulb) to see the fixes. _Format Markdown Block_ and _Fix All Automatic Style Problems_ are in the
right-click menu and the command palette. Nothing changes until you pick a fix.

## 8. Open the HTML or PDF preview

The **HTML** and **PDF** buttons above the editor open the preview next to the source. HTML is instant and
follows every keystroke; PDF shows the real printed pages with page size, margins and numbering. The ✕ in
the preview header closes it, and <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> toggles it.

## 9. Choose a document appearance

The preview header shows the current appearance (for example **Minimal**). Click it, or open **Settings →
Appearance → Document appearance**, and choose **Minimal**, **Technical**, **Editorial** or **Professional
Report**. Professional Report numbers your sections automatically (1., 1.1, …) — and leaves numbers you typed
yourself alone. The appearance never changes your Markdown. See [PUBLISHING.md](PUBLISHING.md).

## 10. Adjust export settings

Open **File → Export…** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>U</kbd>) to set page size, orientation,
margins, headers and footers (for example `Page {page} of {pages}`). The dialog shows a live preview of the
PDF. Defaults live in **Settings → PDF / Export**, and **presets** let you save combinations such as
your own (for example one for school reports).

## 11. Export a finished PDF

Choose **PDF**, press **Export**, and pick where to save it. Images, tables, equations and diagrams are
included. Export never alters an existing file unless you confirm, and a failed export leaves the old file as
it was.

## 12. Reopen and continue editing

Close the application whenever you like. The next start reopens the folder and the documents that were open;
the Markdown files are ordinary files you can also keep in OneDrive, Git or a USB stick. To continue an older
project later, **File → Open Folder…** or **Open Recent Folder**.

## Where to go next

| I want to…                                 | Read                                                   |
| ------------------------------------------ | ------------------------------------------------------ |
| Learn the Markdown syntax                  | [AUTHORING.md](AUTHORING.md)                           |
| Fix or format tables                       | [TABLES_AND_QUICK_FIXES.md](TABLES_AND_QUICK_FIXES.md) |
| Work with images                           | [IMAGES_AND_ASSETS.md](IMAGES_AND_ASSETS.md)           |
| Change how a document looks or exports     | [PUBLISHING.md](PUBLISHING.md)                         |
| Add captions, citations and a bibliography | [PUBLICATIONS.md](PUBLICATIONS.md)                     |
| Use AI help (optional)                     | [AI.md](AI.md)                                         |
| Look up a shortcut                         | [KEYBOARD_SHORTCUTS.md](KEYBOARD_SHORTCUTS.md)         |

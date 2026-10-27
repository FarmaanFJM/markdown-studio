# Keyboard shortcuts

Markdown Studio uses the standard Markdown editing shortcuts: <kbd>Ctrl</kbd>+<kbd>B</kbd> makes text bold
and <kbd>Ctrl</kbd>+<kbd>I</kbd> italic, as in most Markdown and word-processing tools. On macOS use
<kbd>Cmd</kbd> wherever this page says <kbd>Ctrl</kbd>. The same list is shown in the application under
_Help → Keyboard Shortcuts_, and the menus display the same keys.

This page is checked against the application's single shortcut definition
(`src/shared/shortcuts.ts`) by a unit test, so it cannot silently drift from what the application does.

## How shortcuts are handled

- **Formatting and insert shortcuts only act while the source editor has the keyboard focus.** In the
  Settings search box, a rename field or a dialog, <kbd>Ctrl</kbd>+<kbd>B</kbd> and the other formatting keys
  do nothing, and the field keeps its own editing keys.
- **Markdown keys win over application commands.** The sidebar toggle used to be <kbd>Ctrl</kbd>+<kbd>B</kbd>
  and bold <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>; they were swapped to the standard mapping. Showing
  or hiding the preview is <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd>, never a formatting key.
- Shortcuts that Monaco (the editor component) provides itself — undo, redo, find, multi-cursor, line moves —
  keep their usual meaning. Where Monaco has its own binding for a key Markdown Studio also uses (for example
  <kbd>Ctrl</kbd>+<kbd>I</kbd>, which Monaco would use for suggestions, or the <kbd>Ctrl</kbd>+<kbd>K</kbd> chords),
  Markdown Studio's meaning applies; use <kbd>Ctrl</kbd>+<kbd>Space</kbd> for suggestions.
- Every command is also in the command palette (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>) and the menus,
  so nothing depends on remembering a key.
- Deliberately not bound: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd> stays the developer-tools key, and the
  operating system's own shortcuts (for example <kbd>Alt</kbd>+<kbd>F4</kbd>, <kbd>Cmd</kbd>+<kbd>Q</kbd>) are
  never overridden.

## Reference

### Formatting

| Action                 | Windows / Linux | macOS         |
| ---------------------- | --------------- | ------------- |
| Bold                   | `Ctrl+B`        | `Cmd+B`       |
| Italic                 | `Ctrl+I`        | `Cmd+I`       |
| Strikethrough          | `Ctrl+Shift+X`  | `Cmd+Shift+X` |
| Inline code            | `Ctrl+E`        | `Cmd+E`       |
| Insert or edit link    | `Ctrl+K`        | `Cmd+K`       |
| Numbered list          | `Ctrl+Shift+7`  | `Cmd+Shift+7` |
| Bulleted list          | `Ctrl+Shift+8`  | `Cmd+Shift+8` |
| Blockquote             | `Ctrl+Shift+9`  | `Cmd+Shift+9` |
| Task list              | `Ctrl+Shift+0`  | `Cmd+Shift+0` |
| Increase heading level | `Ctrl+Shift+]`  | `Cmd+Shift+]` |
| Decrease heading level | `Ctrl+Shift+[`  | `Cmd+Shift+[` |

### Insert

| Action                     | Windows / Linux | macOS            |
| -------------------------- | --------------- | ---------------- |
| Insert image               | `Ctrl+Shift+G`  | `Cmd+Shift+G`    |
| Insert code block          | `Ctrl+Shift+M`  | `Cmd+Shift+M`    |
| Insert figure with caption | `Ctrl+Shift+F`  | `Cmd+Shift+F`    |
| Insert cross-reference     | `Ctrl+Shift+R`  | `Cmd+Shift+R`    |
| Insert citation            | `Ctrl+Shift+C`  | `Cmd+Shift+C`    |
| Insert table               | `Ctrl+Shift+T`  | `Cmd+Shift+T`    |
| Format table               | `Shift+Alt+F`   | `Shift+Option+F` |
| Edit table visually        | `Shift+Alt+T`   | `Shift+Option+T` |

### Editing

| Action                                                      | Windows / Linux                 | macOS                                 |
| ----------------------------------------------------------- | ------------------------------- | ------------------------------------- |
| Undo                                                        | `Ctrl+Z`                        | `Cmd+Z`                               |
| Redo                                                        | `Ctrl+Y / Ctrl+Shift+Z`         | `Cmd+Shift+Z`                         |
| Select all                                                  | `Ctrl+A`                        | `Cmd+A`                               |
| Find                                                        | `Ctrl+F`                        | `Cmd+F`                               |
| Replace                                                     | `Ctrl+H`                        | `Cmd+Option+F`                        |
| Toggle line comment                                         | `Ctrl+/`                        | `Cmd+/`                               |
| Move line up / down                                         | `Alt+Up / Alt+Down`             | `Option+Up / Option+Down`             |
| Copy line up / down                                         | `Shift+Alt+Up / Shift+Alt+Down` | `Shift+Option+Up / Shift+Option+Down` |
| Add selection to next match                                 | `Ctrl+D`                        | `Cmd+D`                               |
| Indent / outdent; nest list items; move between table cells | `Tab / Shift+Tab`               | same                                  |
| Continue a list or quote; Enter on an empty item ends it    | `Enter`                         | same                                  |
| Show Markdown suggestions                                   | `Ctrl+Space`                    | `Ctrl+Space`                          |
| Quick Fix                                                   | `Ctrl+.`                        | `Cmd+.`                               |
| Slash commands                                              | / on an empty line              | same                                  |
| Next / previous problem                                     | `F8 / Shift+F8`                 | same                                  |

### Navigation

| Action          | Windows / Linux                | macOS                        |
| --------------- | ------------------------------ | ---------------------------- |
| Command palette | `Ctrl+Shift+P`                 | `Cmd+Shift+P`                |
| Go to heading   | `Ctrl+Shift+O`                 | `Cmd+Shift+O`                |
| Next tab        | `Ctrl+Tab / Ctrl+PageDown`     | `Cmd+Tab / Cmd+PageDown`     |
| Previous tab    | `Ctrl+Shift+Tab / Ctrl+PageUp` | `Cmd+Shift+Tab / Cmd+PageUp` |

### Preview

| Action                   | Windows / Linux | macOS         |
| ------------------------ | --------------- | ------------- |
| Show or hide the preview | `Ctrl+Shift+V`  | `Cmd+Shift+V` |

### Files

| Action                 | Windows / Linux | macOS         |
| ---------------------- | --------------- | ------------- |
| New Markdown file      | `Ctrl+N`        | `Cmd+N`       |
| New file from template | `Ctrl+Shift+N`  | `Cmd+Shift+N` |
| Open file              | `Ctrl+O`        | `Cmd+O`       |
| Save                   | `Ctrl+S`        | `Cmd+S`       |
| Save as                | `Ctrl+Shift+S`  | `Cmd+Shift+S` |
| Close editor tab       | `Ctrl+W`        | `Cmd+W`       |
| Export…                | `Ctrl+Shift+U`  | `Cmd+Shift+U` |

### Application

| Action                    | Windows / Linux | macOS         |
| ------------------------- | --------------- | ------------- |
| Show or hide the sidebar  | `Ctrl+\`        | `Cmd+\`       |
| Show Explorer             | `Ctrl+Shift+E`  | `Cmd+Shift+E` |
| Settings                  | `Ctrl+,`        | `Cmd+,`       |
| Publication panel         | `Ctrl+Shift+J`  | `Cmd+Shift+J` |
| Document settings         | `Ctrl+Shift+D`  | `Cmd+Shift+D` |
| Toggle word wrap          | `Alt+Z`         | `Option+Z`    |
| Increase editor font size | `Ctrl+=`        | `Cmd+=`       |
| Decrease editor font size | `Ctrl+-`        | `Cmd+-`       |
| Reset editor font size    | `Ctrl+0`        | `Cmd+0`       |

## What formatting does

| Shortcut                                    | Nothing selected                                                                              | Selected text                                                                                            | Pressed again                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Bold / Italic / Strikethrough / Inline code | An empty marker pair with the cursor between its halves; inside a word, the word is formatted | The selection is wrapped (`This is **important** text.`); each line of a multi-line selection separately | The markers are removed          |
| Numbered / Bulleted / Task list, Blockquote | The current line                                                                              | Every non-blank selected line                                                                            | The line goes back to plain text |
| Insert or edit link                         | `[link text](url)` with the text selected                                                     | `[selection](url)`                                                                                       | —                                |

Every action is a single undo step, and the selection is kept, so the same key undoes the formatting.
Bold and italic combine without malformed nesting (`***text***`; removing one leaves the other). Details
are in the [authoring guide](AUTHORING.md#formatting).

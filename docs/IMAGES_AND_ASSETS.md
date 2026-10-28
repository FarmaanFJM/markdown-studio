# Images and project assets

How pictures get into a Markdown Studio document, where the files live, and what ends up in the preview
and in exported files. Supported formats: PNG, JPEG, GIF, WebP, SVG, BMP and AVIF.

## Putting an image in a document

| You do this                                                                                                           | What happens                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drag a file from the Explorer (tree or thumbnails) into the editor                                                    | The image is referenced where it is — nothing is copied.                                                                                                                                                                                                                                 |
| Drag a file from Windows Explorer / Finder / your file manager                                                        | The file is copied into the project's asset folder (default `assets`, changed in **Settings → Files & Assets**) and referenced there. A file with the same name but different content is never overwritten: it gets `-1`, `-2`, … after its name. The same file dropped twice is reused. |
| Paste a screenshot or copied picture (<kbd>Ctrl</kbd>+<kbd>V</kbd>)                                                   | It is saved in the asset folder as `pasted-image-<date>-<time>.png` (or its own format) and referenced. If the clipboard also holds text, the text is pasted instead.                                                                                                                    |
| **Insert → Image…** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>) or **Insert Image into Document** in the Explorer | Inserts `![alt text](path)` with the placeholder selected.                                                                                                                                                                                                                               |

The generated Markdown is standard:

```markdown
![Health UI screenshot](assets/health-ui.png)
```

The alt text is made from the file name (`health-ui.png` → "Health ui") and is selected after the drop so you
can type a better description straight away. File names with spaces or parentheses are written in angle
brackets — `![Team photo](<assets/Team Photo (2024).png>)` — which every Markdown renderer understands.

## Importing files and folders from your computer

Drag files **or whole folders** from Windows File Explorer (Finder, a file manager) onto the **Explorer
panel** and they are copied into the project, so moving or deleting the originals never breaks it.

| You drop…                                  | Onto…                                                                                                       | Result                                                                                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A folder (e.g. `Arcanox Health UI System`) | A folder row → that folder; empty space or a file → the project root (a file row means the folder it is in) | The whole folder is copied recursively: name, nested folders, file names and file contents are preserved byte for byte. The new folder is expanded and selected. |
| One or more files                          | The same targets                                                                                            | The files are copied into the target folder.                                                                                                                     |
| A `.md` file                               | The Explorer, the tab strip or the editor                                                                   | Imported as a project document. On the tab strip or in the editor it is also **opened** (its text is never pasted into another document).                        |
| An image                                   | The editor                                                                                                  | Unchanged: copied to the asset folder and referenced at the drop point (see above).                                                                              |

While dragging, the cursor shows "copy" over valid targets; the destination — the folder row, or the whole
Explorer for the project root — is outlined. Areas that cannot take a drop (status bar, preview…) refuse it.

- **Nothing is overwritten and nothing is merged.** If the name is taken, the copy becomes `name-1`,
  `name-2`, … (`Arcanox Health UI System-1`, `photo-1.png`) and the notice says so.
- Shortcuts and symbolic links are skipped (and listed), never followed. Limits per drop: 5000 files, 1 GB, 200 MB
  per file. A drop is measured before anything is copied, and a copy that fails half-way is removed again.
- Files are only written inside the open project folder; a folder cannot be dropped into itself.
- Implementation: `ImportService` (main process, `assets:import-external`) copies; the renderer only passes the
  paths Electron's `webUtils.getPathForFile` reports for the dropped files. No renderer privileges were added.

### What is automated and what is not

`tests/unit/importService.test.ts` covers the copy logic (files, several files, folders, nesting, names with
spaces and parentheses, duplicates, images, Markdown, links, limits, access control, rollback).
`tests/e2e/external-drop.spec.ts` drives the real Electron app with Chromium's native drag-and-drop pipeline
(`Input.dispatchDragEvent` with real paths, folders included) and checks highlighting, the accepted/refused drop
effect, the import, the refreshed Explorer and persistence after a restart.

**That is not Windows File Explorer.** No CI runner can operate the Windows shell's own drag source, so the OLE
drop target, the Windows cursor and the delivery of a dragged folder as a path are only verified by hand.
Manual Windows acceptance check:

1. Open a Markdown Studio project, then open Windows File Explorer.
2. Take a folder with several PNG files and drag it onto the Markdown Studio Explorer. The cursor must show the
   copy/"allowed" state over the project root and over a folder row (not the prohibited sign), with the target
   outlined.
3. Drop it. The whole folder appears with its files beneath it; open or insert one of the images.
4. Save, close Markdown Studio, reopen the project: the folder and files are still there and work.
5. Also drag a single file onto the Explorer, and an image straight into a Markdown document.

## Where the image goes in the text

An image dropped on a line that already has text is placed **below it as its own block**, separated by a blank
line, because Markdown would otherwise treat it as part of the same paragraph:

```markdown
This paragraph describes the health UI.

![Health UI screenshot](assets/health-ui.png)
```

The minimum spacing is added and no more:

- On an **empty line** the image goes exactly there. A blank line is added above only if the line above has
  text, and below only if the line below has.
- After a **heading**, a blank line separates it from the image (the style checker asks for that too).
- Inside a **list item** the image goes under the item, indented to its text, so it stays part of the item:

  ```markdown
  - first point

    ![Screenshot](assets/shot.png)

  - second point
  ```

- Inside a **blockquote** the quote continues around the image (`>` lines).
- Below an **existing image** it becomes another block. Several images dropped together become separate
  blocks, one after another.

The text you dropped on is never changed, and the drop is one undo step.

## Paths

References are always **relative to the document**, with forward slashes (`../assets/photo.png`), so the
project keeps working when the folder moves or is opened on another computer.

- A document that is **not saved yet** has no folder; images are referenced relative to the project folder, and
  **Save As** offers to update the paths for the new location.
- An image outside the project (and outside the folder of a file you opened) is not displayed — by design,
  because the application only reads files it was given access to. Put it in the project.
- On a different drive than the document there is no relative path; you are told instead of getting a wrong one.

## If files move

Rename or move an image or a Markdown file **in the Explorer** and Markdown Studio finds the references with
the Markdown parser, shows which documents are affected and offers to update them. Moving a document
recalculates its own relative image paths. Changes made outside the application (in your file manager), deletions and
_Save As_ do not update other documents automatically; the editor then reports the image as missing so you can
fix it, and the style checker offers a fix when a file with the same name exists elsewhere in the project.
Nothing is relocated behind your back.

## In the preview and in exports

- The **HTML preview** and **PDF** show the images; a missing file is reported in the preview and in the
  export notice.
- **PDF** includes the pictures (scaled to the printable area, not split across pages).
- **Standalone HTML** embeds local images into the file by default (**Settings → PDF / Export → HTML export**), so
  it works anywhere offline. Remote `https://` images stay links.
- Thumbnails in the Explorer are only a browsing aid; they do not affect the document.

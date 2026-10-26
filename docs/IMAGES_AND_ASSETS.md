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

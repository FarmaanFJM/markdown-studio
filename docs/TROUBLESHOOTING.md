# Troubleshooting

Short answers for everyday problems. For installation and first steps see [Getting started](GETTING_STARTED.md);
all shortcuts are in the [keyboard reference](KEYBOARD_SHORTCUTS.md).

## Windows shows "Windows protected your PC" when I run the installer

The installer is not code-signed yet. Choose **More info → Run anyway**. Only do this for an installer you
downloaded from this project's releases or CI artifacts.

## An image shows as a missing-image box

- Images are ordinary files referenced by a relative path, for example `![Chart](../assets/chart.png)`. If you
  move or rename a document or image **in the Explorer** (right-click → _Move…_ or _Rename…_), Markdown Studio
  updates the references. Moving files outside the application cannot update them; the editor marks references that
  no longer resolve, and Quick Fixes (`Ctrl+.`) can repair a moved file.
- Pasted screenshots and dropped images are copied into the project's `assets` folder. Copy the whole project
  folder (not just the `.md` file) when you move your work to another computer.

## A moved document is not visible in the Explorer

After _Move…_ the destination folder is expanded and the document selected. If you still cannot see it, use
_Refresh_ from the Explorer's right-click menu.

## "The file changed on disk" when saving

Another program (a sync client, another editor) changed the file after you opened it. Choose _Save As_ to keep
both versions, _Overwrite_ to keep yours, or _Reload_ to take theirs. Nothing is overwritten silently.

## The application closed unexpectedly

Unsaved text is recovered the next time you open the folder. A failed save keeps your text in the editor and marks
the tab; fix the cause (read-only folder, full disk) and save again.

## My table looks wrong in the PDF

Use the preview as the guide: the PDF uses the same rendering. Wide tables are scaled to fit the page and long
words are broken. Use _Format Table_ / _Edit Table Visually…_ (command palette, `Ctrl+Shift+P`) instead of editing
the pipes by hand, and consider fewer columns or landscape orientation in Page Setup for very wide tables.

## AI features

- Everything except AI works with AI switched off (Settings → AI). Nothing is sent anywhere unless a provider is
  enabled and you use an AI feature.
- **Copilot cannot sign in:** check your network and that your GitHub account has Copilot access; see
  [AI](AI.md). Signing out deletes the stored session.
- **OpenAI-compatible provider errors:** verify the endpoint URL, model name and key in Settings → AI.

## Reporting a problem

Open an issue on GitHub with the version (the About dialog), your operating system, and a minimal document that shows
the problem. Do not attach private documents or keys.

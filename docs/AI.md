# AI assistance

AI help in Markdown Studio is **optional and off by default**. The editor, the preview and the exports never
depend on it. With AI off — the default — none of the AI code runs and no text leaves your computer.

## Status

**Implemented**

- An **AI Assistant** section in the left activity bar (sparkles icon): status, the two actions below,
  switches for the current folder and document, and the list of providers.
- **Settings → AI**: enable AI, choose the provider, service address, model, API key, and optional suggestions
  while typing.
- Two providers, one active at a time (Settings → AI → _Provider_):
  - **GitHub Copilot** — inline suggestions from your own Copilot subscription, through GitHub's official Copilot
    language server and GitHub's own sign-in. See [GitHub Copilot](#github-copilot).
  - **OpenAI-compatible endpoint** — any service that speaks the chat completions protocol (below).
- **AI: Continue Writing** — with Copilot this asks Copilot for an inline suggestion at the cursor; with an
  OpenAI-compatible provider, the next sentences, shown as grey ghost text at the cursor. <kbd>Tab</kbd> accepts,
  <kbd>Esc</kbd> dismisses; nothing changes until you accept.
- **AI: Rewrite Selection…** — presets (fix spelling and grammar, shorter, more formal, simpler) or your own
  instruction. The suggestion is shown next to your text for approval; accepting is one undo step, and it is
  refused if the document changed in the meantime.
- Optional **Suggest while typing** (ghost text after a pause at the end of a line). Off by default.
- Per-**folder** and per-**document** switches (remembered by path).

**Not implemented, or deferred**

- **Rewrite Selection with GitHub Copilot.** Copilot provides inline suggestions only; the action is disabled for
  that provider and says so. Use the OpenAI-compatible provider for rewrites.
- **Copilot Chat** (see [Copilot SDK and chat](#copilot-sdk-and-chat-not-implemented)).
- Streaming replies, an AI chat panel, and document-aware actions beyond the text around the cursor or selection
  (outline, citations, whole-document summaries).
- Other provider-specific integrations (an Anthropic or Gemini API, for example). Services that offer an
  OpenAI-compatible endpoint work today through the provider above.

## GitHub Copilot

Copilot suggestions in Markdown Studio come from **GitHub's official Copilot language server**
([`@github/copilot-language-server`](https://www.npmjs.com/package/@github/copilot-language-server), MIT licence,
published by GitHub for editor integrations). Markdown Studio starts it as a managed child process and talks to it over
the Language Server Protocol; it does not use any private GitHub endpoint and reads no token from other applications.

### Requirements

- A **GitHub account with Copilot access**: a Copilot subscription, GitHub Copilot Free, or a seat from an
  organisation. Copilot Free and paid plans have usage limits (such as monthly completion quotas) set by GitHub; when a
  limit is reached GitHub's message is shown in the account status. Markdown Studio does not count or enforce them.
- An **internet connection** while you want suggestions. Editing, saving, previewing and exporting never need it.

### Sign in and turn it on

1. Open **Settings → AI** and switch on **Enable AI assistance**.
2. Choose **Provider: GitHub Copilot**. No API key is asked for.
3. Press **Sign in with GitHub**. Markdown Studio shows a one-time code and opens GitHub's device-login page
   (`https://github.com/login/device`) in your browser. Enter the code there and authorise.
4. Back in Markdown Studio the status changes to **Connected** and shows your GitHub login.
5. Turn on **Automatic inline suggestions** if you want ghost text while you type. Without it you can still ask on
   demand with **AI: Continue Writing** (command palette, or _Continue writing_ in the AI Assistant panel).

Status you can see in Settings → AI: _Not signed in_, _Waiting for you to finish signing in_ (with the code and
**Cancel**), _Connected_ (with the account), _Signed in, but no Copilot access_ (the account has no Copilot plan),
_Unavailable_ (the language server was not found), _Error_ (with the reason), and a request to **sign in again** when a
previous sign-in expired or was revoked. A failed sign-in, a network problem or an expired code shows a message and
leaves the document untouched.

**Sign out** in the same place. Signing out asks the server to forget the session, stops the process, **deletes the
server's stored account folder (`copilot/config/github-copilot`) itself** whatever the server did, and starts a fresh
process, so neither the disk nor memory keeps anything of the previous account. This does not revoke the authorisation
on GitHub's side; to revoke it, remove the app under github.com/settings/applications. Switching AI off, or choosing another provider, stops the server.

### Using suggestions

- Suggestions appear as grey ghost text at the cursor and **never change the document until you accept**.
- <kbd>Tab</kbd> accepts, <kbd>Esc</kbd> dismisses. Accepting is one undo step. Partial acceptance (word by word) is
  Monaco's standard behaviour and is reported to Copilot as a partial acceptance.
- Only the suggestion for the current cursor position and document version is shown. Typing on, moving the cursor,
  switching documents or closing a document cancels the request and discards late answers. An empty answer shows
  nothing.
- **Keyboard precedence:** with a suggestion visible, <kbd>Tab</kbd> accepts it. Without one, <kbd>Tab</kbd> and
  <kbd>Shift</kbd>+<kbd>Tab</kbd> keep their Markdown behaviour (list indentation, table cells, snippets). Ctrl/Cmd+B,
  I, K, Ctrl+Space and the Markdown completion providers are unchanged; Copilot is an additional inline provider, not a
  replacement for them.
- **Settings → AI:** _Suggestion delay_ (how long to pause after typing before Copilot is asked; default 300 ms). The
  per-folder and per-document switches in the AI Assistant panel apply to Copilot exactly as to the other provider.

### What is shared, and with whom

Be clear about this before using it with school or personal documents:

- While Copilot is selected, AI is on and you are signed in, **the document in the editor is sent to the Copilot
  language server running on your computer** (open, edit and close notifications), so that it can build suggestions.
  Only that one document is shared, never other open documents, the folder, file names or paths (documents are named
  `untitled:markdown-studio-<id>.md` to the server). Documents in a folder or file switched off for AI are not shared.
- To produce a suggestion the language server **sends context to GitHub's Copilot service**. Which context that is
  (the text before and after the cursor, possibly more of the document) is decided by GitHub's server, not by Markdown
  Studio, and it can change between versions; Markdown Studio does not limit it and no fixed number of characters is
  promised. The OpenAI-compatible limits listed under [When text is sent](#when-text-is-sent) do **not** apply to
  Copilot.
- When a suggestion is shown, partly accepted or accepted, the editor tells the language server, as its protocol
  requires (including running the acceptance command it provided). GitHub's terms and its telemetry settings for
  Copilot apply; see [GitHub's Copilot terms](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features#github-copilot).
  Markdown Studio sets no telemetry preference of its own.
- Nothing is shared when AI is off, when you are signed out, when the provider is OpenAI-compatible, or for blocked
  documents. Markdown Studio does not need Copilot to open, save, preview or export a document.

### Where the sign-in lives

The sign-in is created and kept **by the language server**, not by Markdown Studio. Markdown Studio starts it with
`XDG_CONFIG_HOME` (and the cache, data and state folders) pointing into a private folder under the application's data
directory (`copilot/`), so it neither reads nor changes the sign-in of other editors (Visual Studio Code, Neovim, ...)
on the computer. The language server stores its session there as an ordinary file in its own format; unlike the
OpenAI-compatible API key, **it is not encrypted by Electron's `safeStorage`**, because the application has no
supported way to hand the server a token from there and would have to extract and re-inject it, which this
integration deliberately never does. Tokens are not passed through environment variables (`GITHUB_COPILOT_TOKEN`,
`GH_COPILOT_TOKEN` and similar are not forwarded), are not in the settings file, never reach the page, and are not
logged. The folders Markdown Studio creates (`copilot/` and its `config`, `cache`, `data`, `state` subfolders) are mode `0700`
on Linux and macOS, so the files the server writes inside them (its session database is created `0644`) are not
readable by other users; on Windows POSIX modes do not apply and the folder inherits the access rules of your own
application-data folder. The file is not protected against other programs running as you. Deleting the `copilot/`
folder (or **Sign out**) removes the session. The child process gets an allow-listed
environment (`PATH`, proxy and certificate variables and a few system variables), never the whole environment.

### How it works

```
renderer  ai/copilotSync.ts   one open document → validated sync events (open / change / close)
          ai/copilotInline.ts Monaco inline-completion provider (ghost text, cancellation, stale-answer checks)
   │  api.copilot.*  (validated IPC; no commands, no paths, no tokens)
main      services/copilotService.ts   lifecycle, account status, document versions, completions, acceptance reports
          services/jsonRpc.ts          LSP framing (Content-Length), message validation, request ids, cancellation
          services/copilotLauncher.ts  locates the server, builds the restricted environment, spawns it
   │  stdio, LSP 3.17 + Copilot extensions
server    copilot-language-server  (shipped in resources/copilot/ ; node_modules in development)
```

- **Lifecycle.** The server starts when AI is on and Copilot is selected, and stops when either is switched off and
  when the application quits. Exactly one process exists; the document sync is serial, so the server always sees the
  edits in order. If the process dies, it restarts with a short back-off (at most three times a minute, then it reports an
  error); the editor is told to send the open document again.
- **Protocol.** `initialize` (with `window.showDocument` support so that the sign-in page is opened by the application,
  and only for `https://github.com/…`), `initialized`, `workspace/didChangeConfiguration`; `signIn` →
  `github.copilot.finishDeviceFlow`; `checkStatus`, `signOut`; `textDocument/didOpen`, `didChange` (incremental, with
  versions), `didClose`, `didFocus`; `textDocument/inlineCompletion` (with `$/cancelRequest`);
  `textDocument/didShowCompletion`, `didPartiallyAcceptCompletion`; `workspace/executeCommand` for
  `github.copilot.didAcceptCompletionItem` only. Requests from the server (`workspace/configuration`,
  `client/registerCapability`, `window/showMessageRequest`, ...) are answered; unknown ones are refused. Next-edit
  suggestions, panel completions and unified suggestions are **not** used.
- **Validation.** Every IPC argument is checked in the main process (ids, versions, positions, sizes). The page cannot
  send a command, path or URL to the server; suggestions are handed out by opaque handles, and acceptance commands are
  taken from the server's own answer and only if they are the documented one.
- **Unsaved documents.** Every document, saved or not, is presented to the server the same way, as an untitled
  Markdown document. Saving, renaming or an external change on disk therefore cannot confuse the server, and the
  unsaved text is what suggestions are based on.

### Packaging

The server is a platform-specific executable in the npm package for your platform
(`@github/copilot-language-server-<win32|darwin|linux>-<x64|arm64>`, 164 MB uncompressed). The six packages are
`optionalDependencies` pinned to one version in `package.json` and `package-lock.json`, so `npm ci` installs only the
one that matches the machine and verifies it against the lockfile's SHA-512 integrity value. `electron-builder`
copies exactly that executable to `resources/copilot/` of the installed application; no other platform's binary is
included and **nothing is downloaded when the application runs or when a user turns Copilot on**. The tested versions
are in `package.json`; upgrade deliberately, re-run the tests and check the changelog of
[`copilot-language-server-release`](https://github.com/github/copilot-language-server-release). The package licence is
MIT (included in `THIRD_PARTY_NOTICES.md`); use of the Copilot service itself is governed by GitHub's terms and
subscription, not by that licence.

| Platform                   | Status                                                                                                                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linux x64, development     | Verified: the real server starts from `node_modules` and reports "not signed in" (E2E, `packaged.spec.ts`).                                                                                                    |
| Linux x64, unpacked build  | Verified: `electron-builder --linux --dir` bundles `resources/copilot/copilot-language-server`; the packaged application starts it (E2E with `MARKDOWN_STUDIO_EXECUTABLE`).                                    |
| Windows x64                | Configured (`resources/copilot/copilot-language-server.exe`). **Not verified**: not built or run in this environment. CI runs the same packaged smoke test on `main` and tags.                                 |
| macOS arm64 / x64          | Configured per architecture (`${arch}`). **Not verified.** A build needs the matching optional package, so build each architecture on a matching host. Hardened-runtime signing of the executable is untested. |
| Linux arm64, Windows arm64 | The packages are in the lockfile, but no such build target is configured.                                                                                                                                      |

### Acceptance with a real Copilot account

Automated tests use a deterministic **mock** language server, so they prove Markdown Studio's behaviour, not that
GitHub's service answers. Do this once per release candidate, **by hand, on your own machine, with your own account**.
Never put Copilot credentials in CI or share them with a shared runner.

1. Start the packaged application (or `npm run dev`). In Settings → AI enable AI, choose **GitHub Copilot**, press
   **Sign in with GitHub**, enter the code on GitHub and authorise. Expect _Connected_ and your login.
2. Enable _Automatic inline suggestions_. Open a Markdown file, type a sentence of 6–8 words such as
   `The health interface in Dead Space is effective because`, and pause. Expect grey ghost text.
3. <kbd>Tab</kbd> accepts; <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Z</kbd> undoes it in one step. Trigger another,
   press <kbd>Esc</kbd>: the text is unchanged.
4. In a list, press <kbd>Tab</kbd> with no ghost text: the item indents. Check Ctrl/Cmd+B, I and K still work.
5. Switch to another tab: no suggestion from the first document shows. Switch AI off for the document in the AI panel:
   no more suggestions appear.
6. Turn off the network and type: no suggestion, no error dialog, and the document is unharmed.
7. **Sign out** and check suggestions stop. Sign in again.
8. Also try: an account without Copilot (expect _Signed in, but no Copilot access_) and revoking the authorisation on
   github.com/settings/applications (expect a prompt to sign in again).

Until that has been done, the Copilot integration is reported as **passing mock and integration tests, awaiting
real-provider acceptance**.

### Copilot SDK and chat: not implemented

[`@github/copilot-sdk`](https://www.npmjs.com/package/@github/copilot-sdk) (MIT) drives the Copilot **agent runtime**
(the Copilot CLI) over JSON-RPC. It is the right basis for a future chat about the current document, explain/summarise
actions and proposed edits, but it is **not** used for inline completions and is **not integrated or exposed in this
version**: there is no chat UI, no SDK dependency and no agent. Findings from the evaluation:

- It ships its own runtime per platform (another large native package) plus a native dependency (`koffi`), so it would
  double the Copilot footprint of the installer.
- The runtime is an agent with tools (files, shell). A chat feature would have to run it with every tool denied or
  mediated: only the current document's text in, only reviewed proposed edits out, no filesystem or terminal access by
  default. That permission design and its tests should come first.
- Authentication and entitlement differ from the language server's, so the sign-in UI would need a second account
  state.

Chat can be added later as a separate milestone without changing the inline-completion path.

## Setting up an OpenAI-compatible service

1. Open **Settings → AI** (or the AI Assistant panel → _Set up AI…_) and turn on **Enable AI assistance**.
2. Choose **Provider: OpenAI-compatible endpoint**.
3. Enter the **service address** — the base URL that ends in `/v1` — and the **model** name exactly as the
   service lists it.
4. If the service needs a key, paste it under **API key** and press **Save key**.

| Service                                                                | Address                           | Key        |
| ---------------------------------------------------------------------- | --------------------------------- | ---------- |
| OpenAI                                                                 | `https://api.openai.com/v1`       | Required   |
| OpenRouter                                                             | `https://openrouter.ai/api/v1`    | Required   |
| Azure OpenAI and other hosted services with an OpenAI-compatible route | The address the service documents | Required   |
| Ollama on this computer                                                | `http://localhost:11434/v1`       | Not needed |
| LM Studio on this computer                                             | `http://localhost:1234/v1`        | Not needed |

These are the setups the code supports: HTTPS for any remote service, and plain `http://` **only** for a server on
the same computer (`localhost`, `127.0.0.1`, `[::1]`). Anything else is refused with an explanation rather than
sent in the clear. Redirects are not followed. Whether a particular service is compatible depends on that service;
only a local test server has been used to test this integration, no real provider.

## When text is sent

Only when you use an AI feature, and only the text that feature needs:

- **Continue Writing / suggest while typing:** up to 6,000 characters before the cursor and 1,500 after it.
- **Rewrite Selection:** the selection (at most 12,000 characters), your instruction, and a little context around it.

Nothing else is sent: not other documents, file names, paths or settings. Suggestions while typing are the one
feature that sends text without a click, so they have their own switch, off by default. **What the provider does
with the text is up to the provider** — read its terms before using it with school or personal documents. Markdown
Studio does not judge a provider "private" or "secure"; only a model server running on your own computer keeps the
text there.

An **internet connection** is needed for hosted services and is not needed for a local model server. A request that
cannot reach the service shows an error and changes nothing.

## Turning it on and off

- **Everywhere:** Settings → AI → _Enable AI assistance_. Off means no request is ever made and, for Copilot, the
  language server is stopped and no document is shared.
- **For one folder or one document:** the switches in the AI Assistant panel, or the palette commands _AI: Turn
  Off/On for This Workspace_ and _… for This Document_. The choice is stored in the settings file by path. An unsaved
  document has no path yet, so its choice cannot be remembered.
- **Suggestions while typing:** Settings → AI, or the panel. The per-folder and per-document switches apply to
  every AI feature, including this one.

When AI is blocked for a document the actions say why ("switched off for this document") and do nothing.

## Credentials

The OpenAI-compatible API key is encrypted by the operating system (Windows DPAPI, the macOS Keychain, or the Linux secret service
through Electron's `safeStorage`) and stored in its own file, `ai-key.bin`, in the application's data folder. It is
**never** written to the settings file, never sent to the web page of the application, and cannot be read back; _Remove_
deletes the file. If the system cannot encrypt, the key is not stored at all and you are told so. Local models do not
need a key.

## Architecture

```
renderer  ai/commands.ts, ai/run.ts, ai/inline.ts, ai/rewrite.tsx, ai/AiPanel.tsx
   │  api.ai.run(id, task)   (task = a bounded text window and an instruction; no file name or path)
main      services/aiService.ts   (the only place text leaves the application)
   │  fetch  POST {address}/chat/completions
provider  any OpenAI-compatible service
shared    ai/types.ts (contracts, provider list), ai/prompts.ts (prompt building),
          ai/endpoint.ts (address and model validation), ai/availability.ts (the switches)
```

Requests time out after 45 seconds and can be cancelled. Providers are described by `AiProviderInfo`
(`src/shared/ai/types.ts`); adding one means an entry there and a branch in `AiService.run` (or splitting the service
by provider once there are two). The renderer and the settings do not change.

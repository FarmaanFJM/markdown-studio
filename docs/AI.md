# AI assistance

AI help in Markdown Studio is **optional and off by default**. The editor, the preview and the exports never
depend on it. With AI off — the default — none of the AI code runs and no text leaves your computer.

## Status

**Implemented**

- An **AI Assistant** section in the left activity bar (sparkles icon): status, the two actions below,
  switches for the current folder and document, and the list of providers.
- **Settings → AI**: enable AI, choose the provider, service address, model, API key, and optional suggestions
  while typing.
- One provider: any **OpenAI-compatible** service (chat completions protocol).
- **AI: Continue Writing** — the next sentences, shown as grey ghost text at the cursor. <kbd>Tab</kbd> accepts,
  <kbd>Esc</kbd> dismisses; nothing changes until you accept.
- **AI: Rewrite Selection…** — presets (fix spelling and grammar, shorter, more formal, simpler) or your own
  instruction. The suggestion is shown next to your text for approval; accepting is one undo step, and it is
  refused if the document changed in the meantime.
- Optional **Suggest while typing** (ghost text after a pause at the end of a line). Off by default.
- Per-**folder** and per-**document** switches (remembered by path).

**Not implemented, or deferred**

- GitHub Copilot (see [below](#github-copilot-investigated-not-implemented)).
- Streaming replies, an AI chat panel, and document-aware actions beyond the text around the cursor or selection
  (outline, citations, whole-document summaries).
- Other provider-specific integrations (an Anthropic or Gemini API, for example). Services that offer an
  OpenAI-compatible endpoint work today through the provider above.

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

- **Everywhere:** Settings → AI → _Enable AI assistance_. Off means no request is ever made.
- **For one folder or one document:** the switches in the AI Assistant panel, or the palette commands _AI: Turn
  Off/On for This Workspace_ and _… for This Document_. The choice is stored in the settings file by path. An unsaved
  document has no path yet, so its choice cannot be remembered.
- **Suggestions while typing:** Settings → AI, or the panel. The per-folder and per-document switches apply to
  every AI feature, including this one.

When AI is blocked for a document the actions say why ("switched off for this document") and do nothing.

## Credentials

The API key is encrypted by the operating system (Windows DPAPI, the macOS Keychain, or the Linux secret service
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

## GitHub Copilot: investigated, not implemented

GitHub provides **no public API** that lets a third-party editor request Copilot inline completions from the
application's own code, and the private endpoints GitHub's own editor extensions use are not a supported
integration, so they are not used. The documented route for other editors is the Copilot **language server**
([`@github/copilot-language-server`](https://www.npmjs.com/package/@github/copilot-language-server)): a program that
speaks the Language Server Protocol, offers inline completions through a draft inline-completion request, and
requires the user to sign in with their own Copilot subscription. Using it would involve:

1. bundling or downloading the server and running it as a managed child process;
2. GitHub's sign-in flow and token handling in the main process;
3. reading GitHub's Copilot terms for third-party editor use and the package's licence before redistributing it;
4. mapping Monaco's inline-completion provider to the server's requests, including its document versioning.

None of that exists, and nothing in the application pretends otherwise: the AI panel and settings list GitHub
Copilot as _not available yet_. The package page was consulted for this investigation; GitHub's terms were not
reviewed, so the licensing question remains open.

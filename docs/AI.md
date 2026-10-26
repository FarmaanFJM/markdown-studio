# AI assistance

AI help in Markdown Studio is **optional and off by default**. The editor, preview and exports
never depend on it, and no text leaves the computer unless the user turns AI on, configures a
provider and either runs an action or enables suggestions while typing.

## What exists

| Feature                      | Where                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| AI Assistant sidebar         | Activity bar (✦): status, actions, per-folder/document switches                      |
| AI settings                  | Settings › AI: enable, provider, address, model, API key                             |
| _AI: Continue Writing_       | Ghost text at the cursor; <kbd>Tab</kbd> accepts, <kbd>Esc</kbd> dismisses           |
| _AI: Rewrite Selection…_     | Presets or a custom instruction; shows the suggestion for approval; one undo step    |
| Suggest while typing         | Off by default; sends the text around the cursor after a pause                       |
| Per-workspace / per-document | Remembered by path in the settings (`ai.disabledWorkspaces`, `ai.disabledDocuments`) |

## Architecture

```
renderer  ai/commands.ts, ai/run.ts, ai/inline.ts, ai/rewrite.tsx, ai/AiPanel.tsx
   │  api.ai.run(id, task)        (task = bounded text window + instruction, no document path)
main      services/aiService.ts   (the only place text leaves the application)
   │  fetch  POST {endpoint}/chat/completions
provider  any OpenAI-compatible service
shared    ai/types.ts (contracts, provider list), ai/prompts.ts (pure prompt building),
          ai/endpoint.ts (address and model validation), ai/availability.ts (switches)
```

- The page never sees the API key. `AiService` stores it with Electron `safeStorage` (DPAPI,
  Keychain, libsecret) in `ai-key.bin` in the user-data folder, never in `settings.json`, and refuses
  to store it when the system cannot encrypt.
- Endpoints must be `https://`; plain `http://` is accepted only for the same computer
  (`localhost`, `127.0.0.1`, `[::1]`) so local model servers (Ollama, LM Studio) work. Redirects are
  refused. Local servers do not need a key.
- Requests are bounded (6,000 characters before the cursor, 1,500 after, 12,000 selected), carry no
  file names, and time out after 45 seconds; a running request can be cancelled.
- Rewrites are never applied silently: the result is shown next to the original, and the edit is
  rejected if the document changed in the meantime.
- Providers are described by `AiProviderInfo` (`shared/ai/types.ts`). Adding one means adding an
  entry there and a branch in `AiService.run` (or splitting it into per-provider classes when a
  second exists); the renderer and the settings do not change.

## GitHub Copilot: investigated, not implemented

There is **no public API for third-party editors to request Copilot inline completions** from an
application's own code, and the private endpoints the first-party plugins use are not a supported
integration. The supported route is the Copilot language server
([`@github/copilot-language-server`](https://www.npmjs.com/package/@github/copilot-language-server)),
which speaks LSP, exposes inline completions through a draft inline-completion request, and needs
the user to sign in with their own Copilot subscription. Using it requires, at least:

1. bundling or downloading the server and running it as a managed child process;
2. GitHub's device-flow sign-in and token handling in the main process;
3. reviewing GitHub's Copilot terms for third-party editor use and the package licence before
   redistributing it;
4. mapping Monaco's inline completion provider to the server's requests, with the document
   versioning it requires.

None of this was fabricated. The interface lists GitHub Copilot as _not available yet_ with this
reason, and the provider abstraction is ready for it. This pass did not verify GitHub's terms
first-hand; do that before building it.

## Deferred

- Streaming replies, token budgeting per model, and per-provider request tuning.
- A second provider (Copilot language server, or a provider-specific API such as Anthropic's).
- Document-aware actions beyond the text window (outline, citations), and a chat panel.
- Keyboard navigation inside the native submenu popups (the headings themselves support
  arrow keys and Alt+letter).

/**
 * Provider-neutral AI contracts. The editor never talks to a vendor directly: it asks the
 * `AiService` for a completion and gets text back, whichever provider produced it. Nothing in
 * Markdown Studio depends on AI being available; with the feature off (the default) none of this
 * code runs and no text ever leaves the computer.
 */

export type AiProviderId = 'none' | 'openai-compatible' | 'github-copilot'

export type AiTaskKind =
  /** Continue the text at the cursor. */
  | 'continue'
  /** Rewrite the selected text following an instruction. */
  | 'rewrite'

export interface AiTaskRequest {
  kind: AiTaskKind
  /** Text before the cursor (or before the selection), trimmed to a bounded window. */
  before: string
  /** Text after the cursor or selection, as context only. */
  after: string
  /** The selected text, for rewrites. */
  selection: string
  /** What to do with the selection ("Fix spelling and grammar", ...). */
  instruction: string
  /** The document language hint, such as `nl` or `en`; empty when unknown. */
  language: string
}

export type AiTaskResult =
  { ok: true; text: string } | { ok: false; code: AiFailureCode; message: string }

export type AiFailureCode =
  | 'disabled'
  | 'not-configured'
  | 'no-key'
  | 'network'
  | 'unauthorized'
  | 'rate-limited'
  | 'bad-response'
  | 'cancelled'
  | 'too-large'

/** What a provider can do; the interface shows only the actions that are supported. */
export interface AiCapabilities {
  continue: boolean
  rewrite: boolean
  inline: boolean
}

export interface AiProviderInfo {
  id: AiProviderId
  name: string
  description: string
  /** True when the provider needs an API key kept by the application. */
  needsKey: boolean
  capabilities: AiCapabilities
  /** What an unsupported action means for this provider, shown instead of silently switching. */
  limitations: string
}

/** Providers that exist in this version. */
export const AI_PROVIDERS: AiProviderInfo[] = [
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    description:
      'Inline writing suggestions from your own GitHub Copilot subscription, through the official GitHub Copilot language server. You sign in with GitHub; no API key is needed.',
    needsKey: false,
    capabilities: { continue: true, rewrite: false, inline: true },
    limitations:
      'Copilot provides inline suggestions only. “Rewrite selection” is not available with GitHub Copilot; switch the provider to an OpenAI-compatible endpoint to use it.'
  },
  {
    id: 'openai-compatible',
    name: 'OpenAI-compatible endpoint',
    description:
      'Any service that speaks the OpenAI chat completions protocol: OpenAI, Azure OpenAI, OpenRouter, or a local model server such as Ollama or LM Studio.',
    needsKey: true,
    capabilities: { continue: true, rewrite: true, inline: true },
    limitations: ''
  }
]

export const AI_LIMITS = {
  /** Characters of context sent before the cursor. */
  beforeCharacters: 6000,
  /** Characters of context sent after the cursor. */
  afterCharacters: 1500,
  /** Longest selection that can be rewritten. */
  selectionCharacters: 12000,
  /** Longest instruction. */
  instructionCharacters: 400,
  modelLength: 120,
  endpointLength: 300
} as const

/** Ready-made instructions for the rewrite action. */
export const REWRITE_PRESETS: { id: string; label: string; instruction: string }[] = [
  {
    id: 'grammar',
    label: 'Fix spelling and grammar',
    instruction: 'Fix spelling, grammar and punctuation. Keep the meaning, tone and wording.'
  },
  {
    id: 'shorter',
    label: 'Make shorter',
    instruction: 'Make the text shorter and clearer without losing any information.'
  },
  {
    id: 'formal',
    label: 'Make more formal',
    instruction: 'Rewrite in a formal, academic register suitable for a school report.'
  },
  {
    id: 'simpler',
    label: 'Simplify the language',
    instruction: 'Rewrite in simpler, plainer language.'
  }
]

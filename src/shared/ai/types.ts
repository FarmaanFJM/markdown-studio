/**
 * Provider-neutral AI contracts. The editor never talks to a vendor directly: it asks the
 * `AiService` for a completion and gets text back, whichever provider produced it. Nothing in
 * Markdown Studio depends on AI being available; with the feature off (the default) none of this
 * code runs and no text ever leaves the computer.
 */

export type AiProviderId = 'none' | 'openai-compatible'

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
}

/** Providers that exist in this version. */
export const AI_PROVIDERS: AiProviderInfo[] = [
  {
    id: 'openai-compatible',
    name: 'OpenAI-compatible endpoint',
    description:
      'Any service that speaks the OpenAI chat completions protocol: OpenAI, Azure OpenAI, OpenRouter, or a local model server such as Ollama or LM Studio.',
    needsKey: true,
    capabilities: { continue: true, rewrite: true, inline: true }
  }
]

/**
 * Providers that were investigated and are deliberately not offered, with the reason. They are
 * listed in the interface so nobody mistakes the absence for an oversight.
 */
export const UNAVAILABLE_PROVIDERS: { name: string; reason: string }[] = [
  {
    name: 'GitHub Copilot',
    reason:
      'GitHub offers no public inline-completion API for third-party editors. The supported route is the Copilot language server, which requires the user to sign in with their own Copilot licence and is governed by GitHub’s Copilot terms. It will be added as a provider once that integration has been built and reviewed, not before.'
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

import { AI_LIMITS } from './types'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export interface EndpointCheck {
  /** The normalised base URL without a trailing slash, or null when it cannot be used. */
  url: string | null
  /** Why the value was refused. */
  problem: string | null
}

/**
 * Validates the base URL of an OpenAI-compatible service. Credentials and document text only
 * travel over HTTPS, except to the same computer (a local model server), where plain HTTP is
 * fine. Anything else is refused rather than silently sent in the clear.
 */
export function checkAiEndpoint(value: unknown): EndpointCheck {
  if (typeof value !== 'string' || value.trim() === '') {
    return {
      url: null,
      problem: 'Enter the address of the service, such as https://api.openai.com/v1.'
    }
  }
  const text = value.trim()
  if (text.length > AI_LIMITS.endpointLength)
    return { url: null, problem: 'The address is too long.' }
  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    return { url: null, problem: 'This is not a valid web address.' }
  }
  if (parsed.username || parsed.password) {
    return { url: null, problem: 'Do not put credentials in the address; use the API key field.' }
  }
  if (parsed.search || parsed.hash) {
    return { url: null, problem: 'The address must not contain a query or fragment.' }
  }
  const loopback = LOOPBACK.has(parsed.hostname)
  if (parsed.protocol === 'http:' && !loopback) {
    return {
      url: null,
      problem: 'Use https:// — plain http:// is only allowed for a model running on this computer.'
    }
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { url: null, problem: 'The address must start with https://.' }
  }
  return { url: parsed.toString().replace(/\/+$/, ''), problem: null }
}

/** A model name as accepted by the services: printable, no spaces or control characters. */
export function normalizeAiModel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text === '' || text.length > AI_LIMITS.modelLength) return null
  return /^[\w.:/@+-]+$/.test(text) ? text : null
}

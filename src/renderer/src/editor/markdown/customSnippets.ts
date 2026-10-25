import type { Template } from '@shared/templates'

/**
 * The user's reusable snippets (templates of kind `snippet`) as the editor sees them. The
 * template store keeps this list current; completions and slash commands read it on demand.
 */
let snippets: Template[] = []

export function setCustomSnippets(list: Template[]): void {
  snippets = list.filter((template) => template.kind === 'snippet')
}

export function getCustomSnippets(): Template[] {
  return snippets
}

import { AI_LIMITS, type AiTaskRequest } from './types'

export interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

const SYSTEM =
  'You are a writing assistant inside a Markdown editor. Reply with the requested text only: ' +
  'no preface, no explanation, no surrounding quotes and no code fence around the whole reply. ' +
  'Write valid Markdown and keep the Markdown structure and formatting of the text you are given. ' +
  'Never invent citations, references or facts.'

/** Keeps the end of `text` (nearest the cursor) within `limit` characters. */
export function tailOf(text: string, limit: number): string {
  return text.length <= limit ? text : text.slice(text.length - limit)
}

/** Keeps the start of `text` within `limit` characters. */
export function headOf(text: string, limit: number): string {
  return text.length <= limit ? text : text.slice(0, limit)
}

/** The chat messages for a task. Pure, so the exact request is testable. */
export function buildMessages(task: AiTaskRequest): ChatMessage[] {
  const language = task.language ? ` Write in the language of the document (${task.language}).` : ''
  const before = tailOf(task.before, AI_LIMITS.beforeCharacters)
  const after = headOf(task.after, AI_LIMITS.afterCharacters)

  if (task.kind === 'rewrite') {
    return [
      { role: 'system', content: SYSTEM + language },
      {
        role: 'user',
        content:
          `Instruction: ${task.instruction.trim()}\n\n` +
          `Rewrite the text between <selection> tags. Return only the rewritten text.\n\n` +
          (before ? `Text before it, for context only:\n${tailOf(before, 1500)}\n\n` : '') +
          `<selection>\n${task.selection}\n</selection>` +
          (after ? `\n\nText after it, for context only:\n${headOf(after, 600)}` : '')
      }
    ]
  }
  return [
    { role: 'system', content: SYSTEM + language },
    {
      role: 'user',
      content:
        'Continue the document at the marker <cursor/>. Write the next one to three sentences ' +
        'only, in the same voice, and return only the new text.\n\n' +
        `${before}<cursor/>${after}`
    }
  ]
}

/**
 * Cleans a model reply: removes a wrapping code fence or pair of quotes that models add despite
 * instructions, and the line break they put in front of a continuation.
 */
export function cleanReply(reply: string): string {
  let text = reply.replace(/\r\n/g, '\n')
  const fenced = /^```[\w-]*\n([\s\S]*?)\n```\s*$/.exec(text.trim())
  if (fenced) text = fenced[1]
  const quoted = /^"([\s\S]*)"$/.exec(text.trim())
  if (quoted && !quoted[1].includes('"')) text = quoted[1]
  return text.replace(/^\n+/, '').replace(/\s+$/, '')
}

/** Rough check that a rewrite is usable before it replaces the user's text. */
export function isPlausibleRewrite(original: string, rewritten: string): boolean {
  if (rewritten.trim() === '') return false
  // A rewrite that is wildly longer is usually the model rambling or answering the instruction.
  return rewritten.length <= Math.max(400, original.length * 4)
}

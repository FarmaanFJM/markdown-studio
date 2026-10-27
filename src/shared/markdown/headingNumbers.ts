/**
 * Detection of section numbers that an author typed into a heading (`## 1. Introduction`,
 * `### 4.1 Comparison`), so automatic numbering never adds the same number a second time.
 *
 * Detection is deliberately conservative: a heading counts as manually numbered only when it
 * starts with a dotted number of up to three digits per part that is followed by a space and
 * more text. A bare number is not enough (`## 2024 Results`, `## 3 Reasons to wait`), because
 * that is far more likely to be part of the title than an enumeration.
 */

export interface ManualNumber {
  /** The number without its trailing `.` or `)`, such as `1` or `4.1`. */
  number: string
  /** The number as numeric parts. */
  parts: number[]
}

// A single number needs a terminating `.` or `)`; a dotted number (`4.1`, `4.1.2.`) does not.
const SINGLE = /^(\d{1,3})[.)](?=\s+\S)/
const DOTTED = /^(\d{1,3}(?:\.\d{1,3})+)\.?(?=\s+\S)/

/** The number a heading text starts with, or null when it does not start with one. */
export function manualHeadingNumber(text: string): ManualNumber | null {
  const trimmed = text.trimStart()
  const dotted = DOTTED.exec(trimmed)
  const raw = dotted?.[1] ?? SINGLE.exec(trimmed)?.[1]
  if (!raw) return null
  return { number: raw, parts: raw.split('.').map(Number) }
}

/**
 * Whether `text` already starts with `number` (the number automatic numbering would add), so
 * adding it again would print it twice. `1. Intro` matches `1`; `4.1 Compare` matches `4.1`.
 */
export function startsWithNumber(text: string, number: string): boolean {
  return manualHeadingNumber(text)?.number === number
}

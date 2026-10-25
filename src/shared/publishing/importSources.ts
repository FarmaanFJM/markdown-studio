import { Cite } from '@citation-js/core'
import '@citation-js/plugin-bibtex'
import { parseSourcesJson, SOURCE_LIMITS, sanitizeSources, type SanitizedSources } from './sources'

/**
 * Reads a bibliography file: CSL JSON, or BibTeX/BibLaTeX through citation-js. The text is
 * treated as data (parsed, never evaluated) and limited in size; every entry is validated
 * again by `sanitizeSources`, so nothing unexpected reaches the library.
 */
export function importSourcesText(text: string, fileName: string): SanitizedSources {
  if (text.length > SOURCE_LIMITS.maxFileChars) {
    return { sources: [], problems: ['The file is too large to import.'] }
  }
  const trimmed = text.replace(/^﻿/, '').trim()
  if (trimmed === '') return { sources: [], problems: ['The file is empty.'] }
  if (/\.json$/i.test(fileName) || trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = parseSourcesJson(trimmed.startsWith('{') ? `[${trimmed}]` : trimmed)
    return parsed
  }
  try {
    const data = new Cite(trimmed).data as unknown[]
    // citation-js renames keys when it has to; entries stay as it produced them.
    const result = sanitizeSources(data)
    if (result.sources.length === 0 && result.problems.length === 0) {
      result.problems.push('No entries were found in the file.')
    }
    return result
  } catch (error) {
    return {
      sources: [],
      problems: [`The file could not be read as BibTeX: ${(error as Error).message.split('\n')[0]}`]
    }
  }
}

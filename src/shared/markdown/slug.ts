/** GitHub-style heading slug: lower case, punctuation removed, spaces become hyphens. */
export function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')
  return slug || 'section'
}

/**
 * Hands out heading ids the way the preview does: the first heading with a given slug keeps it,
 * later ones receive `-1`, `-2`, ... suffixes. One instance per document render.
 */
export class SlugAllocator {
  private readonly used = new Map<string, number>()

  next(text: string): string {
    const base = slugify(text)
    const count = this.used.get(base) ?? 0
    this.used.set(base, count + 1)
    return count === 0 ? base : `${base}-${count}`
  }
}

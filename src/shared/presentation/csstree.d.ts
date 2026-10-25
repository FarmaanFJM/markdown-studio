import 'css-tree'

// The published typings of css-tree 2 omit the tokenizer, which the CSS policy uses to scan
// text the parser leaves unparsed.
declare module 'css-tree' {
  export function tokenize(
    source: string,
    callback: (type: number, start: number, end: number) => void
  ): void
  export const tokenTypes: Record<string, number>
}

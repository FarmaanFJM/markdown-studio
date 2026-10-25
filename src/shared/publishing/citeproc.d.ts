declare module 'citeproc' {
  interface CslEngine {
    setOutputFormat(format: string): void
    rebuildProcessorState(
      citations: unknown[],
      mode: string,
      uncited: unknown[]
    ): [string, number, string][]
    updateItems(ids: string[]): void
    makeBibliography(): [Record<string, unknown>, string[]] | false
    opt: { development_extensions: Record<string, unknown> }
  }
  const CSL: {
    Engine: new (
      sys: { retrieveLocale(lang: string): string | false; retrieveItem(id: string): unknown },
      style: string,
      lang?: string,
      forceLang?: boolean
    ) => CslEngine
  }
  export default CSL
}

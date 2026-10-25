/**
 * Late-bound command lookup. Completion items and slash commands refer to commands by id; the
 * command registry fills this table at start-up, which keeps the editor layer independent of
 * dialogs, stores and other application commands.
 */
const runners = new Map<string, () => unknown>()

export const RUN_COMMAND_ID = 'markdown-studio.run'

export function registerRunner(id: string, run: () => unknown): void {
  runners.set(id, run)
}

export function runCommandById(id: string): boolean {
  const run = runners.get(id)
  if (!run) return false
  void run()
  return true
}

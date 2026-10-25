/**
 * Late-bound access to the command registry. `commands.ts` is imported by the registry itself, so
 * it reaches the registry through this indirection instead of importing it.
 */
let run: ((id: string) => void) | null = null

export function setRegistryRunner(runner: (id: string) => void): void {
  run = runner
}

export function runRegisteredCommand(id: string): void {
  run?.(id)
}

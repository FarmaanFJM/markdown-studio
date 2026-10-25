import type { RecoverySnapshot } from '@shared/ipc'
import { api } from '../bridge'

/**
 * Unsaved text is copied to the application's data folder a moment after each edit, so a crash
 * or a killed process does not lose it. The copies are removed when a document is saved or
 * closed deliberately, and when the application closes normally.
 */
const SNAPSHOT_DELAY_MS = 1500
/** Distinguishes this run's snapshots from those left by an earlier (crashed) run. */
const SESSION = Date.now().toString(36)

type Source = (id: string) => Omit<RecoverySnapshot, 'id' | 'savedAt'> | null

let source: Source | null = null
const timers = new Map<string, ReturnType<typeof setTimeout>>()

const snapshotId = (id: string) => `${SESSION}-${id}`

export function configureRecovery(read: Source): void {
  source = read
}

export function scheduleSnapshot(id: string, delay = SNAPSHOT_DELAY_MS): void {
  const existing = timers.get(id)
  if (existing) clearTimeout(existing)
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id)
      const data = source?.(id)
      if (!data) return
      void api.recovery
        .write({ ...data, id: snapshotId(id), savedAt: Date.now() })
        .catch(() => undefined)
    }, delay)
  )
}

export function dropSnapshot(id: string): void {
  const timer = timers.get(id)
  if (timer) clearTimeout(timer)
  timers.delete(id)
  void api.recovery.remove(snapshotId(id)).catch(() => undefined)
}

/** Forgets everything: used once the user has dealt with every unsaved document. */
export async function clearSnapshots(): Promise<void> {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  await api.recovery.clear().catch(() => undefined)
}

export async function pendingSnapshots(): Promise<RecoverySnapshot[]> {
  try {
    return (await api.recovery.list()).filter((s) => !s.id.startsWith(`${SESSION}-`))
  } catch {
    return []
  }
}

export async function discardSnapshot(snapshot: RecoverySnapshot): Promise<void> {
  await api.recovery.remove(snapshot.id).catch(() => undefined)
}

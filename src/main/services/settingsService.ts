import { promises as fs, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  applySettingsPatch,
  DEFAULT_SETTINGS,
  sanitizeSettings,
  type AppSettings,
  type SettingsPatch
} from '@shared/settings'

/**
 * Persists settings as JSON in the application's user-data directory.
 * Writes are debounced and atomic (write to a temporary file, then rename).
 */
export class SettingsService {
  private settings: AppSettings = DEFAULT_SETTINGS
  private timer: NodeJS.Timeout | null = null
  private writing: Promise<void> = Promise.resolve()

  constructor(readonly filePath: string) {}

  load(): AppSettings {
    try {
      const raw = readFileSync(this.filePath, 'utf8')
      this.settings = sanitizeSettings(JSON.parse(raw))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`Settings could not be read and were reset: ${(error as Error).message}`)
        // Keep the unreadable file for inspection rather than silently discarding it.
        fs.copyFile(this.filePath, `${this.filePath}.corrupt`).catch(() => undefined)
      }
      this.settings = sanitizeSettings({})
    }
    return this.settings
  }

  get(): AppSettings {
    return this.settings
  }

  update(patch: SettingsPatch): AppSettings {
    this.settings = applySettingsPatch(this.settings, patch ?? {})
    this.scheduleWrite()
    return this.settings
  }

  private scheduleWrite(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, 150)
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const snapshot = JSON.stringify(this.settings, null, 2)
    this.writing = this.writing.then(async () => {
      try {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true })
        const temp = `${this.filePath}.${process.pid}.tmp`
        await fs.writeFile(temp, snapshot, 'utf8')
        await fs.rename(temp, this.filePath)
      } catch (error) {
        console.error(`Settings could not be saved: ${(error as Error).message}`)
      }
    })
    return this.writing
  }
}

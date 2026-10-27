import type { ThemeName } from './settings'

/** Height of the integrated title bar, shared by the native caption buttons and the page. */
export const TITLE_BAR_HEIGHT = 36

/** Space reserved for the macOS traffic lights at the left of the title bar. */
export const TRAFFIC_LIGHT_INSET = 78

export interface ChromeColors {
  /** Title bar background; the same as the application background so no seam shows. */
  color: string
  /** Colour of the minimise, maximise and close symbols. */
  symbolColor: string
}

const COLORS: Record<ThemeName, ChromeColors> = {
  dark: { color: '#0c0d0e', symbolColor: '#9ca2a8' },
  light: { color: '#eef0f0', symbolColor: '#565d64' }
}

export function chromeColors(theme: ThemeName): ChromeColors {
  return COLORS[theme] ?? COLORS.dark
}

export interface WindowChromeOptions {
  titleBarStyle: 'hidden' | 'hiddenInset'
  titleBarOverlay?: ChromeColors & { height: number }
  trafficLightPosition?: { x: number; y: number }
}

/**
 * Native window options for the integrated title bar. Windows and Linux keep the system's own
 * caption buttons (drawn over the page), so maximise, restore, close, Snap layouts and the
 * double-click on the title bar behave exactly as users expect; macOS keeps its traffic lights.
 */
export function windowChromeOptions(platform: string, theme: ThemeName): WindowChromeOptions {
  if (platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 14, y: (TITLE_BAR_HEIGHT - 14) / 2 }
    }
  }
  return {
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...chromeColors(theme), height: TITLE_BAR_HEIGHT }
  }
}

/** One top-level entry of the application menu, shown in the title bar on Windows and Linux. */
export interface MenuHeading {
  label: string
  /** Letter that opens the menu together with Alt, lower-cased; null when there is none. */
  mnemonic: string | null
}

/** Splits an Electron menu label such as `&File` into the visible text and its Alt+key letter. */
export function parseMenuLabel(label: string): MenuHeading {
  const match = /&(?!&)(.)/.exec(label)
  return {
    label: label.replace(/&(.)/g, '$1'),
    mnemonic: match ? match[1].toLowerCase() : null
  }
}

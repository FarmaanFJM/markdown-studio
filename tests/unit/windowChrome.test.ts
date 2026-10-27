import { describe, expect, it } from 'vitest'
import {
  chromeColors,
  parseMenuLabel,
  TITLE_BAR_HEIGHT,
  windowChromeOptions
} from '@shared/windowChrome'

describe('window chrome', () => {
  it('keeps the system caption buttons on Windows and Linux', () => {
    for (const platform of ['win32', 'linux']) {
      const options = windowChromeOptions(platform, 'dark')
      expect(options.titleBarStyle).toBe('hidden')
      expect(options.titleBarOverlay).toEqual({
        color: '#0c0d0e',
        symbolColor: '#9ca2a8',
        height: TITLE_BAR_HEIGHT
      })
    }
  })

  it('keeps the traffic lights on macOS', () => {
    const options = windowChromeOptions('darwin', 'dark')
    expect(options.titleBarStyle).toBe('hiddenInset')
    expect(options.titleBarOverlay).toBeUndefined()
    expect(options.trafficLightPosition?.y).toBeGreaterThan(0)
  })

  it('matches the caption buttons to the theme, with readable symbols', () => {
    expect(chromeColors('light').color).toBe('#eef0f0')
    expect(chromeColors('light').symbolColor).not.toBe(chromeColors('light').color)
    expect(windowChromeOptions('win32', 'light').titleBarOverlay?.color).toBe('#eef0f0')
  })

  it('splits menu labels into text and the Alt+key mnemonic', () => {
    expect(parseMenuLabel('&File')).toEqual({ label: 'File', mnemonic: 'f' })
    expect(parseMenuLabel('Vie&w')).toEqual({ label: 'View', mnemonic: 'w' })
    expect(parseMenuLabel('Help')).toEqual({ label: 'Help', mnemonic: null })
  })
})

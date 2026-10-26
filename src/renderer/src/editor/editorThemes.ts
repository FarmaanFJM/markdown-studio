/**
 * Monaco colour themes as plain data, so they can be checked without loading the editor.
 * Surfaces and accents follow the application's design tokens (see styles/app.css).
 */
export interface EditorThemeData {
  base: 'vs' | 'vs-dark'
  inherit: boolean
  rules: { token: string; foreground?: string; fontStyle?: string }[]
  colors: Record<string, string>
}

export const DARK_THEME: EditorThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword.md', foreground: '2BD9A1', fontStyle: 'bold' },
    { token: 'strong.md', fontStyle: 'bold' },
    { token: 'emphasis.md', fontStyle: 'italic' },
    { token: 'string.link.md', foreground: '7CB7FF' },
    { token: 'variable.md', foreground: 'E5C07B' },
    { token: 'variable.source.md', foreground: 'D7DAE0' },
    { token: 'meta.separator.md', foreground: '6B7177' },
    { token: 'comment.md', foreground: '6B7177' },
    { token: 'tag.md', foreground: '6FD3B5' },
    { token: 'attribute.name.html.md', foreground: '9CDCFE' },
    { token: 'string.html.md', foreground: 'CE9178' }
  ],
  colors: {
    'editor.background': '#0F1112',
    'editor.foreground': '#E3E6E8',
    'editorLineNumber.foreground': '#454B51',
    'editorLineNumber.activeForeground': '#A9AFB5',
    'editorCursor.foreground': '#2BD9A1',
    'editor.lineHighlightBackground': '#16191B',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#10B98140',
    'editor.inactiveSelectionBackground': '#10B98122',
    'editor.findMatchBackground': '#10B98166',
    'editor.findMatchHighlightBackground': '#10B98130',
    'editorWidget.background': '#1A1D20',
    'editorWidget.border': '#2B2E31',
    'editorSuggestWidget.background': '#1A1D20',
    'editorSuggestWidget.border': '#2B2E31',
    'editorSuggestWidget.selectedBackground': '#12C98E24',
    // Menus (right-click, quick fix) use the application's elevated surface and accent.
    'menu.background': '#202326',
    'menu.foreground': '#ECEEEF',
    'menu.selectionBackground': '#12C98E24',
    'menu.selectionForeground': '#ECEEEF',
    'menu.selectionBorder': '#00000000',
    'list.hoverBackground': '#12C98E24',
    'list.hoverForeground': '#ECEEEF',
    'menu.separatorBackground': '#2B2E31',
    'menu.border': '#2B2E31',
    'editorHoverWidget.background': '#202326',
    'editorHoverWidget.border': '#2B2E31',
    'editorActionList.background': '#202326',
    'editorActionList.foreground': '#ECEEEF',
    'editorActionList.focusBackground': '#12C98E24',
    'editorActionList.focusForeground': '#ECEEEF',
    'input.background': '#0F1112',
    'input.border': '#2B2E31',
    focusBorder: '#10B98199',
    'scrollbarSlider.background': '#FFFFFF12',
    'scrollbarSlider.hoverBackground': '#FFFFFF20',
    'scrollbarSlider.activeBackground': '#FFFFFF2A',
    'minimap.background': '#0F1112',
    'editorGutter.background': '#0F1112',
    'editorIndentGuide.background1': '#1E2124',
    'editorWhitespace.foreground': '#3A3F44'
  }
}

export const LIGHT_THEME: EditorThemeData = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'keyword.md', foreground: '06875F', fontStyle: 'bold' },
    { token: 'strong.md', fontStyle: 'bold' },
    { token: 'emphasis.md', fontStyle: 'italic' },
    { token: 'string.link.md', foreground: '0B63C4' },
    { token: 'variable.md', foreground: '9A5B00' },
    { token: 'tag.md', foreground: '0B7A5C' }
  ],
  colors: {
    'editor.background': '#FFFFFF',
    'editorLineNumber.foreground': '#A4AAB0',
    'editorLineNumber.activeForeground': '#3A3F44',
    'editorCursor.foreground': '#06875F',
    'editor.lineHighlightBackground': '#F4F6F6',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#10B98138',
    'editor.inactiveSelectionBackground': '#10B9811E',
    'editorWidget.background': '#FFFFFF',
    'editorWidget.border': '#D9DDDF',
    'editorSuggestWidget.background': '#FFFFFF',
    'editorSuggestWidget.border': '#D9DDDF',
    'editorSuggestWidget.selectedBackground': '#0A9D6E22',
    'menu.background': '#FFFFFF',
    'menu.foreground': '#1B1F22',
    'menu.selectionBackground': '#0A9D6E22',
    'menu.selectionForeground': '#1B1F22',
    'menu.selectionBorder': '#00000000',
    'list.hoverBackground': '#0A9D6E22',
    'list.hoverForeground': '#1B1F22',
    'menu.separatorBackground': '#D9DDDF',
    'menu.border': '#D9DDDF',
    'editorHoverWidget.background': '#FFFFFF',
    'editorHoverWidget.border': '#D9DDDF',
    'editorActionList.background': '#FFFFFF',
    'editorActionList.foreground': '#1B1F22',
    'editorActionList.focusBackground': '#0A9D6E22',
    'editorActionList.focusForeground': '#1B1F22',
    focusBorder: '#0A9D6E99'
  }
}

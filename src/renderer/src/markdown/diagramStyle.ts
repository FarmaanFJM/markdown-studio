import { diagramVariant, type ResolvedTheme } from '@shared/presentation/theme'
import type { DiagramStyle } from './diagrams'

/** Diagram colours and typography follow the document theme. */
export function diagramStyleFor(theme: ResolvedTheme): DiagramStyle {
  return {
    variant: diagramVariant(theme),
    // Mermaid measures text with this font; it must be a real, installed font stack.
    fontFamily: theme.bodyFont,
    accent: theme.accent
  }
}

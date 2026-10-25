/**
 * Registers the commands of features that live in their own modules (dialogs, templates, the
 * outline...). Imported once by the application shell so the registry is complete before the
 * editor builds its menus.
 */
import { registerCommands } from './registry'

registerCommands([])

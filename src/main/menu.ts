import { app, BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { IPC, type MenuCommand } from '@shared/ipc'

const REPOSITORY_URL = 'https://github.com/FarmaanFJM/markdown-studio'

/**
 * Builds the native application menu.
 *
 * Keyboard shortcuts are handled inside the renderer so they work identically with Monaco
 * focused, in automation, and on every platform; menu accelerators are therefore display-only
 * (`registerAccelerator: false`). Clipboard items use native roles, which Monaco supports.
 */
export function buildApplicationMenu(window: BrowserWindow, recentWorkspaces: string[]): void {
  const send = (command: MenuCommand, argument?: string) => () => {
    if (!window.isDestroyed()) window.webContents.send(IPC.menuCommand, { command, argument })
  }
  const item = (
    label: string,
    command: MenuCommand,
    accelerator?: string,
    extra: Partial<MenuItemConstructorOptions> = {}
  ): MenuItemConstructorOptions => ({
    label,
    accelerator,
    registerAccelerator: false,
    click: send(command),
    ...extra
  })

  // Commands owned by the renderer's registry; the accelerator is shown but handled in-page.
  const cmd = (
    label: string,
    id: string,
    accelerator?: string,
    extra: Partial<MenuItemConstructorOptions> = {}
  ): MenuItemConstructorOptions => ({
    label,
    accelerator,
    registerAccelerator: false,
    click: send('app.command', id),
    ...extra
  })

  const recent: MenuItemConstructorOptions[] =
    recentWorkspaces.length > 0
      ? recentWorkspaces.map((path) => ({ label: path, click: send('file.openFolder', path) }))
      : [{ label: 'No recent folders', enabled: false }]

  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: '&File',
      submenu: [
        item('New Markdown File', 'file.new', 'CmdOrCtrl+N'),
        cmd('New File from Template…', 'template.newDocument', 'CmdOrCtrl+Shift+N'),
        item('Open File…', 'file.open', 'CmdOrCtrl+O'),
        item('Open Folder…', 'file.openFolder'),
        { label: 'Open Recent Folder', submenu: recent },
        { type: 'separator' },
        item('Save', 'file.save', 'CmdOrCtrl+S'),
        item('Save As…', 'file.saveAs', 'CmdOrCtrl+Shift+S'),
        item('Save All', 'file.saveAll'),
        { type: 'separator' },
        item('Export as HTML…', 'file.exportHtml'),
        item('Export as PDF…', 'file.exportPdf'),
        { type: 'separator' },
        cmd('Save Document as Template…', 'template.saveDocument'),
        cmd('Save Selection as Snippet or Template…', 'template.saveSelection'),
        cmd('Manage Templates and Snippets…', 'template.manage'),
        { type: 'separator' },
        item('Settings', 'view.settings', 'CmdOrCtrl+,'),
        { type: 'separator' },
        item('Close Editor', 'file.closeEditor', 'CmdOrCtrl+W'),
        item('Close Folder', 'file.closeFolder'),
        // On macOS, Quit lives in the application menu.
        ...(isMac
          ? []
          : [{ type: 'separator' as const }, { label: 'E&xit', click: () => window.close() }])
      ]
    },
    {
      label: '&Edit',
      submenu: [
        item('Undo', 'edit.undo', 'CmdOrCtrl+Z'),
        item('Redo', 'edit.redo', isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y'),
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        item('Select All', 'edit.selectAll', 'CmdOrCtrl+A'),
        { type: 'separator' },
        item('Find', 'edit.find', 'CmdOrCtrl+F'),
        item('Replace', 'edit.replace', isMac ? 'Cmd+Alt+F' : 'Ctrl+H')
      ]
    },
    {
      label: 'F&ormat',
      submenu: [
        cmd('Bold', 'markdown.bold', 'CmdOrCtrl+Shift+B'),
        cmd('Italic', 'markdown.italic', 'CmdOrCtrl+I'),
        cmd('Strikethrough', 'markdown.strikethrough', 'CmdOrCtrl+Shift+X'),
        cmd('Inline Code', 'markdown.inlineCode', 'CmdOrCtrl+E'),
        { type: 'separator' },
        {
          label: 'Heading',
          submenu: [
            cmd('Paragraph', 'markdown.paragraph'),
            ...[1, 2, 3, 4, 5, 6].map((n) => cmd(`Heading ${n}`, `markdown.heading${n}`)),
            { type: 'separator' },
            cmd('Increase Heading Level', 'markdown.headingUp', 'CmdOrCtrl+Shift+]'),
            cmd('Decrease Heading Level', 'markdown.headingDown', 'CmdOrCtrl+Shift+[')
          ]
        },
        cmd('Bulleted List', 'markdown.bulletList', 'CmdOrCtrl+Shift+8'),
        cmd('Numbered List', 'markdown.orderedList', 'CmdOrCtrl+Shift+7'),
        cmd('Task List', 'markdown.taskList', 'CmdOrCtrl+Shift+9'),
        cmd('Blockquote', 'markdown.blockquote', 'CmdOrCtrl+Shift+.'),
        { type: 'separator' },
        cmd('Fix All Automatic Style Problems', 'problems.fixAll')
      ]
    },
    {
      label: '&Insert',
      submenu: [
        cmd('Link', 'insert.link', 'CmdOrCtrl+K'),
        cmd('Image', 'insert.image', 'CmdOrCtrl+Shift+G'),
        cmd('Code Block', 'insert.codeBlock', 'CmdOrCtrl+Shift+M'),
        cmd('Horizontal Rule', 'insert.horizontalRule'),
        cmd('Collapsible Section', 'insert.details'),
        { type: 'separator' },
        cmd('Table…', 'table.insert', 'CmdOrCtrl+Shift+T'),
        cmd('Table of Contents', 'toc.insert'),
        cmd('Update Table of Contents', 'toc.update'),
        { type: 'separator' },
        cmd('Saved Snippet…', 'snippet.insertSaved')
      ]
    },
    {
      label: '&Table',
      submenu: [
        cmd('Format Table', 'table.format', 'Alt+Shift+F'),
        cmd('Format Tables in Selection', 'table.formatSelection'),
        cmd('Format All Tables', 'table.formatAll'),
        cmd('Edit Table Visually…', 'table.editVisually', 'Alt+Shift+T'),
        { type: 'separator' },
        cmd('Insert Row Above', 'table.insertRowAbove'),
        cmd('Insert Row Below', 'table.insertRowBelow'),
        cmd('Delete Row', 'table.deleteRow'),
        cmd('Insert Column Left', 'table.insertColumnLeft'),
        cmd('Insert Column Right', 'table.insertColumnRight'),
        cmd('Delete Column', 'table.deleteColumn'),
        { type: 'separator' },
        cmd('Align Column Left', 'table.alignLeft'),
        cmd('Center Column', 'table.alignCenter'),
        cmd('Align Column Right', 'table.alignRight'),
        cmd('Reset Column Alignment', 'table.alignNone')
      ]
    },
    {
      label: '&View',
      submenu: [
        cmd('Command Palette…', 'palette.open', 'CmdOrCtrl+Shift+P'),
        cmd('Go to Heading…', 'navigate.heading', 'CmdOrCtrl+Shift+O'),
        cmd('Next Problem', 'problems.next', 'F8'),
        { type: 'separator' },
        item('Explorer', 'view.explorer', 'CmdOrCtrl+Shift+E'),
        item('Toggle Sidebar', 'view.toggleSidebar', 'CmdOrCtrl+B'),
        { type: 'separator' },
        item('Source Only', 'view.previewNone'),
        item('Source and HTML Preview', 'view.previewHtml'),
        item('Source and PDF Preview', 'view.previewPdf'),
        item('Toggle Preview', 'view.togglePreview', 'CmdOrCtrl+Shift+V'),
        { type: 'separator' },
        item('Explorer as Tree', 'view.explorerTree'),
        item('Explorer as Thumbnails', 'view.explorerThumbnails'),
        { type: 'separator' },
        cmd('Toggle Formatting Toolbar', 'view.toggleToolbar'),
        item('Toggle Word Wrap', 'view.toggleWordWrap', 'Alt+Z'),
        item('Increase Editor Font Size', 'view.fontIncrease', 'CmdOrCtrl+='),
        item('Decrease Editor Font Size', 'view.fontDecrease', 'CmdOrCtrl+-'),
        item('Reset Editor Font Size', 'view.fontReset', 'CmdOrCtrl+0'),
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: '&Help',
      submenu: [
        item('Keyboard Shortcuts', 'help.shortcuts'),
        {
          label: 'Markdown Studio on GitHub',
          click: () => void shell.openExternal(REPOSITORY_URL)
        },
        { type: 'separator' },
        item(`About ${app.getName()}`, 'help.about')
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

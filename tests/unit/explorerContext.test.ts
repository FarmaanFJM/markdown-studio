import { describe, expect, it } from 'vitest'
import { ancestorFolders, folderForSelection } from '@shared/explorerContext'

const root = '/work/Atlas'

describe('thumbnail navigation context', () => {
  it('opens at the selected folder', () => {
    expect(folderForSelection(root, `${root}/docs/guides`, true, root)).toBe(`${root}/docs/guides`)
  })

  it('opens at the folder of the selected file', () => {
    expect(folderForSelection(root, `${root}/docs/guides/setup.md`, false, root)).toBe(
      `${root}/docs/guides`
    )
  })

  it('opens at the root only when the root is what is selected', () => {
    expect(folderForSelection(root, root, true, `${root}/docs`)).toBe(root)
    expect(folderForSelection(root, `${root}/README.md`, false, `${root}/docs`)).toBe(root)
  })

  it('keeps the folder already being browsed when nothing is selected', () => {
    expect(folderForSelection(root, null, false, `${root}/docs`)).toBe(`${root}/docs`)
    expect(folderForSelection(root, null, false, null)).toBe(root)
  })

  it('ignores a selection outside the workspace', () => {
    expect(folderForSelection(root, '/elsewhere/a.md', false, `${root}/docs`)).toBe(`${root}/docs`)
  })

  it('works with Windows paths', () => {
    expect(folderForSelection('C:\\Work\\Atlas', 'C:\\Work\\Atlas\\docs\\a.md', false, null)).toBe(
      'C:/Work/Atlas/docs'
    )
  })

  it('lists the folders to reveal in the tree, outermost first', () => {
    expect(ancestorFolders(root, `${root}/docs/guides`)).toEqual([
      `${root}/docs`,
      `${root}/docs/guides`
    ])
    expect(ancestorFolders(root, root)).toEqual([])
  })
})

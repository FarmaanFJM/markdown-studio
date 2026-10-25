import { describe, expect, it } from 'vitest'
import {
  basename,
  dirname,
  extname,
  isAbsolutePath,
  isPathInside,
  joinPath,
  normalizePath,
  pathsEqual,
  relativePath
} from '@shared/paths'

describe('paths', () => {
  it('normalises POSIX and Windows paths to forward slashes', () => {
    expect(normalizePath('/home/user/./docs/../notes/a.md')).toBe('/home/user/notes/a.md')
    expect(normalizePath('C:\\Users\\Ana\\Docs\\..\\README.md')).toBe('C:/Users/Ana/README.md')
    expect(normalizePath('c:/x')).toBe('C:/x')
    expect(normalizePath('\\\\server\\share\\dir\\file.md')).toBe('//server/share/dir/file.md')
    expect(normalizePath('a/../../b')).toBe('../b')
  })

  it('detects absolute paths', () => {
    expect(isAbsolutePath('/tmp')).toBe(true)
    expect(isAbsolutePath('C:\\tmp')).toBe(true)
    expect(isAbsolutePath('\\\\srv\\share')).toBe(true)
    expect(isAbsolutePath('assets/a.png')).toBe(false)
  })

  it('splits names', () => {
    expect(dirname('/a/b/c.md')).toBe('/a/b')
    expect(dirname('C:\\a\\b.md')).toBe('C:/a')
    expect(basename('C:\\a\\b.md')).toBe('b.md')
    expect(extname('photo.JPEG')).toBe('.jpeg')
    expect(extname('.gitignore')).toBe('')
    expect(joinPath('/root/project', 'assets', 'x.png')).toBe('/root/project/assets/x.png')
    expect(joinPath('/root/project/docs', '../assets/x.png')).toBe('/root/project/assets/x.png')
  })

  it('computes relative paths for nested documents', () => {
    expect(relativePath('/p', '/p/assets/a.png')).toBe('assets/a.png')
    expect(relativePath('/p/docs', '/p/assets/a.png')).toBe('../assets/a.png')
    expect(relativePath('/p/docs/deep/er', '/p/a.png')).toBe('../../../a.png')
    expect(relativePath('/p/assets', '/p/assets/a.png')).toBe('a.png')
    expect(relativePath('C:\\Proj\\Docs', 'c:/proj/assets/x.png')).toBe('../assets/x.png')
  })

  it('returns null across Windows drives', () => {
    expect(relativePath('C:/docs', 'D:/images/a.png')).toBeNull()
  })

  it('compares Windows paths case-insensitively but POSIX paths exactly', () => {
    expect(pathsEqual('C:\\Docs\\A.md', 'c:/docs/a.md')).toBe(true)
    expect(pathsEqual('/docs/A.md', '/docs/a.md')).toBe(false)
    expect(isPathInside('/p', '/p/a/b')).toBe(true)
    expect(isPathInside('/p', '/p')).toBe(true)
    expect(isPathInside('/p', '/pa/b')).toBe(false)
    expect(isPathInside('C:/Work', 'c:\\work\\x.md')).toBe(true)
  })
})

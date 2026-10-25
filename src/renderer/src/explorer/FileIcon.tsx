import {
  File,
  FileCode,
  FileImage,
  FileText,
  FileType,
  Folder,
  FolderOpen,
  Globe
} from 'lucide-react'
import { fileKind } from '@shared/fileTypes'

interface FileIconProps {
  name: string
  directory?: boolean
  open?: boolean
  size?: number
}

/** Compact file-type icon used by the Explorer, tabs and thumbnail tiles. */
export function FileIcon({ name, directory, open, size = 16 }: FileIconProps) {
  const props = { size, strokeWidth: 1.6, 'aria-hidden': true }
  if (directory) {
    return open ? (
      <FolderOpen {...props} className="file-icon icon-folder" />
    ) : (
      <Folder {...props} className="file-icon icon-folder" />
    )
  }
  switch (fileKind(name)) {
    case 'markdown':
      return <FileText {...props} className="file-icon icon-markdown" />
    case 'image':
      return <FileImage {...props} className="file-icon icon-image" />
    case 'pdf':
      return <FileType {...props} className="file-icon icon-pdf" />
    case 'html':
      return <Globe {...props} className="file-icon icon-code" />
    case 'code':
      return <FileCode {...props} className="file-icon icon-code" />
    default:
      return <File {...props} className="file-icon icon-other" />
  }
}

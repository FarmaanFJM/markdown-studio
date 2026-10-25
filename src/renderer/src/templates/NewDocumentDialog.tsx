import { useEffect, useRef, useState } from 'react'
import { fileNameFromTitle, usedVariables, type Template } from '@shared/templates'
import { Modal } from '../dialogs/Modal'
import { validateName } from '../explorer/actions'

export interface NewDocumentValues {
  title: string
  author: string
  fileName: string
}

interface Props {
  template: Template
  /** Where the file will be created, shown to the user; null when no folder is open. */
  folderLabel: string | null
  defaultAuthor: string
  /** Referenced files that will not exist next to the new document. */
  findMissingFiles(): Promise<string[]>
  /** Creates the document; returns an error message to keep the dialog open, or null. */
  submit(values: NewDocumentValues): Promise<string | null>
  onDone(created: boolean): void
}

/** Asks for the values a template needs, then creates the document. */
export function NewDocumentDialog({
  template,
  folderLabel,
  defaultAuthor,
  findMissingFiles,
  submit,
  onDone
}: Props) {
  const used = usedVariables(template.body)
  const asksTitle = used.has('title')
  const asksAuthor = used.has('author')
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState(defaultAuthor)
  const [fileName, setFileName] = useState('Untitled.md')
  const [fileNameEdited, setFileNameEdited] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState<string[]>([])
  const first = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    void findMissingFiles().then((files) => !cancelled && setMissing(files))
    return () => {
      cancelled = true
    }
    // The check depends on the template and folder only, which are fixed for this dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const changeTitle = (value: string) => {
    setTitle(value)
    setError(null)
    if (!fileNameEdited) setFileName(`${fileNameFromTitle(value)}.md`)
  }

  const create = async () => {
    if (asksTitle && !title.trim()) return setError('Enter a title for the document.')
    if (folderLabel !== null) {
      const problem = validateName(fileName)
      if (problem) return setError(problem)
    }
    setBusy(true)
    const failure = await submit({
      title: title.trim(),
      author: author.trim(),
      fileName: fileName.trim()
    })
    setBusy(false)
    if (failure) setError(failure)
    else onDone(true)
  }

  return (
    <Modal
      title={`New Document: ${template.name}`}
      size="wide"
      onCancel={() => onDone(false)}
      footer={
        <>
          <button
            type="button"
            className="button primary"
            disabled={busy}
            data-testid="new-document-create"
            onClick={() => void create()}
          >
            Create Document
          </button>
          <button type="button" className="button" onClick={() => onDone(false)}>
            Cancel
          </button>
        </>
      }
    >
      <form
        className="template-form"
        onSubmit={(event) => {
          event.preventDefault()
          void create()
        }}
      >
        {asksTitle && (
          <div className="form-row">
            <label className="field-label" htmlFor="new-doc-title">
              Title
            </label>
            <input
              id="new-doc-title"
              ref={first}
              className="text-input wide"
              value={title}
              data-autofocus
              placeholder="Document title"
              onChange={(event) => changeTitle(event.target.value)}
            />
          </div>
        )}
        {asksAuthor && (
          <div className="form-row">
            <label className="field-label" htmlFor="new-doc-author">
              Author
            </label>
            <input
              id="new-doc-author"
              className="text-input wide"
              value={author}
              placeholder="Your name (leave empty to omit)"
              onChange={(event) => setAuthor(event.target.value)}
            />
          </div>
        )}
        {folderLabel !== null ? (
          <div className="form-row">
            <label className="field-label" htmlFor="new-doc-file">
              File name in {folderLabel}
            </label>
            <input
              id="new-doc-file"
              className="text-input wide"
              value={fileName}
              spellCheck={false}
              data-autofocus={asksTitle ? undefined : ''}
              aria-invalid={error !== null}
              onChange={(event) => {
                setFileName(event.target.value)
                setFileNameEdited(true)
                setError(null)
              }}
            />
          </div>
        ) : (
          <p className="muted">
            No folder is open, so a new unsaved document is created. You choose where to save it.
          </p>
        )}
        {missing.length > 0 && (
          <div className="template-warning" role="note" data-testid="new-document-missing">
            <p>
              The template refers to {missing.length === 1 ? 'a file' : 'files'} that{' '}
              {missing.length === 1 ? 'does' : 'do'} not exist at the new document&apos;s location.
              The references are kept as written; fix them or add the files later.
            </p>
            <ul className="file-list scroll-list">
              {missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {/* Enter submits from any field. */}
        <button type="submit" hidden tabIndex={-1} />
      </form>
    </Modal>
  )
}

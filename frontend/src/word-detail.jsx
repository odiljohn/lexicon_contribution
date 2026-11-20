import React, { useEffect, useRef, useState } from 'react'
import { ArrowLeft, BookOpen, Folder, Menu, Pencil } from 'lucide-react'
import { MarkdownDocument } from './word-document'
import { documentSource, parseDocument } from './document-format'

export default function WordDetail({ note, folder, draftScope, backLabel, onBack, onFolder, onOpenNavigation, onSave }) {
  const source = documentSource(note)
  const storageKey = 'lexicon-word-draft-' + draftScope + '-' + note.id
  const [draft, setDraft] = useState(() => {
    try { return sessionStorage.getItem(storageKey) ?? source } catch { return source }
  })
  const [editing, setEditing] = useState(draft !== source)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const input = useRef(null)
  const reading = useRef(null)
  const submitting = useRef(false)
  const dirty = draft !== source

  useEffect(() => {
    try {
      if (dirty) sessionStorage.setItem(storageKey, draft)
      else sessionStorage.removeItem(storageKey)
    } catch { /* Editing still works when browser storage is unavailable. */ }
  }, [draft, dirty, storageKey])
  useEffect(() => {
    if (editing) input.current?.focus({ preventScroll: true })
    else reading.current?.focus({ preventScroll: true })
  }, [editing])

  async function toggleMode() {
    if (submitting.current) return
    if (!editing) { setDraft(source); setEditing(true); setStatus(''); return }
    if (!dirty) { setEditing(false); setError(''); return }
    let fields
    try { fields = parseDocument(draft) } catch (failure) { setError(failure.message); return }
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      const saved = await onSave({ ...fields, folderId: note.folderId })
      try { sessionStorage.removeItem(storageKey) } catch { /* Storage may be unavailable. */ }
      setDraft(documentSource(saved))
      setEditing(false)
      setStatus('Saved')
    } catch (failure) {
      setError(failure.message)
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return <>
    <header className="topbar document-toolbar">
      <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={onOpenNavigation}><Menu size={23} /></button>
      <button className="document-back" onClick={onBack}><ArrowLeft size={18} /><span>{backLabel}</span></button>
      <button className="secondary mode-toggle" aria-pressed={editing} title={editing ? 'Save and switch to reading mode' : 'Switch to edit mode'} disabled={busy} onClick={toggleMode}>{editing ? <BookOpen size={17} /> : <Pencil size={17} />}{busy ? 'Saving…' : editing ? 'Read mode' : 'Edit'}</button>
    </header>
    <section className="document-page">
      <div className="document-meta"><button className="document-folder" onClick={onFolder}><Folder size={15} className={'ink-' + (folder?.color ?? 'blue')} />{folder?.name ?? 'Folder'}</button><span role="status">{busy ? 'Saving…' : editing ? dirty ? 'Unsaved changes' : 'Editing' : status}</span></div>
      {error && <p className="error document-error" role="alert">{error}</p>}
      {editing ? <>
        <label className="sr-only" htmlFor="word-document">Word and description</label>
        <textarea id="word-document" className="document-editor" ref={input} aria-describedby="document-help" value={draft} disabled={busy} onChange={event => { setDraft(event.target.value); setError('') }} onKeyDown={event => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); toggleMode() }
        }} />
        <p id="document-help" className="document-help">First line: word or phrase. Use # for a heading and ## for a subheading.</p>
      </> : <article className="document-reading" ref={reading} tabIndex={-1} aria-label={note.title}>
        <h1>{note.title}</h1>
        <MarkdownDocument text={note.description} />
        {!note.description && <button className="text-button" onClick={toggleMode}>Add a description</button>}
      </article>}
    </section>
  </>
}

import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowUpDown, BookOpen, ChevronLeft, Folder, FolderPlus, LayoutGrid, Menu, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import './style.css'

async function api(path, method = 'GET', body) {
  const response = await fetch('/api/' + path, {
    method,
    ...(body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !Array.isArray(result.notes)) {
    throw new Error(result.error || 'Could not connect to Lexicon. Try again.')
  }
  return result
}

function Editor({ edit, folders, close, onSaved }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const note = edit.note
  const dialog = useRef(null)
  useEffect(() => { dialog.current.showModal() }, [])
  const deleting = edit.type === 'delete'
  const isFolder = edit.type === 'folder'
  const heading = deleting ? 'Delete word?' : isFolder ? 'New folder' : note ? 'Edit word' : 'Add word'

  async function submit(event) {
    event.preventDefault()
    const fields = Object.fromEntries(new FormData(event.currentTarget))
    setBusy(true)
    setError('')
    try {
      let workspace
      if (isFolder) {
        workspace = await api('folders', 'POST', fields)
      } else if (deleting) {
        workspace = await api('notes/' + note.id, 'DELETE')
      } else {
        workspace = await api(note ? 'notes/' + note.id : 'notes', note ? 'PATCH' : 'POST', {
          ...fields, folderId: Number(fields.folderId),
        })
      }
      onSaved(workspace)
    } catch (failure) {
      setError(failure.message)
      setBusy(false)
    }
  }

  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); if (!busy) close() }} aria-labelledby="editor-title">
    <div className="dialog-head"><h2 id="editor-title">{heading}</h2><button className="icon-button" aria-label="Close" disabled={busy} onClick={close}><X size={20} /></button></div>
    <form onSubmit={submit}>
      {deleting ? <p>Delete “{note.title}” from your vocabulary?</p> : isFolder ?
        <label>Folder name<input name="name" placeholder="e.g. Spanish" required maxLength={60} autoFocus /></label> :
        <>
          <label>Word or phrase<input name="title" defaultValue={note?.title} placeholder="e.g. Serendipity" maxLength={120} required autoFocus /></label>
          <label>Description <span>(optional)</span><textarea name="description" defaultValue={note?.description} maxLength={4000} rows={4} placeholder="Add a meaning, translation, or example" /></label>
          <label>Folder<select name="folderId" defaultValue={note?.folderId ?? edit.folder ?? folders[0]?.id}>
            {folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select></label>
        </>}
      {error && <p role="alert" className="error">{error}</p>}
      <div className="dialog-actions">
        <button className="secondary" type="button" onClick={close} disabled={busy}>Cancel</button>
        <button className={deleting ? 'danger' : 'primary'} disabled={busy}>{busy ? 'Saving…' : deleting ? 'Delete word' : isFolder ? 'Create folder' : 'Save word'}</button>
      </div>
    </form>
  </dialog>
}

function QuickAdd({ folders, folderId, inputRef, onSaved }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [selectedFolder, setSelectedFolder] = useState(folderId ?? folders[0]?.id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const submitting = useRef(false)

  useEffect(() => {
    setSelectedFolder(folderId ?? folders[0]?.id)
  }, [folderId, folders[0]?.id])

  async function submit(event) {
    event.preventDefault()
    if (submitting.current || !title.trim()) return
    submitting.current = true
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const data = await api('notes', 'POST', { title: title.trim(), description: description.trim(), folderId: selectedFolder })
      onSaved(data)
      setStatus('Saved “' + title.trim() + '” to ' + folders.find(item => item.id === selectedFolder)?.name + '.')
      setTitle('')
      setDescription('')
    } catch (failure) {
      setError(failure.message)
    } finally {
      submitting.current = false
      setBusy(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  return <form className="quick-add" onSubmit={submit} aria-label="Quick add word">
    <div className="quick-add-row">
      <Plus size={19} aria-hidden="true" />
      <input ref={inputRef} aria-label="New word or phrase" placeholder="Save a word or phrase…" maxLength={120} required value={title} disabled={busy} onChange={event => { setTitle(event.target.value); setStatus('') }} />
      {folderId === null ? <select aria-label="Save word to folder" value={selectedFolder ?? ''} disabled={busy} onChange={event => setSelectedFolder(Number(event.target.value))}>{folders.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : <span className="quick-folder"><Folder size={14} />{folders.find(item => item.id === folderId)?.name}</span>}
      <button className="primary" disabled={busy || !title.trim()}>{busy ? 'Saving…' : 'Save word'}</button>
    </div>
    <div className="quick-add-options"><button type="button" className="text-button" aria-expanded={expanded} aria-controls="quick-description" onClick={() => setExpanded(value => !value)}>{expanded ? 'Hide description' : 'Add description'}</button><span>Enter to save</span></div>
    <div id="quick-description" hidden={!expanded}><label className="sr-only" htmlFor="quick-description-input">Description (optional)</label><textarea id="quick-description-input" placeholder="Meaning, translation, or example (optional)" value={description} disabled={busy} maxLength={4000} rows={3} onChange={event => setDescription(event.target.value)} /></div>
    {error && <p className="error" role="alert">{error}</p>}
    <p className="save-status" role="status">{status}</p>
  </form>
}

function WordActions({ note, onEdit }) {
  const disclosure = useRef(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    function dismiss(event) {
      if (!disclosure.current?.contains(event.target)) disclosure.current.open = false
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])

  function choose(type) {
    disclosure.current.open = false
    onEdit({ type, note })
  }

  return <details className="word-actions" ref={disclosure} onToggle={event => setOpen(event.currentTarget.open)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false }} onKeyDown={event => {
    if (event.key === 'Escape') { disclosure.current.open = false; disclosure.current.querySelector('summary').focus(); event.stopPropagation() }
  }}>
    <summary className="icon-button" aria-label={'Actions for ' + note.title} title="Word actions"><MoreHorizontal size={19} /></summary>
    <div className="word-actions-list"><button type="button" onClick={() => choose('note')}><Pencil size={15} />Edit word</button><button type="button" className="remove" onClick={() => choose('delete')}><Trash2 size={15} />Delete word</button></div>
  </details>
}

function App() {
  const [workspace, setWorkspace] = useState(null)
  const [error, setError] = useState('')
  const [folderId, setFolderId] = useState(null)
  const [query, setQuery] = useState('')
  const [alphabetical, setAlphabetical] = useState(false)
  const [edit, setEdit] = useState(null)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const navigationBrand = useRef(null)
  const quickInput = useRef(null)

  useEffect(() => {
    if (!navigationOpen) return
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    navigationBrand.current?.focus()
    function onKeyDown(event) {
      if (event.key === 'Escape') setNavigationOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [navigationOpen])

  function load() {
    setError('')
    api('workspace').then(setWorkspace).catch(failure => setError(failure.message))
  }
  useEffect(load, [])

  const folders = workspace?.folders ?? []
  const notes = workspace?.notes ?? []
  const folder = folders.find(item => item.id === folderId)
  const term = query.trim().toLocaleLowerCase()
  const visible = notes.filter(note => (
    (term || !folder || note.folderId === folder.id) &&
    (!term || [note.title, note.description].some(value => value.toLocaleLowerCase().includes(term)))
  ))
  if (alphabetical) visible.sort((a, b) => a.title.localeCompare(b.title))
  const title = term ? 'Search results' : folder?.name ?? 'All words'

  function navigate(id) {
    setFolderId(id)
    setQuery('')
    setNavigationOpen(false)
  }

  return <div className={sidebarCollapsed ? 'layout sidebar-collapsed' : 'layout'}>
    {navigationOpen && <button className="scrim" aria-label="Close navigation" onClick={() => setNavigationOpen(false)} />}
    <aside id="library-sidebar" className={navigationOpen ? 'sidebar open' : 'sidebar'}>
      <button type="button" className="sidebar-toggle" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!sidebarCollapsed} aria-controls="library-sidebar" title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setSidebarCollapsed(value => !value)}>
        <ChevronLeft size={20} />
      </button>
      <div className="sidebar-header">
        <button ref={navigationBrand} className="brand" aria-label="Lexicon — All words" title="Lexicon" onClick={() => navigate(null)}><span className="mark" aria-hidden="true"><i /><i /></span><span className="brand-name">Lexicon</span></button>
      </div>
      <nav aria-label="Vocabulary">
        <button className={folderId === null ? 'nav-item selected' : 'nav-item'} aria-label="All words" title="All words" aria-current={folderId === null ? 'page' : undefined} onClick={() => navigate(null)}><span className="nav-icon"><LayoutGrid size={18} /></span><span className="nav-label">All words</span><span className="nav-count">{notes.length}</span></button>
        <div className="nav-heading folders-heading">Folders</div>
        {workspace && !folders.length && <p className="folders-empty">No folders yet</p>}
        {folders.map(item => <button className={folderId === item.id ? 'nav-item selected' : 'nav-item'} aria-label={item.name} title={item.name} aria-current={folderId === item.id ? 'page' : undefined} key={item.id} onClick={() => navigate(item.id)}>
          <span className={'nav-icon ink-' + item.color} aria-hidden="true"><Folder size={18} /><span className="folder-initial">{Array.from(item.name.trim())[0]?.toLocaleUpperCase()}</span></span><span className="nav-label">{item.name}</span><span className="nav-count">{notes.filter(note => note.folderId === item.id).length}</span>
        </button>)}
      </nav>
      <div className="sidebar-actions"><button className="nav-item create-folder" aria-label="New folder" title="New folder" disabled={!workspace} onClick={() => setEdit({ type: 'folder' })}><FolderPlus size={20} /><span className="nav-label">New folder</span></button></div>
    </aside>
    <main>
      <header className="topbar">
        <button className="icon-button mobile-menu" aria-label="Open navigation" aria-controls="library-sidebar" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(true)}><Menu size={23} /></button>
        <div className="search"><Search size={19} /><input aria-label="Search words across all folders" placeholder="Search all folders…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button className="icon-button" aria-label="Clear search" onClick={() => setQuery('')}><X size={16} /></button>}</div>
        <button className="primary add-word" disabled={!workspace} onClick={() => {
          if (!folders.length) setEdit({ type: 'folder' })
          else { quickInput.current?.scrollIntoView({ block: 'center' }); quickInput.current?.focus({ preventScroll: true }) }
        }}><Plus size={20} /> Add word</button>
      </header>
      <div className="content">
        <header className="page-heading"><h1>{title}</h1><p>{term ? 'Titles and descriptions · All folders' : `${visible.length} ${visible.length === 1 ? 'word' : 'words'}${folder ? ' in this folder' : ' in your vocabulary'}`}</p></header>
        {workspace && folders.length > 0 && <QuickAdd folders={folders} folderId={folderId} inputRef={quickInput} onSaved={data => { setWorkspace(data); setQuery('') }} />}
        {workspace && !folders.length && <div className="first-folder"><p>Create a folder to start saving words.</p><button className="secondary" onClick={() => setEdit({ type: 'folder' })}><FolderPlus size={17} />Create folder</button></div>}
        {term && <div className="search-context"><span>Searching all folders for “{query.trim()}”</span><button className="text-button" onClick={() => setQuery('')}>Back to {folder?.name ?? 'all words'}</button></div>}
        <div className="list-heading"><div><h2>{term ? 'Matches' : folder ? 'Folder words' : alphabetical ? 'Saved words' : 'Recent words'}</h2><p aria-live="polite">{visible.length} {visible.length === 1 ? 'word' : 'words'}</p></div>
          <button className="secondary sort" aria-pressed={alphabetical} onClick={() => setAlphabetical(value => !value)}><ArrowUpDown size={16} /> {alphabetical ? 'A–Z' : 'Newest first'}</button>
        </div>
        {error ? <div className="empty" role="alert"><p>{error}</p><button className="secondary" onClick={load}>Retry</button></div> :
          !workspace ? <p role="status" className="empty">Loading your vocabulary…</p> :
          !visible.length ? <div className="empty"><BookOpen size={24} /><h3>{term ? 'No matching words' : 'No words yet'}</h3><p>{term ? 'Try a different word, meaning, or translation.' : folders.length ? 'Save your first word using the field above.' : 'Your words will appear here once you create a folder.'}</p>{term && <button className="secondary" onClick={() => setQuery('')}>Clear search</button>}</div> :
          <div className="word-grid">{visible.map(note => {
            const group = folders.find(item => item.id === note.folderId)
            return <article className="word-card" data-color={group?.color ?? 'blue'} key={note.id}>
              <div className="card-top"><button type="button" className="tag" disabled={!group} aria-label={group ? 'Open folder ' + group.name : 'Folder unavailable'} onClick={() => navigate(note.folderId)}><Folder size={13} />{group?.name}</button><WordActions note={note} onEdit={setEdit} /></div>
              <h3><button className="word-title" aria-label={'Edit ' + note.title} onClick={() => setEdit({ type: 'note', note })}>{note.title}</button></h3>
              {note.description && <p>{note.description}</p>}
              <time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time>
            </article>
          })}</div>}
      </div>
    </main>
    {edit && <Editor edit={edit} folders={folders} close={() => setEdit(null)} onSaved={data => {
      setWorkspace(data)
      if (edit.type === 'folder') navigate(data.folders.at(-1).id)
      if (edit.type === 'note') {
        const saved = edit.note ? data.notes.find(note => note.id === edit.note.id) : data.notes[0]
        if (folderId !== null) navigate(saved.folderId)
        else setQuery('')
      }
      setEdit(null)
    }} />}
  </div>
}

createRoot(document.getElementById('root')).render(<App />)

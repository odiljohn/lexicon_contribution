import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowUpDown, BookOpen, Folder, FolderPlus, LayoutGrid, Menu, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
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

function App() {
  const [workspace, setWorkspace] = useState(null)
  const [error, setError] = useState('')
  const [folderId, setFolderId] = useState(null)
  const [query, setQuery] = useState('')
  const [alphabetical, setAlphabetical] = useState(false)
  const [edit, setEdit] = useState(null)
  const [navigationOpen, setNavigationOpen] = useState(false)

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

  return <div className="layout">
    {navigationOpen && <button className="scrim" aria-label="Close navigation" onClick={() => setNavigationOpen(false)} />}
    <aside className={navigationOpen ? 'sidebar open' : 'sidebar'}>
      <button className="brand" onClick={() => navigate(null)}><span className="mark" aria-hidden="true"><i /><i /></span>Lexicon</button>
      <nav aria-label="Vocabulary">
        <div className="nav-heading">LIBRARY</div>
        <button className={folderId === null ? 'nav-item selected' : 'nav-item'} aria-current={folderId === null ? 'page' : undefined} onClick={() => navigate(null)}><LayoutGrid size={18} /> All words <span className="nav-count">{notes.length}</span></button>
        <div className="nav-heading folders-heading">FOLDERS<button className="icon-button" aria-label="New folder" disabled={!workspace} onClick={() => setEdit({ type: 'folder' })}><Plus size={18} /></button></div>
        {folders.map(item => <button className={folderId === item.id ? 'nav-item selected' : 'nav-item'} aria-current={folderId === item.id ? 'page' : undefined} key={item.id} onClick={() => navigate(item.id)}>
          <Folder className={'ink-' + item.color} size={18} /><span className="nav-label">{item.name}</span><span className="nav-count">{notes.filter(note => note.folderId === item.id).length}</span>
        </button>)}
        <button className="nav-item create-folder" disabled={!workspace} onClick={() => setEdit({ type: 'folder' })}><FolderPlus size={18} /> New folder</button>
      </nav>
      <div className="sidebar-foot"><BookOpen size={18} /><span>Personal vocabulary</span></div>
    </aside>
    <main>
      <header className="topbar">
        <button className="icon-button mobile-menu" aria-label="Open navigation" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(true)}><Menu size={23} /></button>
        <div className="search"><Search size={19} /><input aria-label="Search words across all folders" placeholder="Search your words…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button className="icon-button" aria-label="Clear search" onClick={() => setQuery('')}><X size={16} /></button>}</div>
        <button className="primary add-word" disabled={!workspace} onClick={() => setEdit(folders.length ? { type: 'note', folder: folderId } : { type: 'folder' })}><Plus size={20} /> Add word</button>
      </header>
      <div className="content">
        <section className="hero">
          <div className="hero-copy"><div className="hero-label"><BookOpen size={17} /> YOUR VOCABULARY</div><h1>{title}</h1><p>{term ? 'Matching words from across your folders.' : folder ? 'Words and phrases saved in this folder.' : 'Keep the words you discover and what they mean to you.'}</p></div>
          <div className="hero-art" aria-hidden="true"><div className="orbit" /><div className="art-sheet back" /><div className="art-sheet front"><span>Aa</span><i /><i /></div><span className="spark first">✦</span><span className="spark second">✧</span></div>
        </section>
        <div className="list-heading"><div><h2>{term ? 'Matches' : alphabetical ? 'Saved words' : 'Recent words'}</h2><p aria-live="polite">{visible.length} {visible.length === 1 ? 'word' : 'words'}</p></div>
          <button className="secondary sort" aria-pressed={alphabetical} onClick={() => setAlphabetical(value => !value)}><ArrowUpDown size={16} /> {alphabetical ? 'A–Z' : 'Newest first'}</button>
        </div>
        {error ? <div className="empty" role="alert"><p>{error}</p><button className="secondary" onClick={load}>Retry</button></div> :
          !workspace ? <p role="status" className="empty">Loading your vocabulary…</p> :
          !visible.length ? <div className="empty"><BookOpen size={24} /><h3>{term ? 'No matching words' : 'No words yet'}</h3><p>{term ? 'Try another search.' : 'Add a word whenever you find one you want to keep.'}</p></div> :
          <div className="word-grid">{visible.map(note => {
            const group = folders.find(item => item.id === note.folderId)
            return <article className="word-card" key={note.id}>
              <div className="card-top"><span className={'tag ' + (group?.color ?? 'blue')}><Folder size={13} />{group?.name}</span><div className="card-actions">
                <button className="icon-button" aria-label={'Edit ' + note.title} onClick={() => setEdit({ type: 'note', note })}><Pencil size={15} /></button>
                <button className="icon-button remove" aria-label={'Delete ' + note.title} onClick={() => setEdit({ type: 'delete', note })}><Trash2 size={15} /></button>
              </div></div>
              <h3>{note.title}</h3>
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

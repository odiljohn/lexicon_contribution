import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowUpDown, BookOpen, Check, ChevronDown, ChevronLeft, Folder, FolderPlus, LayoutGrid, Menu, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import './style.css'
import WordDetail from './word-detail'
import { request } from './api'
import { AccountGate, Avatar, ProfileEditor } from './account'

function currentWordId() {
  const match = window.location.hash.match(/^#\/words\/(\d+)$/)
  return match ? Number(match[1]) : null
}

async function api(path, method = 'GET', body) {
  const result = await request(path, method, body)
  if (!Array.isArray(result.notes)) {
    throw new Error(result.error || 'Could not connect to Lexicon. Try again.')
  }
  return result
}

function FolderChooser({ folders, defaultValue, disabled }) {
  const [value, setValue] = useState(defaultValue)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef(null)
  const trigger = useRef(null)
  const list = useRef(null)
  const options = useRef([])
  const typing = useRef({ text: '', time: 0 })
  const id = useId()
  const selected = folders.find(item => item.id === value)

  useEffect(() => {
    if (!open) return
    function dismiss(event) {
      if (!root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])
  useLayoutEffect(() => {
    if (!open) return
    const panel = list.current
    panel.showPopover()
    function position() {
      const rect = trigger.current.getBoundingClientRect()
      const viewport = window.visualViewport
      const left = viewport?.offsetLeft ?? 0
      const top = viewport?.offsetTop ?? 0
      const right = left + (viewport?.width ?? window.innerWidth)
      const bottom = top + (viewport?.height ?? window.innerHeight)
      const width = Math.min(rect.width, right - left - 16)
      panel.style.width = width + 'px'
      const below = Math.max(0, bottom - rect.bottom - 14)
      const above = Math.max(0, rect.top - top - 14)
      const desired = Math.min(240, panel.scrollHeight + 2)
      const down = below >= desired || below >= above
      const height = Math.min(desired, down ? below : above)
      panel.style.maxHeight = height + 'px'
      panel.style.left = Math.max(left + 8, Math.min(rect.left, right - width - 8)) + 'px'
      panel.style.top = (down ? rect.bottom + 6 : rect.top - 6 - height) + 'px'
    }
    position()
    const observer = new ResizeObserver(position)
    observer.observe(trigger.current)
    observer.observe(panel)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    window.visualViewport?.addEventListener('resize', position)
    window.visualViewport?.addEventListener('scroll', position)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      window.visualViewport?.removeEventListener('resize', position)
      window.visualViewport?.removeEventListener('scroll', position)
      if (panel.matches(':popover-open')) panel.hidePopover()
    }
  }, [open])
  useEffect(() => {
    if (!open) return
    const panel = list.current
    const option = options.current[active]?.getBoundingClientRect()
    const bounds = panel.getBoundingClientRect()
    if (option?.top < bounds.top + 6) panel.scrollTop -= bounds.top + 6 - option.top
    else if (option?.bottom > bounds.bottom - 6) panel.scrollTop += option.bottom - bounds.bottom + 6
  }, [active, open])
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])

  function toggle() {
    setActive(Math.max(0, folders.findIndex(item => item.id === value)))
    setOpen(value => !value)
  }
  function choose(index) {
    setValue(folders[index].id)
    setOpen(false)
    trigger.current?.focus()
  }
  function keyDown(event) {
    if (event.key === 'Tab') { setOpen(false); return }
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      return
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const current = open ? active : Math.max(0, folders.findIndex(item => item.id === value))
      setActive(event.key === 'Home' ? 0 : event.key === 'End' ? folders.length - 1 : !open ? current : (current + (event.key === 'ArrowDown' ? 1 : -1) + folders.length) % folders.length)
      setOpen(true)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) choose(active)
      else toggle()
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now()
      const text = (now - typing.current.time < 700 ? typing.current.text : '') + event.key.toLocaleLowerCase()
      typing.current = { text, time: now }
      const index = folders.findIndex(item => item.name.toLocaleLowerCase().startsWith(text))
      if (index >= 0) { event.preventDefault(); setActive(index); setOpen(true) }
    }
  }

  return <div className="folder-chooser" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <span className="field-label" id={id + '-label'}>Folder</span>
    <input type="hidden" name="folderId" value={value ?? ''} />
    <button ref={trigger} type="button" className="folder-chooser-trigger" role="combobox" aria-labelledby={id + '-label ' + id + '-value'} aria-haspopup="listbox" aria-expanded={open} aria-controls={id + '-list'} aria-activedescendant={open ? id + '-option-' + active : undefined} disabled={disabled || !folders.length} onClick={toggle} onKeyDown={keyDown}>
      <Folder className={'ink-' + (selected?.color ?? 'blue')} size={18} /><span id={id + '-value'}>{selected?.name ?? 'Choose a folder'}</span><ChevronDown className={open ? 'chooser-chevron open' : 'chooser-chevron'} size={17} />
    </button>
    {open && <div ref={list} popover="manual" id={id + '-list'} className="folder-chooser-list" role="listbox" aria-labelledby={id + '-label'}>
      {folders.map((item, index) => <div key={item.id} id={id + '-option-' + index} ref={node => { options.current[index] = node }} className={active === index ? 'folder-option active' : 'folder-option'} role="option" aria-selected={item.id === value} onPointerMove={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}><Folder className={'ink-' + item.color} size={18} /><span>{item.name}</span>{item.id === value && <Check className="folder-check" size={16} />}</div>)}
    </div>}
  </div>
}

function Editor({ edit, folders, close, onSaved }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const note = edit.note
  const dialog = useRef(null)
  useEffect(() => {
    dialog.current.showModal()
    dialog.current.querySelector('input')?.focus()
  }, [])
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
    <form className="editor-form" onSubmit={submit}>
      <div className="editor-fields">
      {deleting ? <p>Delete “{note.title}” from your vocabulary?</p> : isFolder ?
        <label>Folder name<input name="name" placeholder="e.g. Spanish" required maxLength={60} autoFocus /></label> :
        <>
          <label>Word or phrase<input name="title" defaultValue={note?.title} placeholder="e.g. Serendipity" maxLength={120} required autoFocus /></label>
          <label>Description <span>(optional)</span><textarea name="description" defaultValue={note?.description} maxLength={4000} rows={4} placeholder="Add a meaning, translation, or example" /></label>
          <FolderChooser folders={folders} defaultValue={note?.folderId ?? edit.folder ?? folders[0]?.id} disabled={busy} />
        </>}
      {error && <p role="alert" className="error">{error}</p>}
      </div>
      <div className="dialog-actions">
        <button className="secondary" type="button" onClick={close} disabled={busy}>Cancel</button>
        <button className={deleting ? 'danger' : 'primary'} disabled={busy}>{busy ? 'Saving…' : deleting ? 'Delete word' : isFolder ? 'Create folder' : 'Save word'}</button>
      </div>
    </form>
  </dialog>
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

function App({ user, onProfileUpdate, onLogout, imported }) {
  const [workspace, setWorkspace] = useState(null)
  const [error, setError] = useState('')
  const [folderId, setFolderId] = useState(null)
  const [query, setQuery] = useState('')
  const [alphabetical, setAlphabetical] = useState(false)
  const [edit, setEdit] = useState(null)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [wordId, setWordId] = useState(currentWordId)
  const [profileOpen, setProfileOpen] = useState(false)
  const [showImport, setShowImport] = useState(imported > 0)
  const navigationBrand = useRef(null)
  const listPosition = useRef(0)
  const lastWord = useRef(null)

  useEffect(() => {
    const viewport = window.visualViewport
    const root = document.documentElement
    function updateViewport() {
      const visible = window.visualViewport
      root.style.setProperty('--viewport-height', (visible?.height ?? window.innerHeight) + 'px')
      root.style.setProperty('--viewport-top', (visible?.offsetTop ?? 0) + 'px')
    }
    updateViewport()
    viewport?.addEventListener('resize', updateViewport)
    viewport?.addEventListener('scroll', updateViewport)
    window.addEventListener('resize', updateViewport)
    return () => {
      viewport?.removeEventListener('resize', updateViewport)
      viewport?.removeEventListener('scroll', updateViewport)
      window.removeEventListener('resize', updateViewport)
      root.style.removeProperty('--viewport-height')
      root.style.removeProperty('--viewport-top')
    }
  }, [])

  useEffect(() => {
    function syncRoute() { setWordId(currentWordId()) }
    window.addEventListener('hashchange', syncRoute)
    return () => window.removeEventListener('hashchange', syncRoute)
  }, [])
  useEffect(() => {
    if (wordId !== null) window.scrollTo(0, 0)
    else if (lastWord.current !== null) {
      const frame = requestAnimationFrame(() => {
        window.scrollTo(0, listPosition.current)
        document.querySelector(`[data-note-id="${lastWord.current}"] .word-title`)?.focus({ preventScroll: true })
      })
      return () => cancelAnimationFrame(frame)
    }
  }, [wordId])

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
  const selectedNote = notes.find(note => note.id === wordId)

  useEffect(() => {
    document.title = selectedNote ? selectedNote.title + ' — Lexicon' : 'Lexicon — Personal vocabulary'
  }, [selectedNote?.title])

  function openWord(id) {
    listPosition.current = window.scrollY
    lastWord.current = id
    window.location.hash = '/words/' + id
  }

  function closeWord() {
    window.location.hash = ''
  }

  function navigate(id) {
    if (wordId !== null) closeWord()
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
      <div className="sidebar-actions"><button className="profile-link" aria-label="Your profile" title={user.full_name + ' · @' + user.username} onClick={() => { setNavigationOpen(false); setProfileOpen(true) }}><Avatar user={user} /><span className="account-info"><strong>{user.full_name}</strong><small>@{user.username}</small></span></button><button className="nav-item create-folder" aria-label="New folder" title="New folder" disabled={!workspace} onClick={() => setEdit({ type: 'folder' })}><FolderPlus size={20} /><span className="nav-label">New folder</span></button></div>
    </aside>
    <main>
      {wordId !== null ? selectedNote ? <WordDetail key={selectedNote.id} draftScope={user.id} note={selectedNote} folder={folders.find(item => item.id === selectedNote.folderId)} backLabel={term ? 'Search results' : folder?.name ?? 'All words'} onBack={closeWord} onFolder={() => navigate(selectedNote.folderId)} onOpenNavigation={() => setNavigationOpen(true)} onSave={async fields => {
        const data = await api('notes/' + selectedNote.id, 'PATCH', fields)
        setWorkspace(data)
        return data.notes.find(note => note.id === selectedNote.id)
      }} /> : <div className="content"><button className="text-button" onClick={closeWord}>Back to words</button>{error ? <div className="empty" role="alert"><p>{error}</p><button className="secondary" onClick={load}>Retry</button></div> : !workspace ? <p className="empty" role="status">Loading your word…</p> : <div className="empty"><h1>Word not found</h1><p>This word may have been deleted.</p></div>}</div> : <>
      <header className="topbar">
        <button className="icon-button mobile-menu" aria-label="Open navigation" aria-controls="library-sidebar" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(true)}><Menu size={23} /></button>
        <div className="search"><Search size={19} /><input aria-label="Search words across all folders" placeholder="Search all folders…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button className="icon-button" aria-label="Clear search" onClick={() => setQuery('')}><X size={16} /></button>}</div>
        <button className="primary add-word" disabled={!workspace} onClick={() => {
          if (!folders.length) setEdit({ type: 'folder' })
          else setEdit({ type: 'note', folder: folderId })
        }}><Plus size={20} /> Add word</button>
      </header>
      <div className="content">
        {showImport && <div className="import-notice"><p role="status">Your {imported} existing {imported === 1 ? 'word has' : 'words have'} been added to your account.</p><button className="icon-button" aria-label="Dismiss import notice" onClick={() => setShowImport(false)}><X size={18} /></button></div>}
        <header className="page-heading"><h1>{title}</h1><p>{term ? 'Titles and descriptions · All folders' : `${visible.length} ${visible.length === 1 ? 'word' : 'words'}${folder ? ' in this folder' : ' in your vocabulary'}`}</p></header>
        {workspace && !folders.length && <div className="first-folder"><p>Create a folder to start saving words.</p><button className="secondary" onClick={() => setEdit({ type: 'folder' })}><FolderPlus size={17} />Create folder</button></div>}
        {term && <div className="search-context"><span>Searching all folders for “{query.trim()}”</span><button className="text-button" onClick={() => setQuery('')}>Back to {folder?.name ?? 'all words'}</button></div>}
        <div className="list-heading"><div><h2>{term ? 'Matches' : folder ? 'Folder words' : alphabetical ? 'Saved words' : 'Recent words'}</h2><p aria-live="polite">{visible.length} {visible.length === 1 ? 'word' : 'words'}</p></div>
          <button className="secondary sort" aria-pressed={alphabetical} onClick={() => setAlphabetical(value => !value)}><ArrowUpDown size={16} /> {alphabetical ? 'A–Z' : 'Newest first'}</button>
        </div>
        {error ? <div className="empty" role="alert"><p>{error}</p><button className="secondary" onClick={load}>Retry</button></div> :
          !workspace ? <p role="status" className="empty">Loading your vocabulary…</p> :
          !visible.length ? <div className="empty"><BookOpen size={24} /><h3>{term ? 'No matching words' : 'No words yet'}</h3><p>{term ? 'Try a different word, meaning, or translation.' : folders.length ? 'Choose Add word to save a word or phrase.' : 'Your words will appear here once you create a folder.'}</p>{term && <button className="secondary" onClick={() => setQuery('')}>Clear search</button>}</div> :
          <div className="word-grid">{visible.map(note => {
            const group = folders.find(item => item.id === note.folderId)
            return <article className="word-card" data-color={group?.color ?? 'blue'} data-note-id={note.id} key={note.id}>
              <div className="card-top"><button type="button" className="tag" disabled={!group} aria-label={group ? 'Open folder ' + group.name : 'Folder unavailable'} onClick={() => navigate(note.folderId)}><Folder size={13} />{group?.name}</button><WordActions note={note} onEdit={setEdit} /></div>
              <h3><button className="word-title" aria-label={'Read ' + note.title} onClick={() => openWord(note.id)}>{note.title}</button></h3>
              {note.description && <p>{note.description}</p>}
              <time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time>
            </article>
          })}</div>}
      </div>
      </>}
    </main>
    {profileOpen && <ProfileEditor user={user} onSaved={onProfileUpdate} onLogout={onLogout} close={() => setProfileOpen(false)} />}
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

createRoot(document.getElementById('root')).render(<AccountGate>{props => <App key={props.user.id} {...props} />}</AccountGate>)

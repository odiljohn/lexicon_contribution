import React, { useEffect, useRef, useState } from 'react'
import { Megaphone, Menu, Pencil, Plus, Trash2, X } from 'lucide-react'
import { request } from './api'
import { MarkdownDocument } from './word-document'

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function NewsEditor({ edit, close, onSaved }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const dialog = useRef(null)
  const post = edit.post
  const deleting = edit.mode === 'delete'
  const editing = edit.mode === 'edit'
  useEffect(() => {
    dialog.current.showModal()
    if (!deleting) dialog.current.querySelector('input')?.focus()
  }, [deleting])

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      let result
      if (deleting) {
        result = await request('news/' + post.id, 'DELETE')
      } else {
        const fields = Object.fromEntries(new FormData(event.currentTarget))
        result = await request(editing ? 'news/' + post.id : 'news', editing ? 'PATCH' : 'POST', fields)
      }
      onSaved(result)
    } catch (failure) {
      setError(failure.message)
      setBusy(false)
    }
  }

  const heading = deleting ? 'Delete post?' : editing ? 'Edit post' : 'New post'
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); if (!busy) close() }} aria-labelledby="news-editor-title">
    <div className="dialog-head"><h2 id="news-editor-title">{heading}</h2><button className="icon-button" aria-label="Close" disabled={busy} onClick={close}><X size={20} /></button></div>
    <form className="editor-form" onSubmit={submit}>
      <div className="editor-fields">
        {deleting ? <p>Delete “{post.title}”? Everyone will lose access to this post.</p> : <>
          <label>Title<input name="title" defaultValue={post?.title} placeholder="e.g. What’s new this week" maxLength={120} required autoFocus /></label>
          <label>Post <span>(optional)</span><textarea name="body" defaultValue={post?.body} maxLength={8000} rows={8} placeholder="Share an update. Use # for a heading and ## for a subheading." /></label>
        </>}
        {error && <p role="alert" className="error">{error}</p>}
      </div>
      <div className="dialog-actions">
        <button className="secondary" type="button" onClick={close} disabled={busy}>Cancel</button>
        <button className={deleting ? 'danger' : 'primary'} disabled={busy}>{busy ? 'Saving…' : deleting ? 'Delete post' : editing ? 'Save post' : 'Publish post'}</button>
      </div>
    </form>
  </dialog>
}

export default function News({ onOpenNavigation }) {
  const [feed, setFeed] = useState(null)
  const [error, setError] = useState('')
  const [edit, setEdit] = useState(null)

  function load() {
    setError('')
    request('news').then(setFeed).catch(failure => setError(failure.message))
  }
  useEffect(load, [])
  useEffect(() => { document.title = 'News — Lexicon' }, [])

  const posts = feed?.announcements ?? []
  const canPost = feed?.canPost ?? false

  return <>
    <header className="topbar">
      <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={onOpenNavigation}><Menu size={23} /></button>
      <div className="news-title"><Megaphone size={20} /><span>News</span></div>
      {canPost && <button className="primary add-word" onClick={() => setEdit({ mode: 'new' })}><Plus size={20} /> New post</button>}
    </header>
    <div className="content">
      <header className="page-heading"><h1>News</h1><p>{canPost ? 'Updates you’ve shared with everyone using Lexicon.' : 'Updates from the Lexicon library.'}</p></header>
      {error ? <div className="empty" role="alert"><p>{error}</p><button className="secondary" onClick={load}>Retry</button></div> :
        !feed ? <p role="status" className="empty">Loading news…</p> :
        !posts.length ? <div className="empty"><Megaphone size={24} /><h3>No news yet</h3><p>{canPost ? 'Publish a post to share updates with everyone.' : 'Check back later for updates.'}</p>{canPost && <button className="secondary" onClick={() => setEdit({ mode: 'new' })}><Plus size={17} />New post</button>}</div> :
        <div className="news-list">{posts.map(post => <article className="news-post" key={post.id}>
          <div className="news-post-head">
            <h2>{post.title}</h2>
            {canPost && <div className="news-post-actions"><button className="icon-button" aria-label={'Edit ' + post.title} onClick={() => setEdit({ mode: 'edit', post })}><Pencil size={16} /></button><button className="icon-button" aria-label={'Delete ' + post.title} onClick={() => setEdit({ mode: 'delete', post })}><Trash2 size={16} /></button></div>}
          </div>
          <time dateTime={post.createdAt}>{formatDate(post.createdAt)}{post.updatedAt !== post.createdAt && ' · edited ' + formatDate(post.updatedAt)}</time>
          {post.body && <div className="news-body document-reading"><MarkdownDocument text={post.body} /></div>}
        </article>)}</div>}
    </div>
    {edit && <NewsEditor edit={edit} close={() => setEdit(null)} onSaved={result => { setFeed(result); setEdit(null) }} />}
  </>
}

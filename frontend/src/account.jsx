import React, { useEffect, useRef, useState } from 'react'
import { Camera, Eye, EyeOff, LogOut, X } from 'lucide-react'
import { request } from './api'

export function Avatar({ user, large = false }) {
  const initials = user.full_name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase()
  return <span className={large ? 'avatar large' : 'avatar'} aria-hidden="true">{user.avatar ? <img src={user.avatar} alt="" /> : initials}</span>
}

export function AccountGate({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [imported, setImported] = useState(0)
  async function load() {
    setLoading(true)
    setError('')
    try { const result = await request('session'); setUser(result.user) }
    catch (failure) { setError(failure.message) }
    finally { setLoading(false) }
  }
  useEffect(() => {
    load()
    function expired() { setUser(null); setImported(0) }
    window.addEventListener('lexicon:session-expired', expired)
    return () => window.removeEventListener('lexicon:session-expired', expired)
  }, [])

  async function logout() {
    await request('logout', 'POST')
    setUser(null)
    setImported(0)
    window.location.hash = ''
  }
  function authenticated(result) {
    if (result.imported_words > 0) {
      try {
        for (const key of Object.keys(sessionStorage)) {
          const match = key.match(/^lexicon-word-draft-(\d+)$/)
          if (match) {
            sessionStorage.setItem('lexicon-word-draft-' + result.user.id + '-' + match[1], sessionStorage.getItem(key))
            sessionStorage.removeItem(key)
          }
        }
      } catch { /* Existing saved words are imported by the server. */ }
    }
    setUser(result.user)
    setImported(result.imported_words ?? 0)
  }
  if (loading || error) return <div className="account-loading"><span className="mark" aria-hidden="true"><i /><i /></span>{error ? <><p role="alert">{error}</p><button className="secondary" onClick={load}>Try again</button></> : <p role="status">Opening Lexicon…</p>}</div>
  if (!user) return <AuthForm onAuthenticated={authenticated} />
  return children({ user, onProfileUpdate: setUser, onLogout: logout, imported })
}

function AuthForm({ onAuthenticated }) {
  const [registering, setRegistering] = useState(false)
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)
  useEffect(() => { document.title = registering ? 'Create account — Lexicon' : 'Sign in — Lexicon' }, [registering])
  async function submit(event) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setError('')
    try { onAuthenticated(await request(registering ? 'register' : 'login', 'POST', Object.fromEntries(new FormData(event.currentTarget)))) }
    catch (failure) { setError(failure.message) }
    finally { submitting.current = false; setBusy(false) }
  }
  return <main className="auth-page">
    <div className="auth-brand"><span className="mark" aria-hidden="true"><i /><i /></span>Lexicon</div>
    <section className="auth-card">
      <h1>{registering ? 'Create your account' : 'Welcome back'}</h1>
      <p>{registering ? 'A home for your words and discoveries.' : 'Sign in to your vocabulary notebook.'}</p>
      <form onSubmit={submit} key={registering ? 'register' : 'login'}>
        <fieldset disabled={busy}>
          {registering ? <>
            <label>Full name<input name="full_name" autoComplete="name" maxLength={80} required autoFocus /></label>
            <label>Username<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} pattern="[a-zA-Z0-9_]{3,32}" minLength={3} maxLength={32} required aria-describedby="username-hint" /><small id="username-hint">3–32 letters, numbers, or underscores.</small></label>
            <label>Email<input name="email" type="email" autoComplete="email" autoCapitalize="none" maxLength={254} required /></label>
          </> : <label>Email or username<input name="identifier" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus /></label>}
          <label htmlFor="auth-password">Password</label>
          <div className="password-field"><input id="auth-password" name="password" type={visible ? 'text' : 'password'} autoComplete={registering ? 'new-password' : 'current-password'} minLength={registering ? 12 : undefined} maxLength={128} required aria-describedby={registering ? 'password-hint' : undefined} /><button type="button" className="icon-button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
          {registering && <small id="password-hint">Use 12–128 characters.</small>}
          {error && <p role="alert" className="error">{error}</p>}
          <button className="primary auth-submit" disabled={busy}>{busy ? registering ? 'Creating account…' : 'Signing in…' : registering ? 'Create account' : 'Sign in'}</button>
        </fieldset>
      </form>
      <p className="auth-switch">{registering ? 'Already have an account?' : 'New to Lexicon?'} <button type="button" className="text-button" disabled={busy} onClick={() => { setRegistering(value => !value); setError(''); setVisible(false) }}>{registering ? 'Sign in' : 'Create account'}</button></p>
    </section>
  </main>
}

async function prepareAvatar(file) {
  if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Choose a JPEG or PNG image smaller than 5 MB.')
  const url = URL.createObjectURL(file)
  try {
    const picture = new Image()
    await new Promise((resolve, reject) => { picture.onload = resolve; picture.onerror = () => reject(new Error('Could not read that image.')); picture.src = url })
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const context = canvas.getContext('2d')
    context.fillStyle = '#f8f6f2'
    context.fillRect(0, 0, 256, 256)
    const side = Math.min(picture.naturalWidth, picture.naturalHeight)
    context.drawImage(picture, (picture.naturalWidth - side) / 2, (picture.naturalHeight - side) / 2, side, side, 0, 0, 256, 256)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally { URL.revokeObjectURL(url) }
}

export function ProfileEditor({ user, onSaved, onLogout, close }) {
  const [avatar, setAvatar] = useState(user.avatar)
  const [email, setEmail] = useState(user.email)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef(null)
  const submitting = useRef(false)
  useEffect(() => { dialog.current.showModal() }, [])
  async function upload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploading(true)
    setError('')
    try { setAvatar(await prepareAvatar(file)) }
    catch (failure) { setError(failure.message) }
    finally { setUploading(false) }
  }
  async function submit(event) {
    event.preventDefault()
    if (submitting.current || uploading) return
    submitting.current = true
    setBusy(true)
    setError('')
    const fields = Object.fromEntries(new FormData(event.currentTarget))
    try { const result = await request('profile', 'PATCH', { ...fields, avatar }); onSaved(result.user); close() }
    catch (failure) { setError(failure.message) }
    finally { submitting.current = false; setBusy(false) }
  }
  async function logout() {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setError('')
    try { await onLogout() }
    catch (failure) { setError(failure.message); setBusy(false); submitting.current = false }
  }
  return <dialog className="profile-modal" ref={dialog} onCancel={event => { event.preventDefault(); if (!busy && !uploading) close() }} aria-labelledby="profile-title">
    <div className="dialog-head"><h2 id="profile-title">Your profile</h2><button className="icon-button" aria-label="Close profile" disabled={busy || uploading} onClick={close}><X size={20} /></button></div>
    <form className="editor-form" onSubmit={submit}>
      <div className="editor-fields">
        <div className="profile-avatar"><Avatar user={{ ...user, avatar }} large /><div><label className="avatar-upload"><Camera size={16} />{uploading ? 'Preparing image…' : 'Change photo'}<input type="file" accept="image/jpeg,image/png" disabled={busy || uploading} onChange={upload} /></label>{avatar && <button type="button" className="text-button" disabled={busy || uploading} onClick={() => setAvatar('')}>Remove photo</button>}<small>JPEG or PNG · up to 5 MB</small></div></div>
        <fieldset disabled={busy}>
          <label>Full name<input name="full_name" autoComplete="name" defaultValue={user.full_name} required maxLength={80} /></label>
          <label>Username<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} defaultValue={user.username} pattern="[a-zA-Z0-9_]{3,32}" minLength={3} maxLength={32} required /></label>
          <label>Email<input name="email" type="email" autoComplete="email" autoCapitalize="none" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} /></label>
          {email.trim().toLowerCase() !== user.email && <label>Current password<input name="current_password" type="password" autoComplete="current-password" required maxLength={128} /><span className="field-help">Confirm your password to change your email.</span></label>}
          <label>Bio <span>(optional)</span><textarea name="bio" defaultValue={user.bio} placeholder="A little about you" maxLength={160} rows={3} /><span className="field-help">Up to 160 characters.</span></label>
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="button" className="text-button sign-out" disabled={busy || uploading} onClick={logout}><LogOut size={16} />Sign out</button>
      </div>
      <div className="dialog-actions"><button type="button" className="secondary" disabled={busy || uploading} onClick={close}>Cancel</button><button className="primary" disabled={busy || uploading}>{busy ? 'Saving…' : 'Save profile'}</button></div>
    </form>
  </dialog>
}

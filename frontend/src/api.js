export async function request(path, method = 'GET', body) {
  const response = await fetch('/api/' + path, {
    method,
    credentials: 'same-origin',
    ...(method !== 'GET' && { headers: { 'Content-Type': 'application/json' } }),
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401 && !['login', 'register', 'session'].includes(path)) {
      window.dispatchEvent(new Event('lexicon:session-expired'))
    }
    throw new Error(result.error || 'Could not connect to Lexicon. Try again.')
  }
  return result
}

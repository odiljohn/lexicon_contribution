export function documentSource(note) {
  return '# ' + note.title + (note.description ? '\n\n' + note.description : '')
}

export function parseDocument(source) {
  const lines = source.replace(/\r\n?/g, '\n').trim().split('\n')
  const first = lines.shift() ?? ''
  const title = first.replace(/^#{1,6}[ \t]+/, '').trim()
  const description = lines.join('\n').trim()
  if (!title || /^#+$/.test(title)) throw new Error('Write a word or phrase on the first line.')
  if (Array.from(title).length > 120) throw new Error('Keep the title to 120 characters or fewer.')
  if (Array.from(description).length > 4000) throw new Error('Keep the description to 4,000 characters or fewer.')
  return { title, description }
}

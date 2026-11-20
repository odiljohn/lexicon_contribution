import React from 'react'

// Render text through React so HTML in a saved note remains text.
export function MarkdownDocument({ text }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) { index++; continue }
    const fence = line.match(/^\s*(`{3,}|~{3,})/)
    if (fence) {
      const code = []
      index++
      while (index < lines.length && !lines[index].trim().startsWith(fence[1])) code.push(lines[index++])
      if (index < lines.length) index++
      blocks.push(<pre key={blocks.length}><code>{code.join('\n')}</code></pre>)
      continue
    }
    const heading = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)\s*$/)
    if (heading) {
      blocks.push(React.createElement('h' + heading[1].length, { key: blocks.length }, heading[2].replace(/[ \t]+#+[ \t]*$/, '')))
      index++
      continue
    }
    const paragraph = [line]
    index++
    while (index < lines.length && lines[index].trim() && !/^ {0,3}#{1,6}[ \t]+/.test(lines[index]) && !/^\s*(`{3,}|~{3,})/.test(lines[index])) paragraph.push(lines[index++])
    blocks.push(<p key={blocks.length}>{paragraph.join('\n')}</p>)
  }
  return blocks
}

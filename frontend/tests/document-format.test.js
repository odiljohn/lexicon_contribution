import assert from 'node:assert/strict'
import test from 'node:test'
import { documentSource, parseDocument } from '../src/document-format.js'

test('existing title and description round-trip as a single document', () => {
  for (const note of [
    { title: 'Serendipity', description: '## Meaning\nA happy discovery.\n\n## Example\nFinding a book.' },
    { title: 'Title only', description: '' },
    { title: '# A literal hash in the title', description: '# Another heading' },
  ]) assert.deepEqual(parseDocument(documentSource(note)), note)
})

test('plain first lines work as titles and Windows newlines are normalized', () => {
  assert.deepEqual(parseDocument('  Word or phrase\r\n\r\n## Meaning\r\nA description.  '), {
    title: 'Word or phrase', description: '## Meaning\nA description.',
  })
})

test('blank or heading-marker-only titles cannot erase a word', () => {
  for (const source of ['', '   ', '# \n\nA description', '##']) {
    assert.throws(() => parseDocument(source), /first line/)
  }
})

test('title and description limits match the API and count Unicode code points', () => {
  const valid = { title: '🌱'.repeat(120), description: 'é'.repeat(4000) }
  assert.deepEqual(parseDocument(documentSource(valid)), valid)
  assert.throws(() => parseDocument('# ' + 'a'.repeat(121)), /120/)
  assert.throws(() => parseDocument('# Word\n\n' + 'a'.repeat(4001)), /4,000/)
})

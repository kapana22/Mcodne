// Unit tests for the URL-safety helpers that close the stored-XSS vector via
// message `fileUrl` / tutor-supplied links.
//
// Run: npx tsx --test tests/safe-url.test.ts
//
// The core invariant: `javascript:` and `data:text/html` — both of which
// zod's `.url()` happily accepts — must NEVER survive as a navigable href.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeHttpUrl, safeStoredFileUrl } from '../lib/safeUrl'

test('safeHttpUrl blocks active-content schemes', () => {
  for (const bad of [
    'javascript:alert(document.cookie)',
    'JavaScript:alert(1)',
    '  javascript:alert(1)  ', // leading space must not smuggle it through
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'data:application/json,{}',
  ]) {
    assert.equal(safeHttpUrl(bad), undefined, `must reject: ${bad}`)
  }
})

test('safeHttpUrl allows safe navigable schemes', () => {
  for (const ok of [
    'https://example.com/doc.pdf',
    'http://example.com',
    'mailto:x@y.com',
    'tel:+995555000000',
    'data:image/png;base64,iVBORw0KGgo=',
    '/relative/app/path',
  ]) {
    assert.equal(safeHttpUrl(ok), ok.trim(), `must allow: ${ok}`)
  }
})

test('safeHttpUrl handles empty/nullish', () => {
  assert.equal(safeHttpUrl(undefined), undefined)
  assert.equal(safeHttpUrl(null), undefined)
  assert.equal(safeHttpUrl(''), undefined)
})

test('safeStoredFileUrl is stricter — only http(s) and data:image', () => {
  assert.equal(safeStoredFileUrl('https://cdn.example.com/a.png'), 'https://cdn.example.com/a.png')
  assert.equal(safeStoredFileUrl('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA')
  // rejected: dangerous schemes AND schemes that make no sense for a stored file
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'mailto:x@y.com', 'tel:+1', '/relative', 'ftp://x']) {
    assert.equal(safeStoredFileUrl(bad), null, `must reject stored: ${bad}`)
  }
  assert.equal(safeStoredFileUrl(undefined), null)
})

// Guard against a regression that reintroduces zod `.url()` as the only check:
// confirm the schemes the app must block are things a naive URL parser accepts.
test('the dangerous inputs ARE valid URLs (why zod .url() was insufficient)', () => {
  // new URL(...) does not throw for these — that is exactly the trap.
  assert.doesNotThrow(() => new URL('javascript:alert(1)'))
  assert.doesNotThrow(() => new URL('data:text/html,<script>alert(1)</script>'))
})

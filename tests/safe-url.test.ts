// Unit tests for the URL-safety helpers that close the stored-XSS vector via
// message `fileUrl` / tutor-supplied links.
//
// Run: npx tsx --test tests/safe-url.test.ts
//
// The core invariant: `javascript:` and `data:text/html` — both of which
// zod's `.url()` happily accepts — must NEVER survive as a navigable href.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

/* ═══════════ the guard has a caller ══════════════════════════════════════ */

// ⚠️ FOUND 2026-09-03 BY A DEAD-CODE SWEEP: `lib/safeUrl` had NO importer in
// app/, components/ or lib/ — only this file. It read as a module to delete,
// and the sweep nearly did. What it actually was is a guard nobody had wired:
// `CredentialsBlock` on the public provider page put a provider's own
// `websiteUrl` and `linkedinUrl` straight into an href.
//
// Nothing exploitable reached production — the write side has always demanded
// `^https?://` (`optionalUrl`, in lib/serviceProfile and app/api/me/provider) —
// so this is defence in depth, and the two layers guard different things: that
// one is a form rule somebody may loosen for a good reason, this one is about
// what a browser does with the string it was given.
//
// The pin is here rather than in the render's own test file because it is this
// module's reason to exist. A guard with no caller is not a guard.

test('the provider page renders its links through safeHttpUrl', () => {
  const src = readFileSync(
    join(import.meta.dirname, '..', 'app', 'experts', '[slug]', '_providerBlocks.tsx'),
    'utf8',
  )
  for (const field of ['websiteUrl', 'linkedinUrl']) {
    assert.match(src, new RegExp(`safeHttpUrl\\(p\\.${field}\\)`),
      `p.${field} is no longer sanitised before it becomes an href`)
    assert.doesNotMatch(src, new RegExp(`href: p\\.${field}\\b`),
      `p.${field} goes into an href raw — that is the stored-XSS shape this module exists for`)
  }
})

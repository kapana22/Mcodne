// Unit tests for the admin → ONE user message (admin panel „მიწერე").
//
// Run: npx tsx --test tests/admin-message.test.ts
//
// This is the only email in the app whose SUBJECT AND BODY are both free text
// typed by a human into a form, so the escaping is load-bearing rather than
// habitual. The invariants:
//   1. the subject can never carry CR/LF (mail-header injection),
//   2. nothing an admin types can ever reach the recipient's inbox as markup,
//   3. the destination (email CTA + notification href) comes from a fixed
//      server-side map, never from the request.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  adminDirectMessageEmail,
  adminMessageDestination,
  sanitizeSubject,
  ADMIN_MESSAGE_SUBJECT_MAX,
  ADMIN_MESSAGE_BODY_MAX,
} from '../lib/emailTemplates'

test('sanitizeSubject strips CR/LF/tabs and collapses whitespace', () => {
  for (const bad of [
    'გამარჯობა\r\nBcc: attacker@evil.com',
    'გამარჯობა\nX-Injected: 1',
    'გამარჯობა\rSubject: other',
    'გამარჯობა\tX',
  ]) {
    const out = sanitizeSubject(bad)
    assert.ok(!/[\r\n\t]/.test(out), `must not keep header separators: ${JSON.stringify(out)}`)
  }
  assert.equal(sanitizeSubject('  ორი   ჰარი  '), 'ორი ჰარი')
  assert.equal(sanitizeSubject(''), '')
  assert.equal(sanitizeSubject(undefined as unknown as string), '')
})

test('email subject is single-line even for a hostile subject', () => {
  const { subject } = adminDirectMessageEmail({
    name: 'მარიამ ფოფხაძე',
    subject: 'გამარჯობა\r\nBcc: attacker@evil.com',
    body: 'ტექსტი',
  })
  assert.ok(!/[\r\n]/.test(subject))
  assert.ok(!subject.includes('Bcc:') || subject.indexOf('Bcc:') > 0) // folded into one line, not a header
  assert.equal(subject, 'გამარჯობა Bcc: attacker@evil.com')
})

test('an empty subject still yields a usable mail subject', () => {
  const { subject } = adminDirectMessageEmail({ name: 'ნინო', subject: '   ', body: 'ტექსტი' })
  assert.ok(subject.trim().length > 0)
})

test('admin-typed subject and body are escaped, never rendered as markup', () => {
  const { html } = adminDirectMessageEmail({
    name: '<img src=x onerror=alert(1)>',
    subject: '<script>alert("subject")</script>',
    body: '<script>alert(\'body\')</script>\n\n<b onclick="x">bold?</b> & "quoted" \'single\'',
  })
  assert.ok(!html.includes('<script>'), 'no live script tag may survive')
  assert.ok(!html.includes('<img'), 'no live img tag may survive')
  // An escaped payload legitimately still CONTAINS the string "onclick=" as inert
  // text — what must never exist is a real tag carrying it.
  assert.ok(!/<[a-zA-Z][^>]*\son[a-z]+=/.test(html), 'no tag may carry an event handler')
  assert.ok(html.includes('&lt;script&gt;'), 'the payload must appear escaped')
  assert.ok(html.includes('&lt;b onclick=&quot;x&quot;&gt;'), 'the tag must be inert text, attribute and all')
  assert.ok(html.includes('&amp;'), 'ampersands must be escaped')
  assert.ok(html.includes('&quot;'), 'double quotes must be escaped')
  assert.ok(html.includes('&#39;'), 'single quotes must be escaped')
})

test('body keeps its shape: blank lines → paragraphs, single newlines → <br>', () => {
  const { html } = adminDirectMessageEmail({
    name: 'ნინო',
    subject: 'სათაური',
    body: 'პირველი აბზაცი\nმეორე ხაზი\n\nმეორე აბზაცი',
  })
  assert.ok(html.includes('პირველი აბზაცი<br>მეორე ხაზი'), 'single newline becomes <br>')
  assert.ok(html.includes('<p style="margin:0 0 12px;">მეორე აბზაცი</p>'), 'blank line starts a new paragraph')
})

test('every link in the mail is absolute (an inbox has no site-relative base)', () => {
  const { html } = adminDirectMessageEmail({
    name: 'ნინო', subject: 'სათაური', body: 'ტექსტი', template: 'expert',
  })
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1])
  assert.ok(hrefs.length > 0)
  for (const h of hrefs) {
    assert.ok(
      h.startsWith('https://mcodne.ge') || h.startsWith('mailto:'),
      `relative or foreign link in an email: ${h}`,
    )
  }
  assert.ok(hrefs.includes('https://mcodne.ge/apply'), 'the expert starter must link straight to /apply')
})

test('destination is chosen from a fixed map, unknown input falls back to blank', () => {
  assert.equal(adminMessageDestination('expert').href, '/apply')
  assert.equal(adminMessageDestination('info').href, '/settings')
  assert.equal(adminMessageDestination('blank').href, '/notifications')
  // Anything unexpected (or absent) must land on the safe default, never on a
  // caller-supplied path.
  assert.equal(adminMessageDestination(undefined).href, '/notifications')
  assert.equal(adminMessageDestination(null).href, '/notifications')
  assert.equal(adminMessageDestination('https://evil.com').href, '/notifications')
  assert.equal(adminMessageDestination('__proto__').href, '/notifications')
  for (const t of ['expert', 'info', 'blank', 'nonsense']) {
    const d = adminMessageDestination(t)
    assert.ok(d.href.startsWith('/') && !d.href.startsWith('//'), `must be an app-internal path: ${d.href}`)
    assert.ok(d.ctaLabel.trim().length > 0)
  }
})

test('bounds are the ones the composer and the API agree on', () => {
  assert.equal(ADMIN_MESSAGE_SUBJECT_MAX, 120)
  assert.equal(ADMIN_MESSAGE_BODY_MAX, 4000)
  // A body at the cap must still render — nothing truncates it into broken HTML.
  const long = 'ა'.repeat(ADMIN_MESSAGE_BODY_MAX)
  const { html } = adminDirectMessageEmail({ name: 'ნინო', subject: 'ს', body: long })
  assert.ok(html.includes(long))
})

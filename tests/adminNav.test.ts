/*
 * The admin navigation contract.
 *
 * Run with:  npx tsx tests/adminNav.test.ts
 *
 * The sidebar renders `Icon[it.icon]` dynamically. A typo or a renamed glyph
 * makes that `undefined`, React throws on render, and the WHOLE ADMIN PANEL
 * goes blank — for an operator, indistinguishable from the site being down.
 * TypeScript does not catch it (`keyof typeof Icon` is satisfied by any key
 * that existed at compile time, and the tab list is read from source here), and
 * neither does `next build`, because the crash is at render time. So it is
 * checked here.
 *
 * The tab list also used to exist in five hand-maintained copies. Two are gone
 * and `VALID_TABS` is derived; this file pins what remains so the next copy is
 * caught the day it appears rather than the day a deep link stops working.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const page = readFileSync(join(ROOT, 'app/admin/page.tsx'), 'utf8')
const iconSrc = readFileSync(join(ROOT, 'components/Icon.tsx'), 'utf8')

const navIcons = [...page.matchAll(/icon: '([a-zA-Z]+)'/g)].map(m => m[1])
const navIds = [...page.matchAll(/\{ id: '([a-z]+)',\s+l: '/g)].map(m => m[1])
/** Every key on the Icon object — inline components AND aliases (`cal: calendar`). */
const iconBody = iconSrc.slice(iconSrc.indexOf('export const Icon'))
const defined = new Set([...iconBody.matchAll(/^\s{2}([a-zA-Z]+):/gm)].map(m => m[1]))

test('every nav icon exists — a missing one blanks the entire admin', () => {
  assert.ok(navIcons.length >= 15, `only ${navIcons.length} nav icons found — did the nav move?`)
  const missing = navIcons.filter(n => !defined.has(n))
  assert.deepEqual(missing, [], `Icon.${missing.join(', Icon.')} does not exist — the admin would crash on render`)
})

test('no two tabs share a glyph', () => {
  // Two rows drawn identically are two rows the eye cannot tell apart, which is
  // the whole reason the icons were added. Aliases are resolved first, because
  // `cal` and `grid` are aliases and several pairs in Icon.tsx are byte-equal
  // (graph/trend, video/cam, close/x/xC, end/phone).
  const resolve = (n: string): string =>
    iconBody.match(new RegExp(`^\\s{2}${n}:\\s*([a-zA-Z]+),\\s*$`, 'm'))?.[1] ?? n
  const seen = new Map<string, string[]>()
  for (const n of navIcons) {
    const k = resolve(n)
    seen.set(k, [...(seen.get(k) ?? []), n])
  }
  const dupes = [...seen.values()].filter(v => v.length > 1)
  assert.deepEqual(dupes, [], `these nav entries draw the same glyph: ${dupes.map(d => d.join('=')).join(' · ')}`)
})

test('every tab is reachable by deep link, and no ghost ids remain', () => {
  // `VALID_TABS` is derived from ADMIN_NAV — this asserts it STAYS derived. As
  // a literal it was a fourth copy with no compile-time link to the nav: add a
  // tab, forget the line, and `/admin#newtab` silently does nothing.
  assert.match(page, /const VALID_TABS: AdminTab\[\] = ADMIN_NAV\.map/,
    'VALID_TABS was hand-listed again — deep links will drift from the nav')
})

test('the nav is rendered from ONE array, not re-typed per surface', () => {
  // The mobile drawer used to carry its own copy, and it drifted where it hurt:
  // its badge keyed off an `urgent` flag that was declared and never set, so the
  // same backlog was a green attention badge on desktop and a grey pill on
  // mobile.
  assert.ok(!/const NAV: \{ id: AdminTab/.test(page), 'the mobile drawer grew its own nav array again')
  // Scoped to the NAV shape on purpose. A bare /urgent\?: boolean/ also matches
  // the application-queue SLA flag at ~line 378, which is live, correct and
  // unrelated — the first version of this test failed on it.
  assert.ok(!/\{ id: AdminTab;[^}]*urgent\?: boolean/.test(page),
    'the dead `urgent` nav-badge flag is back')
  const renders = page.match(/ADMIN_NAV\.filter\(it => it\.g === g\)/g) ?? []
  assert.equal(renders.length, 2, `expected the sidebar and the drawer to render the same array, found ${renders.length}`)
})

test('every tab in the nav has a section rendered for it', () => {
  // A tab you can click that renders nothing is worse than no tab.
  const unrendered = navIds.filter(id => !new RegExp(`active === '${id}'`).test(page))
  assert.deepEqual(unrendered, [], `these tabs render nothing: ${unrendered.join(', ')}`)
})

/* ═══════════ consistency: one idea, written once ════════════════════════ */

const adminFiles = ['page.tsx', '_help.tsx', '_texts.tsx', '_blog.tsx', '_insights.tsx',
  '_system.tsx', '_integrations.tsx', '_profileViews.tsx', '_expertsAttention.tsx']
  .map(f => readFileSync(join(ROOT, 'app/admin', f), 'utf8')).join('\n')

test('error banners come from ONE component', () => {
  // Counted before the sweep: 48 hand-rolled danger blocks across three tiers of
  // seriousness for the same event — a thin strip here, a card with a retry
  // button there. That is most of why „every screen feels different", and it is
  // the kind of drift that only ever grows.
  const strips = adminFiles.match(/rounded-btn bg-danger-50 border border-danger-200/g) ?? []
  assert.equal(strips.length, 0,
    `${strips.length} hand-written error strips are back — use <AdminError> from ./_parts`)
})

test('the period switcher is built once', () => {
  const hand = adminFiles.match(/aria-label="პერიოდი"/g) ?? []
  assert.equal(hand.length, 0, 'a period switcher was hand-built again — use <PeriodSwitch>')
})

test('panel loading states come from ONE component', () => {
  // Button busy labels („ინახება…", „იტვირთება…" on an upload control) are
  // deliberately NOT covered: a control describing itself is a different thing
  // from a section describing its state. Only panel-level ones are pinned.
  const hand = adminFiles.match(/text-ink-[56]00">იტვირთება/g) ?? []
  assert.ok(hand.length <= 2,
    `${hand.length} hand-written panel loading states — use <AdminLoading>`)
})

test('the primitives are actually used, not just defined', () => {
  const uses = adminFiles.match(/<Admin(Loading|Error)|<PeriodSwitch/g) ?? []
  assert.ok(uses.length >= 25, `only ${uses.length} primitive usages — did a sweep get reverted?`)
})

test('every admin panel reads live data, never a cached response', () => {
  // „ტექსტები" was the one panel without `cache: 'no-store'`, and it showed the
  // owner a warning that had already been fixed on the server — the panel was
  // reading a response the browser had kept. An admin screen that can be stale
  // is an admin screen that cannot be trusted.
  // Parens are BALANCED rather than regex-matched to the first `)`. Several
  // admin URLs are templates containing `encodeURIComponent(...)`, and a lazy
  // regex stops inside them — the first version of this test reported three
  // healthy calls as cacheable because it never saw their options object.
  const bad: string[] = []
  for (let i = adminFiles.indexOf('fetch('); i !== -1; i = adminFiles.indexOf('fetch(', i + 1)) {
    let depth = 0, j = i + 'fetch'.length
    for (; j < adminFiles.length; j++) {
      if (adminFiles[j] === '(') depth++
      else if (adminFiles[j] === ')' && --depth === 0) break
    }
    const call = adminFiles.slice(i, j + 1)
    if (!/fetch\(\s*[`'"]\/api\/admin\//.test(call)) continue
    if (/method:\s*'(POST|PATCH|PUT|DELETE)'/.test(call)) continue
    if (/no-store/.test(call)) continue
    bad.push(call.slice(0, 70))
  }
  assert.deepEqual(bad, [], `these admin reads may be served from cache:\n  ${bad.join('\n  ')}`)
})

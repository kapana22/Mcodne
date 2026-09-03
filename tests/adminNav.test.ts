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
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
/* The panel is one screen split across `app/admin/*.tsx` — page.tsx is only the
   composition root, the nav lives in _nav.tsx and each tab in its own file. Read
   the DIRECTORY, not a file list: every assertion below is about the panel as a
   whole („is this idea written once?"), so a hand-maintained list would silently
   stop covering the next file someone adds — which is exactly the drift these
   tests exist to catch. */
const adminSrc = (skip: string[] = []) =>
  readdirSync(join(ROOT, 'app/admin'))
    .filter(f => f.endsWith('.tsx') && !skip.includes(f))
    .sort()
    .map(f => readFileSync(join(ROOT, 'app/admin', f), 'utf8'))
    .join('\n')

const page = adminSrc()
const iconSrc = readFileSync(join(ROOT, 'components/Icon.tsx'), 'utf8')

const navIcons = [...page.matchAll(/icon: '([a-zA-Z]+)'/g)].map(m => m[1])
const navIds = [...page.matchAll(/\{ id: '([a-z]+)',\s+l: '/g)].map(m => m[1])
/** Every key on the Icon object — inline components AND aliases (`cal: calendar`). */
const iconBody = iconSrc.slice(iconSrc.indexOf('export const Icon'))
const defined = new Set([...iconBody.matchAll(/^\s{2}([a-zA-Z]+):/gm)].map(m => m[1]))

test('every nav icon exists — a missing one blanks the entire admin', () => {
  // ⚠️ THE FLOOR WAS 15 UNTIL 2026-08-24. Six rows went with the consultation
  // product — „განაცხადები" (the consultation form), „ჯავშნები", „დავები",
  // „შეფასებები", „ქცევა" and „ფინანსები" — and the surviving master queue
  // took the first of those names. The number is a „did the nav move" floor,
  // not a target: lower it when rows genuinely leave, never to make a red test
  // green.
  assert.ok(navIcons.length >= 14, `only ${navIcons.length} nav icons found — did the nav move?`)
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

test('no group carries a caption with no rows under it', () => {
  // Replaces a by-name ban on „რიცხვები" (2026-08-30), which hard-coded the one
  // group that had gone wrong and failed when it legitimately came back. A
  // caption is a promise that rows follow it. `home` is the exception the other
  // way — a row with no caption — so the check is on the caption, not the group.
  // Scoped to the GROUP_LABEL body on purpose: a bare object-line regex also
  // matches TAB_ALIASES („analytics: 'overview'"), which is a hash redirect and
  // not a group at all — the first version of this test failed on exactly that.
  const body = navFile.slice(
    navFile.indexOf('const GROUP_LABEL'),
    navFile.indexOf('const GROUP_LABEL') + navFile.slice(navFile.indexOf('const GROUP_LABEL')).indexOf('\n}'),
  )
  const labels = [...body.matchAll(/^  (\w+): '([^']*)',$/gm)]
    .filter(m => m[2] !== '')
    .map(m => m[1])
  const groupsInUse = new Set([...navFile.matchAll(/g: '(\w+)' \}/g)].map(m => m[1]))
  const empty = labels.filter(g => !groupsInUse.has(g))
  assert.deepEqual(empty, [], `these groups draw a caption over no rows: ${empty.join(', ')}`)
})

test('every tab in the nav has a section rendered for it', () => {
  // A tab you can click that renders nothing is worse than no tab.
  const unrendered = navIds.filter(id => !new RegExp(`active === '${id}'`).test(page))
  assert.deepEqual(unrendered, [], `these tabs render nothing: ${unrendered.join(', ')}`)
})

/* ═══════════ the 2026-08-19 tidy-up (owner's brief) ═════════════════════ */

const navFile = readFileSync(join(ROOT, 'app/admin/_nav.tsx'), 'utf8')
const pageFile = readFileSync(join(ROOT, 'app/admin/page.tsx'), 'utf8')
const statsFile = readFileSync(join(ROOT, 'app/api/admin/stats/route.ts'), 'utf8')

test('the panel opens on the overview, and the overview is the first nav row', () => {
  // The default tab is „მიმოხილვა" (owner's call): the panel opens on the whole
  // picture; the queues announce themselves through the badges instead.
  assert.match(pageFile, /useState<AdminTab>\('overview'\)/, 'the landing tab is no longer the overview')
  assert.equal(navIds[0], 'overview', `the first nav row is '${navIds[0]}', not the overview`)
  // It stands alone above the groups: its own caption-less group, rendered
  // before every other one, and a header is only drawn when a caption exists.
  assert.match(navFile, /const NAV_GROUPS: NavGroup\[\] = \['home', 'queue'/, 'the overview group is not the first rendered group')
  assert.match(navFile, /home: '',/, 'the overview group grew a caption')
  assert.equal((navFile.match(/GROUP_LABEL\[g\] && /g) ?? []).length, 2,
    'a caption-less group must draw no header on BOTH surfaces')
  // The retired hash still lands: #analytics → overview.
  assert.match(navFile, /analytics: 'overview',/)
})

test('the group captions and the renamed tabs read as the owner wrote them', () => {
  // „რიცხვები" left this list 2026-08-24 (its two tabs counted bookings) and is
  // back 2026-08-30 holding „ძაბრი", built on the request wizard's own events.
  for (const line of ["queue: 'რიგი'", "people: 'ხალხი'", "content: 'ტექსტები'", "signals: 'რიცხვები'", "system: 'სისტემა'"]) {
    assert.ok(navFile.includes(line), `GROUP_LABEL lost \`${line}\``)
  }
  // Only the label changed — the id is a deep link and a state value.
  assert.match(navFile, /\{ id: 'integrations',\s+l: 'კოდი'/)
  assert.match(navFile, /\{\s+id:\s+'broadcast',\s+l:\s+'შეტყობინების\s+გაგზავნა'/)
  // The one application queue left says „განაცხადები" flat, because there is no
  // longer a second kind of application to tell it apart from.
  assert.match(navFile, /\{ id: 'providers',\s+l: 'განაცხადები'/)
})

test('the masters badge rides on the ONE stats fetch', () => {
  // ⚠️ IT WAS „the masters AND DISPUTES badges" UNTIL 2026-08-24. A dispute was
  // a booking that went wrong, and there is no booking; the Dispute table is
  // dropped, so the count, the badge and the tab all went together. The rule the
  // remaining badge is held to is unchanged.
  //
  // Same Promise.all as every other badge — a badge is never a second request
  // from the shell, and never worth 500-ing the shell over (.catch(() => 0)).
  const all = statsFile.slice(statsFile.indexOf('await Promise.all(['), statsFile.indexOf('])', statsFile.indexOf('await Promise.all([')))
  assert.match(all, /prisma\.providerApplication\.count\(\{\s+where:\s+\{\s+status:\s+'SUBMITTED'\s+\}\s+\}\)\.catch\(\(\)\s+=>\s+0\)/,
    'the application count is not inside Promise.all with .catch(() => 0)')
  assert.match(statsFile, /pendingProviders: pendingApps,/, 'the count is not in the JSON response')
  assert.doesNotMatch(statsFile, /prisma\.dispute\b/, 'the stats route counts disputes again — the table is gone')
  // …and the shell reads it the same way it reads the other three.
  assert.match(pageFile, /if \(typeof d\?\.pendingProviders === 'number'\)/, 'page.tsx does not read pendingProviders from the stats response')
  assert.equal((pageFile.match(/pendingProviders=\{pendingProviders\}/g) ?? []).length, 2, 'pendingProviders is not passed to both AdminSidebar and TopBar')
  // The badge helper is the ONE place both surfaces read, so a badge means the
  // same thing on desktop and mobile.
  assert.match(navFile, /if\s+\(id\s+===\s+'providers'\)\s+return\s+pendingProviders\s+\?\?\s+0/)
  assert.doesNotMatch(navFile, /if \(id === 'bookings'\)/, 'a bookings badge came back — there are no bookings')
  assert.doesNotMatch(navFile, /if \(id === 'disputes'\)/, 'a disputes badge came back — there are no disputes')
  // ⚠️ `b2bLeads` WAS THE FOURTH COUNT until 2026-09-03. It carried the unread
  // B2B enquiry queue, which went with /business; three counts is the whole
  // list now, and what this pins is unchanged — both surfaces read the same
  // helper with the same arguments, so a badge cannot mean one thing on desktop
  // and another on mobile.
  assert.equal((navFile.match(/navBadge\(it\.id, helpOpen, newRequests, pendingProviders\)/g) ?? []).length, 2,
    'both surfaces must call navBadge with the same three counts')
})

/* ═══════════ consistency: one idea, written once ════════════════════════ */

/* `_parts.tsx` is the primitives module itself — it DEFINES <PeriodSwitch> and
   <AdminError>, so counting it would make „built once" fail on the one copy that
   is supposed to exist. Everything else in the folder is a consumer. */
const adminFiles = adminSrc(['_parts.tsx'])

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

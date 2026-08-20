/*
 * The diaspora vertical — the hiding, and the arithmetic.
 *
 * Run with:  npx tsx tests/abroad.test.ts
 *
 * WHY THIS FILE EXISTS. A feature that ships dark has exactly one failure mode
 * that matters, and it is silent: something leaks. A stray link, a sitemap
 * entry, a route that renders instead of 404ing — none of these break a build,
 * none of them show up in a typecheck, and all of them are discovered by a user
 * or a crawler rather than by us. The whole point of shipping dark is that the
 * darkness is verified, not assumed.
 *
 * The second half is the euro display, which is arithmetic on a price and
 * therefore the one thing here that can be wrong while looking completely fine.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { FEATURE_ABROAD, ABROAD_EUR_PER_GEL, PAYMENTS_LIVE } from '../lib/flags'
import {
  ABROAD_CATEGORY_SLUG, ABROAD_SOURCE_CATEGORY_SLUGS, isAbroadCategory,
  eurFromGel, eurLabel, gelFromSiteText,
} from '../lib/abroad'
import { SITE_TEXTS, SITE_TEXT_DEFAULTS } from '../lib/siteTextDefs'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/* ═══════════ 1. it ships dark ══════════════════════════════════════════ */

test('turning the vertical on cannot expose it', () => {
  // THIS ASSERTION USED TO PIN `FEATURE_ABROAD === false`, and it was removed on
  // purpose (2026-08-04, owner's call: they wanted to review the page on the
  // real domain). Keeping it would have meant the owner could not look at their
  // own landing page without editing a test, which is a gate on the wrong thing.
  //
  // What matters is not the flag's VALUE but that flipping it exposes nothing
  // beyond the URL itself. That is what the rest of this file enforces, and
  // those assertions run at every value of the flag: noindex + nofollow, absent
  // from the sitemap and the feed, and — the real guarantee — a tree scan
  // proving nothing anywhere links to /abroad. „On" therefore means „reachable
  // by someone who was given the address", never „published".
  //
  // FEATURE_REQUEST_BOOKING is deliberately not asserted here either: it is
  // scoped by the diaspora CATEGORY rather than by this flag, and
  // tests/requestBooking.test.ts owns its value. Two files pinning one constant
  // is how a flag becomes impossible to flip.
  assert.equal(typeof FEATURE_ABROAD, 'boolean')

  // The payments model, on the other hand, does NOT move with this vertical.
  // „There is a payment LINK" and „payments are live" are different claims, and
  // only the first one is true — a payment link is a string an expert pasted.
  assert.equal(PAYMENTS_LIVE, false)
})

test('the flag is the ONLY switch', () => {
  // The promise made in lib/flags.ts is that one line turns the vertical on.
  // An env var or a second boolean would quietly break that promise — you would
  // flip the flag, nothing would happen, and the next person would add a third.
  const flags = read('lib/flags.ts')
  assert.match(flags, /export const FEATURE_ABROAD = (true|false)\s*$/m)
  const abroadLib = read('lib/abroad.ts')
  assert.doesNotMatch(abroadLib, /process\.env/, 'lib/abroad reads an env var — the flag is no longer the only switch')
  assert.doesNotMatch(read('app/abroad/page.tsx'), /process\.env/)
})

test('the route 404s while the flag is off — actually, not just in principle', () => {
  // Read as source rather than executed: `notFound()` throws a Next-internal
  // control-flow error whose shape is a framework implementation detail, and a
  // test that pins that shape breaks on a Next upgrade for no reason. What must
  // not change is that the guard is the FIRST thing the route body does.
  const page = read('app/abroad/page.tsx')
  const body = page.slice(page.indexOf('export default async function Page()'))
  assert.match(body, /^\s*if \(!FEATURE_ABROAD\) notFound\(\)/m)
  // …and that it sits before the render, not after it.
  assert.ok(
    body.indexOf('notFound()') < body.indexOf('<AbroadLanding'),
    'the guard runs after the page has already been built',
  )
})

test('noindex, nofollow — and no OG card', () => {
  const page = read('app/abroad/page.tsx')
  assert.match(page, /robots: \{ index: false, follow: false \}/)
  // nofollow is deliberate and differs from the retired /ask (which was
  // index:false, follow:true — it linked out to profiles we DO want crawled);
  // /abroad links to diaspora profiles that are equally not ready. If someone „fixes" this to
  // follow:true, the hidden category starts leaking through its own experts.
  // No OG card either — that is for a page you want shared. (Matched on the
  // import, not the word: the file's own comment explains the decision.)
  assert.doesNotMatch(page, /import .*socialMeta/, 'an OG card is for a page you want shared')
  assert.doesNotMatch(page, /\.\.\.socialMeta\(/)
})

test('nothing on the site links to /abroad', () => {
  // The strongest guarantee in the whole feature, and the easiest to lose: one
  // href in a nav array and the vertical is public regardless of every other
  // precaution here. Scan the real tree.
  const files: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e === '.next') continue
      const p = join(dir, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(p)) files.push(p)
    }
  }
  for (const d of ['app', 'components', 'lib']) walk(join(ROOT, d))

  const offenders: string[] = []
  for (const f of files) {
    const rel = relative(ROOT, f)
    // The vertical's own files are allowed to know their own URL.
    if (rel.startsWith('app/abroad/')) continue
    const src = readFileSync(f, 'utf8')
    src.split('\n').forEach((line, i) => {
      // A quoted "/abroad" or "/abroad/…" — i.e. a link target, not the word.
      if (/["'`]\/abroad(["'`/?#])/.test(line)) offenders.push(`      ${rel}:${i + 1}  ${line.trim()}`)
    })
  }
  assert.equal(offenders.length, 0, `something links to /abroad:\n${offenders.join('\n')}`)
})

test('it is not in the sitemap, and not in the feed', () => {
  const sitemap = read('app/sitemap.ts')
  // Only inside the explanatory comment block, never as a STATIC_ROUTES entry.
  assert.doesNotMatch(sitemap, /path: '\/abroad'/)
  // The feed carries blog posts only, so /abroad cannot reach it — pinned so a
  // future „let's add landing pages to the feed" notices this page.
  assert.doesNotMatch(read('app/rss.xml/route.ts'), /abroad/)
})

test('the admin CMS hides the dark vertical\'s keys', () => {
  // Otherwise the admin panel — part of the site — changes the moment this
  // lands: a group of ~25 fields that edit a page nobody can open.
  const route = read('app/api/admin/site-texts/route.ts')
  // Matched loosely on the abroad clause alone: the filter also drops `retired`
  // keys now, and pinning the whole expression made an unrelated change to that
  // second condition fail HERE, pointing at the wrong feature.
  assert.match(route, /SITE_TEXTS\.filter\([^)]*t\.vertical !== 'abroad' \|\| FEATURE_ABROAD/)
  // The DEFAULTS map must NOT filter — the page has to resolve its copy the
  // instant the flag flips, with no DB rows and no deploy.
  assert.ok(SITE_TEXT_DEFAULTS['abroad.hero.title'], 'abroad defaults must stay resolvable')
})

/* ═══════════ 2. the landing renders ════════════════════════════════════ */

test('the landing renders with the flag on', async () => {
  // The real thing: build the element tree. This is a server component, so
  // „renders" means the async function resolves without throwing — which
  // exercises every SiteText lookup, the euro arithmetic on three cards, the
  // expert query's DB-failure fallback, and all the JSX. No browser, no DB.
  // tsconfig.json sets `jsx: "preserve"` (Next compiles the JSX itself), so tsx
  // falls back to the CLASSIC runtime and every component module here expects a
  // free `React` binding that only Next's compiler would have injected. One
  // global satisfies all of them. This is a test-harness detail, not a claim
  // about how the app runs — Next never takes this path.
  ;(globalThis as any).React ??= (await import('react')).default

  // Resolve copy the SAME way the page does, instead of comparing against the
  // code defaults. This test used to assert the defaults and started failing the
  // moment the owner edited the page in the admin panel — the page was right and
  // the test was wrong, which is the worst way round. A DB row is SUPPOSED to
  // win; asserting the default asserts that the CMS does not work.
  const { getSiteTextMap } = await import('../lib/siteText')
  const copy = await getSiteTextMap()
  const T = (k: string) => copy[k] ?? SITE_TEXT_DEFAULTS[k] ?? ''

  const { AbroadLanding } = await import('../app/abroad/AbroadLanding')
  const tree = await AbroadLanding()
  assert.ok(tree, 'the landing returned nothing')

  // Flatten the tree to the strings it will paint, so the assertions below are
  // about what a reader sees rather than about component identity.
  const texts: string[] = []
  const keys: string[] = []
  const walk = (n: any) => {
    if (n == null || typeof n === 'boolean') return
    if (typeof n === 'string' || typeof n === 'number') { texts.push(String(n)); return }
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (typeof n === 'object' && 'props' in n) {
      // <SiteText k="…"/> resolves through React context at paint time, so the
      // key is all that exists here — collect it and check it separately.
      if (typeof n.props?.k === 'string') keys.push(n.props.k)
      walk(n.props?.children)
      // Btn/Card/Link children hide behind these too.
      for (const v of Object.values(n.props ?? {})) {
        if (v && typeof v === 'object' && ('props' in (v as any) || Array.isArray(v))) walk(v)
      }
    }
  }
  walk(tree)
  const flat = texts.join(' ')
  // …and a gap-free copy. JSX splits `₾{gel}` into two children, so the lari
  // price only exists as one token once the pieces are back together.
  const tight = texts.join('')

  // The three offer cards' euro prices are computed here, not by a client.
  // Read from the registry rather than hardcoded, so an edited price is a
  // one-file change instead of a test failure.
  for (const n of [1, 2, 3]) {
    const gel = gelFromSiteText(T(`abroad.card${n}.priceGel`), -1)
    assert.ok(tight.includes(eurLabel(gel)), `card ${n} lost its euro price (${eurLabel(gel)})`)
    assert.ok(tight.includes(`₾${gel}`), `card ${n} lost its lari price (₾${gel})`)
  }
  // The CTAs the page is built around.
  assert.ok(flat.includes(T('abroad.hero.cta')), 'the hero CTA is missing')
  assert.ok(flat.includes(T('abroad.cta.button')), 'the closing CTA is missing')
  // No DB in a test process, so loadExperts() caught and returned [] — the page
  // must still render, and must NOT claim the list is „being prepared". A failed
  // fetch rendering as an empty state is the exact bug the 2026-08-01 a11y pass
  // banned; here the distinction is kept by the CTA still being present either
  // way, so this only pins that the failure did not take the page down.
  assert.ok(flat.length > 200, 'the page rendered nearly nothing')

  // Every <SiteText k> on the page must be a REGISTERED key. A typo renders an
  // empty string — invisible in review, invisible in a typecheck, and invisible
  // until a section of the landing page is silently blank.
  const known = new Set(SITE_TEXTS.map(t => t.key))
  const unknown = keys.filter(k => !known.has(k))
  assert.deepEqual(unknown, [], `unregistered SiteText keys on /abroad: ${unknown.join(', ')}`)
  assert.ok(keys.length >= 15, `only ${keys.length} SiteText keys rendered — the copy stopped being editable`)
})

test('no card sells what the plan says we do not sell', () => {
  // The development plan's §6 excludes school tutoring outright („ბაზარი
  // დაკავებულია და მოდელიც არ გვერგება"). Card 3 shipped as „შვილს გაკვეთილი
  // მინდა" — i.e. the landing page's third of three offers was the one product
  // the business had decided not to be in — and was replaced 2026-08-04.
  // This is a PRODUCT boundary, not a copy preference, which is why it is
  // asserted rather than left to review.
  const copy = SITE_TEXTS.filter(t => t.key.startsWith('abroad.')).map(t => t.default).join(' ')
  for (const banned of ['გაკვეთილ', 'რეპეტიტორ', 'სასკოლო', 'მოსწავლე']) {
    assert.ok(!copy.includes(banned), `/abroad copy sells tutoring again („${banned}")`)
  }
})

test('every abroad key is marked as belonging to the vertical', () => {
  // The `vertical` field is what keeps them out of the admin editor. A new key
  // added without it is a leak into the CMS.
  const stray = SITE_TEXTS.filter(t => t.key.startsWith('abroad.') && t.vertical !== 'abroad')
  assert.deepEqual(stray.map(t => t.key), [])
})

/* ═══════════ 3. the euro display ═══════════════════════════════════════ */

test('euro conversion is whole-euro and marked approximate', () => {
  assert.equal(eurFromGel(100), Math.round(100 * ABROAD_EUR_PER_GEL))
  assert.equal(eurFromGel(0), 0)
  // Rounds, never truncates: at 0.33, 150₾ is 49.5 → 50, and „€49" would be
  // undercharging the reader's expectation by a euro on every quote.
  assert.equal(eurFromGel(150), 50)

  // The „≈" is load-bearing. The charge is in lari at a rate that is a constant
  // reviewed by hand; a bare „€50" next to a payment button reads as a quote we
  // are offering. Every euro figure on the site goes through eurLabel.
  assert.ok(eurLabel(150).startsWith('≈ €'), 'the approximation marker was dropped')
  assert.equal(eurLabel(150), '≈ €50')

  // A sane rate. This is a hand-maintained constant, so the guard is against a
  // decimal-point slip (3.03 instead of 0.33 would price a ₾150 session at
  // €455) rather than against it being a few percent stale.
  assert.ok(ABROAD_EUR_PER_GEL > 0.1 && ABROAD_EUR_PER_GEL < 1, 'the GEL→EUR rate is not plausible')
})

test('an admin cannot type a price that renders as NaN', () => {
  // SiteText values are free text. „150 ლარი", a stray space and an empty box
  // are all one keystroke away, and „≈ €NaN" on a landing page is worse than a
  // stale number.
  assert.equal(gelFromSiteText('150', 120), 150)
  assert.equal(gelFromSiteText(' 150 ', 120), 150)
  assert.equal(gelFromSiteText('150 ლარი', 120), 150)
  assert.equal(gelFromSiteText('', 120), 120)
  assert.equal(gelFromSiteText(undefined, 120), 120)
  assert.equal(gelFromSiteText('უფასო', 120), 120)
  assert.equal(gelFromSiteText('0', 120), 120)
  assert.equal(gelFromSiteText('-40', 120), 40, 'the sign is stripped, not honoured — a negative price is not a discount')
  // …and the defaults shipped in the registry all parse.
  for (const n of [1, 2, 3]) {
    const raw = SITE_TEXT_DEFAULTS[`abroad.card${n}.priceGel`]
    assert.ok(Number.isInteger(gelFromSiteText(raw, -1)) && gelFromSiteText(raw, -1) > 0, `card${n} price „${raw}" does not parse`)
  }
})

/* ═══════════ 4. the category is the audience gate ══════════════════════ */

test('the category predicate is exact', () => {
  assert.equal(isAbroadCategory(ABROAD_CATEGORY_SLUG), true)
  assert.equal(isAbroadCategory('diaspora-x'), false)
  assert.equal(isAbroadCategory('biznesi'), false)
  // An expert with NO category is not a diaspora expert. This is the case that
  // matters: `categoryId` is nullable, and a predicate that treated null as a
  // match would open request-booking for every uncategorised profile.
  assert.equal(isAbroadCategory(null), false)
  assert.equal(isAbroadCategory(undefined), false)
  assert.equal(isAbroadCategory(''), false)
})

test('the landing NEVER lists by the hidden category', () => {
  // The trap this pins, found the moment the category was created and before a
  // single expert was assigned to it:
  //
  //   `TutorProfile.categoryId` is single-valued, and lib/tutorsQuery excludes
  //   any expert whose category is not browsable — from the category page, from
  //   the general /tutors browse, from search AND from the sitemap. So moving a
  //   lawyer into the hidden `diaspora` category does not add them to /abroad,
  //   it REMOVES them from the public site. The one action that reads as „turn
  //   this expert on for the diaspora" is the one that takes them off.
  //
  // The page therefore draws from categories that already exist and stay put.
  const landing = read('app/abroad/AbroadLanding.tsx')
  assert.match(landing, /ABROAD_SOURCE_CATEGORY_SLUGS/)
  assert.doesNotMatch(
    landing,
    /slug: ABROAD_CATEGORY_SLUG/,
    'the landing filters on the hidden category — assigning experts to it would delete them from the catalog',
  )
  // …and it still applies the catalog's own visibility rule, so it can never
  // advertise a paused or suspended expert. Since 2026-08-10 the category half
  // of that rule is lib/categoryTree's — asserted by name, because a hand-typed
  // copy here is exactly how the landing and the catalogue would drift apart.
  for (const rule of [/available: true/, /suspendedAt: null/, /categorySlugFilter\(ABROAD_SOURCE_CATEGORY_SLUGS\)/]) {
    assert.match(landing, rule, `the landing dropped a visibility rule: ${rule}`)
  }
  // The source list must name only REAL categories.
  const live = ['law', 'tax', 'career', 'business', 'finance', 'marketing', 'sales', 'psychology', 'it', 'product', 'design', 'hr', 'real-estate', 'relocation', 'crypto']
  for (const s of ABROAD_SOURCE_CATEGORY_SLUGS) {
    assert.ok(live.includes(s), `„${s}" is not a category that exists`)
    assert.notEqual(s, ABROAD_CATEGORY_SLUG)
  }
})

test('the seed script creates a HIDDEN category, and refuses to re-hide a live one', () => {
  const script = read('scripts/abroad-category.ts')
  // Both fields: `status` is what the site reads, `isLive` is what the rollback
  // restores from, and a row where they disagree is a row that behaves
  // differently before and after the migration is reverted.
  assert.match(script, /status: 'HIDDEN'/)
  assert.match(script, /isLive: false/)
  // Hiding is the entire mechanism (browse, sitemap and /categories all apply
  // it while the profile route does not), so a script that could flip a live
  // category back to hidden is a script that can cause a silent outage.
  assert.match(script, /if \(existing\?\.status === 'VISIBLE'\)/)
  assert.match(script, /Refusing to re-hide/)
  // It must not create experts, bookings or anything else.
  for (const forbidden of ['tutorProfile.create', 'user.create', 'booking.create', 'deleteMany']) {
    assert.ok(!script.includes(forbidden), `the seed script does more than one category row: ${forbidden}`)
  }
})

/* ═══════════ 5. the payment link is a link, and nothing more ═══════════ */

test('the payment link stores and displays — it does not charge', () => {
  const route = read('app/api/bookings/[id]/route.ts')
  // https only. lib/safeUrl's render guard also passes mailto:, tel: and
  // relative paths; none of those is a bank payment page, and a plain http one
  // is either a typo or a downgrade.
  assert.match(route, /if \(!\/\^https:\\\/\\\/\/i\.test\(raw\)\)/)
  assert.match(route, /error: 'BAD_PAYMENT_URL'/)
  // An empty string must CLEAR it — a wrong payment link the expert cannot take
  // down is worse than none at all.
  assert.match(route, /let value: string \| null = null/)
  // …and nothing in that branch touches the money model.
  const branch = route.slice(
    route.indexOf("typeof rawBody?.paymentLinkUrl === 'string'"),
    route.indexOf("if (rawBody?.action === 'expert_no_show')"),
  )
  for (const forbidden of ['payoutStatus', 'PAYMENTS_LIVE', 'price:']) {
    assert.ok(!branch.includes(forbidden), `the payment-link branch touches ${forbidden} — it is supposed to store a string`)
  }
})

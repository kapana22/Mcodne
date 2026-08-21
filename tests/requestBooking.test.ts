/*
 * Request-based booking — the guards that must NOT relax with it.
 *
 * Run with:  npx tsx tests/requestBooking.test.ts
 *
 * WHY. 46% of booking attempts (31 of 68, measured 2026-08-03) died on „no free
 * time", every one of them because the expert had published nothing upcoming.
 * A request inverts the direction: the client proposes a time and the expert
 * answers it like a message. That is a deliberate hole in exactly ONE check —
 * the published-window gate — and the danger is that it quietly becomes a hole
 * in the others. These pin the boundary by reading the route itself, since the
 * decision lives in a Serializable transaction that cannot be unit-tested
 * without a database.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { FEATURE_REQUEST_BOOKING } from '../lib/flags'

const ROOT = join(import.meta.dirname, '..')
const route = readFileSync(join(ROOT, 'app/api/bookings/route.ts'), 'utf8')
const boot = readFileSync(join(ROOT, 'lib/dbBoot.ts'), 'utf8')
const schema = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8')
const reschedule = readFileSync(join(ROOT, 'app/api/bookings/[id]/reschedule/route.ts'), 'utf8')
const respond = readFileSync(join(ROOT, 'app/api/bookings/[id]/reschedule/respond/route.ts'), 'utf8')
/** Route source with comments stripped — the prose explains the old behaviour,
 *  so leaving it in would let a comment satisfy an assertion about code.
 *
 *  ORDER MATTERS, and getting it wrong is silent. Line 77 of the route contains
 *  `/me/*` inside a `//` comment. Stripping block comments FIRST makes
 *  that the opening of a block, which then runs to the next `*​/` three hundred
 *  lines later and deletes most of the file — every assertion below failed
 *  against an empty-ish string that looked like a real mismatch. Line comments
 *  go first so that `/*` is gone before anything looks for one. */
const code = route.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

test('the feature ships OFF — it belongs to the diaspora vertical', () => {
  // Restored 2026-08-04 after an attempt to flip it. `FEATURE_REQUEST_BOOKING`
  // is not an independent switch: `tests/abroad.test.ts` asserts „the vertical
  // ships OFF", and turning this on turns on part of that unfinished work.
  // Flip BOTH together, with the vertical's author, or neither.
  assert.equal(FEATURE_REQUEST_BOOKING, false)
})

test('every surface that offers a proposal is category-scoped', () => {
  // Independent of the flag, and the reason it matters: the server scopes a
  // request to the flag AND lib/abroad. A CTA reading only the flag would
  // render a button that 409s the moment the vertical is enabled.
  const surfaces = {
    'components/booking/BookingFlow.tsx': /canPropose = FEATURE_REQUEST_BOOKING && isAbroadExpert/,
    'components/booking/InlineAvailability.tsx': /canProposeHere = FEATURE_REQUEST_BOOKING && isAbroadCategory\(categorySlug\)/,
  }
  for (const [f, re] of Object.entries(surfaces)) {
    assert.match(readFileSync(join(ROOT, f), 'utf8'), re, `${f} offers a proposal without the category scope`)
  }
  // The profile's two CTAs share one derived predicate rather than four copies.
  // Read the whole page directory: the profile is split across `_*.tsx` files
  // (the two CTAs live in _booking.tsx, the predicate is derived in client.tsx),
  // and this assertion is about the page as a whole, not about one file.
  const profile = readdirSync(join(ROOT, 'app/experts/[slug]'))
    .filter(f => f.endsWith('.tsx'))
    .sort()
    .map(f => readFileSync(join(ROOT, 'app/experts/[slug]', f), 'utf8'))
    .join('\n')
  assert.match(profile, /const isAbroadProfile = isAbroadCategory\(/)
  assert.equal((profile.match(/FEATURE_REQUEST_BOOKING && canProposeCategory/g) ?? []).length, 2)
})

test('a request needs the flag, the client asking, AND the diaspora category', () => {
  // Three terms, all required.
  //
  // `proposed` alone must do nothing — an older or hostile client must not be
  // able to bypass the availability gate while the feature is off.
  //
  // The CATEGORY term (added 2026-08-04 with the diaspora vertical) is the one
  // that stops the blast radius from being the whole marketplace. The
  // published-window gate is the platform's only guarantee that an expert is
  // never booked at a time they did not offer; a request steps around it by
  // design. Scoping that exception to one hidden category means flipping
  // FEATURE_REQUEST_BOOKING on cannot loosen the guarantee for the experts in
  // the ordinary catalog, who never agreed to answer out-of-schedule proposals.
  // Drop this term and „turn the feature on for the diaspora" silently becomes
  // „turn it on for everyone".
  assert.match(
    code,
    /const isRequest =\s*\n?\s*FEATURE_REQUEST_BOOKING && parsed\.data\.proposed === true && isAbroadCategory\(tutor\.category\?\.slug\)/,
  )
  // …and the category has to come off the EXPERT'S OWN ROW, not the request
  // body. A `context: 'abroad'` field the client sends would be forgeable and
  // the whole scope would be theatre.
  assert.match(code, /category: \{ select: \{ slug: true \} \}/)
})

test('ONLY the published-window gate is skipped', () => {
  // isStartOpen is the availability gate and the one deliberate hole.
  assert.match(code, /if \(!isRequest && !isStartOpen\(/)
  // Everything else must still be unconditional. If any of these ever gains an
  // `isRequest` escape, a proposal could be booked on top of a real session, in
  // the past, or against a suspended expert.
  for (const guard of [
    /if \(overlaps\) throw new SlotTaken\(\)/,
    /error: 'PAST_DATE'/,
    /error: 'SELF_BOOKING'/,
    /error: 'TUTOR_UNAVAILABLE'/,
    /error: 'RATE_LIMIT'/,
  ]) assert.match(code, guard, `a guard went missing: ${guard}`)
  // …and none of them may be conditioned on isRequest. Every use of the flag is
  // enumerated here, exactly, so a new one has to be added deliberately and with
  // a reason — an unnoticed fourth CONDITIONAL is how some other guard quietly
  // learns to make an exception for requests, which is the failure this whole
  // file exists for.
  //
  // The list grew from three to six on 2026-08-04, and the distinction that
  // matters is which kind each one is:
  //   CONTROL FLOW (may never grow) — the decision, the one gate it opens, the
  //     alternates normalisation, and the write that records the origin;
  //   REPORTING (harmless) — the notification body and the email's
  //     `proposedByStudent` flag, which only decide what the expert is TOLD.
  // If a new entry appears that guards anything, this assertion has done its job.
  const uses = [...code.matchAll(/^.*\bisRequest\b.*$/gm)].map(m => m[0].trim())
  assert.deepEqual(
    uses,
    [
      // control flow
      'const isRequest =',
      'if (isRequest) {',                                    // alternates normalisation
      'if (!isRequest && !isStartOpen(start, openOpts)) {',   // THE one gate
      'if (isRequest) {',                                    // the origin write
      // reporting only
      'body: isRequest ? `${topic} — დრო კლიენტმა შემოგვთავაზა` : topic,',
      'proposedByStudent: isRequest,',
    ],
    `isRequest is used somewhere new:\n  ${uses.join('\n  ')}`,
  )
})

test('the alternates are normalised, never trusted', () => {
  // A 2nd/3rd choice is client input like any other. It must not be able to
  // become an Invalid Date on the expert's screen, a time in the past they are
  // asked to accept, or an unbounded list.
  assert.match(code, /proposedAlternates:\s+z\.array\(z\.string\(\)\.datetime\(\)\)\.max\(2\)/)
  assert.match(code, /if \(isNaN\(d\.getTime\(\)\)\) continue/)
  assert.match(code, /if\s+\(d\.getTime\(\)\s+<\s+Date\.now\(\)\s+-\s+CLOCK_SKEW_MS\)\s+continue/)
  assert.match(code, /if \(alternates\.length === 2\) break/)
  // …and they only exist for a real request. Outside one there is no such thing
  // as an alternative time, so the array is never even built.
  assert.match(code, /const\s+alternates:\s+string\[\]\s+=\s+\[\]\s*\n\s*if\s+\(isRequest\)\s+\{/)
})

test('a proposal still cannot collide with a real session', () => {
  // The overlap re-check and the student-overlap check are INSIDE the
  // Serializable transaction and above the gate, so they run for requests too.
  const tx = code.slice(code.indexOf('prisma.$transaction'), code.indexOf('isolationLevel'))
  assert.ok(tx.includes('SlotTaken'), 'tutor-side overlap check left the transaction')
  assert.ok(tx.includes('StudentOverlap'), 'student-side overlap check left the transaction')
  assert.ok(
    tx.indexOf('SlotTaken') < tx.indexOf('!isRequest'),
    'the overlap check must run BEFORE the gate is skipped',
  )
})

test('price stays server-authoritative for a request', () => {
  // A proposal is still a purchase. The client body carries `price` for
  // backward compatibility and it must remain ignored.
  assert.match(code, /const price = consultation \? consultation\.price : tutor\.price/)
})

test('the counter-offer hole opens the window rule ONLY, on both halves', () => {
  // „Accept one, or offer another" is half the flow, and until 2026-08-04 the
  // second half did not exist: /reschedule refuses any time outside a published
  // window, and these experts publish nothing — that is why the request path
  // exists at all. So the window rule is relaxed for a booking that was CREATED
  // as a proposal, and for nothing else.
  //
  // THE SHAPE OF THE RELAXATION IS THE SAFETY PROPERTY. It is expressed as a
  // synthetic window covering exactly the proposed slot, NOT as a skipped
  // isStartOpen() call — so lib/availability's clause (b), „clear of every
  // other live session plus buffer", still runs against the real booking list.
  // A skipped call would drop the overlap check with it, and a counter-offer
  // could be accepted on top of a real session.
  for (const [name, src] of [['propose', reschedule], ['respond', respond]] as const) {
    assert.match(src, /\[\{ start: newStart, end: newEnd \}\]/, `${name}: the hole is not a synthetic window`)
    assert.match(src, /proposedByStudent/, `${name}: the hole is not scoped to a client proposal`)
    // isStartOpen is still CALLED — exactly once, with the busy list intact.
    assert.match(src, /isStartOpen\(newStart, \{/, `${name}: the openness check was skipped, not narrowed`)
    assert.match(src, /busy: /, `${name}: the busy list left the openness check`)
  }
})

test('the origin is recorded, and inside the same transaction', () => {
  // Committing a request as an ordinary booking would show the expert a time
  // outside their calendar with nothing explaining it.
  assert.match(code, /"proposedByStudent" = true/)
  const tx = code.slice(code.indexOf('prisma.$transaction'), code.indexOf('isolationLevel'))
  assert.ok(tx.includes('proposedByStudent'), 'the origin write escaped the transaction')
  // The alternates ride on the SAME statement. Splitting them would let a
  // request commit with its origin recorded and the other times the client
  // offered lost — the expert would then be answering a single take-it-or-
  // leave-it time they were never actually given.
  assert.ok(tx.includes('proposedAlternates'), 'the alternates write escaped the transaction')
  assert.match(code, /"proposedByStudent" = true, "proposedAlternates" = \$2::jsonb/)
})

test('the columns exist in the boot DDL — and in schema.prisma', () => {
  // dbBoot is the only thing that creates them (no `prisma db push` runs on
  // deploy). Without the DDL, every request 500s.
  assert.match(boot, /ADD COLUMN IF NOT EXISTS "proposedByStudent" BOOLEAN NOT NULL DEFAULT false/)
  assert.match(boot, /ADD COLUMN IF NOT EXISTS "proposedAlternates" JSONB/)

  // And they MUST also be declared in schema.prisma. This half is the one that
  // was missing: `proposedByStudent` shipped 2026-08-04 in dbBoot alone, which
  // put it one `prisma db push` away from being silently dropped — taking with
  // it every record of which bookings the client had proposed. schema.prisma's
  // own comment states the rule for `rescheduleRequest` and
  // `sessionReminderSentAt`; nothing enforced it until this assertion.
  for (const field of ['proposedByStudent', 'proposedAlternates']) {
    assert.match(
      schema,
      new RegExp(`^\\s*${field}\\s+\\S+`, 'm'),
      `${field} is a dbBoot column that schema.prisma doesn't declare — a db push would drop it`,
    )
  }
})

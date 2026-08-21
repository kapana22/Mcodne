// Admin account removal — app/api/admin/users/[id] DELETE + lib/userDeletion.
//
// Run: npx tsx --test tests/userDeletion.test.ts
//
// Three classes of invariant, and none of them fail loudly in the browser:
//
//   §A  SCOPE.   `OR: []` matches NOTHING in Prisma. If the expert-side arm is
//                left in as an empty array for a client-only account, every
//                count and every deleteMany silently scopes to zero rows and
//                the panel reports a clean account with a full history.
//   §B  COUNTERS. `rating` / `reviewsCount` / `sessionsCount` are CACHED on
//                TutorProfile. Deleting one side of a booking without fixing
//                the other side's cache leaves a rating with no reviews behind
//                it — a wrong number is indistinguishable from a right one.
//   §C  ORDER.   The delete sequence is dictated by the schema's deliberate
//                Restrict edges. Wrong order = P2003 halfway through, with the
//                reviews already gone and the user still there.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import {
  LIVE_STATUSES,
  ANON_NAME,
  ANON_HEADLINE,
  anonEmail,
  DeleteBody,
  asEitherParty,
  staleRatingTargets,
  sessionCountDecrements,
  isAnonymized,
} from '../lib/userDeletion'

const ROUTE = readFileSync(
  join(process.cwd(), 'app/api/admin/users/[id]/route.ts'),
  'utf8',
)

/* The admin panel is one screen split across `app/admin/*.tsx` — the users list
   and the audit-label map live in their own tab files now, not in page.tsx. The
   assertions below are about the panel as a whole, so read the directory rather
   than name a file that the next split would invalidate. */
const adminPanelSrc = () =>
  readdirSync(join(process.cwd(), 'app/admin'))
    .filter(f => f.endsWith('.tsx'))
    .sort()
    .map(f => readFileSync(join(process.cwd(), 'app/admin', f), 'utf8'))
    .join('\n')

/* ── §A scope ──────────────────────────────────────────────────────────── */

test('§A a client-only account scopes to the student arm ALONE — never an empty OR member', () => {
  const w = asEitherParty('u1', null)
  assert.equal(w.OR.length, 1, 'a null tutorId must DROP the expert arm, not add an empty one')
  assert.deepEqual(w.OR[0], { studentId: 'u1' })
  // The failure this pins: `OR: [{studentId}, {}]` matches every row, and
  // `OR: []` matches none. Both are silent.
  for (const arm of w.OR) {
    assert.ok(Object.keys(arm).length > 0, 'no OR arm may be an empty object')
  }
})

test('§A an expert account scopes to BOTH sides', () => {
  const w = asEitherParty('u1', 't1')
  assert.equal(w.OR.length, 2)
  assert.deepEqual(w.OR, [{ studentId: 'u1' }, { tutorId: 't1' }])
})

/* ── §B cached counters ────────────────────────────────────────────────── */

test('§B every other expert whose review is being deleted is marked stale', () => {
  const stale = staleRatingTargets(
    [{ tutorId: 'a' }, { tutorId: 'b' }, { tutorId: 'a' }],
    null,
  )
  assert.deepEqual([...stale].sort(), ['a', 'b'])
})

test("§B the deleted account's OWN profile is never recomputed — it is gone", () => {
  const stale = staleRatingTargets([{ tutorId: 'self' }, { tutorId: 'other' }], 'self')
  assert.deepEqual([...stale], ['other'])
})

test('§B sessionsCount is decremented only for COMPLETED, UNDISPUTED bookings', () => {
  const dec = sessionCountDecrements(
    [
      { tutorId: 'a', status: 'COMPLETED', dispute: null },
      { tutorId: 'a', status: 'COMPLETED', dispute: null },
      // Never counted on the way in (see app/api/admin/disputes/[id]) — so
      // subtracting it here would push the counter BELOW the truth.
      { tutorId: 'a', status: 'COMPLETED', dispute: { id: 'd1' } },
      { tutorId: 'b', status: 'CANCELED', dispute: null },
      { tutorId: 'b', status: 'NO_SHOW', dispute: null },
    ],
    null,
  )
  assert.equal(dec.get('a'), 2)
  assert.equal(dec.get('b'), undefined, 'a canceled/no-show session never bumped the counter')
})

test('§B the deleted expert never decrements their own counter', () => {
  const dec = sessionCountDecrements(
    [{ tutorId: 'self', status: 'COMPLETED', dispute: null }],
    'self',
  )
  assert.equal(dec.size, 0)
})

test('§B the counter is clamped in SQL, not by a read-then-write', () => {
  // GREATEST(0, x - n) in one statement: the clamp and the subtraction are
  // atomic, so a concurrent completion cannot be lost and the column can never
  // go negative. A read, subtract, write would lose both properties.
  assert.match(ROUTE, /GREATEST\(0,\s*"sessionsCount"\s*-\s*\$\{n\}\)/)
})

/* ── §C delete order (FK-critical) ─────────────────────────────────────── */

test('§C purge deletes in the order the Restrict edges demand', () => {
  const seq = [
    'tx.review.deleteMany',
    'tx.message.deleteMany',
    'tx.booking.deleteMany',
    'tx.enrollment.deleteMany',
    'tx.user.delete',
  ]
  const positions = seq.map(s => {
    const at = ROUTE.indexOf(s)
    assert.ok(at > -1, `purge must call ${s}`)
    return at
  })
  for (let i = 1; i < positions.length; i++) {
    assert.ok(
      positions[i] > positions[i - 1],
      `${seq[i]} must come AFTER ${seq[i - 1]} — Review→Booking and Booking→User are Restrict, ` +
      'so the reverse order dies on P2003 with the reviews already deleted',
    )
  }
})

test('§C the FK-less dbBoot tables are deleted BY HAND, not left to a cascade', () => {
  // lib/dbBoot creates Package + Enrollment with raw `CREATE TABLE IF NOT
  // EXISTS` and declares NO foreign keys — there is not one REFERENCES clause
  // in the file. schema.prisma says `Package.tutor onDelete: Cascade`, but
  // Prisma relies on a DB constraint that, for these tables, does not exist.
  // Deleting the profile would leave orphan rows pointing at a dead tutorId.
  const boot = readFileSync(join(process.cwd(), 'lib/dbBoot.ts'), 'utf8')
  // DDL only — case-sensitive and followed by a quoted identifier, so the
  // file's own prose („a bare TEXT column with NO foreign key on purpose")
  // cannot pass or fail this.
  //
  // NARROWED 2026-08-10, and the narrowing is the point. dbBoot now declares
  // ONE real foreign key: Category.parentId → Category.id, for the sphere
  // hierarchy. It says nothing about deleting a person — it joins two category
  // rows — so a blanket „no FK anywhere" would fail on a change that cannot
  // affect this route, and the usual fix for a test that cries wolf is to
  // delete it. What actually matters is that no dbBoot table hangs off a User
  // or a TutorProfile: that is the edge a cascade would have to travel, and its
  // absence is why the rows below are removed by hand.
  //
  // NARROWED AGAIN 2026-08-11 (B2B), and for the opposite reason to last time.
  // The 2026-08-10 narrowing excused an edge that cannot reach a person at all;
  // this one excuses an edge that reaches a person ON PURPOSE.
  //
  // CompanyMember is a MEMBERSHIP — a permission, not a record of something
  // that happened — and it carries a real DB-level ON DELETE CASCADE. That is
  // exactly what Package and Enrollment lack and why THEY are deleted by hand:
  // their cascade is an annotation in schema.prisma with no constraint behind
  // it. This one is the constraint. So it needs no hand-delete, and adding one
  // would be dead code in both deletion paths (admin purge + /api/me).
  //
  // It is allowlisted BY NAME and by its referential action, so the alarm keeps
  // working: a second person-edge still fails here, and so does this one if
  // somebody weakens it to RESTRICT (which would make a person undeletable) or
  // to SET NULL (which would leave a membership belonging to nobody).
  //
  // ⚠️ The MONEY is deliberately not on this edge. CompanyTransaction has no FK
  // to User at all, so deleting an account never erases the ledger that says
  // what their company was charged. If that ever changes, this test will not
  // catch it — tests/b2b.test.ts owns that invariant.
  //
  // NARROWED AGAIN 2026-08-14 (requests), by THREE edges, and the alarm did its
  // job: it fired on the day they landed and forced the re-check it names.
  // What the re-check found, edge by edge:
  //
  //   RequestAccess.userId  CASCADE — a permission, exactly like CompanyMember,
  //       and a real constraint. Needs no hand-delete on purge. The ANONYMIZE
  //       path deletes it explicitly anyway (see the assertion below): that mode
  //       keeps the row and only scrubs the person, so nothing would remove an
  //       allowlist entry naming a dead account.
  //   RequestOffer.expertUserId  CASCADE — the offer is unreadable without the
  //       provider (it has no name and no contact of its own). Deliberately NOT
  //       SET NULL: the table carries a CHECK that exactly one provider column
  //       is set, so a SET NULL would violate it and make the account
  //       UNDELETABLE with a constraint error — the failure this alarm exists to
  //       stop, arriving by the opposite route.
  //   ServiceRequest.userId  SET NULL — and this is the one that needed work.
  //       The row survives on purpose (what the market asked for is not about
  //       the person), but `contactName`/`phone`/`email` are PLAIN COLUMNS on
  //       it, not a join to User, so no referential action can reach them. BOTH
  //       deletion paths therefore scrub them by hand, and both are asserted
  //       below. Same shape as the HelpMessage problem this file already pins.
  //
  // Each is allowlisted BY NAME and BY ITS REFERENTIAL ACTION, so weakening any
  // of them — or adding a fourth person-edge — still fails here.
  const ALLOWED_PERSON_EDGES: [RegExp, string][] = [
    [/ALTER TABLE "CompanyMember" ADD CONSTRAINT "CompanyMember_userId_fkey" FOREIGN KEY \("userId"\) REFERENCES "User"\("id"\) ON DELETE CASCADE[^;]*;/,
      'the CompanyMember→User cascade is gone — a deleted account now leaves its membership behind'],
    [/ALTER TABLE "RequestAccess" ADD CONSTRAINT "RequestAccess_userId_fkey" FOREIGN KEY \("userId"\) REFERENCES "User"\("id"\) ON DELETE CASCADE[^;]*;/,
      'the RequestAccess→User cascade is gone — a deleted account keeps its requests allowlist row'],
    // MasterApplication.userId  CASCADE — the only referential action available
    //     and the only correct one. The row is not a record ABOUT the person
    //     the way a ServiceRequest is (that one survives anonymised, because
    //     what somebody needed fixing is market data with the name scrubbed);
    //     this row IS the person — name, phone, a photo of their face and a
    //     paragraph they wrote about themselves. Keeping it after a deletion
    //     request would be keeping exactly what was asked to be deleted. SET
    //     NULL is not on the table (NOT NULL column, one row per account) and
    //     RESTRICT would make an account undeletable because somebody once
    //     applied to fix taps.
    [/ALTER TABLE "MasterApplication" ADD CONSTRAINT "MasterApplication_userId_fkey" FOREIGN KEY \("userId"\) REFERENCES "User"\("id"\) ON DELETE CASCADE[^;]*;/,
      'the MasterApplication→User cascade is gone — a deleted account keeps its photo, phone and application'],
    // ServiceProfile.userId  CASCADE — added 2026-08-18, and it was MISSING
    //     ENTIRELY until then. prisma/schema declared the cascade; the raw DDL
    //     that actually creates this table never emitted a foreign key, so
    //     production had none. Deleting three test masters left three rows with
    //     a `userId` pointing at nothing — still `available`, still matched by
    //     the routing query, still drawn on /services with a null name. Nothing
    //     errored, and nothing would have. CASCADE is the only correct action
    //     here for the same reason as MasterApplication: the row is a person's
    //     trade listing, and it cannot outlive the account.
    [/ALTER TABLE "ServiceProfile" ADD CONSTRAINT "ServiceProfile_userId_fkey" FOREIGN KEY \("userId"\) REFERENCES "User"\("id"\) ON DELETE CASCADE[^;]*;/,
      'the ServiceProfile→User cascade is gone — deleting a master would orphan their listing, and the listing keeps being routed'],
    // CreditEntry.userId  CASCADE — added 2026-08-20 with the balance ledger.
    //     Written INLINE in the CREATE TABLE (`REFERENCES "User"("id") ON
    //     DELETE CASCADE`) rather than as a separate ALTER, which is why the
    //     pattern below differs in shape from its neighbours.
    //     CASCADE is the only correct action. A credit row is not a record
    //     ABOUT a person the way a ServiceRequest is — it is a bookkeeping line
    //     for an account that no longer exists, worth nothing to anybody and
    //     denominated in a balance that cannot be paid out (lib/credits: it buys
    //     offers and nothing else, and PAYMENTS_LIVE is false). SET NULL would
    //     leave a sum belonging to nobody; RESTRICT would make an account
    //     undeletable because it once earned 15₾ for a photo.
    [/"userId"\s+TEXT NOT NULL REFERENCES "User"\("id"\) ON DELETE CASCADE/,
      'the CreditEntry→User cascade is gone — a deleted account leaves a balance behind'],
    [/ALTER TABLE "RequestOffer" ADD CONSTRAINT "RequestOffer_expertUserId_fkey" FOREIGN KEY \("expertUserId"\) REFERENCES "User"\("id"\) ON DELETE CASCADE[^;]*;/,
      'the RequestOffer→User cascade changed — SET NULL would break the one-provider CHECK and make the account undeletable'],
    [/ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_userId_fkey" FOREIGN KEY \("userId"\) REFERENCES "User"\("id"\) ON DELETE SET NULL[^;]*;/,
      'the ServiceRequest→User edge changed — CASCADE would delete the market history, RESTRICT would block the delete'],
    // RequestMessage.fromUserId  SET NULL — and it costs a CHECK to be safe.
    //     The thread is what a company answers for and it outlives the member
    //     who typed in it, so CASCADE (the RequestOffer answer) is wrong here.
    //     But SET NULL only WORKS because the table's author CHECK is one-way:
    //     the strict version rejected the very update this action performs, so
    //     a provider who had ever sent a message could not be deleted at all.
    //     Both halves are asserted — the action here, the CHECK below — because
    //     restoring either one alone re-creates the undeletable account.
    [/ALTER TABLE "RequestMessage" ADD CONSTRAINT "RequestMessage_fromUserId_fkey" FOREIGN KEY \("fromUserId"\) REFERENCES "User"\("id"\) ON DELETE SET NULL[^;]*;/,
      'the RequestMessage→User edge changed — CASCADE would tear a departed member’s words out of a live company thread'],
  ]

  // The other half of that pair. A CHECK demanding an author on every provider
  // message reads as obviously right and is why this alarm exists: paired with
  // SET NULL it makes the account undeletable, and the failure surfaces as a
  // constraint error inside the purge transaction, not here.
  // Read the CHECK BODIES, not the file: dbBoot also carries a repair block
  // that looks for the old definition by name, and „IS NOT NULL" appears there
  // as the thing being searched FOR.
  const authorChecks = [...boot.matchAll(/"RequestMessage_author_matches_side"\s*CHECK\s*\(([\s\S]{0,200}?)\)/g)]
    .map(m => m[1])
  assert.ok(authorChecks.length > 0, 'the RequestMessage author CHECK is gone entirely')
  for (const c of authorChecks) {
    assert.ok(!/IS NOT NULL/.test(c),
      'the RequestMessage author CHECK demands an author again — SET NULL on that column will now fail the purge')
  }
  let rest = boot
  for (const [re, msg] of ALLOWED_PERSON_EDGES) {
    assert.match(boot, re, msg)
    // Scan everything EXCEPT the allowed statements, so the assertions below
    // are byte-for-byte the ones that have always run.
    rest = rest.replace(re, '')
  }

  const edges = [...rest.matchAll(/\bREFERENCES\s+"(\w+)"/g)].map(m => m[1])
  for (const table of edges) {
    assert.ok(
      table !== 'User' && table !== 'TutorProfile',
      `dbBoot grew a foreign key to "${table}" — re-check whether these hand-deletes are still needed`,
    )
  }
  assert.ok(!/\bFOREIGN KEY\s+\("(userId|tutorId)"\)/.test(rest),
    'dbBoot grew a foreign key on a person column — re-check the hand-deletes')
  assert.match(ROUTE, /tx\.package\.deleteMany/)
  assert.match(ROUTE, /tx\.enrollment\.deleteMany/)

  // The two halves of the requests re-check, asserted rather than described.
  // A cascade cannot reach a plain column, so if either of these disappears a
  // „deleted" account keeps a working phone number in the request table.
  const scrubs = ROUTE.match(/UPDATE "ServiceRequest"/g) ?? []
  assert.equal(scrubs.length, 2,
    'both deletion modes must scrub ServiceRequest\'s contact columns — no FK can reach them')
  assert.match(ROUTE, /tx\.requestAccess\.deleteMany/,
    'anonymize no longer drops the requests allowlist row — it would name a dead account')
})

test('§C purge removes the raw-SQL tables that hold the person outside Prisma', () => {
  // HelpMessage (dbBoot, raw SQL, no FK) stores the sender's EMAIL, NAME and
  // free text. A „სრული წაშლა" that leaves those is not one. Event keeps its
  // analytics row but loses the dangling link.
  assert.match(ROUTE, /DELETE FROM "HelpMessage" WHERE "userId"/)
  assert.match(ROUTE, /UPDATE "Event" SET "userId" = NULL/)
})

test('anonymize scrubs the HelpMessage identity columns too', () => {
  assert.match(ROUTE, /UPDATE "HelpMessage" SET "email"[\s\S]{0,80}"name"/)
})

test('§C the whole purge runs in ONE transaction with a raised timeout', () => {
  assert.match(ROUTE, /prisma\.\$transaction\(/)
  // The 5s default aborts an account with years of history halfway through.
  assert.match(ROUTE, /timeout:\s*30_000/)
})

/* ── guards ────────────────────────────────────────────────────────────── */

test('a reason is mandatory and bounded', () => {
  assert.equal(DeleteBody.safeParse({ mode: 'purge' }).success, false)
  assert.equal(DeleteBody.safeParse({ mode: 'purge', reason: '   ' }).success, false)
  assert.equal(DeleteBody.safeParse({ mode: 'purge', reason: 'ab' }).success, false)
  assert.equal(DeleteBody.safeParse({ mode: 'purge', reason: 'სპამი' }).success, true)
  assert.equal(DeleteBody.safeParse({ mode: 'purge', reason: 'x'.repeat(301) }).success, false)
})

test('only the two known modes are accepted', () => {
  assert.equal(DeleteBody.safeParse({ mode: 'anonymize', reason: 'მოთხოვნა' }).success, true)
  assert.equal(DeleteBody.safeParse({ mode: 'soft', reason: 'მოთხოვნა' }).success, false)
  assert.equal(DeleteBody.safeParse({ reason: 'მოთხოვნა' }).success, false)
})

test('the reason is trimmed before it reaches the audit row', () => {
  const p = DeleteBody.safeParse({ mode: 'purge', reason: '  ტესტური ანგარიში  ' })
  assert.ok(p.success)
  assert.equal(p.data.reason, 'ტესტური ანგარიში')
})

test('the live-booking guard is re-run INSIDE both transactions, not only before', () => {
  // „A status check you read before the write is not a guard" (CLAUDE.md). The
  // pre-check exists for the message; the real one runs on the same connection
  // immediately before the deletes, so a booking that lands in between rolls
  // the whole thing back instead of being silently deleted.
  assert.match(ROUTE, /async function liveBookingGuard/)
  for (const fn of ['async function purge', 'async function anonymize']) {
    const body = ROUTE.slice(ROUTE.indexOf(fn))
    const guard = body.indexOf('liveBookingGuard(tx, scope)')
    assert.ok(guard > -1, `${fn} must re-check live bookings inside its transaction`)
    // …and it must be FIRST, before anything is written.
    for (const write of ['deleteMany', 'tx.user.update', 'tx.user.delete']) {
      const at = body.indexOf(write)
      if (at > -1) assert.ok(guard < at, `the guard must precede ${write} in ${fn}`)
    }
  }
  assert.match(ROUTE, /e instanceof ActiveBookingsError/, 'the rollback must answer 409, not 500')
})

test('Serializable was rejected on purpose, and the reason is written down', () => {
  // POST /api/bookings runs Serializable; this transaction can delete years of
  // rows, and holding predicate locks that long would abort unrelated bookings
  // site-wide. If someone "fixes" this later they should have to delete the note.
  assert.match(ROUTE, /NOT `isolationLevel: 'Serializable'`/)
  assert.ok(!/isolationLevel/.test(ROUTE.replace(/NOT `isolationLevel: 'Serializable'`/, '')))
})

test('an anonymized account can never be un-suspended', () => {
  // app/experts/[slug]/page gates the public profile on suspendedAt and NOTHING
  // else — browse's `available` filter does not cover the profile URL. Clearing
  // it would republish a „წაშლილი პროფილი" tombstone at its old address.
  assert.match(ROUTE, /action\s+===\s+'unsuspend'\s+&&\s+isAnonymized\(target\.email\)/)
  assert.match(ROUTE, /'ANONYMIZED'/)
  assert.ok(isAnonymized('deleted-abc@deleted.invalid'))
  assert.ok(!isAnonymized('nino@gmail.com'))
  assert.ok(!isAnonymized(null))
  // …and the panel must not offer the control the server refuses.
  const page = adminPanelSrc()
  assert.match(page, /u\.role\s+!==\s+'ADMIN'\s+&&\s+!isAnonymized\(u\.email\)/)
})

test('upcoming and live sessions block BOTH modes', () => {
  // Same set the self-delete guard in /api/me uses. A COMPLETED or CANCELED
  // session is history and must never block a deletion.
  assert.deepEqual([...LIVE_STATUSES], ['PREPARING', 'CONFIRMED', 'LIVE'])
  assert.match(ROUTE, /HAS_ACTIVE_BOOKINGS/)
  // The fast path fires BEFORE the mode branches, so anonymize can't slip past
  // it. (Assert on the CALL, not on the error string — that now lives in the
  // shared activeBookingsResponse helper, declared below the handler.)
  assert.ok(
    ROUTE.indexOf('return activeBookingsResponse(activeBookings)') < ROUTE.indexOf("mode === 'anonymize'"),
    'the active-booking fast path must run before either mode',
  )
})

test('an admin can be deleted neither by themselves nor by another admin', () => {
  assert.match(ROUTE, /CANNOT_DELETE_SELF/)
  assert.match(ROUTE, /FORBIDDEN_TARGET/)
  assert.match(ROUTE, /requireRoleApi\('ADMIN'\)/)
})

/* ── anonymize ─────────────────────────────────────────────────────────── */

test('the anonymized address can never reach a mailbox, and stays unique', () => {
  // .invalid is reserved by RFC 2606 — guaranteed non-resolving, forever.
  assert.ok(anonEmail('abc').endsWith('@deleted.invalid'))
  assert.notEqual(anonEmail('abc'), anonEmail('def'), 'User.email is unique — the id must be in it')
  assert.ok(anonEmail('abc').includes('abc'))
})

test('anonymize scrubs every identifying column', () => {
  for (const field of ['phone', 'bio', 'avatarUrl', 'emailVerified', 'passwordHash', 'suspendedAt']) {
    assert.ok(ROUTE.includes(field), `anonymize must address ${field}`)
  }
  assert.equal(ANON_NAME, 'წაშლილი მომხმარებელი')
  assert.equal(ANON_HEADLINE, 'წაშლილი პროფილი')
})

test('anonymize revokes every way back into the account', () => {
  for (const m of [
    /tx\.session\.deleteMany/,
    /tx\.otpCode\.deleteMany/,
    /tx\.passwordResetToken\.deleteMany/,
  ]) {
    assert.match(ROUTE, m)
  }
  // A live session would keep a „deleted" person browsing as themselves.
})

test('anonymize removes the expert documents that carry a name and a face', () => {
  for (const m of [
    /tx\.certificate\.deleteMany/,
    /tx\.education\.deleteMany/,
    /tx\.experience\.deleteMany/,
  ]) {
    assert.match(ROUTE, m)
  }
})

test('anonymize suspends — which is what removes an expert from every public read', () => {
  // lib/tutorsQuery, /api/tutors/[id] and app/experts/[slug]/page all gate on
  // User.suspendedAt. Setting it is the whole public-invisibility mechanism;
  // `available:false` alone would leave the profile page reachable.
  assert.match(ROUTE, /suspendedAt:\s*new Date\(\)/)
  assert.match(ROUTE, /verified:\s*false/)
  assert.match(ROUTE, /featured:\s*false/)
  assert.match(ROUTE, /slug:\s*null/)
})

/* ── audit ─────────────────────────────────────────────────────────────── */

test("purge's audit row is written INSIDE the transaction", () => {
  // audit() is fire-and-forget on purpose — right for suspend, which leaves the
  // user row as evidence. A purge leaves nothing, so the audit row cannot be
  // the one write allowed to fail, nor describe a delete that rolled back.
  const tx = ROUTE.slice(ROUTE.indexOf('async function purge'))
  assert.match(tx, /tx\.auditLog\.create/)
  assert.ok(
    tx.indexOf('tx.auditLog.create') < tx.indexOf('{ timeout: 30_000'),
    'the audit write must sit inside the $transaction callback, not after it',
  )
})

test('both modes write an audit row carrying a SNAPSHOT, not just an id', () => {
  assert.match(ROUTE, /'user\.delete'/)
  assert.match(ROUTE, /'user\.anonymize'/)
  // The target id points at a row that no longer exists after a purge, so the
  // meta has to carry enough to read the entry a year later.
  for (const k of ['email:', 'fullName:', 'role:', 'counts:']) {
    assert.ok(ROUTE.includes(k), `the audit snapshot must include ${k}`)
  }
})

test('every audit action string has a Georgian label in the admin panel', () => {
  const page = adminPanelSrc()
  // An unmapped action falls back to the raw `noun.verb` and reads like a bug.
  assert.match(page, /'user\.delete':\s*'/)
  assert.match(page, /'user\.anonymize':\s*'/)
})

/* ── UI honesty ────────────────────────────────────────────────────────── */

test('the delete dialog checks for a redirected/HTML response, not just res.ok', () => {
  const parts = readFileSync(join(process.cwd(), 'app/admin/_parts.tsx'), 'utf8')
  const at = parts.indexOf('AdminDeleteUserDialog')
  assert.ok(at > -1)
  const body = parts.slice(at)
  // An expired admin session answers a mutation with a redirect to sign-in and
  // fetch hands that page back as an HTML 200 — `res.ok` would report a
  // deletion that never happened (the reason `adminOk` exists).
  assert.match(body, /res\.redirected/)
  assert.match(body, /content-type/)
})

test('a MISSING impact must not read as „the account is empty"', () => {
  const parts = readFileSync(join(process.cwd(), 'app/admin/_parts.tsx'), 'utf8')
  const body = parts.slice(parts.indexOf('AdminDeleteUserDialog'))
  // impact === null means the counts never arrived (deploy skew, failed load).
  // Collapsing that into „ცარიელია" would talk an admin into an irreversible
  // purge of an account with years of history — the same class as the
  // 2026-08-01 rule that a failed fetch may never render as „no results".
  assert.match(body, /const known = !!impact/)
  assert.match(body, /hasHistory = !known \|\|/,
    'unknown must behave like „has history": both modes offered, nothing claimed')
  assert.match(body, /!known \?[\s\S]{0,200}ვერ ჩაიტვირთა/,
    'the unknown state needs its own line, not the empty-account one')
})

test('the impact numbers come from real counts, not the capped modal arrays', () => {
  // bookingsAsStudent/reviewsWritten etc. are take:30/15 — a preview built from
  // them would tell an admin „30 ჯავშანი" for an account with 200.
  assert.match(ROUTE, /deleteImpact:/)
  assert.match(ROUTE, /prisma\.booking\.count/)
  assert.match(ROUTE, /prisma\.message\.count/)
  assert.match(ROUTE, /prisma\.review\.count/)
  assert.match(ROUTE, /prisma\.enrollment\.count/)
})

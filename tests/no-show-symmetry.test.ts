// Static guards for the SYMMETRIC no-show flow (2026-07-27).
//
// Run: npx tsx tests/no-show-symmetry.test.ts
//
// Pure source-level invariants — no browser, no dev server, no DB — in the
// style of tests/regression-invariants.test.ts. Route handlers may only export
// GET/POST/PATCH/… (Next validates this at build time), so the guards cannot be
// imported as functions; these checks pin them where they live instead.
//
// Background: only the TUTOR could report a no-show. It marked the STUDENT as
// the absent party, ended the booking NO_SHOW and RELEASED the payout to the
// expert. A student stood up by an expert had no counterpart — only a manual
// dispute. `expert_no_show` is that counterpart, and it must stay:
//
//   1. Authorized to the booking's OWN student (or ADMIN) — never the tutor,
//      so neither party can ever name the other as the no-show.
//   2. Gated by the SAME grace window as the tutor direction, from ONE constant.
//   3. Status-guarded with the route's atomic updateMany + count === 1 claim.
//   4. The MIRROR money direction: REFUNDED (client not charged), never
//      RELEASED — and it must never bump the expert's public sessionsCount.
//   5. Notifying BOTH parties.
//   6. Rendered by the student UI as a DIFFERENT outcome from a student
//      no-show — the two are opposites and must not share one sentence.

import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

let failures = 0
function check(name: string, ok: boolean, hint: string) {
  if (ok) {
    console.log(`✓ ${name}`)
  } else {
    failures++
    console.error(`✗ ${name}\n    ${hint}`)
  }
}

const ROUTE = 'app/api/bookings/[id]/route.ts'
const PAGE = 'app/student/bookings/[id]/page.tsx'
const route = read(ROUTE)
const page = read(PAGE)

/* ───── slice the two no-show branches out of the route ───── */

const expertStart = route.indexOf("if (rawBody?.action === 'expert_no_show')")
const expertEnd = route.indexOf('const parsed = PatchBody.safeParse(rawBody)')
const tutorStart = route.indexOf("if (action === 'no_show')")
const tutorEnd = route.indexOf("// action === 'complete'")

check(
  '0: both no-show branches are present and in the expected order',
  expertStart > -1 && expertEnd > expertStart && tutorStart > expertEnd && tutorEnd > tutorStart,
  `expert_no_show must sit before the tutor-scoped lookup, no_show after it. Offsets: ${[expertStart, expertEnd, tutorStart, tutorEnd].join(', ')}`,
)

const expertBranch = expertStart > -1 ? route.slice(expertStart, expertEnd) : ''
const tutorBranch = tutorStart > -1 ? route.slice(tutorStart, tutorEnd) : ''

// Comments legitimately NAME the thing they promise not to do („sessionsCount is
// NOT touched", „REFUNDED is reserved for…"), so absence checks run on code.
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const expertCode = codeOnly(expertBranch)
const tutorCode = codeOnly(tutorBranch)

/* ───── 1. authorization — wrong role refused ───── */

check(
  '1a: expert_no_show is scoped to the booking OWNER (student) or ADMIN',
  /user\.role === 'ADMIN' \? \{ id \} : \{ id, studentId: user\.id \}/.test(expertBranch),
  'The lookup must be `{ id, studentId: user.id }` for non-admins — a tutor hitting this action has to fall out as NOT_FOUND.',
)

check(
  '1b: expert_no_show never authorizes via the tutor relation',
  !/tutor:\s*\{\s*userId:\s*user\.id/.test(expertBranch),
  'A tutor must not be able to report themselves absent (nor name the student) through this action.',
)

check(
  '1c: the tutor direction stays tutor-scoped',
  /where: \{ id, tutor: \{ userId: user\.id \} \}/.test(route),
  'The `no_show` / accept / decline / complete lookup must remain hard-scoped to the owning tutor.',
)

check(
  '1d: a missing/foreign booking is refused with the route error style',
  /error: 'NOT_FOUND' \}, \{ status: 404 \}/.test(expertBranch),
  'Unauthorized callers must get the route\'s NOT_FOUND 404, not a 200.',
)

/* ───── 2. timing — before the grace window refused, ONE constant ───── */

const graceDecls = route.match(/NO_SHOW_GRACE_MS\s*=/g) ?? []
check(
  '2a: exactly ONE NO_SHOW_GRACE_MS declaration in the route',
  graceDecls.length === 1,
  `Both directions must read the same constant — a second copy is how the two graces drift apart. Found ${graceDecls.length}.`,
)

check(
  '2b: the grace constant is module-scope (declared outside PATCH)',
  route.indexOf('const NO_SHOW_GRACE_MS') > -1 &&
    route.indexOf('const NO_SHOW_GRACE_MS') < route.indexOf('export async function PATCH'),
  'A branch-local const cannot be shared by the opposite direction.',
)

check(
  '2c: expert_no_show refuses before start + grace with TOO_EARLY',
  /Date\.now\(\) < own\.startAt\.getTime\(\) \+ NO_SHOW_GRACE_MS/.test(expertBranch) &&
    /error: 'TOO_EARLY' \}, \{ status: 400 \}/.test(expertBranch),
  'Without this a client could flag the expert at :01, before they could plausibly have joined.',
)

check(
  '2d: the tutor direction still uses the shared grace constant',
  /Date\.now\(\) < booking\.startAt\.getTime\(\) \+ NO_SHOW_GRACE_MS/.test(tutorBranch) &&
    /error: 'TOO_EARLY'/.test(tutorBranch),
  'The pre-existing student-no-show grace must be unchanged in behavior.',
)

/* ───── 3. status guard + atomic claim — wrong status / double report ───── */

check(
  '3a: expert_no_show refuses anything but CONFIRMED/LIVE',
  /own\.status !== 'CONFIRMED' && own\.status !== 'LIVE'/.test(expertBranch) &&
    /error: 'BAD_STATE' \}, \{ status: 400 \}/.test(expertBranch),
  'PREPARING, COMPLETED, CANCELED and an already-NO_SHOW booking must all be refused.',
)

check(
  '3b: expert_no_show claims the transition with a status-guarded updateMany',
  /updateMany\(\{\s*where: \{ id, status: \{ in: \['CONFIRMED', 'LIVE'\] \} \}/.test(expertBranch),
  'A blind update would resurrect a booking a concurrent cancel/complete already moved on.',
)

check(
  '3c: expert_no_show refuses a lost race / double click with count !== 1 → 409',
  /claim\.count !== 1/.test(expertBranch) && /error: 'BAD_STATE' \}, \{ status: 409 \}/.test(expertBranch),
  'count === 1 is the proof THIS request performed the transition — without it a double click double-processes.',
)

check(
  '3d: the tutor direction keeps its own atomic claim',
  /updateMany\(\{\s*where: \{ id, status: \{ in: \['CONFIRMED', 'LIVE'\] \} \}/.test(tutorBranch) &&
    /claim\.count !== 1/.test(tutorBranch),
  'Never weaken the existing guard.',
)

/* ───── 4. money direction is the mirror image ───── */

check(
  '4a: expert_no_show REFUNDS the client',
  /status: 'NO_SHOW', payoutStatus: 'REFUNDED'/.test(expertBranch),
  'The expert never appeared — the client must not pay, and the expert gets nothing.',
)

check(
  '4b: expert_no_show never releases the payout',
  !/RELEASED/.test(expertCode),
  'RELEASED here would pay an expert who did not show up.',
)

check(
  '4c: the tutor direction still RELEASES (unchanged)',
  /status: 'NO_SHOW',\s*payoutStatus: 'RELEASED'/.test(tutorCode) && !/REFUNDED/.test(tutorCode),
  'The expert held the slot and showed up — that direction was corrected earlier and must stay.',
)

check(
  '4d: neither no-show direction touches sessionsCount',
  !/sessionsCount/.test(expertCode) && !/sessionsCount/.test(tutorCode),
  'A session that did not happen must never inflate the expert\'s public „N სესია ჩატარებული" stat.',
)

check(
  '4e: sessionsCount is bumped in exactly one place (the complete path)',
  (codeOnly(route).match(/sessionsCount/g) ?? []).length === 1,
  'Only `complete` may increment it.',
)

/* ───── 5. both parties are told ───── */

check(
  '5a: expert_no_show notifies the client and the expert',
  /notify\(own\.studentId/.test(expertBranch) && /notify\(own\.tutor\.userId/.test(expertBranch),
  'The reporter needs confirmation of what happens next; the other party must learn a no-show was reported.',
)

check(
  '5b: both notifications use a prefs-checked booking type',
  (expertBranch.match(/type: 'BOOKING_CANCELED'/g) ?? []).length === 2,
  'notify() only honors notification prefs for the lifecycle types — GENERIC bypasses them.',
)

check(
  '5c: the expert is pointed at a real contest surface',
  /\/tutor\/bookings\/\$\{own\.id\}#chat/.test(expertBranch) && /notifyMany/.test(expertBranch),
  'POST /api/disputes is student-only, so the expert contests via the thread + an admin — the admin ping must fire.',
)

/* ───── 6. student UI renders the two directions as opposites ───── */

check(
  '6a: the page derives the no-show direction from payoutStatus',
  /const isExpertNoShow = \(b: Booking\) => b\.status === 'NO_SHOW' && b\.payoutStatus === 'REFUNDED'/.test(page),
  'There is no reporter column on Booking; payoutStatus is the only persisted discriminator.',
)

check(
  '6b: the terminal banner splits the two directions',
  /!isExpertNoShow\(booking\)/.test(page),
  'One shared sentence would tell a refunded client that their money went to the expert.',
)

check(
  '6c: the receipt line splits the two directions',
  /isExpertNoShow\(booking\) \? 'თანხა დაგიბრუნდა' : 'თანხა ექსპერტს გადაეცა'/.test(page),
  'Opposite outcomes, opposite copy.',
)

check(
  '6d: the timeline splits the two directions',
  /const expertMissed = isExpertNoShow\(booking\)/.test(page),
  'The history entry must not claim the money went to the expert on a refunded booking.',
)

/* ───── 7. the action is only offered when the server would accept it ───── */

check(
  '7a: the UI gate mirrors the server status + grace guards',
  /const canReportNoShow =\s*\n\s*\(status === 'CONFIRMED' \|\| status === 'LIVE'\) &&\s*\n\s*Date\.now\(\) > new Date\(booking\.startAt\)\.getTime\(\) \+ NO_SHOW_GRACE_MS/.test(page),
  'Offering the action on a COMPLETED/CANCELED/already-NO_SHOW booking, or before the grace, is a button that can only fail.',
)

check(
  '7b: the UI grace is derived from one local constant, not a literal',
  /const NO_SHOW_GRACE_MIN = 15\s*\nconst NO_SHOW_GRACE_MS = NO_SHOW_GRACE_MIN \* 60_000/.test(page) &&
    !/\+ 15 \* 60_000/.test(page),
  'The copy („დაწყებიდან N წუთი") and the gate must read the same number.',
)

check(
  '7c: the action goes through the shared ConfirmModal, not a hand-rolled dialog',
  /<ConfirmModal\s+open=\{noShowConfirmOpen\}/.test(page) && /onConfirm=\{confirmExpertNoShow\}/.test(page),
  'ConfirmModal carries the alertdialog role, focus trap and scroll lock.',
)

check(
  '7d: the client calls the mirrored action on the booking route',
  /JSON\.stringify\(\{ action: 'expert_no_show' \}\)/.test(page),
  'It must reuse the booking lifecycle endpoint, not a parallel surface.',
)

check(
  '7e: the confirm body states the money outcome for both payment states',
  /დაცული თანხა სრულად დაგიბრუნდება/.test(page) && /ექსპერტს თანხა არ გადაეცემა/.test(page),
  'The dialog must say plainly that the client is not charged — under PAYMENTS_LIVE and before it.',
)

check(
  '7f: the trigger keeps a ≥40px tap target',
  /onClick=\{onReportNoShow\}\s*\n\s*className="[^"]*\bh-11\b/.test(page),
  'Canon: h-11 controls; quiet styling comes from color, not from shrinking the hit area.',
)

/* ───── summary ───── */

console.log(failures === 0 ? '\nall no-show symmetry guards hold' : `\n${failures} failed`)
if (failures > 0) process.exit(1)

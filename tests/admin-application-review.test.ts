// The APPLICATION REVIEW QUEUE — the one screen that decides whether the supply
// side exists at all.
//
// Run: npx tsx tests/admin-application-review.test.ts   (also in `npm run check`)
//
// ⚠️ THIS FILE USED TO TEST A DIFFERENT SCREEN, AND MOST OF IT IS GONE
// (2026-08-24). It was written on 2026-08-03 around `app/admin/_application.ts`,
// a set of pure helpers that shaped a consultation application's
// `professionData` blob for `app/admin/_moderation.tsx` — the fix for
// „[object Object],[object Object]" appearing where a moderator should have seen
// an applicant's services and prices. Both the helpers and the panel went with
// the consultation product; the SHAPE rules that replaced them live in
// lib/providerApplication and are pinned by tests/providerApplication.test.ts.
//
// What is left here is the half that is about the SCREEN rather than the shape,
// and every rule below survived the move unchanged because none of them was
// ever about consultations:
//
//   · a queue payload never ships a base64 photo column;
//   · a decision route must not lie about what it did;
//   · a refusal the moderator cannot read is a refusal they will retry;
//   · two admins clicking at once must not overwrite each other silently.

import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`✓ ${name}`) }
  else { failed++; console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/* ═════ 1. the queue payload ════════════════════════════════════════════════ */

const listRoute = read('app/api/admin/provider-applications/route.ts')

// `photoUrl`, `workPhotos` and `about` are base64 and long-text columns on the application
// row. A 40-row queue that selects them is megabytes of payload to render forty
// names — the same arithmetic as every avatar fix before it.
check(
  'the list payload omits the base64 columns',
  /omit:\s*\{[^}]*photoUrl:\s*true[^}]*workPhotos:\s*true/.test(listRoute),
  'the queue is selecting the photo columns again',
)
check(
  'the photos load per OPENED row, not for the list',
  read('app/admin/_providers.tsx').includes('detail.photoUrl'),
  'the panel must read the photo off the detail fetch',
)
check('the list payload carries per-status counts', listRoute.includes('groupBy'))

/* ═════ 2. a decision route must not lie about what it did ══════════════════ */

// `approve` promotes: it publishes a profile and opens the request queue to a
// person. `reject`/`revise` move only the APPLICATION's status — so on an
// already-APPROVED row they would tell the applicant „განაცხადი უარყოფილია"
// while the person stayed listed and routable, and tell the moderator nothing.
const decideRoute = read('app/api/provider-applications/[id]/route.ts')
check(
  'a decision claims the row on „not already approved" rather than reading it first',
  /updateMany\(\{\s*where:\s*\{ id, status: \{ not: 'APPROVED' \} \}/.test(decideRoute),
  'a status read before the write is not a guard — see CLAIM THE ROW in CLAUDE.md',
)
check(
  'the refusal is a 409 the caller can act on, not a silent no-op',
  /ALREADY_APPROVED/.test(decideRoute) && /status: 409/.test(decideRoute),
)
check(
  'an incomplete application is refused with the blockers NAMED',
  /approvalBlockers\(/.test(decideRoute) && /blockers,\s*message: blockers\.join/.test(decideRoute),
  'a bare 400 sends the moderator back to guess which field was missing',
)
check(
  'the panel shows the server’s reason, not a generic line',
  read('app/admin/_providers.tsx').includes('d?.message ||'),
  'A refusal the moderator cannot read is a refusal they will retry.',
)

/* ═════ 3. a second click cannot clobber ════════════════════════════════════ */

const patch = read('app/api/admin/requests/[id]/route.ts')
check(
  'the admin request PATCH claims the row on the status it was read at',
  /updateMany\(\{\s*where: \{ id, status: before\.status \}/.test(patch) && /claim\.count !== 1/.test(patch) && /status: 409/.test(patch),
  'A plain update() lets two admins overwrite each other silently — the second one’s status wins and nobody is told.',
)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

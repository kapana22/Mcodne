// Guards the blog-cover storage contract.
//
// Run: npx tsx tests/blogCover.test.ts
//
// WHY THIS FILE EXISTS: the admin blog editor offered a „ქავერ-სურათი (URL)"
// text field and nothing else, so publishing an image meant hosting it
// elsewhere first — which is why 0 of 9 published posts had one. Adding an
// uploader was only half the fix: the PATCH validator carried
// `z.string().trim().max(2000)`, a ceiling sized for a URL. An uploaded cover
// arrives as a base64 `data:` URI of ~80–150 THOUSAND characters, so every
// upload would have been rejected — silently, exactly like the certificate
// bug this file is modelled on (see certificateStorage.test.ts, where a
// max(500) ceiling left every diploma unstored for weeks).
//
// The pin: the validator's ceiling must always exceed what the uploader is
// allowed to emit, with the `data:` prefix counted.
import { z } from 'zod'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** Must mirror the `coverUrl` ceiling in app/api/admin/posts/[id]/route.ts. */
const COVERURL_MAX = 1_200_000
/** Must mirror the `cover` branch in app/api/uploads/route.ts. */
const COVER_W = 1200
const COVER_H = 675

/** Length of `Buffer.toString('base64')` for n bytes — ceil(n/3)*4. */
const base64Len = (bytes: number) => Math.ceil(bytes / 3) * 4
const PREFIX = 'data:image/webp;base64,'.length

console.log('\nblog cover storage')

{
  // The uploader always re-encodes to webp at a FIXED 1200×675, so the output
  // size is bounded by the pixel count rather than by the input file. Even a
  // pathological, incompressible 1200×675 webp (~1 byte per pixel — far above
  // what q76 produces for a photograph, which lands near 0.1) stays inside.
  const worstBytes = COVER_W * COVER_H
  const worstChars = base64Len(worstBytes) + PREFIX
  console.log(`  (a worst-case ${COVER_W}×${COVER_H} cover becomes ${worstChars.toLocaleString()} characters)`)
  check(
    'coverUrl ceiling exceeds the largest cover the uploader can emit',
    COVERURL_MAX > worstChars,
    `max=${COVERURL_MAX.toLocaleString()} vs worst=${worstChars.toLocaleString()}`,
  )
}

{
  // A typical q76 cover — this is the case that has to pass, not just fit.
  const typicalChars = base64Len(110 * 1024) + PREFIX
  const schema = z.string().trim().max(COVERURL_MAX)
  const dataUri = 'data:image/webp;base64,' + 'A'.repeat(typicalChars - PREFIX)
  check('a typical 110KB cover passes the validator', schema.safeParse(dataUri).success)
}

{
  // And the ceiling still has to be a ceiling: a multi-megabyte blob — the
  // thing that would bloat the row and be re-sent for every card on /blog —
  // must be rejected.
  const schema = z.string().trim().max(COVERURL_MAX)
  check('a 4MB blob is still rejected', !schema.safeParse('x'.repeat(4_000_000)).success)
}

{
  // The regression itself, stated: the old ceiling could not hold a cover.
  const OLD_MAX = 2000
  check('the old max(2000) would have rejected every upload', base64Len(60 * 1024) + PREFIX > OLD_MAX)
}

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)

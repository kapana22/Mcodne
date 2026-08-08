// Guards the certificate-upload size contract.
//
// Run: npx tsx tests/certificateStorage.test.ts
//
// WHY THIS FILE EXISTS: the certificate API validated the scan with
// `z.string().url().max(500)`. A diploma base64-encodes to hundreds of
// kilobytes, so EVERY upload failed validation — silently. Experts uploaded
// documents that were never stored (all five production rows had fileUrl NULL)
// and their public profile showed an unopenable text chip. Nothing failed
// loudly; the feature simply did not work.
//
// The first fix set the ceiling to 34,000,000 — which still rejected a
// max-size upload, the same bug one size smaller. That is exactly what these
// pins exist to catch: the validator's ceiling must ALWAYS exceed what the
// uploader is allowed to produce.
import { z } from 'zod'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** Must mirror MAX_CERT_BYTES in app/api/uploads/route.ts. */
const MAX_CERT_BYTES = 25 * 1024 * 1024
/** Must mirror the `fileUrl` ceiling in app/api/me/tutor/certificates/route.ts. */
const FILEURL_MAX = 35_000_000
/** Must mirror the `certificates[].url` ceiling in app/api/applications/route.ts. */
const APPLICATION_URL_MAX = 35_000_000

/** Length of `Buffer.toString('base64')` for n bytes — ceil(n/3)*4. */
const base64Len = (bytes: number) => Math.ceil(bytes / 3) * 4
/** The longest `data:` prefix any accepted certificate type produces. */
const LONGEST_PREFIX = 'data:application/pdf;base64,'.length

{
  const worstCase = base64Len(MAX_CERT_BYTES) + LONGEST_PREFIX
  console.log(`  (a ${MAX_CERT_BYTES / 1024 / 1024} MiB upload becomes ${worstCase.toLocaleString()} characters)`)

  check('profile-editor ceiling clears a max-size upload',
    FILEURL_MAX > worstCase, `${FILEURL_MAX} vs ${worstCase}`)
  check('application ceiling clears a max-size upload',
    APPLICATION_URL_MAX > worstCase, `${APPLICATION_URL_MAX} vs ${worstCase}`)

  // The exact regression: the original 500-char cap, and the too-tight retry.
  check('the ORIGINAL 500-char cap would have rejected it (the bug)',
    500 < worstCase)
  check('the first 34,000,000 retry would ALSO have rejected it',
    34_000_000 < worstCase, `34,000,000 vs ${worstCase}`)
}

/* ═══════════ the validator itself ════════════════════════════════════════ */

const FileUrl = z.string().max(FILEURL_MAX).optional().nullable()

{
  const realistic = 'data:image/jpeg;base64,' + 'A'.repeat(base64Len(600 * 1024))
  check('accepts a realistic ~600 KB photo of a diploma', FileUrl.safeParse(realistic).success)

  const maxSize = 'data:application/pdf;base64,' + 'A'.repeat(base64Len(MAX_CERT_BYTES))
  check('accepts a max-size PDF', FileUrl.safeParse(maxSize).success)

  check('accepts an https link (legacy / externally hosted)',
    FileUrl.safeParse('https://example.com/diploma.pdf').success)
  check('accepts absence — the scan is optional', FileUrl.safeParse(undefined).success)

  // `.url()` was the other half of the original bug: it is the wrong predicate
  // for a stored blob, and it is what a well-meaning refactor would re-add.
  check('a URL-shaped predicate would reject a data: blob (do not re-add .url())',
    !z.string().url().max(500).safeParse(realistic).success)
}

/* ═══════════ issuer must be optional ═════════════════════════════════════ */

{
  const Issuer = z.string().max(200).optional().nullable()
  check('issuer may be omitted (not every document has one)', Issuer.safeParse(undefined).success)
  check('issuer may be empty — the UI omits it rather than printing a placeholder',
    Issuer.safeParse('').success)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

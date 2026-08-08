// Unit tests for the OPTIONAL credential attachment on /apply — it lives in
// step 1's collapsed „ბმულები და დოკუმენტი" block since the 2026-08-07 3→2 cut.
//
// Run: npx tsx tests/apply-certificates.test.ts
//
// Pure unit test (no browser, no dev server, no DB, no uploads), in the style of
// tests/availability.test.ts. Two halves:
//
//   1. The pure helpers (`certSlotsLeft`, `takeCertFiles`, `certificatesPayload`)
//      that bound the file count and build the submit payload.
//   2. Source-level invariants on app/apply/ApplyClient.tsx — the guards that
//      keep the attachment OPTIONAL and the review promise HONEST.
//
// Why the helpers are mirrored instead of imported: ApplyClient.tsx is a JSX
// client module, and importing one into a plain tsx run is brittle (the repo hit
// this before — see the same note in tests/signin-view-state.test.ts). The
// mirror below is byte-checked against the real source in section 2, so it
// cannot silently drift: if MAX_CERTS or the payload builder changes in the
// component and not here, this file fails.
//
// Background: onboarding was cut 5 screens → 3 on 2026-07-28 because
// profession-specific fields („Bar ლიცენზიის ნომერი", AUM, ROAS, GitHub) read as
// requirements and turned applicants away. That cut stays. What came back is the
// optional attachment only — the one thing a moderator can actually verify.

import { readFileSync } from 'fs'
import { join } from 'path'

/* ───── tiny assert harness (✓/✗, exit 1 on failure — matches tests/ vibe) ───── */

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`✓ ${name}`) }
  else { failed++; console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/* ═════ 1. Mirror of the helpers in app/apply/ApplyClient.tsx — keep in sync ═════ */

const MAX_CERTS = 3

function certSlotsLeft(attached: number, max: number = MAX_CERTS): number {
  return Math.max(0, max - Math.max(0, attached))
}

function takeCertFiles<T>(attached: number, picked: readonly T[], max: number = MAX_CERTS): { accepted: T[]; dropped: number } {
  const accepted = picked.slice(0, certSlotsLeft(attached, max))
  return { accepted, dropped: picked.length - accepted.length }
}

function certificatesPayload(
  certs: { title: string; issuer?: string; url: string }[],
  max: number = MAX_CERTS,
): { title: string; issuer?: string; url: string }[] | undefined {
  const clean = (Array.isArray(certs) ? certs : [])
    .filter(c => typeof c?.url === 'string' && c.url.trim().length > 0)
    .slice(0, max)
    .map(c => {
      const issuer = (c.issuer || '').trim().slice(0, 200)
      return {
        title: (c.title || '').trim().slice(0, 200) || 'დოკუმენტი',
        ...(issuer ? { issuer } : {}),
        url: c.url,
      }
    })
  return clean.length ? clean : undefined
}
/* ──────────────────────────────────────────────────────────────────────────── */

const cert = (n: number) => ({ title: `დიპლომი-${n}.pdf`, url: `data:application/pdf;base64,AAAA${n}` })

/* ───── file-count bound ───── */

check('nothing attached → all slots free', certSlotsLeft(0) === MAX_CERTS)
check('one attached → one slot consumed', certSlotsLeft(1) === MAX_CERTS - 1)
check('at the cap → no slots left', certSlotsLeft(MAX_CERTS) === 0)
check('over the cap (stale state) → 0, never negative', certSlotsLeft(MAX_CERTS + 5) === 0)
check('a negative count is clamped, not amplified', certSlotsLeft(-3) === MAX_CERTS)

{
  const { accepted, dropped } = takeCertFiles(0, ['a', 'b'])
  check('a pick under the cap is taken whole', accepted.join() === 'a,b' && dropped === 0)
}
{
  const { accepted, dropped } = takeCertFiles(0, ['a', 'b', 'c', 'd', 'e'])
  check('a pick over the cap is trimmed to the cap',
    accepted.length === MAX_CERTS && accepted.join() === 'a,b,c' && dropped === 2,
    `${accepted.join()} / dropped ${dropped}`)
}
{
  const { accepted, dropped } = takeCertFiles(2, ['a', 'b', 'c'])
  check('the cap counts what is ALREADY attached', accepted.join() === 'a' && dropped === 2)
}
{
  const { accepted, dropped } = takeCertFiles(MAX_CERTS, ['a'])
  check('picking at the cap adds nothing and reports the drop', accepted.length === 0 && dropped === 1)
}
check('an empty pick is a no-op', takeCertFiles(0, []).accepted.length === 0 && takeCertFiles(0, []).dropped === 0)

/* ───── submit payload: WITHOUT attachments ───── */

check('no attachments → the field is omitted entirely (undefined, not [])',
  certificatesPayload([]) === undefined)
check('only unusable entries → still omitted',
  certificatesPayload([{ title: 'x', url: '' }, { title: 'y', url: '   ' }]) === undefined)
check('a non-array (corrupt restored state) → omitted, not thrown',
  certificatesPayload(null as unknown as { title: string; url: string }[]) === undefined)

/* ───── submit payload: WITH attachments ───── */

{
  const out = certificatesPayload([cert(1)])
  check('one attachment → a one-entry array of { title, url }',
    !!out && out.length === 1 && out[0].title === 'დიპლომი-1.pdf' && out[0].url === cert(1).url)
  check('the payload carries ONLY title + url (no File, no size, no MIME)',
    !!out && Object.keys(out[0]).sort().join() === 'title,url', out && Object.keys(out[0]).join())
}
{
  const out = certificatesPayload([cert(1), cert(2), cert(3), cert(4), cert(5)])
  check('a payload built from over-cap state is still capped',
    !!out && out.length === MAX_CERTS, String(out?.length))
}
{
  const out = certificatesPayload([{ title: '  სერტიფიკატი.pdf  ', url: 'data:application/pdf;base64,AA' }])
  check('titles are trimmed', out?.[0].title === 'სერტიფიკატი.pdf', out?.[0].title)
}
{
  const out = certificatesPayload([{ title: '', url: 'data:application/pdf;base64,AA' }])
  check('a nameless file still gets a title (the API requires a string)',
    out?.[0].title === 'დოკუმენტი', out?.[0].title)
}
{
  const out = certificatesPayload([{ title: 'ა'.repeat(400), url: 'data:application/pdf;base64,AA' }])
  check('an absurd title is clipped to the API bound (200)', out?.[0].title.length === 200, String(out?.[0].title.length))
}
{
  const mixed = certificatesPayload([{ title: 'ok', url: 'data:application/pdf;base64,AA' }, { title: 'bad', url: '' }])
  check('a failed/empty entry is dropped without dropping the good one',
    !!mixed && mixed.length === 1 && mixed[0].title === 'ok')
}
{
  // A data: URL keeps its base64 payload byte-for-byte — the upload endpoint
  // returns one and the API stores exactly what we send.
  const url = 'data:application/pdf;base64,JVBERi0xLjQKJcfs'
  check('the url is passed through untouched', certificatesPayload([{ title: 'a.pdf', url }])?.[0].url === url)
}

/* ═════ 2. Source-level invariants — app/apply/ApplyClient.tsx ═════ */

const root = join(__dirname, '..')
const src = readFileSync(join(root, 'app/apply/ApplyClient.tsx'), 'utf8')

// ── the mirror above must match the real source ──
check('S1: MAX_CERTS in the component matches this file',
  new RegExp(`export const MAX_CERTS = ${MAX_CERTS}\\b`).test(src),
  'update the mirror at the top of this test (and re-read the bounds below)')

check('S2: the submit body builds `certificates` through certificatesPayload()',
  /certificates:\s*certificatesPayload\(media\.certificates\)/.test(src),
  'the payload must go through the helper so the cap + shape are enforced in one place')

check('S3: the uploader still rides the existing endpoint with kind=certificate',
  /uploadToApi\('certificate',\s*f\)/.test(src),
  'no new upload path — /api/uploads already sniffs magic bytes for PDF/JPG/PNG')

// ── OPTIONAL means optional: no validator may read the attachment ──
{
  // Slice ONLY the two validator functions. The old bound ran to
  // `submitApplication`, which swept in whatever else happened to sit between
  // them — `onStepDone` (funnel instrumentation) counts certificates, which is
  // fine and has nothing to do with validation, but it turned this check red.
  // A test whose verdict depends on unrelated neighbours is a test that will
  // cry wolf again, so the bound is now the next top-level `const` after each
  // validator rather than a fixed landmark.
  const sliceFn = (name: string) => {
    const from = src.indexOf(`  const ${name} = (`)
    if (from < 0) return ''
    const next = src.indexOf('\n  const ', from + 1)
    return next < 0 ? src.slice(from) : src.slice(from, next)
  }
  const validators = sliceFn('validate') + sliceFn('validateStep')
  // The PHOTO became required on 2026-07-29 (product decision: every surface
  // that shows an expert shows their face, so a faceless profile cannot ship).
  // It is read from `media`, so this assertion can no longer ban the whole
  // object — it bans the CERTIFICATE, which is the thing that must stay
  // optional. Photo-blocks-submit is asserted positively in S4b.
  check('S4: no validator reads the certificate attachment',
    validators.length > 200 && !/certificat/i.test(validators),
    'an optional attachment must never be able to block „შემდეგი" or „გაგზავნა"')
  check('S4b: the profile photo IS required',
    /!media\?\.photoUrl\)\s*return/.test(validators),
    'a profile with no face cannot go live — the requirement lives in the validator, not only in the UI')
}

check('S5: the attachment control is not marked required',
  !/<Field[^>]*required[^>]*>\s*<CertificateUploader/.test(src) && !/required[^\n]*CertificateUploader/.test(src),
  'the attachment must never be rendered through a required Field')

// ── the 2026-07-28 cut must stay cut ──
// Comment-stripped: the file's own header explains WHY those fields were removed
// and therefore names them; only live code counts.
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
check('S6: the per-profession block did not come back',
  !/ლიცენზიის ნომერი/.test(code) && !/\bAUM\b/.test(code) && !/\bROAS\b/.test(code) && !/githubUrl/.test(code),
  'profession-specific NUMBER fields read as requirements — that is what turned applicants away')

check('S7: no KYC tile is rendered (ID document / selfie stay out of onboarding)',
  !/<DocUploadTile/.test(src),
  'KYC was deliberately dropped from onboarding')

// TWO screens since 2026-08-07 (owner's call): the „გაგზავნა" step was a
// review header, an optional uploader, two optional links and a button —
// a screen between the applicant and finishing. The attachment and the links
// moved onto step 1 as COLLAPSED optional blocks.
check('S8: the flow is two screens',
  /type StepId = 1 \| 2\b/.test(src) && (src.match(/\{ id: [12], l:/g) ?? []).length === 2,
  'the third step carried no work — it must not come back')

check('S8b: the attachment survived the merge, collapsed',
  /<Collapsible[\s\S]{0,200}ბმულები და დოკუმენტი/.test(src) && /<CertificateUploader/.test(src),
  'optional + heavy must not read as a requirement — but it must still be reachable')

check('S8c: the applicant’s issuer answer actually reaches the server',
  /const issuer = \(c\.issuer \|\| ''\)/.test(src),
  'approval reads `issuer`; the payload builder used to drop it, so it was always empty')

// ── the review promise must state only what is actually done ──
check('S9: the old „we check every profile" promise is gone',
  !src.includes('ყოველ პროფილს ხელით ვამოწმებთ') && !src.includes('რას შევამოწმებთ') && !src.includes('ყოველ ნაბიჯს ხელით ვამოწმებთ'),
  'nothing is verified when nothing verifiable was submitted')

// „რას ვნახავთ" went with the „რა მოხდება შემდეგ" block (2026-07-29) — the
// user cut it as filler. What this check actually protects is the CLAIM, not
// the heading that used to sit above it: we may promise only that a human
// reads the application. Assert the claim, in whatever wording carries it.
// 2026-08-05: the standing footer line („ყველა განაცხადს ადამიანი კითხულობს —
// პასუხი 24–48 საათში") was removed as repetition — it printed under the
// advance button on every step. The CLAIM is what this check protects, and it
// survives in the future tense on the submit step and on the success screen, so
// the pattern accepts either wording rather than pinning one sentence.
check('S10: the honest claim is present (a human READS the application)',
  /განაცხადს ადამიანი (კითხულობს|წაიკითხავს)/.test(src),
  'the claim must be „a human reads it", which is true')

check('S11: the limits of the review are stated out loud',
  src.includes('ვერ გადავამოწმებთ'),
  'with no documents we cannot verify a diploma, a licence or years of experience — say so')

check('S12: the „ხელით შემოწმებული ქსელი" badge no longer claims verification',
  !src.includes('ხელით შემოწმებული ქსელი'),
  '„შემოწმებული" (checked) overstates a review that only reads text')

// ── the client cap must fit inside what the API accepts ──
{
  const api = readFileSync(join(root, 'app/api/applications/route.ts'), 'utf8')
  const m = api.match(/certificates:\s*z\.array\([\s\S]*?\)\s*\.max\((\d+)\)/)
  const apiMax = m ? Number(m[1]) : NaN
  check('S13: MAX_CERTS fits inside the API array bound',
    Number.isFinite(apiMax) && MAX_CERTS <= apiMax, `client ${MAX_CERTS} vs api ${apiMax}`)
}

/* ── the free 15-minute intro is a SWITCH, not a row (reported from a phone,
      fixed 2026-08-06). It used to render inside the services loop with
      `onChange={() => removeService(i)}`: unticking DELETED it, and the
      checkbox went with it. „სერვისის დამატება" adds a PAID service, so there
      was no way back — an expert who tapped it to see what it did lost the
      feature permanently, mid-application. ── */
check('S14: the free intro is defined once, so it can be restored',
  /export const FREE_INTRO/.test(src) && src.includes('...FREE_INTRO'),
  'a toggle has to be able to rebuild what it switched off')

check('S15: unticking it does not destroy it',
  /const toggleFree = \(\) =>/.test(src) && /\[\.\.\.form\.services, \{ \.\.\.FREE_INTRO \}\]/.test(src),
  'off must be a state, not a deletion — which is what drawing a checkbox promises')

check('S16: the toggle renders whether or not it is on',
  !/s\.free \? \([\s\S]{0,200}type="checkbox"/.test(src) && /checked=\{hasFree\}/.test(src),
  'a checkbox inside the loop over the thing it toggles disappears with it')

/* ───── summary ───── */

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

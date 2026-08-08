// Unit tests for the expert-application REVIEW panel's pure helpers, plus the
// source-level invariants that keep the moderation panel readable.
//
// Run: npx tsx tests/admin-application-review.test.ts
//
// WHY THIS FILE EXISTS. app/admin/_application.ts was written on 2026-07-29 to
// fix „[object Object]" in the moderation panel — its own header even cites this
// test file — but the helpers were never wired into the JSX and this test was
// never written. The panel kept rendering `Object.entries(professionData).map(
// ([k, v]) => String(v))`, so for the REAL prod shape (services is an array of
// objects) the moderator saw „[object Object],[object Object]" where the
// applicant's services and prices should be. Fixed and wired 2026-08-03; these
// checks are what stop it coming back.

import { readFileSync } from 'fs'
import { join } from 'path'
import {
  normalizeCertificates,
  summarizeProfessionData,
  hasVerificationDocument,
  missingApplicationParts,
  fileLabel,
} from '../app/admin/_application'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`✓ ${name}`) }
  else { failed++; console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/* ═════ 1. professionData — the real prod shape ═════════════════════════════ */

// Verified against production on 2026-08-03: 19 of 20 rows carry exactly this,
// one legacy row carries { reFocus, ageGroups, platforms }, one is null.
const REAL = {
  headline: 'ჩემი საქმის სიყვარული',
  languages: ['ქართული', 'ინგლისური'],
  services: [
    { name: 'კონსულტაცია', desc: 'დასვი შენი კითხვა', dur: 60, price: 80, free: false },
    { name: 'გაცნობითი შეხვედრა', desc: '', dur: 15, price: 0, free: true },
  ],
  requestedCategory: 'ბუღალტერია',
}

const sum = summarizeProfessionData(REAL)
check('headline is extracted', sum.headline === 'ჩემი საქმის სიყვარული')
check('languages survive as an array', sum.languages.join(',') === 'ქართული,ინგლისური')
check('services are shaped, not stringified', sum.services.length === 2 && sum.services[0].name === 'კონსულტაცია')
check('service duration comes from `dur`', sum.services[0].minutes === 60)
check('paid price is kept', sum.services[0].price === 80)
check('a zero price counts as free', sum.services[1].free === true)
check('unknown keys become labelled extras', sum.extras.some(e => e.key === 'requestedCategory' && e.value === 'ბუღალტერია'))
check('a filled blob is not empty', sum.isEmpty === false)

// THE REGRESSION ITSELF: nothing the panel renders may stringify to
// „[object Object]". This is the exact string the old JSX produced.
const rendered = [
  sum.headline ?? '',
  ...sum.languages,
  ...sum.services.flatMap(s => [s.name, s.desc, String(s.minutes), String(s.price)]),
  ...sum.extras.map(e => e.value),
].join(' ')
check('no [object Object] anywhere in the rendered summary', !rendered.includes('[object'), rendered.slice(0, 120))

// Legacy + empty shapes must not crash or invent content.
const legacy = summarizeProfessionData({ reFocus: 'ბიზნესი', ageGroups: ['18+', '25+'], platforms: { zoom: true } })
check('legacy keys flatten to readable text', legacy.extras.some(e => e.value.includes('18+') && e.value.includes('25+')))
check('nested objects flatten with their key', legacy.extras.some(e => e.value.includes('zoom')))
check('null blob is empty, not a crash', summarizeProfessionData(null).isEmpty === true)
check('array blob is empty, not a crash', summarizeProfessionData([1, 2]).isEmpty === true)

/* ═════ 2. certificates + documents ═════════════════════════════════════════ */

check('certificates normalize from the Json column', normalizeCertificates([{ title: 'დიპლომი', url: 'data:image/webp;base64,AAAA' }]).length === 1)
check('a titleless certificate still gets a name', normalizeCertificates([{ url: 'x' }])[0].title === 'უსახელო ფაილი')
check('garbage certificates are dropped, not rendered', normalizeCertificates([{}, null, 7]).length === 0)
check('non-array certificates are dropped', normalizeCertificates('nope').length === 0)
check('a certificate counts as a verification document', hasVerificationDocument({ certificates: [{ title: 'დიპლომი', url: 'data:image/webp;base64,AA' }] }) === true)
check('nothing attached = no verification document', hasVerificationDocument({ idDocUrl: null, selfieUrl: '', certificates: [] }) === false)
check('a base64 blob is labelled by type and size, never printed raw', /^WEBP · \d+ KB$/.test(fileLabel(`data:image/webp;base64,${'A'.repeat(4000)}`)))

/* ═════ 3. „what is missing" ════════════════════════════════════════════════ */

const missingAll = missingApplicationParts({ professionData: null, docs: null })
for (const key of ['photo', 'document', 'video', 'phone', 'city', 'links', 'motivation', 'headline', 'services', 'languages']) {
  check(`an empty application names its missing „${key}"`, missingAll.some(m => m.key === key))
}
const complete = missingApplicationParts({
  avatarUrl: 'data:image/webp;base64,AA',
  phone: '+995555', city: 'თბილისი', motivation: 'ტექსტი', linkedinUrl: 'https://x.com',
  introVideoId: 'abc', professionData: REAL, docs: { certificates: [{ title: 'd', url: 'u' }] },
})
check('a complete application reports nothing missing', complete.length === 0, JSON.stringify(complete))

/* ═════ 4. source invariants on the panel ═══════════════════════════════════ */

// The review queue moved out of page.tsx into its own tab file; page.tsx is now
// just the composition root and contains none of what is asserted below.
const panel = readFileSync(join(process.cwd(), 'app/admin/_moderation.tsx'), 'utf8')

check(
  'the panel no longer stringifies professionData with String(v)',
  !/professionData\)\.map\(\(\[k, v\]\) => \(/.test(panel) && !panel.includes('{String(v)}'),
)
check('the panel renders the shaped summary instead', panel.includes('prof.services.map') && panel.includes('prof.languages.map'))
check('„what is missing" is rendered, not just computed', panel.includes('missing.map('))
check('documents go through DocTile (safe href + real file label)', panel.includes('<DocTile'))
check('a failed detail fetch is shown with a retry', panel.includes('detailErr &&') && panel.includes('loadDetail'))
check('the queue shows the applicant photo', panel.includes('a.photo'))
check('the queue can be filtered by status', panel.includes('APP_STATUS_TABS'))
check('decided applications hide the decision controls', panel.includes('isOpenStatus(active.status'))

const listRoute = readFileSync(join(process.cwd(), 'app/api/admin/applications/route.ts'), 'utf8')
check('the list payload never ships a raw base64 avatar', listRoute.includes('avatarSrc(') && !/avatarUrl:\s*u\?\.avatarUrl/.test(listRoute))
check('the list payload carries per-status counts', listRoute.includes('groupBy'))

const submitRoute = readFileSync(join(process.cwd(), 'app/api/applications/route.ts'), 'utf8')
check('a new application emails the admins, not only the bell', submitRoute.includes('newApplicationAdminEmail'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

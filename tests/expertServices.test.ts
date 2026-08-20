/*
 * AN EXPERT CAN SELL A JOB, NOT ONLY AN HOUR.
 *
 * Run:  npx tsx tests/expertServices.test.ts   (also in `npm run check`)
 *
 * WHY THIS FILE EXISTS. The site says it sells SERVICES. Until 2026-08-20 the
 * only thing an expert could publish was a `Consultation` row, and every row on
 * that table required `minutes` — so an accountant who wanted to sell
 * „დეკლარაციის შევსება — 100₾" had to invent a duration for it and put it on a
 * booking calendar. The whole expert half of the catalogue therefore sold
 * nothing but time, which is why it read as a consultation site no matter what
 * the copy said.
 *
 * `Consultation.bookable` is the column that fixes it, and it splits one table
 * into two shapes. Every failure below is silent:
 *
 *   · A SERVICE REACHING A CALENDAR. `minutes` is 0 on a service row, so a
 *     booking made against one writes a zero-length session and holds a slot
 *     that does not exist.
 *   · A SERVICE VANISHING FROM THE PROFILE. `orderedTiers` keeps only rows with
 *     a real duration — correct for a booking picker, catastrophic for the one
 *     page that exists to show what somebody sells.
 *   · THE PAIRING RULE BREAKING ON A PATCH. „make this a service" and „make it
 *     45 minutes" arrive as separate half-bodies; judging either alone lets a
 *     bookable row end up with no duration.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const codeOf = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*(\/\/|\*|\/\/\/)/.test(l)).join('\n')

/* ── A. The column exists, additively ─────────────────────────────────────── */

test('bookable is declared, defaulted, and created without a migration', () => {
  assert.match(read('prisma/schema.prisma'), /bookable\s+Boolean\s+@default\(true\)/,
    'the column lost its default — every existing row would become a service')
  // dbBoot is how this database changes. A column added only in schema.prisma
  // exists on nobody's deployment.
  assert.match(read('lib/dbBoot.ts'), /ADD COLUMN IF NOT EXISTS "bookable" BOOLEAN NOT NULL DEFAULT true/,
    'the column is not created at boot')
})

/* ── B. A service can never be booked ─────────────────────────────────────── */

test('the booking route refuses a service by NOT FINDING it', () => {
  // ⚠️ RAW SOURCE, NOT STRIPPED. The block-comment stripper swallows a large
  // range of this particular file (an unbalanced `/*` inside one of its long
  // notes), which silently emptied the haystack and made this assertion pass
  // for the wrong reason. The needle below is a code expression with braces —
  // it cannot occur in prose.
  const route = read('app/api/bookings/route.ts')
  assert.match(route, /where: \{ id: consultationId, tutorId, bookable: true \}/,
    'a service row can be booked — it has no duration and no slot')
  // 404, not 403: the same answer a forged id from another tutor gets. A
  // different answer here would tell an attacker which ids are real.
  assert.match(route, /CONSULTATION_NOT_FOUND/)
})

test('the API keeps the two shapes from blurring', () => {
  const create = codeOf('app/api/tutor/consultations/route.ts')
  assert.match(create, /bookable: z\.boolean\(\)\.default\(true\)/,
    'an absent flag no longer means bookable — every existing client would start writing services')
  assert.match(create, /!v\.bookable \|\| v\.minutes >= 5/, 'a bookable offering may be created with no duration')
  assert.match(create, /v\.bookable \? v : \{ \.\.\.v, minutes: 0 \}/, 'a service keeps a duration it does not have')

  const patch = codeOf('app/api/tutor/consultations/[id]/route.ts')
  // ⚠️ THE MERGED ROW, not the body. A PATCH may flip the flag without sending
  // minutes, or send minutes without the flag.
  assert.match(patch, /const willBook = parsed\.data\.bookable \?\? c\.bookable/,
    'the pairing rule judges the body alone — a flip without minutes slips through')
  assert.match(patch, /const willMins = parsed\.data\.minutes \?\? c\.minutes/)
  assert.match(patch, /willBook && willMins < 5/, 'a bookable row can be left with no duration')
  assert.match(patch, /willBook \? parsed\.data : \{ \.\.\.parsed\.data, minutes: 0 \}/,
    'a row turned into a service keeps its old minutes and announces a session that is not on offer')
})

/* ── C. A service is visible where it is sold ─────────────────────────────── */

test('the profile draws both shapes, services first', () => {
  const sec = codeOf('app/experts/[slug]/_sections.tsx')
  assert.match(sec, /const jobs = consultations\.filter\(c => c\.bookable === false\)/,
    'the profile lost its service list — orderedTiers drops them silently')
  const jobsAt = sec.indexOf('jobs.map(')
  const tiersAt = sec.indexOf('tiers.map(')
  assert.ok(jobsAt > -1 && tiersAt > -1, 'one of the two lists is gone')
  assert.ok(jobsAt < tiersAt,
    'the bookable hours are drawn before the services — the hierarchy is the other way round')
  // „0 წუთი" is the exact lie this list was added to stop telling.
  const jobBlock = sec.slice(jobsAt, tiersAt)
  assert.doesNotMatch(jobBlock, /წუთი|წთ/, 'a service is being measured in time')

  // …and the payload has to carry the flag, or every service renders as an hour.
  assert.match(codeOf('app/experts/[slug]/page.tsx'), /bookable: true/,
    'the server seed drops `bookable` — the profile cannot tell the shapes apart')
})

test('the editor asks the shape first and hides the clock for a service', () => {
  const ed = codeOf('app/work/services/_consultations.tsx')
  assert.match(ed, /რა ტიპისაა\?/, 'the shape question is gone — every offering is an hour again')
  assert.match(ed, /consForm\.bookable && \(/, 'the duration field shows for a service')
  assert.match(ed, /consEdit\.bookable && \(/, 'the duration field shows when editing a service')
  // ABSENT, not disabled: a greyed-out box still asks a question, and the
  // answer to this one does not exist.
  assert.doesNotMatch(ed, /disabled=\{[^}]*bookable/, 'the clock is disabled rather than removed')
  assert.match(ed, /c\.bookable \? `\$\{c\.minutes\} წთ` : 'სერვისი'/, 'a saved service is labelled by a duration it has not got')
})

/* ── D. The door asks the same question as the editor ─────────────────────── */

test('registration collects a SERVICE, and the calendar is conditional', () => {
  // ⚠️ THE DOOR WAS THE LAST CONSULTATION-ONLY SURFACE (2026-08-20). The editor
  // learned both shapes first, which left the application asking the old
  // question: every offering needed a duration, and step 2 refused to submit
  // without a published working week. A lawyer selling „ხელშეკრულების შედგენა"
  // could not register at all — they had to invent an appointment length for a
  // job that has no appointment. Owner: „აქამდე ექსპერტებზე მორგებული იყო,
  // ვინც კონსულტაციას ატარებს — შესაცვლელია."
  const form = codeOf('app/join/_expert/_form.tsx')
  assert.match(form, /bookable: boolean/, 'the application cannot express a service')
  assert.match(form, /free: false, bookable: false/, 'the seeded row is a bookable hour again — the form answers for the applicant')
  assert.match(form, /l: 'რას ყიდი'/, 'step 2 is named after time again')

  const steps = codeOf('app/join/_expert/_steps.tsx')
  assert.match(steps, /const anyBookable = form\.services\.some\(sv => sv\.bookable\)/)
  assert.match(steps, /\{anyBookable && <AvailabilityPicker/,
    'the calendar is unconditional — a service seller is asked to publish a working week')
  assert.match(steps, /\{s\.bookable && \(/, 'the duration column shows on a service')

  // The rule, at the gate: a schedule is demanded only when something on the
  // form can actually be booked.
  const client = codeOf('app/join/_expert/ApplyClient.tsx')
  assert.match(client, /if \(form\.services\.some\(sv => sv\.bookable\)\) \{/,
    'step 2 requires a working week from everybody again')
  assert.match(client, /დაასახელე შენი სერვისი/, 'an unnamed offering can be submitted — it publishes a blank row')
})

test('approval publishes a service instead of dropping it', () => {
  // The quietest failure in the chain: the seeder demanded a finite `dur` on
  // every row, so a service registered at the door would have been filtered out
  // on approval — an approved expert with an empty profile and no error
  // anywhere. Found by reading the seeder, not by a failing test.
  const seed = read('app/api/applications/[id]/route.ts')
  assert.doesNotMatch(seed, /Number\.isFinite\(Number\(s\.dur\)\)/,
    'approval still requires a duration — every registered service is dropped silently')
  assert.match(seed, /const bookable = s\.bookable !== false/,
    'an application written before the flag existed must still read as bookable')
  assert.match(seed, /minutes = bookable/, 'a service is seeded with a duration it does not have')
})

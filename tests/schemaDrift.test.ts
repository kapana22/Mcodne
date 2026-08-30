/*
 * A query that names a column the database no longer has (2026-08-26).
 *
 * Run: npx tsx tests/schemaDrift.test.ts   (also in `npm test`)
 *
 * WHY THIS FILE EXISTS. The services-only migration dropped
 * `Category.defaultServiceType` on 2026-08-24 and renamed the profile relation
 * to `providers`. Four route files kept asking for both, so EVERY request to
 * /api/admin/categories threw PrismaClientValidationError and the whole
 * „კატეგორიები" tab was dead in production for two days — GET, PATCH and
 * DELETE alike.
 *
 * ⚠️ AND `tsc` DOES NOT CATCH THIS. It looks like it should — the generated
 * client types every select — but measured on the real file that day: a select
 * carrying one unknown key stops the rest of that literal being checked, and
 * the whole call passes. `npm run check` was green the entire time. Do not
 * assume a red build will tell you; nothing will, until a request does.
 *
 * WHAT THIS PINS — the two shapes that broke, read out of the migrations and
 * the schema rather than a list somebody has to remember to update:
 *   A. no source file selects a column that a manual migration DROPped and the
 *      schema no longer has;
 *   B. every key inside a `_count: { select: … }` is a list relation that
 *      exists — `tutors` became `providers` and nothing said so;
 *   C. every `prisma.<model>` is a model in the schema.
 *
 * WHAT IT DOES NOT SEE: a `where`, an `orderBy`, or a shorthand key in a
 * `data:` object. This is a regex over source — the debt CLAUDE.md names — and
 * it is here because the type system declines to do it. The behavioural version
 * is to run the query; tests/sitemap.test.ts does that for the one route whose
 * output is public.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(p, 'utf8')

/** Source with comments removed — prose is allowed to name a dead column, and
 *  the fix for this very bug leaves a comment that does. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) { if (e !== 'node_modules') walk(p, out) }
    else if (/\.tsx?$/.test(p)) out.push(p)
  }
  return out
}

const SOURCES = ['app', 'lib', 'components']
  .flatMap(d => walk(join(ROOT, d)))
  // lib/dbBoot IS the migration runner: naming a dropped column is its job.
  .filter(p => !p.endsWith(join('lib', 'dbBoot.ts')))
  .map(p => ({ path: p.slice(ROOT.length + 1), code: strip(read(p)) }))

const SCHEMA = read(join(ROOT, 'prisma', 'schema.prisma'))

/** Every field name the schema still declares, on any model. */
const LIVE_FIELDS = new Set(
  [...SCHEMA.matchAll(/^\s{2}(\w+)\s+\S/gm)].map(m => m[1]),
)
/** Every model name. */
const MODELS = new Set([...SCHEMA.matchAll(/^model\s+(\w+)\s*\{/gm)].map(m => m[1]))
/** Every LIST relation — the only thing a `_count: { select: … }` may name. */
const LIST_RELATIONS = new Set(
  [...SCHEMA.matchAll(/^\s{2}(\w+)\s+\w+\[\]/gm)].map(m => m[1]),
)

/* ═══════════ A. a column the database dropped ════════════════════════ */

test('no query selects a column a migration dropped', () => {
  const migrations = join(ROOT, 'prisma', 'manual-migrations')
  const dropped = new Set<string>()
  for (const dir of readdirSync(migrations)) {
    const up = join(migrations, dir, 'up.sql')
    try {
      for (const m of read(up).matchAll(/DROP COLUMN(?: IF EXISTS)? "(\w+)"/gi)) dropped.add(m[1])
    } catch { /* a migration folder without an up.sql is not this test's business */ }
  }
  // A name that came BACK is not drift — only the ones the schema no longer has.
  const gone = [...dropped].filter(c => !LIVE_FIELDS.has(c))
  assert.ok(gone.length > 0, 'no dropped columns found — did the migrations move?')

  const offences: string[] = []
  for (const { path, code } of SOURCES) {
    for (const col of gone) {
      // A select key (`col: true`) or a where/filter (`col: {`). The two shapes
      // Prisma refuses at runtime and TypeScript waves through.
      const re = new RegExp(`\\b${col}:\\s*(true|\\{)`, 'g')
      for (const m of code.matchAll(re)) {
        const line = code.slice(0, m.index).split('\n').length
        offences.push(`${path}:${line} — "${col}" was dropped by a migration`)
      }
    }
  }
  assert.deepEqual(offences, [])
})

/* ═══════════ B. a relation that was renamed ══════════════════════════ */

test('every _count select names a relation that exists', () => {
  assert.ok(LIST_RELATIONS.size > 10, 'the schema parse found almost no list relations')
  const offences: string[] = []
  for (const { path, code } of SOURCES) {
    for (const m of code.matchAll(/_count:\s*\{\s*select:\s*\{/g)) {
      const line = code.slice(0, m.index).split('\n').length
      // ⚠️ WALK THE BRACES, DON'T REGEX THEM. A relation count can be FILTERED
      // — `_count: { select: { messages: { where: { … } } } }` — and a lazy
      // `[^}]*` reads that where-clause's own keys as relation names and calls
      // every one of them drift. Only the keys at depth 1 are relations.
      let depth = 1
      let i = m.index + m[0].length
      let key = ''
      for (; i < code.length && depth > 0; i++) {
        const ch = code[i]
        if (ch === '{') { depth++; continue }
        if (ch === '}') { depth--; continue }
        if (depth !== 1) continue
        if (/[\w$]/.test(ch)) { key += ch; continue }
        if (ch === ':' && key) {
          if (!LIST_RELATIONS.has(key)) {
            offences.push(`${path}:${line} — _count selects "${key}", which is not a relation`)
          }
        }
        key = ''
      }
    }
  }
  assert.deepEqual(offences, [])
})

/* ═══════════ C. a table that is gone ═════════════════════════════════ */

test('every prisma.<model> is a model in the schema', () => {
  // `prisma.$transaction`, `prisma.$executeRawUnsafe` and friends are not models.
  const offences: string[] = []
  for (const { path, code } of SOURCES) {
    for (const m of code.matchAll(/\bprisma\.([a-z]\w*)\b/g)) {
      const model = m[1][0].toUpperCase() + m[1].slice(1)
      if (!MODELS.has(model)) {
        const line = code.slice(0, m.index).split('\n').length
        offences.push(`${path}:${line} — prisma.${m[1]} is not a model`)
      }
    }
  }
  assert.deepEqual(offences, [])
})

/* ═══════════ D. a field that exists on no model at all ═══════════════ */

test('every select/include key is a field the schema still declares', () => {
  // ⚠️ THIS IS THE CHECK THAT CATCHES A DROPPED TABLE'S RELATION. Rule A reads
  // `DROP COLUMN` out of the migrations, so it never sees `User.tutor` — that
  // field went when TutorProfile was DROPped as a table, and the relation is
  // declared on the other side. On 2026-08-26 lib/requestJobs still selected
  // it, which meant `routableProviders()` threw on every call: the query that
  // decides WHO HEARS ABOUT A REQUEST. Nobody was mailed, and the only trace
  // was four lines in the Railway log.
  //
  // The rule is deliberately weak and therefore safe: a select key must name a
  // field SOMEWHERE in the schema. It cannot tell you that `Category.name` is
  // wrong on `User`, and it is not trying to — it catches the name that exists
  // nowhere, which is what a dropped column and a dropped relation both look
  // like. `include` is read on the same terms — it takes the same field names.
  const offences: string[] = []
  for (const { path, code } of SOURCES) {
    for (const m of code.matchAll(/\b(?:select|include):\s*\{/g)) {
      const line = code.slice(0, m.index).split('\n').length
      let depth = 1
      let key = ''
      for (let i = m.index + m[0].length; i < code.length && depth > 0; i++) {
        const ch = code[i]
        if (ch === '{') { depth++; continue }
        if (ch === '}') { depth--; continue }
        if (depth !== 1) continue
        if (/[\w$]/.test(ch)) { key += ch; continue }
        // `_count` is an aggregate, not a field; rule B checks inside it.
        if (ch === ':' && key && key !== '_count' && !LIVE_FIELDS.has(key)) {
          offences.push(`${path}:${line} — a select/include names "${key}", which is a field on no model`)
        }
        key = ''
      }
    }
  }
  assert.deepEqual(offences, [])
})

/* ═══════════ E. the whole call, not just the select ══════════════════ */

/** Every key Prisma's query language owns. Anything else in a query object is
 *  a field name — or drift. */
const OPERATORS = new Set(`
  select include omit where orderBy data take skip cursor distinct by having
  create createMany connect connectOrCreate disconnect update updateMany upsert
  delete deleteMany set push increment decrement multiply divide
  AND OR NOT not in notIn lt lte gt gte equals contains startsWith endsWith
  mode search some every none is isNot has hasSome hasEvery isEmpty isSet
  skipDuplicates relationLoadStrategy asc desc nulls first last
  _count _sum _avg _min _max _all
  null undefined true false
`.trim().split(/\s+/))

/** Enum VALUES are written as keys nowhere, but they are written as values and
 *  a ternary can put one in front of a colon; cheaper to allow than to parse. */
const ENUM_VALUES = new Set(
  [...SCHEMA.matchAll(/^enum\s+\w+\s*\{([^}]*)\}/gm)].flatMap(m => m[1].trim().split(/\s+/)),
)

/** `userId_providerId` — a compound unique, spelled as its parts joined. */
const isCompoundKey = (k: string) => k.includes('_') && k.split('_').every(part => LIVE_FIELDS.has(part))

test('every key in every prisma call is a field, an operator or an enum value', () => {
  // ⚠️ THE WIDEST OF THE FIVE, AND THE ONE THAT CATCHES A WRITE. Rules A–D read
  // `select`; this reads the WHOLE argument object, so it also sees `where`,
  // `orderBy` and `data`. Two of the four queries broken on 2026-08-26 were
  // only visible from here:
  //   • app/api/requests/[ref]/offers/[offerId]/review — `data: { tutorId: null }`
  //     against a column dropped on 2026-08-24. Nobody could review a finished
  //     job; the route threw a 500 and the failure was invisible because no
  //     offer had been completed yet.
  //   • the same shape is what a renamed column looks like from here.
  const offences: string[] = []
  for (const { path, code } of SOURCES) {
    for (const m of code.matchAll(/\bprisma\.([a-z]\w*)\.(\w+)\(\s*\{/g)) {
      let depth = 1
      let i = m.index + m[0].length
      for (; i < code.length && depth > 0; i++) {
        const ch = code[i]
        if (ch === '{') depth++
        else if (ch === '}') depth--
      }
      const body = code.slice(m.index + m[0].length, i - 1)
      for (const k of body.matchAll(/(?:^|[{,\s])(\w+)\s*:/g)) {
        const key = k[1]
        if (LIVE_FIELDS.has(key) || OPERATORS.has(key) || ENUM_VALUES.has(key) || isCompoundKey(key)) continue
        const line = code.slice(0, m.index + k.index).split('\n').length
        offences.push(`${path}:${line} — prisma.${m[1]}.${m[2]} names "${key}", which is a field on no model`)
      }
    }
  }
  assert.deepEqual(offences, [])
})

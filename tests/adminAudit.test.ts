/*
 * The audit log is only a log if you can read it (2026-08-26).
 *
 * Run: npx tsx tests/adminAudit.test.ts   (also in `npm test`)
 *
 * WHY THIS FILE EXISTS. `app/admin/_audit.tsx` has carried this sentence since
 * it was written — „Every action string written by an audit() call site must
 * have a label here — an unmapped one falls back to the raw `noun.verb` and
 * reads like a bug" — and nothing enforced it. Measured on 2026-08-26: THIRTEEN
 * of the twenty-nine actions the panel writes had no label, among them
 * `master.approve` (approving an expert — the most common decision in the
 * panel), `request.routed`, `request.access.grant`, `tutor.category.set` and
 * every company action. A third of the audit tab read as raw identifiers.
 *
 * WHAT IT DOES. Walks every `audit(actor, <action>, …)` call site in app/ and
 * lib/ and collects the action strings — including both halves of a ternary,
 * which is how half of them are written. Two call sites build the action from a
 * template literal, and their expansions are listed below with the enum they
 * come from; the test also pins that those two sites still have that shape, so
 * a new status or a new application verb cannot slip past this file silently.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) { if (e !== 'node_modules') walk(p, out) }
    else if (/\.tsx?$/.test(p)) out.push(p)
  }
  return out
}
const SOURCES = ['app', 'lib'].flatMap(d => walk(join(ROOT, d)))
  .filter(p => !p.endsWith(join('lib', 'audit.ts')))

/** `audit(x, 'a.b', …)` and `audit(x, cond ? 'a.b' : 'a.c', …)` alike. */
const emittedActions = (): Set<string> => {
  const found = new Set<string>()
  for (const p of SOURCES) {
    const src = readFileSync(p, 'utf8')
    for (const m of src.matchAll(/\baudit\(\s*[^,]+,\s*([^{]*?),\s*\{/g)) {
      // ⚠️ THE DOT IS THE FILTER. Half these call sites are ternaries whose
      // CONDITION is also a string — `action === 'makeAdmin' ? 'user.makeAdmin'
      // : …` — and without this the test demanded a label for „makeAdmin".
      // Every audit action is `noun.verb`; nothing else in that position is.
      for (const s of m[1].matchAll(/'([a-z][\w]*(?:\.[\w]+)+)'/g)) found.add(s[1])
    }
  }
  return found
}

/**
 * The two call sites that build an action from a value, and every value they
 * can produce. Listed by hand ON PURPOSE — a regex cannot expand a template
 * literal, and the alternative (skipping them) is how `master.reject` went
 * unlabelled for weeks.
 */
const TEMPLATED: { file: string; shape: RegExp; expands: string[] }[] = [
  {
    // ServiceRequestStatus, lowercased, plus the no-status fallback.
    file: 'app/api/admin/requests/[id]/route.ts',
    shape: /audit\(admin\.id, status \? `request\.\$\{status\.toLowerCase\(\)\}` : 'request\.update'/,
    expands: ['request.new', 'request.verified', 'request.rejected', 'request.matched', 'request.closed', 'request.update'],
  },
  {
    // The three verbs app/api/master-applications/[id] accepts.
    file: 'app/api/master-applications/[id]/route.ts',
    shape: /audit\(me\.id, `master\.\$\{action\}`/,
    expands: ['master.approve', 'master.revise', 'master.reject'],
  },
]

const labels = (): Set<string> => {
  const src = readFileSync(join(ROOT, 'app/admin/_audit.tsx'), 'utf8')
  const start = src.indexOf('const ACTION_LABEL')
  const body = src.slice(start, src.indexOf('\n}', start))
  return new Set([...body.matchAll(/'([a-z][\w.]*)':\s*'/g)].map(m => m[1]))
}

test('every audit action the panel writes has a Georgian label', () => {
  const have = labels()
  const missing = [...emittedActions()].filter(a => !have.has(a)).sort()
  assert.deepEqual(missing, [], 'these audit actions render as raw `noun.verb` in ადმინი → აუდიტი')
})

test('the two templated action sites still have the shape this file expands', () => {
  for (const t of TEMPLATED) {
    const src = readFileSync(join(ROOT, t.file), 'utf8')
    assert.match(src, t.shape,
      `${t.file} builds its audit action differently now — re-derive the expansions in tests/adminAudit.test.ts`)
  }
})

test('every value those two sites can produce has a label', () => {
  const have = labels()
  const missing = TEMPLATED.flatMap(t => t.expands).filter(a => !have.has(a)).sort()
  assert.deepEqual(missing, [])
})

test('a request status cannot be added without a label', () => {
  // The expansion list above is only true while the enum matches it.
  const schema = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8')
  const block = schema.slice(schema.indexOf('enum ServiceRequestStatus'))
  // Each value carries a trailing `// …` note, so the line does not end at the
  // identifier.
  const values = [...block.slice(0, block.indexOf('}')).matchAll(/^\s+([A-Z_]+)\b/gm)].map(m => m[1])
  assert.ok(values.length >= 3, 'the ServiceRequestStatus enum did not parse')
  const expanded = TEMPLATED[0].expands
  const missing = values.map(v => `request.${v.toLowerCase()}`).filter(a => !expanded.includes(a))
  assert.deepEqual(missing, [], 'a ServiceRequestStatus value has no `request.<status>` entry in TEMPLATED')
})

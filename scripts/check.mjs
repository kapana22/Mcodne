#!/usr/bin/env node
/**
 * The pre-deploy gate. `npm run check` — and nothing ships without it passing.
 *
 * WHY THIS EXISTS. There are 31 unit tests in tests/*.test.ts and, until
 * 2026-07-31, NOTHING ran them: no CI, no remote to hang a GitHub Action on
 * (`git remote -v` is empty — production deploys from the working tree via
 * `railway up`, not from git). A test nobody runs is a comment.
 *
 * It has already cost real features twice, both times the same shape — a zod
 * ceiling sized for a URL silently rejecting a base64 upload:
 *   - certificates: `max(500)` vs a diploma → all five production rows had
 *     fileUrl NULL for weeks, with no error anywhere;
 *   - blog covers: `max(2000)` vs a 1200×675 webp → would have rejected every
 *     upload the day the uploader shipped.
 * Both are now pinned by tests. Pins only work if something checks them.
 *
 * WHAT IT RUNS, in ascending cost so the cheapest failure surfaces first:
 *   1. tsc --noEmit          (~1s)   — types across the whole tree
 *   2. tests/*.test.ts       (~13s)  — the 84 pure tests, each its own process
 *   3. next build            (~60s)  — the thing Railway will run anyway,
 *                                    into .next-check so a running `next dev`
 *                                    is never building into the same folder
 *
 * WHAT IT DOES NOT RUN: `tests/blogLinks.check.ts`, which reads the live DB to
 * find posts linking at a draft or a redirect. It is `.check.ts` precisely so
 * this glob misses it — it needs production data, so it is a manual tool.
 *
 * The 39 one-off .mjs harnesses that used to sit beside it were DELETED on
 * 2026-08-21. Every one of them navigated a retired URL (`/tutors`, `/student`,
 * `/apply`) and swallowed the failure with `.catch(() => {})`, so they reported
 * success while measuring nothing — `ux-audit-sweep` waited for a selector,
 * `a[href^="/tutors/"]`, that the catalogue stopped emitting in stage 10. They
 * are in the history if a sweep is ever wanted again; what is NOT wanted is a
 * green audit that looked at a redirect.
 *
 * Usage:
 *   npm run check          full gate, run this before `railway up`
 *   npm run check -- fast  skip the build (types + tests only)
 */
import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FAST = process.argv.includes('fast')
// The gate's own build directory. Not .next — see the build stage below.
const DIST = '.next-check'

// Every stage gets a deadline. On 2026-08-19 one test file waited on something
// that never arrived and, because the runner had no timeout, the gate sat there
// for four and a half hours: no failure, no deploy, no signal. A hang must
// report as a failure, never as silence.
const run = (cmd, args, opts = {}) =>
  new Promise(resolve => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: opts.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit', shell: false, env: { ...process.env, ...(opts.env || {}) } })
    let out = ''
    let timer = null
    if (opts.quiet) { p.stdout.on('data', d => (out += d)); p.stderr.on('data', d => (out += d)) }
    if (opts.timeout) {
      timer = setTimeout(() => {
        p.kill('SIGKILL')
        out += `\n  TIMEOUT after ${opts.timeout / 1000}s — killed`
      }, opts.timeout)
    }
    p.on('close', code => { if (timer) clearTimeout(timer); resolve({ code, out, timedOut: !!timer && code === null }) })
  })

/* ⚠️ THE TIMEOUTS, NAMED AND IN ONE PLACE (2026-09-02). The build's was 600s
   typed inline, which is fine until a build legitimately takes longer — it did
   (975s, against the production database) and the gate reported that as a
   FAILURE. 20 minutes is not permissive: nothing here comes close when the
   database is local, and a gate that kills honest work teaches people to stop
   trusting it. */
const TIMEOUTS = { test: 120_000, build: 1_200_000 }

const started = process.hrtime.bigint()
const secs = from => `${Number(process.hrtime.bigint() - from) / 1e9 | 0}s`
let failed = 0

console.log('\n\x1b[1m▸ types\x1b[0m')
{
  const t = process.hrtime.bigint()
  const { code, out } = await run('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'], { quiet: true, timeout: 180000 })
  if (code === 0) console.log(`  \x1b[32m✓\x1b[0m clean (${secs(t)})`)
  else { failed++; console.log(`  \x1b[31m✗\x1b[0m\n${out.split('\n').slice(0, 20).join('\n')}`) }
}

// ⚠️ WARM THE SCHEMA BEFORE THE LANES START (2026-08-21).
//
// Two test files reach the database, and the FIRST process to do so pays the
// migration set if the stamp does not match — which is exactly what happens the
// run after anyone edits lib/dbBoot. That is a ~102-second bill landing inside a
// file with a 120-second timeout, so a correct change to the schema failed the
// gate on `abroad.test.ts` with no output, which reads as a broken test and is
// not one. Paying it here once, with a deadline of its own, turns a confusing
// red into a slow green.
//
// Failure is NOT fatal: a developer with no database reachable should still get
// types and the ninety-odd tests that never open a connection.
{
  const t = process.hrtime.bigint()
  const { code, out } = await run('npx', ['tsx', '-e', "require('./lib/dbBoot').ensureDbReady().then(()=>process.exit(0),e=>{console.error(e.message);process.exit(1)})"], { quiet: true, timeout: 240000 })
  if (code === 0) console.log(`\n\x1b[1m▸ schema\x1b[0m\n  \x1b[32m✓\x1b[0m ready (${secs(t)})`)
  else console.log(`\n\x1b[1m▸ schema\x1b[0m\n  \x1b[33m!\x1b[0m not reachable — DB-touching tests may fail (${secs(t)})\n${out.split('\n').slice(0, 3).map(l => '    ' + l).join('\n')}`)
}

console.log('\n\x1b[1m▸ tests\x1b[0m')
{
  // Each test file is a standalone script that exits non-zero on failure —
  // there is no runner, by design (they predate one and need no fixtures).
  const files = readdirSync(join(ROOT, 'tests')).filter(f => f.endsWith('.test.ts')).sort()
  const t = process.hrtime.bigint()
  // ⚠️ SIX AT A TIME, NOT NINETY-EIGHT (2026-08-19). This was `Promise.all` over
  // every file, and a handful of them reach the real Postgres. Ninety-one
  // processes racing for connections exhausted the pool: the ones that lost
  // hung on connect, the gate had no timeout, and it sat there for FOUR AND A
  // HALF HOURS with „▸ tests" on screen and nothing else. The next run failed
  // differently — the build's own prerender could not get a connection either,
  // so `/privacy` failed to export and a green change looked like a broken one.
  //
  // The cap is small deliberately. A number the database can always serve is
  // worth more than a faster gate.
  //
  // ⚠️ AND SIX LANES WAS NEVER WHY THE GATE WAS SLOW (measured 2026-08-21).
  // The tests stage took 110s and 96 of the 98 files accounted for under a
  // second of it: `abroad` and `b2b` each cold-booted the schema, and
  // lib/dbBoot was re-running all 166 idempotent statements every time —
  // ~600ms per round trip against the Railway proxy, so 102 SECONDS per
  // process. dbBoot now stamps the set with a hash of its own source and skips
  // it in two round-trips, and this stage runs in 10s. If it ever creeps back
  // up, time the files before touching this number — the lanes were innocent.
  const LANES = 6
  const results = []
  {
    const queue = [...files]
    const lane = async () => {
      for (;;) {
        const f = queue.shift()
        if (!f) return
        results.push({ f, ...(await run('npx', ['tsx', join('tests', f)], { quiet: true, timeout: TIMEOUTS.test })) })
      }
    }
    await Promise.all(Array.from({ length: LANES }, lane))
    results.sort((a, b) => a.f.localeCompare(b.f))
  }
  const bad = results.filter(r => r.code !== 0)
  console.log(`  ${bad.length ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m'} ${files.length - bad.length}/${files.length} passed (${secs(t)})`)
  for (const r of bad) {
    failed++
    console.log(`\n  \x1b[31m${r.f}\x1b[0m`)
    console.log(r.out.split('\n').filter(l => l.includes('✗') || l.includes('Error')).slice(0, 8).map(l => '    ' + l).join('\n') || '    (no output)')
  }
}

if (!FAST) {
  console.log('\n\x1b[1m▸ build\x1b[0m')
  const t = process.hrtime.bigint()
  // ⚠️ BUILD BESIDE `next dev`, NEVER ON TOP OF IT (2026-09-01).
  //
  // This used to run straight into .next, which a running `next dev` also
  // owns. Two builds over one directory leave half-written manifests, and
  // the result reads as a product bug — unstyled pages, a missing manifest,
  // `PageNotFoundError` on an API route — so the afternoon goes on the
  // change under test, which was innocent. next.config.js honours
  // NEXT_DIST_DIR; setting it here is the whole fix, and Railway (which
  // sets nothing) still builds into .next exactly as before.
  //
  // The cost is one cold cache the first time, and ~450 MB of disk that
  // .gitignore and .railwayignore both drop.
  const { code, out } = await run('npx', ['next', 'build'], { quiet: true, timeout: TIMEOUTS.build, env: { NEXT_DIST_DIR: DIST } })
  if (code === 0) console.log(`  \x1b[32m✓\x1b[0m compiled (${secs(t)})`)
  else {
    failed++
    // The dev-server collision is designed out (see DIST above), so a manifest
    // error here is no longer «something else is building» — the remaining
    // known cause is the Node version.
    /* ⚠️ A KILLED STAGE IS NOT A FAILED ONE, AND MUST NOT READ LIKE ONE
       (2026-09-02). Measured: the build ran 975s against the PRODUCTION
       database while a dev server competed for the same connection, this stage
       killed it at 600s, and the display then filtered the captured output for
       /error|Error|✗/ — which matched nothing except the ROUTE NAME
       `/api/log-error`. The gate printed „✗  ├ ƒ /api/log-error" over a build
       that had compiled perfectly, and the search went looking for a broken
       route. The runner already appended „TIMEOUT after Ns — killed"; it was
       simply not in the filter.
       Now the kill is reported first, on its own — a killed build has no error
       lines worth reading — and `/api/log-error` can never again be mistaken
       for one. */
    if (/TIMEOUT after/.test(out)) {
      console.log(`  \x1b[31m✗\x1b[0m killed after ${TIMEOUTS.build / 1000}s — NOT rejected.
    It compiles; it did not finish in time. The usual cause is the database:
    \`next build\` collects page data, .env points at PRODUCTION, and a dev
    server on this machine competes for that connection. Stop the dev server,
    or put a local DATABASE_URL in .env.local, then re-run.`)
    } else {
      // The dev-server collision is designed out (see DIST above), so a manifest
      // error here is no longer «something else is building» — the remaining
      // known cause is the Node version.
      const hint = /pages-manifest|routes-manifest|PageNotFoundError/.test(out)
        ? `\n    hint: Next 15.5 fails intermittently on Node 26 — use Node 22.\n          If it persists: rm -rf ${DIST} and retry (cold cache, ~2min).`
        : ''
      const lines = out.split('\n')
        .filter(l => /error|Error|✗/.test(l) && !/\/api\/log-error/.test(l))
        .slice(0, 15).map(l => '    ' + l).join('\n')
      console.log(`  \x1b[31m✗\x1b[0m${hint}\n${lines || '    (no error lines — read the full output with: npx next build)'}`)
    }
  }
}

console.log(
  failed
    ? `\n\x1b[31m✗ ${failed} stage(s) failed\x1b[0m — do NOT deploy (${secs(started)})\n`
    : `\n\x1b[32m✓ all clear\x1b[0m — safe to \`railway up --detach\` (${secs(started)})\n`,
)
process.exit(failed ? 1 : 0)

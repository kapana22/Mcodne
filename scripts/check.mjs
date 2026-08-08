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
 *   1. tsc --noEmit          (~20s)  — types across the whole tree
 *   2. tests/*.test.ts       (~30s)  — the 31 pure tests, each its own process
 *   3. next build            (~60s)  — the thing Railway will run anyway
 *
 * WHAT IT DOES NOT RUN: the 37 .mjs files in tests/ are live-site Playwright
 * scripts and one-off measurement harnesses. They need a running deployment and
 * a browser, so they are a manual tool, not a gate — mixing them in would make
 * the gate fail for reasons that have nothing to do with the change.
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

const run = (cmd, args, opts = {}) =>
  new Promise(resolve => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: opts.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit', shell: false })
    let out = ''
    if (opts.quiet) { p.stdout.on('data', d => (out += d)); p.stderr.on('data', d => (out += d)) }
    p.on('close', code => resolve({ code, out }))
  })

const started = process.hrtime.bigint()
const secs = from => `${Number(process.hrtime.bigint() - from) / 1e9 | 0}s`
let failed = 0

console.log('\n\x1b[1m▸ types\x1b[0m')
{
  const t = process.hrtime.bigint()
  const { code, out } = await run('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'], { quiet: true })
  if (code === 0) console.log(`  \x1b[32m✓\x1b[0m clean (${secs(t)})`)
  else { failed++; console.log(`  \x1b[31m✗\x1b[0m\n${out.split('\n').slice(0, 20).join('\n')}`) }
}

console.log('\n\x1b[1m▸ tests\x1b[0m')
{
  // Each test file is a standalone script that exits non-zero on failure —
  // there is no runner, by design (they predate one and need no fixtures).
  const files = readdirSync(join(ROOT, 'tests')).filter(f => f.endsWith('.test.ts')).sort()
  const t = process.hrtime.bigint()
  const results = await Promise.all(
    files.map(async f => ({ f, ...(await run('npx', ['tsx', join('tests', f)], { quiet: true })) })),
  )
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
  // `next build` and a running `next dev` share .next and fight over the
  // manifests — a build that fails with PageNotFoundError on an API route is
  // almost always this, not the change under test.
  const { code, out } = await run('npx', ['next', 'build'], { quiet: true })
  if (code === 0) console.log(`  \x1b[32m✓\x1b[0m compiled (${secs(t)})`)
  else {
    failed++
    const hint = /pages-manifest|routes-manifest|PageNotFoundError/.test(out)
      ? '\n    hint: stop `next dev`, rm -rf .next, retry — they share the build dir\n          (and Next 15.5 fails intermittently on Node 26; use Node 22)'
      : ''
    console.log(`  \x1b[31m✗\x1b[0m${hint}\n${out.split('\n').filter(l => /error|Error|✗/.test(l)).slice(0, 15).map(l => '    ' + l).join('\n')}`)
  }
}

console.log(
  failed
    ? `\n\x1b[31m✗ ${failed} stage(s) failed\x1b[0m — do NOT deploy (${secs(started)})\n`
    : `\n\x1b[32m✓ all clear\x1b[0m — safe to \`railway up --detach\` (${secs(started)})\n`,
)
process.exit(failed ? 1 : 0)

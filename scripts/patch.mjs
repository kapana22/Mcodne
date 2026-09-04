#!/usr/bin/env node
// EXACT-TEXT PATCHING THAT SAYS WHY IT MISSED.
//
//   node scripts/patch.mjs <file> <<'JSON'
//   [{ "old": "…", "new": "…" }, …]
//   JSON
//
// ⚠️ WHY THIS EXISTS, measured 2026-09-03 across the last 50 transcripts: of
// 11 561 tool results, 1 721 carried an error, and the largest identified cause
// was an agent's own patch script failing `assert old in s` — 201 of them. Each
// one costs a full round trip: the anchor is off by a space or a curly quote,
// the script dies with a bare AssertionError that says nothing about WHERE, and
// the next turn goes on re-reading the file to find out.
//
// This does the same job and, when an anchor misses, prints the closest lines in
// the file with their numbers — so the retry is informed rather than another
// guess. It writes NOTHING unless every replacement matched, so a half-applied
// patch is not a state this can leave behind.

import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) { console.error('usage: node scripts/patch.mjs <file>  (edits as JSON on stdin)'); process.exit(2) }

const edits = JSON.parse(readFileSync(0, 'utf8'))
const src = readFileSync(file, 'utf8')
let out = src
const misses = []

for (const [i, e] of edits.entries()) {
  const { old, new: rep, all = false } = e
  if (typeof old !== 'string' || typeof rep !== 'string') {
    console.error(`edit ${i}: needs string "old" and "new"`); process.exit(2)
  }
  const n = out.split(old).length - 1
  if (n === 0) { misses.push({ i, old }); continue }
  if (n > 1 && !all) { misses.push({ i, old, note: `matches ${n} times — pass "all": true or lengthen the anchor` }); continue }
  /* ⚠️ `split().join()` ON BOTH BRANCHES, AND `String.replace` ON NEITHER
     (2026-09-04). `replace` treats the REPLACEMENT string as a template: `$&`,
     `` $` ``, `$'` and `$1` are all expanded. `$'` means „everything after the
     match", so an edit whose new text merely CONTAINED `$'` — a SQL regex
     anchor followed by a quote, `~ '^5[0-9]{8}$'`, is how this was found —
     silently truncated the replacement at that point and appended a second copy
     of the whole rest of the file. The file it corrupted was lib/dbBoot.ts and
     the corruption read as 80 nonsense parse errors 200 lines away from the
     edit.

     This tool exists to make a failed edit LOUD (that is the whole point of the
     miss report below), so a silent corruption is the one bug it must not have.
     `n === 1` is already proven above, so joining a one-element split is the
     same edit with no template language in it. */
  out = out.split(old).join(rep)
}

if (misses.length) {
  const lines = src.split('\n')
  for (const m of misses) {
    const first = m.old.split('\n')[0].trim()
    console.error(`\n✗ edit ${m.i}${m.note ? ` — ${m.note}` : ' — no match'}`)
    console.error(`  looked for: ${JSON.stringify(first.slice(0, 90))}`)
    if (m.note) continue
    // The closest thing in the file, by longest shared prefix on the first line.
    const near = lines
      .map((l, k) => {
        let s = 0
        while (s < first.length && s < l.trim().length && first[s] === l.trim()[s]) s++
        return { k, l, s }
      })
      .filter(x => x.s > 6)
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
    if (near.length === 0) console.error('  nothing in the file starts like it — wrong file?')
    for (const x of near) console.error(`  ${String(x.k + 1).padStart(5)}: ${x.l.slice(0, 100)}`)
  }
  console.error(`\nnothing written to ${file}.`)
  process.exit(1)
}

writeFileSync(file, out)
console.log(`${file}: ${edits.length} edit(s) applied`)

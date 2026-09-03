// EVERY TOPIC GROUP HAS A MARK, AND NO TWO SHARE ONE.
//
// Run: npx tsx tests/topicMarks.test.ts   (also in `npm run check`)
//
// ⚠️ WHY A TEST AND NOT A TYPE. `lib/topicMarks` is keyed by `TOPIC_GROUPS` ids
// in a plain `Record<string, …>`, so a group renamed or added in
// lib/requestTopics compiles perfectly and simply renders no icon. The gap is
// invisible in review — the row still lays out, the label is still right, and
// the only symptom is one line in a list of thirty-one that looks slightly
// emptier than its neighbours. `tsc` cannot see it; this can.
//
// A `Record<GroupId, Mark>` would catch the missing key at build time and was
// the first thing tried. It cannot be written: `TOPIC_GROUPS` is a runtime
// array in a module `middleware.ts` imports, and deriving a literal union from
// it would pull that whole table into the type graph of every route.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TOPIC_GROUPS } from '../lib/requestTopics'

/* ⚠️ READ AS TEXT, NOT IMPORTED. `lib/topicMarks` imports components/Icon,
   whose category glyphs are ready-rendered JSX — under a plain `tsx` run that
   throws „React is not defined" before a single assertion runs. Every other
   pin in this suite that touches a component file does the same thing. */
const SRC = readFileSync(join(import.meta.dirname, '..', 'lib', 'topicMarks.tsx'), 'utf8')
/* ⚠️ THE MAP HOLDS A MARK KEY NOW (2026-09-02). It held `el(CatIcon.law)` /
   `fn(Icon.doc)` while the drawings were hand-made and came in two shapes; the
   set moved to Phosphor duotone that day and every entry is a plain string.
   Both assertions below are about the TABLE — „every group has one" and „no two
   share one" — so they survive the change untouched; only this line knew what
   the values looked like. */
const MAP = SRC.slice(SRC.indexOf('const GROUP_MARK'), SRC.indexOf('\n}', SRC.indexOf('const GROUP_MARK')))
const ENTRIES = [...MAP.matchAll(/^\s*([\w'-]+):\s*'([\w-]+)'/gm)]

test('every browsable topic group has an icon', () => {
  const marked = new Set(ENTRIES.map(m => m[1]))
  const missing = TOPIC_GROUPS.filter(g => !marked.has(g.id)).map(g => `${g.id} (${g.label})`)
  assert.deepEqual(missing, [],
    `these groups would draw a blank icon column — add them to lib/topicMarks, ` +
    `and draw a glyph in components/Icon if nothing existing honestly means it`)
})

test('no mark is used for two different groups', () => {
  /* ⚠️ THE RULE THE REFERENCE BROKE, AND THE REASON THIS FILE EXISTS
     (2026-09-02). The competitor screenshot the owner brought had ONE worker
     glyph on all six rows: the column cost its width and told the reader
     nothing, because a mark that is the same everywhere carries no
     information. `health` was `pulse` in the first draft — the same drawing
     `sport` already had — and this is what would have caught it.

     Read off the source rather than the rendered elements: the map holds
     closures, so two entries built from one glyph are only distinguishable by
     the name they were built from. */
  const used = ENTRIES.map(m => m[2])
  const seen = new Map<string, number>()
  for (const g of used) seen.set(g, (seen.get(g) ?? 0) + 1)
  const dupes = [...seen].filter(([, n]) => n > 1).map(([g, n]) => `${g} ×${n}`)
  assert.deepEqual(dupes, [], 'two groups share one glyph — the icon column stops meaning anything')
  // …and the parse found something, or the assertion above passes vacuously.
  assert.ok(used.length >= TOPIC_GROUPS.length, `only parsed ${used.length} marks — the regex stopped matching the map`)
})

/*
 * THE HELP MATCHER'S SCORECARD — accuracy over a whole question set, not
 * examples.
 *
 * Run with:  npx tsx tests/helpAccuracy.test.ts
 *
 * WHY THIS EXISTS ALONGSIDE tests/helpSearch.test.ts. That file pins
 * individual questions: „რა ღირს?" must reach `price`. Every assertion in it
 * passed on the day the widget was answering a client's „როგორ დავრეგისტრირდე"
 * with the EXPERT APPLICATION, and telling anyone who typed „ექსპერტი
 * მჭირდება" how to become one. Per-example tests cannot see that, because the
 * examples were chosen by the same person who wrote the keywords.
 *
 * So this file measures the two numbers that actually describe the feature:
 *
 *   CORRECT — the right answer arrived.
 *   WRONG   — a CONFIDENTLY WRONG answer arrived. This is the expensive one.
 *             Someone asking about their account deletion and being shown the
 *             booking-cancellation window has been misinformed; someone shown
 *             „ამაზე პასუხი არ მაქვს" has been handed to a human. The second
 *             is a worse experience and a better outcome, and the ceilings
 *             below are set so that no change can trade the first for it.
 *
 * ⚠️ WHAT THIS SET IS AND IS NOT. `fixtures/helpQueries.json` is hand-written —
 * phrasings a Georgian speaker would plausibly type, not observed traffic. It
 * is therefore a REGRESSION net, not a measure of real-world accuracy: it can
 * prove a change made things worse, and it cannot prove the widget is good.
 * The real set is the `help_unanswered` rows the widget records. When there are
 * enough of them, replace these rows with those and re-baseline the ceilings.
 * Do not tune keywords against this file until it is real traffic — a matcher
 * fitted to its own test set scores well here and no better in front of a
 * person.
 *
 * A `none` expectation means NO answer we have written covers that question. It
 * is not a gap in the matcher; it is a gap in lib/helpTopics, and the answer
 * has to be WRITTEN before any amount of keyword work can find it.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ALL_TOPICS, HELP_TOPIC_IDS } from '../lib/helpTopics'
import { searchAnswer, smallTalk } from '../lib/helpSearch'

type Row = [query: string, expected: string]
const SET: Row[] = JSON.parse(readFileSync('tests/fixtures/helpQueries.json', 'utf8'))

/** Measured 2026-08-04 at 105 correct / 3 wrong, after the six answers that
 *  closed the content gaps (signup · duration · location · contact · language ·
 *  pre-contact) — most of what the matcher used to get „wrong" was simply an
 *  answer nobody had written yet. The ceilings leave a little room to breathe,
 *  and any change that eats it should be visible in a diff. */
const MIN_CORRECT = 102
const MAX_WRONG = 5

type Outcome = { got: string; ok: boolean; wrong: boolean }

function evaluate([query, want]: Row): Outcome {
  // Small talk is a different code path and must never swallow a question.
  if (smallTalk(query)) return { got: 'smalltalk', ok: false, wrong: true }

  const r = searchAnswer(query, ALL_TOPICS)

  // A CHOICE counts as correct when the right answer is one tap away, and as
  // wrong otherwise — offering three wrong answers is not humility, it is
  // three wrong answers.
  if (r.kind === 'choice') {
    const ids = r.topics.map(t => t.id)
    const ok = ids.includes(want)
    return { got: `choice:${ids.join('|')}`, ok, wrong: !ok }
  }

  const got = r.kind === 'answer' || r.kind === 'profession' ? r.topic.id : 'none'
  if (want === 'none') return { got, ok: got === 'none', wrong: got !== 'none' }
  // Missing an answer we DO have is a miss, not a lie — counted against
  // CORRECT, but not against WRONG.
  return { got, ok: got === want, wrong: got !== want && got !== 'none' }
}

test('every expectation names a real topic (or none)', () => {
  for (const [q, want] of SET) {
    assert.ok(
      want === 'none' || HELP_TOPIC_IDS.has(want),
      `„${q}" expects „${want}", which is not a topic id — a renamed id would ` +
      `otherwise turn this whole file green while measuring nothing.`,
    )
  }
})

test('the matcher scores at or above its measured baseline', () => {
  const results = SET.map(row => ({ row, ...evaluate(row) }))
  const correct = results.filter(r => r.ok).length
  const wrong = results.filter(r => r.wrong).length

  const report = results
    .filter(r => !r.ok)
    .map(r => `    ${r.got.padEnd(38)} ≠ ${r.row[1].padEnd(16)} ${r.row[0]}`)
    .join('\n')

  assert.ok(
    wrong <= MAX_WRONG,
    `${wrong} confidently wrong answers (ceiling ${MAX_WRONG}).\n${report}`,
  )
  assert.ok(
    correct >= MIN_CORRECT,
    `${correct}/${SET.length} correct (floor ${MIN_CORRECT}).\n${report}`,
  )
})

test('the questions REAL people typed into production are answered', () => {
  // Copied verbatim out of the prod `Event` table (`help_unanswered`), which is
  // the only part of the set that is not hand-written. „როგორ დავრესგიტრირდე"
  // is two edits from the real word — past the one-edit typo ceiling on
  // purpose — so the misspelling itself had to become a keyword.
  const REAL: [string, string][] = [
    ['როგორ დავრესგიტრირდე', 'signup'],
    ['სად მდებარეობს', 'location'],
    ['ბიზნესზე ვინმე მჭირდება', 'find-expert'],
  ]
  for (const [q, want] of REAL) {
    const r = searchAnswer(q, ALL_TOPICS)
    const ids = r.kind === 'choice' ? r.topics.map(t => t.id)
      : r.kind === 'answer' || r.kind === 'profession' ? [r.topic.id] : []
    assert.ok(ids.includes(want), `„${q}" → ${ids.join('|') || 'none'}, wanted ${want}`)
  }
})

test('a typo and a reordered question still find the answer', () => {
  // The screenshot that started this: ONE transposed letter (გ↔ს) in
  // „დავრეგისტრირდე" produced „ამაზე მზა პასუხი არ მაქვს". Multi-word keywords
  // were matched with raw `includes()`, so the Damerau tolerance written for
  // exactly this mistype never applied to them.
  for (const q of ['როგორ დავრესგისტრირდე', 'დავრეგისტრირდე როგორ', 'დაჯვაშნა როგორ ხდება']) {
    const r = searchAnswer(q, ALL_TOPICS)
    assert.notEqual(r.kind, 'none', `„${q}" found nothing`)
  }
})

test('the word „ექსპერტი" does not route a client to the application form', () => {
  // A bare „ექსპერტად" keyword stemmed to ექსპერტ, so EVERY sentence
  // containing the site's most common noun scored for `become-expert` — and it
  // scored 7, exactly the threshold at which the profession router yields. A
  // client typing „ექსპერტი მჭირდება" was told how to become one.
  for (const q of ['ექსპერტი მჭირდება', 'ექსპერტს ვეძებ', 'ექსპერტის შეცვლა შემიძლია']) {
    const r = searchAnswer(q, ALL_TOPICS)
    const ids = r.kind === 'choice' ? r.topics.map(t => t.id)
      : r.kind === 'answer' || r.kind === 'profession' ? [r.topic.id] : []
    assert.ok(!ids.includes('become-expert'), `„${q}" → ${ids.join('|')}`)
  }
})

console.log('✓ helpAccuracy')

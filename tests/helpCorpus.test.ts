/*
 * THE ACCURACY GATE — the number that turns „the bot works badly" into a fact.
 *
 * Run with:  npx tsx tests/helpCorpus.test.ts
 *
 * `tests/fixtures/helpCorpus.ts` holds ~80 questions a Georgian visitor could
 * actually type, several of them lifted straight out of production. This file
 * scores the matcher against them and fails if the score drops.
 *
 * THE THREE NUMBERS, AND WHY IT IS NOT ONE:
 *
 *   recall   — of the questions we HAVE an answer for, how many reach it.
 *   refusal  — of the questions we do NOT answer, how many are correctly
 *              refused. This is the half that a keyword matcher quietly fails,
 *              and averaging it into a single „accuracy" is how a bot that
 *              answers everything looks good on a dashboard.
 *   exact    — how many resolve to ONE answer rather than a „did you mean".
 *              A choice is a legitimate outcome, but if everything becomes a
 *              choice the matcher has stopped deciding.
 *
 * A LOWER refusal SCORE IS A REGRESSION EVEN IF recall GOES UP. That trade
 * happened once already during this work — adding topic words to the profession
 * router took recall to 100% and dropped refusal from 75% to 63%, which is a
 * bot that confidently answers a partnership pitch with „here are marketers".
 * Both thresholds exist so that trade cannot be made silently again.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { ALL_TOPICS } from '../lib/helpTopics'
import { searchAnswer, smallTalk } from '../lib/helpSearch'
import { CORPUS, GAPS } from './fixtures/helpCorpus'

type Row = { q: string; want: string; got: string; ok: boolean }

function run(): Row[] {
  return CORPUS.map(c => {
    // Small talk is checked first in the widget, so it is checked first here.
    if (smallTalk(c.q)) return { ...c, got: 'smalltalk', ok: c.want === 'none' }
    const r = searchAnswer(c.q, ALL_TOPICS)
    const got = r.kind === 'answer' ? r.topic.id
      : r.kind === 'profession' ? `prof:${r.prof.slug}`
      : r.kind === 'choice' ? `choice:${r.topics.map(t => t.id).join('|')}`
      : 'none'
    const ok = c.want === 'none' ? r.kind === 'none'
      : r.kind === 'answer' ? r.topic.id === c.want
      : r.kind === 'profession' ? c.want === 'find-expert'
      : r.kind === 'choice' ? r.topics.some(t => t.id === c.want)
      : false
    return { ...c, got, ok }
  })
}

const rows = run()
const answerable = rows.filter(r => r.want !== 'none')
const refusals = rows.filter(r => r.want === 'none')
const show = (rs: Row[]) => rs.filter(r => !r.ok).map(r => `  „${r.q}" → ${r.got} (wanted ${r.want})`).join('\n')

/* Thresholds are the MEASURED score at the time of writing, minus nothing.
 * They are a ratchet: if a change improves the score, raise them in the same
 * commit. A threshold set below the current score is a threshold that lets the
 * next regression through. */
const MIN_RECALL = 1.0
const MIN_REFUSAL = 1.0
/* Re-measured 2026-08-04 after the corpus grew 70 → 82 questions and six new
 * topics were added. 73/82 resolve to a single answer; the other 9 are genuine
 * near-ties (7-vs-6, 8-vs-8) and in EVERY one of them the correct answer is
 * among the options offered — which is what the 100% recall gate above proves.
 * A hedge that contains the right answer is honest behaviour, not a defect; a
 * confident wrong answer would be the defect, and that is what refusal guards.
 * This is a ratchet: if a change raises the score, raise this in the same
 * commit. */
const MIN_EXACT = 0.89

test('recall — every question we have an answer for reaches it', () => {
  const hit = answerable.filter(r => r.ok).length
  const score = hit / answerable.length
  assert.ok(score >= MIN_RECALL,
    `recall ${hit}/${answerable.length} = ${(score * 100).toFixed(0)}%, below ${MIN_RECALL * 100}%:\n${show(answerable)}`)
})

test('refusal — every question we CANNOT answer is refused, not guessed at', () => {
  const hit = refusals.filter(r => r.ok).length
  const score = hit / refusals.length
  assert.ok(score >= MIN_REFUSAL,
    `refusal ${hit}/${refusals.length} = ${(score * 100).toFixed(0)}%, below ${MIN_REFUSAL * 100}%.\n`
    + `A confident wrong answer is the expensive failure — this must not be traded for recall:\n${show(refusals)}`)
})

test('exactness — most questions get one answer, not a menu', () => {
  const exact = answerable.filter(r => r.ok && !r.got.startsWith('choice')).length
  const score = exact / answerable.length
  assert.ok(score >= MIN_EXACT,
    `only ${exact}/${answerable.length} = ${(score * 100).toFixed(0)}% resolve to a single answer — the matcher is hedging`)
})

test('the corpus is big enough and balanced enough to mean anything', () => {
  // A 10-question corpus can score 100% and prove nothing.
  assert.ok(CORPUS.length >= 60, `corpus is only ${CORPUS.length} questions`)
  assert.ok(refusals.length >= 6, 'too few unanswerable questions — refusal is unmeasured')
  const covered = new Set(answerable.map(r => r.want))
  const uncovered = ALL_TOPICS.filter(t => !covered.has(t.id)).map(t => t.id)
  assert.deepEqual(uncovered, [], `these topics have no test question: ${uncovered.join(', ')}`)
})

test('the known content gaps are still known', () => {
  // GAPS are questions with NO answer to reach — a content decision, not a
  // matcher bug. This test exists so the list cannot be quietly emptied: if an
  // answer gets written, delete the entry deliberately and move the question
  // into CORPUS.
  assert.ok(GAPS.length > 0, 'the gap list is empty — was it emptied or were the answers actually written?')
  for (const g of GAPS) {
    assert.ok(g.note.trim().length > 10, `gap „${g.q}" has no explanation of what is missing`)
  }
})

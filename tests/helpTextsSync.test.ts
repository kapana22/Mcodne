/*
 * THE SAME SENTENCE LIVES IN TWO FILES. This makes them agree.
 *
 * Run with:  npx tsx tests/helpTextsSync.test.ts
 *
 * WHY IT EXISTS — a deploy that changed nothing. Two FAQ answers were corrected
 * in lib/helpTopics.ts, the build went green, it shipped, and production still
 * served the old text. `resolveGroups` reads `map[key] || it.a`, and `map` is
 * seeded from lib/siteTextDefs — so the `default:` string THERE wins over the
 * `a:` string in lib/helpTopics, always, even with no admin edit and no database
 * row. Editing lib/helpTopics alone is a silent no-op, and nothing said so.
 *
 * Two rules, and the second matters as much as the first:
 *
 *   1. Every EDITABLE answer must be byte-identical in both files. Whichever one
 *      you edit, edit the other.
 *   2. Every LOCKED answer must have NO entry in siteTextDefs. Those seven
 *      interpolate a constant — CANCEL_CUTOFF_HOURS, COMMISSION_PCT,
 *      SUPPORT_EMAIL — or branch on PAYMENTS_LIVE. Giving one a `default:`
 *      string freezes today's value as text, and the day the constant moves the
 *      site starts advertising a refund window that no longer exists.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { ALL_TOPICS, HELP_LOCKED_ANSWER_IDS, helpFaqKey } from '../lib/helpTopics'
import { SITE_TEXT_DEFAULTS } from '../lib/siteTextDefs'
import { SUPPORT_EMAIL } from '../lib/supportEmails'

test('every editable FAQ answer is identical in helpTopics and siteTextDefs', () => {
  for (const t of ALL_TOPICS) {
    const locked = HELP_LOCKED_ANSWER_IDS.includes(t.id)
    for (const part of ['q', 'a'] as const) {
      // A locked ANSWER has no default (rule 2 below); its QUESTION is still
      // editable like any other.
      if (locked && part === 'a') continue
      const key = helpFaqKey(t.id, part)
      const def = SITE_TEXT_DEFAULTS[key]
      assert.notEqual(
        def, undefined,
        `${key} has no entry in lib/siteTextDefs — the admin cannot edit it, and ` +
        `/help + the widget will silently disagree with whatever you write there.`,
      )
      assert.equal(
        def, t[part],
        `${key} DRIFTED. lib/siteTextDefs wins at runtime, so lib/helpTopics is ` +
        `the copy nobody sees:\n  helpTopics:   ${t[part]}\n  siteTextDefs: ${def}`,
      )
    }
  }
})

test('answers that interpolate a constant are NOT editable', () => {
  for (const id of HELP_LOCKED_ANSWER_IDS) {
    const key = helpFaqKey(id, 'a')
    assert.equal(
      SITE_TEXT_DEFAULTS[key], undefined,
      `${key} is in HELP_LOCKED_ANSWER_IDS but siteTextDefs offers it for editing. ` +
      `Its text is built from a constant — an edited copy becomes a lie the day ` +
      `that constant changes, and nothing would report it.`,
    )
  }
})

test('an answer carrying the support address is locked', () => {
  // SUPPORT_EMAIL is TEMPORARY — lib/supportEmails says so, and it moves back to
  // hi@/privacy@/legal@ the day @mcodne.ge can receive mail. An answer that
  // reached siteTextDefs would freeze today's Gmail address into a database row
  // and keep printing it afterwards.
  //
  // Only this one substring is checked, deliberately. An earlier version of this
  // test also flagged any „N საათ" or „N%", and fired on „პასუხს 24–48 საათში
  // მიიღებ" — a hand-written service promise, not an interpolation. A test that
  // goes off on correct code gets switched off, so it checks only what it can
  // actually tell.
  for (const t of ALL_TOPICS) {
    if (!t.a.includes(SUPPORT_EMAIL)) continue
    assert.ok(
      HELP_LOCKED_ANSWER_IDS.includes(t.id),
      `„${t.id}" prints the support address but is not in HELP_LOCKED_ANSWER_IDS.`,
    )
    assert.equal(
      SITE_TEXT_DEFAULTS[helpFaqKey(t.id, 'a')], undefined,
      `„${t.id}" prints the support address and is offered for editing.`,
    )
  }
})

console.log('✓ helpTextsSync')

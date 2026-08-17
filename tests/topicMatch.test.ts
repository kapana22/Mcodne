/*
 * The matcher, against a corpus of phrases people actually type.
 *
 * ⚠️ THIS FILE IS THE POINT OF THE ALGORITHM. „The search feels better now" is
 * not a claim anybody can check, and the version this replaced shipped for
 * three days looking fine until the owner typed one ordinary sentence into it.
 * Every row below is a phrase in the shape a Georgian speaker writes it —
 * declined, padded with filler, sometimes reordered, sometimes mistyped — and
 * the expectation is the topic id a human would pick.
 *
 * ⚠️ A FAILURE HERE IS ONE OF TWO THINGS, and the difference matters:
 *   · the ALGORITHM missed something it had the words for → fix lib/topicMatch
 *   · the CATALOGUE has no such topic → fix lib/requestTopics, and no amount of
 *     scoring will help. §D exists to keep that distinction visible.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { searchAllTopics } from '../lib/requests'
import {
  tokenize, stemWord, wordScore, scoreCandidate, rankCandidates, MATCH_THRESHOLD,
} from '../lib/topicMatch'

/** The first topic id the matcher returns, or null. */
const top = (q: string): string | null => searchAllTopics(q)[0]?.topic.id ?? null
/** Every id it returns, for „is it in there at all" checks. */
const ids = (q: string): string[] => searchAllTopics(q).map(h => h.topic.id)

/* ═══════════ A. tokens ═══════════════════════════════════════════════════ */

test('§A the filler people write around a request is dropped', () => {
  // „I need a lawyer" is one piece of information and one word of packaging.
  // Left in, the packaging halves the coverage score of the real word.
  assert.deepEqual(tokenize('მჭირდება იურისტი'), ['იურისტ'])
  assert.deepEqual(tokenize('მინდა ინგლისურის მასწავლებელი'), ['ინგლისურ', 'მასწავლებელ'])
  assert.deepEqual(tokenize('გამარჯობა, ვეძებ ფსიქოლოგს'), ['ფსიქოლოგ'])
  // Punctuation is separation, not content.
  assert.deepEqual(tokenize('ლოგო, ბრენდბუქი!'), ['ლოგო', 'ბრენდბუქ'])
  // A query that is ONLY filler has nothing to score.
  assert.deepEqual(tokenize('გამარჯობა, მჭირდება ვინმე'), [])
})

test('§A declension is stripped per WORD, not per phrase', () => {
  // The old stemmer took one ending off the whole string, so only the LAST
  // word was ever normalised. „ქიმიის მასწავლებელი" left „ქიმიის" untouched.
  assert.equal(stemWord('ქიმიის'), 'ქიმი')
  assert.equal(stemWord('სასამართლოში'), 'სასამართლო')
  assert.equal(stemWord('ბავშვებისთვის'), 'ბავშვ')
  // …and short words are left whole: stripping „ი" off a four-letter word
  // usually removes the word.
  assert.equal(stemWord('ენა'), 'ენა')
  assert.equal(stemWord('ლოგო'), 'ლოგო')
})

/* ═══════════ B. how close two words are ═════════════════════════════════ */

test('§B the tiers are ordered, and the floors are real', () => {
  assert.equal(wordScore('ლოგო', 'ლოგო'), 1)
  assert.equal(wordScore('ინგლის', 'ინგლისურ'), 0.8, 'a prefix of 4+ letters is a near-certain match')
  // One typo on a long word is a slip. On a short one it is a different word.
  assert.equal(wordScore('კონტრაქტ', 'კონტრაკტ'), 0.55)
  assert.equal(wordScore('ხე', 'ხო'), 0, 'a two-letter typo would match half the catalogue')
  assert.equal(wordScore('და', 'დავ'), 0, 'a three-letter prefix is below the floor for the same reason')
  assert.equal(wordScore('ლოგო', 'ფიზიკ'), 0)
})

test('§B a query is scored by COVERAGE, so a long one is not punished for detail', () => {
  const c = { phrases: ['ინგლისური'] }
  const one = scoreCandidate(tokenize('ინგლისური'), c)
  const many = scoreCandidate(tokenize('ინგლისური მასწავლებელი ბავშვისთვის ონლაინ'), c)
  assert.ok(one > many, 'the exact one-word query must outrank the padded one')
  assert.ok(many > 0, '…but the padded one still matches — it is the same request')
})

test('§B a group heading lifts a topic but cannot carry one', () => {
  const withGroup = scoreCandidate(tokenize('ენები'), { phrases: ['გერმანული'], groupLabel: 'ენები' })
  const without = scoreCandidate(tokenize('ენები'), { phrases: ['გერმანული'] })
  assert.ok(withGroup > without, 'the heading no longer surfaces its members')
  assert.ok(without === 0)
  // A FULL heading match clears the bar on its own — „ენები" must return the
  // languages — but always ranks below a topic that matched a real word.
  assert.ok(withGroup >= MATCH_THRESHOLD, 'a full heading match no longer surfaces its group')
  const realMatch = scoreCandidate(tokenize('გერმანული'), { phrases: ['გერმანული'], groupLabel: 'ენები' })
  assert.ok(realMatch > withGroup, 'a heading match outranks a real topic match')
})

/* ═══════════ C. the corpus — real phrases, real answers ═════════════════ */

test('§C the phrases people actually type find the right topic', () => {
  const CORPUS: [phrase: string, expected: string][] = [
    // Bare, declined, and padded forms of the same need.
    ['ინგლისური', 'english'],
    ['ინგლისურის მასწავლებელი', 'english'],
    ['მინდა ინგლისური ვისწავლო', 'english'],
    ['ქიმიის რეპეტიტორი', 'chemistry'],
    ['ქიმიაში მჭირდება დახმარება', 'chemistry'],

    // ⚠️ THE PROFESSION, NOT THE TASK. People search for who they want, and
    // the catalogue is written in tasks. These pass because the tasks carry
    // profession synonyms — see `alt` in lib/requestTopics.
    ['იურისტი', 'contract'],
    ['მჭირდება იურისტი', 'contract'],
    ['ადვოკატი', 'contract'],
    ['ფსიქოლოგი', 'psy-individual'],
    ['გამარჯობა, ვეძებ ფსიქოლოგს', 'psy-individual'],

    // ⚠️ WORD ORDER. „დავა მაქვს სასამართლოში" is the sentence the old matcher
    // could not answer at all: the label's two words are not a substring of the
    // query and vice versa.
    ['სასამართლო დავა', 'court'],
    ['დავა მაქვს სასამართლოში', 'court'],

    // ⚠️ A TYPO, AND A LOANWORD. „კონტრაკტი" is what half the country writes
    // for a contract; the catalogue only knew „ხელშეკრულება". Found by running
    // the matcher on real phrases, not by reading it.
    ['კონტრაქტი', 'contract'],
    ['კონტრაკტი', 'contract'],

    // Single concrete nouns that are their own topic.
    ['ლოგო', 'logo'],
    ['ხელშეკრულება', 'contract'],
    ['ბუღალტერია', 'accounting'],
  ]

  const failures: string[] = []
  for (const [phrase, expected] of CORPUS) {
    const got = ids(phrase)
    if (!got.includes(expected)) failures.push(`  „${phrase}" → ${got.slice(0, 3).join(', ') || 'NOTHING'} (wanted ${expected})`)
  }
  assert.equal(failures.length, 0, `the matcher lost phrases it used to answer:\n${failures.join('\n')}`)
})

test('§C the best answer comes FIRST, not somewhere in the list', () => {
  // Ranking is the half the old matcher did not have: it returned catalogue
  // order, so the right answer could sit under four wrong ones.
  assert.equal(top('ინგლისური'), 'english')
  assert.equal(top('ლოგო'), 'logo')
  assert.equal(top('ხელშეკრულება'), 'contract')

  // ⚠️ THE REGRESSION THAT PROVED THE GROUP WEIGHT WRONG. „ლოგო მჭირდება ჩემი
  // ბიზნესისთვის" returned ბიზნესგეგმა FIRST, because „ბიზნეს" matched the
  // heading „ბიზნესი და სტრატეგია" exactly and the heading was being scored as
  // content. The least specific thing on the page was winning.
  assert.equal(top('ლოგო მჭირდება ჩემი ბიზნესისთვის'), 'logo',
    'a group heading is outranking a topic that matched the word the person typed')
  // …and the heading still surfaces its own group when that IS the query.
  assert.equal(top('ენები'), 'english')
})

test('§C nonsense returns nothing rather than a shrug of a list', () => {
  // A matcher that always answers is a matcher whose answers mean nothing —
  // and the wizard's free-text path (app/request/_stepWhat) depends on „no
  // hits" being a real signal, because that is what offers to carry the
  // person's own sentence forward instead.
  for (const q of ['zzzzzz', 'ъъъъ', '12345', 'ააააააა']) {
    assert.deepEqual(searchAllTopics(q), [], `„${q}" matched something`)
  }
})

/* ═══════════ D. the gap an algorithm cannot close ═══════════════════════ */

test('§D the home-services gap is CLOSED, and the trade names are what find it', () => {
  // ⚠️ THIS TEST USED TO ASSERT THE OPPOSITE, and the flip is the point.
  //
  // Until 2026-08-17 the catalogue had 23 groups and not one covered everyday
  // home services — no cleaning, no plumber, no electrician, no moving. It is
  // the single biggest category on every comparable platform (Bark leads its
  // home page with House Cleaning). The old test pinned that absence so the day
  // somebody closed the gap it would fail loudly rather than let a stale comment
  // describe a catalogue that had moved on. The gap is now closed by the eight
  // `kinds: S` groups in lib/requestTopics, so the assertion inverts.
  //
  // ⚠️ IT SEARCHES BY THE TRADE'S NAME, NOT THE JOB'S. Nobody types „ონკანის
  // შეკეთება" — they type „სანტექნიკოსი", the person, because a person is what
  // they are looking for. Those words live in each topic's `alt`, and this is
  // what stops somebody „tidying" them away as duplicates of the label.
  const TRADES: [string, string][] = [
    ['დალაგება',       'clean-flat'],
    ['დამლაგებელი',    'clean-flat'],
    ['სანტექნიკოსი',   'plumb-leak'],
    ['ელექტრიკოსი',    'elec-wiring'],
    ['გადაზიდვა',      'move-flat'],
    ['ავეჯის აწყობა',  'rep-assembly'],
    ['კონდიციონერი',   'app-ac'],
  ]
  for (const [query, expectedId] of TRADES) {
    const hits = searchAllTopics(query)
    assert.ok(hits.length > 0, `„${query}" finds nothing — the trade name left the vocabulary`)
    assert.equal(hits[0].topic.id, expectedId,
      `„${query}" ranked ${hits[0].topic.id} first, expected ${expectedId}`)
  }

  // A whole sentence still has to land, because that is how people type — the
  // matcher's own reason for existing.
  const sentence = searchAllTopics('მჭირდება სახლის დალაგება')
  assert.ok(sentence.length > 0, 'the sentence form stopped matching')
  assert.equal(sentence[0].topic.id, 'clean-flat')

  // …and the free-text escape hatch must still work for what is STILL missing,
  // or the wizard loses its answer for the next gap. Nothing in the catalogue
  // teaches horses.
  assert.equal(searchAllTopics('მჭირდება ცხენით ჯირითის მასწავლებელი').length, 0)
})

/* ═══════════ E. the ranker is stable and bounded ════════════════════════ */

test('§E equal scores keep the catalogue’s own order, and the limit holds', () => {
  const items = ['ალფა', 'ბეტა', 'გამა'].map(label => ({ label }))
  const ranked = rankCandidates('ალფა', items, i => ({ phrases: [i.label] }))
  assert.equal(ranked[0].item.label, 'ალფა')
  // A limit that is not respected turns one keystroke into a page.
  assert.ok(rankCandidates('ა', items, i => ({ phrases: [i.label] }), 2).length <= 2)
  // An empty or all-filler query is not a search.
  assert.deepEqual(rankCandidates('', items, i => ({ phrases: [i.label] })), [])
  assert.deepEqual(rankCandidates('მჭირდება', items, i => ({ phrases: [i.label] })), [])
})

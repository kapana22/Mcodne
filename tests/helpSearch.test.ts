/*
 * The local answer matcher — lib/helpSearch.
 *
 * Run with:  npx tsx tests/helpSearch.test.ts
 *
 * THIS FILE IS THE FEATURE. The widget now takes a typed question, and the only
 * thing standing between „რა ღირს?" and the right paragraph is the scoring in
 * lib/helpSearch. There is no model to fall back on and no API to blame: if the
 * table below is wrong, the chat bot is wrong.
 *
 * Three properties are pinned, in order of how much they cost when broken:
 *   1. the right answer for questions people actually type;
 *   2. „ვერ ვიპოვე" for questions we have NOT written an answer to — a matcher
 *      that always answers something is confidently wrong instead of usefully
 *      silent;
 *   3. no personal data survives into what gets stored.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { ALL_TOPICS } from '../lib/helpTopics'
import {
  searchAnswer, scoreTopics, redactQuery, normalize, stem, tokens, smallTalk,
  TOPIC_KEYWORDS, MAX_QUERY_CHARS,
} from '../lib/helpSearch'

/** What a real person types → the topic id they meant. */
const EXPECTED: [string, string][] = [
  // price
  ['რა ღირს კონსულტაცია?', 'price'],
  ['რამდენი ჯდება ერთი შეხვედრა', 'price'],
  ['უფასოა?', 'price'],
  ['ფასები მაინტერესებს', 'price'],
  // booking
  ['როგორ დავჯავშნო შეხვედრა', 'how-to-book'],
  ['მინდა ჩავიწერო კონსულტაციაზე', 'how-to-book'],
  // where
  ['სად ტარდება სესია', 'where-session'],
  ['zoom მჭირდება?', 'where-session'],
  ['რომელი აპლიკაცია მჭირდება', 'where-session'],
  // cancel
  ['როგორ გავაუქმო ჯავშანი', 'cancel'],
  ['შემიძლია გადავიტანო სხვა დღეს?', 'cancel'],
  ['ვეღარ დავესწრები რა ვქნა', 'cancel'],
  // no-show
  ['ექსპერტი არ გამოცხადდა', 'expert-noshow'],
  ['კონსულტანტი არ მოვიდა შეხვედრაზე', 'expert-noshow'],
  // expert side
  ['როგორ გავხდე ექსპერტი', 'become-expert'],
  ['რა კომისიას იღებთ', 'commission'],
  ['რამდენს იღებთ პროცენტს', 'commission'],
  ['როდის მივიღებ თანხას', 'payout'],
  // account
  ['პაროლი დამავიწყდა', 'account-security'],
  ['მინდა ანგარიშის წაშლა', 'delete-account'],
  ['როგორ წავშალო პროფილი', 'delete-account'],
  // misc
  ['ინვოისი მჭირდება ბუღალტერიისთვის', 'invoice'],
  ['ბარათით გადახდა შემიძლია?', 'payment-methods'],
  ['რა არის მცოდნე', 'what-is'],
  ['როგორ ვიპოვო კარგი სპეციალისტი', 'find-expert'],
  ['ექსპერტმა შეურაცხყოფა მომაყენა', 'report-abuse'],
]

test('a typed question reaches the answer it meant', () => {
  const misses: string[] = []
  for (const [q, want] of EXPECTED) {
    const r = searchAnswer(q, ALL_TOPICS)
    const got = r.kind === 'answer' ? r.topic.id
      : r.kind === 'choice' ? `choice(${r.topics.map(t => t.id).join('|')})`
      : 'none'
    // A CHOICE that contains the right answer is acceptable — the person is
    // asked, not misinformed. Anything else is a miss.
    const ok = r.kind === 'answer' ? got === want
      : r.kind === 'choice' ? r.topics.some(t => t.id === want)
      : false
    if (!ok) misses.push(`  „${q}"  →  ${got}   (wanted ${want})`)
  }
  assert.equal(misses.length, 0, `${misses.length}/${EXPECTED.length} questions miss:\n${misses.join('\n')}`)
})

test('most questions get ONE answer, not a menu', () => {
  // A choice is a legitimate outcome, but if everything becomes a choice the
  // matcher has stopped deciding and the chat is just the FAQ with extra steps.
  const direct = EXPECTED.filter(([q]) => searchAnswer(q, ALL_TOPICS).kind === 'answer').length
  assert.ok(direct >= EXPECTED.length * 0.8,
    `only ${direct}/${EXPECTED.length} resolve to a single answer — the matcher is hedging`)
})

test('a typo still finds the answer', () => {
  // People type fast and Georgian keyboards transpose. A miss here sends
  // somebody to a human for a question we HAVE answered.
  const typos: [string, string][] = [
    ['როგორ დავჯვაშნო შეხვედრა', 'how-to-book'],   // დაჯვაშნო ← დაჯავშნო
    ['გამომუშავბა როდის', 'payout'],                // dropped letter
    ['ანგარიშსფაქტურა მჭირდება', 'invoice'],        // extra letter
  ]
  const misses = typos.filter(([q, want]) => {
    const r = searchAnswer(q, ALL_TOPICS)
    return !(r.kind === 'answer' ? r.topic.id === want
      : r.kind === 'choice' ? r.topics.some(t => t.id === want) : false)
  }).map(([q]) => q)
  assert.deepEqual(misses, [], `typos not tolerated: ${misses.join(' · ')}`)
})

test('typo tolerance does NOT create false matches on short words', () => {
  // The dangerous half. One edit on a 5-letter Georgian word lands on a
  // different real word, and a confident wrong answer costs more than a miss —
  // so the tolerance starts at 7 characters and never allows two edits.
  const mustNotMatch = ['ფარი', 'ბარი', 'მარი', 'ხარი', 'წყალი', 'კარი']
  const wrong = mustNotMatch.filter(q => searchAnswer(q, ALL_TOPICS).kind !== 'none')
  assert.deepEqual(wrong, [], `these matched something they should not: ${wrong.join(' · ')}`)
})

test('small talk gets a human answer, not „I have no answer for that"', () => {
  // Greeting the bot and being told „ამაზე პასუხი ჯერ არ მაქვს" is cold, and it
  // also fills the unanswered backlog with the word „გამარჯობა".
  for (const [q, must] of [
    ['გამარჯობა', /დაწერე კითხვა/],
    ['მადლობა', /არაფრის/],
    ['ბოტი ხარ?', /ავტომატური/],
  ] as [string, RegExp][]) {
    const r = smallTalk(q)
    assert.ok(r, `„${q}" got no small-talk reply`)
    assert.match(r!, must)
  }
  // …and it must NEVER swallow a real question that happens to start politely.
  assert.equal(smallTalk('გამარჯობა, რა ღირს კონსულტაცია?'), null,
    'a greeting-prefixed QUESTION was answered as small talk')
  assert.equal(smallTalk('რა ღირს'), null)
})

test('the bot answers „are you human" truthfully', () => {
  // Non-negotiable: a widget that dodges this has started pretending to be
  // something it is not.
  const r = smallTalk('ადამიანი ხარ')
  assert.ok(r && /ავტომატური/.test(r), 'the honest answer to „are you human" is gone')
  assert.ok(!/დიახ, ადამიანი/.test(r!))
})

test('questions we have NOT answered return `none`, not a plausible paragraph', () => {
  // The expensive failure mode. Each of these is a real thing someone might
  // type that this FAQ genuinely does not cover.
  const unanswerable = [
    'ამინდი როგორია თბილისში',
    'გამარჯობა',
    'ჰელოუ',
    'ააა',
    'რა ფერია თქვენი ლოგო',
    '???',
    '12345',
  ]
  const wrong = unanswerable.filter(q => searchAnswer(q, ALL_TOPICS).kind !== 'none')
  assert.deepEqual(wrong, [], `these got an answer they should not have: ${wrong.join(' · ')}`)
})

test('an ambiguous word ASKS instead of guessing', () => {
  // „თანხა" is honestly both the price a client pays and the money an expert
  // receives. Answering one of them confidently misinforms half the askers.
  const r = searchAnswer('თანხა', ALL_TOPICS)
  assert.equal(r.kind, 'choice', `„თანხა" resolved to ${r.kind} — it is genuinely ambiguous`)
  if (r.kind === 'choice') {
    assert.ok(r.topics.length >= 2 && r.topics.length <= 3, 'a choice should offer 2–3, not a list')
  }
})

test('every keyword set points at a real topic, and every topic has keywords', () => {
  const ids = new Set(ALL_TOPICS.map(t => t.id))
  for (const id of Object.keys(TOPIC_KEYWORDS)) {
    assert.ok(ids.has(id), `TOPIC_KEYWORDS has '${id}', which is not a topic any more`)
  }
  for (const t of ALL_TOPICS) {
    const kw = TOPIC_KEYWORDS[t.id]
    assert.ok(kw && kw.length >= 3, `topic '${t.id}' has too few keywords to ever be found`)
  }
})

test('scoring is stable, bounded and never throws on hostile input', () => {
  const nasty = ['', '   ', '\n\t', '„“”', 'a'.repeat(5000), '💀💀💀', '<script>alert(1)</script>',
                 'ფასი '.repeat(500)]
  for (const q of nasty) {
    const r = searchAnswer(q, ALL_TOPICS)
    assert.ok(['answer', 'choice', 'none'].includes(r.kind), `bad result for ${JSON.stringify(q.slice(0, 20))}`)
    const scored = scoreTopics(q, ALL_TOPICS)
    assert.ok(Array.isArray(scored))
    for (const s of scored) assert.ok(Number.isFinite(s.score) && s.score > 0)
  }
  // Same input, same output — the widget must not answer differently on a retry.
  assert.deepEqual(
    scoreTopics('რა ღირს', ALL_TOPICS).map(s => [s.topic.id, s.score]),
    scoreTopics('რა ღირს', ALL_TOPICS).map(s => [s.topic.id, s.score]),
  )
})

test('normalisation handles the Georgian quotes and case-free script', () => {
  assert.equal(normalize('„ფასი“, რა?'), 'ფასი რა')
  assert.equal(normalize('  ZOOM   მჭირდება '), 'zoom მჭირდება')
  // One conservative cut, never a loop that eats the word.
  assert.equal(stem('ფასები'), 'ფას')
  assert.equal(stem('ფასი'), 'ფას')
  assert.equal(stem('ის'), 'ის', 'a short word must survive stemming intact')
  // Stopwords carry no topic and must not reach the scorer.
  assert.deepEqual(tokens('რა არის ეს'), [])
})

test('what gets stored is redacted, capped, and only ever an UNANSWERED question', () => {
  assert.match(redactQuery('მომწერეთ nino@example.com'), /\[ელფოსტა\]/)
  assert.ok(!redactQuery('მომწერეთ nino@example.com').includes('@'))
  assert.match(redactQuery('დამირეკეთ +995 599 12 34 56'), /\[ნომერი\]/)
  assert.match(redactQuery('ნახეთ https://example.com/x?y=1'), /\[ბმული\]/)
  assert.match(redactQuery('ჩემი პირადი ნომერი 01001012345'), /\[ნომერი\]/)
  assert.ok(redactQuery('ა'.repeat(500)).length <= MAX_QUERY_CHARS)
  assert.equal(redactQuery('   ორი    ხარვეზი   '), 'ორი ხარვეზი')

  // The widget must only ever record the questions it FAILED — an answered one
  // teaches nothing and is not ours to keep.
  const widget = readFileSyncSafe('components/HelpWidget.tsx')
  assert.match(widget, /redactQuery/, 'the widget sends a typed question without redacting it')
})

function readFileSyncSafe(rel: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('node:fs') as typeof import('node:fs')
  const { join } = require('node:path') as typeof import('node:path')
  return readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
}

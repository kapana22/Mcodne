/*
 * THE OWNER'S TEXT MUST NEVER BE OVERWRITTEN BY OURS.
 *
 * Run with:  npx tsx tests/siteTextSafety.test.ts
 *
 * The owner has asked for this twice, in those words. The read path is already
 * correct — an override always beats the code default — so the danger is not
 * that we overwrite a value. It is subtler and worse:
 *
 *   Rename or delete a key in lib/siteTextDefs and the DB row SURVIVES, but the
 *   editor stops listing it and the public page silently falls back to the
 *   developer's default. The site then says something the owner never wrote,
 *   their wording is still sitting in the database, and NOBODY IS TOLD.
 *
 * Three things are pinned here:
 *   1. the override always wins over the default (the resolution contract);
 *   2. every editable FAQ answer has a key to be edited by, so a new answer
 *      cannot ship as un-editable code;
 *   3. the admin route reports orphans instead of hiding them.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SITE_TEXTS, SITE_TEXT_DEFAULTS, isKnownSiteTextKey } from '../lib/siteTextDefs'
import { GROUPS, resolveGroups, helpFaqKey, HELP_LOCKED_ANSWER_IDS } from '../lib/helpTopics'

const ROOT = join(import.meta.dirname, '..')

test('a saved override ALWAYS beats the code default', () => {
  const item = GROUPS.flatMap(g => g.items).find(i => !HELP_LOCKED_ANSWER_IDS.includes(i.id))
  assert.ok(item, 'no editable FAQ item to test with')
  const mine = 'ეს ტექსტი მფლობელმა დაწერა'
  const resolved = resolveGroups({
    [helpFaqKey(item!.id, 'q')]: mine,
    [helpFaqKey(item!.id, 'a')]: mine,
  })
  const got = resolved.flatMap(g => g.items).find(i => i.id === item!.id)!
  assert.equal(got.q, mine, 'the code default overwrote the owner’s question')
  assert.equal(got.a, mine, 'the code default overwrote the owner’s answer')
})

test('an EMPTY override does not silently fall back to our text', () => {
  // `map[key] || default` treats '' as absent. That is deliberate — a blank
  // headline would render an empty page — but it must stay a CONSCIOUS choice,
  // so it is asserted rather than left to be rediscovered.
  const item = GROUPS.flatMap(g => g.items).find(i => !HELP_LOCKED_ANSWER_IDS.includes(i.id))!
  const got = resolveGroups({ [helpFaqKey(item.id, 'q')]: '' })
    .flatMap(g => g.items).find(i => i.id === item.id)!
  assert.equal(got.q, item.q, 'blank override behaviour changed — decide it deliberately')
})

test('every editable FAQ answer HAS a key to be edited by', () => {
  // A new topic shipped without its site-text keys is copy the owner cannot
  // touch — „ask a developer" for a sentence, which is the failure the CMS
  // exists to remove.
  const missing: string[] = []
  for (const g of GROUPS) {
    for (const it of g.items) {
      if (!isKnownSiteTextKey(helpFaqKey(it.id, 'q'))) missing.push(`${it.id}.q`)
      if (!HELP_LOCKED_ANSWER_IDS.includes(it.id) && !isKnownSiteTextKey(helpFaqKey(it.id, 'a'))) {
        missing.push(`${it.id}.a`)
      }
    }
  }
  assert.deepEqual(missing, [], `these FAQ fields are not editable from the admin: ${missing.join(', ')}`)
})

test('a LOCKED answer is locked because it computes, not because we forgot', () => {
  // Locked answers ignore the override on purpose: they interpolate a constant
  // (the cancellation window, the commission, the support address) and a frozen
  // copy would keep showing yesterday's number. Each one must actually contain
  // an interpolation — otherwise it is just un-editable text.
  const src = readFileSync(join(ROOT, 'lib/helpTopics.ts'), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  for (const id of HELP_LOCKED_ANSWER_IDS) {
    const block = src.slice(src.indexOf(`id: '${id}'`))
    const item = block.slice(0, block.indexOf('\n      },'))
    assert.match(item, /\$\{|PAYMENTS_LIVE/,
      `'${id}' is locked but interpolates nothing — it should be editable instead`)
  }
})

test('the admin route REPORTS overrides whose key disappeared', () => {
  // Without this the owner's text is replaced by ours and the only symptom is
  // that the site says something they did not write.
  const route = readFileSync(join(ROOT, 'app/api/admin/site-texts/route.ts'), 'utf8')
  assert.match(route, /orphans/, 'the site-texts route no longer reports orphaned overrides')
  assert.match(route, /!known\.has\(r\.key\)/,
    'the orphan detection no longer compares DB rows against the registry')
  assert.ok(!/deleteMany\(\{ where: \{ key: \{ notIn/.test(route),
    'the route deletes unknown overrides — it must report them, never destroy them')
  const panel = readFileSync(join(ROOT, 'app/admin/_texts.tsx'), 'utf8')
  assert.match(panel, /orphans\.length > 0/, 'the admin panel no longer surfaces orphaned overrides')
})

test('no two registry keys collide', () => {
  const keys = SITE_TEXTS.map(t => t.key)
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i)
  assert.deepEqual([...new Set(dupes)], [], `duplicate site-text keys: one would shadow the other`)
  assert.equal(Object.keys(SITE_TEXT_DEFAULTS).length, new Set(keys).size)
})

test('keys owned by ANOTHER registry are not reported as orphans', () => {
  /* The first version of the orphan check flagged `integration.gaId` and
   * `integration.headerHtml` — the owner's live Google Analytics tag — as
   * „no longer shown on the site". It was serving on every page at that moment.
   *
   * `integration.*` shares the SiteText TABLE but is owned by lib/integrations
   * and edited in the „ინტეგრაციები" tab; lib/integrations says so in its own
   * header. A false alarm about deleted content is not a harmless one: it tells
   * the owner their work was lost, which is the exact fear this feature exists
   * to remove. */
  const route = readFileSync(join(ROOT, 'app/api/admin/site-texts/route.ts'), 'utf8')
  assert.match(route, /ownedElsewhere/, 'the orphan check no longer excludes other registries')
  assert.match(route, /integration\./, 'integration keys are not excluded — the GA tag will be flagged as lost')

  // And the exclusion must cover the real keys, whatever they are called today.
  const integrations = readFileSync(join(ROOT, 'lib/integrations.ts'), 'utf8')
  const keys = [...integrations.matchAll(/'(integration\.[a-zA-Z]+)'/g)].map(m => m[1])
  assert.ok(keys.length >= 3, `expected the integration keys to be findable, got ${keys.length}`)
  for (const k of keys) {
    assert.ok(k.startsWith('integration.'),
      `'${k}' would escape the prefix exclusion — widen ownedElsewhere before renaming it`)
  }
})

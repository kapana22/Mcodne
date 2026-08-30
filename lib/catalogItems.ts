// THE CATALOGUE'S URL VOCABULARY — what `?trade=`, `?city=` and `?q=` mean.
//
// ⚠️ THIS FILE USED TO MERGE TWO ROSTERS (2026-08-24). It held `CatalogItem` —
// one PERSON carrying a `consult` row (TutorProfile) and a `work` row
// (ServiceProfile), keyed by user id so somebody who sold both appeared once —
// plus the `kinds` axis, the per-half sort fallbacks and the `?type=` parser.
//
// The consultation product was removed and its people migrated into the one
// provider table, so the merge has nothing to merge: a row IS a person. What
// stayed is the part that was never about the split — parsing the address, and
// deciding what a typed query matches.

import { LIVE_OFFER_GROUPS } from './serviceProfile'
import { CITIES } from './requestTopics'
import type { ProviderRow } from '@/app/experts/_providers'

/** `?trade=plumbing,plumb-leak` — group ids and topic ids in ONE list, and
 *  anything the vocabulary does not know is dropped rather than searched for. */
export function parseTrades(raw: string | string[] | null | undefined): string[] {
  const known = new Set<string>()
  for (const g of LIVE_OFFER_GROUPS) {
    known.add(g.id)
    for (const t of g.topics) known.add(t.id)
  }
  return csv(raw).filter(v => known.has(v))
}

export function parseCities(raw: string | string[] | null | undefined): string[] {
  const known = new Set(CITIES.map(c => c.id as string))
  return csv(raw).filter(v => known.has(v))
}

const csv = (raw: string | string[] | null | undefined): string[] => {
  const s = Array.isArray(raw) ? raw.join(',') : (raw ?? '')
  return [...new Set(s.split(',').map(x => x.trim()).filter(Boolean))]
}

/** The topic ids a `?trade=` selection covers — a group expands to its topics,
 *  a topic stands for itself. Null = nothing ticked, i.e. no narrowing. */
export function tradeTopicIds(trades: readonly string[]): Set<string> | null {
  if (trades.length === 0) return null
  const out = new Set<string>()
  for (const v of trades) {
    const group = LIVE_OFFER_GROUPS.find(g => g.id === v)
    if (group) { group.topics.forEach(t => out.add(t.id)); continue }
    out.add(v)
  }
  return out
}

/**
 * Does this person match what somebody typed?
 *
 * ⚠️ OVER THE WORDS ON THEIR OWN CARD, and that is the whole rule: name,
 * headline, the sentence, the services they list and the professions they claim.
 * A match on something the card does not show reads as a wrong result even when
 * it is technically right.
 *
 * Case-folded substring, no ranking. The Postgres trigram search this replaced
 * ranked by Georgian declension similarity and cost a round trip per keystroke;
 * it was worth it for a table the browser could not hold, and the roster is now
 * one query and tens of rows.
 */
export function matchesQuery(m: ProviderRow, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  const hay = [m.name, m.headline ?? '', m.about ?? '', ...m.services, ...m.professions]
    .join(' ')
    .toLowerCase()
  return hay.includes(needle)
}

/** ⚠️ NO PRICE SORTS LAST IN BOTH DIRECTIONS. Somebody who quotes per job has
 *  made no claim about price; sorting them as ₾0 would put them at the top of
 *  „cheapest first" as if they were the cheapest, which is an invented number. */
export const byPrice = (dir: 1 | -1) => (a: ProviderRow, b: ProviderRow): number => {
  if (a.priceValue === null && b.priceValue === null) return 0
  if (a.priceValue === null) return 1
  if (b.priceValue === null) return -1
  return (a.priceValue - b.priceValue) * dir
}

export const tradeLabel = (id: string): string => {
  for (const g of LIVE_OFFER_GROUPS) {
    if (g.id === id) return g.label
    const t = g.topics.find(x => x.id === id)
    if (t) return t.label
  }
  return id
}

export const cityLabelOf = (id: string): string => CITIES.find(c => c.id === id)?.label ?? id

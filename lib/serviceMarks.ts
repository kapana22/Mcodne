// THE TRADES ROW — six marks, and one place that decides them.
//
// ⚠️ WHY SIX **TOPICS** AND NOT FOUR **GROUPS** (2026-08-18). Owner, pointing
// at a competitor's icon row: „გაფართოვდეს, 6 რომ იყოს მაგალითად." Four groups
// are open, so a row of six groups would have to draw two we cannot staff —
// exactly the promise `LIVE_SERVICE_GROUP_IDS` exists to stop making.
//
// Topics also say more. `app/services` already argues this about its cards:
// „6 სერვისი" tells nobody whether their job is in there; „ბოილერი" does. Six
// named jobs are six chances to be recognised; four category nouns are four
// chances to be almost right.
//
// ⚠️ PURE `.ts`, AND THAT IS NOT AN ACCIDENT. This file names an icon by KEY
// and never holds one. The first version stored the `CatIcon` elements
// directly, which made it a `.tsx` — and the test that pins the row could not
// import it at all, because node's runner compiles JSX to `React.createElement`
// with no React in scope. A rule nothing can execute is a comment. The key is
// also the stronger assertion: „two tiles name the same mark" is exact, where
// comparing two rendered SVGs is a guess about what a reader sees.

import { SERVICE_TOPICS, LIVE_SERVICE_TOPICS } from './serviceProfile'

/** The `CatIcon` keys this row may use. Typed as a union rather than `string`
 *  so a typo is a compile error and not a blank tile. */
export type TradeIconKey =
  | 'plumbing' | 'electrical' | 'cleaning' | 'appliances' | 'drain' | 'climate'

export type TradeMark = {
  /** A service topic id from lib/requestTopics — the same id a request carries. */
  topic: string
  icon: TradeIconKey
}

/**
 * Declared order — it is the order they are drawn in. Water first, because a
 * leak is the job people arrive with; the two plumbing and two appliance
 * entries are split apart so the row does not read as three pairs.
 *
 * ⚠️ EVERY MARK IS DIFFERENT, and that is a constraint on this list rather
 * than a nice-to-have. Six tiles sit in one row where a repeated drawing is
 * unmissable — see components/Icon → CatIcon, whose own header records fourteen
 * spheres sharing seven drawings, found only by counting them.
 */
const ROW: TradeMark[] = [
  { topic: 'plumb-leak', icon: 'plumbing' },
  { topic: 'clean-flat', icon: 'cleaning' },
  { topic: 'elec-socket', icon: 'electrical' },
  { topic: 'app-washer', icon: 'appliances' },
  { topic: 'plumb-drain', icon: 'drain' },
  { topic: 'app-ac', icon: 'climate' },
]

const LIVE_IDS = new Set(LIVE_SERVICE_TOPICS.map(t => t.id))

/**
 * The row, with anything that has left the OPEN vocabulary dropped.
 *
 * ⚠️ FILTERED, NEVER THROWN. This is imported by the home page; a throw at
 * module load would take the site's front page down because somebody renamed a
 * trade. A missing tile costs one tile — and the test below turns that silent
 * cost into a loud one, which is the right division of labour (the same one
 * SUGGESTED_TOPICS states).
 *
 * Checked against the LIVE topics rather than all of them: a tile is a link
 * into the intake, so a trade still in the catalogue but closed for launch must
 * not be drawn on the home page — it would be the site's most prominent
 * promise of work nobody can do.
 */
export const HOME_TRADES: TradeMark[] = ROW.filter(m => LIVE_IDS.has(m.topic))

/** Every id the row names, live or not — for the test that pins the list. */
export const HOME_TRADE_IDS: string[] = ROW.map(m => m.topic)

/** Is this id a real service topic at all? Lets the test tell „closed" (a
 *  decision) apart from „renamed" (a bug). */
export function isKnownServiceTopic(id: string): boolean {
  return SERVICE_TOPICS.some(t => t.id === id)
}

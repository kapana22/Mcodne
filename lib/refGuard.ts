// Enumeration guard for the public reference.
//
// WHY. `MC-` + 5 characters of a 32-symbol alphabet is 32^5 = 33 554 432 codes
// — 25 bits. That is deliberately short because an operator reads it down a
// phone, and it is deliberately the ONLY credential on the client surfaces:
// lib/requests → canOpenRequestForm answers „anyone, no account", because most
// clients have none. Possession of the reference opens /request/<ref>, which
// after acceptance carries a phone number, and POSTs to ./accept, which spends
// the client's one choice.
//
// 25 bits is fine against a guess and thin against a sweep: at a modest 20
// requests a second, one percent of the space — enough to surface a few hundred
// live requests — costs about four and a half hours. Nothing was counting.
//
// THE FIX IS NOT A LONGER REFERENCE. Lengthening it would break the one thing
// the shortness buys (a code a person can read aloud and retype) and would do
// nothing for the references already minted. What separates a sweep from a
// client is not speed, it is MISSES: somebody holding a reference asks for that
// reference, over and over, and is right every time. A sweep is wrong almost
// every time.
//
// So the budget is spent on WRONG ANSWERS ONLY. A real holder never touches it
// however often they reload; a sweep burns it within the first second and is
// refused for the rest of the hour — four hours of work becomes four years per
// address, and no legitimate page is ever slowed by a single millisecond.
//
// In memory and per instance, like lib/rateLimit and for the same reason: one
// Railway instance today, and a limiter that resets on deploy still costs a
// sweep everything it had accumulated. Redis when there are two.

import { clientIp } from './rateLimit'

/** A `Request`, or `headers()` in a server component — both answer `.get`. */
type HasHeaders = { headers: { get(name: string): string | null } }

/** Wrong references one address may ask for in a window before it is refused. */
export const MISS_BUDGET = 20
const WINDOW_MS = 60 * 60 * 1000

type Miss = { count: number; resetAt: number }
const MISSES = new Map<string, Miss>()

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [k, v] of MISSES.entries()) if (v.resetAt < now) MISSES.delete(k)
  }, 5 * 60 * 1000).unref?.()
}

/**
 * Has this address already burned its budget of wrong references?
 *
 * Call BEFORE the lookup, and refuse with the SAME 404 the caller would have
 * got anyway. A distinguishable „rate limited" answer would tell the sweeper
 * their guess was merely throttled rather than wrong, which is half of what
 * they came for — so a refused address cannot tell a spent budget from an empty
 * space.
 */
export function refBudgetSpent(req: HasHeaders): boolean {
  const cur = MISSES.get(clientIp(req))
  return !!cur && cur.resetAt > Date.now() && cur.count >= MISS_BUDGET
}

/**
 * Record that this address asked for a reference that does not exist.
 *
 * Every miss counts the same: a malformed segment, an unknown code, an offer
 * that belongs to some other request. All three say „you are guessing".
 */
export function noteRefMiss(req: HasHeaders): void {
  const ip = clientIp(req)
  const now = Date.now()
  const cur = MISSES.get(ip)
  if (!cur || cur.resetAt < now) MISSES.set(ip, { count: 1, resetAt: now + WINDOW_MS })
  else cur.count++
}

/** Test seam — the suite drives the budget without waiting out a window. */
export function __resetRefGuard(): void {
  MISSES.clear()
}

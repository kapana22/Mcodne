// The only place a progressive-disclosure flag is defined. Flipping one here is
// the whole change; never write an equivalent boolean anywhere else.
//
// A flag with no reader is a control that lies — four have been deleted from
// this file for that reason rather than left switched off. Git holds their
// reasoning; if one comes back, it comes back with the code it gates.

// Whether the payment gateway (escrow, checkout, provider payouts) is live.
// False makes every payment-facing string read as „coming soon": no bank names,
// no payout dates, no charge implication. Nothing is charged until this flips.
export const PAYMENTS_LIVE = false

// The one commission number. Every string that mentions commission reads from
// here, so „15% here / 10% there" cannot regress.
export const COMMISSION_PCT = 15

// The diaspora vertical: /abroad, the EUR display, the diaspora surfaces. This
// one line is the entire switch — off, /abroad 404s and no other page changes.
export const FEATURE_ABROAD = false

// GEL → EUR, for DISPLAY ONLY. Nothing is stored, charged or compared in euro;
// this decides what the /abroad pages SAY, so a reader on a euro salary can
// judge a price without a converter.
//
// Hardcoded rather than a live feed: a marketing price that moves hourly is
// worse than one honestly approximate, and a feed is a dependency plus a
// failure mode for a number that moves a percent a month. Prices are rounded
// and prefixed „≈" (lib/abroad → eurLabel), never quoted as exact.
//
// ⚠️ Review by hand every few months. 2026-08-04: 1 GEL ≈ 0.33 EUR.
export const ABROAD_EUR_PER_GEL = 0.33

// B2B: a company pays us out of band, an admin types the amount onto a balance
// by hand, and members of that company spend it. No gateway, no auto-charge, no
// invoicing, no self-serve top-up — it is bookkeeping, not a card on file.
//
// Three states and not a pair of booleans: „enabled" + „adminOnly" can
// contradict each other, and the contradiction always resolves in whichever
// surface somebody forgot to update. One question, one answer.
//
//   'off'     nothing exists: no route, no admin tab, no API.
//   'admin'   signed-in ADMINs only; everyone else gets 404, not 403 — a 403
//             confirms the thing is there.
//   'public'  live for everyone, and only ever set together with the linking,
//             sitemap and noindex work (lib/b2b.ts → B2B_ROUTE).
//
// ⚠️ Read it through `canSeeB2B()`. Never compare this constant at a call site,
// and never add an env var beside it — one switch, or the next person adds a third.
export type B2BVisibility = 'off' | 'admin' | 'public'
export const B2B_VISIBILITY: B2BVisibility = 'off'

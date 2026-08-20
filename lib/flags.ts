// Single source of truth for progressive-disclosure feature flags.
// Flipping one of these here is the ONLY change required to (dis)enable
// the corresponding UI surface across the app. Do NOT sprinkle equivalent
// booleans elsewhere — always import from this file.

// Wallet / cards-on-file / invoices / subscription UI. The audit found no
// working backend for any of these — hidden by default. Set to `true` only
// when the payments V2 stack (Stripe/BOG/TBC checkout, wallet ledger, cards
// vault, invoice generator) actually ships.
export const FEATURE_PAYMENTS_V2 = false

// Whether the payment gateway (escrow, TBC/BOG/SOLO checkout, tutor payouts)
// is live. When false, all payment-facing copy renders in a "coming soon"
// tone: no specific bank names, no payout dates, no charge implication. The
// booking flow still creates Bookings and marks them PREPARING; nothing is
// actually charged until this flag is flipped on and the integration ships.
export const PAYMENTS_LIVE = false

// Canonical free-cancellation window: cancelling at least this many hours
// before startAt is free (full refund once payments are live). The server
// refund rule (app/api/bookings/[id]/cancel) and every copy string that
// mentions the deadline must BOTH read from here — product copy previously
// promised 24h while the server enforced 12h.
export const CANCEL_CUTOFF_HOURS = 24

// The single canonical commission percentage the platform takes from a paid
// booking. Every copy string that mentions commission must read from here so
// the "15% here / 10% there" mismatch can never regress.
export const COMMISSION_PCT = 15

// Tutor's share of a paid booking (used in earnings displays).
export const TUTOR_PAYOUT_PCT = 100 - COMMISSION_PCT

// Request-based booking: the client proposes a time instead of picking one out
// of the expert's published windows, and the expert accepts or declines it.
//
// WHY IT EXISTS. 46% of booking attempts (31 of 68, measured 2026-08-03) died on
// „no free time" — every one of them because the expert had published nothing
// upcoming. Publishing windows depends on expert discipline, and the data says
// that dependency does not hold: 6 of 18 listed experts were unbookable, costing
// 60 profile views in 30 days. Inverting the direction removes the dependency
// instead of nagging it: the expert answers a request the way they answer a
// message, and never has to fill a calendar in advance.
//
// The accept/decline half already existed — a booking is created PREPARING and
// the expert confirms it. The only thing this changes is WHERE the start may
// come from. Every other guard (overlap, self-overlap, past date, suspended or
// paused expert, server-side price) applies exactly as before.
//
// OFF until the client UI ships. With it off, POST /api/bookings ignores a
// `proposed` body flag entirely and behaves exactly as it did.
//
// SCOPE (2026-08-04): even with this ON, a request is only accepted for experts
// in the diaspora category — see lib/abroad.ts → ABROAD_CATEGORY_SLUG. The flag
// is the kill switch; the category is the audience. Both must agree, so turning
// this on cannot leak the proposal UI onto the ordinary catalog.
export const FEATURE_REQUEST_BOOKING = false

// ── The diaspora vertical (2026-08-04) ───────────────────────────────────────
// /abroad and everything that hangs off it: the landing page, the EUR price
// display, and the request-booking surfaces for diaspora experts. OFF ships the
// whole vertical dark — /abroad 404s, and no existing page, component or flow
// changes by so much as a pixel.
//
// This ONE line is the entire switch. Nothing else gates the vertical: no env
// var, no second boolean, no per-surface check. Same contract as
// FEATURE_PAYMENTS_V2 above.
export const FEATURE_ABROAD = false

// ── Teaching packages (2026-08-05) ───────────────────────────────────────────
// A „1-month package": a teacher sells N prepaid lessons; the client spends
// them one booking at a time. Same one-line contract as FEATURE_ABROAD above —
// OFF ships the whole vertical dark: no route, no API, no admin control, and
// not one existing page changes by a pixel.
//
// WHY A PACKAGE AND NOT A SUBSCRIPTION. Preply's model auto-charges a stored
// card every 28 days. We have no stored card and no gateway (PAYMENTS_LIVE is
// false below), so an auto-renewing subscription is not a design choice we
// declined — it is physically unavailable. italki's prepaid pack is the only
// shape that works, and it also matches what the Georgian market already sells:
// blocks of 8 lessons (2/week × 4 weeks), 100–250₾, priced as a whole.
//
// ⚠️ THE PER-EXPERT GATE IS `TutorProfile.packagesEnabled`, NOT `serviceType`.
// `ServiceType.RECURRING` looks like the natural switch and is NOT usable as
// one: measured on production 2026-08-05, 11 of 21 profiles already carry
// RECURRING as a legacy default nobody reads, so gating browse on
// `serviceType = CONSULTATION` would have deleted half the public catalog in
// one deploy. `packagesEnabled` is admin-set and starts false for everyone,
// which makes it an allowlist — an empty list yields an empty page, never a
// disappearance. Cleaning up serviceType is a separate, deliberate task.
//
// ROLLOUT STAGE — deliberately ONE three-state constant, not a pair of
// booleans. Two flags ("enabled" + "adminOnly") can contradict each other, and
// the contradiction is always resolved in whichever surface someone forgot to
// update. There is exactly one question here — who can see this? — so there is
// exactly one answer.
//
//   'off'    nothing exists: no route, no admin control, no API. The state
//            every other vertical ships in until its owner says otherwise.
//   'admin'  signed-in ADMINs only. Surfaces 404 for everyone else — 404 and
//            not 403, because a 403 confirms the thing is there.
//   'signed-in'  any signed-in account. The testing stage: the owner can hand
//            the URL to a real client and watch them go through the whole flow.
//            Still unlinked from every nav, still noindex, still anonymous-404,
//            so it cannot be stumbled into — but it needs no allowlist to
//            maintain. Deliberately NOT a list of tester emails: the gate is
//            one function (canSeePackages), and a list there is a second thing
//            to keep in sync for a stage that lasts weeks.
//   'public' live for everyone. Only ever set together with the linking,
//            sitemap and SEO work — see the plan's „გამოქვეყნება" phase.
//
// Read it through `canSeePackages()` in lib/packages.ts; do not compare this
// constant directly at call sites.
export type PackagesVisibility = 'off' | 'admin' | 'signed-in' | 'public'
// ⚠️ 'off' SINCE 2026-08-19, and it is a STAGE, not a verdict. Four verticals
// running in parallel is four sets of texts, admin tabs, tests and decisions
// for one person to hold, on a site whose traffic has not arrived yet. Owner's
// call: narrow to the one thing the site sells until it sells it. Turning this
// back to 'signed-in' is the whole of undoing it — no code was removed.
export const PACKAGES_VISIBILITY: PackagesVisibility = 'off'

// GEL → EUR, for DISPLAY ONLY in the /abroad context.
//
// Consultation.price and TutorProfile.price stay Int lari everywhere — in the
// DB, in the booking payload, in the expert's earnings. Nothing is stored,
// charged or compared in euro; this rate only decides what the landing page and
// the diaspora expert cards SAY, so an emigrant on a euro salary can judge the
// price without opening a converter.
//
// Deliberately a hardcoded constant and not a live FX feed: a marketing price
// that moves hourly is worse than one that is honestly approximate, and a feed
// is a dependency plus a failure mode for a number that moves a percent a month.
// Displayed prices are rounded and prefixed with „≈" (lib/abroad → eurLabel) —
// never presented as an exact quote.
//
// ⚠️ Review this by hand every few months. 2026-08-04: 1 GEL ≈ 0.33 EUR.
export const ABROAD_EUR_PER_GEL = 0.33

// ── B2B: companies with a prepaid balance (2026-08-11) ───────────────────────
// /business, the company account, and paying for a booking out of a company
// balance instead of a card. Same one-line contract as FEATURE_ABROAD and
// PACKAGES_VISIBILITY above — 'off' ships the whole vertical dark: the route
// 404s, no admin tab exists, no API answers, and not one existing page changes
// by a pixel.
//
// WHAT IT IS. A company pays us somehow — bank transfer, invoice, a phone call,
// it does not matter and we do not model it — and an admin types the amount
// onto a balance BY HAND. Employees who are members of that company can then
// spend it on ordinary bookings. That is the entire feature.
//
// WHAT IT DELIBERATELY IS NOT, so nobody builds it by accident: no gateway, no
// automatic charge, no invoice generator, no escrow, no subscription, no
// self-serve top-up. `PAYMENTS_LIVE` below is still false and this vertical
// does not move it — a company balance is bookkeeping, not a card on file.
//
// THREE STATES, NOT A BOOLEAN PAIR — the same reasoning PACKAGES_VISIBILITY
// spells out at length: two flags („enabled" + „adminOnly") can contradict each
// other, and the contradiction always resolves in whichever surface someone
// forgot to update. There is one question — who can see this? — so one answer.
//
//   'off'     nothing exists: no route, no admin tab, no API. Ships here.
//   'admin'   signed-in ADMINs only. Every surface 404s for everyone else —
//             404 and not 403, because a 403 confirms the thing is there.
//   'public'  live for everyone. Only ever set together with the linking,
//             sitemap and noindex work; see lib/b2b.ts → B2B_ROUTE.
//
// There is NO 'signed-in' stage, unlike packages. Packages needed one because
// the owner had to hand a URL to a real client and watch them use it. Here the
// thing being tested is an admin typing a balance and an EMPLOYEE OF A NAMED
// COMPANY spending it — membership is already an allowlist an admin maintains
// by hand, so „any signed-in account" would widen the audience without
// widening what anyone can actually do. Add the stage if that stops being true.
//
// ⚠️ Read it through `canSeeB2B()` in lib/b2b.ts. Do not compare this constant
// at call sites, and do not add an env var beside it — one switch, or the next
// person adds a third.
export type B2BVisibility = 'off' | 'admin' | 'public'
// ⚠️ 'off' SINCE 2026-08-19 — same reasoning as PACKAGES_VISIBILITY above, and
// the same one-line undo. It was 'admin', which cost nothing to a visitor but
// still carried an admin tab, a route, an API surface and a test suite through
// every change.
export const B2B_VISIBILITY: B2BVisibility = 'off'

// Single source of truth for progressive-disclosure feature flags.
// Flipping one of these here is the ONLY change required to (dis)enable
// the corresponding UI surface across the app. Do NOT sprinkle equivalent
// booleans elsewhere — always import from this file.

// ⚠️ `FEATURE_PAYMENTS_V2` WAS HERE AND IS GONE (2026-08-26). It read „wallet /
// cards-on-file / invoices / subscription UI … hidden by default", and CLAUDE.md
// listed it among the dark features whose „code and copy stay reachable so the
// flag can simply be turned on". Measured that day: NOTHING imported it — not a
// screen, not a route, not a test. There was no wallet behind the switch, so it
// was not a dark feature at all; it was a control wired to nothing, which is the
// one thing this file exists to prevent. When a payments UI is actually built,
// the flag comes back WITH it.

// Whether the payment gateway (escrow, TBC/BOG/SOLO checkout, provider payouts)
// is live. When false, all payment-facing copy renders in a "coming soon"
// tone: no specific bank names, no payout dates, no charge implication.
// Requests, offers and accepted work all happen exactly as they do now;
// nothing is charged until this flag is flipped on and the integration ships.
// (The last sentence said „the booking flow still creates Bookings and marks
// them PREPARING" until 2026-08-26 — there has been no booking since
// 2026-08-24, and this is the flag every payment sentence on the site reads.)
export const PAYMENTS_LIVE = false

// ⚠️ `CANCEL_CUTOFF_HOURS` WAS HERE AND IS GONE (2026-08-26). It was the free
// cancellation window, counted back from a booking's `startAt`, and it named
// its own enforcer: `app/api/bookings/[id]/cancel`. Both the route and the
// start time went with the booking product on 2026-08-24, so the constant had
// exactly two kinds of reader left — a FAQ answer and the terms page, each
// quoting a refund deadline nothing could apply. „A flag with no reader is a
// control that lies" (CLAUDE.md), and a refund deadline that lies is the
// expensive kind.

// The single canonical commission percentage the platform takes from a paid
// booking. Every copy string that mentions commission must read from here so
// the "15% here / 10% there" mismatch can never regress.
export const COMMISSION_PCT = 15

// Tutor's share of a paid booking (used in earnings displays).
export const TUTOR_PAYOUT_PCT = 100 - COMMISSION_PCT

// ⚠️ `FEATURE_REQUEST_BOOKING` WAS HERE AND IS GONE (2026-08-26), and the whole
// note below is kept only as the reasoning — read it as history, not as a plan.
// The feature was „the client PROPOSES A TIME instead of picking one out of the
// expert's published windows": a booking, a start time, published windows and
// `POST /api/bookings`, none of which has existed since 2026-08-24. It had no
// importer left, and the file the comment named as its owner
// (`tests/requestBooking.test.ts`) went with the product. What survives the
// removal is the finding — a dependency on expert discipline does not hold —
// and the request/offer model IS the answer it was reaching for.
//
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

// ── Teaching packages — REMOVED 2026-08-24, and it is not a flag flip ────────
//
// A „1-month package" was: a teacher sells N prepaid lessons, the client spends
// them one BOOKING at a time. It shipped dark behind a three-state
// `PACKAGES_VISIBILITY` constant from 2026-08-05, and the note here used to say
// „no code was removed — turning it back to 'signed-in' is the whole of undoing
// it." That stopped being true on the day the consultation product was removed.
//
// WHAT WENT WITH IT, and why the flag could not stay: `Package` and `Enrollment`
// were dropped, `TutorProfile.packagesEnabled` went with its table, and a spent
// lesson WAS a Booking — the one thing the whole design rested on. The landing
// (/swavleba), lib/packages and `canSeePackages` are gone too, so the constant
// had no reader left; keeping it would have been a switch wired to nothing,
// which is exactly the dead control this file exists to avoid.
//
// ⚠️ SO THIS IS NOT „a dark feature was deleted". A dark feature is one whose
// code is reachable and whose flag flip is the whole of turning it on, and that
// rule still holds for FEATURE_ABROAD, B2B_VISIBILITY and the payments pair
// below. Packages is a feature whose DATA MODEL the owner removed. Reviving it
// means designing what a prepaid block is bought and spent AGAINST now that
// there is no booking — most likely a RequestOffer the client draws down — and
// that is a product decision, not a line in this file.
//
// The reasoning worth keeping, because it will be the same next time:
//   · A SUBSCRIPTION IS UNAVAILABLE, NOT DECLINED. Preply auto-charges a stored
//     card every 28 days; there is no stored card and no gateway here
//     (PAYMENTS_LIVE is false below). italki's prepaid pack is the only shape
//     that works, and it matches what the Georgian market already sells: blocks
//     of 8 lessons (2/week × 4 weeks), 100–250₾, priced as a whole.
//   · ONE THREE-STATE CONSTANT, NEVER A PAIR OF BOOLEANS. „enabled" +
//     „adminOnly" can contradict each other, and the contradiction is always
//     resolved in whichever surface somebody forgot to update. One question —
//     who can see this? — one answer. B2B_VISIBILITY below still has the shape.
//   · A PER-PROVIDER GATE IS AN ALLOWLIST, NOT A DERIVED FIELD. The gate was an
//     admin-set boolean starting false for everyone, so an empty list yields an
//     empty page and never a disappearance. Gating on a legacy enum instead
//     would have deleted half the public catalogue in one deploy — measured
//     2026-08-05: 11 of 21 profiles carried a `RECURRING` default nobody read.

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
// balance instead of a card. Same one-line contract as FEATURE_ABROAD above —
// 'off' ships the whole vertical dark: the route
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
// THREE STATES, NOT A BOOLEAN PAIR — the same reasoning the packages note
// above spells out: two flags („enabled" + „adminOnly") can contradict each
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
// ⚠️ 'off' SINCE 2026-08-19 — narrowing to the one thing the site sells until
// it sells it, and a one-line undo. It was 'admin', which cost nothing to a
// visitor but
// still carried an admin tab, a route, an API surface and a test suite through
// every change.
export const B2B_VISIBILITY: B2BVisibility = 'off'

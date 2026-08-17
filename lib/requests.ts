// The requests subsystem — one file, every rule about it.
//
// Same shape and the same reasoning as lib/b2b.ts, lib/abroad.ts and
// lib/packages.ts: pure data and pure functions, NO prisma and NO react, so a
// server page, a client component and an API route can all import from here and
// a rule stated once cannot drift into three versions. Anything that needs the
// database or node:crypto lives in lib/requestsServer.ts instead — importing
// this file from a `'use client'` form must never drag Prisma into the bundle.
//
// WHAT THE SUBSYSTEM IS. A client describes a problem and a budget → an admin
// phones them and marks it verified → the verified request becomes visible to
// allowlisted providers → a provider writes an offer (price + days + a
// sentence) → the client picks one, and only then do the two get each other's
// contact details. That last clause is the product: WE open the contact.
//
// ⚠️ WHAT IT IS NOT, so nobody builds it by accident. It is not the booking
// system and shares nothing with it — no calendar, no slot, no duration, no
// Booking row. It is not the B2B vertical either: BusinessLead is a company
// asking for a service we priced, this is a person describing a problem nobody
// has priced yet. Stage 1 has no payment, no credits, no buying a lead, no
// escrow, no automatic matching, no scoring, no ranking and no messaging.

import { z } from 'zod'
import { phoneFormatError, normalizePhone } from '@/lib/phone'

/* ── the routes the subsystem lives on ──────────────────────────────────── */

/** The client's form. */
export const REQUEST_ROUTE = '/request'
/** The provider's workspace — deliberately its own, beside /tutor and /student
 *  rather than inside either. The booking product and this one must not read as
 *  one screen with two moods. */
export const PROVIDER_ROUTE = '/provider'

/**
 * Every path the subsystem owns, as prefixes.
 *
 * The middleware 404s all of these when the feature is off, and
 * tests/requests.test.ts walks this list rather than a hand-typed copy — so a
 * route added later is covered by the gate test the day it appears instead of
 * the day somebody remembers.
 */
export const REQUEST_PATH_PREFIXES = [
  '/request',
  '/provider',
  '/api/requests',
  // Its own prefix, not covered by the one above: „/api/request-chat" does not
  // start with „/api/requests/". The conversation endpoint was added after this
  // list and the outer gate silently stopped short of it — exactly the drift
  // the note above predicts.
  '/api/request-chat',
  // Same trap, same shape: „/api/request-thread" does not start with
  // „/api/requests/" either. The derived test below is what caught it this time
  // instead of a day of silence.
  '/api/request-thread',
  '/api/provider',
  '/api/admin/requests',
] as const

/* ── the switch ─────────────────────────────────────────────────────────── */

/**
 * Is the subsystem on for this deployment?
 *
 * AN ENV VAR AND NOT A CONSTANT, deliberately unlike B2B_VISIBILITY and
 * PACKAGES_VISIBILITY. Those two are constants because their owner flips them
 * as part of a release. This one is a kill switch for an unfinished experiment
 * that is being tested against the live database: it has to be turnable off
 * from the Railway dashboard at three in the morning, without a code change and
 * without a working laptop.
 *
 * Anything but the exact string „on" is off, including unset, „true", „1" and
 * „ON " with a stray space — trimmed and lower-cased first, because a value
 * typed into a dashboard field is typed by a human. Defaulting to OFF is the
 * whole safety property: a deployment that never heard of this variable ships
 * the subsystem dark.
 *
 * ⚠️ Takes the raw value as an argument so tests can execute BOTH states for
 * real. A gate closed over process.env can only ever be tested at whichever
 * value the machine running the tests happens to have — the same blind spot
 * b2bVisibleTo() is split apart to avoid.
 */
export function requestsOn(raw: string | undefined = process.env.FEATURE_REQUESTS): boolean {
  return (raw ?? '').trim().toLowerCase() === 'on'
}

/** The viewer, as much of them as the gate needs. A plain string role rather
 *  than the Prisma `Role` enum, so this file stays importable from a client
 *  component without dragging @prisma/client into the browser bundle. */
export type RequestViewer = {
  role?: string | null
  /** True when an ACTIVE RequestAccess row names this person or their company.
   *  Resolved against the database by lib/requestsServer → `requestAccessOf`. */
  hasAccess?: boolean
}

/**
 * THE DECISION, with the switch passed in.
 *
 * ⚠️ NOT FOR CALL SITES — use `canSeeRequests` below. Split out for the same
 * reason `b2bVisibleTo` is: so the off-branch and the on-branch are both
 * executed by tests regardless of the environment the tests run in.
 *
 * The shape is the point:
 *   · OFF beats everything, ADMINS INCLUDED. „Off" that an admin can still see
 *     is not off — it is a state where the person most likely to be testing is
 *     the one person who cannot verify the switch works.
 *   · An admin is in, because they run the queue.
 *   · Everybody else is in only if the allowlist names them. Not „every
 *     expert": the approved experts on this platform applied to be booked, not
 *     to bid on leads, and switching them all on would ship an unfinished
 *     product to people who never asked for it.
 */
export function requestsVisibleTo(on: boolean, viewer: RequestViewer): boolean {
  if (!on) return false
  if (viewer.role === 'ADMIN') return true
  return viewer.hasAccess === true
}

/** Who may open a PROVIDER or ADMIN surface right now — the offer screens, the
 *  queue, the allowlist. The ONLY place FEATURE_REQUESTS is interpreted for
 *  that side; call sites ask this and never read the variable themselves, so
 *  „is it on?" cannot develop two answers. */
export function canSeeRequests(viewer: RequestViewer): boolean {
  return requestsVisibleTo(requestsOn(), viewer)
}

/**
 * Who may open a CLIENT surface: the form, their own request by reference, and
 * their side of a conversation. THE ANSWER IS „ANYONE, WHEN IT IS ON" — no
 * role, no allowlist, no account.
 *
 * ⚠️ THE ASYMMETRY IS THE PRODUCT, not an oversight, and it is written here so
 * nobody re-unifies the two gates for tidiness. Until 2026-08-17 both sides ran
 * through canSeeRequests, which meant the client form was allowlist-only — a
 * marketplace where the only people who could ASK were the people we had hand-
 * picked to ANSWER. That is a demo, not a market.
 *
 * What still protects each client surface is NOT this gate:
 *   · the form   — a honeypot and a rate limit, the same pair every public
 *                  intake on this site uses.
 *   · /request/<ref> and the chat's client side — POSSESSION OF THE REFERENCE.
 *                  It is crypto-random precisely so it can carry an identity
 *                  for somebody who has no account, which is most of them.
 *   · accepting an offer — the same reference.
 * So loosening this does not loosen those; they never depended on it.
 *
 * The subsystem stays UNLINKED and noindex (owner, 2026-08-17: open, but no
 * link yet). That is a discoverability decision, not a security one — and
 * tests/requests.test.ts still fails if anything links to it.
 */
export function canOpenRequestForm(): boolean {
  return requestsOn()
}

/**
 * Does this deployment know the subsystem exists at all?
 *
 * Separate from `canSeeRequests` and NOT „canSeeRequests for admins": this
 * decides whether an admin-only CONTROL is rendered (the two new tabs in the
 * admin rail), while canSeeRequests decides whether a PERSON may open a
 * surface. Same split, and the same reason, as b2bFeatureExists().
 *
 * ⚠️ A nav-level hide is not a guard. Every route checks for itself.
 */
export function requestsFeatureExists(): boolean {
  return requestsOn()
}

/**
 * Does this path belong to the subsystem?
 *
 * Used by the middleware, which is the outer of the two gates. Matched on a
 * segment boundary so `/requests-something` — a route that does not exist today
 * and might one day — is never swallowed by the `/request` prefix.
 */
export function isRequestPath(pathname: string): boolean {
  return REQUEST_PATH_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))
}

/* ── the public reference ───────────────────────────────────────────────── */

/**
 * The alphabet the code is drawn from: 10 digits + 26 letters, MINUS O, 0, I, 1.
 *
 * This code's whole job is to survive being said out loud — the admin reads it
 * back to the client on the phone, and the client types it into /request/<ref>
 * afterwards. „O" and „0" are the same sound and nearly the same glyph; „I" and
 * „1" likewise. Removing all four costs 4 of 36 symbols and removes the only
 * failure this code can have.
 */
export const REF_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export const REF_PREFIX = 'MC-'
/** Five characters out of 32 = 33.5M codes. At the scale this feature will ever
 *  reach, a collision is a retried insert (the column is UNIQUE), not a risk. */
export const REF_LENGTH = 5

/**
 * Mint a reference from raw random bytes.
 *
 * ⚠️ THE BYTES MUST BE CRYPTO-RANDOM, and the caller supplies them — see
 * lib/requestsServer → `newPublicRef`, which is the only production caller and
 * passes `randomBytes`. Taking them as an argument keeps this function pure and
 * testable; it is NOT an invitation to pass Math.random(). A guessable
 * reference is not a cosmetic problem: the reference alone opens a page
 * carrying a stranger's phone number.
 *
 * The alphabet is 32 symbols, so five bytes masked to 5 bits each map onto it
 * with NO modulo bias at all — every symbol is exactly equally likely. (A
 * 36-symbol alphabet would need rejection sampling; dropping the four
 * confusable characters made the arithmetic honest as well as the code
 * readable.)
 */
export function makePublicRef(bytes: ArrayLike<number>): string {
  if (bytes.length < REF_LENGTH) {
    throw new Error(`makePublicRef needs ${REF_LENGTH} bytes, got ${bytes.length}`)
  }
  let out = ''
  for (let i = 0; i < REF_LENGTH; i++) out += REF_ALPHABET[bytes[i] & 31]
  return REF_PREFIX + out
}

/** Is this string shaped like one of our references? Used to reject a garbage
 *  URL segment before it costs a database round-trip. */
export const PUBLIC_REF_RE = new RegExp(`^${REF_PREFIX}[${REF_ALPHABET}]{${REF_LENGTH}}$`)

/**
 * The reference as the DATABASE holds it, from whatever the URL bar holds.
 *
 * Lower case and a missing prefix are the two things a person retyping a code
 * off a phone call actually does, and neither is a different request. Returns
 * null when it is not a reference at all, so the caller 404s without a query.
 */
export function normalizePublicRef(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().toUpperCase().replace(/\s+/g, '')
  const withPrefix = v.startsWith(REF_PREFIX) ? v : REF_PREFIX + v
  return PUBLIC_REF_RE.test(withPrefix) ? withPrefix : null
}

/* ── the vocabulary ─────────────────────────────────────────────────────── */

/*
 * ⚠️ THE VOCABULARY MOVED, AND IT MOVED FOR A REASON.
 *
 * Budget bands, timing options, formats, cities and the 132 topics all live in
 * lib/requestTopics.ts now. They were here as flat enums until the subsystem had
 * to carry teaching as well as professional work, at which point one budget list
 * could no longer be right: „500–1 000₾" and „20–40₾ ერთ გაკვეთილზე" are both
 * correct answers to „what is your budget" and they are not the same question.
 *
 * Everything over there is keyed BY KIND. Re-exported from here so a call site
 * still has one import for „the requests rules" and does not have to know which
 * of the two files a given label came from.
 */
import {
  REQUEST_KINDS, KIND, kindOf, bandOf, budgetLabel, TIMING, timingLabel,
  formatLabel, cityLabel, topicLabel, categorySlugOfTopic, isTopicOfKind,
  normalizeExtras, extrasLabels,
} from './requestTopics'

export {
  REQUEST_KINDS, KIND, kindOf, BUDGET_UNITS,
  BUDGET_BANDS, bandOf, budgetIsBelowFloor, budgetLabel,
  TIMING, timingLabel, FORMATS, formatLabel, CITIES, cityLabel,
  TOPIC_GROUPS, OTHER_TOPIC, topicById, topicLabel, categorySlugOfTopic,
  SUGGESTED_TOPICS, SUGGESTED_TOPIC_IDS,
  groupsForKind, isTopicOfKind, searchTopics,
  extrasFor, normalizeExtras, extrasLabels, templateFor, offerTemplateFor,
  kindsOfTopic, searchAllTopics,
} from './requestTopics'
export type {
  RequestKindName, BudgetUnitName, BudgetBand, TimingOption,
  FormatName, CityName, Topic, TopicGroup, TopicHit, ExtraQuestion,
} from './requestTopics'

export const REQUEST_STATUSES = ['NEW', 'VERIFIED', 'REJECTED', 'MATCHED', 'CLOSED'] as const
export type RequestStatusName = (typeof REQUEST_STATUSES)[number]

/* ═══════════ where the request stands, as the CLIENT reads it ═══════════
 *
 * Four stations, because that is the whole journey the person who sent it
 * cares about. REJECTED and CLOSED are not stations — they are exits, and a
 * track would have to draw progress going nowhere.
 *
 * ⚠️ ONE DEFINITION, TWO RENDERERS (2026-08-17). The server track on
 * /request/<ref> and the live panel on the thanks screen both draw from here.
 * They were about to be two copies of the same four labels and the same
 * mapping, which is how a person sees „ვამოწმებთ" on one screen and
 * „შეთავაზებები" on the other for one request.
 */
export const REQUEST_STATIONS = ['მივიღეთ', 'ვამოწმებთ', 'შეთავაზებები', 'არჩეული'] as const

/**
 * How many stations this status has REACHED — 1-based, and the last one reached
 * is the one happening NOW rather than one that is finished.
 *
 * NEW reaches 2: received, and being checked. „ვამოწმებთ" is a person about to
 * pick up a phone, not a box already ticked — which is exactly why the live
 * panel pulses the last reached station instead of filling it.
 */
export function stationsReached(status: string): number {
  if (status === 'MATCHED') return 4
  if (status === 'VERIFIED') return 3
  return 2
}

/** The admin's words for each state. */
export const STATUS_LABEL: Record<RequestStatusName, string> = {
  NEW: 'ახალი',
  VERIFIED: 'დამოწმებული',
  REJECTED: 'უარყოფილი',
  MATCHED: 'შერჩეულია',
  CLOSED: 'დახურული',
}

export const OFFER_STATUSES = ['SENT', 'WITHDRAWN', 'ACCEPTED', 'DECLINED'] as const
export type OfferStatusName = (typeof OFFER_STATUSES)[number]

export const OFFER_STATUS_LABEL: Record<OfferStatusName, string> = {
  SENT: 'გაგზავნილი',
  WITHDRAWN: 'გატანილი',
  ACCEPTED: 'მიღებული',
  DECLINED: 'უარყოფილი',
}

/** „1 200₾" — one place, so the form, the provider card and the admin agree.
 *  Grouped with the same `en-US` separator every other price on this site uses
 *  (servicePriceLabel in lib/b2b), so two numbers never look like two systems. */
export function gel(n: number): string {
  return `${n.toLocaleString('en-US')}₾`
}

/* ── freshness ──────────────────────────────────────────────────────────────
 *
 * „2 საათის წინ" on a lead card, because the speed-to-lead numbers make AGE
 * the first fact a provider triages on — a 10-minute lead and a 3-day one are
 * different objects, and a card that hides the difference makes every lead
 * look equally cold. Diff-based, so it is timezone-free and safe on the server
 * (no getHours() — the CLAUDE.md rule does not apply to durations).
 */
export function timeAgoKa(iso: string | Date, now: number = Date.now()): string {
  const t = typeof iso === 'string' ? Date.parse(iso) : iso.getTime()
  const s = Math.max(0, Math.floor((now - t) / 1000))
  if (s < 90) return 'ახლახან'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} წუთის წინ`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} საათის წინ`
  const d = Math.floor(h / 24)
  return `${d} დღის წინ`
}

/* ── the provider ───────────────────────────────────────────────────────── */

export const PROVIDER_KINDS = ['EXPERT', 'COMPANY'] as const
export type ProviderKindName = (typeof PROVIDER_KINDS)[number]

export type OfferProvider = {
  providerKind: string
  expertUserId?: string | null
  companyId?: string | null
}

/**
 * ⚠️ THE ONE PLACE „exactly one provider" IS CHECKED. Nothing else validates it,
 * and nothing else may — a second copy is how „both columns set" eventually
 * becomes storable.
 *
 * Prisma cannot express the rule: it has no cross-column constraint, and the
 * database CHECK that backs this up (RequestOffer_exactly_one_provider, see
 * prisma/manual-migrations/2026-08-14-requests/up.sql) can only refuse the row
 * — it cannot tell the caller WHICH half was wrong, which is the difference
 * between a 400 that explains itself and a 500 that does not.
 *
 * So the CHECK is the backstop and this is the check. Every writer calls it.
 *
 * Returns null when the shape is legal, otherwise the machine code the endpoint
 * answers with (Georgian lives in the panel, never in an API response).
 */
export function offerProviderError(p: OfferProvider): string | null {
  const expert = (p.expertUserId ?? '').trim()
  const company = (p.companyId ?? '').trim()

  if (expert && company) return 'PROVIDER_AMBIGUOUS'
  if (!expert && !company) return 'PROVIDER_MISSING'

  // The discriminator has to AGREE with the column that is set. Letting them
  // disagree would produce a row that reads one way through `providerKind` and
  // another through its ids — and every reader picks a different one.
  if (p.providerKind === 'EXPERT' && !expert) return 'PROVIDER_KIND_MISMATCH'
  if (p.providerKind === 'COMPANY' && !company) return 'PROVIDER_KIND_MISMATCH'
  if (p.providerKind !== 'EXPERT' && p.providerKind !== 'COMPANY') return 'PROVIDER_KIND_UNKNOWN'

  return null
}

/* ── how many places are left ───────────────────────────────────────────── */

/** Places still open on a request. Never negative, so a row that somehow went
 *  over the limit reads as „full" rather than as a negative badge. */
export function placesLeft(r: { offerCount: number; offerLimit: number }): number {
  return Math.max(0, r.offerLimit - r.offerCount)
}

/** May a provider still write an offer here? A UI question, NOT a guard — the
 *  real answer is claimed conditionally inside the endpoint
 *  (`updateMany` where `offerCount < offerLimit`, `count !== 1 → 409`), because
 *  a check you read before the write loses to a second tab. CLAUDE.md states
 *  the rule; here losing it means a fourth provider wastes their time writing
 *  an offer that cannot land. */
export function requestIsOpen(r: { status: string; offerCount: number; offerLimit: number }): boolean {
  return r.status === 'VERIFIED' && placesLeft(r) > 0
}

/* ── who sees whose contact ─────────────────────────────────────────────── */

/**
 * ⚠️ THE CONTACT RULE, AND IT IS THE PRODUCT.
 *
 * A provider browsing the queue sees the problem, the budget band, the deadline
 * and the city — never the client's name, phone or email. The client reading
 * their offers sees the price, the days, the sentence and the provider's name —
 * never their phone or email. Both sides get the other's details at exactly one
 * moment: the client accepts an offer.
 *
 * That is not a privacy nicety bolted onto a marketplace. It is the reason the
 * marketplace has anything to sell — the contact is what we open, so an
 * endpoint that leaks it has given away the whole feature, silently, while
 * looking like it works.
 *
 * The two shaping functions below are the enforcement. Endpoints call them
 * instead of hand-picking columns, so the rule is auditable in one place and
 * tests/requests.test.ts can execute it rather than grep for it.
 */

/** The shape a provider is allowed to receive. Note what it does NOT take: the
 *  row's `contactName`, `phone`, `email` and `adminNote` are not parameters, so
 *  a caller cannot pass them in and have them survive by accident. */
export type ProviderRequestRow = {
  id: string
  publicRef: string
  kind: string
  topic: string
  description: string
  budgetMin: number
  budgetMax: number | null
  budgetUnit: string
  timing: string
  format: string
  city: string
  status: string
  offerCount: number
  offerLimit: number
  createdAt: Date | string
  details?: unknown
  category?: { id: string; name: string; slug: string } | null
}

export function providerRequestView(r: ProviderRequestRow) {
  const kind = kindOf(r.kind)
  return {
    id: r.id,
    publicRef: r.publicRef,
    kind,
    kindLabel: KIND[kind].label,
    topic: r.topic,
    topicLabel: topicLabel(r.topic),
    description: r.description,
    // Rendered here rather than in three page components, so the same request
    // never reads „40–70₾" on one screen and „40–70₾ ერთ გაკვეთილზე" on
    // another — the unit is not decoration, it is what the number means.
    budgetLabel: budgetLabel(kind, r.budgetMin, r.budgetMax),
    timingLabel: timingLabel(kind, r.timing),
    // The clarifying answers, already worded — [{ label: 'ვისთვის', value:
    // 'აბიტურიენტი' }]. Safe by construction: extrasLabels reads the bag
    // through the question list, so a poisoned column cannot render.
    extras: extrasLabels(kind, r.topic, r.details),
    formatLabel: formatLabel(r.format),
    cityLabel: cityLabel(r.city),
    status: r.status,
    placesLeft: placesLeft(r),
    offerLimit: r.offerLimit,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : r.createdAt.toISOString(),
    category: r.category ? { name: r.category.name, slug: r.category.slug } : null,
  }
}

export type ClientContact = { contactName: string; phone: string; email: string | null }

/**
 * The client's contact, for the provider whose offer was ACCEPTED — and for
 * nobody else.
 *
 * Returns null rather than a redacted object: an object with empty strings in
 * it is a shape a UI will happily render as a blank „ტელეფონი:" row, and a
 * shape a careless `??` will fill from somewhere else. Absent is unambiguous.
 */
export function clientContactFor(
  offer: { status: string },
  contact: ClientContact,
): ClientContact | null {
  return offer.status === 'ACCEPTED' ? contact : null
}

export type ProviderContact = {
  name: string
  phone: string | null
  email: string | null
  /** The PUBLIC profile facts — what the client is entitled to see BEFORE
   *  choosing, because the profile page itself is public. The research point
   *  this carries: on every reference marketplace the client chooses by
   *  reviews, rating and profile, and an offer card reduced to a name forces
   *  them to choose by price alone. */
  profile?: { slug: string | null; verified: boolean; rating: number; reviewsCount: number } | null
}

/** One offer, as the CLIENT is allowed to see it. The provider's phone and
 *  email appear only once this offer is the accepted one — the mirror of
 *  `clientContactFor`, and the same reason for returning null. */
export function clientOfferView(o: {
  id: string
  priceGel: number
  daysEstimate: number | null
  message: string
  status: string
  createdAt: Date | string
  provider: ProviderContact
}) {
  const accepted = o.status === 'ACCEPTED'
  const prof = o.provider.profile ?? null
  return {
    id: o.id,
    priceGel: o.priceGel,
    daysEstimate: o.daysEstimate,
    message: o.message,
    status: o.status,
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : o.createdAt.toISOString(),
    providerName: o.provider.name,
    // PUBLIC profile facts, shown before choosing — the profile page is public,
    // so withholding its address from the one screen where the choice happens
    // protects nothing and only degrades the choice. The seal below is about
    // CONTACT, and only contact.
    providerProfileHref: prof?.slug ? `/tutors/${prof.slug}` : null,
    providerVerified: prof?.verified ?? false,
    // Null below the platform's own display floor: a rating computed from one
    // review is noise wearing a number, and the browse surfaces hide it too.
    providerRating: prof && prof.reviewsCount >= 1 && prof.rating > 0 ? prof.rating : null,
    providerReviews: prof?.reviewsCount ?? 0,
    // Null until they are chosen. See the block comment above — this line is
    // the feature.
    providerPhone: accepted ? o.provider.phone : null,
    providerEmail: accepted ? o.provider.email : null,
  }
}

/* ── validation ─────────────────────────────────────────────────────────── */

/*
 * ⚠️ EVERY CEILING BELOW IS SIZED FOR WHAT A PERSON ACTUALLY TYPES, and each
 * one carries the reason. This project has shipped two silently broken features
 * to a ceiling sized for tidiness rather than for the content — certificates
 * `max(500)` against a diploma, blog covers `max(2000)` against a 1200×675 webp
 * — and both are named in the pre-deploy gate's own header. A ceiling with no
 * argument behind it is the same bug waiting.
 */

/**
 * THE ONE schema for an incoming request.
 *
 * ⚠️ IT VALIDATES ACROSS FIELDS, and it has to. Three of these values are only
 * legal in the company of `kind`: a band id belongs to one kind's ladder, a
 * timing id to one kind's list, and a topic to one kind's groups. A per-field
 * schema would happily accept „LEARNING + 15 000₾-ზე მეტი + სასწრაფოდ", which
 * is three fields that are each fine and together mean nothing.
 *
 * That cross-check is also why none of the three is a Postgres enum: an enum
 * cannot see another column. zod can, so the guarantee here is stronger than
 * the database could have given.
 */
export const ServiceRequestInput = z.object({
  kind: z.enum(REQUEST_KINDS),
  // A topic id from lib/requestTopics. Validated against `kind` below — the
  // ceiling is only a sanity bound on a slug.
  topic: z.string().trim().min(1).max(60),
  // OPTIONAL, and that is a reference-model decision, not laxity. Profi's
  // intake makes free-text „подробности" skippable because the structured
  // answers (topic, band, timing, clarifiers) already carry what a provider
  // needs for a first offer — and OUR safety net is stronger than theirs: an
  // admin phones every request before anybody sees it, so a forced 40-char
  // essay was double work standing exactly where forms die (the one field
  // that demands composition). The ceiling stays at 4000, matching
  // /api/contact.
  description: z.string().trim().max(4000).optional().or(z.literal('')),
  // The BAND id („l1", „p3"), never a typed figure. A person who does not know
  // what the work costs cannot type one, and free text would produce
  // „договорная" in four spellings. The numbers are resolved server-side from
  // the band so a crafted body cannot invent a range.
  budgetBand: z.string().trim().min(1).max(8),
  timing: z.string().trim().min(1).max(24),
  format: z.enum(['ONLINE', 'IN_PERSON', 'EITHER']),
  city: z.enum(['TBILISI', 'BATUMI', 'KUTAISI', 'RUSTAVI', 'OTHER']),
  // Ceilings match the rest of the site's name fields (BusinessLeadInput
  // .contactName, TutorApplication) so a name accepted at signup is accepted
  // here.
  contactName: z.string().trim().min(2).max(120),
  // Judged by THE phone rule (lib/phone) — the same one signup, /apply, the
  // profile editor and the B2B form use. A number accepted here therefore
  // cannot fail on the next screen that asks for it, and the diaspora case
  // (a foreign number with its country code) is admitted for free.
  phone: z.string().trim().refine(v => phoneFormatError(v, { required: true }) === null, {
    message: 'ნომერი არასწორია',
  }),
  // The clarifying answers — { audience: 'pupil', level: 'beginner' }. Optional
  // as a WHOLE and per key: a required tap-row is a place the wizard can strand
  // somebody whose honest answer is „none of these". Free-form only in SHAPE:
  // normalizeExtras (lib/requestTopics) strips every key and value that is not
  // on the question list, so nothing off-vocabulary reaches the column.
  details: z.record(z.string(), z.string().max(40)).optional(),
  // Optional on purpose: the whole flow runs on the phone number. An email is a
  // convenience for sending the reference, not a requirement to be helped.
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  // ⚠️ THE HONEYPOT. A field no human ever sees, so anything in it came from
  // something filling every input on the page.
  //
  // ⚠️ THE SCHEMA DELIBERATELY ACCEPTS ANYTHING HERE, and that is the whole
  // design of the trap. It was `.max(0)` for one revision, which made the check
  // fail INSIDE zod: a filled honeypot came back as a plain 400 INVALID, the
  // route's honeypot branch below it was never reached, and the response told
  // whoever wrote the bot precisely which field to stop filling. Caught by
  // driving the real endpoint (2026-08-14) — a unit test on the schema would
  // have agreed with the schema.
  //
  // So zod's job is to let the value through with a ceiling on its size, and
  // the ROUTE decides. The route answers `ok: true` and writes nothing, so the
  // bot is told it succeeded and learns nothing at all.
  //
  // Named `website` because that is a field name a form-filling bot recognises
  // and wants to complete. Deliberately NOT a third-party captcha — no new
  // dependency, no external request on a form that must submit in seconds from
  // a phone, and nothing sent to anybody else about who is filling it in.
  website: z.string().max(200).optional().or(z.literal('')),
})
  // THE CROSS-FIELD RULES. Written as three separate refinements rather than one
  // so the error names the field that is actually wrong — a single „INVALID" on
  // a four-step form leaves the person hunting through steps they already
  // finished.
  .refine(v => isTopicOfKind(v.kind, v.topic), {
    path: ['topic'], message: 'ეს თემა ამ ტიპს არ ეკუთვნის',
  })
  .refine(v => bandOf(v.kind, v.budgetBand) !== undefined, {
    path: ['budgetBand'], message: 'ბიუჯეტი არასწორია',
  })
  .refine(v => TIMING[v.kind].some(t => t.id === v.timing), {
    path: ['timing'], message: 'ვადა არასწორია',
  })
export type ServiceRequestInput = z.infer<typeof ServiceRequestInput>

/**
 * The row to write, from a parsed request.
 *
 * ⚠️ THE BUDGET NUMBERS COME FROM THE BAND, NEVER FROM THE BODY. The client
 * sends a band id; this resolves it against lib/requestTopics. A crafted POST
 * therefore cannot claim „0–1 000 000₾" — the only budgets that exist are the
 * ones on the ladder, and the same is true of the unit.
 *
 * `categoryId` is DERIVED from the topic rather than asked for. The person
 * choosing „ხელშეკრულება" should not also have to know it lives under
 * „სამართალი", and the admin panel needs the link to list candidate experts.
 * A topic with no sphere yields null, which is not a gap — it is the record
 * that nobody here is filed under what this person asked for.
 *
 * Empty optional strings become `null` rather than `''`, the same rule
 * businessLeadRow() states: a column holding an empty string reads as „they
 * answered, with nothing", which is a different fact from „they did not
 * answer" — and the admin has to tell them apart to know whether there is
 * anything left to ask.
 */
export function serviceRequestRow(input: ServiceRequestInput) {
  const blank = (v: string | undefined) => {
    const t = (v ?? '').trim()
    return t === '' ? null : t
  }
  const band = bandOf(input.kind, input.budgetBand)!
  return {
    kind: input.kind,
    topic: input.topic,
    // '' rather than null: the column is NOT NULL, and an empty description is
    // an ordinary state now — the pages simply do not render the paragraph.
    description: (input.description ?? '').trim(),
    budgetMin: band.min,
    budgetMax: band.max,
    budgetUnit: KIND[input.kind].unit,
    timing: input.timing,
    // Stripped against the question list, never stored raw — see the schema
    // comment. Prisma.DbNull-shaped: `undefined` (column stays NULL) when
    // nothing legal remains, because Prisma's JSON input type refuses a plain
    // `null` and DbNull would drag @prisma/client into this client-safe file.
    details: normalizeExtras(input.kind, input.topic, input.details) ?? undefined,
    format: input.format,
    city: input.city,
    contactName: input.contactName.trim(),
    // Stored normalised (digits + one leading +) so two people typing the same
    // number two ways produce one value an admin can actually dial or search.
    phone: normalizePhone(input.phone),
    email: blank(input.email)?.toLowerCase() ?? null,
    /** Not a column — the caller resolves it to a real id before writing. */
    categorySlug: categorySlugOfTopic(input.topic),
  }
}

/** THE ONE schema for an offer. Same contract as above: the provider's form and
 *  POST /api/provider/offers parse with this identical object. */
export const RequestOfferInput = z.object({
  requestId: z.string().trim().min(1).max(40),
  // Lari, whole. The floor is 1 because a free offer is not an offer — it is a
  // conversation, and there is no field here for one. The ceiling is 1 000 000,
  // matching the company balance top-up ceiling in the admin panel, so the two
  // places a person types a lari amount agree on what „too big to be a typo"
  // means. Int, because there is no tetri anywhere in this database.
  priceGel: z.number().int().min(1).max(1_000_000),
  // Optional: some work honestly cannot be estimated before a conversation, and
  // a required field there produces a fictional number. 365 rather than a
  // rounder ceiling because a year is the longest estimate that is still an
  // estimate; past it, the answer is „let's talk".
  daysEstimate: z.number().int().min(1).max(365).nullable().optional(),
  // 20 characters is the floor at which the message stops being a restatement
  // of the price. A number with no sentence beside it is a guess, and the
  // client has nothing to compare. Same 4000 ceiling as the description above,
  // for the same reason: the two halves of one conversation.
  message: z.string().trim().min(20).max(4000),
})
export type RequestOfferInput = z.infer<typeof RequestOfferInput>

/** The admin's edits to a request. Every field optional — the panel PATCHes
 *  whichever control the operator touched, never the whole row. */
export const AdminRequestPatch = z.object({
  // The four transitions the panel offers. NEW is absent on purpose: „un-see
  // it" is not a thing an operator needs, and having it would make the queue's
  // „unhandled first" order mean nothing.
  status: z.enum(['VERIFIED', 'REJECTED', 'MATCHED', 'CLOSED']).optional(),
  // Same 4000 as every other free-text note here (Company.note is 2000, but
  // this one accumulates a call history rather than a contract number).
  adminNote: z.string().trim().max(4000).nullable().optional(),
  // The floor is 1 (a request nobody may answer is just closed) and the ceiling
  // 20 — past that the client is comparing a list rather than choosing, which
  // is the state this whole design exists to avoid.
  offerLimit: z.number().int().min(1).max(20).optional(),
})
export type AdminRequestPatch = z.infer<typeof AdminRequestPatch>

/** Adding somebody to the allowlist. Exactly one of email / companyId, judged
 *  by the same shape rule as an offer's provider — see below. */
export const AccessGrantInput = z.object({
  kind: z.enum(PROVIDER_KINDS),
  // The admin types an EMAIL, not a user id: they know who they spoke to, not
  // what cuid the database gave them. Resolved server-side; an address with no
  // account answers USER_NOT_FOUND rather than creating a dangling row.
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  companyId: z.string().trim().max(40).optional().or(z.literal('')),
  // The reason this person is on the list. Optional but strongly wanted — an
  // allowlist with no notes becomes a list nobody dares remove anybody from.
  note: z.string().trim().max(500).optional().or(z.literal('')),
})
export type AccessGrantInput = z.infer<typeof AccessGrantInput>

/**
 * Exactly one subject on an allowlist row — the same rule as
 * `offerProviderError` and, deliberately, a second function rather than a
 * shared generic one: the two shapes carry different field names and a generic
 * helper would take four arguments to save six lines, while making the error
 * codes it returns belong to neither caller.
 */
export function accessSubjectError(input: { kind: string; email?: string; companyId?: string }): string | null {
  const email = (input.email ?? '').trim()
  const company = (input.companyId ?? '').trim()
  if (email && company) return 'SUBJECT_AMBIGUOUS'
  if (!email && !company) return 'SUBJECT_MISSING'
  if (input.kind === 'EXPERT' && !email) return 'SUBJECT_KIND_MISMATCH'
  if (input.kind === 'COMPANY' && !company) return 'SUBJECT_KIND_MISMATCH'
  return null
}

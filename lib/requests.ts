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
// TYPE ONLY — lib/capabilities imports prisma and this file must not; see
// `showRequestCta` below.
import type { Capability } from '@/lib/capabilities'
import { phoneFormatError, normalizePhone } from '@/lib/phone'
import { UNSTATED } from '@/lib/requestTopics'

/* ── the routes the subsystem lives on ──────────────────────────────────── */

/** The client's form. */
export const REQUEST_ROUTE = '/request'
/** The master's workspace lives under /work — ONE address with the expert's
 *  (stage 6, 2026-08-19): /work/requests and /work/offers,
 *  behind their own guard (app/work/(provider)/layout.tsx). The prefix is the
 *  shared space; the three screens below are the subsystem's. */
export const PROVIDER_ROUTE = '/work'
/** The three master screens — the ONLY parts of /work the subsystem owns.
 *  ⚠️ NEVER '/work' itself: that would 404 the expert workspace beside them
 *  when the subsystem is off. */
// ⚠️ TWO PATHS, NOT THREE (2026-08-19). „ჩემი სერვისები" moved to
// /work/services, which BOTH capabilities open — an expert edits their
// consultations there. Listing it here would 404 that page for every expert on
// a deployment with FEATURE_PROVIDERS off, which is the opposite of what this
// list is for. The page gates itself instead (app/work/services/page.tsx).
export const PROVIDER_WORKSPACE_PATHS = [
  `${PROVIDER_ROUTE}/requests`,
  `${PROVIDER_ROUTE}/offers`,
] as const

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
  ...PROVIDER_WORKSPACE_PATHS,
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

/**
 * Is the SUPPLY side on — becoming a master, the master's workspace, the
 * admin queue that approves them?
 *
 * A second, NARROWER switch (2026-08-18). One variable used to kill both
 * halves at once: turning FEATURE_REQUESTS off to stop the public form also
 * took down /provider for the people already answering requests, /apply/master
 * for the ones applying, and the admin tab that approves them. FEATURE_PROVIDERS
 * lets the operator close the door to new masters — or park the whole supply
 * side — while the client intake keeps running, and vice versa is impossible
 * on purpose: the supply side lives INSIDE the subsystem, so requests off ⇒
 * providers off, always.
 *
 * ⚠️ UNSET MEANS „NO SEPARATE OPINION", NOT OFF — the one place this file
 * departs from requestsOn's rule, and deliberately. Every deployment before
 * this variable existed ran the supply side on FEATURE_REQUESTS alone; if
 * unset meant off, the deploy that introduced the variable would have taken
 * the masters' workspace down until somebody remembered to add it to the
 * dashboard. So: unset (or blank) follows FEATURE_REQUESTS; anything else must
 * say exactly „on". The safety property is intact — a deployment that never
 * heard of EITHER variable still ships dark.
 */
export function providersOn(
  raw: string | undefined = process.env.FEATURE_PROVIDERS,
  requests: boolean = requestsOn(),
): boolean {
  if (!requests) return false
  const v = (raw ?? '').trim().toLowerCase()
  if (v === '') return true
  return v === 'on'
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
  // An ADMIN opens the queue on the subsystem's own switch; a PROVIDER opens
  // their workspace on the supply-side switch — which is never on when the
  // subsystem is off (providersOn folds requestsOn in), so the outer rule
  // „off beats everything" still holds for both.
  return requestsVisibleTo(viewer.role === 'ADMIN' ? requestsOn() : providersOn(), viewer)
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
 * Who is still INVITED by the header's one action („მოთხოვნის გაგზავნა") —
 * which is a different question from `canOpenRequestForm` above, and the two
 * must never be collapsed again.
 *
 * ⚠️ THE BAR'S ONE ACTION BELONGS TO THE DEMAND SIDE (2026-08-21). Owner,
 * holding the header signed in as a provider: „როცა სერვისი მაქვს დამატებული
 * არ უნდა მიჩანდეს მოთხოვნის გაგზავნა. მხოლოდ მაშინ როცა user კლიენტი შემოდის
 * უბრალოდ." PublicTopBar carries exactly ONE permanent action on every public
 * page, and for somebody who has registered a service that action was the
 * opposite side of their own marketplace — an invitation to buy, printed above
 * the page where they sell.
 *
 * CAPABILITIES, NOT THE ROLE, for the same reason `showJoinInvite` reads them:
 * an admitted provider keeps role CLIENT (lib/hats says why), so a role test
 * would hide the CTA from approved experts and keep showing it to exactly the
 * person who asked for this. „A service added" IS a capability — a TutorProfile
 * (CONSULT) or an admitted ServiceProfile (WORK). The type is imported
 * `import type` and nothing else: lib/capabilities imports prisma, and this
 * file's whole contract is that it does not.
 *
 * ⚠️ A HIDDEN INVITATION IS NOT A CLOSED DOOR. `canOpenRequestForm` is
 * untouched, so /request still answers everyone the flag admits — a provider
 * who needs a plumber is a client like anybody else („CLIENT is the floor",
 * lib/hats), and the home band, the catalogue's empty state and the address
 * itself all still reach it. What is removed is the standing invitation, not
 * the permission.
 *
 * A GUEST KEEPS IT — settled, owner 2026-08-17: „აქ ხო უნდა ჩანდეს რეალურად
 * როცა არაა დარეგისტრირებული მაშინაც." Somebody who offers nothing yet reads
 * as demand, so an empty (or not-yet-resolved) list answers `true`; the one
 * audience this removes is people who already sell.
 */
export function showRequestCta(caps: readonly Capability[] | undefined | null): boolean {
  return (caps?.length ?? 0) === 0
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

/** Same split for the supply side: does the admin rail draw the „ხელოსნები"
 *  tab, does the signup page offer the „ვარ ხელოსანი" tile. A hide, not a
 *  guard — every /api/master-applications route checks providersOn() itself. */
export function providersFeatureExists(): boolean {
  return providersOn()
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

/**
 * The paths that belong to the SUPPLY side only — 404 when FEATURE_PROVIDERS
 * says off, on top of the outer gate above. The three /work/… master screens
 * and `/api/provider` are listed in BOTH arrays on purpose: they are inside the subsystem (so
 * requests off kills them) and they are the master's workspace (so providers
 * off kills them too).
 *
 * ⚠️ /join IS NOT HERE, and its predecessor (/apply/master) was (2026-08-19).
 * The ხელოსანი application now shares one door with the expert application,
 * and 404ing the door would take the expert half down with it. The WORK half
 * is gated INSIDE app/join/page.tsx with the same providersOn() instead.
 */
export const PROVIDER_PATH_PREFIXES = [
  ...PROVIDER_WORKSPACE_PATHS,
  '/api/provider',
  '/api/master-applications',
  '/api/admin/master-applications',
] as const

export function isProviderPath(pathname: string): boolean {
  return PROVIDER_PATH_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))
}

/**
 * Is this pathname one of the master's three /work screens? The SPACE test the
 * chrome reads (components/AppShell, BottomNav, UserMenu, the /work shell) —
 * a presentation rule, never a guard: the pages gate themselves. Segment-
 * bounded, so /work/requests-x is not inside and /work itself never is.
 */
export function isProviderWorkspacePath(pathname: string): boolean {
  return PROVIDER_WORKSPACE_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
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
/**
 * HOW MANY PROVIDERS MAY ANSWER AN OPEN REQUEST — the schema's own default
 * (`ServiceRequest.offerLimit @default(3)`), named so the two places that
 * CHANGE it are readable.
 *
 * A request addressed to one person is written down to 1 (app/api/requests),
 * and the client's „გავხსნა სხვებისთვის?" raises it back to this
 * (app/api/requests/[ref]/open). Nothing else moves it.
 */
export const DEFAULT_OFFER_LIMIT = 3

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
  BUDGET_BANDS, type RequestKindName,
  formatLabel, cityLabel, topicLabel, categorySlugOfTopic, isTopicOfKind,
  normalizeExtras, extrasLabels,
} from './requestTopics'

export {
  REQUEST_KINDS, KIND, kindOf, BUDGET_UNITS,
  BUDGET_BANDS, bandOf, budgetIsBelowFloor, budgetLabel, UNSTATED, UNSTATED_BUDGET, isUnstated,
  TIMING, timingLabel, FORMATS, formatLabel, CITIES, ALL_CITIES, ONE_CITY, cityLabel,
  TOPIC_GROUPS, OTHER_TOPIC, topicById, topicLabel, categorySlugOfTopic,
  SUGGESTED_TOPICS, SUGGESTED_TOPIC_IDS,
  groupsForKind, isTopicOfKind, searchTopics, BROWSABLE_GROUPS, groupIsLive,
  SERVICE_BROWSE_GROUPS, EXPERT_BROWSE_GROUPS, groupIsService,
  VERTICALS, isVertical, browseGroupsFor, verticalOfTopic, VERTICAL_COPY, suggestedFor,
  type Vertical,
  extrasFor, normalizeExtras, extrasLabels, templateFor, offerTemplateFor,
  kindsOfTopic, searchAllTopics, topicsForProvider,
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

// ⚠️ INVITED IS FIRST BECAUSE IT COMES FIRST IN LIFE, and it is deliberately in
// this list even though it is not an offer: the admin panel and every status
// map read from here, and an unlisted value renders as a raw code the moment
// somebody writes to an expert. What keeps it from being counted AS an offer is
// not its absence from this array — it is the queries, which name the statuses
// they mean (the client's list asks for SENT/ACCEPTED/DECLINED) and never say
// „everything except".
export const OFFER_STATUSES = ['INVITED', 'SENT', 'WITHDRAWN', 'ACCEPTED', 'DECLINED'] as const
export type OfferStatusName = (typeof OFFER_STATUSES)[number]

/**
 * WHAT A PERSON READS AS THE TITLE — their own words first, the category only
 * as a floor.
 *
 * ⚠️ FIVE SCREENS TITLED EVERY ROW WITH `topicLabel` (2026-08-19), so a queue
 * of four cleaning requests was four cards headed „ბინის დალაგება" and the
 * only way to tell them apart was to read the paragraph under each. A list
 * whose titles are all identical is not a list, it is a pile — and the person
 * scanning it is a provider deciding which job to race for.
 *
 * The description is where the request actually differs, so the first sentence
 * of it is the title. Rules, in order:
 *   · cut at the first sentence end (Georgian text uses „." like everything
 *     else) when that lands inside the budget;
 *   · otherwise cut at the last word boundary under the cap, never mid-word;
 *   · never return an empty string — a card with no title is worse than a
 *     repeated one, so the topic is the floor and it always exists.
 *
 * The category does NOT disappear: the callers print it above the headline as
 * `text-meta`, beside the city. It stops being the title and becomes what it
 * always was — the shelf the request sits on.
 */
export function requestHeadline(description: string | null | undefined, topic: string, cap = 80): string {
  const d = (description ?? '').replace(/\s+/g, ' ').trim()
  if (d === '') return topic
  // A sentence end only counts if there is a sentence before it — „. მეორე"
  // at index 0 is punctuation, not a heading.
  const stop = d.search(/[.!?]\s/)
  if (stop > 0 && stop <= cap) return d.slice(0, stop)
  if (d.length <= cap) return d
  const cut = d.slice(0, cap)
  const lastSpace = cut.lastIndexOf(' ')
  // A cap that lands inside the first word leaves nothing to break on; the
  // hard cut is right there, and it is still better than the topic.
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).replace(/[·,;:]$/, '') + '…'
}

export const OFFER_STATUS_LABEL: Record<OfferStatusName, string> = {
  // Not „მოწვევა": nothing was offered and nothing was promised — the client
  // started a conversation. The word has to say that, because on the expert's
  // screen it is the difference between „answer this" and „you have work".
  INVITED: 'მიმოწერა',
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
/**
 * ⚠️ `publicRef` IS NOT IN THIS SHAPE, AND MUST NOT BE ADDED (2026-08-17).
 *
 * It is the CLIENT'S ENTIRE CREDENTIAL. Possession of that string authorises
 * reading their private thread with us, writing to us as them, and POSTing
 * /api/requests/<ref>/accept — which settles the request, declines every rival,
 * and opens the client's phone number. The accept route checks nothing else, by
 * design, because the client has no account.
 *
 * It used to be here, and the detail page printed it in the eyebrow, so every
 * allowlisted provider read it on every open request BEFORE bidding. Removing
 * it from the TYPE rather than from the two render sites is deliberate: this is
 * the funnel every provider surface is shaped through, so a future card that
 * „just shows the reference" cannot compile.
 *
 * The same reasoning already keeps contactName / phone / email out of here —
 * `clientContactFor` is the one place allowed to reveal those.
 */
export type ProviderRequestRow = {
  id: string
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
    kind,
    kindLabel: KIND[kind].label,
    topic: r.topic,
    topicLabel: topicLabel(r.topic),
    // ⚠️ THE HEADLINE IS SHAPED HERE, not per page (2026-08-19). The queue, the
    // detail page it opens and the client's own list must call the same request
    // by the same name — a card headed one way and a page headed another is the
    // provider wondering whether they clicked the right row.
    headline: requestHeadline(r.description, topicLabel(r.topic)),
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

/**
 * Is the CLIENT'S IDENTITY open to this provider — i.e. was this offer chosen?
 *
 * ⚠️ THIS USED TO HAND OVER A PHONE NUMBER AND AN EMAIL, and on 2026-08-21 it
 * stopped. Owner: „მოდი ამ ეტაპზე იყოს მიწერა და ჩათში გარკვნენ, ნომერიც თუ
 * საჭიროა იქ გაცვალონ… არ უჩანდეს ეგრევე ტელეფონი." Everything the two sides
 * have to arrange, they arrange in the thread; if a number is genuinely needed
 * they type it to each other there, which after acceptance the masking already
 * allows (lib/requestChat → maskContacts, unchanged).
 *
 * WHAT THAT LEAVES THIS FUNCTION IS THE NAME, and the name alone. „კლიენტი"
 * until they choose you, the person's own name afterwards — one rule, still in
 * one place, still consumed by `offerPeerName` (lib/inboxRows) and by
 * `contactIsOpen` (lib/jobRows) rather than copied into either.
 *
 * ⚠️ AND THE COLUMNS DO NOT LEAVE THE SERVER ANY MORE. The three surfaces that
 * printed them (the provider's offers list, the offer thread pane, the client's
 * own page) no longer SELECT `phone`/`email` at all — a rule enforced by what
 * is fetched is a rule a future render cannot forget. The request still stores
 * them: the admin phones the client to verify the request, which is the one
 * reader that legitimately needs them.
 *
 * ⚠️ THE SECOND REASON, which is the owner's business and not privacy: the
 * contact IS the lead. Handing it over automatically the moment a client
 * chooses means the platform gives away, for free, the only thing it has to
 * sell. Whatever it eventually costs, it has to be opened by a deliberate act
 * that can carry a price — never printed on arrival.
 */
export function clientIdentityOpen(offer: { status: string }): boolean {
  return offer.status === 'ACCEPTED'
}

export type ProviderContact = {
  name: string
  /* ⚠️ NO `phone`, NO `email` (2026-08-21). The client used to be handed the
     chosen provider's number and address here, the mirror of what the provider
     was handed about them; both halves went the same day and for the same
     reason (see clientIdentityOpen above). The conversation is the channel. */
  /** The PUBLIC profile facts — what the client is entitled to see BEFORE
   *  choosing, because the profile page itself is public. The research point
   *  this carries: on every reference marketplace the client chooses by
   *  reviews, rating and profile, and an offer card reduced to a name forces
   *  them to choose by price alone. */
  profile?: { slug: string | null; verified: boolean; rating: number; reviewsCount: number } | null
}

/** One offer, as the CLIENT is allowed to see it. PUBLIC profile facts and the
 *  offer's own terms — no contact of any kind; see clientIdentityOpen. */
export function clientOfferView(o: {
  id: string
  priceGel: number
  /** How to read `priceGel` — see OFFER_PRICE_KINDS. Carried through to the
   *  client, because a number without its kind is three different offers. */
  priceKind: string
  daysEstimate: number | null
  message: string
  status: string
  createdAt: Date | string
  provider: ProviderContact
}) {
  const prof = o.provider.profile ?? null
  return {
    id: o.id,
    priceGel: o.priceGel,
    priceKind: o.priceKind,
    daysEstimate: o.daysEstimate,
    message: o.message,
    status: o.status,
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : o.createdAt.toISOString(),
    providerName: o.provider.name,
    // PUBLIC profile facts, shown before choosing — the profile page is public,
    // so withholding its address from the one screen where the choice happens
    // protects nothing and only degrades the choice.
    providerProfileHref: prof?.slug ? `/experts/${prof.slug}` : null,
    providerVerified: prof?.verified ?? false,
    // Null below the platform's own display floor: a rating computed from one
    // review is noise wearing a number, and the browse surfaces hide it too.
    providerRating: prof && prof.reviewsCount >= 1 && prof.rating > 0 ? prof.rating : null,
    providerReviews: prof?.reviewsCount ?? 0,
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
/* ═══════════ how somebody wants to be helped ════════════════════════════
 *
 * Asked in the wizard, one tap, before they send. Owner, 2026-08-18: „თუ
 * აირჩია, რომ ექსპერტებს მე ავარჩევ, მხოლოდ ამ შემთხვევაში უნდა ჰქონდეს
 * ღილაკი" — so this is a preference about a BUTTON, and deliberately not about
 * routing. Both modes reach experts; only one of them offers a list to write to.
 */
export const PICK_MODES = ['OFFERS', 'SELF'] as const
export type PickMode = (typeof PICK_MODES)[number]

/**
 * ⚠️ THE WORDS DEPEND ON THE VERTICAL (2026-08-18), and until now they did not.
 *
 * Both options said „ექსპერტი" on a run about a leaking tap. Worse, the SELF
 * hint promised „ნახავ ამ მიმართულების ექსპერტებს" — and on the trades side
 * that list is EMPTY 100% of the time: it is built from `tutorProfile` filtered
 * by `categoryId`, and no service request has ever carried one. Somebody tapped
 * a mode whose whole promise was a list, and got a screen identical to the
 * other mode. Measured on a real submission.
 *
 * The list itself is fixed in /api/requests/[ref]/status; this is the half that
 * decides what we PROMISE, and the two have to agree.
 */
export const PICK_MODE_OPTION: Record<PickMode, { label: string; hint: string }> = {
  OFFERS: { label: 'შეთავაზებები მომივიდეს', hint: 'დაგიკავშირდებიან და ფასს შემოგთავაზებენ' },
  SELF: { label: 'მე ავირჩევ', hint: 'ნახავ ვინ მუშაობს ამ მიმართულებით და თვითონ მისწერ' },
}

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
  // ⚠️ THE BAND IS THE ONLY WAY TO ANSWER IT AGAIN (2026-08-19). A second key,
  // `budgetAmount`, briefly let the client send a typed figure (owner,
  // 2026-08-18: „აქ ხელით უნდა იწერებოდეს"); it was removed the next day with
  // the field that fed it — see app/request/RequestWizard, budget step, for the
  // three reasons. A body still carrying that key is stripped by zod and then
  // refused by the band rule below, which is the correct outcome: the ladder is
  // the answer this row is built from.
  /** How they want to be helped. Defaults so a request written before this
   *  question existed still parses. */
  pickMode: z.enum(PICK_MODES).default('OFFERS'),
  budgetBand: z.string().trim().max(8).default(''),
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
  /**
   * ⚠️ REQUIRED SINCE 2026-08-17, AND IT USED TO BE OPTIONAL ON PURPOSE. The
   * old note said: „the whole flow runs on the phone number. An email is a
   * convenience for sending the reference, not a requirement to be helped."
   * That was a good rule and it was WRONG IN PRACTICE, because of something
   * outside this file: every automated message this subsystem sends a client —
   * an offer arrived, a provider replied, the 48-hour nudge — is an EMAIL, and
   * there is no SMS anywhere in the codebase. So „optional email" did not mean
   * „reachable by phone instead". It meant the system went permanently silent:
   *
   *     offers arrive   →  `if (to)`            →  nothing
   *     provider writes →  `else if (…email)`   →  nothing
   *     client nudge    →  `|| !r.email` → skip →  nothing
   *
   * A person who left only a phone got a code on a screen and was never
   * contacted again unless the operator happened to ring. In a market where
   * services run on the phone, that is most of them.
   *
   * ⚠️ THE HONEST FIX IS SMS, NOT THIS. Requiring an email adds friction to the
   * last screen before a submit, which is exactly where forms die — the old
   * rule knew that. This is the smaller wrong: a person who is asked for one
   * more field is annoyed, a person we never contact again is lost. When an SMS
   * channel exists, this goes back to optional and the note above becomes true
   * again. Until then it would be a lie.
   *
   * The DB column stays nullable: rows written before today have no email and
   * must still be readable, and every `if (email)` guard downstream stays for
   * exactly that reason.
   */
  email: z.string().trim().email().max(200),
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
  // ⚠️ A BUDGET IS REQUIRED, AND IT IS A BAND (2026-08-19). This said „a band
  // OR a typed amount" for one day; the typed half went with its field. The
  // rule below („a band, IF given, must be real") stays a SEPARATE refinement
  // so „you did not answer" and „that band does not exist" name themselves —
  // one „INVALID" on a four-step form leaves somebody hunting through screens
  // they already finished.
  .refine(v => v.budgetBand !== '', {
    path: ['budgetBand'], message: 'ბიუჯეტი მიუთითე',
  })
  .refine(v => isTopicOfKind(v.kind, v.topic), {
    path: ['topic'], message: 'ეს თემა ამ ტიპს არ ეკუთვნის',
  })
  // A band, IF given, must be one of this kind's own — see the note above for
  // why presence and validity are two refinements and not one.
  .refine(v => v.budgetBand === '' || bandOf(v.kind, v.budgetBand) !== undefined, {
    path: ['budgetBand'], message: 'ბიუჯეტი არასწორია',
  })
  // UNSTATED passes both money and timing: a message to ONE named provider asks
  // neither question, and a schema that refuses the answer it never asked for
  // is a form that cannot be submitted. See UNSTATED_BUDGET in requestTopics.
  .refine(v => v.timing === UNSTATED || TIMING[v.kind].some(t => t.id === v.timing), {
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
  // The band is resolved against the ladder, never taken from the body — the
  // `!` is safe because the refinements above already refused a request whose
  // band is missing or not this kind's.
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
    pickMode: input.pickMode,
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
/* ═══════════ how a price is meant ═══════════════════════════════════════
 *
 * ⚠️ ONE INTEGER WAS MAKING HONEST PEOPLE LIE. A consultant knows what an hour
 * costs; somebody driving out to look at a leak often does not, and a form that
 * demands a single number gets either an invented figure or no bid at all.
 * YouDo has carried „по договорённости" beside a fixed price for exactly this
 * reason, and Angi's whole instant-booking lane depends on knowing which offers
 * have a real number behind them.
 *
 * The kind also decides, later, whether an offer can be booked straight from a
 * calendar: a price that only exists after somebody looks at the job cannot be
 * agreed in advance.
 */
export const OFFER_PRICE_KINDS = ['FIXED', 'FROM', 'ON_SITE'] as const
export type OfferPriceKind = (typeof OFFER_PRICE_KINDS)[number]

/** What the provider picks, in their own words. */
export const OFFER_PRICE_KIND_LABEL: Record<OfferPriceKind, string> = {
  FIXED: 'ფიქსირებული',
  FROM: 'დან',
  ON_SITE: 'ადგილზე შევაფასებ',
}

/**
 * „80₾" · „80₾-დან" · „ვიზიტი 20₾, სამუშაო ადგილზე" — the price as the CLIENT
 * reads it.
 *
 * One function, so the offer card, the provider's list and the admin never
 * describe the same number three ways — the rule this file already applies to
 * budgets and timings.
 */
export function offerPriceLabel(priceGel: number, kind: string): string {
  const money = gel(priceGel)
  if (kind === 'FROM') return `${money}-დან`
  if (kind === 'ON_SITE') {
    // A free call-out is a selling point and has to say so — „0₾" would read as
    // an empty field.
    return priceGel > 0 ? `გამოძახება ${money} · სამუშაო ადგილზე` : 'გამოძახება უფასოდ · სამუშაო ადგილზე'
  }
  return money
}

/* ⚠️ `budgetFloorFor` LIVED HERE AND IS GONE (2026-08-19). It existed only
   because the budget could be TYPED — a floor is a property of a band id, so a
   numeric answer needed the band's top read back out as a number to be judged
   by the same rule. The typed field is gone (see app/request/RequestWizard,
   budget step), so the floor is a band property again and
   `budgetIsBelowFloor(kind, bandId)` in requestTopics is the whole of it. */

export const RequestOfferInput = z.object({
  requestId: z.string().trim().min(1).max(40),
  // Lari, whole. The floor is 1 because a free offer is not an offer — it is a
  // conversation, and there is no field here for one. The ceiling is 1 000 000,
  // matching the company balance top-up ceiling in the admin panel, so the two
  // places a person types a lari amount agree on what „too big to be a typo"
  // means. Int, because there is no tetri anywhere in this database.
  priceGel: z.number().int().min(0).max(1_000_000),
  /**
   * How to read the number above.
   *
   * ⚠️ ZERO IS LEGAL ONLY ON `ON_SITE`, and the refinement below is what says
   * so. „ვიზიტი უფასოა, სამუშაოს ადგილზე შევაფასებ" is a real offer with a real
   * zero in it; „0₾ ფიქსირებული" is somebody who has not filled the field in.
   * The database CHECK carries the same rule, so neither layer is load-bearing
   * alone.
   */
  priceKind: z.enum(OFFER_PRICE_KINDS).default('FIXED'),
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
}).refine(o => o.priceKind === 'ON_SITE' || o.priceGel > 0, {
  message: 'ფასი მიუთითე',
  path: ['priceGel'],
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

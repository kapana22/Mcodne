// WHAT PEOPLE CAN ASK FOR — the request system's own vocabulary.
//
// ⚠️ THIS IS NOT `Category`, AND IT MUST NEVER BECOME IT. The sphere taxonomy
// (prisma → Category, lib/professionSeo) describes what the EXPERTS ON THIS
// PLATFORM DO: it drives browse (/experts?category=), the counts and the SEO
// pages (/categories/∗ itself was retired in stage 8 — the catalogue filter is
// the sphere page now).
// Measured 2026-08-14 it holds 16 professional spheres and 91 professions, and
// not one school subject — so „ვეძებ ქიმიის მასწავლებელს" has nowhere to go in
// it. Adding „ქიმია" there would mint a sphere page with zero experts, which is
// an empty room with a URL.
//
// A REQUEST IS THE OTHER DIRECTION. It says what somebody NEEDS, and people
// need things this platform does not list yet — that is the whole point of
// asking instead of browsing. So this file is the demand-side vocabulary and it
// grows on its own schedule.
//
// The same argument, already settled once in this codebase: `B2BService
// .direction` is free text and deliberately NOT a Category FK, „because the
// sphere taxonomy describes what EXPERTS do and is admin-edited for the public
// catalogue. Borrowing it here would tie a B2B price list to a rename made for
// a different reason."
//
// ⚠️ IT IS BUILT TO REACH HUNDREDS OF ENTRIES WITHOUT A MIGRATION. The database
// stores `topic` as a plain string id, so adding a service is an edit to this
// array — no enum, no ALTER TYPE, no deploy ordering. That is deliberate: the
// product this belongs to (thumbtack / profi.ru shaped) is a few hundred
// services or it is not the product.
//
// `categorySlug` is the ONE place the two vocabularies touch: when a topic does
// map onto a live sphere, the admin panel can list the experts already on it.
// A topic with no slug is not broken — it is a need nobody on the platform
// serves yet, which is exactly the thing worth knowing.

/* ═══════════ the three shapes a need can have ═══════════════════════════
 *
 * ⚠️ CHOSEN BECAUSE EACH ONE CHANGES WHAT A LATER FIELD MEANS, not because
 * they make a tidy taxonomy. The test for adding a fourth is the same: does it
 * change the meaning of the budget or the timing? If not, it is a topic group,
 * not a kind.
 *
 *   LEARNING       repeats. The price is for ONE LESSON, and the second
 *                  question is „how often", not „by when".
 *   CONSULTATION   one conversation. The price is for ONE SESSION, and the
 *                  second question is „how soon".
 *   PROJECT        something delivered. The price is for THE WHOLE JOB, and the
 *                  second question is a deadline.
 *   SERVICE        somebody comes and does it. The price is for ONE VISIT, the
 *                  second question is a DATE, and there is a third thing no
 *                  other kind has: an address.
 *
 * A single budget enum cannot serve all four: „500–1000₾" and „20–40₾" are
 * both correct answers to „what is your budget" and they are not the same
 * question. That is the mistake `B2BService.kind` exists to undo, and this
 * splits the axis before it is made rather than after.
 *
 * ⚠️ WHY SERVICE IS NOT PROJECT (added 2026-08-17). It was the obvious place to
 * put a plumber and it is wrong on all three axes this file tests for:
 *
 *   money    a project is priced whole („რემონტი 8 000₾"); a visit is priced
 *            per call-out and the real number is often set ON SITE.
 *   time     a project has a DEADLINE — „ორ კვირაში". A visit has a DATE —
 *            somebody is at the door on Tuesday at 14:00. „By when" and „when"
 *            are not the same question and cannot share a column of options.
 *   place    a project can be done anywhere; a visit has an address, and it is
 *            the routing key, not a detail.
 *
 * Filed under PROJECT, „500₾-მდე" would have been the FLOOR band — so every
 * request to unblock a drain would have been refused on arrival as too cheap.
 * That is the concrete cost of the wrong kind, and it is why this is a fourth
 * one rather than a topic group.
 */
import { rankCandidates } from './topicMatch'

export const REQUEST_KINDS = ['LEARNING', 'MEETING', 'PROJECT', 'SERVICE'] as const
export type RequestKindName = (typeof REQUEST_KINDS)[number]

/** What the money is attached to. Snapshotted on the row rather than derived
 *  from `kind` at read time, for the same reason Booking snapshots its
 *  serviceType: changing the mapping later must not rewrite what somebody
 *  already answered. */
export const BUDGET_UNITS = ['PER_LESSON', 'PER_SESSION', 'TOTAL', 'PER_VISIT'] as const
export type BudgetUnitName = (typeof BUDGET_UNITS)[number]

export const KIND: Record<RequestKindName, {
  /** The word on the button. Plain — what any other site would say. */
  label: string
  /** One line under it. Says what it IS, never why it is good. */
  hint: string
  unit: BudgetUnitName
  /** „ერთ გაკვეთილზე" — the suffix every price of this kind is read with. */
  unitLabel: string
  /** The heading over the second question, which differs per kind. */
  timingLabel: string
}> = {
  LEARNING: {
    // ⚠️ „სწავლება", NOT „მასწავლებელი" (2026-08-19). This label sits in a row
    // with „კონსულტაცია", „სამუშაო" and „სერვისი" — three things somebody
    // BUYS and one kind of PERSON. The odd one out is the same mistake the
    // model retired with „ხელოსანი": a filter names what is being asked for,
    // never who does it.
    label: 'სწავლება',
    hint: 'გაკვეთილები, მომზადება, ენები',
    unit: 'PER_LESSON',
    unitLabel: 'ერთ გაკვეთილზე',
    timingLabel: 'რამდენად ხშირად',
  },
  // ⚠️ „შეხვედრა", AND IT WAS „კონსულტაცია" UNTIL 2026-08-24. The consultation
  // PRODUCT — a bookable slot, a calendar, a video room, a session price — was
  // removed that day; what remains is the SHAPE of the purchase, which is real:
  // an hour of a lawyer's or an accountant's time, agreed in the thread and
  // paid once. Deleting the shape instead of renaming it would have pushed
  // every such need onto the PROJECT ladder, whose floor is 500₾ — so a request
  // for a 100₾ meeting would have been refused on arrival. The word is gone;
  // the way people buy an hour is not.
  MEETING: {
    label: 'შეხვედრა',
    hint: 'ერთი შეხვედრა — ონლაინ ან ადგილზე',
    unit: 'PER_SESSION',
    unitLabel: 'ერთ შეხვედრაზე',
    timingLabel: 'როდის',
  },
  PROJECT: {
    label: 'სამუშაო',
    hint: 'კონკრეტული დავალება ან პროექტი',
    unit: 'TOTAL',
    unitLabel: 'მთლიანად',
    timingLabel: 'რა ვადაში',
  },
  SERVICE: {
    label: 'სერვისი',
    hint: 'სამუშაო ადგილზე — ბინაში, სახლში ან ოფისში',
    unit: 'PER_VISIT',
    unitLabel: 'ერთ გამოძახებაზე',
    // „როდის მოვიდეს" and not „როდის" — the difference is the whole kind. Every
    // other kind asks when the WORK happens; this one asks when a person is at
    // the door.
    timingLabel: 'როდის მოვიდეს',
  },
}

export function kindOf(raw: string | null | undefined): RequestKindName {
  return (REQUEST_KINDS as readonly string[]).includes(raw ?? '')
    ? (raw as RequestKindName)
    : 'MEETING' // the middle shape, and the safest thing to misread as
}

/* ═══════════ the money ══════════════════════════════════════════════════
 *
 * ⚠️ BANDS, AND THE ROW STORES THE NUMBERS. A person who does not know what
 * the work costs cannot type a figure, so they tap a range — but the range is
 * written to `budgetMin`/`budgetMax` as integers, not to an enum. Three
 * consequences, all of them the reason:
 *
 *   · adding a band is an edit to this array, never a migration;
 *   · the admin can sort and filter on real lari;
 *   · the same column means the same thing across all three kinds, because
 *     `budgetUnit` carries the difference instead of the value.
 *
 * `max: null` is the open top band. `floor: true` marks the band this platform
 * cannot serve — see `budgetIsBelowFloor`. It is refused ON ARRIVAL and the row
 * is STILL WRITTEN, because how many people arrive under the floor is exactly
 * what an early stage exists to find out.
 */
export type BudgetBand = { id: string; min: number; max: number | null; label: string; floor?: boolean }

export const BUDGET_BANDS: Record<RequestKindName, BudgetBand[]> = {
  // Per lesson. A 15₾ lesson is not a small budget, it is a different market —
  // and it is one this platform has nobody for.
  LEARNING: [
    { id: 'l0', min: 0,   max: 20,   label: '20₾-მდე', floor: true },
    { id: 'l1', min: 20,  max: 40,   label: '20–40₾' },
    { id: 'l2', min: 40,  max: 70,   label: '40–70₾' },
    { id: 'l3', min: 70,  max: 120,  label: '70–120₾' },
    { id: 'l4', min: 120, max: null, label: '120₾-ზე მეტი' },
  ],
  // Per session. Below 50₾ nobody here answers the phone for an hour.
  MEETING: [
    { id: 'c0', min: 0,   max: 50,   label: '50₾-მდე', floor: true },
    { id: 'c1', min: 50,  max: 100,  label: '50–100₾' },
    { id: 'c2', min: 100, max: 250,  label: '100–250₾' },
    { id: 'c3', min: 250, max: 500,  label: '250–500₾' },
    { id: 'c4', min: 500, max: null, label: '500₾-ზე მეტი' },
  ],
  // The whole job.
  PROJECT: [
    { id: 'p0', min: 0,     max: 500,   label: '500₾-მდე', floor: true },
    { id: 'p1', min: 500,   max: 1000,  label: '500–1 000₾' },
    { id: 'p2', min: 1000,  max: 3000,  label: '1 000–3 000₾' },
    { id: 'p3', min: 3000,  max: 7000,  label: '3 000–7 000₾' },
    { id: 'p4', min: 7000,  max: 15000, label: '7 000–15 000₾' },
    { id: 'p5', min: 15000, max: null,  label: '15 000₾-ზე მეტი' },
  ],
  // Per VISIT — the call-out plus the work, as a household actually reads a
  // bill. The floor is 30₾ because below it nobody crosses the city: a plumber's
  // bare call-out in Tbilisi is 30–50₾ before anything is touched, so „20₾-მდე"
  // is not a small budget, it is a request nobody will answer.
  //
  // ⚠️ FIVE BANDS THAT STOP AT 250₾+, deliberately. A whole bathroom is a
  // PROJECT and belongs on that ladder, which runs to 15 000₾. If this one grows
  // a 1 000₾ band it means the two kinds have blurred — the fix then is the
  // topic's `kinds`, not another band here.
  SERVICE: [
    { id: 's0', min: 0,   max: 30,   label: '30₾-მდე', floor: true },
    { id: 's1', min: 30,  max: 60,   label: '30–60₾' },
    { id: 's2', min: 60,  max: 120,  label: '60–120₾' },
    { id: 's3', min: 120, max: 250,  label: '120–250₾' },
    { id: 's4', min: 250, max: null, label: '250₾-ზე მეტი' },
  ],
}

/**
 * NOT STATED — the band a request carries when nobody was asked (2026-08-19).
 *
 * ⚠️ IT IS NOT IN `BUDGET_BANDS`, and that is the point: every picker on the
 * site builds its options from that record, so this can never appear as a
 * choice. It exists for the run that asks no money question at all — a message
 * written to ONE named provider, who will ask in the thread (see Draft.directTo
 * in app/request/_model). Without it that run submitted a draft the schema
 * refuses and every direct message died on „INVALID".
 *
 * `min: 0, max: null` reads as „unbounded", never as „cheap" — the row says
 * nothing about money rather than saying something false about it, and
 * `floor` is absent so it can never be refused on arrival for a number nobody
 * gave. `budgetLabel` renders it as words, not as „0₾+".
 */
export const UNSTATED = 'x'
export const UNSTATED_BUDGET: BudgetBand = { id: UNSTATED, min: 0, max: null, label: 'არ არის მითითებული' }

export function bandOf(kind: RequestKindName, bandId: string): BudgetBand | undefined {
  if (bandId === UNSTATED) return UNSTATED_BUDGET
  return BUDGET_BANDS[kind].find(b => b.id === bandId)
}

/** The timing of a run that was never asked — same reasoning as UNSTATED_BUDGET. */
export function isUnstated(id: string): boolean {
  return id === UNSTATED
}

/**
 * Is this band one the platform cannot serve?
 *
 * ⚠️ PER KIND, and that is the whole reason it is a function over data rather
 * than a comparison at the endpoint. „Under 500₾" is a floor for a project and
 * meaningless for a lesson; the first version of this rule was hard-coded to
 * the project band and would have refused every tutoring request on the site.
 */
export function budgetIsBelowFloor(kind: RequestKindName, bandId: string): boolean {
  return bandOf(kind, bandId)?.floor === true
}

/** „40–70₾ ერთ გაკვეთილზე" — one place, so the form, the provider card and the
 *  admin never describe the same number three ways. */
export function budgetLabel(kind: RequestKindName, min: number, max: number | null): string {
  // „0₾+" is what the arithmetic would print for a request nobody asked about
  // money, and it reads as a budget of nothing. Say the true thing instead.
  if (min === 0 && max === null) return UNSTATED_BUDGET.label
  const band = BUDGET_BANDS[kind].find(b => b.min === min && b.max === max)
  const range = band?.label ?? (max === null ? `${min.toLocaleString('en-US')}₾+` : `${min.toLocaleString('en-US')}–${max.toLocaleString('en-US')}₾`)
  return `${range} ${KIND[kind].unitLabel}`
}

/* ═══════════ the second question ════════════════════════════════════════
 *
 * ONE COLUMN, THREE MEANINGS, and the kind decides which. For a project it is a
 * deadline; for a consultation it is urgency; for learning it is FREQUENCY,
 * which is not a deadline at all — a weekly lesson has no „by when".
 *
 * A separate column per kind would leave two of them null on every row and
 * force every reader to know which one to look at. A DB enum cannot express it
 * either, because the legal set depends on another column — so zod validating
 * `timing ∈ TIMING[kind]` is a STRONGER guarantee than an enum ever gave here,
 * not a weaker one.
 */
export type TimingOption = { id: string; label: string }

export const TIMING: Record<RequestKindName, TimingOption[]> = {
  LEARNING: [
    { id: 'once_week',  label: 'კვირაში ერთხელ' },
    { id: 'twice_week', label: 'კვირაში ორჯერ' },
    { id: 'often',      label: 'კვირაში სამჯერ ან მეტი' },
    { id: 'intensive',  label: 'ინტენსიური კურსი' },
    { id: 'unsure',     label: 'ჯერ არ ვიცი' },
  ],
  MEETING: [
    { id: 'asap',      label: 'რაც შეიძლება მალე' },
    { id: 'this_week', label: 'ამ კვირაში' },
    { id: 'this_month',label: 'ამ თვეში' },
    { id: 'flexible',  label: 'დრო არ მაწვება' },
  ],
  PROJECT: [
    { id: 'urgent',    label: 'სასწრაფოდ' },
    { id: 'two_weeks', label: 'ორ კვირაში' },
    { id: 'one_month', label: 'ერთ თვეში' },
    { id: 'flexible',  label: 'დრო არ მაწვება' },
  ],
  // ⚠️ DAYS, NOT DURATIONS — the one place this kind visibly differs from
  // PROJECT one line above. „ორ კვირაში" is a deadline you measure backwards
  // from; „ხვალ" is a day somebody knocks on the door. A household that needs a
  // leak stopped is answering „when can you come", and every option here is a
  // point in time rather than a window to finish inside.
  //
  // These stay BUCKETS rather than a calendar for now, and that is honest at
  // this stage: a real date needs the provider's availability behind it, and
  // there is no service provider in the model yet to have any. „ზუსტ დროს
  // შევათანხმებთ" is what the offer thread is for.
  SERVICE: [
    { id: 'today',      label: 'დღეს' },
    { id: 'tomorrow',   label: 'ხვალ' },
    { id: 'this_week',  label: 'ამ კვირაში' },
    { id: 'next_week',  label: 'მომავალ კვირას' },
    { id: 'flexible',   label: 'არ მეჩქარება' },
  ],
}

export function timingLabel(kind: RequestKindName, id: string): string {
  if (id === UNSTATED) return 'არ არის მითითებული'
  return TIMING[kind].find(t => t.id === id)?.label ?? id
}

/* ═══════════ the clarifying questions ═══════════════════════════════════
 *
 * WHAT A PROVIDER CANNOT QUOTE WITHOUT. „ქიმია, 40–70₾, კვირაში ორჯერ" still
 * does not say whether the student is a fifth-grader or an აბიტურიენტი — and
 * that difference IS the price. One tap each, asked on the details step, stored
 * in the `details` JSON column, shown everywhere the request is read.
 *
 * PER KIND TODAY, BUILT TO GO PER TOPIC. The lookup (`extrasFor`) takes the
 * topic as well as the kind, so the day a wedding photographer needs „რამდენი
 * საათი?" the question is added HERE and every screen already renders it —
 * no schema change, no new component. That is the thumbtack shape: hundreds of
 * services, each asking its own two questions.
 *
 * Every question is OPTIONAL on purpose. A required tap-row is a place the
 * wizard can strand somebody whose honest answer is „none of these"; an
 * unanswered clarification is simply absent from the card, and the provider
 * asks on the phone — which is where it would have been asked before this
 * existed. zod still refuses an answer that is not on the list.
 */
export type ExtraQuestion = { id: string; label: string; options: readonly { id: string; label: string }[] }

/* ⚠️ THE SCHOOL FRAME IS NOT THE SITE (2026-08-30). „ვისთვის: დაწყებითი
   კლასები / სკოლის მოსწავლე / აბიტურიენტი" was asked of EVERY learning
   request, whatever the subject — so somebody who wanted to learn
   ვებდეველოპმენტი was asked which year of school they were in. Owner: „როცა
   ვებ დეველოპერთან კავშირი მინდა, რატომ უნდა მინდოდეს რომ ავირჩიო
   დაწყებითების კლასი".
   The audience question is real, and it belongs to a SHAPE of subject rather
   than to the kind: a fifth-grader's chemistry has an audience, React does
   not. `SCHOOLING_GROUPS` below is the list where the learner really is a
   pupil; everywhere else the question is simply not asked. */
const AUDIENCE_SCHOOL: ExtraQuestion = {
  id: 'audience',
  label: 'ვისთვის',
  options: [
    { id: 'primary',   label: 'დაწყებითი კლასები' },
    { id: 'pupil',     label: 'სკოლის მოსწავლე' },
    { id: 'abiturient',label: 'აბიტურიენტი' },
    { id: 'student',   label: 'სტუდენტი' },
    { id: 'adult',     label: 'ზრდასრული' },
  ],
}

/** Universal to LEARNING — a beginner and an advanced learner are not the
 *  same hour's work, whatever the subject. */
const LEVEL: ExtraQuestion = {
  id: 'level',
  label: 'რა დონეა',
  options: [
    { id: 'beginner',     label: 'დამწყები' },
    { id: 'intermediate', label: 'საშუალო' },
    { id: 'advanced',     label: 'მაღალი' },
    { id: 'unsure',       label: 'არ ვიცი' },
  ],
}

/* ⚠️ MEETING ASKS NOTHING HERE, AND THAT IS THE ANSWER — checked 2026-08-30.
   The obvious clarifier to add was „ონლაინ თუ პირისპირ", and it would have been
   the SECOND time the wizard asked it: `stepsFor` already pushes a whole
   `format` step titled „ონლაინ თუ ადგილზე?" for every kind but SERVICE
   (app/request/_model.ts), it is stored in its own column, and the request page
   prints it as „ფორმატი". A clarifier beside it would have been the same
   question in a second vocabulary. Owner: „არ უნდა იყოს გართულებული." */

/* ⚠️ PROJECT DELIBERATELY ASKS NOTHING. It asked nothing before this change
   either — the difference is that it is now a decision instead of a gap.
   Owner, 2026-08-30: „ყველაფერი უნდა იყოს სიმარტივისკენ წაყვანილი… ჯერ
   მინიმალური ინფორმაცია უნდა გამოვითხოვოთ." A project already carries a
   description, a budget band and a deadline; a fifth tap before the request is
   filed buys the provider nothing the description does not already say. */

/** Subjects whose learner is a pupil. Everywhere else the audience question is
 *  not asked at all — see AUDIENCE_SCHOOL. */
const SCHOOLING_GROUPS = new Set(['school', 'exams', 'higher', 'languages', 'arts', 'sport'])

/** ⚠️ „სად: ბინაში / კერძო სახლში / ოფისში" IS NOT A UNIVERSAL QUESTION. It was
 *  asked of every SERVICE request, so a website was asked which flat to come
 *  to. Work that physically happens at an address is listed here; a service
 *  delivered over a wire is not asked where. */
const ONSITE_GROUPS = new Set(['cleaning', 'plumbing', 'electrical', 'repairs', 'appliances', 'moving', 'outdoor', 'systems', 'property'])

/**
 * What a visiting master cannot quote without.
 *
 * ONE QUESTION, and holding it to one is the point. „ბინა" and „კერძო სახლი"
 * are different jobs at the same task — a house has stairs, a yard, its own
 * water, and two hours more of it — so this single tap moves the price more
 * than any sentence the client would write. Everything else a master needs
 * (which floor, is there a lift, how many rooms) belongs in the description or
 * the offer thread, where it costs no screen.
 */
const SERVICE_EXTRAS: ExtraQuestion[] = [
  {
    id: 'property',
    label: 'სად',
    options: [
      { id: 'flat',   label: 'ბინაში' },
      { id: 'house',  label: 'კერძო სახლში' },
      { id: 'office', label: 'ოფისში' },
      { id: 'other',  label: 'სხვაგან' },
    ],
  },
]

/* ── the per-TOPIC questions ───────────────────────────────────────────────
 *
 * ⚠️ THIS IS THE LEAD'S QUALITY, AND ON A PAID-LEAD PLATFORM THAT IS THE
 * PRODUCT (owner, 2026-08-17: the expert will pay for the lead). The failure
 * mode of every comparable marketplace is documented and identical: the expert
 * pays, opens the request, finds it says „მანქანის შეკეთება · 60–120₾", cannot
 * quote from it, phones, gets no answer, and writes the review that costs the
 * platform its supply. Bark's own users measure it — roughly 44% of paid leads
 * ever respond.
 *
 * A generic form cannot fix that, because what makes a request quotable differs
 * per TRADE and not per kind: a car needs a model and a symptom, a
 * waterproofing job needs an area and where the water is coming in, a move needs
 * a floor and a lift. Two taps each, and they are the difference between a lead
 * an expert can price and one they have to ring about.
 *
 * ⚠️ KEYED BY GROUP, NOT BY TOPIC ID, deliberately. Every plumbing topic wants
 * the same two questions; writing them per topic would be 39 copies to keep in
 * step. A topic may still override its group later — the lookup below reads the
 * topic first — and that is exactly how a single unusual service gets its own
 * question without disturbing its neighbours.
 *
 * ⚠️ ALL OPTIONAL, like every other clarifier here. „არ ვიცი" is a real answer
 * from somebody whose boiler is leaking, and a required tap-row is a place the
 * wizard can strand them.
 */
const GROUP_EXTRAS: Record<string, ExtraQuestion[]> = {
  plumbing: [
    {
      id: 'urgency',
      label: 'რა პრობლემაა',
      options: [
        { id: 'flooding', label: 'წყალი ახლა გადმოდის' },
        { id: 'dripping', label: 'წვეთავს' },
        { id: 'broken',   label: 'არ მუშაობს' },
        { id: 'install',  label: 'ახლის დაყენება' },
      ],
    },
  ],
  electrical: [
    {
      id: 'scope',
      label: 'რამდენი წერტილია',
      options: [
        { id: 'one',    label: 'ერთი' },
        { id: 'few',    label: 'რამდენიმე' },
        { id: 'room',   label: 'მთელი ოთახი' },
        { id: 'whole',  label: 'მთელი ბინა ან სახლი' },
      ],
    },
  ],
  appliances: [
    {
      id: 'symptom',
      label: 'რა ემართება',
      options: [
        { id: 'dead',    label: 'საერთოდ არ ირთვება' },
        { id: 'noise',   label: 'ხმაურობს' },
        { id: 'leak',    label: 'წყალს უშვებს' },
        { id: 'partial', label: 'ნაწილობრივ მუშაობს' },
      ],
    },
  ],
  moving: [
    {
      id: 'lift',
      label: 'ლიფტი',
      options: [
        { id: 'both',  label: 'ორივე მხარეს' },
        { id: 'one',   label: 'ერთ მხარეს' },
        { id: 'none',  label: 'არცერთ მხარეს' },
        { id: 'ground', label: 'პირველ სართულზე' },
      ],
    },
  ],
  cleaning: [
    {
      id: 'size',
      label: 'რამდენი ოთახია',
      options: [
        { id: 'studio', label: 'სტუდიო' },
        { id: 'r2',     label: '2 ოთახი' },
        { id: 'r3',     label: '3 ოთახი' },
        { id: 'r4',     label: '4 ან მეტი' },
      ],
    },
  ],
  repairs: [
    {
      id: 'material',
      label: 'მასალა ვინ იყიდის',
      options: [
        { id: 'mine',    label: 'მე' },
        { id: 'master',  label: 'ექსპერტი' },
        { id: 'unsure',  label: 'ჯერ არ ვიცი' },
      ],
    },
  ],
}

/** Which group a topic belongs to.
 *
 * ⚠️ BUILT LAZILY, and it has to be: this function is declared ABOVE
 * `TOPIC_GROUPS` (the questions read better beside each other than three hundred
 * lines apart), and a `const` initialised from it at module load would throw
 * „used before its declaration" — in a file `middleware.ts` imports, which means
 * every route on the site. Built on the first lookup and kept. */
let groupOfTopic: Map<string, string> | null = null
/** ⚠️ EXPORTED 2026-09-02 so a SAVED request can find its family mark. The
 *  client's own list (app/me/_requests) draws `topicGroupMark(groupId)` beside
 *  each row, and a request row stores a topic id — the group is one map read
 *  away and was already built here for `extrasFor`. Pure, no JSX, so nothing
 *  about `middleware.ts` importing this file changes. */
export function groupIdOf(topicId: string): string | undefined {
  if (!groupOfTopic) {
    groupOfTopic = new Map(TOPIC_GROUPS.flatMap(g => g.topics.map(t => [t.id, g.id] as const)))
  }
  return groupOfTopic.get(topicId)
}

/**
 * The questions for THIS request.
 *
 * Order matters and it is the order a master asks on the phone: WHAT the object
 * is (the kind-wide question), then the trade's own detail. Both are one tap.
 */
export function extrasFor(kind: RequestKindName, topic?: string): ExtraQuestion[] {
  /* ⚠️ THE TOPIC DECIDES, NOT THE KIND (2026-08-30). This function used to read
     `if (kind === 'LEARNING') return LEARNING_EXTRAS` and hand the SAME two
     school questions to every subject, then `if (kind !== 'SERVICE') return []`
     and hand MEETING and PROJECT nothing at all. Measured on „ვებდეველოპმენტი"
     before the change: LEARNING asked which year of school, SERVICE asked which
     flat to come to, MEETING and PROJECT asked nothing. Four kinds, four wrong
     answers, for a topic the site sells.
     The docstring above this block already promised „PER KIND TODAY, BUILT TO GO
     PER TOPIC" — the lookup took `topic` and used it on one branch out of four.
     It uses it on all of them now.
     AND IT ASKS LESS THAN IT DID. Owner: „ჯერ მინიმალური ინფორმაცია უნდა
     გამოვითხოვოთ." A skill subject drops from two questions to one, a digital
     service from one to none, and a meeting gains the single question it cannot
     be arranged without. Nothing here asks a second time what the description
     already says. */
  const group = topic ? groupIdOf(topic) : undefined
  switch (kind) {
    case 'LEARNING':
      /* ⚠️ THE DEFAULT IS THE SIMPLE ONE, and that is the whole point of the
         rule. An unlisted group — a new one, or „სხვა" typed by hand — gets the
         level question and nothing else. The school pair is opt-IN, held by the
         six groups whose learner really is a pupil, so the frame can never
         spread back over the catalogue as it grows. Owner: „ზოგადადი უნდა იყოს
         რომ ყველაფერს ერგებოდეს." */
      return SCHOOLING_GROUPS.has(group ?? '') ? [AUDIENCE_SCHOOL, LEVEL] : [LEVEL]
    case 'MEETING':
    case 'PROJECT':
      // Both already carry description, budget, timing — and MEETING carries
      // the format step too. Nothing here is worth a fifth tap.
      return []
    case 'SERVICE': {
      // The per-trade question is the sharp one („წყალი ახლა გადმოდის") and it
      // is only ever defined for work that happens at an address, so it rides
      // with the place question rather than beside it.
      // Same rule, same direction: „სად" is opt-in, held by the groups whose
      // work has an address. Anything else — and anything new — asks nothing.
      if (!ONSITE_GROUPS.has(group ?? '')) return []
      return [...SERVICE_EXTRAS, ...(GROUP_EXTRAS[group ?? ''] ?? [])]
    }
  }
}

/**
 * The stored bag, validated and STRIPPED — unknown keys and off-list answers do
 * not survive to the database. Returns null when nothing legal remains, so the
 * column reads „nothing to clarify" rather than `{}`.
 */
export function normalizeExtras(
  kind: RequestKindName,
  topic: string,
  raw: unknown,
): Record<string, string> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const questions = extrasFor(kind, topic)
  const out: Record<string, string> = {}
  for (const q of questions) {
    const v = (raw as Record<string, unknown>)[q.id]
    if (typeof v === 'string' && q.options.some(o => o.id === v)) out[q.id] = v
  }
  return Object.keys(out).length ? out : null
}

/** „ვისთვის: აბიტურიენტი · რა დონეა: საშუალო" — the rendered answers, in the
 *  questions' own order. Empty array when there is nothing to say. */
export function extrasLabels(
  kind: RequestKindName,
  topic: string,
  details: unknown,
): { label: string; value: string }[] {
  const bag = normalizeExtras(kind, topic, details)
  if (!bag) return []
  return extrasFor(kind, topic)
    .filter(q => bag[q.id])
    .map(q => ({ label: q.label, value: q.options.find(o => o.id === bag[q.id])!.label }))
}

/* ═══════════ where ══════════════════════════════════════════════════════
 *
 * Format before city, deliberately. For most of this catalogue „ონლაინ" makes
 * the city irrelevant, and asking a question whose answer does not matter is
 * how a four-step form becomes a six-step one.
 */
/**
 * ⚠️ TWO LISTS, THE SAME SPLIT THE CITIES USE — and for the same two reasons.
 *
 * `ALL_FORMATS` is the VOCABULARY: every id the `format` column has ever
 * stored. It may never shrink. Rows written before 2026-08-31 carry EITHER, and
 * six surfaces render one through `formatLabel` — the admin table, the
 * provider's job page, the client's own request page and the notification mail
 * — every one of which would print „EITHER" as a raw latin id the day the list
 * forgot it.
 *
 * `FORMATS` is what the wizard OFFERS TODAY. Owner, 2026-08-31: „სულერთია
 * წაშალე. იყოს ადგილზე და ონლაინ." „სულერთია" asked the client to decline to
 * answer and handed the decision to whoever read the request later; with one
 * city the question is a clean binary, and a two-row screen is one tap either
 * way. Offering it again is one line here.
 */
export const ALL_FORMATS = [
  { id: 'ONLINE',   label: 'ონლაინ' },
  { id: 'IN_PERSON',label: 'ადგილზე' },
  { id: 'EITHER',   label: 'სულერთია' },
] as const
export type FormatName = (typeof ALL_FORMATS)[number]['id']

/** The formats offered today — see above. */
export const FORMATS: readonly { id: FormatName; label: string }[] =
  ALL_FORMATS.filter(f => f.id !== 'EITHER')

export function formatLabel(id: string): string {
  // Reads the VOCABULARY, never the offered list: an old row must still say
  // „სულერთია" rather than „EITHER". Same contract as `cityLabel`.
  return ALL_FORMATS.find(f => f.id === id)?.label ?? id
}

/**
 * ⚠️ TWO LISTS, AND THE SPLIT IS THE WHOLE POINT (2026-08-20).
 *
 * `ALL_CITIES` is the VOCABULARY: every id this database has ever stored. It
 * may never shrink. Rows written before today carry BATUMI and RUSTAVI, and a
 * vocabulary that forgets them would render „BATUMI" as a raw latin id on an
 * admin screen, or throw where a label is required.
 *
 * `CITIES` is what the site OFFERS TODAY. Owner, 2026-08-20: „მხოლოდ
 * თბილისში იყოს ჯერ ჯობია." Every picker, filter and validator reads this one,
 * so serving a second city again is one line here — the same contract the
 * budget ladder and the feature flags already use.
 *
 * Why offering fewer cities than we accept is correct rather than sloppy: a
 * marketplace with nobody in Batumi that still ASKS „which city?" collects
 * requests it cannot route and tells the person, after they have typed their
 * name and number, that nobody is coming. The narrower list is the honest one.
 */
export const ALL_CITIES = [
  { id: 'TBILISI', label: 'თბილისი' },
  { id: 'BATUMI',  label: 'ბათუმი' },
  { id: 'KUTAISI', label: 'ქუთაისი' },
  { id: 'RUSTAVI', label: 'რუსთავი' },
  { id: 'OTHER',   label: 'სხვა' },
] as const
export type CityName = (typeof ALL_CITIES)[number]['id']

/** The cities served today. Add one back and every surface follows. */
export const CITIES: readonly { id: CityName; label: string }[] = ALL_CITIES.filter(c => c.id === 'TBILISI')

/** True while the question „which city?" has exactly one answer, and therefore
 *  must not be asked — the same rule that stopped asking a plumber whether the
 *  job is online. See stepsFor in app/request/_model. */
export const ONE_CITY = CITIES.length === 1

export function cityLabel(id: string): string {
  // Reads the VOCABULARY, never the offered list: an old row must still say
  // „ბათუმი" rather than „BATUMI".
  return ALL_CITIES.find(c => c.id === id)?.label ?? id
}

/* ═══════════ WHAT YOU CAN ASK FOR ═══════════════════════════════════════
 *
 * `id` is what the DATABASE stores, so it is a stable latin slug and MUST NEVER
 * be renamed — the label above it can change freely, and that is the point of
 * separating them. `alt` holds the other words people actually type; Georgian
 * declines heavily, so the search matches on stems as well (see `searchTopics`).
 *
 * A group declares which kinds it belongs to. „სასკოლო საგნები" is LEARNING
 * only; „სამართალი" is both a conversation and a job, so it carries two.
 */
export type Topic = {
  id: string
  label: string
  alt?: string[]
  /** The live sphere whose experts could serve this, when one exists. */
  categorySlug?: string
  /**
   * The PROFESSIONS (job labels from lib/professions) that answer this need —
   * stage 8 (2026-08-19), CONSULTATION / PROJECT topics only. The second and
   * narrower place the two vocabularies touch: `categorySlug` says which
   * SPHERE, this says which PERSON, and routing (lib/requestRouting) mails an
   * expert whose `TutorProfile.professions` names one of these — union the
   * sphere match. Set only where the mapping is obvious; absent is „the sphere
   * alone decides", not a gap. ⚠️ NEVER on a LEARNING or SERVICE topic: a
   * school subject is not a profession and a trade is not an expert
   * (tests/taxonomy.test.ts pins both).
   */
  professions?: string[]
}

export type TopicGroup = {
  id: string
  label: string
  kinds: readonly RequestKindName[]
  topics: Topic[]
  /** The description scaffold for this direction — see TEMPLATES below. */
  template?: string
}

const L = ['LEARNING'] as const
const CP = ['MEETING', 'PROJECT'] as const
/** ⚠️ ONE KIND, ON PURPOSE — so the „აირჩიე ტიპი" screen never appears for a
 *  service. „მჭირდება სანტექნიკოსი" is not ambiguous between a consultation and
 *  a job, and asking would be the wizard performing a choice nobody has. */
const S = ['SERVICE'] as const

export const TOPIC_GROUPS: TopicGroup[] = [
  /* ── learning ─────────────────────────────────────────────────────── */
  {
    id: 'school', label: 'სასკოლო საგნები', kinds: L,
    template: 'ვინ ისწავლის: … კლასის მოსწავლე\nამჟამინდელი დონე: …\nმიზანი: … (ნიშნის გასწორება / გამოცდა / საფუძვლიანად სწავლა)',
    topics: [
      { id: 'math',      label: 'მათემატიკა', alt: ['ალგებრა', 'გეომეტრია'] },
      { id: 'physics',   label: 'ფიზიკა' },
      { id: 'chemistry', label: 'ქიმია' },
      { id: 'biology',   label: 'ბიოლოგია' },
      { id: 'geo-lang',  label: 'ქართული ენა და ლიტერატურა', alt: ['ქართული'] },
      { id: 'history',   label: 'ისტორია' },
      { id: 'geography', label: 'გეოგრაფია' },
      { id: 'civics',    label: 'სამოქალაქო განათლება' },
      { id: 'informatics', label: 'ინფორმატიკა', alt: ['კომპიუტერი'] },
      { id: 'primary',   label: 'დაწყებითი კლასები', alt: ['პირველი კლასი', 'ბავშვი'] },
    ],
  },
  {
    id: 'exams', label: 'გამოცდები', kinds: L,
    template: 'რომელი გამოცდა და როდის: …\nამჟამინდელი დონე ან ქულა: …\nსამიზნე ქულა: …',
    topics: [
      { id: 'nat-exams', label: 'ეროვნული გამოცდები', alt: ['აბიტურიენტი', 'ერთიანი'] },
      { id: 'school-final', label: 'საატესტატო გამოცდები' },
      { id: 'master-exams', label: 'სამაგისტრო გამოცდები' },
      { id: 'ielts',     label: 'IELTS' },
      { id: 'toefl',     label: 'TOEFL' },
      { id: 'sat',       label: 'SAT' },
      { id: 'gre-gmat',  label: 'GRE / GMAT' },
    ],
  },
  {
    id: 'languages', label: 'ენები', kinds: L,
    template: 'ვინ ისწავლის: …\nამჟამინდელი დონე: … (ნულიდან / საშუალო / კარგად)\nრისთვის მჭირდება: … (სამსახური / გამოცდა / ემიგრაცია)',
    topics: [
      { id: 'english',   label: 'ინგლისური' },
      { id: 'german',    label: 'გერმანული' },
      { id: 'french',    label: 'ფრანგული' },
      { id: 'italian',   label: 'იტალიური' },
      { id: 'spanish',   label: 'ესპანური' },
      { id: 'russian',   label: 'რუსული' },
      { id: 'turkish',   label: 'თურქული' },
      { id: 'chinese',   label: 'ჩინური' },
      { id: 'arabic',    label: 'არაბული' },
      { id: 'geo-foreign', label: 'ქართული უცხოელებისთვის' },
    ],
  },
  {
    id: 'higher', label: 'უმაღლესი და პროფესიული', kinds: L,
    template: 'სად ვსწავლობ: …\nრომელი საგანი/თემა მიჭირს: …\nმიზანი: … (გამოცდა / ნაშრომი / სესია)',
    topics: [
      { id: 'economics-l', label: 'ეკონომიკა' },
      { id: 'accounting-l', label: 'ბუღალტერია', categorySlug: 'tax' },
      { id: 'statistics-l', label: 'სტატისტიკა' },
      { id: 'law-l',        label: 'სამართალი', categorySlug: 'law' },
      { id: 'management-l', label: 'მენეჯმენტი', categorySlug: 'business' },
      { id: 'finance-l',    label: 'ფინანსები', categorySlug: 'finance' },
      { id: 'medicine-l',   label: 'სამედიცინო საგნები' },
    ],
  },
  {
    id: 'digital', label: 'პროგრამირება და ციფრული', kinds: L,
    template: 'ამჟამინდელი დონე: … (ნულიდან / ცოტა ვიცი)\nმიზანი: … (სამსახური / საკუთარი პროექტი)\nკვირაში დრო მაქვს: … საათი',
    topics: [
      { id: 'python',     label: 'Python' },
      { id: 'javascript', label: 'JavaScript', alt: ['ჯავასკრიპტი'] },
      { id: 'webdev-l',   label: 'ვებდეველოპმენტი', categorySlug: 'it' },
      { id: 'data-l',     label: 'მონაცემთა ანალიზი', alt: ['data analysis'] },
      { id: 'ai-l',       label: 'ხელოვნური ინტელექტი', alt: ['AI'] },
      { id: 'excel',      label: 'Excel', alt: ['ექსელი'] },
      { id: 'design-l',   label: 'გრაფიკული დიზაინი', categorySlug: 'design' },
      { id: 'video-l',    label: 'ვიდეომონტაჟი' },
    ],
  },
  {
    id: 'arts', label: 'მუსიკა და ხელოვნება', kinds: L,
    template: 'ვინ ისწავლის: …\nგამოცდილება: … (ნულიდან / მისწავლია)\nმიზანი: …',
    topics: [
      { id: 'piano',   label: 'ფორტეპიანო' },
      { id: 'guitar',  label: 'გიტარა' },
      { id: 'vocal',   label: 'ვოკალი', alt: ['სიმღერა'] },
      { id: 'violin',  label: 'ვიოლინო' },
      { id: 'drawing', label: 'ხატვა და ფერწერა' },
      { id: 'photo-l', label: 'ფოტოგრაფია' },
      { id: 'acting',  label: 'მსახიობობა' },
    ],
  },
  {
    id: 'sport', label: 'სპორტი და ჯანმრთელობა', kinds: L,
    template: 'ვისთვის: …\nგამოცდილება: …\nმიზანი: … (ფორმა / შეჯიბრი / ჯანმრთელობა)',
    topics: [
      { id: 'fitness',  label: 'ფიტნესი', categorySlug: 'health' },
      { id: 'yoga',     label: 'იოგა', categorySlug: 'health' },
      { id: 'swimming', label: 'ცურვა' },
      { id: 'chess',    label: 'ჭადრაკი' },
      { id: 'dance',    label: 'ცეკვა' },
      { id: 'tennis',   label: 'ჩოგბურთი' },
    ],
  },

  /* ── professional: consultation and project alike ──────────────────── */
  {
    id: 'business', label: 'ბიზნესი და სტრატეგია', kinds: CP,
    template: 'რა მაქვს: … (მოქმედი ბიზნესი / იდეა)\nსფერო: …\nკონკრეტულად რაში მჭირდება დახმარება: …',
    topics: [
      { id: 'business-plan', label: 'ბიზნესგეგმა', categorySlug: 'business', professions: ['ბიზნეს-კონსულტანტი', 'ბიზნესგეგმის სპეციალისტი'] },
      { id: 'strategy',      label: 'სტრატეგია', categorySlug: 'business', professions: ['ბიზნეს-კონსულტანტი', 'ბრენდ-სტრატეგი'] },
      { id: 'startup',       label: 'სტარტაპი', categorySlug: 'business' },
      { id: 'operations',    label: 'ოპერაციები და პროცესები', categorySlug: 'business', professions: ['ოპერაციების მენეჯერი'] },
      { id: 'project-mgmt',  label: 'პროექტის მართვა', categorySlug: 'business', professions: ['პროექტის მენეჯერი'] },
      { id: 'franchise',     label: 'ფრანშიზა', categorySlug: 'business' },
    ],
  },
  {
    id: 'finance', label: 'ფინანსები და გადასახადები', kinds: CP,
    template: 'საქმიანობა: … (შპს / ინდმეწარმე / ფიზიკური პირი)\nრა მჭირდება: …\nპერიოდი ან მოცულობა: …',
    topics: [
      { id: 'accounting',  label: 'ბუღალტერია', categorySlug: 'tax', professions: ['ბუღალტერი'] },
      { id: 'declaration', label: 'დეკლარაცია', alt: ['გადასახადი', 'RS'], categorySlug: 'tax', professions: ['ბუღალტერი', 'საგადასახადო კონსულტანტი'] },
      { id: 'vat',         label: 'დღგ', categorySlug: 'tax', professions: ['ბუღალტერი', 'საგადასახადო კონსულტანტი'] },
      { id: 'audit',       label: 'აუდიტი', categorySlug: 'tax', professions: ['აუდიტორი'] },
      { id: 'fin-analysis',label: 'ფინანსური ანალიზი', categorySlug: 'finance', professions: ['ფინანსური ანალიტიკოსი', 'ფინანსური დირექტორი'] },
      { id: 'investment',  label: 'ინვესტიციები', categorySlug: 'finance', professions: ['საინვესტიციო კონსულტანტი'] },
      { id: 'crypto',      label: 'კრიპტო', categorySlug: 'crypto', professions: ['კრიპტოს კონსულტანტი'] },
    ],
  },
  {
    id: 'law', label: 'სამართალი', kinds: CP,
    template: 'სიტუაცია მოკლედ: …\nვინ არის მეორე მხარე: …\nრა შედეგი მინდა: …',
    topics: [
      { id: 'contract',   label: 'ხელშეკრულება', alt: ['იურისტი', 'ადვოკატი', 'ხელშეკრულების შედგენა', 'კონტრაქტი'], categorySlug: 'law', professions: ['იურისტი', 'ადვოკატი'] },
      { id: 'labor-law',  label: 'შრომითი დავა', categorySlug: 'law', professions: ['შრომითი სამართლის სპეციალისტი', 'იურისტი'] },
      { id: 'family-law', label: 'საოჯახო სამართალი', alt: ['განქორწინება'], categorySlug: 'law', professions: ['საოჯახო სამართლის სპეციალისტი', 'ადვოკატი'] },
      { id: 'corp-law',   label: 'კორპორატიული სამართალი', categorySlug: 'law', professions: ['კორპორატიული იურისტი'] },
      { id: 'ip-law',     label: 'ინტელექტუალური საკუთრება', categorySlug: 'law', professions: ['ინტელექტუალური საკუთრების იურისტი'] },
      { id: 'court',      label: 'სასამართლო დავა', alt: ['ადვოკატი', 'იურისტი', 'სარჩელი'], categorySlug: 'law', professions: ['ადვოკატი'] },
      { id: 'company-reg',label: 'კომპანიის რეგისტრაცია', categorySlug: 'law' },
    ],
  },
  {
    id: 'marketing', label: 'მარკეტინგი და გაყიდვები', kinds: CP,
    template: 'პროდუქტი ან სერვისი: …\nმიზანი: … (გაყიდვები / ცნობადობა)\nდღეს რა არხები მაქვს: …',
    topics: [
      { id: 'smm',       label: 'SMM და სოციალური ქსელები', categorySlug: 'marketing', professions: ['SMM სპეციალისტი', 'მარკეტოლოგი'] },
      { id: 'seo',       label: 'SEO', categorySlug: 'marketing', professions: ['SEO სპეციალისტი'] },
      { id: 'ads',       label: 'რეკლამა', alt: ['Google Ads', 'Facebook'], categorySlug: 'marketing', professions: ['რეკლამის სპეციალისტი', 'მარკეტოლოგი'] },
      { id: 'branding',  label: 'ბრენდინგი', categorySlug: 'marketing', professions: ['ბრენდ-სტრატეგი'] },
      { id: 'content',   label: 'კონტენტი და კოპირაითინგი', categorySlug: 'marketing', professions: ['კონტენტ-მარკეტოლოგი', 'კოპირაითერი'] },
      { id: 'pr',        label: 'PR', categorySlug: 'marketing', professions: ['PR სპეციალისტი'] },
      { id: 'sales-sys', label: 'გაყიდვების სისტემა', categorySlug: 'sales', professions: ['გაყიდვების მენეჯერი'] },
    ],
  },
  {
    id: 'it', label: 'IT და ტექნოლოგიები', kinds: CP,
    template: 'რა უნდა გაკეთდეს: … (საიტი / აპლიკაცია / ავტომატიზაცია)\nვისთვის არის: …\nმთავარი ფუნქციები: …',
    topics: [
      { id: 'website',    label: 'ვებგვერდი', categorySlug: 'it', professions: ['დეველოპერი'] },
      { id: 'mobile-app', label: 'მობილური აპლიკაცია', categorySlug: 'it', professions: ['დეველოპერი'] },
      { id: 'automation', label: 'ავტომატიზაცია', categorySlug: 'it' },
      { id: 'data-an',    label: 'მონაცემთა ანალიზი', categorySlug: 'it', professions: ['მონაცემთა ანალიტიკოსი'] },
      { id: 'ai',         label: 'ხელოვნური ინტელექტი', categorySlug: 'it', professions: ['AI ინჟინერი'] },
      { id: 'security',   label: 'კიბერუსაფრთხოება', categorySlug: 'it', professions: ['კიბერუსაფრთხოების სპეციალისტი'] },
      { id: 'crm',        label: 'CRM და სისტემები', categorySlug: 'it' },
    ],
  },
  {
    id: 'design', label: 'დიზაინი', kinds: CP,
    template: 'რა მჭირდება: … (ლოგო / ბრენდბუქი / UI)\nბიზნესი ან პროექტი: …\nმაგალითები, რომლებიც მომწონს: …',
    topics: [
      { id: 'logo',       label: 'ლოგო და ბრენდბუქი', categorySlug: 'design', professions: ['გრაფიკული დიზაინერი'] },
      { id: 'uxui',       label: 'UX/UI', categorySlug: 'design', professions: ['UX/UI დიზაინერი'] },
      { id: 'print',      label: 'ბეჭდვითი დიზაინი', categorySlug: 'design', professions: ['გრაფიკული დიზაინერი'] },
      { id: 'interior',   label: 'ინტერიერი', categorySlug: 'architecture', professions: ['ინტერიერის დიზაინერი'] },
      { id: 'presentation', label: 'პრეზენტაცია', categorySlug: 'design' },
    ],
  },
  {
    id: 'psychology', label: 'ფსიქოლოგია', kinds: CP,
    template: 'რაზე მინდა მუშაობა: …\nფორმატი: … (ინდივიდუალური / წყვილი / ბავშვი)\nსიხშირე: …',
    topics: [
      { id: 'psy-individual', label: 'ინდივიდუალური სესია', alt: ['ფსიქოლოგი', 'ფსიქოთერაპევტი', 'თერაპია'], categorySlug: 'psychology', professions: ['ფსიქოლოგი', 'ფსიქოთერაპევტი'] },
      { id: 'psy-couple',     label: 'წყვილის თერაპია', categorySlug: 'psychology', professions: ['წყვილისა და ოჯახის კონსულტანტი'] },
      { id: 'psy-child',      label: 'ბავშვისა და მოზარდის ფსიქოლოგი', categorySlug: 'psychology', professions: ['ბავშვისა და მოზარდის ფსიქოლოგი'] },
      { id: 'psy-org',        label: 'ორგანიზაციული ფსიქოლოგია', categorySlug: 'psychology', professions: ['ორგანიზაციული ფსიქოლოგი'] },
    ],
  },
  {
    id: 'career', label: 'კარიერა და HR', kinds: CP,
    template: 'რა პოზიციას ვეძებ: …\nგამოცდილება: … წელი\nრა მჭირდება: … (CV / გასაუბრება / რჩევა)',
    topics: [
      { id: 'cv',        label: 'რეზიუმე და CV', categorySlug: 'career' },
      { id: 'interview', label: 'გასაუბრებისთვის მომზადება', categorySlug: 'career' },
      { id: 'career-adv',label: 'კარიერული განვითარება', categorySlug: 'career', professions: ['კარიერული კონსულტანტი'] },
      { id: 'hiring',    label: 'დაქირავება', categorySlug: 'career', professions: ['HR-მენეჯერი'] },
      { id: 'training',  label: 'ტრენინგი გუნდისთვის', categorySlug: 'career', professions: ['ბიზნეს-ტრენერი'] },
    ],
  },
  {
    id: 'media', label: 'მედია და კონტენტი', kinds: CP,
    template: 'რა უნდა გადაიღოს/გაკეთდეს: …\nთარიღი და ადგილი: …\nხანგრძლივობა ან მოცულობა: …',
    topics: [
      { id: 'photo',      label: 'ფოტოგრაფია', professions: ['ფოტოგრაფი'] },
      { id: 'video',      label: 'ვიდეოგადაღება', professions: ['ვიდეოგრაფი'] },
      { id: 'editing',    label: 'მონტაჟი', professions: ['მონტაჟის სპეციალისტი'] },
      { id: 'translation',label: 'თარგმანი', professions: ['თარჯიმანი'] },
      { id: 'podcast',    label: 'პოდკასტი', professions: ['პოდკასტის პროდიუსერი'] },
    ],
  },
  {
    // ⚠️ „და მშენებლობა" LEFT THIS LABEL ON 2026-08-20 (docs/archive/TAXONOMY-AUDIT §P3).
    // Construction was in two places at once — here and in the `architecture`
    // category — and a subject filed twice is a subject nobody can filter on.
    // `architecture` („არქიტექტურა და მშენებლობა") keeps it; this group is the
    // property itself, and the name now matches its category row exactly.
    id: 'property', label: 'უძრავი ქონება', kinds: CP,
    template: 'ობიექტი: … (ბინა / სახლი / კომერციული)\nსად მდებარეობს: …\nრა მჭირდება: …',
    topics: [
      { id: 'architecture', label: 'არქიტექტურა', categorySlug: 'architecture', professions: ['არქიტექტორი'] },
      { id: 'valuation',    label: 'ქონების შეფასება', categorySlug: 'real-estate', professions: ['შემფასებელი'] },
      { id: 'estimate',     label: 'ხარჯთაღრიცხვა', categorySlug: 'architecture', professions: ['ხარჯთაღრიცხვის სპეციალისტი'] },
      { id: 'broker',       label: 'ყიდვა-გაყიდვა', categorySlug: 'real-estate', professions: ['უძრავი ქონების ბროკერი'] },
      { id: 'renovation',   label: 'რემონტის დაგეგმვა' },
    ],
  },
  {
    id: 'relocation', label: 'ვიზა, მიგრაცია და რელოკაცია', kinds: CP,
    template: 'რომელი ქვეყანა: …\nჩემი სტატუსი ახლა: …\nრა მჭირდება: … (ვიზა / ბინადრობა / სწავლა)',
    topics: [
      { id: 'visa',        label: 'ვიზა', categorySlug: 'relocation', professions: ['საიმიგრაციო იურისტი', 'რელოკაციის კონსულტანტი'] },
      { id: 'residence',   label: 'ბინადრობის ნებართვა', categorySlug: 'relocation', professions: ['საიმიგრაციო იურისტი'] },
      { id: 'study-abroad',label: 'საზღვარგარეთ სწავლა', categorySlug: 'relocation', professions: ['საზღვარგარეთ სწავლის კონსულტანტი'] },
      { id: 'tax-residence', label: 'საგადასახადო რეზიდენტობა', categorySlug: 'relocation', professions: ['საგადასახადო რეზიდენტობის კონსულტანტი'] },
    ],
  },
  {
    id: 'grants', label: 'გრანტები და ტენდერები', kinds: CP,
    template: 'პროექტი მოკლედ: …\nსავარაუდო თანხა: …\nდედლაინი: …',
    topics: [
      { id: 'grant',   label: 'გრანტის განაცხადი', professions: ['გრანტების კონსულტანტი'] },
      { id: 'tender',  label: 'ტენდერი', professions: ['ტენდერების სპეციალისტი'] },
      { id: 'funding', label: 'დაფინანსების მოძიება' },
    ],
  },
  {
    id: 'logistics', label: 'ლოგისტიკა და საბაჟო', kinds: CP,
    template: 'ტვირთი ან საკითხი: …\nმარშრუტი: … → …\nრა მჭირდება: …',
    topics: [
      { id: 'customs',  label: 'საბაჟო', professions: ['საბაჟო ბროკერი'] },
      { id: 'import',   label: 'ექსპორტ-იმპორტი', professions: ['ექსპორტ-იმპორტის კონსულტანტი'] },
      { id: 'supply',   label: 'მიწოდების ჯაჭვი', professions: ['მიწოდების ჯაჭვის მენეჯერი', 'ლოგისტიკის სპეციალისტი'] },
    ],
  },
  {
    id: 'health', label: 'ჯანმრთელობა და კვება', kinds: CP,
    template: 'მიზანი: … (კვება / წონა / ვარჯიში)\nჯანმრთელობის შეზღუდვები: …',
    topics: [
      { id: 'dietitian', label: 'დიეტოლოგი', categorySlug: 'health', professions: ['დიეტოლოგი'] },
      { id: 'nutrition', label: 'კვების გეგმა', categorySlug: 'health', professions: ['ნუტრიციოლოგი', 'დიეტოლოგი'] },
      { id: 'training-plan', label: 'ვარჯიშის გეგმა', categorySlug: 'health', professions: ['ფიტნეს-ტრენერი'] },
    ],
  },
  {
    id: 'events', label: 'ტურიზმი და ღონისძიებები', kinds: CP,
    template: 'რა ღონისძიებაა: …\nთარიღი: …\nსტუმრების რაოდენობა: …\nრა შედის ბიუჯეტში: …',
    topics: [
      { id: 'event',   label: 'ღონისძიების ორგანიზება', professions: ['ღონისძიების ორგანიზატორი'] },
      { id: 'tour',    label: 'ტურის დაგეგმვა', professions: ['ტურ-ოპერატორი'] },
      { id: 'guide',   label: 'გიდი', professions: ['გიდი'] },
    ],
  },
  {
    id: 'agriculture', label: 'სოფლის მეურნეობა', kinds: CP,
    template: 'მეურნეობა: …\nმოცულობა: … (ფართობი / სულადობა)\nპრობლემა ან საჭიროება: …',
    topics: [
      { id: 'agronomy', label: 'აგრონომია', professions: ['აგრონომი'] },
      { id: 'vet',      label: 'ვეტერინარია', professions: ['ვეტერინარი'] },
      { id: 'wine',     label: 'მეღვინეობა', professions: ['მეღვინე და ენოლოგი'] },
    ],
  },

  /* ── services: somebody comes and does it ──────────────────────────────────
   *
   * ⚠️ EIGHT GROUPS THAT NAME A TRADE, NOT A PROFESSION. Everything above this
   * line is somebody who KNOWS something; everything below is somebody who
   * COMES somewhere. That is the same split `kinds: S` makes in the type system,
   * and keeping it visible in the file is the point — a new group added below
   * without `kinds: S` would be a household service priced per project, which is
   * the mistake the kind exists to prevent.
   *
   * ⚠️ NOT ONE `categorySlug` AMONG THEM, and this is correct rather than
   * unfinished. The sphere taxonomy holds 16 professional spheres and no trades;
   * minting „სანტექნიკა" there would create a sphere page with zero experts
   * behind it — the empty room with a URL this file's header refuses. These
   * topics are demand the platform has no supply for YET, and a request that
   * discovers exactly that is the most valuable row in the table.
   *
   * ⚠️ THE `alt` WORDS ARE THE TRADE'S NAME, and they carry more weight here
   * than anywhere above. Nobody types „ონკანის შეკეთება" — they type
   * „სანტექნიკოსი", the person, because that is who they are looking for. The
   * matcher (lib/topicMatch) reads these, so the trade name IS the search term
   * and the label is only what we call the job afterwards.
   */
  {
    id: 'cleaning', label: 'დალაგება', kinds: S,
    template: 'რა ფართობია: … კვ.მ / … ოთახი\nრა უნდა გაკეთდეს: …\nსართული და ლიფტი: …',
    topics: [
      { id: 'clean-flat',   label: 'ბინის დალაგება', alt: ['დამლაგებელი', 'დალაგება', 'დასუფთავება', 'ქალი დასალაგებლად'] },
      { id: 'clean-deep',   label: 'გენერალური დალაგება', alt: ['გენერალური წმენდა'] },
      { id: 'clean-repair', label: 'რემონტის შემდეგ დალაგება', alt: ['სამშენებლო ნარჩენები'] },
      { id: 'clean-window', label: 'ფანჯრების წმენდა', alt: ['მინების წმენდა'] },
      { id: 'clean-sofa',   label: 'ავეჯის ქიმწმენდა', alt: ['დივნის წმენდა', 'ხალიჩის წმენდა', 'ქიმწმენდა'] },
      { id: 'clean-office', label: 'ოფისის დალაგება' },
    ],
  },
  {
    id: 'plumbing', label: 'სანტექნიკა', kinds: S,
    template: 'რა პრობლემაა: …\nრამდენი ხანია: …\nსართული და ლიფტი: …',
    topics: [
      { id: 'plumb-leak',   label: 'ონკანი და მილი', alt: ['სანტექნიკოსი', 'სანტექნიკა', 'წყალი გადის', 'ჟონავს', 'ონკანი'] },
      { id: 'plumb-boiler', label: 'ბოილერი', alt: ['წყალგამაცხელებელი', 'ავზი'] },
      { id: 'plumb-drain',  label: 'კანალიზაციის გაწმენდა', alt: ['გაჭედილი', 'კანალიზაცია გაიჭედა', 'სუნი'] },
      { id: 'plumb-bath',   label: 'უნიტაზი და ნიჟარა', alt: ['სველი წერტილი', 'აბაზანა', 'შხაპი'] },
      { id: 'plumb-heat',   label: 'გათბობის სისტემა', alt: ['რადიატორი', 'ქვაბი', 'გათბობა'] },
    ],
  },
  {
    id: 'electrical', label: 'ელექტრიკა', kinds: S,
    template: 'რა პრობლემაა: …\nრამდენი წერტილია: …\nსართული და ლიფტი: …',
    topics: [
      { id: 'elec-wiring', label: 'ელექტროგაყვანილობა', alt: ['ელექტრიკოსი', 'ელექტრიკა', 'სადენი', 'გაყვანილობა'] },
      { id: 'elec-socket', label: 'როზეტი და ჩამრთველი', alt: ['როზეტი', 'ჩამრთველი'] },
      { id: 'elec-light',  label: 'განათება', alt: ['ლამპა', 'ჭაღი', 'სანათი'] },
      { id: 'elec-panel',  label: 'მრიცხველი და ავტომატი', alt: ['ავტომატი', 'მრიცხველი', 'ფარი', 'დენი წყდება'] },
    ],
  },
  {
    id: 'repairs', label: 'სარემონტო სამუშაოები', kinds: S,
    template: 'რა უნდა გაკეთდეს: …\nრა ფართობია: …\nმასალა ვისი იქნება: …',
    topics: [
      { id: 'rep-tile',     label: 'კაფელი და მეტლახი', alt: ['კაფელი', 'მეტლახი', 'პლიტკა'] },
      { id: 'rep-drywall',  label: 'თაბაშირმუყაო', alt: ['გიფსოკარტონი', 'ჭერი'] },
      { id: 'rep-paint',    label: 'შეღებვა და შპალერი', alt: ['მღებავი', 'შეღებვა', 'შპალერი', 'კედლის შეღებვა'] },
      { id: 'rep-floor',    label: 'იატაკის დაგება', alt: ['იატაკი', 'პარკეტი', 'ლამინატი', 'ლინოლეუმი'] },
      { id: 'rep-door',     label: 'კარ-ფანჯარა', alt: ['კარი', 'ფანჯარა', 'საკეტი', 'ბოქლომი'] },
      // ⚠️ „ხელოსანი" WAS AN `alt` HERE UNTIL 2026-08-20 and must not return.
      // An alt is never printed — it is only matched against — which is exactly
      // why it survived every sweep of the visible copy. Owner: „ხელოსნები
      // აღარ უნდა გამოგყევენებინა არსად". The topic is still found by its own
      // name and by „კარადის აწყობა"; what is gone is the site keeping a
      // retired word alive in its own data.
      { id: 'rep-assembly', label: 'ავეჯის აწყობა', alt: ['კარადის აწყობა', 'ავეჯის შეკრება'] },
    ],
  },
  {
    id: 'appliances', label: 'ტექნიკის შეკეთება', kinds: S,
    template: 'რა ტექნიკაა: … (მოდელი, თუ იცი)\nრა ემართება: …\nრამდენი ხანია: …',
    topics: [
      { id: 'app-washer', label: 'სარეცხი მანქანა', alt: ['სარეცხი მანქანის შეკეთება'] },
      { id: 'app-fridge', label: 'მაცივარი', alt: ['საყინულე'] },
      { id: 'app-ac',     label: 'კონდიციონერი', alt: ['კონდიციონერის გასუფთავება', 'ფრეონი'] },
      { id: 'app-dish',   label: 'ჭურჭლის სარეცხი მანქანა' },
      { id: 'app-stove',  label: 'ღუმელი და ქურა', alt: ['ღუმელი', 'ქურა', 'გაზქურა'] },
      { id: 'app-tv',     label: 'ტელევიზორი' },
    ],
  },
  {
    id: 'moving', label: 'გადაზიდვა', kinds: S,
    template: 'საიდან და სად: … → …\nრა უნდა გადავიდეს: …\nსართული და ლიფტი ორივე მხარეს: …',
    topics: [
      { id: 'move-flat',   label: 'ბინის გადაზიდვა', alt: ['გადაზიდვა', 'გადასვლა', 'მზიდავი', 'მტვირთავი'] },
      { id: 'move-office', label: 'ოფისის გადაზიდვა' },
      { id: 'move-lift',   label: 'ავეჯის ატანა და ჩამოტანა', alt: ['ატანა', 'მძიმე ნივთი'] },
      { id: 'move-item',   label: 'ნივთის მიტანა', alt: ['კურიერი', 'მიტანა'] },
    ],
  },
  {
    id: 'outdoor', label: 'ეზო და მებაღეობა', kinds: S,
    template: 'რა ფართობია: …\nრა უნდა გაკეთდეს: …\nროდის მოვიდეს: …',
    topics: [
      { id: 'out-lawn',   label: 'ბალახის თიბვა', alt: ['ბალახი', 'თიბვა', 'გაზონი'] },
      { id: 'out-tree',   label: 'ხის გასხვლა და მოჭრა', alt: ['ხის მოჭრა', 'გასხვლა'] },
      { id: 'out-garden', label: 'ეზოს მოწყობა', alt: ['მებაღე', 'ლანდშაფტი'] },
      { id: 'out-pest',   label: 'მწერების და მღრღნელების წამლობა', alt: ['ტარაკანი', 'ტარაკნები', 'მღრღნელები', 'დეზინსექცია', 'დეზინფექცია', 'მწერები'] },
    ],
  },
  {
    id: 'systems', label: 'უსაფრთხოება და ინტერნეტი', kinds: S,
    template: 'რა უნდა დაიდგას: …\nრამდენი წერტილი: …\nობიექტი: … (ბინა / სახლი / ოფისი)',
    topics: [
      { id: 'sys-camera', label: 'ვიდეოკამერების დაყენება', alt: ['კამერა', 'ვიდეოსათვალთვალო', 'სათვალთვალო'] },
      { id: 'sys-intercom', label: 'დომოფონი' },
      { id: 'sys-alarm',  label: 'სიგნალიზაცია', alt: ['დაცვა'] },
      { id: 'sys-network', label: 'ინტერნეტი და ქსელი', alt: ['ვაიფაი', 'როუტერი', 'ქსელი', 'ინტერნეტი'] },
    ],
  },
]

/* ═══════════ the description templates ══════════════════════════════════
 *
 * THE EMPTY TEXTAREA IS WHERE FORMS DIE. Every other control on the wizard is
 * a tap; the description is the one place the person must COMPOSE, and staring
 * at a blank field with a 40-character floor is the abandonment point (the
 * owner named it directly: „კი არ ირჩევს, არამედ წერს — შაბლონები უნდა იყოს
 * სხვადასხვა მიმართულებით"). A fill-in scaffold converts composition into
 * completion: the person answers blanks instead of inventing structure.
 *
 * PER DIRECTION, because the useful skeleton differs: a tutor needs who/level/
 * goal, a lawyer needs situation/parties/ask, a videographer needs date/place/
 * duration. One generic „describe your need" template would be the blank field
 * wearing a costume.
 *
 * ⚠️ INSERTED, NEVER PRE-FILLED. A pre-filled textarea reads as already
 * answered and gets submitted with the blanks still in it; an explicit „ჩასვი"
 * tap is a request for the scaffold. The blanks are „…" — visibly unfinished,
 * so a half-filled template looks half-filled.
 */
const KIND_TEMPLATE: Record<RequestKindName, string> = {
  LEARNING: 'ვინ ისწავლის: …\nამჟამინდელი დონე: …\nმიზანი: …',
  MEETING: 'სიტუაცია: …\nკითხვა: …\nრა ვცადე აქამდე: …',
  PROJECT: 'რა უნდა გაკეთდეს: …\nვისთვის არის: …\nრა შედეგს ველოდები: …',
  // The three things a master asks on the phone before naming a price, in the
  // order they ask them. „სართული და ლიფტი" is in here because it is the single
  // most common reason a quoted price changes at the door.
  SERVICE: 'რა პრობლემაა: …\nსართული და ლიფტი: …\nროდის მოვიდეს: …',
}

/** The scaffold for this request: the topic's group first, the kind's fallback
 *  otherwise — so a direction without its own template still gets a usable one. */
export function templateFor(kind: RequestKindName, topicId: string): string {
  const group = groupsForKind(kind).find(g => g.topics.some(t => t.id === topicId))
  return group?.template ?? KIND_TEMPLATE[kind]
}

/* ═══════════ the OFFER templates — the provider's blank field ═══════════
 *
 * The same disease on the other side of the table: every control on the offer
 * form is a number except the message, and the message is what wins or loses
 * the job. The reference research is blunt about what a winning reply contains
 * — a greeting, proof you READ the request, and what exactly you will do — and
 * blunt about the stakes: on thumbtack-model marketplaces the first good reply
 * takes ~78% of clients. A provider staring at an empty box is slow AND vague.
 *
 * Per KIND, not per topic: what a tutor says about themselves differs from what a
 * contractor says, but a chemistry tutor and an english tutor open the same
 * way. Same insert-on-tap contract as the client templates — never pre-filled,
 * blanks visibly unfinished.
 */
const OFFER_TEMPLATE: Record<RequestKindName, string> = {
  LEARNING: 'გამარჯობა! ამ საგანს ვასწავლი … წელია.\nგაკვეთილი: … წუთი, …\nშემიძლია დავიწყო: …',
  MEETING: 'გამარჯობა! ამ საკითხზე ვმუშაობ … წელია.\nშეხვედრაზე განვიხილავთ: …\nთავისუფალი დრო მაქვს: …',
  PROJECT: 'გამარჯობა! მსგავსი სამუშაო გაკეთებული მაქვს: …\nროგორ შევასრულებ: …\nვადა: …',
  // ⚠️ THE THIRD LINE IS THE ONE THAT MATTERS, and it is why this template is
  // not PROJECT's. On a visit the honest answer is often „I will price it when
  // I see it", and a master with no way to say that either invents a number or
  // does not bid at all. Saying it in the offer means the client reads it
  // BEFORE choosing rather than at the door.
  SERVICE: 'გამარჯობა! … წელია, რაც ამ საქმეს ვაკეთებ.\nმოვალ: …\nფასი: … (ან: გამოძახება …₾, დანარჩენს ადგილზე შევაფასებ)',
}

export function offerTemplateFor(kind: RequestKindName): string {
  return OFFER_TEMPLATE[kind]
}

/**
 * The escape hatch, and every kind has one.
 *
 * ⚠️ NOT A FAILURE OF THE LIST — it is the most valuable row in it. A person
 * who picks „სხვა" and then describes what they need is telling us about a
 * service the catalogue does not carry, which is the single thing a demand-side
 * vocabulary exists to discover. The admin queue can be filtered on it.
 */
export const OTHER_TOPIC: Topic = { id: 'other', label: 'სხვა' }

/* ── lookups ───────────────────────────────────────────────────────────── */

const ALL: Topic[] = [...TOPIC_GROUPS.flatMap(g => g.topics), OTHER_TOPIC]
const BY_ID = new Map(ALL.map(t => [t.id, t]))

export function topicById(id: string | null | undefined): Topic | undefined {
  return id ? BY_ID.get(id) : undefined
}

/* ── the eight shown before anything is typed ──────────────────────────────
 *
 * WHY THEY EXIST. Step 1 opened on an empty search box and 23 folded headings.
 * Nothing on that screen showed what a valid answer LOOKS like — the only
 * example was a placeholder, which disappears on the first keystroke. A handful
 * of one-tap examples turn a blank start into a start (owner, 2026-08-17:
 * „დაწყება ცოტა რთულია"). Recognition over recall, the same reason the
 * accordion is there at all.
 *
 * ⚠️ IT WAS SIX AND IS NOW EIGHT, because a fourth kind arrived (2026-08-17).
 * The rule below is two per kind and it is not negotiable downward — with
 * services in the catalogue and no service on this row, the first screen would
 * say „professionals and tutors" to somebody whose leak is spreading across the
 * floor. The count follows the rule; the rule does not follow the count.
 *
 * ⚠️ „მაგალითად", NOT „ხშირად ეძებენ". We have no search data — the subsystem
 * has never been open — and a popularity claim we cannot back is a lie printed
 * on the first screen. When there IS data, this list becomes a query and the
 * label can become the honest version of that sentence.
 *
 * TWO PER KIND, deliberately. The screen must not read as a tutoring site with
 * extras bolted on: the first thing a visitor sees is that a lawyer, an
 * accountant and a builder live here too. That is the one thing this row can
 * teach that the fold headings cannot, because nobody unfolds a heading to find
 * out whether the product is for them.
 */
// ⚠️ THE ORDER IS THE PRODUCT'S (2026-08-20). These eight chips are the first
// thing a visitor reads on the what-step, so they are the fastest statement the
// site makes about itself — and until today they opened with „მათემატიკა",
// which said tutoring. Professional deliverables first, then the everyday
// trades (which a household is most likely to TYPE, so recognising one teaches
// that this half exists), then the learning that survived as an adult,
// outcome-shaped service. `math` is gone with its group — see DORMANT_GROUP_IDS.
export const SUGGESTED_TOPIC_IDS = [
  'contract', 'declaration',   // professional service — a thing delivered
  'logo', 'renovation',        // project
  'clean-flat', 'plumb-leak',  // everyday service
  'english', 'nat-exams',      // learning, the outcome-shaped half
] as const

/**
 * Resolved once, at module load.
 *
 * ⚠️ IT FILTERS, IT DOES NOT THROW, and the reason is the import graph: this
 * file is re-exported by lib/requests.ts, which `middleware.ts` imports — so a
 * throw at module load would not fail the one screen that reads this list, it
 * would take down EVERY route on the site because somebody renamed a topic.
 * A missing id costs one chip; the guarantee that there is no missing id is a
 * test's job, and tests/requests.test.ts asserts the full list.
 */
export const SUGGESTED_TOPICS: Topic[] =
  SUGGESTED_TOPIC_IDS.map(id => BY_ID.get(id)).filter((t): t is Topic => !!t)

/** The label, or the raw id when a stored topic has since left the list. A row
 *  written before a topic was retired must still be readable in the admin —
 *  never „undefined". */
export function topicLabel(id: string | null | undefined): string {
  return topicById(id)?.label ?? (id ?? '—')
}

/** The sphere whose experts could serve this topic, when one exists. */
export function categorySlugOfTopic(id: string | null | undefined): string | null {
  return topicById(id)?.categorySlug ?? null
}

/** The professions (lib/professions job labels) a topic names — see
 *  `Topic.professions`. Empty for every LEARNING / SERVICE topic and for a
 *  CONSULTATION / PROJECT topic that maps only through its sphere. */
export function professionsOfTopic(id: string | null | undefined): string[] {
  return topicById(id)?.professions ?? []
}

/**
 * THE SPHERE A SERVICE LIST IMPLIES — first topic that names one wins.
 *
 * ⚠️ WHY THIS EXISTS (2026-09-02). The provider editor asked „რომელ პროფესიად
 * გეძებენ" above „რას აკეთებ" — two questions the owner read as one asked twice
 * („ეს გადამრთველიც რა საჭიროა, ვერ ვხდები" was about /about; this is the same
 * complaint one screen over). The profession chips could not simply be deleted,
 * because `categoryId` — which decides the catalogue, the filter and half the
 * routing — was DERIVED from them (`sphereOfProfessions`, first pick wins).
 *
 * So the sphere needed another source, and it turned out to already have one:
 * `Topic.categorySlug` says „the live sphere whose experts could serve this".
 * Measured against the roster the day this was written, 27 published profiles:
 *
 *     23  derived sphere === stored sphere
 *      2  differ — and BOTH derivations are better than what was stored
 *         („აუდიტის დეპარტამენტში 15 წელი" was filed under `relocation`)
 *      2  derive nothing — both cleaning-only profiles, which is correct:
 *         a SERVICE topic carries no `categorySlug` by design, and those
 *         providers route on their services alone
 *
 * ⚠️ FIRST PICK WINS, DELIBERATELY — the same rule `sphereOfProfessions` uses,
 * so the two derivations cannot disagree about what „the sphere" means for a
 * person who has both. Returning several would make the caller choose, and the
 * caller is a database column that holds one.
 */
export function sphereOfServices(services: readonly string[] | null | undefined): string | undefined {
  for (const s of services ?? []) {
    const slug = topicById(s)?.categorySlug
    if (slug) return slug
  }
  return undefined
}

export function groupsForKind(kind: RequestKindName): TopicGroup[] {
  return TOPIC_GROUPS.filter(g => g.kinds.includes(kind))
}

/* ═══════════ what is OPEN, as opposed to what is DESCRIBED ══════════════ */

/**
 * The four trades the services side launches with.
 *
 * ⚠️ THIS IS A SUPPLY DECISION AND IT DOES NOT SHRINK THE VOCABULARY. Owner,
 * 2026-08-18: „რაღაცა მინიმალურად უნდა შემოვიფარგლოთ, ყველაფერს არ უნდა
 * მივედოთ ჯერ." Eight groups drawn on the page is eight promises, and at zero
 * providers seven of them are promises we cannot keep — a client who taps
 * „ბინის გადაზიდვა" and hears nothing back does not conclude that one category
 * is empty, they conclude the site is.
 *
 * These four, specifically, because each one is (a) year-round rather than
 * seasonal, (b) served by one person across a whole city, so a handful of
 * providers genuinely covers Tbilisi, and (c) small enough that the job is done
 * the same day — which is the only kind of outcome a first cohort can produce
 * fast enough to be worth anything.
 *
 * WHAT STAYS ON: every retired group is still MATCHED. `searchAllTopics` and
 * the text classifier keep the full 39, so somebody who types „კარი გაფუჭდა"
 * still gets filed under კარ-ფანჯარა and lands in the admin queue, rather than
 * dissolving into OTHER. We stop OFFERING them; we do not stop UNDERSTANDING
 * them. That distinction is the whole design — opening a group later is one
 * line here and costs no re-classification of anything already stored.
 */
export const LIVE_SERVICE_GROUP_IDS: readonly string[] = [
  // ⚠️ ALL EIGHT, SINCE 2026-08-20. It was four. Owner: „პარალელურად დაემატება
  // სერვისი როგორც არის, მასშტაბურად უნდა მივიდეთ… სერვისებსაც, რაც
  // ყოველდღიურად სჭირდება — დალაგება და ხელოსანი, ესეც."
  //
  // The everyday layer is not the site's headline (see DORMANT_GROUP_IDS and
  // the note below it for what the headline IS), but it is half of what the
  // site sells and a half that arrives with real, daily demand. Four of these
  // were written and switched off; nothing else was needed to double the
  // service side.
  'plumbing', 'electrical', 'cleaning', 'appliances',
  'repairs', 'moving', 'outdoor', 'systems',
]

/**
 * ⚠️ GROUPS THAT ARE WRITTEN, KEPT, AND NOT OFFERED (2026-08-20).
 *
 * The site sells SERVICES, and it leads with the PROFESSIONAL ones — a contract
 * drafted, a declaration filed, a brand built, IELTS passed. Owner: „არ მინდა
 * რომ სულ კანალიზაციაც და მსგავსი ხელოსანი სერვისებიც მქონდეს — უფრო მაღალი
 * დონის სერვისები და ინტელექტუალურიც იყოს."
 *
 * These three are neither. „მე-8 კლასის მათემატიკა" is bought by a parent, is
 * priced per lesson and repeats every week — a different market with a
 * different buyer, and the one that makes a refined catalogue read as a
 * classifieds board. The four LEARNING groups that survive (`exams`,
 * `languages`, `higher`, `digital`) are the adult, outcome-shaped half: an
 * exam has a date and a result, which is the same shape as a service.
 *
 * Nothing is deleted — the topics, their synonyms and their tests all stay, so
 * a stored request that names one still reads. Removing an id from this list is
 * the whole of turning it back on.
 */
export const DORMANT_GROUP_IDS: readonly string[] = ['school', 'arts', 'sport']

/**
 * Is this group offered in a picker?
 *
 * Non-SERVICE groups are always live — the gate is about trades we have to
 * staff, and a consultation group needs no van in the city to answer.
 */
export function groupIsLive(g: TopicGroup): boolean {
  if (DORMANT_GROUP_IDS.includes(g.id)) return false
  return !g.kinds.includes('SERVICE') || LIVE_SERVICE_GROUP_IDS.includes(g.id)
}

/** Every group a picker may draw. The full catalogue stays available to the
 *  matcher — see LIVE_SERVICE_GROUP_IDS for why those are two different lists. */
export const BROWSABLE_GROUPS: TopicGroup[] = TOPIC_GROUPS.filter(groupIsLive)

/* ═══════════ the two verticals, kept apart ══════════════════════════════ */

/**
 * ⚠️ THE CATALOGUE IS DRAWN AS TWO LISTS, NEVER ONE.
 *
 * Owner, 2026-08-18: „ერთ საიტზე რჩება, მაგრამ მკვეთრად უნდა გაიმიჯნოს, რომ
 * ესენი არ აირიოს … კატეგორიები კარგად უნდა გაიმიჯნოს, რომ არ აირიოს."
 *
 * The intake stays ONE system — same wizard, same ServiceRequest row, same
 * queue — and that is deliberate and unchanged. What was wrong was the PICKER:
 * twenty-odd groups in a single accordion, with „სასკოლო საგნები" three rows
 * above „სანტექნიკა", so choosing a plumber and choosing a maths tutor looked
 * like the same decision made from the same list. They are not the same
 * decision. One ends in a video call you book; the other ends in somebody
 * standing in your kitchen.
 *
 * `groupIsService` is the split, and it is read off `kinds` rather than a
 * second hand-kept list — the same derivation OFFER_GROUPS already uses, so a
 * trade added to the vocabulary lands on the correct side of the page the same
 * day and cannot land on both.
 */
export function groupIsService(g: TopicGroup): boolean {
  return g.kinds.includes('SERVICE')
}

/** „ხელოსანი მოვა" — the trades. */
export const SERVICE_BROWSE_GROUPS: TopicGroup[] = BROWSABLE_GROUPS.filter(groupIsService)

/** „ექსპერტი" — learning, consultation and project work. Everything else, by
 *  subtraction, so the two lists cannot drift apart or double-count. */
export const EXPERT_BROWSE_GROUPS: TopicGroup[] = BROWSABLE_GROUPS.filter(g => !groupIsService(g))

/**
 * WHICH DOOR SOMEBODY CAME THROUGH — the vertical.
 *
 * ⚠️ THE DOOR DECIDES, AND THE WIZARD NEVER ASKS AGAIN (owner, 2026-08-18,
 * approving option „ა"). This is the ss.ge shape the owner named twice: you
 * pick the world at the entrance, and everything inside is that world's.
 *
 * The two verticals are not two menus over one catalogue, they are two
 * different ACTIONS. A leaking tap is urgent, local, and nobody browses for it
 * — you describe it and wait. A consultation is considered, remote, and
 * browsing IS the decision — you read profiles and compare. Showing „სასკოლო
 * საგნები" three rows above „სანტექნიკა" told somebody with water on the floor
 * that these are the same kind of choice.
 *
 * ⚠️ WHAT DOES **NOT** SPLIT: the intake. One wizard, one ServiceRequest row,
 * one admin queue, one routing pass — the owner was explicit („როცა გამოგზავნას
 * ეხება, აუცილებლად ერთ სისტემაში იგზავნება"). This type narrows what is
 * OFFERED on one screen. It touches nothing that is stored.
 *
 * ⚠️ AND FREE-TEXT SEARCH STAYS GLOBAL — `searchAllTopics` is deliberately not
 * filtered by this. Somebody on the expert side who types „დალაგება" must still
 * be filed under cleaning and reach the queue. A separation that loses a
 * request is worse than the confusion it fixed, and this is the net under it.
 */
export const VERTICALS = ['SERVICE', 'EXPERT'] as const
export type Vertical = (typeof VERTICALS)[number]

export function isVertical(v: string | null | undefined): v is Vertical {
  return v === 'SERVICE' || v === 'EXPERT'
}

/** The groups a given door offers. */
export function browseGroupsFor(v: Vertical): TopicGroup[] {
  return v === 'SERVICE' ? SERVICE_BROWSE_GROUPS : EXPERT_BROWSE_GROUPS
}

/**
 * The vertical a chosen topic belongs to.
 *
 * Needed because the search box crosses the line on purpose: somebody may enter
 * through the services door, type „ინგლისური", and land on a learning topic.
 * The screen then has to stop calling itself the trades screen — the copy
 * follows the ANSWER, not the door, the moment the two disagree.
 */
export function verticalOfTopic(id: string | null | undefined): Vertical | null {
  const t = topicById(id)
  if (!t) return null
  const g = TOPIC_GROUPS.find(gr => gr.topics.some(x => x.id === t.id))
  return g ? (groupIsService(g) ? 'SERVICE' : 'EXPERT') : null
}

/** Every topic id → its side, built once. `verticalOfTopic` scans; the
 *  catalogue asks this of every provider on every keystroke. */
const VERTICAL_BY_TOPIC: Map<string, Vertical> = (() => {
  const m = new Map<string, Vertical>()
  for (const g of TOPIC_GROUPS) {
    const v: Vertical = groupIsService(g) ? 'SERVICE' : 'EXPERT'
    for (const t of g.topics) m.set(t.id, v)
  }
  return m
})()

/**
 * WHICH SIDES A PROVIDER IS ON, from the services they listed.
 *
 * ⚠️ A LIST, NOT A VALUE, and that is deliberate. A designer who also fits
 * kitchens is one person with one card, and forcing them onto one side would
 * either hide them from half the site or file them where their work is not.
 * They appear under both switches, because both are true.
 *
 * ⚠️ AND „NOTHING TICKED" IS „პროფესიული", NOT „NOWHERE". A profile with no
 * services yet still has a category, a headline and a face; dropping them out
 * of both sides would delete a real person from the catalogue over a field they
 * have not filled in. EXPERT is where the roster is (measured 2026-09-01: 23 of
 * 23), and it is the side the switch opens on.
 */
export function verticalsOfTopics(ids: readonly string[]): Vertical[] {
  const out = new Set<Vertical>()
  for (const id of ids) {
    const v = VERTICAL_BY_TOPIC.get(id)
    if (v) out.add(v)
  }
  return out.size === 0 ? ['EXPERT'] : [...out]
}

/**
 * THE ONE WORD FOR EACH SIDE.
 *
 * Owner, 2026-09-01: „ჩვენ ხო გვაქვს ორი მთავარი კატეგორია — ვინც ადგილზე
 * მიდის და ვინც პროფესიოლია — და ეს მინდა იყოს გადამრთველი, რომ არევა არ
 * მოხდეს ამათი … მოვიფიქროთ, რა არის უკეთ, რომ ერთი სიტყვით დავარქვათ და
 * გასაგები იყოს ორივე მიმართულებას."
 *
 * ⚠️ IT WAS FOUR NAMES FOR TWO THINGS. Measured that morning: /join called them
 * „სერვისი სახლში" and „პროფესიული სერვისები", /work/profile „სერვისი" and
 * „პროფესიული სერვისები", the catalogue rail „ყოველდღიური სერვისები" and
 * „პროფესიული სერვისები", and this file's own `VERTICAL_COPY.label`
 * „სერვისები" and „ექსპერტები" — a word that means BOTH sides used as the name
 * of one of them. A provider reads two of those surfaces and a client reads the
 * other two, and nothing told either of them it was the same question.
 *
 * One adjective each, and every surface composes its own noun around it
 * („პროფესიული სერვისები" where a heading needs one, bare on the switch where
 * the two words sit side by side and the contrast IS the sentence).
 */
export const VERTICAL_LABEL: Record<Vertical, string> = {
  EXPERT: 'პროფესიული',
  SERVICE: 'ყოველდღიური',
}

/**
 * The door's own words. Two questions, because one question that fits both is a
 * question that fits neither — „რა გჭირდება?" is what you ask a person who is
 * shopping, and the person with water on their floor is not shopping.
 */
export const VERTICAL_COPY: Record<Vertical, {
  label: string
  title: string
  hint: string
  placeholder: string
  suggested: readonly string[]
}> = {
  SERVICE: {
    // ⚠️ THE SHARED WORD, NOT A FIFTH ONE (2026-09-01). It read „სერვისები" —
    // the name of everything the site sells, used as the name of half of it.
    label: VERTICAL_LABEL.SERVICE,
    // ⚠️ NOT „რა გაფუჭდა?" (2026-08-18). Cleaning is one of the four live
    // groups — a third of the open catalogue — and nothing is broken when
    // somebody wants their flat cleaned. Both the home tile „ბინის დალაგება"
    // and the /services cleaning card landed on a screen headed „what broke?".
    // One title has to cover repair and cleaning, and this is the plainest one
    // that does.
    title: 'რა გჭირდება სახლში?',
    // ⚠️ AND THE HINT NO LONGER DISPATCHES ANYBODY. „ხელოსანი მოვა" describes a
    // dispatch this platform does not perform: what happens is a mail to the
    // masters who cover that trade, and a wait. Saying the true thing costs
    // nothing and is the difference between a promise and a description.
    hint: 'დაწერე შენი სიტყვებით — ფასს შემოგთავაზებენ.',
    // ⚠️ NO EXAMPLE (2026-09-01, owner: „ძალიან კონკრეტული მაგალითები გაქვს
    // მოყვანილი და არაპროფესიონალურად არის"). It read „ონკანი ჟონავს". The
    // instruction is already above the box („დაწერე შენი სიტყვებით — ფასს
    // შემოგთავაზებენ"), so the example taught nothing and narrowed everything:
    // this one field covers cleaning, moving, electrics and repair, and a
    // dripping tap told the other four they were in the wrong place. Same
    // change the provider-side pickers took the same day.
    placeholder: 'მოძებნე სერვისი',
    suggested: ['plumb-leak', 'clean-flat', 'elec-socket', 'app-washer', 'plumb-drain', 'clean-deep'],
  },
  EXPERT: {
    label: VERTICAL_LABEL.EXPERT,
    title: 'რაში გჭირდება დახმარება?',
    hint: 'დაწერე შენი სიტყვებით — ექსპერტები შემოგთავაზებენ.',
    placeholder: 'მოძებნე სერვისი',
    // Same reordering as SUGGESTED_TOPIC_IDS, and the same reason: what is
    // DELIVERED first, and no dormant topic (`math` left with its group).
    suggested: ['contract', 'declaration', 'logo', 'accounting', 'cv', 'english'],
  },
}

/** The door's example chips, resolved. Filters rather than throws, for the
 *  reason SUGGESTED_TOPICS states: this module is in middleware's import graph
 *  and a throw at load takes down every route on the site. */
export function suggestedFor(v: Vertical): Topic[] {
  return VERTICAL_COPY[v].suggested
    .map(id => BY_ID.get(id))
    .filter((t): t is Topic => !!t)
}

export function isTopicOfKind(kind: RequestKindName, id: string): boolean {
  if (id === OTHER_TOPIC.id) return true
  return groupsForKind(kind).some(g => g.topics.some(t => t.id === id))
}

/**
 * Search, built for Georgian and for a list that is meant to reach hundreds.
 *
 * ⚠️ THE TRAILING VOWEL COMES OFF BOTH SIDES. Georgian declines by changing the
 * stem, so somebody hunting for „ქიმია" types „ქიმიის" or „ქიმიაში" and a plain
 * `includes()` finds nothing — the exact failure lib/tutorsQuery documents for
 * expert search, which is why THAT one ranks by trigram similarity in the
 * database. This list is in memory and a few hundred rows long, so it does not
 * need Postgres: stripping the case endings off the query and comparing stems
 * covers what people actually type, and costs nothing.
 *
 * Matching a topic's own group label too is deliberate: „ენები" should surface
 * every language without each one having to list the word.
 */
const CASE_ENDINGS = ['ებისთვის', 'ისთვის', 'ებში', 'ებზე', 'ებს', 'ებ', 'ისა', 'ის', 'ში', 'ზე', 'თან', 'ით', 'ად', 'ს', 'ი']

function stem(s: string): string {
  const v = s.trim().toLowerCase()
  for (const e of CASE_ENDINGS) {
    if (v.length > e.length + 2 && v.endsWith(e)) return v.slice(0, -e.length)
  }
  return v
}

export type TopicHit = { topic: Topic; group: TopicGroup }

/**
 * Which kinds this topic can be asked as.
 *
 * The entry screen is TOPIC-FIRST now (the thumbtack/profi pattern: one search
 * box, categories under it), so the kind is DERIVED from the topic wherever
 * possible — „ქიმია" can only be learning, and asking „მასწავლებელი თუ
 * სამუშაო?" about it would be a step that exists to be answered the only
 * possible way. Only genuinely ambiguous topics (every professional one:
 * a contract is a conversation OR a job) earn the disambiguation step.
 *
 * „სხვა" belongs to every kind by definition — the escape hatch may not
 * foreclose any shape of need.
 */
export function kindsOfTopic(topicId: string): RequestKindName[] {
  if (topicId === OTHER_TOPIC.id) return [...REQUEST_KINDS]
  const out = new Set<RequestKindName>()
  for (const g of TOPIC_GROUPS) {
    if (g.topics.some(t => t.id === topicId)) for (const k of g.kinds) out.add(k)
  }
  return [...out]
}

/**
 * Search across EVERY kind — the entry screen's search, where the person has
 * not been asked to classify their need yet and must not have to.
 *
 * Returns group context with each hit because labels legitimately repeat
 * across directions („ბუღალტერია" is both a subject to learn and a service to
 * hire) and a bare chip could not tell them apart.
 */
export function searchAllTopics(query: string, limit = 24): TopicHit[] {
  const seen = new Set<string>()
  const out: TopicHit[] = []
  for (const kind of REQUEST_KINDS) {
    for (const hit of searchTopics(kind, query, limit)) {
      const key = `${hit.group.id}:${hit.topic.id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(hit)
    }
  }
  return out.slice(0, limit)
}

/**
 * ⚠️ THE MATCHING MOVED OUT (2026-08-17) — see lib/topicMatch, and the note at
 * the top of it for what the one-line version could not do. In short: it
 * stemmed and compared WHOLE STRINGS, so „დავა მაქვს სასამართლოში" could never
 * find „სასამართლო დავა", nothing was ranked, and a single typo was fatal.
 *
 * This function is now only the part that is about TOPICS: which candidates
 * exist for a kind, and what each one can be called. The scoring, the
 * tokenising and the tolerance belong to a file that can be tested against a
 * corpus of real phrases without knowing what a topic is.
 */
export function searchTopics(kind: RequestKindName, query: string, limit = 24): TopicHit[] {
  const candidates: TopicHit[] = []
  for (const group of groupsForKind(kind)) {
    for (const topic of group.topics) candidates.push({ topic, group })
  }
  return rankCandidates(
    query,
    candidates,
    ({ topic, group }) => ({
      phrases: [topic.label, ...(topic.alt ?? [])],
      groupLabel: group.label,
    }),
    limit,
  ).map(r => r.item)
}

/**
 * THE TOPICS A CHOSEN PROVIDER ALREADY ANSWERS — the vocabulary half of
 * „hire this person directly" (2026-08-19).
 *
 * ⚠️ WHY IT IS HERE AND NOT BESIDE THE QUERY. Somebody who arrived at /request
 * from a plumber's profile has already answered „რა გჭირდება" by tapping that
 * plumber, and asking them to find „სანტექნიკა" in a catalogue of 31 groups is
 * the wizard pretending the choice did not happen. What that provider offers is
 * a fact about the VOCABULARY — trade ids on a ServiceProfile, professions and
 * a sphere on a TutorProfile — so the mapping lives with the vocabulary, stays
 * pure, and is testable without a database.
 *
 * Two sources, and the narrower one wins:
 *   • a MASTER carries `services` — SERVICE topic ids, already our own words.
 *   • an EXPERT carries professions and a sphere. `professions` names the
 *     PERSON and `categorySlug` names the SPHERE (see Topic above), so a match
 *     on professions is the sharper answer and is used alone when it exists —
 *     „ბუღალტერი" yields three topics, „tax" would yield the whole sphere.
 *
 * LEARNING and SERVICE topics are never inferred for an expert: a school
 * subject is not what somebody hires a consultant for, and a trade is not an
 * expert at all (the same line tests/taxonomy.test.ts already draws).
 *
 * Returns ids in the catalogue's own order, deduped. An empty array means
 * „nothing could be inferred" — the wizard then behaves exactly as it does for
 * a visitor who arrived with no provider at all, which is the only safe answer.
 */
export function topicsForProvider(p: {
  /** ServiceProfile.services — the topic ids they actually ticked. */
  services?: string[]
  /** ServiceProfile.professions — job labels from lib/professions. */
  professions?: string[]
  /** The sphere slug they are filed under. */
  categorySlug?: string | null
}): string[] {
  // ⚠️ THE TICKS WIN, AND THEY ARE ASKED FIRST (2026-08-24). This used to take
  // a `kind` — MASTER read `services`, EXPERT read `professions` and the sphere
  // — because the two halves lived in two tables and a row had one or the
  // other. One row carries all three now, and they are not equal evidence: a
  // ticked service is what this person SAID they sell, while a profession and a
  // sphere are inferences from what they call themselves. So the ladder is
  // ticks → professions → sphere, and it stops at the first rung that answers.
  const ticked = new Set(p.services ?? [])
  if (ticked.size) {
    const known = TOPIC_GROUPS.flatMap(g => g.topics).filter(t => ticked.has(t.id))
    if (known.length) return [...new Set(known.map(t => t.id))]
  }
  const rows = TOPIC_GROUPS
    .filter(g => g.kinds.includes('MEETING') || g.kinds.includes('PROJECT'))
    .flatMap(g => g.topics)
  // Whole label, case-insensitively trimmed — the same comparison
  // lib/requestRouting makes, never a substring: „იურისტი" must not match
  // „კორპორატიული იურისტი" by accident.
  const mine = new Set((p.professions ?? []).map(s => s.trim().toLowerCase()).filter(Boolean))
  const byProfession = mine.size
    ? rows.filter(t => (t.professions ?? []).some(x => mine.has(x.trim().toLowerCase())))
    : []
  if (byProfession.length) return [...new Set(byProfession.map(t => t.id))]
  const sphere = (p.categorySlug ?? '').trim()
  if (!sphere) return []
  return [...new Set(rows.filter(t => t.categorySlug === sphere).map(t => t.id))]
}

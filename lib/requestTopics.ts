// WHAT PEOPLE CAN ASK FOR — the request system's own vocabulary.
//
// ⚠️ THIS IS NOT `Category`, AND IT MUST NEVER BECOME IT. The sphere taxonomy
// (prisma → Category, lib/professionSeo) describes what the EXPERTS ON THIS
// PLATFORM DO: it drives browse, /categories, the counts and the SEO pages.
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

export const REQUEST_KINDS = ['LEARNING', 'CONSULTATION', 'PROJECT', 'SERVICE'] as const
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
    label: 'მასწავლებელი',
    hint: 'გაკვეთილები, მომზადება, ენები',
    unit: 'PER_LESSON',
    unitLabel: 'ერთ გაკვეთილზე',
    timingLabel: 'რამდენად ხშირად',
  },
  CONSULTATION: {
    label: 'კონსულტაცია',
    hint: 'ერთი შეხვედრა სპეციალისტთან',
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
    label: 'ხელოსანი',
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
    : 'CONSULTATION' // the middle shape, and the safest thing to misread as
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
  CONSULTATION: [
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

export function bandOf(kind: RequestKindName, bandId: string): BudgetBand | undefined {
  return BUDGET_BANDS[kind].find(b => b.id === bandId)
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
  CONSULTATION: [
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

const LEARNING_EXTRAS: ExtraQuestion[] = [
  {
    id: 'audience',
    label: 'ვისთვის',
    options: [
      { id: 'primary',   label: 'დაწყებითი კლასები' },
      { id: 'pupil',     label: 'სკოლის მოსწავლე' },
      { id: 'abiturient',label: 'აბიტურიენტი' },
      { id: 'student',   label: 'სტუდენტი' },
      { id: 'adult',     label: 'ზრდასრული' },
    ],
  },
  {
    id: 'level',
    label: 'რა დონეა',
    options: [
      { id: 'beginner',     label: 'დამწყები' },
      { id: 'intermediate', label: 'საშუალო' },
      { id: 'advanced',     label: 'მაღალი' },
      { id: 'unsure',       label: 'არ ვიცი' },
    ],
  },
]

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
        { id: 'master',  label: 'ხელოსანი' },
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
function groupIdOf(topicId: string): string | undefined {
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
  if (kind === 'LEARNING') return LEARNING_EXTRAS
  if (kind !== 'SERVICE') return []
  const group = topic ? groupIdOf(topic) : undefined
  const perTrade = group ? GROUP_EXTRAS[group] ?? [] : []
  return [...SERVICE_EXTRAS, ...perTrade]
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
export const FORMATS = [
  { id: 'ONLINE',   label: 'ონლაინ' },
  { id: 'IN_PERSON',label: 'ადგილზე' },
  { id: 'EITHER',   label: 'სულერთია' },
] as const
export type FormatName = (typeof FORMATS)[number]['id']

export function formatLabel(id: string): string {
  return FORMATS.find(f => f.id === id)?.label ?? id
}

export const CITIES = [
  { id: 'TBILISI', label: 'თბილისი' },
  { id: 'BATUMI',  label: 'ბათუმი' },
  { id: 'KUTAISI', label: 'ქუთაისი' },
  { id: 'RUSTAVI', label: 'რუსთავი' },
  { id: 'OTHER',   label: 'სხვა' },
] as const
export type CityName = (typeof CITIES)[number]['id']

export function cityLabel(id: string): string {
  return CITIES.find(c => c.id === id)?.label ?? id
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
const CP = ['CONSULTATION', 'PROJECT'] as const
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
      { id: 'business-plan', label: 'ბიზნესგეგმა', categorySlug: 'business' },
      { id: 'strategy',      label: 'სტრატეგია', categorySlug: 'business' },
      { id: 'startup',       label: 'სტარტაპი', categorySlug: 'business' },
      { id: 'operations',    label: 'ოპერაციები და პროცესები', categorySlug: 'business' },
      { id: 'project-mgmt',  label: 'პროექტის მართვა', categorySlug: 'business' },
      { id: 'franchise',     label: 'ფრანშიზა', categorySlug: 'business' },
    ],
  },
  {
    id: 'finance', label: 'ფინანსები და გადასახადები', kinds: CP,
    template: 'საქმიანობა: … (შპს / ინდმეწარმე / ფიზიკური პირი)\nრა მჭირდება: …\nპერიოდი ან მოცულობა: …',
    topics: [
      { id: 'accounting',  label: 'ბუღალტერია', categorySlug: 'tax' },
      { id: 'declaration', label: 'დეკლარაცია', alt: ['გადასახადი', 'RS'], categorySlug: 'tax' },
      { id: 'vat',         label: 'დღგ', categorySlug: 'tax' },
      { id: 'audit',       label: 'აუდიტი', categorySlug: 'tax' },
      { id: 'fin-analysis',label: 'ფინანსური ანალიზი', categorySlug: 'finance' },
      { id: 'investment',  label: 'ინვესტიციები', categorySlug: 'finance' },
      { id: 'crypto',      label: 'კრიპტო', categorySlug: 'crypto' },
    ],
  },
  {
    id: 'law', label: 'სამართალი', kinds: CP,
    template: 'სიტუაცია მოკლედ: …\nვინ არის მეორე მხარე: …\nრა შედეგი მინდა: …',
    topics: [
      { id: 'contract',   label: 'ხელშეკრულება', alt: ['იურისტი', 'ადვოკატი', 'ხელშეკრულების შედგენა', 'კონტრაქტი'], categorySlug: 'law' },
      { id: 'labor-law',  label: 'შრომითი დავა', categorySlug: 'law' },
      { id: 'family-law', label: 'საოჯახო სამართალი', alt: ['განქორწინება'], categorySlug: 'law' },
      { id: 'corp-law',   label: 'კორპორატიული სამართალი', categorySlug: 'law' },
      { id: 'ip-law',     label: 'ინტელექტუალური საკუთრება', categorySlug: 'law' },
      { id: 'court',      label: 'სასამართლო დავა', alt: ['ადვოკატი', 'იურისტი', 'სარჩელი'], categorySlug: 'law' },
      { id: 'company-reg',label: 'კომპანიის რეგისტრაცია', categorySlug: 'law' },
    ],
  },
  {
    id: 'marketing', label: 'მარკეტინგი და გაყიდვები', kinds: CP,
    template: 'პროდუქტი ან სერვისი: …\nმიზანი: … (გაყიდვები / ცნობადობა)\nდღეს რა არხები მაქვს: …',
    topics: [
      { id: 'smm',       label: 'SMM და სოციალური ქსელები', categorySlug: 'marketing' },
      { id: 'seo',       label: 'SEO', categorySlug: 'marketing' },
      { id: 'ads',       label: 'რეკლამა', alt: ['Google Ads', 'Facebook'], categorySlug: 'marketing' },
      { id: 'branding',  label: 'ბრენდინგი', categorySlug: 'marketing' },
      { id: 'content',   label: 'კონტენტი და კოპირაითინგი', categorySlug: 'marketing' },
      { id: 'pr',        label: 'PR', categorySlug: 'marketing' },
      { id: 'sales-sys', label: 'გაყიდვების სისტემა', categorySlug: 'sales' },
    ],
  },
  {
    id: 'it', label: 'IT და ტექნოლოგიები', kinds: CP,
    template: 'რა უნდა გაკეთდეს: … (საიტი / აპლიკაცია / ავტომატიზაცია)\nვისთვის არის: …\nმთავარი ფუნქციები: …',
    topics: [
      { id: 'website',    label: 'ვებგვერდი', categorySlug: 'it' },
      { id: 'mobile-app', label: 'მობილური აპლიკაცია', categorySlug: 'it' },
      { id: 'automation', label: 'ავტომატიზაცია', categorySlug: 'it' },
      { id: 'data-an',    label: 'მონაცემთა ანალიზი', categorySlug: 'it' },
      { id: 'ai',         label: 'ხელოვნური ინტელექტი', categorySlug: 'it' },
      { id: 'security',   label: 'კიბერუსაფრთხოება', categorySlug: 'it' },
      { id: 'crm',        label: 'CRM და სისტემები', categorySlug: 'it' },
    ],
  },
  {
    id: 'design', label: 'დიზაინი', kinds: CP,
    template: 'რა მჭირდება: … (ლოგო / ბრენდბუქი / UI)\nბიზნესი ან პროექტი: …\nმაგალითები, რომლებიც მომწონს: …',
    topics: [
      { id: 'logo',       label: 'ლოგო და ბრენდბუქი', categorySlug: 'design' },
      { id: 'uxui',       label: 'UX/UI', categorySlug: 'design' },
      { id: 'print',      label: 'ბეჭდვითი დიზაინი', categorySlug: 'design' },
      { id: 'interior',   label: 'ინტერიერი', categorySlug: 'architecture' },
      { id: 'presentation', label: 'პრეზენტაცია', categorySlug: 'design' },
    ],
  },
  {
    id: 'psychology', label: 'ფსიქოლოგია', kinds: CP,
    template: 'რაზე მინდა მუშაობა: …\nფორმატი: … (ინდივიდუალური / წყვილი / ბავშვი)\nსიხშირე: …',
    topics: [
      { id: 'psy-individual', label: 'ინდივიდუალური კონსულტაცია', alt: ['ფსიქოლოგი', 'ფსიქოთერაპევტი', 'თერაპია'], categorySlug: 'psychology' },
      { id: 'psy-couple',     label: 'წყვილის თერაპია', categorySlug: 'psychology' },
      { id: 'psy-child',      label: 'ბავშვისა და მოზარდის ფსიქოლოგი', categorySlug: 'psychology' },
      { id: 'psy-org',        label: 'ორგანიზაციული ფსიქოლოგია', categorySlug: 'psychology' },
    ],
  },
  {
    id: 'career', label: 'კარიერა და HR', kinds: CP,
    template: 'რა პოზიციას ვეძებ: …\nგამოცდილება: … წელი\nრა მჭირდება: … (CV / გასაუბრება / რჩევა)',
    topics: [
      { id: 'cv',        label: 'რეზიუმე და CV', categorySlug: 'career' },
      { id: 'interview', label: 'გასაუბრებისთვის მომზადება', categorySlug: 'career' },
      { id: 'career-adv',label: 'კარიერული კონსულტაცია', categorySlug: 'career' },
      { id: 'hiring',    label: 'დაქირავება', categorySlug: 'hr' },
      { id: 'training',  label: 'ტრენინგი გუნდისთვის', categorySlug: 'hr' },
    ],
  },
  {
    id: 'media', label: 'მედია და კონტენტი', kinds: CP,
    template: 'რა უნდა გადაიღოს/გაკეთდეს: …\nთარიღი და ადგილი: …\nხანგრძლივობა ან მოცულობა: …',
    topics: [
      { id: 'photo',      label: 'ფოტოგრაფია' },
      { id: 'video',      label: 'ვიდეოგადაღება' },
      { id: 'editing',    label: 'მონტაჟი' },
      { id: 'translation',label: 'თარგმანი' },
      { id: 'podcast',    label: 'პოდკასტი' },
    ],
  },
  {
    id: 'property', label: 'უძრავი ქონება და მშენებლობა', kinds: CP,
    template: 'ობიექტი: … (ბინა / სახლი / კომერციული)\nსად მდებარეობს: …\nრა მჭირდება: …',
    topics: [
      { id: 'architecture', label: 'არქიტექტურა', categorySlug: 'architecture' },
      { id: 'valuation',    label: 'ქონების შეფასება', categorySlug: 'real-estate' },
      { id: 'estimate',     label: 'ხარჯთაღრიცხვა', categorySlug: 'architecture' },
      { id: 'broker',       label: 'ყიდვა-გაყიდვა', categorySlug: 'real-estate' },
      { id: 'renovation',   label: 'რემონტის დაგეგმვა' },
    ],
  },
  {
    id: 'relocation', label: 'ვიზა, მიგრაცია და რელოკაცია', kinds: CP,
    template: 'რომელი ქვეყანა: …\nჩემი სტატუსი ახლა: …\nრა მჭირდება: … (ვიზა / ბინადრობა / სწავლა)',
    topics: [
      { id: 'visa',        label: 'ვიზა', categorySlug: 'relocation' },
      { id: 'residence',   label: 'ბინადრობის ნებართვა', categorySlug: 'relocation' },
      { id: 'study-abroad',label: 'საზღვარგარეთ სწავლა', categorySlug: 'relocation' },
      { id: 'tax-residence', label: 'საგადასახადო რეზიდენტობა', categorySlug: 'relocation' },
    ],
  },
  {
    id: 'grants', label: 'გრანტები და ტენდერები', kinds: CP,
    template: 'პროექტი მოკლედ: …\nსავარაუდო თანხა: …\nდედლაინი: …',
    topics: [
      { id: 'grant',   label: 'გრანტის განაცხადი' },
      { id: 'tender',  label: 'ტენდერი' },
      { id: 'funding', label: 'დაფინანსების მოძიება' },
    ],
  },
  {
    id: 'logistics', label: 'ლოგისტიკა და საბაჟო', kinds: CP,
    template: 'ტვირთი ან საკითხი: …\nმარშრუტი: … → …\nრა მჭირდება: …',
    topics: [
      { id: 'customs',  label: 'საბაჟო' },
      { id: 'import',   label: 'ექსპორტ-იმპორტი' },
      { id: 'supply',   label: 'მიწოდების ჯაჭვი' },
    ],
  },
  {
    id: 'health', label: 'ჯანმრთელობა და კვება', kinds: CP,
    template: 'მიზანი: … (კვება / წონა / ვარჯიში)\nჯანმრთელობის შეზღუდვები: …',
    topics: [
      { id: 'dietitian', label: 'დიეტოლოგი', categorySlug: 'health' },
      { id: 'nutrition', label: 'კვების გეგმა', categorySlug: 'health' },
      { id: 'training-plan', label: 'ვარჯიშის გეგმა', categorySlug: 'health' },
    ],
  },
  {
    id: 'events', label: 'ტურიზმი და ღონისძიებები', kinds: CP,
    template: 'რა ღონისძიებაა: …\nთარიღი: …\nსტუმრების რაოდენობა: …\nრა შედის ბიუჯეტში: …',
    topics: [
      { id: 'event',   label: 'ღონისძიების ორგანიზება' },
      { id: 'tour',    label: 'ტურის დაგეგმვა' },
      { id: 'guide',   label: 'გიდი' },
    ],
  },
  {
    id: 'agriculture', label: 'სოფლის მეურნეობა', kinds: CP,
    template: 'მეურნეობა: …\nმოცულობა: … (ფართობი / სულადობა)\nპრობლემა ან საჭიროება: …',
    topics: [
      { id: 'agronomy', label: 'აგრონომია' },
      { id: 'vet',      label: 'ვეტერინარია' },
      { id: 'wine',     label: 'მეღვინეობა' },
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
      { id: 'rep-assembly', label: 'ავეჯის აწყობა', alt: ['კარადის აწყობა', 'ხელოსანი'] },
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
  CONSULTATION: 'სიტუაცია: …\nკითხვა: …\nრა ვცადე აქამდე: …',
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
  CONSULTATION: 'გამარჯობა! ამ საკითხზე ვმუშაობ … წელია.\nშეხვედრაზე განვიხილავთ: …\nთავისუფალი დრო მაქვს: …',
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
export const SUGGESTED_TOPIC_IDS = [
  'english', 'math',           // LEARN
  'contract', 'accounting',    // CONSULT
  'logo', 'renovation',        // JOB
  // The two most-asked-for trades in any household. „დამლაგებელი" and
  // „სანტექნიკოსი" are also the two words most likely to be TYPED, so a visitor
  // who recognises one here learns in a single glance that this half of the
  // product exists at all.
  'clean-flat', 'plumb-leak',  // SERVICE
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

export function groupsForKind(kind: RequestKindName): TopicGroup[] {
  return TOPIC_GROUPS.filter(g => g.kinds.includes(kind))
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

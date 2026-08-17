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
 *
 * A single budget enum cannot serve all three: „500–1000₾" and „20–40₾" are
 * both correct answers to „what is your budget" and they are not the same
 * question. That is the mistake `B2BService.kind` exists to undo, and this
 * splits the axis before it is made rather than after.
 */
import { rankCandidates } from './topicMatch'

export const REQUEST_KINDS = ['LEARNING', 'CONSULTATION', 'PROJECT'] as const
export type RequestKindName = (typeof REQUEST_KINDS)[number]

/** What the money is attached to. Snapshotted on the row rather than derived
 *  from `kind` at read time, for the same reason Booking snapshots its
 *  serviceType: changing the mapping later must not rewrite what somebody
 *  already answered. */
export const BUDGET_UNITS = ['PER_LESSON', 'PER_SESSION', 'TOTAL'] as const
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

/** The questions for THIS request. `topic` is accepted and unused today — see
 *  the block comment for why the signature is already the per-topic one. */
export function extrasFor(kind: RequestKindName, _topic?: string): ExtraQuestion[] {
  return kind === 'LEARNING' ? LEARNING_EXTRAS : []
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
  CONSULTATION: 'სიტუაცია: …\nკითხვა: …\nრა ვსცადე აქამდე: …',
  PROJECT: 'რა უნდა გაკეთდეს: …\nვისთვის არის: …\nშედეგი, რომელსაც ველი: …',
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

/* ── the six shown before anything is typed ────────────────────────────────
 *
 * WHY THEY EXIST. Step 1 opened on an empty search box and 23 folded headings.
 * Nothing on that screen showed what a valid answer LOOKS like — the only
 * example was a placeholder, which disappears on the first keystroke. Six
 * one-tap examples turn a blank start into a start (owner, 2026-08-17: „დაწყება
 * ცოტა რთულია"). Recognition over recall, the same reason the accordion is
 * there at all.
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
] as const

/**
 * Resolved once, at module load.
 *
 * ⚠️ IT FILTERS, IT DOES NOT THROW, and the reason is the import graph: this
 * file is re-exported by lib/requests.ts, which `middleware.ts` imports — so a
 * throw at module load would not fail the one screen that reads this list, it
 * would take down EVERY route on the site because somebody renamed a topic.
 * A missing id costs one chip; the guarantee that there is no missing id is a
 * test's job, and tests/requests.test.ts asserts the full six.
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

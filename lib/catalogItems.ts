// ONE LIST, KEYED ON THE PERSON — the merged catalogue's model.
//
// ⚠️ WHY THIS FILE EXISTS. Owner, 2026-08-19, three times in one morning:
// „სერვისები და ექსპერტები უნდა გაერთიანდეს და პატარა გადასართავი ექნება",
// then „მოვიფიქროთ რომ იდენტურია უბრალოდ და ფილტრაციასავით უნდა იყოს — ვიღაცას
// კონსულტაცია აქვს, ვიღაცას სერვისი", and finally the sentence that fixed the
// model: „ექსპერტები და სერვისები ხო ერთია — ექსპერტს აქვს სერვისი რეალურად და
// პარალელურად აკეთებს კონსულტაციასაც. მთელი პრინციპი ეს იყო."
//
// ⚠️ SO THE KIND IS A PROPERTY OF WHAT SOMEBODY OFFERS, NOT OF WHO THEY ARE.
// This is the same model lib/capabilities already names: CONSULT is „I take
// consultations", WORK is „I do jobs", and one person may hold both. An
// accountant sells 45-minute consultations AND does a year-end close as a job;
// a plumber only does jobs; a psychologist only consultations. The two live in
// two tables tonight (TutorProfile + Consultation rows, ServiceProfile +
// `services[]`) and this file does NOT change that — it expresses the right
// model over the data we have.
//
// ⚠️ THEREFORE: ONE PERSON, ONE ITEM. The merge is a group-by on the USER, not
// a concatenation of two lists. Measured 2026-08-19: 26 experts, 6 masters, and
// ZERO people holding both — so the merge is not exercisable today, which is
// exactly why it has to be written correctly now: the day somebody enables the
// second half of their offering (lib/capabilities → enableCapabilityHref), a
// concatenation would print them twice, and nothing on the screen would say the
// two cards are one person.
//
// ⚠️ AND NO DATABASE UNION. 26 + 6 rows. Both sides are loaded by their own
// existing query (lib/tutorsQuery → queryTutors, app/experts/_masterData →
// queryMasters, whose VISIBLE rule is untouched), mapped here, and the browser
// filters/sorts/paginates the combined array — the same thing /experts has
// always done with its roster. A SQL union across two unrelated tables would be
// a new query to keep in step with two visibility rules for no measurable gain.
// Revisit if either side passes a few hundred rows.
//
// PURE: no prisma, no react, no environment. The two row types arrive as TYPE
// imports only (erased at compile time), so a test can execute this file.

import { CAPABILITIES, type Capability } from './capabilities'
import { LIVE_SERVICE_GROUPS } from './serviceProfile'
import { CITIES } from './requestTopics'
import { primaryPrice } from '@/components/booking/slots'
import type { Tutor } from '@/app/experts/_data'
import type { MasterRow } from '@/app/experts/_masterData'

/**
 * HOW A SERVICE IS BOUGHT — not what KIND of thing it is.
 *
 * ⚠️ „კონსულტაცია" LEFT THE PLATFORM'S VOCABULARY (2026-08-20). It was one of
 * these two labels, sitting opposite „სერვისი" as though they were two products.
 * They are not, and the owner's own example is what settles it: a psychologist
 * selling „ბავშვთა სეანსი — 100₾, 60 წთ" is selling a SERVICE; the schema called
 * it a consultation only because it has a price and a clock. „ერთ რამეს ორი
 * სახელი არ გვჭირდება."
 *
 * So there is ONE product — a service — and two ways to buy it:
 *   WORK      a price, and the details are agreed (a repair, a declaration)
 *   CONSULT   a price and a CLOCK: the client picks a time and it is booked
 *
 * ⚠️ THE MECHANISM IS UNTOUCHED. The calendar, the free slots, „დაჯავშნე", the
 * video room and `Consultation.bookable` all stay exactly as they are — a
 * session and a lesson genuinely need a time. What went is the WORD as a
 * product type: no category, no filter option, no registration step called
 * „კონსულტაცია". A provider may still TYPE it as the name of their own service
 * („გაცნობითი კონსულტაცია — 15 წთ"); that is their copy, not our structure.
 *
 * ⚠️ AND THE IDENTIFIERS DO NOT MOVE. `CONSULT` / `WORK` / `bookable` are code,
 * and CLAUDE.md's lexicon rule is explicit that retired words are a UI matter —
 * renaming a column to chase a word is how two vocabularies drift apart.
 */
export const KIND_LABEL: Record<Capability, string> = {
  CONSULT: 'დროით',
  WORK: 'შეთანხმებით',
}

/** The rail's own heading. It asks how the visitor wants to buy, which is a
 *  property of the OFFER — never „what kind of person is this". */
export const KIND_SECTION_TITLE = 'როგორ ყიდულობ'

/**
 * ONE PERSON AND EVERYTHING THEY OFFER.
 *
 * `consult` / `work` are the ORIGINAL rows, carried whole, because each card
 * still renders from its own side's shape and keeps every behaviour it has
 * (`vt-photo-<id>`, the slug href, favourites, the hover video, the badges, the
 * master's „პროფილი" → /experts/<slug> too, since stage 11). The merge does not flatten the two
 * into a lowest common denominator — that would cost both cards their footer.
 */
export type CatalogItem = {
  /** The PERSON's identity, and the React key. See `personKey`. */
  key: string
  /** What they offer, in CAPABILITIES order. Never empty. */
  kinds: Capability[]
  /** For the mixed list's kind labels and for anything that needs a name. */
  name: string
  /** The consultation side, or null. */
  consult: Tutor | null
  /** The job side, or null. */
  work: MasterRow | null

  /* ── the sort keys, resolved once ──────────────────────────────────────
     ⚠️ EVERY SORT MUST MEAN SOMETHING FOR BOTH HALVES, and where a key only
     exists on one half the fallback is written here rather than inside the
     comparator, so „what does ფასით, ზრდადი do to a plumber" has one answer. */

  /** Epoch ms of the side that leads the card (CONSULT when they have one),
   *  0 when neither row carries a date. Drives „ახლის მიხედვით". */
  createdAt: number
  /**
   * The one number a price sort can use, or null when this person quotes per
   * job. CONSULT → the flagship tier's price (the SAME number the card prints,
   * via `primaryPrice`); WORK → `priceFrom`, else the callout fee.
   *
   * ⚠️ NULL SORTS LAST IN BOTH DIRECTIONS. A master who quotes per job is
   * working normally, not leaving a blank (see lib/serviceProfile → priceHint):
   * treating „ask" as ₾0 would put every one of them at the top of „ფასით,
   * ზრდადი" and at the bottom of „ფასით, კლებადი" — an invented fact, twice.
   */
  price: number | null
  /** Completed sessions — a consultation number. A job side has none, and the
   *  fallback is 0, which sorts it below anybody who has one rather than
   *  inventing a job count that does not exist. */
  sessions: number
}

/**
 * WHAT SOMEBODY OFFERS — read off the OFFERS, never off which table they sit in.
 *
 * ⚠️ THIS USED TO BE `consult !== null ? CONSULT : WORK` AND THAT IS NOW WRONG
 * (2026-08-20). It was right for one day: on 2026-08-19 the two shapes lived in
 * two tables, so holding a `TutorProfile` WAS holding CONSULT. Then
 * `Consultation.bookable` landed (schema.prisma) and an expert could publish a
 * JOB — „დეკლარაციის შევსება — ₾100", no clock, arranged in the thread — as a
 * row on their own profile. Under the old rule that person was labelled
 * CONSULT, the „სამუშაო" filter could not find them, and the type rail counted
 * them on the wrong side: the ONE structural thing standing between the site's
 * services half and the people who actually sell services.
 *
 * So: CONSULT means „at least one row you can book a time on"; WORK means „at
 * least one row you buy without one" — a service row on the expert side, a
 * `ServiceProfile` on the job side, or both. `bookable` absent reads as true,
 * which is what every row written before 2026-08-20 is.
 *
 * The fallback exists because `kinds` is documented as never empty and a person
 * with no rows at all would otherwise produce `[]`. It cannot be reached
 * through the catalogue (`lib/tutorsQuery → PUBLIC_TUTOR` requires
 * `consultations: { some: {} }`), only through a fixture, and answering with
 * the table is exactly the old rule — correct precisely when there is nothing
 * better to read.
 */
function kindsOf(consult: Tutor | null, work: MasterRow | null): Capability[] {
  const rows = consult?.consultations ?? []
  // ⚠️ NO ROWS = NO SIGNAL, so that side falls back to its TABLE — the rule as
  // it stood before this function existed, which is correct exactly when there
  // is nothing better to read. It is reachable: `app/experts/_data → mapTutorRow`
  // already defends against a cached payload that predates the tier select, and
  // an expert whose tiers went missing must not be silently relabelled a
  // service-seller. A tutor with genuinely zero rows cannot be listed at all
  // (lib/tutorsQuery → PUBLIC_TUTOR requires `consultations: { some: {} }`).
  const canConsult = consult !== null && (rows.length === 0 || rows.some(r => r.bookable !== false))
  const canWork = work !== null || rows.some(r => r.bookable === false)
  const kinds = CAPABILITIES.filter(c => (c === 'CONSULT' ? canConsult : canWork))
  // `kinds` is documented as never empty; only a row with neither side could
  // reach this, and `toCatalogItems` cannot build one.
  return kinds.length ? kinds : CAPABILITIES.filter(c => (c === 'CONSULT' ? consult : work) !== null)
}

/**
 * THE PERSON, NOT THE ROW.
 *
 * A `TutorProfile` and a `ServiceProfile` for one human share nothing but
 * `userId` — different tables, different ids, different slugs. So the identity
 * is the user, and the two profile ids are only the fallback for a row that has
 * no user at all (a company's ServiceProfile: `userId` and `companyId` are
 * exclusive, see the schema).
 */
export const personKeyOfConsult = (t: Pick<Tutor, 'id' | 'userId'>) =>
  t.userId ? `u:${t.userId}` : `t:${t.id}`

const personKeyOfWork = (m: Pick<MasterRow, 'id' | 'userId' | 'companyId'>) =>
  m.userId ? `u:${m.userId}` : m.companyId ? `c:${m.companyId}` : `s:${m.id}`

/**
 * The two loaded rosters → one list of people.
 *
 * ORDER: the consultation side first, in the order its query returned (the
 * curated verified→rating order „ჩვენი რჩევით" keeps), then every job-side row
 * that did not merge into somebody already in the list, in ITS query's order
 * (oldest first, the same as the deleted /services door). Pure and stable: the same two inputs
 * always give the same array.
 */
export function toCatalogItems(tutors: Tutor[], masters: MasterRow[]): CatalogItem[] {
  const byKey = new Map<string, { consult: Tutor | null; work: MasterRow | null }>()
  const order: string[] = []

  for (const t of tutors ?? []) {
    const key = personKeyOfConsult(t)
    const seen = byKey.get(key)
    // Two TutorProfiles for one user cannot exist (the column is unique), but a
    // duplicated payload must not become a duplicated card either.
    if (seen) { seen.consult ??= t; continue }
    byKey.set(key, { consult: t, work: null })
    order.push(key)
  }

  for (const m of masters ?? []) {
    const key = personKeyOfWork(m)
    const seen = byKey.get(key)
    if (seen) { seen.work ??= m; continue }
    byKey.set(key, { consult: null, work: m })
    order.push(key)
  }

  return order.map(key => {
    const { consult, work } = byKey.get(key)!
    return {
      key,
      kinds: kindsOf(consult, work),
      name: consult?.name ?? work?.name ?? '',
      consult,
      work,
      createdAt: consult?.createdAt
        ? new Date(consult.createdAt).getTime()
        : work?.createdAt
          ? new Date(work.createdAt).getTime()
          : 0,
      price: consult
        ? primaryPrice(consult.consultations ?? [], consult.price)
        : work?.priceValue ?? null,
      sessions: consult?.sessions ?? 0,
    }
  })
}

/* ═══════════ what the URL may say about the type ════════════════════════ */

/**
 * `?type=CONSULT`, `?type=WORK`, `?type=CONSULT,WORK` — and nothing else.
 *
 * ⚠️ AT LEAST ONE IS ALWAYS ON, AND UNTICKING THE LAST ONE TURNS BOTH ON.
 * Zero types selected is an empty page with no way back except the reset link —
 * a state a filter must never be able to reach by its own rules. „Neither" and
 * „both" mean the same thing to the query anyway (show me everyone), so the
 * empty selection resolves to the full one; the rail redraws with both boxes
 * ticked, which is the honest picture of what is on screen.
 *
 */
export function resolveTypes(raw: string | string[] | null | undefined): Capability[] {
  const parts = (Array.isArray(raw) ? raw : [raw ?? ''])
    .flatMap(s => s.split(','))
    .map(s => s.trim().toUpperCase())
  const picked = CAPABILITIES.filter(c => parts.includes(c))
  // ⚠️ DEFAULT = EVERYTHING (2026-08-19). Each address used to open on its own
  // half, so the two pages were still two catalogues wearing one skin — the
  // owner's whole point was that they are ONE list („ერთიანად უნდა
  // ისქროლებდეს"). There is one address left (stage 10) and it shows everybody.
  // A `?type=` narrows it; nothing else does.
  return picked.length > 0 ? picked : [...CAPABILITIES]
}

/** Ticking a type row. Never returns an empty selection — see `resolveTypes`. */
export function toggleType(types: readonly Capability[], v: Capability): Capability[] {
  const next = types.includes(v) ? types.filter(t => t !== v) : [...types, v]
  return next.length === 0 ? [...CAPABILITIES] : CAPABILITIES.filter(c => next.includes(c))
}

/**
 * The value for `?type=`, or null when the selection is simply „everybody" —
 * which is what the bare address already means, so writing it down would put a
 * choice the reader never made into every link they share. Mirrors
 * `resolveTypes`: whatever this omits, that function must default back to.
 */
export function typeParam(types: readonly Capability[]): string | null {
  const picked = CAPABILITIES.filter(c => types.includes(c))
  if (picked.length === CAPABILITIES.length || picked.length === 0) return null
  return picked.join(',')
}

/* ═══════════ the job side's own vocabulary, validated ═══════════════════ */

/**
 * `?trade=` accepts a group id or a topic id, exactly as /experts always has —
 * to the person filtering they are the same act. Unknown values are DROPPED,
 * never an error: a trade we closed or a hand-typed parameter should show the
 * unfiltered catalogue, not a 404 (app/experts/_masterData states the same rule).
 */
export function parseTrades(raw: string | string[] | null | undefined): string[] {
  const known = new Set<string>()
  for (const g of LIVE_SERVICE_GROUPS) {
    known.add(g.id)
    for (const t of g.topics) known.add(t.id)
  }
  return csv(raw).filter(v => known.has(v))
}

export function parseCities(raw: string | string[] | null | undefined): string[] {
  const known = new Set(CITIES.map(c => c.id as string))
  return csv(raw).filter(v => known.has(v))
}

const csv = (raw: string | string[] | null | undefined): string[] => {
  const s = Array.isArray(raw) ? raw.join(',') : (raw ?? '')
  return [...new Set(s.split(',').map(x => x.trim()).filter(Boolean))]
}

/**
 * The topic ids a trade selection covers, or null when it selects everything.
 *
 * ⚠️ A UNION, NOT AN INTERSECTION — the rule app/experts/_masterData → topicsOf has
 * always applied, moved here so the browser can run it. Ticking two boxes means
 * „either of these"; intersecting would make every second tick return fewer
 * results and eventually none.
 */
export function tradeTopicIds(trades: readonly string[]): Set<string> | null {
  if (trades.length === 0) return null
  const out = new Set<string>()
  for (const v of trades) {
    const group = LIVE_SERVICE_GROUPS.find(g => g.id === v)
    if (group) { group.topics.forEach(t => out.add(t.id)); continue }
    out.add(v)
  }
  return out
}

/**
 * Does this job side match the free-text box?
 *
 * ⚠️ A PLAIN SUBSTRING, AND ON PURPOSE. The consultation side's search is the
 * Georgian trigram ranking in lib/tutorsQuery — it runs in Postgres and the
 * client refetches for it. There is no such index on ServiceProfile and six
 * rows do not justify building one, so the job side is matched here over the
 * words already on the card: the name, the trades and the „about". Case is
 * folded; Georgian has none, but a Latin firm name has.
 */
export function workMatchesQuery(m: MasterRow, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  const hay = [m.name, m.about ?? '', ...m.services].join(' ').toLowerCase()
  return hay.includes(needle)
}

/**
 * The price comparator both directions share, with the one rule that makes a
 * price sort meaningful across two halves: NULL LAST, ALWAYS. See
 * `CatalogItem.price`.
 */
export const byPrice = (dir: 1 | -1) => (a: CatalogItem, b: CatalogItem): number => {
  if (a.price === null && b.price === null) return 0
  if (a.price === null) return 1
  if (b.price === null) return -1
  return (a.price - b.price) * dir
}

/** A trade id (group OR topic) → the word the rail prints. Unknown → the id,
 *  which is never rendered because the parser drops unknown ids first. */
export const tradeLabel = (id: string): string => {
  for (const g of LIVE_SERVICE_GROUPS) {
    if (g.id === id) return g.label
    const t = g.topics.find(x => x.id === id)
    if (t) return t.label
  }
  return id
}

/** A city id → its Georgian name. */
export const cityLabelOf = (id: string): string => CITIES.find(c => c.id === id)?.label ?? id

// THE CATALOGUE'S ONE QUERY — every provider the public may read, as rows.
//
// ⚠️ IT WAS THE „MASTERS" HALF UNTIL 2026-08-24 (this file was `_providers.ts`).
// The catalogue used to load TWO rosters and merge them by person: consultation
// experts out of `TutorProfile` and trades providers out of `ServiceProfile`.
// The consultation product was removed, its table with it, and the 27 people it
// held were migrated INTO ServiceProfile — so there is one roster, one query and
// one card, and `lib/catalogItems` shrank to the URL parsing it always also did.
//
// What arrives here that did not before: `headline`, `professions`, the sphere,
// `verified`, `languages`, `rating`. Those are the columns a lawyer's card needs
// and a plumber's card simply leaves empty — see the model, which documents each.

import { prisma } from '@/lib/prisma'
import { ensureMasterSlug } from '@/lib/masterSlug'
import { LIVE_OFFER_GROUPS, serviceLabels, areaLabels, priceHint, lowestPrice } from '@/lib/serviceProfile'
import { CITIES, type CityName } from '@/lib/requestTopics'
import { langLabel, toLangCode } from '@/lib/languages'
import { avatarRouteSrc, AVATAR_SHAPE_SQL } from '@/lib/avatarSrc'

// The DB stores language CODES (ka/en/…); every surface works in human labels.
// `toLangCode` first, so a legacy row still holding a NAME („ქართული") lands on
// the same label as a code row — otherwise the same person reads differently
// depending on when they signed up.
const toLangLabel = (v: string): string => langLabel(toLangCode(v) ?? v)

/**
 * THE DOOR, WRITTEN ONCE.
 *
 * ⚠️ `for=service` IS NOT OPTIONAL. The request wizard opens on whichever
 * vertical the door names (lib/requestTopics → VERTICALS); a bare link from a
 * trades surface drops somebody with water on their floor into a picker that
 * offers school subjects three rows above სანტექნიკა — the exact confusion the
 * split exists to end. Every trades CTA on the site reads this constant: the
 * catalogue's header button, its empty state, /experts/<trade> and
 * /experts/<slug>.
 */
export const REQUEST_HREF = '/request?for=service'

/* ═══════════ what the URL may say ═══════════════════════════════════════ */

/**
 * What a caller may ask this query for.
 *
 * ⚠️ IT IS STILL AN ADDRESS, IT IS JUST RESOLVED SOMEWHERE ELSE (2026-08-19).
 * The rule this file has held since it was written — a filtered catalogue is a
 * page somebody sends to a friend and a crawler indexes, so „ელექტრიკოსი
 * თბილისში" needs a real URL — is unchanged, and the merged catalogue keeps it:
 * the container writes `?trade=` and `?city=` into the address bar exactly as
 * this model parsed them out of it, so every filtered link ever sent still
 * resolves and Back still walks through filter states. What moved is WHO
 * resolves them, and the reason is that there is one list now: with the two
 * halves merged, a server-resolved job filter and a browser-resolved
 * consultation filter on one screen would be two mechanisms fighting over one
 * result set. The vocabulary is validated in lib/catalogItems instead, by the
 * same rule (an unknown value is dropped, never a 404).
 *
 * `trade` is ONE parameter that accepts either a group id or a topic id,
 * because to the person filtering they are the same act: narrowing. Splitting
 * them into `group=` and `topic=` would let the two disagree in a link
 * („plumbing" + „elec-socket") and nothing could answer what that means.
 *
 * ⚠️ SETS, NOT SINGLE VALUES (2026-08-18) — and the single-value version was
 * the defect. „ერთი ფილტრი ერთდროულად" cannot express the commonest real
 * question on this page: a household needs a plumber OR an electrician, and a
 * master who does both is one person. The competitor's rail is checkboxes for
 * exactly this reason.
 *
 * Groups and topics are separate sets now. The old model folded them into one
 * `trade=` value so a link could not contradict itself — with sets that
 * argument no longer holds: „plumbing" plus „elec-socket" is a coherent
 * question (all plumbing, and that one electrical job), so both are kept and
 * the query unions them.
 */
export type ProvidersFilter = {
  /** Whole groups the reader ticked. */
  groups: string[]
  /** Individual topics the reader ticked. */
  topics: string[]
  cities: CityName[]
  /** Category SLUGS — the sphere. Used by the profession landings, which are
   *  built around one sphere and have no topic to narrow by. */
  cats?: string[]
  /** Cap the rows. The catalogue takes the roster; a landing takes a grid. */
  limit?: number
}

/** The topic ids this filter selects, or null when it selects every trade. */
function topicsOf(f: ProvidersFilter): string[] | null {
  if (f.groups.length === 0 && f.topics.length === 0) return null
  // ⚠️ A UNION, NOT AN INTERSECTION. Ticking two boxes means „either of these",
  // which is what a reader means by ticking two boxes. Intersecting them would
  // make every second tick return fewer results and eventually none — the
  // classic filter that punishes you for using it.
  const out = new Set(f.topics)
  for (const id of f.groups) {
    LIVE_OFFER_GROUPS.find(g => g.id === id)?.topics.forEach(t => out.add(t.id))
  }
  return [...out]
}

/** A filtered address, built in one place so no call site half-builds one. */
export function providersHref(p: { trades?: string[]; cities?: string[] }): string {
  const q = new URLSearchParams()
  if (p.trades?.length) q.set('trade', p.trades.join(','))
  if (p.cities?.length) q.set('city', p.cities.join(','))
  const s = q.toString()
  return s ? `/experts?${s}` : '/experts'
}

/* ═══════════ what each row is worth ═════════════════════════════════════ */

/**
 * HOW MANY MASTERS EACH OPTION WOULD SHOW — the number beside every row.
 *
 * ⚠️ IT IS COUNTED AGAINST THE PUBLIC ROSTER, NOT AGAINST THE CURRENT FILTER.
 * Counting within the filter is the version that feels clever and is useless:
 * every unticked row would read 0 the moment anything is ticked, because
 * nothing else matches yet. What a reader wants before clicking is „how many
 * plumbers exist", and that number does not move while they browse — so a row
 * showing 3 keeps showing 3, and a row showing 0 is a trade we have not staffed
 * and can be greyed rather than discovered by clicking it.
 *
 * ⚠️ AND IT IS ONE QUERY, NOT ONE PER OPTION. Twenty-five options would be
 * twenty-five round trips per page load. Instead the whole public roster's
 * `services` and `areas` arrays come back once — two small string arrays per
 * master, no photos, no text — and the tallies are done in memory. At sixty
 * masters that is nothing; if this page ever paginates, revisit it.
 */
export type FilterCounts = {
  /** By group id AND by topic id — the rail draws both levels. */
  trades: Record<string, number>
  cities: Record<string, number>
}

export async function filterCounts(): Promise<FilterCounts> {
  const rows = await prisma.serviceProfile.findMany({
    where: PUBLIC,
    select: { services: true, areas: true },
  })

  const trades: Record<string, number> = {}
  const cities: Record<string, number> = {}

  for (const g of LIVE_OFFER_GROUPS) {
    const owned = new Set(g.topics.map(t => t.id))
    // A master counts ONCE for a group even when they list five of its topics —
    // the row says how many people, not how many ticks.
    trades[g.id] = rows.filter(r => r.services.some(s => owned.has(s))).length
    for (const t of g.topics) {
      trades[t.id] = rows.filter(r => r.services.includes(t.id)).length
    }
  }
  for (const c of CITIES) {
    // An empty `areas` is „I have not said", not „nowhere" — the routing treats
    // it as matching everywhere, so the count has to agree with the routing.
    cities[c.id] = rows.filter(r => r.areas.length === 0 || r.areas.includes(c.id)).length
  }

  return { trades, cities }
}

/* ═══════════ the rows ═══════════════════════════════════════════════════ */

/**
 * ⚠️ SIXTY, AND THE COUNT SAYS „ნაჩვენებია" BECAUSE OF IT. The cap matches
 * the trade landing draws. There is no pagination yet and inventing one for a
 * roster this size would be building the control before the problem; what the
 * page must not do is claim a total it did not count.
 */
const MAX_ROWS = 60

/** The visibility rule. Stated once, used by the list AND by the „is anybody
 *  here at all" count — the empty state's two answers must not be able to
 *  disagree with the grid about who exists.
 *
 *  ⚠️ EXPORTED SINCE 2026-08-19, for a fourth reader: `?to=<slug>` on the
 *  intake (lib/requestTarget) resolves the provider somebody arrived from, and
 *  „visible" there has to mean exactly what it means in the catalogue — a
 *  looser rule would let a hidden profile be addressed by URL, a stricter one
 *  would drop the recipient off a card the visitor is looking at. */
export const PUBLIC = {
  available: true,
  // Stage 5 (2026-08-19): a master (or an admin) can take the page down without
  // losing the row. Unpublished = out of the catalogue AND off /experts/<slug>
  // AND refused by the photo route — the same three readers as `available`.
  published: true,
  // ⚠️ AND THE ACCOUNT MUST NOT BE SUSPENDED (2026-08-24). This clause is the
  // one the consultation half carried and the trades half never did: the old
  // catalogue merged two rosters, `lib/tutorsQuery` filtered
  // `user.suspendedAt: null`, and this rule — which then covered 2 profiles —
  // did not. Deleting the half that had the check left it covering all 29,
  // including the 27 who were protected by it the day before, so suspending a
  // provider stopped taking them off the site: their card stayed in the
  // catalogue, /experts/<slug> stayed open and the photo route kept serving
  // their face. The sitemap, the category counts and the certificate route all
  // DID drop them, so the site disagreed with itself about who is public.
  //
  // MEASURED THE DAY THE CLAUSE WENT IN: two profiles came off the public site.
  // One had been suspended on 26 JULY and had stayed in the catalogue, open at
  // /experts/<slug> and serving their portrait for a month — protected until the
  // day the consultation half was deleted, then not. The other since 11 August.
  // Both carried `published: true, available: true` and an active allowlist row,
  // so nothing else was ever going to hide them.
  //
  // Written INSIDE the OR rather than beside it, because a company profile has
  // no user at all: `user: { is: … }` against a null relation matches nothing,
  // and hoisting it would delete every company from the catalogue to fix this.
  OR: [
    { user: { is: { suspendedAt: null, requestAccess: { active: true } } } },
    { company: { requestAccess: { active: true } } },
  ],
}

/** One card's worth of master, already in the words the card prints. Resolving
 *  labels here keeps the card a renderer: it never sees a topic id. */
export type ProviderRow = {
  id: string
  /** THE PERSON, and it is the merged catalogue's key (lib/catalogItems). A
   *  ServiceProfile carries EXACTLY ONE of these (the schema's CHECK), so the
   *  pair is the identity of whoever this row belongs to — the same user id a
   *  TutorProfile carries, which is what lets one human hold both halves of
   *  their offering and still be ONE card. */
  userId: string | null
  companyId: string | null
  /** The public address's last segment (/experts/<slug>). Null = no page yet;
   *  the card is then not a link. Filled lazily below for rows born before
   *  slugs existed. */
  slug: string | null
  name: string
  isCompany: boolean
  /** „თბილისი, ბათუმი" — empty when they picked no city. */
  areas: string
  /** „გამოძახება 30₾ · სამუშაო 50₾-დან", or null when they quote per job. */
  price: string | null
  about: string | null
  /** Trade labels, in the catalogue's order. The card caps the list, not this. */
  services: string[]
  /** ⚠️ THE RAW TOPIC IDS TOO, because since the merge (2026-08-19) the TRADE
   *  filter runs in the browser over the loaded roster (app/experts/_filters →
   *  passesFilters) rather than in the `where`. Labels cannot be filtered on:
   *  a rename would silently drop everybody. Ids are what a request carries and
   *  what `covers()` tests. Same for the cities. */
  serviceIds: string[]
  areaIds: string[]
  /** The one number a price SORT can use across both halves — `priceFrom`, else
   *  the callout fee, else null for „ask". The printed string stays `price`;
   *  see lib/catalogItems → CatalogItem.price for why null sorts last. */
  priceValue: number | null
  /** ISO creation time — the „ახლის მიხედვით" key, the same one the expert
   *  side carries. Without it half the merged list had no date and every
   *  master sank to the bottom of the default sort. */
  createdAt: string
  /** The photo ROUTE, never the image. Null = no photo and no avatar either. */
  photoSrc: string | null

  /* ── the professional half (2026-08-24) ─────────────────────────────────
     Every one of these is empty on a trades card and filled on a lawyer's, and
     nothing is invented to fill a gap: no rating is printed while `rating` is
     0, which it is for every row until somebody rates a finished job. */

  /** „12 წელია სამართალში ვმუშაობ" — the one line under the name, or null. */
  headline: string | null
  /** Job labels from lib/professions. The card's chips are `services`; these
   *  are what the profile prints and what routing matches. */
  professions: string[]
  /** Checked by an admin — „გადამოწმებული" on the card. */
  verified: boolean
  /**
   * Picked out by an admin — the owner's one editorial lever over the roster.
   *
   * ⚠️ IT WAS A COLUMN, AN INDEX AND A BUTTON THAT DID NOTHING until 2026-08-25.
   * „ჩვენი რჩევით" kept the server's order and read neither this nor anything
   * else, so an admin could tick somebody and watch the catalogue not move.
   * It is not on the card — being recommended is an ORDER, not a badge, and a
   * second badge beside „გადამოწმებული" would sell a placement as a credential.
   */
  featured: boolean
  /** Human labels, already resolved from the stored codes. */
  langs: string[]
  rating: number
  /** The sphere slug — what `?category=` filters on. */
  catSlug: string | null
}

export type ProvidersResult = {
  rows: ProviderRow[]
  /**
   * How many masters are public with NO filter — counted ONLY when the filtered
   * list came back empty, because that is the one moment the difference matters.
   *
   * ⚠️ „NOBODY YET" AND „NOBODY LIKE THAT" ARE DIFFERENT ANSWERS and they need
   * different screens: the first is a stage the site is in and the only useful
   * action is the intake; the second is a dead end the visitor built themselves
   * and the only useful action is undoing it. Offering „clear the filters" to
   * somebody on an empty site sends them to a second empty page.
   */
  totalPublic: number | null
}

export async function queryProviders(f: ProvidersFilter): Promise<ProvidersResult> {
  const topics = topicsOf(f)

  // The same test lib/serviceProfile → `covers` runs in TypeScript, expressed
  // as SQL: the master lists this trade AND travels to this city. `hasSome`
  // rather than `has` because a GROUP is several topics and a master listed for
  // any one of them does that group's work.
  const rows = await prisma.serviceProfile.findMany({
    where: {
      ...PUBLIC,
      ...(topics ? { services: { hasSome: topics } } : {}),
      // ⚠️ A UNION HERE TOO, and `isEmpty` is part of it: a master who named no
      // city travels everywhere (the routing reads it that way), so filtering
      // by city must not hide them. `hasSome` on an empty selection would match
      // nothing, so the clause is omitted entirely when nothing is ticked.
      ...(f.cities.length > 0
        ? { OR: [{ areas: { hasSome: f.cities } }, { areas: { isEmpty: true } }] }
        : {}),
      ...(f.cats && f.cats.length > 0 ? { category: { slug: { in: f.cats } } } : {}),
    },
    // Oldest first — the SAME order as the deleted /services mini-list, deliberately. A
    // master who is third there and eleventh here would be two different facts
    // about one roster.
    orderBy: { createdAt: 'asc' },
    take: f.limit ?? MAX_ROWS,
    select: {
      // `priceList` is a small JSON map (`{ topicId: lari }`), not a blob —
      // safe in a list query, unlike the photo columns beside it.
      id: true, slug: true, services: true, areas: true, calloutFee: true, priceFrom: true, priceList: true,
      about: true, updatedAt: true, createdAt: true, userId: true, companyId: true,
      // The professional half, absorbed 2026-08-24. Cheap scalars — none of
      // them is a blob, and `photoUrl`/`workPhotos` are still never selected.
      headline: true, professions: true, verified: true, featured: true, languages: true, rating: true,
      category: { select: { slug: true, name: true } },
      // No `avatarUrl` — the face is asked for by SHAPE below, never read.
      user: { select: { fullName: true } },
      company: { select: { name: true } },
    },
  })

  // Returned BEFORE the photo probe, so an empty page costs one extra count and
  // not a second `id IN ()` that could only ever learn nothing.
  if (rows.length === 0) {
    return { rows: [], totalPublic: await prisma.serviceProfile.count({ where: PUBLIC }) }
  }

  // Which of them have a face, without reading any of the faces. Prisma cannot
  // select `("photoUrl" IS NOT NULL)` as a column, so the question is asked as a
  // filter over the ids we already hold — the payload is a list of cuids rather
  // than a list of images.
  //
  // ⚠️ „NOT NULL" IS NOT THE SAME QUESTION AS „WILL THE ROUTE SERVE IT"
  // (2026-08-18, seen in a screenshot as a row of empty circles). The photo
  // endpoint refuses SVG — an SVG is a document and can carry <script>, and it
  // would run from our own origin. So a row whose column holds an SVG passes
  // „NOT NULL", the card renders an <img> at a URL that 404s, and the reader
  // gets a broken image where the placeholder should be.
  //
  // The two tests have to agree, so this one asks the same thing the route
  // asks: is there a photo the route will actually hand back. Anything else is
  // treated exactly as „no photo", which is a state the card already draws
  // properly.
  const withPhoto = new Set(
    (await prisma.serviceProfile.findMany({
      where: {
        id: { in: rows.map(r => r.id) },
        NOT: { photoUrl: null },
        // The same refusal /api/masters/[id]/photo applies, expressed as SQL.
        photoUrl: { not: { startsWith: 'data:image/svg' } },
      },
      select: { id: true },
    })).map(r => r.id),
  )

  // ⚠️ AND THE ACCOUNT AVATAR IS A BLOB TOO (2026-08-24). It is the FALLBACK
  // portrait for the 27 migrated professionals, none of whom ever uploaded a
  // `photoUrl` — their face has always come from their account. It arrived here
  // as `user: { select: { avatarUrl: true } }`, which is ~32KB of base64 per
  // card and, on a full page of them, ~860KB the browser can never reuse: the
  // exact defect /api/avatars exists to prevent, and invisible, because every
  // face renders perfectly. Asked by SHAPE instead — see lib/avatarSrc.
  const avatarShape = new Map<string, { plain: string | null; hasBlob: boolean; v: string | null }>()
  {
    const ids = rows.map(r => r.userId).filter((v): v is string => v !== null)
    if (ids.length > 0) {
      const shapes = await prisma.$queryRawUnsafe<{
        id: string; avatarPlain: string | null; avatarHasBlob: boolean | null; avatarV: string | null
      }[]>(
        `SELECT u."id", ${AVATAR_SHAPE_SQL('u')} FROM "User" u WHERE u."id" = ANY($1::text[])`,
        ids,
      )
      for (const s of shapes) {
        avatarShape.set(s.id, { plain: s.avatarPlain, hasBlob: s.avatarHasBlob === true, v: s.avatarV })
      }
    }
  }

  // ⚠️ THE BACKFILL, AND IT IS LAZY ON PURPOSE (2026-08-19). Slugs arrived
  // with stage 5; every profile approved before that day — the demo masters in
  // production included — has none, and a card without a slug is a card with no
  // link. Approval assigns one from now on; the rows already here get theirs the
  // first time a page reads them. Guarded, bounded, and cheap: one UPDATE per
  // slugless row, at most twenty per read, and never again once it has landed
  // (`ensureMasterSlug` is idempotent and never overwrites).
  const slugless = rows.filter(r => !r.slug)
  const filled = new Map<string, string>()
  if (slugless.length > 0 && slugless.length <= 20) {
    for (const r of slugless) {
      try {
        const slug = await ensureMasterSlug(r.id)
        if (slug) filled.set(r.id, slug)
      } catch { /* the id URL keeps working; the card simply is not a link yet */ }
    }
  }

  return {
    totalPublic: null,
    rows: rows.map(r => ({
      id: r.id,
      userId: r.userId,
      companyId: r.companyId,
      slug: r.slug ?? filled.get(r.id) ?? null,
      name: r.company?.name ?? r.user?.fullName ?? '—',
      isCompany: r.company !== null,
      areas: areaLabels(r.areas).join(', '),
      areaIds: r.areas,
      price: priceHint(r),
      // ⚠️ THE LOWEST PRICED SERVICE WINS (2026-08-20). The card prints
      // „X₾-დან", and the truest floor is the cheapest thing the provider
      // actually sells — „ბინის დალაგება — 60₾" — not the blanket `priceFrom`
      // they may have typed before the list existed. The two older numbers stay
      // as the fallback, in the order they always had.
      priceValue: lowestPrice(r) ?? r.priceFrom ?? r.calloutFee ?? null,
      createdAt: r.createdAt.toISOString(),
      about: r.about,
      headline: r.headline,
      professions: r.professions,
      verified: r.verified,
      featured: r.featured,
      langs: r.languages.map(toLangLabel),
      rating: r.rating,
      catSlug: r.category?.slug ?? null,
      services: serviceLabels(r.services),
      serviceIds: r.services,
      // ⚠️ THE PROFILE PHOTO FIRST, THE ACCOUNT AVATAR SECOND (2026-08-24). A
      // migrated professional never uploaded a `photoUrl` — the consultation
      // profile showed their account photo — so without this fallback 27 cards
      // would have lost their face on the day of the move. BOTH are routes: see
      // the avatar-shape probe above for why the second one cannot be the
      // stored column.
      photoSrc: withPhoto.has(r.id)
        ? `/api/masters/${r.id}/photo?v=${r.updatedAt.getTime()}`
        : avatarRouteSrc(r.userId, r.userId ? avatarShape.get(r.userId) : null),
    })),
  }
}

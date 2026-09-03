// The master's own answer to „what do you do, and where".
//
//   GET  → this account's ServiceProfile, plus the vocabulary to draw the form
//   PUT  → save it
//
// ⚠️ THE ROW IS KEYED ON THE SESSION, NEVER ON A BODY FIELD. There is no
// `userId` in the input and there must never be one: the only account this route
// can read or write is the one holding the cookie. That is the same rule the
// offer endpoint follows — a provider identity is derived, never declared.
//
// ⚠️ ALLOWLIST FIRST, and it is not the same question as „are you signed in".
// A ServiceProfile on an account that may not bid is a row that can never be
// routed to, so writing one would be storing a promise the platform cannot keep.
// `requestsViewer().provider` is the only thing that answers it.
//
// 404 and never 403, like every route in this subsystem — see
// lib/requestsServer → requestsNotFound for why.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { requestsViewer } from '@/lib/requestsServer'
import { CITIES } from '@/lib/requests'
import { groupIsService, sphereOfServices } from '@/lib/requestTopics'
import {
  ServiceProfileInput, LIVE_OFFER_GROUPS, sanitizeStored, profileGaps,
  KEPT_PHOTO, MAX_WORK_PHOTOS,
} from '@/lib/serviceProfile'
import { validationIssueMessage } from '@/lib/validationMessages'
import { ASSIGNABLE_CATEGORY_WHERE } from '@/lib/categoryTree'
import { ALL_PROFESSIONS, MAX_PROFESSIONS } from '@/lib/professions'
import { grantEarnedTasks, profileCompletion } from '@/lib/creditsServer'
import { gelLabel } from '@/lib/credits'
import { avatarSrc } from '@/lib/avatarSrc'

const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

/** The picker's own contents, sent with the profile so the form and the schema
 *  cannot disagree about what is selectable. A hard-coded list in the component
 *  is how a service gets added to the vocabulary and stays invisible.
 *
 *  ⚠️ THE LIVE GROUPS, while the schema still accepts every one — deliberately,
 *  and lib/serviceProfile → LIVE_OFFER_GROUPS says why. The asymmetry means a
 *  profile hand-seeded into a closed group keeps saving from this endpoint; it
 *  just does not appear as a fresh choice.
 *
 *  ⚠️ `alt` AND `vertical` RIDE ALONG SINCE 2026-08-29, and both exist for the
 *  search box the editor grew that day (app/work/services/_trades.tsx).
 *
 *  · `alt` IS MOST OF WHAT THE SEARCH IS WORTH. The topics carry the words
 *    people actually type — „სანტექნიკოსი" for the plumbing rows,
 *    „დამლაგებელი" for „ბინის დალაგება" (lib/requestTopics → Topic.alt).
 *    Measured on 2026-08-29: 45 of the 148 live topics carry 115 such words.
 *    A search over the printed label alone fails the exact person it is for.
 *    The intake has searched `alt` since it was built (app/join/_provider);
 *    sending it here is what let the EDITOR do the same.
 *
 *  · `vertical` IS THE ORDER, NOT A FILTER. 20 professional groups are listed
 *    before 8 household ones and nothing said so, which is the split the owner
 *    approved on the demand side on 2026-08-18 („«სასკოლო საგნები» three rows
 *    above «სანტექნიკა»…") going unapplied on the supply side. `groupIsService`
 *    is the same function `verticalOfTopic` reads, so the two sides cannot
 *    drift. */
const vocabulary = () => ({
  groups: LIVE_OFFER_GROUPS.map(g => ({
    id: g.id,
    label: g.label,
    vertical: groupIsService(g) ? 'SERVICE' : 'EXPERT',
    topics: g.topics.map(t => ({ id: t.id, label: t.label, alt: t.alt ?? [] })),
  })),
  cities: CITIES.map(c => ({ id: c.id, label: c.label })),
})

export async function GET() {
  const viewer = await requestsViewer()
  if (!viewer.provider || !viewer.user) return notFound()

  await ensureDbReady()
  // ⚠️ `about` IS SENT AND `photoUrl` IS NOT, AND IT IS NOT COUNTED EITHER ANY
  // MORE (2026-08-18, narrowed 2026-08-29). The photo is a base64 column of up
  // to a few hundred kilobytes and this response is fetched every time either
  // form opens, so returning it would ship the image twice — once here and once
  // through /api/providers/[id]/photo, which is what actually draws it. Until
  // 2026-08-29 a COUNT stood in for it so the face uploader could say „ფოტო
  // ატვირთულია"; that uploader is gone (one portrait control, the ავატარი
  // block) and nothing read the boolean, so the query went with it.
  //
  // The rule survives its instance: NO BLOB IN A FORM PAYLOAD. Same split
  // /api/provider-applications already uses.
  const row = await prisma.serviceProfile.findUnique({
    where: { userId: viewer.user.id },
    select: {
      id: true, services: true, areas: true, calloutFee: true, priceFrom: true,
      available: true, about: true, updatedAt: true,
      // ⚠️ `headline` WAS READ-ONLY HERE AND IS NOW EDITED HERE (2026-08-30).
      // It arrived on 2026-08-29 so the services editor could draw the card a
      // client sees — the sentence under the name is part of it — while
      // /work/profile owned the field itself. There is one editor now, so the
      // whole professional half is selected below and every one of these is
      // writable through the PUT.
      headline: true,
      // ⚠️ THE PROFESSIONAL HALF (2026-08-30). These are the columns
      // `/api/me/provider` selected while it was the other writer of this row.
      // `category` is INCLUDED rather than just its id, and the reason is the
      // one that endpoint recorded: a provider can legitimately hold a sphere
      // the picker no longer offers („ფინანსები" was absorbed into „ბიზნესი და
      // ფინანსები"), and without the name their category renders as an EMPTY
      // dropdown — which reads as „my category was deleted" while the „აირჩიე
      // კატეგორია" warning stays silent, because the field is not empty.
      categoryId: true,
      category: { select: { id: true, slug: true, name: true, status: true } },
      professions: true, yearsExp: true, languages: true,
      linkedinUrl: true, websiteUrl: true,
      // Have they ever said „yes, this is what I sell"? Null means never — the
      // 27 migrated providers were seeded with their whole sphere, so „has a
      // list" cannot answer it. The editor draws ConfirmServicesNote off this.
      servicesConfirmedAt: true,
      // ⚠️ `priceList` IS SELECTED AND `workPhotos` IS NOT, and the difference
      // is size, not importance: the map is a handful of integers keyed by
      // topic id, the photos are up to six base64 images — the same reason
      // `photoUrl` is not here at all. The form is sent HOW MANY it holds and
      // draws each one through /api/providers/[id]/photo?n=.
      priceList: true,
    },
  })
  // ⚠️ `hasPhoto` WAS COMPUTED HERE AND READ BY NOBODY (removed 2026-08-29).
  // It was a COUNT on every open of this endpoint — both forms fetch it on
  // mount — and its whole job was to let the face uploader say „ფოტო
  // ატვირთულია" without shipping the base64 back. That uploader is gone: there
  // is one portrait control on the site now and it is the ავატარი block, which
  // writes `User.avatarUrl` through /api/uploads. `_trades.tsx` was still
  // storing the boolean in state and never drawing it.
  //
  // The SELECT above still refuses `photoUrl`, which is the rule this was an
  // instance of, not a casualty of it.
  // The LENGTH of the array, computed in SQL — `select: { workPhotos: true }`
  // would pull the megabyte this route exists not to pull. Same shape
  // /api/provider-applications uses to count the applicant's own.
  const workPhotoCount = row
    ? (await prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT COALESCE(array_length("workPhotos", 1), 0)::int AS n FROM "ServiceProfile" WHERE "id" = $1`,
        row.id,
      ))[0]?.n ?? 0
    : 0

  // No row yet is a normal first visit, not an error: the form opens empty and
  // the first PUT creates it. Answering 404 here would make „I have not filled
  // this in" indistinguishable from „you may not have this".
  const stored = row ?? {
    id: null, services: [], areas: [], calloutFee: null, priceFrom: null,
    available: true, about: null, updatedAt: null, priceList: null, headline: null,
    categoryId: null, category: null, professions: [], yearsExp: 0, servicesConfirmedAt: null,
    languages: ['ka'], linkedinUrl: null, websiteUrl: null,
  }
  // The vocabulary moves; a row written last month may name a retired trade.
  const clean = sanitizeStored(stored)

  return NextResponse.json({
    ok: true,
    profile: { ...stored, ...clean },
    // ⚠️ THE NAME AND THE FACE RIDE ALONG (2026-08-30). They are `User` columns,
    // not this row's, and the editor draws them at the top of the same card —
    // the name IS the largest text a client reads. Two scalars beside a payload
    // this size, and it saves the merged form a second GET whose only job would
    // be to fill in one field.
    //
    // ⚠️ AND THE FACE GOES THROUGH `avatarSrc`, NEVER RAW. `User.avatarUrl` holds
    // a `data:` URI — files live in Postgres, not a bucket — so passing it
    // through would put tens of kilobytes of base64 in a payload the editor
    // fetches on every open, uncacheably. This hands back a URL to
    // /api/avatars/[id], which the browser caches once. It is the rule
    // tests/apiPayloadHygiene enforces, and it is invisible when broken: the
    // page looks identical and is simply half a megabyte heavier.
    user: { fullName: viewer.user.fullName, avatarUrl: avatarSrc(viewer.user.id, viewer.user.avatarUrl) },
    workPhotoCount,
    // „What is still missing", computed HERE rather than in the component, so
    // the page and the routing agree on what „ready" means.
    gaps: profileGaps(clean),
    // ⚠️ HOW FULL THE PROFILE IS, AND WHAT FINISHING IT PAYS — the two numbers
    // the status band states (app/work/profile/_editor). `profileCompletion`,
    // NOT `grantEarnedTasks`: the second one WRITES, and a GET that pays money
    // is a double-render away from paying twice. See lib/creditsServer.
    ...(await profileCompletion(viewer.user.id)),
    exists: row !== null,
    ...vocabulary(),
  })
}

export async function PUT(req: Request) {
  const viewer = await requestsViewer()
  if (!viewer.provider || !viewer.user) return notFound()

  const parsed = ServiceProfileInput.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      error: 'INVALID',
      field: typeof parsed.error.issues[0]?.path[0] === 'string' ? parsed.error.issues[0].path[0] : null,
      // The first message only. These are the provider's own form errors and
      // they are written to be read (lib/serviceProfile) — but a list of five is
      // a wall, and the form highlights the field anyway.
      detail: validationIssueMessage(parsed.error.issues[0]),
    }, { status: 400 })
  }

  await ensureDbReady()
  const d = parsed.data

  // ⚠️ ABSENT MEANS LEAVE IT ALONE — FOR EVERY FIELD, NOT ONLY THE MEDIA ONES
  // (2026-08-18, widened 2026-08-29). Spreading `d` directly would write
  // `undefined`… which Prisma ignores, but `null` it would not, and a client
  // that sends `photoUrl: null` because it never rendered the field would erase
  // a face the master uploaded on application day.
  //
  // The five CORE fields were required until 2026-08-29, which forced a form
  // that edits none of them to send all five — see the note over
  // `ServiceProfileInput` for the switch that flipped itself back on because of
  // it. Now each form sends only what it draws, and „replaced whole" still
  // holds for whatever DOES arrive: unticking every service sends
  // `services: []`, present and empty.
  const {
    photoUrl, about, workPhotos, priceList,
    // The professional half, absorbed 2026-08-30 — pulled out of `sent` because
    // three of them need work before they can be written and one of them is not
    // even on this table.
    fullName, categoryId, professions, linkedinUrl, websiteUrl,
    ...sent
  } = d

  // ⚠️ ONE CITY ANSWERS ITSELF, AND ONLY WHEN THE CITY WAS ASKED ABOUT
  // (2026-08-29). `CITIES` holds Tbilisi and nothing else, and the form stopped
  // drawing a card whose whole list is one chip — the rule the intake already
  // applied on 2026-08-20 („a block whose list holds a single chip is the form
  // performing a choice nobody has"). So the answer arrives here rather than
  // from a hidden field.
  //
  // `areas !== undefined` is the guard that keeps this from becoming the very
  // bug above: a save from the work-photos form names no city because it has no
  // city field, and filling one in on its behalf would be this endpoint writing
  // a column nobody on that screen touched.
  //
  // It is deliberately NOT `?? CITIES` unconditionally — the day a second city
  // opens, an empty list becomes a real answer („nowhere yet") again and this
  // whole branch stops firing on its own.
  const core = sent.areas !== undefined && sent.areas.length === 0 && CITIES.length === 1
    ? { ...sent, areas: [CITIES[0].id] }
    : sent

  // ⚠️ SAVING IS THE CONFIRMATION, and it is deliberately not a separate button.
  // The 27 migrated providers were seeded with their whole sphere and the
  // workspace asks them to check it (see prisma/schema → servicesConfirmedAt);
  // the moment they press save on THE SERVICES FORM they HAVE checked it,
  // whether they changed anything or not. A second „yes I confirm" control
  // would be a thing to click that means nothing beyond the click.
  //
  // ⚠️ AND IT IS STAMPED ONLY WHEN THE LIST WAS ACTUALLY SENT (2026-08-29). It
  // used to be stamped on every update, so saving a work photo on /work/profile
  // — a form with no service list on it — retired „გადახედე სერვისების სიას —
  // ჩვენ შევავსეთ" from the provider's home screen without them ever having
  // seen the list. The one thing this column is for is knowing whether somebody
  // LOOKED, and a save from a screen that does not show it is not looking.
  const confirmed = sent.services !== undefined ? { servicesConfirmedAt: new Date() } : {}

  // ⚠️ `kept:<n>` IS RESOLVED HERE AND NOWHERE ELSE. The form never receives a
  // stored photo (they are base64 columns; see the GET), so it cannot send one
  // back — it sends the token for the ones it is keeping, in the order it wants
  // them, and fresh data URIs for the rest. Resolving it means one read of the
  // column, and ONLY when the field was actually sent: a client that never drew
  // the uploader leaves the photos alone entirely.
  //
  // A token pointing past the end of the stored array is dropped rather than
  // refused — it means the row changed under a stale form, and losing one
  // thumbnail is a better answer than refusing a save that also carries the
  // prices somebody just typed.
  let photos: string[] | undefined
  if (workPhotos !== undefined) {
    const held = (await prisma.$queryRawUnsafe<{ p: string[] }[]>(
      `SELECT "workPhotos" AS p FROM "ServiceProfile" WHERE "userId" = $1`,
      viewer.user.id,
    ))[0]?.p ?? []
    photos = workPhotos
      .map(v => {
        const m = KEPT_PHOTO.exec(v)
        return m ? held[Number(m[1])] ?? null : v
      })
      .filter((v): v is string => typeof v === 'string' && v.startsWith('data:image/'))
      .slice(0, MAX_WORK_PHOTOS)
  }

  /* ═════════ the professional half (2026-08-30) ═══════════════════════════
     ⚠️ EVERY RULE BELOW CAME OVER FROM `/api/me/provider` UNCHANGED. This is
     the same row it was writing; what moved is which endpoint the ONE editor
     talks to. Where that file explained a decision, the explanation moved too —
     losing it is how the rule gets „simplified" back into the bug it prevents. */

  // ⚠️ THE CATEGORY IS CHECKED AGAINST WHAT THE PICKER ACTUALLY OFFERS, and
  // this used to say `status: 'VISIBLE'`, which is not the same set. The editor
  // draws the sub-fields absorbed into each sphere inside an <optgroup>, and
  // every one of those is REDIRECTED — so 7 of 15 categories on screen were
  // guaranteed 400s. And `categoryId` rides the same save as everything else,
  // so choosing one did not merely fail: it took the whole form down.
  //
  // ⚠️ THE ONE THEY ALREADY HOLD ALWAYS PASSES, and that exception is
  // load-bearing: the form sends `categoryId` on every save, and somebody whose
  // sphere was later hidden by an admin must not lose the ability to edit their
  // own page over an action they had no part in.
  let category: { categoryId: string | null } | Record<string, never> = {}
  if (categoryId !== undefined) {
    if (categoryId === null) {
      category = { categoryId: null }
    } else {
      const current = await prisma.serviceProfile.findUnique({
        where: { userId: viewer.user.id },
        select: { categoryId: true },
      })
      const cat = categoryId === current?.categoryId
        ? { id: categoryId }
        : await prisma.category.findFirst({
          where: { ...ASSIGNABLE_CATEGORY_WHERE, id: categoryId },
          select: { id: true },
        })
      // Say WHICH field refused. Without this the only signal was the generic
      // sentence, which names nothing and is therefore unfixable from inside
      // the screen.
      if (!cat) {
        return NextResponse.json({
          ok: false, error: 'BAD_CATEGORY',
          detail: 'ეს კატეგორია აღარ არის ხელმისაწვდომი — აირჩიე სხვა.',
        }, { status: 400 })
      }
      category = { categoryId: cat.id }
    }
  }

  /* ⚠️ THE SPHERE ANSWERS ITSELF WHEN NOBODY ANSWERED IT (2026-09-02).
   *
   * The editor stopped asking „რომელ პროფესიად გეძებენ" on this date — see
   * app/work/profile/_secIdentity — so `categoryId` no longer arrives on a save
   * from that screen, and a provider who never had one would never get one.
   * `categorySlug` on the topics they DID tick already says which sphere their
   * work belongs to (lib/requestTopics → sphereOfServices, and its note carries
   * the measurement: 23 of 27 derivations matched the stored sphere exactly and
   * the two that differed were better than what was stored).
   *
   * ⚠️ IT ONLY EVER FILLS A HOLE. Three guards, and each one matters:
   *   · `categoryId === undefined` — a caller that DID send a sphere keeps it,
   *     including `null`, which is somebody deliberately clearing it;
   *   · the stored value must be null — nobody's existing filing is rewritten
   *     underneath them by a save about their bio;
   *   · the derived slug must resolve to an ASSIGNABLE category, the same set
   *     the block above checks, so this cannot write a sphere the picker would
   *     have refused.
   * A services list that implies no sphere (the trades — a SERVICE topic
   * carries no `categorySlug` by design) simply leaves it null, which is what
   * `queueScope` already handles: those providers route on their services. */
  if (categoryId === undefined && sent.services !== undefined) {
    const slug = sphereOfServices(sent.services as string[] | undefined)
    if (slug) {
      const current = await prisma.serviceProfile.findUnique({
        where: { userId: viewer.user.id },
        select: { categoryId: true },
      })
      if (!current?.categoryId) {
        const cat = await prisma.category.findFirst({
          where: { ...ASSIGNABLE_CATEGORY_WHERE, slug },
          select: { id: true },
        })
        if (cat) category = { categoryId: cat.id }
      }
    }
  }

  // ⚠️ UNKNOWN ENTRIES ARE DROPPED, NOT REFUSED — the opposite of the rule on
  // `services` one file over, and deliberately so. The vocabulary can be edited
  // between this page loading and the save, and refusing the whole write would
  // lose the bio, the prices and the photos somebody just typed alongside it.
  // A service id, by contrast, decides who is ROUTED work: saving eleven of
  // twelve ticks would leave a provider believing they are listed for something
  // they are not.
  const trade = professions === undefined ? {} : {
    professions: [...new Set(
      professions.map(p => p.trim()).filter(p => ALL_PROFESSIONS.some(x => x.job === p)),
    )].slice(0, MAX_PROFESSIONS),
  }

  // Empty string means „clear it", which is why these are not just spread.
  const links = {
    ...(linkedinUrl !== undefined ? { linkedinUrl: (linkedinUrl ?? '').trim() || null } : {}),
    ...(websiteUrl !== undefined ? { websiteUrl: (websiteUrl ?? '').trim() || null } : {}),
  }

  const media = {
    ...(photoUrl !== undefined ? { photoUrl } : {}),
    ...(about !== undefined ? { about } : {}),
    ...(photos !== undefined ? { workPhotos: photos } : {}),
    // The map is REPLACED WHOLE, like `services` — the form sends every price
    // it is showing, and merging would make clearing one impossible. The schema
    // has already refused any key that is not a ticked service.
    ...(priceList !== undefined ? { priceList } : {}),
  }

  /* ⚠️ ONE TRANSACTION, BECAUSE THERE IS ONE SAVE BUTTON (2026-08-30).
     `fullName` lives on `User` and everything else on `ServiceProfile`, and the
     editor writes both from a single press. Two awaits in sequence would leave a
     window where the name saved and the page did not — and a form that reports
     „შენახულია ✓" over a half-written profile is the failure this merge exists
     to remove, not a smaller version of it. */
  const [, saved] = await prisma.$transaction([
    prisma.user.update({
      where: { id: viewer.user.id },
      // No name sent (the account page, or an older client) means leave it: the
      // same „absent means leave it alone" rule every field on this route obeys.
      data: fullName !== undefined ? { fullName } : {},
      select: { id: true },
    }),
    prisma.serviceProfile.upsert({
      where: { userId: viewer.user.id },
      create: { userId: viewer.user.id, ...core, ...media, ...category, ...trade, ...links },
      update: { ...core, ...media, ...category, ...trade, ...links, ...confirmed },
      select: {
        services: true, areas: true, calloutFee: true, priceFrom: true,
        available: true, about: true, updatedAt: true, priceList: true,
        headline: true, categoryId: true, professions: true, yearsExp: true,
        languages: true, linkedinUrl: true, websiteUrl: true,
        category: { select: { id: true, slug: true, name: true, status: true } },
      },
    }),
  ])

  /* ⚠️ THE BONUS IS PAID HERE, NOT ON THE NEXT NAVIGATION (2026-08-21).
   *
   * `grantEarnedTasks` runs in the workspace shell, so anything earned in this
   * form was paid the next time the provider opened a workspace screen — which
   * is to say, silently and possibly much later. The tasks this endpoint writes
   * are the two the SERVICE half is paid for („დაუწერე ფასი ერთ სერვისს მაინც",
   * „ატვირთე ნამუშევრის ფოტო"), and a grant that arrives without being
   * connected to the act that earned it is not a bonus, it is a number that
   * changed. Idempotent by the ledger's unique index, so running it here as
   * well as in the shell cannot pay twice.
   *
   * Best effort: the profile IS saved: failing the response because the ledger
   * write did would tell the provider their work was lost when it was not.
   */
  let earned: { key: string; label: string }[] = []
  try {
    earned = (await grantEarnedTasks(viewer.user.id)).granted
      .map(g => ({ key: g.key, label: gelLabel(g.tetri) }))
  } catch { /* the save stands */ }

  // The count AFTER the write, not the one the form sent: a `kept:` token
  // pointing at a photo that is no longer there is dropped above, and a form
  // that went on believing in it would send the same stale token next time.
  return NextResponse.json({
    ok: true, profile: saved, gaps: profileGaps(saved), earned,
    // Echoed back for the same reason the profile is: the form re-seeds its
    // „saved" snapshot from what the server stored, never from what it sent.
    ...(fullName !== undefined ? { user: { fullName } } : {}),
    ...(photos !== undefined ? { workPhotoCount: photos.length } : {}),
  })
}

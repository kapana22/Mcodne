// /me/favorites — „შენახული", the client's shortlist.
//
// ⚠️ REBUILT 2026-08-31 FROM THE OWNER'S DESIGN CANVAS („Client Space" → the
// second screen). The card was a 96px round thumb beside a name, a category
// chip, a ★ rating, a headline and a price, with the action „დატოვე მოთხოვნა"
// pointing at `/experts/<id>?rebook=1`. The canvas's card is four things: who
// they are, how fast they answer, what they start at, and one green button.
//
// ⚠️ AND `?rebook=1` WAS DEAD. Its own comment said it „auto-opens the booking
// modal on the profile" — there has been no booking modal since 2026-08-24, so
// the shortlist's only action dropped the client on a profile with a parameter
// nothing reads. It is `requestHrefFor` now: the same addressed intake the
// provider's own page uses (`?to=<slug>`, `offerLimit: 1`, an INVITED thread
// opened the moment the request is written), and the same words — „მიიღე
// შეთავაზება". One journey, one verb.
//
// ⚠️ THE CANVAS'S SUB-LINE IS NOT PRINTED AS WRITTEN. It reads „მოთხოვნის
// გაგზავნისას პირველ რიგში მათ მიუვათ" — saving somebody does NOT prioritise
// them in routing (lib/requestRouting matches on service + area and knows
// nothing about Favorite), so that sentence would be a promise the code does
// not keep. What IS true is what the button does, and it is the provider
// profile's own sentence: the request goes straight to them.
import type { Metadata } from 'next'
import { avatarSrc } from '@/lib/avatarSrc'

export const metadata: Metadata = { title: 'შენახული — მცოდნე' }

import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { EmptyState } from '@/components/EmptyState'
import { FavoritesClient } from './client'
import { Container } from '@/components/Container'
import { PageHeader } from '@/components/PageHeader'
import { lowestPrice } from '@/lib/serviceProfile'
import { requestsOn, PRICE_ON_REQUEST } from '@/lib/requests'
import { requestHrefFor } from '@/app/experts/[slug]/_providerData'
import { responseStatsFor, replyLabel, providerKey } from '@/lib/responseStats'

export const dynamic = 'force-dynamic'

export default async function ClientFavoritesPage() {
  const user = await requireUser()
  const on = requestsOn()
  const favs = await prisma.favorite.findMany({
    where: { userId: user.id },
    include: {
      provider: {
        // ⚠️ NEVER THE BLOBS. `photoUrl` and `workPhotos` are base64 columns;
        // the cards map ~8 small fields and point their <img> at the photo
        // route. Mirrors the API sibling (app/api/favorites/route.ts).
        omit: { photoUrl: true, workPhotos: true },
        include: {
          user: { select: { id: true, fullName: true, avatarUrl: true } },
          company: { select: { name: true } },
          category: { select: { id: true, slug: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    // Bound the SSR payload — a saved list this long is already past useful.
    take: 200,
  })

  const providers = favs.map(f => f.provider).filter((p): p is NonNullable<typeof p> => !!p)
  // ONE query for the whole shortlist — see lib/responseStats. A provider
  // nobody has written to is simply absent from the map, and `replyLabel`
  // returns null under the sample floor, so the chip is drawn or it is not.
  const stats = await responseStatsFor(providers)

  // A deleted profile leaves `provider: null` on the favourite — skip those
  // rows (a card with nobody behind it is a dead end).
  //
  // ⚠️ THE PRICE IS THE LOWEST PRICED SERVICE (2026-08-24), the same floor the
  // catalogue card prints. It used to resolve a „flagship" consultation tier —
  // there are no tiers — and before that it printed the raw profile-level
  // `price`, which is not a service anyone can buy: one live expert therefore
  // read ₾60 on this page and ₾30 on /experts (measured 2026-07-31).
  const items = favs.filter(f => f.provider).map(f => {
    const p = f.provider!
    const floor = lowestPrice({ services: p.services, priceList: p.priceList }) ?? p.priceFrom ?? null
    const key = providerKey(p)
    return {
      id: f.id,
      providerId: p.id,
      /** The public address — slug when they have one, id when they do not
       *  (app/experts/[slug] resolves by either). */
      href: `/experts/${p.slug || p.id}`,
      /** The addressed intake, or null on a deployment with no subsystem. */
      requestHref: on ? requestHrefFor({ slug: p.slug, id: p.id }) : null,
      name: p.company?.name ?? p.user?.fullName ?? 'ექსპერტი',
      /** A FIRM IS A ROUNDED SQUARE, A PERSON A CIRCLE — components/Avatar. */
      firm: !!p.company,
      /* ⚠️ THROUGH `avatarSrc`, NOT THE STORED VALUE (2026-09-02). The comment
         forty lines up says this query „mirrors the API sibling"; on avatars it
         did not. `app/api/favorites/route.ts` has swapped the base64 for
         `/api/avatars/<id>?v=` since it was written, and this page handed the
         raw `data:` URI straight into its RSC payload — measured on production:
         42 of 54 accounts carry one, 585 kB in total, up to 76 kB each, and it
         is uncacheable and re-sent whole on every render of the list.
         `avatarSrc` returns null when there is nothing stored, which is what
         the empty string meant here. */
      photo: avatarSrc(p.user?.id, p.user?.avatarUrl) ?? '',
      // The CATEGORY, and nothing invented when there is none. „თბილისი" is
      // deliberately not appended the way the canvas has it: `CITIES` holds one
      // city, so a field whose value cannot differ carries no information.
      specialty: p.category?.name ?? '',
      // 🔒 MEASURED OR ABSENT (lib/responseStats). The canvas fills this chip
      // with „პასუხობს 2 საათში"; below the three-lead sample floor there is no
      // median to print and the chip does not render.
      reply: key ? replyLabel(stats.get(key)) : null,
      rating: p.rating,
      reviews: p.reviewsCount,
      // 🔒 `price` stays numeric so the compare table can still find the
      // cheapest; `priceLabel` is what gets rendered, because „ask" must be
      // sayable and a number cannot say it.
      price: floor ?? 0,
      priceLabel: floor !== null ? `${floor}₾-დან` : PRICE_ON_REQUEST,
    }
  })

  return (
    <Container as="main" size="content" className="w-full flex-1 py-7 lg:py-8 pb-12">
      <PageHeader
        className="mb-5"
        title="შენახული"
        sub={items.length > 0 ? 'მოთხოვნა პირდაპირ მათ მიდის.' : undefined}
      />

      {items.length === 0 ? (
        <EmptyState
          illustration="favourites"
          title="შენახული ექსპერტები ჯერ არ გაქვს"
          description="შეინახე საინტერესო ექსპერტი, რომ მოგვიანებით მარტივად დაუბრუნდე."
          cta={{ label: 'ექსპერტების ნახვა', href: '/experts' }}
        />
      ) : (
        <FavoritesClient items={items} />
      )}
    </Container>
  )
}

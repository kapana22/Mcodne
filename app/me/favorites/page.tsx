import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Icon } from '@/components/Icon'
import { EmptyState } from '@/components/EmptyState'
import { FavoritesClient } from './client'
import { Container } from '@/components/Container'
import { PageHeader } from '@/components/PageHeader'
import { lowestPrice } from '@/lib/serviceProfile'

export const dynamic = 'force-dynamic'

export default async function StudentFavoritesPage() {
  const user = await requireUser()
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
    return {
      id: f.id,
      tutorId: p.id,
      name: p.company?.name ?? p.user?.fullName ?? 'ექსპერტი',
      photo: p.user?.avatarUrl ?? '',
      headline: p.headline ?? '',
      // The CATEGORY, and nothing invented when there is none.
      specialty: p.category?.name ?? '',
      rating: p.rating,
      reviews: p.reviewsCount,
      // 🔒 `price` stays numeric so the compare table can still find the
      // cheapest; `priceLabel` is what gets rendered, because „ask" must be
      // sayable and a number cannot say it.
      price: floor ?? 0,
      priceLabel: floor !== null ? `${floor}₾-დან` : 'ფასს შემოგთავაზებს',
      priceSuffix: '',
    }
  })

  return (
    <Container as="main" className="w-full py-8 lg:py-10 flex-1">
        <PageHeader
          className="mb-8"
          eyebrow="პირადი სია"
          title={<>შენახული ექსპერტები <span className="text-ink-400 font-normal">({items.length})</span></>}
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

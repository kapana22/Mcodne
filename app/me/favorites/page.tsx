import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Icon } from '@/components/Icon'
import { EmptyState } from '@/components/EmptyState'
import { FavoritesClient } from './client'
import { Container } from '@/components/Container'
import { PageHeader } from '@/components/PageHeader'
import { primaryPriceLabel, offerPriceLabel, TUTOR_DEFAULTS } from '@/components/booking/slots'

export const dynamic = 'force-dynamic'

export default async function StudentFavoritesPage() {
  const user = await requireUser()
  const favs = await prisma.favorite.findMany({
    where: { userId: user.id },
    include: {
      tutor: {
        // Drop the heavy blobs at the DB level — the cards below map ~8 small
        // fields and never render the intro video or professionData. Mirrors the
        // API sibling (app/api/favorites/route.ts).
        omit: { professionData: true, videoUrl: true },
        include: {
          user: { select: { id: true, fullName: true, avatarUrl: true } },
          category: { select: { id: true, slug: true, name: true } },
          // Tier shape only — needed to resolve the FLAGSHIP price, exactly as
          // /experts does. Must stay in step with the API sibling
          // (app/api/favorites/route.ts), which selects the same three columns.
          consultations: { select: { minutes: true, price: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    // Bound the SSR payload — a saved list this long is already past useful.
    take: 200,
  })

  // A deleted tutor leaves `tutor: null` on the favorite — skip those rows
  // (a card without a bookable expert is a dead end). Empty photo falls back
  // to the client's initials tile — never external stock-avatar URLs.
  const items = favs.filter(f => f.tutor?.user).map(f => {
    // FLAGSHIP price + its real length, from the shared helper. This used to be
    // the raw profile-level `f.tutor.price`, which is not a service anyone can
    // buy — one live expert therefore read ₾60 on this page and ₾30 on /experts
    // (measured 2026-07-31). `price` stays numeric so the compare table can
    // still find the cheapest; `priceLabel` is what gets rendered, because a
    // free flagship must read „უფასო" and a number cannot say that.
    const flagship = primaryPriceLabel(
      f.tutor.consultations ?? [],
      f.tutor.price,
      f.tutor.consultationDurationMin ?? TUTOR_DEFAULTS.durationMin,
    )
    return {
      id: f.id,
      tutorId: f.tutor.id,
      name: f.tutor.user.fullName,
      photo: f.tutor.user.avatarUrl ?? '',
      headline: f.tutor.headline,
      // The CATEGORY — `specialty` only when there is none. That field is a
      // frozen copy of the category name from approval day and nothing keeps it
      // in sync, so after the 2026-08-10 rename this list said „ბიზნესი" about
      // an expert whose card said „ბიზნესი და ფინანსები". The category is
      // already selected above; it costs nothing to be the same site twice.
      specialty: f.tutor.category?.name ?? f.tutor.specialty ?? '',
      rating: f.tutor.rating,
      reviews: f.tutor.reviewsCount,
      price: flagship.price,
      priceLabel: offerPriceLabel(flagship),
      priceSuffix: flagship.suffix,
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

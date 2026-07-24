import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Icon } from '@/components/Icon'
import { EmptyState } from '@/components/EmptyState'
import { FavoritesClient } from './client'
import { Container } from '@/components/Container'
import { PageHeader } from '@/components/PageHeader'

export const dynamic = 'force-dynamic'

export default async function StudentFavoritesPage() {
  const user = await requireUser()
  const favs = await prisma.favorite.findMany({
    where: { userId: user.id },
    include: {
      tutor: {
        include: {
          user: { select: { id: true, fullName: true, avatarUrl: true } },
          category: { select: { id: true, slug: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // A deleted tutor leaves `tutor: null` on the favorite — skip those rows
  // (a card without a bookable expert is a dead end). Empty photo falls back
  // to the client's initials tile — never external stock-avatar URLs.
  const items = favs.filter(f => f.tutor?.user).map(f => ({
    id: f.id,
    tutorId: f.tutor.id,
    name: f.tutor.user.fullName,
    photo: f.tutor.user.avatarUrl ?? '',
    headline: f.tutor.headline,
    specialty: f.tutor.specialty,
    rating: f.tutor.rating,
    reviews: f.tutor.reviewsCount,
    price: f.tutor.price,
  }))

  return (
    <Container as="main" className="w-full py-8 lg:py-10 flex-1">
        <PageHeader
          className="mb-8"
          eyebrow="პირადი სია"
          title={<>შენახული ექსპერტები <span className="text-ink-400 font-normal">({items.length})</span></>}
        />

        {items.length === 0 ? (
          <EmptyState
            icon={<Icon.heart className="w-6 h-6" />}
            title="ჯერ არაფერი გაქვს შენახული"
            description="დააჭირე გულის ღილაკს ექსპერტის ბარათზე — შენს პირად სიაში დაემატება."
            cta={{ label: 'დაათვალიერე ექსპერტები', href: '/tutors' }}
          />
        ) : (
          <FavoritesClient items={items} />
        )}
    </Container>
  )
}

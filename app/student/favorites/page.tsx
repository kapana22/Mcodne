import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Icon } from '@/components/Icon'
import { EmptyState } from '@/components/EmptyState'
import { FavoritesClient } from './client'
import { StudentAppBar } from '@/components/StudentAppBar'
import { WorkspaceFooter } from '@/components/WorkspaceFooter'

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

  const items = favs.map(f => ({
    id: f.id,
    tutorId: f.tutor.id,
    name: f.tutor.user.fullName,
    photo: f.tutor.user.avatarUrl ?? `https://i.pravatar.cc/320?u=${f.tutor.userId}`,
    headline: f.tutor.headline,
    specialty: f.tutor.specialty,
    rating: f.tutor.rating,
    reviews: f.tutor.reviewsCount,
    price: f.tutor.price,
  }))

  return (
    <div className="font-sans bg-ink-50/40 min-h-screen flex flex-col">
      <StudentAppBar user={{ name: user.fullName, avatar: user.avatarUrl }} />

      <main className="w-full max-w-[1120px] mx-auto px-6 sm:px-8 py-8 lg:py-10 flex-1">
        <div className="mb-8">
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2 motion-safe:animate-rise-in">შენახული</div>
          <h1 className="font-display text-3xl font-bold text-ink-900 tracking-tight motion-safe:animate-rise-in" style={{ animationDelay: '60ms' }}>
            შენახული ექსპერტები <span className="text-ink-400 font-normal">({items.length})</span>
          </h1>
        </div>

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
      </main>

      <WorkspaceFooter />
    </div>
  )
}

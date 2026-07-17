'use client'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/Icon'

type Item = {
  id: string
  tutorId: string
  name: string
  photo: string
  headline: string
  specialty: string
  rating: number
  reviews: number
  price: number
}

export function FavoritesClient({ items: initial }: { items: Item[] }) {
  const [items, setItems] = useState(initial)
  const [removing, setRemoving] = useState<string | null>(null)
  const router = useRouter()

  const remove = async (tutorId: string) => {
    setRemoving(tutorId)
    try {
      const res = await fetch('/api/favorites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorId }),
      })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.tutorId !== tutorId))
        // Re-run the parent server component's data-fetch so returning to the
        // list after this mutation shows fresh state, not the cached snapshot.
        router.refresh()
      }
    } finally { setRemoving(null) }
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 motion-safe:stagger">
      {items.map(t => (
        <div key={t.id} className="rounded-card border border-ink-200 bg-white overflow-hidden group hover-lift">
          <Link href={`/tutors/${t.tutorId}`} className="block relative aspect-[4/3] bg-gradient-to-br from-brand-50 to-ink-100">
            {t.photo ? (
              <Image
                src={t.photo}
                alt={t.name}
                fill
                sizes="(min-width:1280px) 240px, (min-width:640px) 320px, 100vw"
                className="object-cover group-hover:scale-[1.03] transition-transform duration-slow ease-out-quart"
              />
            ) : (
              // next/image throws on an empty src — fall back to an initials tile.
              <div className="absolute inset-0 flex items-center justify-center font-display text-[28px] font-bold text-brand-600/70">
                {(t.name?.[0] ?? '?').toUpperCase()}
              </div>
            )}
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); remove(t.tutorId) }}
              disabled={removing === t.tutorId}
              aria-label="წაშლა შენახულიდან"
              className="absolute top-2 right-2 w-8 h-8 rounded-full inline-flex items-center justify-center bg-white/90 backdrop-blur hover:bg-white text-danger-600 disabled:opacity-50 shadow-xs transition-all"
            >
              <Icon.heart className="w-4 h-4" style={{ fill: 'currentColor' }} />
            </button>
          </Link>
          <div className="p-3">
            <div className="min-w-0">
              <div className="font-display text-[13.5px] font-bold text-ink-900 leading-tight truncate">{t.name}</div>
              <div className="text-[11.5px] text-ink-500 mt-0.5 truncate">{t.specialty}</div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1 text-[11.5px] text-ink-700">
                <Icon.star className="w-3 h-3 text-warning-500" />
                <span className="font-semibold tabular-nums">{t.rating.toFixed(1)}</span>
                <span className="text-ink-400 tabular-nums">({t.reviews})</span>
              </div>
              <div className="text-[13px] font-semibold text-ink-900 tabular-nums">₾{t.price}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

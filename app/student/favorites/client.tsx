'use client'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/ToastProvider'

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
  // Side-by-side compare — moved here from the dashboard shortlist, where it
  // competed with the user's sessions. Real API data only (no stock photos).
  const [compare, setCompare] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const cheapest = items.length ? items.reduce((a, b) => (a.price < b.price ? a : b), items[0]) : null
  const topRated = items.length ? items.reduce((a, b) => (a.rating > b.rating ? a : b), items[0]) : null

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
      } else {
        // The list is only mutated on success (no optimistic removal), so a
        // failure just needs to be surfaced — previously it was silent.
        toast('ვერ მოიხერხდა წაშლა — სცადე თავიდან', 'error')
      }
    } catch {
      toast('ვერ მოიხერხდა წაშლა — სცადე თავიდან', 'error')
    } finally { setRemoving(null) }
  }

  return (
    <div>
      {items.length > 1 && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setCompare(c => !c)}
            aria-expanded={compare}
            className={`h-9 px-3.5 rounded-btn inline-flex items-center gap-1.5 font-display text-[12px] font-semibold tracking-wide transition-colors ${compare ? 'bg-ink-900 text-white' : 'bg-white border border-ink-200 hover:border-ink-300 text-ink-800'}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M8 3v18M16 3v18M3 8h5M16 16h5M3 16h5M16 8h5" /></svg>
            გვერდიგვერდ შედარება
          </button>
        </div>
      )}

      {compare && cheapest && topRated && (
        <div className="mb-5 rounded-card overflow-hidden border border-ink-200 bg-ink-900 text-white">
          <div className="px-5 py-4 flex items-baseline justify-between">
            <div className="font-display text-[13px] font-bold tracking-tight">გვერდიგვერდ — {items.length} ექსპერტი</div>
            <button type="button" onClick={() => setCompare(false)} className="text-[11px] text-white/60 hover:text-white inline-flex items-center gap-1">
              დახურვა <Icon.x className="w-3 h-3" />
            </button>
          </div>
          <div className="px-5 pb-5 overflow-x-auto">
            <table className="w-full text-[12px] min-w-[540px]">
              <thead>
                <tr className="text-left text-white/40 font-display uppercase tracking-[0.14em] text-[10px]">
                  <th className="font-medium py-2 pr-3 w-[120px]">პარამეტრი</th>
                  {items.map(t => (
                    <th key={t.id} className="font-medium py-2 px-2">
                      <Link href={`/tutors/${t.tutorId}`} className="inline-flex items-center gap-1.5 text-white normal-case tracking-normal hover:text-brand-300 transition-colors">
                        {t.photo ? (
                          <img src={t.photo} alt="" className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                          <span className="w-5 h-5 rounded-full bg-white/15 inline-flex items-center justify-center text-[10px] font-bold">{(t.name?.[0] ?? '?').toUpperCase()}</span>
                        )}
                        <span className="font-display text-[12px] font-bold">{t.name.split(' ')[0]}</span>
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-display tabular-nums">
                <tr className="border-t border-white/10">
                  <td className="py-2.5 pr-3 text-white/60">ფასი / სესია</td>
                  {items.map(t => <td key={t.id} className={`py-2.5 px-2 font-bold ${t.price === cheapest.price ? 'text-brand-300' : 'text-white'}`}>₾{t.price}</td>)}
                </tr>
                <tr className="border-t border-white/10">
                  <td className="py-2.5 pr-3 text-white/60">რეიტინგი</td>
                  {items.map(t => <td key={t.id} className={`py-2.5 px-2 font-bold ${t.rating === topRated.rating ? 'text-brand-300' : 'text-white'}`}>{t.rating.toFixed(2)} ★</td>)}
                </tr>
                <tr className="border-t border-white/10">
                  <td className="py-2.5 pr-3 text-white/60">შეფასებები</td>
                  {items.map(t => <td key={t.id} className="py-2.5 px-2 text-white">{t.reviews}</td>)}
                </tr>
                <tr className="border-t border-white/10">
                  <td className="py-2.5 pr-3 text-white/60">სფერო</td>
                  {items.map(t => <td key={t.id} className="py-2.5 px-2 text-white normal-case tracking-normal">{t.specialty}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

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
              <Icon.heartFilled className="w-4 h-4" />
            </button>
          </Link>
          <div className="p-4">
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
              {/* Flat expert-set price for the whole session — bare "₾X" had no
                  unit context (duration isn't in the favorites payload). */}
              <div className="text-[13px] font-semibold text-ink-900 tabular-nums">₾{t.price}<span className="text-[11px] font-medium text-ink-500"> / სესია</span></div>
            </div>
            {/* Booking path — ?rebook=1 auto-opens the booking modal on the
                profile (this is a signed-in area, so no auth detour). */}
            <Link
              href={`/tutors/${t.tutorId}?rebook=1`}
              className="mt-3 w-full h-11 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center justify-center gap-1.5 transition-colors shadow-xs"
            >
              დაჯავშნა
            </Link>
          </div>
        </div>
      ))}
      </div>
    </div>
  )
}

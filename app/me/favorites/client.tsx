'use client'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { useToast } from '@/components/ToastProvider'
import { displayHeadline } from '@/lib/headline'

type Item = {
  id: string
  tutorId: string
  name: string
  photo: string
  headline: string
  specialty: string
  rating: number
  reviews: number
  /** FLAGSHIP tier price as a NUMBER — used only to pick the cheapest in the
   *  compare table. Never rendered directly; see `priceLabel`. */
  price: number
  /** What actually gets printed („₾80" / „უფასო") — resolved server-side by the
   *  shared `primaryPriceLabel`, so this page can't disagree with /experts. */
  priceLabel: string
  /** The flagship tier's real length, so the price carries a unit. */
  /** „60 წთ" or „სერვისი" — a job has no clock. See slots → HeadlineOffer. */
  priceSuffix: string
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

  // ⚠️ THE BODY KEY IS `providerId`, AND SENDING `tutorId` WAS A 400
  // (2026-08-26). /api/favorites was renamed on 2026-08-24 and its own header
  // says „the browser sends the new name" — this, the only caller, did not, so
  // every „remove" answered INVALID: the card vanished optimistically and then
  // came back with the failure toast. The local names stay `tutorId` because
  // that is what the row's prop is called here; only the WIRE key matters.
  const remove = async (tutorId: string) => {
    setRemoving(tutorId)
    // Optimistic: the card disappears on tap — that IS the feedback. Keep the
    // pre-mutation list so a failed DELETE can restore it (with the toast
    // saying why it came back).
    const prevItems = items
    setItems(prev => prev.filter(i => i.tutorId !== tutorId))
    try {
      const res = await fetch('/api/favorites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: tutorId }),
      })
      if (!res.ok) throw new Error('http ' + res.status)
      // Re-run the parent server component's data-fetch so returning to the
      // list after this mutation shows fresh state, not the cached snapshot.
      router.refresh()
    } catch {
      setItems(prevItems)
      toast('წაშლა ვერ მოხერხდა', 'error')
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
            className={`h-9 px-3.5 rounded-btn inline-flex items-center gap-1.5 font-display text-meta font-semibold tracking-wide transition-colors duration-fast ${compare ? 'bg-ink-900 text-white' : 'bg-white border border-ink-200 hover:border-ink-300 text-ink-800'}`}
          >
            <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M8 3v18M16 3v18M3 8h5M16 16h5M3 16h5M16 8h5" /></svg>
            შედარება
          </button>
        </div>
      )}

      {compare && cheapest && topRated && (
        <div className="mb-5 rounded-card overflow-hidden border border-ink-200 bg-ink-900 text-white">
          <div className="px-5 py-4 flex items-baseline justify-between">
            <div className="font-display text-small font-bold tracking-tight">შედარება · {items.length} ექსპერტი</div>
            <button type="button" onClick={() => setCompare(false)} className="text-meta text-white/60 hover:text-white inline-flex items-center gap-1">
              დახურვა <Icon.x className="w-3 h-3" />
            </button>
          </div>
          <div className="px-5 pb-5 overflow-x-auto scrollbar-hide rail-fade-end">
            <table className="w-full text-meta min-w-[540px]">
              <thead>
                <tr className="text-left text-white/40 font-display uppercase text-micro">
                  <th className="font-medium py-2 pr-3 w-[120px]">პარამეტრი</th>
                  {items.map(t => (
                    <th key={t.id} className="font-medium py-2 px-2">
                      <Link href={`/experts/${t.tutorId}`} className="inline-flex items-center gap-1.5 text-white normal-case tracking-normal hover:text-brand-300 transition-colors duration-fast">
                        <img src={t.photo || DEFAULT_AVATAR} alt="" className="w-5 h-5 rounded-full object-cover" />
                        <span className="font-display text-meta font-bold">{t.name.split(' ')[0]}</span>
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-display tabular-nums">
                <tr className="border-t border-white/10">
                  <td className="py-2.5 pr-3 text-white/60">ფასი</td>
                  {/* Compare on the numeric flagship price, PRINT the label —
                      so „უფასო" reads as free instead of „₾0". */}
                  {items.map(t => <td key={t.id} className={`py-2.5 px-2 font-bold ${t.price === cheapest.price ? 'text-brand-300' : 'text-white'}`}>{t.priceLabel}</td>)}
                </tr>
                <tr className="border-t border-white/10">
                  <td className="py-2.5 pr-3 text-white/60">რეიტინგი</td>
                  {items.map(t => <td key={t.id} className={`py-2.5 px-2 font-bold ${t.rating === topRated.rating ? 'text-brand-300' : 'text-white'}`}>{t.rating > 0 ? `${t.rating.toFixed(2)} ★` : 'ახალი'}</td>)}
                </tr>
                <tr className="border-t border-white/10">
                  <td className="py-2.5 pr-3 text-white/60">შეფასებები</td>
                  {items.map(t => <td key={t.id} className="py-2.5 px-2 text-white">{t.reviews}</td>)}
                </tr>
                <tr className="border-t border-white/10">
                  <td className="py-2.5 pr-3 text-white/60">კატეგორია</td>
                  {items.map(t => <td key={t.id} className="py-2.5 px-2 text-white normal-case tracking-normal">{t.specialty}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 stagger">
      {items.map(t => (
        // ROUND-THUMB card (2026-08-05), replacing a 4/3 photo banner. The
        // banner was the last place on the site that cropped a portrait into a
        // wide frame — it cut faces at eye level, blew a 256px avatar up ~1.3×,
        // and made this card structurally unlike /experts, which the very same
        // saved experts are browsed on. Same reasoning as the browse card's own
        // banner→thumb move: see the long note at app/experts/client.tsx.
        <div key={t.id} className="relative rounded-card border border-ink-200 bg-white group hover-lift flex flex-col p-4 sm:p-5">
          {/* Saved heart — filled/brand (it IS saved); warms to danger on
              hover to signal the click removes it. It used to float on the
              photo; a circular thumb has no spare corner, so it moves to the
              CARD corner (the /experts pattern) and the identity column reserves
              `pr-9` so the two can never collide. */}
          <button
            type="button"
            onClick={() => remove(t.tutorId)}
            disabled={removing === t.tutorId}
            aria-label="წაშლა"
            className="absolute top-2.5 right-2.5 z-10 w-10 h-10 rounded-full inline-flex items-center justify-center text-brand-600 hover:text-danger-600 hover:bg-ink-50 disabled:opacity-50 transition-colors duration-fast"
          >
            <Icon.heartFilled className="w-4 h-4" />
          </button>

          {/* Photo + identity share ONE link: with the banner gone, a 96px
              thumb on its own is too small a target to be the only way in. */}
          <Link href={`/experts/${t.tutorId}`} className="flex items-start gap-3.5 min-w-0">
            <Image
              src={t.photo || DEFAULT_AVATAR}
              alt={t.name}
              width={96}
              height={96}
              // Skip the optimizer for anything already optimized — base64 data
              // URIs it cannot process at all, and /api/avatars/∗ is already a
              // ≤384px immutable webp, so the extra hop is pure latency.
              unoptimized={(t.photo || DEFAULT_AVATAR).startsWith('data:') || (t.photo || DEFAULT_AVATAR).startsWith('/api/avatars/')}
              className="shrink-0 w-24 h-24 rounded-full object-cover object-center bg-ink-100 ring-1 ring-ink-100"
            />
            <div className="min-w-0 flex-1 pr-9">
              {/* ROLES SWAPPED to match /experts: the CHIP carries our taxonomy,
                  the expert's own words follow as quiet text. It used to be the
                  other way round — free text in the loud chip made an unvalidated
                  string look platform-verified, and the taxonomy was demoted to a
                  muted line. Unlike the browse card the headline is KEPT here,
                  because this card renders no bio, so it is the only descriptive
                  line the saved expert gets. */}
              <div className="font-display text-body font-bold text-ink-900 leading-snug truncate transition-colors duration-fast group-hover:text-brand-700">{t.name}</div>
              {t.specialty && (
                <span className="mt-1.5 inline-flex items-center max-w-full h-5 px-2 rounded-pill bg-ink-75 border border-ink-200 text-ink-700 font-display text-meta font-semibold tracking-tight truncate">
                  {t.specialty}
                </span>
              )}
              {/* Rating — off the photo now that the photo is a circle, onto the
                  meta line where the other facts live. */}
              <div className="mt-1.5 inline-flex items-center gap-1 text-meta">
                {t.rating > 0 ? (
                  <>
                    <Icon.star aria-hidden className="w-3 h-3 text-warning-500" />
                    <span className="font-display font-bold text-ink-900 tabular-nums" role="img" aria-label={`${t.rating.toFixed(1)} 5-დან`}>{t.rating.toFixed(1)}</span>
                    <span className="text-ink-400 tabular-nums">({t.reviews})</span>
                  </>
                ) : (
                  <span className="font-display font-semibold text-ink-500">ახალი</span>
                )}
              </div>
            </div>
          </Link>

          <div className="flex flex-col flex-1">
            {displayHeadline(t.headline) && (
              <div className="text-meta text-ink-500 mt-3 line-clamp-2">{displayHeadline(t.headline)}</div>
            )}
            {/* mt-auto pins price+CTA to the bottom so every card in a row
                lines up regardless of headline length. */}
            <div className="mt-auto pt-4">
              {/* The FLAGSHIP tier's price and its REAL length. The duration is
                  in the payload now, so the generic „/ სესია" (written when it
                  wasn't) gives way to the actual minutes — same sentence /experts
                  prints for the same expert. */}
              <div className="font-display text-h3 font-bold text-ink-900 tabular-nums tracking-tight">
                {t.priceLabel}<span className="text-meta font-medium text-ink-500 ml-1">· {t.priceSuffix}</span>
              </div>
              {/* Booking path — ?rebook=1 auto-opens the booking modal on the
                  profile (this is a signed-in area, so no auth detour). */}
              <Link
                href={`/experts/${t.tutorId}?rebook=1`}
                className="mt-3 w-full h-11 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center justify-center transition-colors duration-fast shadow-xs"
              >
                დატოვე მოთხოვნა
              </Link>
            </div>
          </div>
        </div>
      ))}
      </div>
    </div>
  )
}

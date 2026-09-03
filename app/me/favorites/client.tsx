'use client'
// The shortlist's cards + the compare table. See ./page.tsx for what the
// 2026-08-31 canvas changed and why the sub-line is not the canvas's sentence.
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { Avatar } from '@/components/Avatar'
import { Btn } from '@/components/Btn'
import { Card } from '@/components/Card'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { useToast } from '@/components/ToastProvider'
import { tileHue } from '@/app/_home/data'

type Item = {
  id: string
  providerId: string
  /** /experts/<slug|id> — the public profile. */
  href: string
  /** The addressed intake (`?to=<slug>`), or null when the subsystem is off. */
  requestHref: string | null
  name: string
  /** A company profile, so the avatar is a rounded square. */
  firm: boolean
  photo: string
  specialty: string
  /** „პასუხობს ~2 საათში" — MEASURED (lib/responseStats), or null. */
  reply: string | null
  rating: number
  reviews: number
  /** The price floor as a NUMBER — used only to pick the cheapest in the
   *  compare table. Never rendered directly; see `priceLabel`. */
  price: number
  /** What actually gets printed („60₾-დან" / „ფასს შემოგთავაზებს") — resolved
   *  server-side from the same `lowestPrice` /experts uses, so this page can't
   *  disagree with the catalogue. */
  priceLabel: string
}

export function FavoritesClient({ items: initial }: { items: Item[] }) {
  const [items, setItems] = useState(initial)
  const [removing, setRemoving] = useState<string | null>(null)
  // Side-by-side compare — the canvas does not draw it, and it is kept: it is
  // the one thing on this screen a card cannot do, and a shortlist exists to be
  // compared. It stays a disclosure, closed by default, so the screen the
  // canvas designed is the screen you land on.
  const [compare, setCompare] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const cheapest = items.length ? items.reduce((a, b) => (a.price < b.price ? a : b), items[0]) : null
  const topRated = items.length ? items.reduce((a, b) => (a.rating > b.rating ? a : b), items[0]) : null

  // ⚠️ THE BODY KEY IS `providerId`, AND SENDING `providerId` WAS A 400
  // (2026-08-26). /api/favorites was renamed on 2026-08-24 and its own header
  // says „the browser sends the new name" — this, the only caller, did not, so
  // every „remove" answered INVALID: the card vanished optimistically and then
  // came back with the failure toast. The local names stay `providerId` because
  // that is what the row's prop is called here; only the WIRE key matters.
  const remove = async (providerId: string) => {
    setRemoving(providerId)
    // Optimistic: the card disappears on tap — that IS the feedback. Keep the
    // pre-mutation list so a failed DELETE can restore it (with the toast
    // saying why it came back).
    const prevItems = items
    setItems(prev => prev.filter(i => i.providerId !== providerId))
    try {
      const res = await fetch('/api/favorites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: providerId }),
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

  // The reply chip's plate: TILE_HUES entry 0, the same green the request
  // list's „N შეთავაზება" pill wears — one canvas, one family.
  const chip = tileHue(0)

  return (
    <div>
      {items.length > 1 && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setCompare(c => !c)}
            aria-expanded={compare}
            // The panel this opens is below and out of the button's own
            // subtree, so `aria-expanded` alone left a screen reader with
            // „expanded" and nothing named. 2026-09-01.
            aria-controls="favourites-compare"
            className={`h-10 sm:h-9 px-3.5 rounded-btn inline-flex items-center gap-1.5 font-display text-small font-semibold transition-colors duration-fast ${compare ? 'bg-ink-900 text-white' : 'bg-white border border-ink-200 hover:border-ink-300 text-ink-800'}`}
          >
            <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M8 3v18M16 3v18M3 8h5M16 16h5M3 16h5M16 8h5" /></svg>
            შედარება
          </button>
        </div>
      )}

      {compare && cheapest && topRated && (
        <div id="favourites-compare" className="mb-5 rounded-card overflow-hidden border border-ink-200 bg-ink-900 text-white">
          <div className="px-5 py-4 flex items-baseline justify-between">
            <div className="font-display text-small font-bold tracking-tight">შედარება · {items.length} ექსპერტი</div>
            {/* ⚠️ `tap-area` (2026-09-01). This is the only way OUT of the
                compare panel and it was bare `text-meta` text — a ~17px tall
                target, well under the project's 40px floor, in the corner of a
                dark plate. `.tap-area` (globals.css) hangs an invisible
                ::before at inset -12px so the finger gets ~41px and the layout
                gets exactly the line the panel was drawn around; padding here
                would have pushed the heading beside it off its baseline. */}
            <button type="button" onClick={() => setCompare(false)} className="tap-area text-meta text-white/60 hover:text-white inline-flex items-center gap-1">
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
                      <Link href={t.href} className="inline-flex items-center gap-1.5 text-white normal-case tracking-normal hover:text-brand-300 transition-colors duration-fast">
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
                  {/* Compare on the numeric floor, PRINT the label — so „ask"
                      reads as a way of working instead of „₾0". */}
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

      <div className="grid sm:grid-cols-2 gap-4 stagger">
        {items.map(t => (
          // THE CANVAS'S CARD: identity, one measured fact, the floor price and
          // one button — in that order, top to bottom. The ★ rating and the
          // free-text headline the old card carried are gone from it; both are
          // on the profile the name links to, and neither is what a shortlist
          // is scanned for. `border-ink-100` rather than `border-ink-200`: on
          // the cream ground the hairline is what separates card from paper and
          // the canvas draws it one step lighter.
          <Card key={t.id} padding="none" edge="hairline" className="relative flex flex-col gap-3.5 p-5">
            {/* Saved heart — filled/brand (it IS saved); warms to danger on
                hover to signal the click removes it. The canvas draws no such
                control, and a shortlist you cannot leave is a trap. */}
            <button
              type="button"
              onClick={() => remove(t.providerId)}
              disabled={removing === t.providerId}
              aria-label={`${t.name} — შენახულებიდან წაშლა`}
              className="absolute top-2.5 right-2.5 z-10 w-10 h-10 rounded-full inline-flex items-center justify-center text-brand-600 hover:text-danger-600 hover:bg-ink-50 disabled:opacity-50 transition-colors duration-fast"
            >
              <Icon.heartFilled className="w-4 h-4" />
            </button>

            <Link href={t.href} className="group flex items-center gap-3.5 min-w-0 pr-10">
              <Avatar src={t.photo || null} name={t.name} size={56} shape={t.firm ? 'card' : 'circle'} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-display text-body-lg font-bold text-ink-900 truncate transition-colors duration-fast group-hover:text-brand-700">{t.name}</span>
                {t.specialty && <span className="mt-0.5 block text-meta text-ink-500 truncate">{t.specialty}</span>}
              </span>
            </Link>

            {/* 🔒 DRAWN ONLY WHEN IT WAS MEASURED. Below the three-lead sample
                floor `replyLabel` returns null and there is no chip — a young
                marketplace showing one honest fact is the correct look. */}
            {t.reply && (
              <span
                className="inline-flex h-[26px] self-start items-center whitespace-nowrap rounded-pill border px-2.5 font-display text-meta font-semibold"
                style={{ backgroundColor: chip.bg, borderColor: chip.border, color: chip.ink }}
              >
                {t.reply}
              </span>
            )}

            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-3.5">
              <span className="font-display text-h3 font-extrabold tabular-nums tracking-tight text-ink-900 whitespace-nowrap">
                {t.priceLabel}
              </span>
              {t.requestHref && (
                <Btn href={t.requestHref} variant="primary" className="shrink-0">
                  მიიღე შეთავაზება
                </Btn>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

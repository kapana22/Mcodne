'use client'
// /student — the saved-experts strip.

import Link from 'next/link'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'
import { FavState, SavedExpert } from './_model'

/* Presentational only. The fetch lives in <Dashboard> because the BLANK-SLATE
   rule („no bookings and no favorites ⇒ show only Welcome + Discover") needs
   the favorites count one level above this strip — a component that hides
   itself cannot tell its siblings to hide too. */
export const SavedStrip = ({ items, loadState, onRetry }: { items: SavedExpert[]; loadState: FavState; onRetry: () => void }) => {
  if (loadState === 'loading') return null
  // Failure/empty here is secondary content — render a compact single-row
  // notice, never a hero-sized card competing with the user's sessions.
  if (loadState === 'error') {
    return (
      <div role="alert" className="rounded-card border border-ink-200 bg-white px-4 sm:px-5 py-3 flex items-center gap-3 flex-wrap motion-safe:animate-fade-in">
        <Icon.warn className="w-4 h-4 text-ink-400 shrink-0" />
        <p className="flex-1 min-w-[220px] text-small text-ink-600">
          <span className="font-display font-semibold text-ink-800">რჩეულების სია ვერ ჩაიტვირთა</span> — სცადე ცოტა ხანში.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 h-10 sm:h-8 px-3.5 sm:px-3 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-meta tracking-wide inline-flex items-center gap-1.5 transition-colors duration-fast"
        >
          <Icon.refresh className="w-3.5 h-3.5" />
          სცადე თავიდან
        </button>
      </div>
    )
  }
  if (!items.length) {
    return (
      <div className="rounded-card border border-dashed border-ink-200 bg-white px-4 sm:px-5 py-3 flex items-center gap-3 flex-wrap motion-safe:animate-fade-in">
        <Icon.heart className="w-4 h-4 text-ink-400 shrink-0" />
        <p className="flex-1 min-w-[220px] text-small text-ink-600">
          <span className="font-display font-semibold text-ink-800">რჩეულების სია ცარიელია</span> — შეინახე ექსპერტები შესადარებლად.
        </p>
        <Link
          href="/experts"
          className="shrink-0 h-10 sm:h-8 px-3.5 sm:px-3 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-meta tracking-wide inline-flex items-center gap-1.5 transition-colors duration-fast"
        >
          ექსპერტების ნახვა
        </Link>
      </div>
    )
  }

  return (
    <section className="rounded-card border border-ink-200 bg-white overflow-hidden">
      <div className="px-5 sm:px-6 py-5 border-b border-ink-100 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 mb-1">
            <Eyebrow as="span">შენახული</Eyebrow>
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-pill bg-ink-900 text-white text-meta font-display font-bold tabular-nums">{items.length}</span>
          </div>
          <h2 className="font-display text-h3 sm:text-h2 font-bold text-ink-900 tracking-tight leading-tight">შენახული ექსპერტები</h2>
        </div>
        <Link href="/me/favorites" className="font-display text-meta font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1">
          ყველა · შედარება
        </Link>
      </div>
      <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {items.slice(0, 4).map(w => (
          <Link key={w.id} href={`/experts/${w.id}`} className="group rounded-card border border-ink-200 hover:border-ink-300 hover:shadow-card transition-all duration-fast p-4 min-w-0 bg-white">
            <div className="flex items-center gap-3">
              <img src={w.avatar || DEFAULT_AVATAR} alt={w.name} className="w-11 h-11 rounded-full object-cover ring-1 ring-ink-200 shrink-0" />
              <div className="min-w-0">
                <div className="font-display text-small font-bold text-ink-900 truncate group-hover:text-brand-800 transition-colors duration-fast">{w.name}</div>
                {/* '' for an expert with no category — see app/experts/_data.tsx. */}
                {w.cat && <div className="text-meta text-ink-500 truncate">{w.cat}</div>}
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-ink-100 flex items-center justify-between text-meta">
              <span className="inline-flex items-center gap-1 text-ink-600">
                {w.rating > 0 && (
                  <>
                    <Icon.star aria-hidden className="w-3 h-3 text-warning-500" />
                    <span role="img" aria-label={`${w.rating.toFixed(1)} 5-დან`} className="font-display font-semibold tabular-nums">{w.rating.toFixed(1)}</span>
                  </>
                )}
              </span>
              <span className="font-display font-bold text-ink-900 tabular-nums">{w.priceLabel}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
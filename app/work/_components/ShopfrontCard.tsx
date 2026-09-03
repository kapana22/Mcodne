'use client'
// THE CARD A CLIENT SEES, STANDING BESIDE THE FORM THAT WRITES IT.
//
// ⚠️ WHY THIS EXISTS (2026-08-29). /work/profile's own subtitle is „როგოც
// გხედავენ კლიენტები", and until now it kept that promise with a LINK — open a
// new tab, look, come back, forget what you changed. The two supply-side
// editors are the only screens on this site whose entire output is a card
// somebody else reads, so the card belongs on the screen: edit on the left,
// watch it change on the right.
//
// ⚠️ IT RENDERS FROM WHAT THE EDITOR ALREADY LOADED, and that is the whole
// design constraint. No second fetch, no second opinion — the props are the
// draft the form is holding, so what stands here is what would be saved, not
// what is stored. A preview that lagged the form by one save would be worse
// than the link it replaces.
//
// ⚠️ AND IT IS DELIBERATELY NOT THE REAL `EntityCard`. That component is the
// catalogue's, fed by `lib/catalogItems` from a query this page does not run;
// importing it would mean either shipping that query into an editor or feeding
// it a half-filled shape. What matters here is the ANSWER — face, name,
// sentence, what you do and what it costs — and those five are all the editor
// holds. If the two ever disagree about layout, the catalogue is right and this
// follows it.

import { Avatar } from '@/components/Avatar'
import { Icon } from '@/components/Icon'
import { PRICE_ON_REQUEST } from '@/lib/requests'

export type ShopfrontProps = {
  name: string
  avatarUrl?: string | null
  /** The one sentence under the name. */
  headline?: string | null
  /** Ticked services, in the order the form holds them, already labelled. */
  services: { id: string; label: string; price: number | null }[]
  /** How many work photos exist — drawn as plates, never fetched here. */
  workPhotos?: number
  verified?: boolean
  /** ⚠️ THE ONE PRICE (2026-09-01, owner: „ერთი ფასი და „შეთანხმებით"").
   *  Null is „ფასი შეთანხმებით", which is now an answer somebody chose rather
   *  than a box they left alone. Before this prop the preview derived its whole
   *  „კატალოგში … ₾-დან" line from the per-service map — the map the editor
   *  stopped writing — so the card that exists to show „what a client will see"
   *  showed no price to anybody, while the real catalogue card beside it read
   *  `lowestPrice(r) ?? r.priceFrom` and printed one. */
  priceFrom?: number | null
}

export function ShopfrontCard({
  name, avatarUrl, headline, services, workPhotos = 0, verified = false, priceFrom = null,
}: ShopfrontProps) {
  // The catalogue prints a „from" price off the cheapest priced service — the
  // same rule, so the number here and the number there cannot disagree.
  // ⚠️ AND THE SAME FALLBACK, IN THE SAME ORDER, as app/experts/_providers
  // („lowestPrice(r) ?? r.priceFrom"). A legacy per-service map still wins
  // where one exists; everybody else has one price and this is where it lands.
  const priced = services.filter(s => s.price !== null && s.price > 0)
  const from = priced.length > 0 ? Math.min(...priced.map(s => s.price as number)) : priceFrom
  /** Is there a price column to draw at all — see the row below. */
  const anyPriced = priced.length > 0

  return (
    <div className="rounded-card border border-ink-200 bg-white p-5 shadow-sm">
      <div className="flex gap-3.5 items-start">
        <Avatar src={avatarUrl ?? undefined} name={name} size={56} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-body-lg font-bold text-ink-900 leading-tight truncate">
            {name}
          </div>
          {headline
            ? <p className="text-small text-ink-500 leading-snug mt-1 line-clamp-2">{headline}</p>
            : <p className="text-small text-ink-400 leading-snug mt-1">ჯერ არ გიწერია, რას აკეთებ</p>}
          {verified && (
            <span className="inline-flex items-center gap-1.5 mt-2">
              <Icon.check aria-hidden className="w-3.5 h-3.5 text-brand-600" />
              <span className="text-meta font-display font-semibold text-brand-700">გადამოწმებული</span>
            </span>
          )}
        </div>
      </div>

      {workPhotos > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-1.5">
          {Array.from({ length: Math.min(workPhotos, 3) }, (_, i) => (
            <div key={i} className="aspect-square rounded-btn bg-ink-100 border border-ink-200" />
          ))}
        </div>
      )}

      {services.length > 0 && (
        <>
          <div className="h-px bg-ink-100 my-4" />
          <ul className="flex flex-col gap-2">
            {services.slice(0, 5).map(s => (
              <li key={s.id} className="flex items-baseline justify-between gap-3">
                <span className={`text-small truncate ${s.price ? 'text-ink-800' : 'text-ink-500'}`}>
                  {s.label}
                </span>
                {/* ⚠️ NO EMPTY SLOT. A blank where the neighbour has a number
                    reads as „hiding it"; the catalogue's own words for an
                    unpriced service are these.
                    ⚠️ AND NO COLUMN AT ALL WHERE THERE IS NO NEIGHBOUR
                    (2026-09-01). Per-service prices stopped being collected
                    when the question became one price plus „შეთანხმებით", so
                    every row printed „ფასს შემოგთავაზებს" — five times — while
                    the footer three lines below said „კატალოგში 80 ₾-დან". The
                    card contradicted itself. The rule above is unchanged and is
                    what decides this: it exists so a blank cannot sit beside a
                    number, and where no row has a number there is nothing to
                    sit beside. */}
                {anyPriced && (
                  <span className={`shrink-0 tabular-nums ${s.price
                    ? 'font-display text-small font-bold text-ink-900'
                    : 'text-meta text-ink-400'}`}>
                    {s.price ? `${s.price} ₾` : PRICE_ON_REQUEST}
                  </span>
                )}
              </li>
            ))}
            {services.length > 5 && (
              <li className="text-meta text-ink-400">კიდევ {services.length - 5}</li>
            )}
          </ul>
        </>
      )}

      {from !== null && (
        <div className="mt-4 pt-3 border-t border-ink-100 flex items-baseline justify-between gap-3">
          <span className="text-meta text-ink-500">კატალოგში</span>
          <span className="font-display text-body-lg font-bold text-ink-900 tabular-nums">{from} ₾-დან</span>
        </div>
      )}
    </div>
  )
}

/** The eyebrow the two editors put above it, so the words are written once. */
export function ShopfrontLabel() {
  return (
    <div className="flex items-center gap-2 pl-0.5 mb-3">
      <Icon.eye aria-hidden className="w-3.5 h-3.5 text-ink-400" />
      <span className="text-meta font-display font-semibold text-ink-500">კლიენტი ასე გხედავს</span>
    </div>
  )
}

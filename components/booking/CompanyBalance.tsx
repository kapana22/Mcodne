'use client'
// The „pay from the company balance" choice in the booking sheet.
//
// WHY IT IS ITS OWN FILE. BookingFlow is 1,136 lines and deliberately NOT split
// (CLAUDE.md says so, and says why); it is also the booking path and a lazy
// chunk, so it cannot be checked by grep. The smallest possible edit to it is
// therefore the whole design goal here: BookingFlow gains one hook call, one
// piece of state, one rendered element and one payload key. Everything else —
// the fetch, the arithmetic, the copy, the disabled states — lives here.
//
// ⚠️ NOTHING HAPPENS FOR ANYBODY WHO IS NOT A COMPANY MEMBER. With the vertical
// off, `b2bFeatureExists()` is false and the hook makes NO REQUEST AT ALL — not
// a 404'd one — so the booking flow does not gain so much as a network call it
// did not have before. With the vertical on but the viewer unaffiliated, the
// endpoint answers `{ company: null }` and this renders `null`. In both cases
// the sheet is byte-for-byte the sheet that shipped before this feature.

import { useEffect, useState } from 'react'
import { Icon } from '@/components/Icon'
import { b2bFeatureExists, canSpendBalance } from '@/lib/b2b'

export type MyCompany = {
  id: string
  name: string
  balance: number
  status: 'ACTIVE' | 'SUSPENDED'
  role: 'OWNER' | 'MEMBER'
}

/**
 * The viewer's company, or null.
 *
 * Fetched when the sheet OPENS rather than on mount, so a page with a booking
 * sheet on it costs nothing until somebody actually opens it — and re-fetched
 * on each open, because an admin may have topped the balance up in between and
 * a stale number here would offer a payment that then fails.
 */
export function useCompanyBalance(open: boolean): MyCompany | null {
  const [company, setCompany] = useState<MyCompany | null>(null)

  useEffect(() => {
    if (!open || !b2bFeatureExists()) return
    let alive = true
    ;(async () => {
      try {
        const r = await fetch('/api/me/company', { cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json()
        if (alive && j?.ok) setCompany(j.company ?? null)
      } catch {
        // Silent, and it must stay silent: this is an OPTIONAL payment method.
        // A failed lookup means the card path, which is what every booking
        // already does — surfacing an error here would break a flow that is
        // working perfectly well.
      }
    })()
    return () => { alive = false }
  }, [open])

  return company
}

/**
 * The choice itself. Renders nothing at all when there is no company.
 *
 * Deliberately NOT a payment STEP. PAYMENTS_LIVE is false, so the flow has no
 * payment step to join — adding one for this would put a checkout in front of
 * every company client while everybody else still books in two steps, which is
 * a bigger change to the booking path than the feature is worth. It is one
 * block at the bottom of „დეტალები", where the price is already shown.
 */
export function CompanyBalanceChoice({
  company, priceGel, value, onChange,
}: {
  company: MyCompany | null
  priceGel: number
  value: boolean
  onChange: (v: boolean) => void
}) {
  if (!company) return null

  const affordable = canSpendBalance(company, priceGel)
  const frozen = company.status !== 'ACTIVE'
  // The reason it cannot be used, or null when it can. Stated plainly: the
  // person needs to know whether to reach for a card, and „unavailable" does
  // not tell them whose problem it is.
  const blocked = frozen
    ? 'კომპანიის ანგარიში დროებით გაყინულია.'
    : !affordable
      ? 'ბალანსზე საკმარისი თანხა არ არის.'
      : null

  return (
    <div className="mt-5 rounded-card border border-ink-200 p-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={value && !blocked}
          disabled={!!blocked}
          onChange={e => onChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 shrink-0 rounded accent-brand-600 disabled:opacity-40"
        />
        <span className="min-w-0">
          <span className="block font-display text-body font-semibold text-ink-900">
            გადახდა კომპანიის ბალანსიდან
          </span>
          <span className="block text-small text-ink-600 mt-0.5">
            {company.name} · ბალანსი {company.balance.toLocaleString('en-US')}₾
          </span>
          {blocked && (
            <span className="flex items-center gap-1.5 mt-1.5 text-small text-warning-700">
              <Icon.warn className="w-3 h-3 shrink-0" aria-hidden="true" />
              {blocked}
            </span>
          )}
        </span>
      </label>
    </div>
  )
}

// /me — the client's own service requests, the short version (D7, stage 6).
// The full list is /me/requests; this shows the latest three and links there.
//
// ⚠️ IT FETCHED ITS OWN ROWS UNTIL 2026-08-30, from `/api/me/requests?limit=3`
// after mount. That made it one of five things on the client's landing page
// that arrived late — owner: „ნახევარს ტვირთავს ხოლმე რაღაცებს და მერე ჩნდება."
// The server page holds these rows now (lib/myRequests, the same call
// /me/requests makes), so this is a pure renderer and the card is in the first
// paint or not at all.
//
// Renders NOTHING with no rows: a client who has never used the intake should
// not meet an empty box about it on their home.

import Link from 'next/link'
import { REQUEST_ROUTE } from '@/lib/requests'
import type { MyRequestRow } from '@/lib/myRequests'
import { RequestStatusPill } from '@/components/requests/StatusPills'

// ⚠️ EACH ROW OPENS THE REQUEST'S OWN PAGE, not a list anchor. It used to link
// to `/me/requests#<ref>` — a scroll position on a summary of itself. The
// request page (/request/<ref>) is where the offers and the thread live, and
// it is the same page somebody with no account reaches by reference.
export function MyRequestsSection({ rows }: { rows: MyRequestRow[] }) {
  if (rows.length === 0) return null

  return (
    <section>
      {/* No „ყველა" link and no count in the heading: this IS all of them.
          The link pointed at /me/requests, which was this list again. */}
      <h2 className="font-display text-h3 font-bold text-ink-900">ჩემი მოთხოვნები</h2>
      <p className="mt-1 text-small text-ink-500">გახსნილი მოთხოვნები და მათი შეთავაზებები</p>
      <ul className="mt-4 rounded-card border border-ink-200 bg-white overflow-hidden divide-y divide-ink-100">
        {rows.map(r => (
          <li key={r.id}>
            <Link
              href={`${REQUEST_ROUTE}/${r.publicRef}`}
              className="flex items-center gap-3 px-5 sm:px-6 py-4 hover:bg-ink-50 transition-colors duration-fast"
            >
              <div className="min-w-0 flex-1">
                {/* The person's own words, not the category — three rows of
                    one topic were three identical lines. See requestHeadline. */}
                <div className="font-display text-body font-semibold text-ink-900 truncate">{r.headline}</div>
                <div className="mt-0.5 text-meta text-ink-500 tabular-nums">
                  {r.topicLabel} · {r.offerCount > 0 ? `${r.offerCount} შეთავაზება` : 'შეთავაზება ჯერ არ არის'}
                </div>
              </div>
              <RequestStatusPill status={r.status} label={r.statusLabel} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

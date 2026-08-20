'use client'
// /me — the client's own service requests, the short version (D7, stage 6).
// The full list is /me/requests; this shows the latest three and links there.
//
// Renders NOTHING when the subsystem does not exist on this deployment
// (requestsFeatureExists — the inlined flag, the same one the admin rail
// reads) and nothing while loading or when the account has no requests: a
// client who has never used the intake should not meet an empty box about it
// on their home. Secondary content, so a failed fetch is silent.

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Eyebrow } from '@/components/Eyebrow'
import { Card } from '@/components/Card'
import { requestsFeatureExists } from '@/lib/requests'
import type { MyRequestRow } from '@/lib/myRequests'
import { RequestStatusPill } from '@/components/requests/StatusPills'

const MY_REQUESTS_HREF = '/me/requests'

export function MyRequestsSection() {
  const on = requestsFeatureExists()
  const [rows, setRows] = useState<MyRequestRow[] | null>(null)
  useEffect(() => {
    if (!on) return
    let cancelled = false
    fetch('/api/me/requests?limit=3')
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled && j?.ok && Array.isArray(j.requests)) setRows(j.requests) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [on])
  if (!on || !rows || rows.length === 0) return null

  return (
    <Card as="section" padding="none" className="overflow-hidden">
      <div className="px-5 sm:px-6 py-5 border-b border-ink-100 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <Eyebrow as="span">მოთხოვნები</Eyebrow>
          <h2 className="mt-1 font-display text-h3 font-bold text-ink-900">ჩემი მოთხოვნები</h2>
        </div>
        <Link href={MY_REQUESTS_HREF} className="font-display text-small font-semibold text-brand-700 hover:text-brand-800 transition-colors duration-fast">
          ყველა
        </Link>
      </div>
      <ul className="divide-y divide-ink-100">
        {rows.map(r => (
          <li key={r.id}>
            <Link href={`${MY_REQUESTS_HREF}#${r.publicRef}`} className="flex items-center gap-3 px-5 sm:px-6 py-3.5 hover:bg-ink-50 transition-colors duration-fast">
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
    </Card>
  )
}

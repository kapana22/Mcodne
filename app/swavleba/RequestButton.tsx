'use client'
// „მოთხოვნა" — the client's half of phase 5.
//
// It does NOT say „buy" and must not: there is no gateway, nothing is charged,
// and the teacher has to confirm. The button asks; the money is settled off
// platform and the teacher marks it received. Copy that promised a purchase
// here would be the one dishonest string in the flow.

import { useState } from 'react'

// No `disabled` prop, deliberately. It used to render „ვერ მოითხოვება" for a
// package whose schedule could not hold it — but an offer nobody can accept
// should not be on the page at all, so /swavleba now filters those out for
// clients instead. Capacity can still lapse between render and click; that
// arrives as the server's NO_CAPACITY message through `err` below, which is
// the honest place for it.
export function RequestButton({ packageId }: { packageId: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [err, setErr] = useState<string | null>(null)

  const go = async () => {
    if (state !== 'idle') return
    setState('busy'); setErr(null)
    try {
      const res = await fetch(`/api/packages/${packageId}/request`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.message || 'ვერ გაიგზავნა.'); setState('idle'); return }
      setState('done')
    } catch { setErr('ქსელის შეცდომა.'); setState('idle') }
  }

  if (state === 'done') {
    return <span className="font-display text-meta font-semibold text-brand-700">მოთხოვნა გაიგზავნა ✓</span>
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={go}
        disabled={state === 'busy'}
        className="h-9 px-3.5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display text-small font-semibold tracking-wide inline-flex items-center transition-colors duration-fast disabled:opacity-60"
      >
        {state === 'busy' ? 'იგზავნება…' : 'მოთხოვნა'}
      </button>
      {err && <span role="alert" className="font-display text-meta text-danger-700">{err}</span>}
    </span>
  )
}

'use client'
// „აღარ მჭირდება" — the client's own way out of a request they opened.
//
// ⚠️ WHY IT EXISTS (2026-09-01). Every other party had a door out of a request
// and the client had none: a provider can withdraw an offer, an admin can close
// a row, the cron closes an abandoned one. Somebody who filed one by mistake,
// or twice, or whose need went away, could only leave it standing — and a
// standing request costs PROVIDERS money, 1₾ each time one opens the contact.
// See app/api/requests/[ref]/cancel for the guard and the refund.
//
// ⚠️ QUIET, AND DELIBERATELY SO. This is not an action anybody should reach for
// by accident on the screen where they are waiting for good news, so it is a
// text button under the fold rather than a button beside the primary one — and
// it asks once before it does anything. Destructive and irreversible; the
// confirmation is the point, not politeness.
//
// ⚠️ IT DISAPPEARS THE MOMENT AN OFFER LANDS. The route refuses then too (a
// provider has written a real answer and been charged for it), so the control
// must not be on screen promising something the server will refuse. The page
// renders this only while `offers.length === 0`.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/Card'

export function CancelRequest({ publicRef }: { publicRef: string }) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const cancel = async () => {
    if (busy) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/requests/${publicRef}/cancel`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBusy(false)
        // The one case worth its own sentence: an offer arrived while this
        // screen was open, so the way out is now to choose rather than to
        // vanish. Everything else gets the generic line.
        setErr(typeof d?.message === 'string' ? d.message : 'ვერ გავაუქმეთ — სცადე ხელახლა.')
        return
      }
      router.refresh()
    } catch {
      setBusy(false)
      setErr('ვერ გავაუქმეთ — სცადე ხელახლა.')
    }
  }

  if (!asking) {
    return (
      <div className="mt-8 text-center">
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="tap-area inline-flex min-h-10 items-center px-2 text-small text-ink-500 underline underline-offset-2 transition-colors duration-fast hover:text-ink-800"
        >
          აღარ მჭირდება
        </button>
      </div>
    )
  }

  return (
    // The one card surface (components/Card) rather than the same four classes
    // written out — same 24px radius, same border, same p-4 „compact" tier.
    <Card padding="compact" className="mt-8 text-center">
      <p className="text-body text-ink-900">გავაუქმოთ ეს მოთხოვნა?</p>
      <p className="mt-1 text-small text-ink-600">ექსპერტები მას ვეღარ ნახავენ. დაბრუნება ვეღარ მოხერხდება.</p>
      {err && <p role="alert" className="mt-2 text-small font-medium text-danger-700">{err}</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-2.5">
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          aria-busy={busy}
          className="inline-flex h-11 items-center rounded-btn bg-danger-600 px-4 font-display text-small font-semibold text-white transition-colors duration-fast hover:bg-danger-700 disabled:opacity-60"
        >
          {busy ? 'ვაუქმებთ…' : 'დიახ, გავაუქმოთ'}
        </button>
        <button
          type="button"
          onClick={() => { setAsking(false); setErr(null) }}
          disabled={busy}
          className="inline-flex h-11 items-center rounded-btn border border-ink-200 bg-white px-4 font-display text-small font-semibold text-ink-800 transition-colors duration-fast hover:bg-ink-50 disabled:opacity-60"
        >
          არა, დავტოვოთ
        </button>
      </div>
    </Card>
  )
}

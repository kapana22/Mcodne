'use client'
// The provider's two verbs on an offer (stage 7, 2026-08-19): take a SENT one
// back (D8 — the WITHDRAWN status existed and nothing ever wrote it), and say
// „დასრულდა" on an ACCEPTED quote. Both POST to the lifecycle routes with a
// placeholder ref segment — the session is the authority on this side, and
// the ref is the CLIENT's credential, which this page never sees.
//
// One confirm before each: both are one-way. Refresh after, so the row's status
// line and the chat pane follow the database rather than local state.
//
// ⚠️ THE CONFIRM IS THE SITE'S, NOT THE BROWSER'S (2026-08-19). This shipped
// with `window.confirm()`, which the client half of the same product had
// already replaced one directory over (app/me/_sessions) with the note that the
// native dialog is jarring on mobile and inconsistent with everything around
// it. It also cannot say WHAT is one-way — a native dialog holds one line of
// text and no emphasis — so the two irreversible verbs on this page were the
// two least explained controls in the workspace.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Btn } from '@/components/Btn'
import { ConfirmModal } from '@/components/ConfirmModal'

export function OfferActions({ offerId, status, kind, doneAt }: {
  offerId: string
  status: string
  kind: string
  doneAt: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<null | 'withdraw' | 'done'>(null)
  const [err, setErr] = useState<string | null>(null)
  const [ask, setAsk] = useState<null | 'withdraw' | 'done'>(null)

  const call = async (verb: 'withdraw' | 'done') => {
    setAsk(null)
    setBusy(verb); setErr(null)
    try {
      const res = await fetch(`/api/requests/_/offers/${offerId}/${verb}`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) { setErr('ვერ შესრულდა — სცადე თავიდან.'); return }
      router.refresh()
    } catch { setErr('ვერ შესრულდა — სცადე თავიდან.') }
    finally { setBusy(null) }
  }

  const canWithdraw = status === 'SENT'
  const canDone = status === 'ACCEPTED' && kind === 'QUOTE' && !doneAt
  if (!canWithdraw && !canDone && !doneAt) return null

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {canWithdraw && (
        <Btn variant="secondary" size="sm" onClick={() => setAsk('withdraw')} loading={busy === 'withdraw'}>
          გატანა
        </Btn>
      )}
      {canDone && (
        <Btn variant="secondary" size="sm" onClick={() => setAsk('done')} loading={busy === 'done'}>
          დასრულდა
        </Btn>
      )}
      {doneAt && <span className="text-meta text-ink-500">დასრულებულია</span>}
      {err && <span className="text-meta text-danger-600">{err}</span>}

      {/* Two verbs, two sheets — each says what cannot be undone, which is the
          sentence the native dialog had no room for. Mounted only while asking,
          so nothing here is in the tab order on an ordinary row.
          No `busy` prop: `call()` closes the sheet before the request starts,
          so the spinner belongs to the row's button (`loading={busy === …}`),
          which is where the person is looking once the sheet is gone. */}
      <ConfirmModal
        open={ask === 'withdraw'}
        title="შემოთავაზების გატანა"
        body={<>შემოთავაზება კლიენტს აღარ დაუჩნდება და უკან ვეღარ დააბრუნებ. ადგილი კი გათავისუფლდება.</>}
        confirmLabel="გატანა"
        cancelLabel="დატოვე"
        tone="danger"
        onConfirm={() => call('withdraw')}
        onCancel={() => setAsk(null)}
      />
      <ConfirmModal
        open={ask === 'done'}
        title="სამუშაო დასრულდა?"
        body={<>კლიენტს ვთხოვთ შეფასების დატოვებას. ამის შეცვლა შემდეგ აღარ შეიძლება.</>}
        confirmLabel="დასრულდა"
        cancelLabel="ჯერ არა"
        onConfirm={() => call('done')}
        onCancel={() => setAsk(null)}
      />
    </div>
  )
}

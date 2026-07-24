'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Avatar } from '@/components/Avatar'
import { Btn } from '@/components/Btn'
import { Card } from '@/components/Card'
import { Eyebrow } from '@/components/Eyebrow'
import { ConfirmModal } from '@/components/ConfirmModal'
import { Icon } from '@/components/Icon'
import { SkeletonRow } from '@/components/Skeleton'
import { useToast } from '@/components/ToastProvider'
import { fmtKaDate, fmtKaTime } from '@/lib/kaDate'
import { refreshNavBadges } from '@/components/tutor/useNavBadges'
import type { DashBooking } from './types'

const redirectToSignin = () => {
  if (typeof window === 'undefined') return
  window.location.href = '/signin?redirect=' + encodeURIComponent(window.location.pathname + window.location.search)
}

/* PREPARING requests with inline accept/decline. Decline goes through a
   ConfirmModal — it cancels the client's request, so a stray tap must not be
   enough. Successful actions bump the sidebar badges. */
export function PendingRequests({
  pending,
  loading,
  onChanged,
}: {
  pending: DashBooking[]
  loading: boolean
  onChanged: () => Promise<void> | void
}) {
  const { toast } = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDecline, setConfirmDecline] = useState<DashBooking | null>(null)

  const decide = async (bookingId: string, action: 'accept' | 'decline') => {
    setBusy(bookingId + action)
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.status === 401) { redirectToSignin(); return }
      if (res.status >= 500) { toast('სერვერის შეცდომა — სცადე თავიდან', 'error'); return }
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) { toast('მოქმედება ვერ შესრულდა', 'error'); return }
      toast(action === 'accept' ? 'დადასტურდა' : 'უარყოფილია', 'success')
      refreshNavBadges()
      await onChanged()
    } catch {
      toast('ქსელის შეცდომა — შეამოწმე კავშირი', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card as="section" padding="none" className="overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-ink-100 flex items-center justify-between">
        <div>
          <Eyebrow tone="muted">ჯავშნის მოთხოვნები</Eyebrow>
          <div className="font-display text-[15px] font-bold text-ink-900 mt-0.5">{loading ? '—' : `${pending.length} მოთხოვნა`}</div>
        </div>
        <Link href="/tutor/bookings?tab=attention" className="text-[12px] text-brand-700 hover:text-brand-800 font-semibold inline-flex items-center gap-1">
          ყველა
        </Link>
      </div>
      {loading ? (
        <div className="divide-y divide-ink-100">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : pending.length === 0 ? (
        <div className="p-6 text-center text-[13px] text-ink-500">ახალი მოთხოვნები ჯერ არ არის.</div>
      ) : (
        <ul className="divide-y divide-ink-100">
          {pending.slice(0, 6).map(b => (
            <li key={b.id} className="p-4 sm:p-5">
              <div className="flex items-center gap-3 flex-wrap">
                <Avatar src={b.student?.avatarUrl ?? undefined} name={b.student?.fullName} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="font-display text-[14px] font-bold text-ink-900 truncate">{b.student?.fullName ?? 'უცნობი'}</div>
                  <div className="text-[12.5px] text-ink-600 truncate">{b.topic}</div>
                  <div className="text-[11.5px] text-ink-500 mt-1 flex items-center gap-3 flex-wrap">
                    <span className="inline-flex items-center gap-1"><Icon.calendar className="w-3 h-3" />{fmtKaDate(new Date(b.startAt))}</span>
                    <span className="inline-flex items-center gap-1"><Icon.clock className="w-3 h-3" />{fmtKaTime(new Date(b.startAt))} · {b.durationMin} წთ</span>
                    <span className="font-display font-bold text-ink-800">₾{b.price}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Btn variant="secondary" size="sm" onClick={() => setConfirmDecline(b)} disabled={busy === b.id + 'decline'}>
                    {busy === b.id + 'decline' ? '…' : 'უარი'}
                  </Btn>
                  <Btn variant="primary" size="sm" onClick={() => decide(b.id, 'accept')} disabled={busy === b.id + 'accept'}>
                    {busy === b.id + 'accept' ? '…' : 'დადასტურება'}
                  </Btn>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {pending.length > 6 && (
        <div className="px-5 py-3 border-t border-ink-100 text-center">
          <Link href="/tutor/bookings?tab=attention" className="text-[12.5px] text-brand-700 hover:text-brand-800 font-semibold">დანარჩენი {pending.length - 6} მოთხოვნის ნახვა</Link>
        </div>
      )}

      <ConfirmModal
        open={!!confirmDecline}
        title="უარი ჯავშნის მოთხოვნაზე?"
        body={confirmDecline ? `${confirmDecline.student?.fullName ?? 'კლიენტის'} მოთხოვნა გაუქმდება. კლიენტი მიიღებს შეტყობინებას.` : undefined}
        tone="warning"
        confirmLabel="უარყოფა"
        busy={busy === (confirmDecline?.id ?? '') + 'decline'}
        onConfirm={async () => {
          if (!confirmDecline) return
          await decide(confirmDecline.id, 'decline')
          setConfirmDecline(null)
        }}
        onCancel={() => setConfirmDecline(null)}
      />
    </Card>
  )
}

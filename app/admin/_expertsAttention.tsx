'use client'
import { useEffect, useState } from 'react'
import { Icon } from '@/components/Icon'
import { Avatar } from '@/components/Avatar'
import { fmtKaDateTime } from '@/lib/kaDate'
import { copyToClipboard } from '@/lib/clipboard'

/* WHO is unbookable — the named list behind the count.
 *
 * The სისტემა tab said „5 experts with no time" and linked to the public browse
 * page, so the next question — which five — could not be answered from the
 * panel. This is that answer, plus the thing that was equally invisible: how
 * many setup nudges each of them has already had, and when the last one was.
 * „Chase them" and „they have had three, call them" are different jobs.
 */

type Item = {
  tutorProfileId: string; userId: string | null; slug: string | null
  fullName: string | null; email: string | null; avatarUrl: string | null
  blocker: 'service' | 'slots'
  hasService: boolean; hasSlots: boolean
  approvedAt: string; views: number
  nudgeCount: number; lastNudgeAt: string | null
}
type Data = { days: number; total: number; lostViews: number; neverNudged: number; liveExperts: number; items: Item[] }

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

const Row = ({ e }: { e: Item }) => {
  const [copied, setCopied] = useState(false)
  const label = e.blocker === 'service' ? 'სერვისი არ აქვს' : 'თავისუფალი დრო არ აქვს'
  return (
    <div className="py-3 px-4 sm:px-5 border-b border-ink-100 last:border-0 flex items-center gap-3 flex-wrap">
      <Avatar src={e.avatarUrl ?? undefined} name={e.fullName ?? '?'} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display text-small font-semibold text-ink-900 truncate">{e.fullName ?? '—'}</span>
          <span className="inline-flex items-center h-5 px-2 rounded-pill border border-danger-200 text-danger-700 font-display text-micro font-bold uppercase shrink-0">
            {label}
          </span>
        </div>
        <div className="text-meta text-ink-600 mt-0.5">
          {e.views > 0
            ? <><b className="text-ink-900">{e.views}</b> ნახვა 30 დღეში დაიკარგა · </>
            : 'ნახვა არ ჰქონია · '}
          დამტკიცდა {daysSince(e.approvedAt)} დღის წინ
          {' · '}
          {e.nudgeCount === 0
            ? <span className="text-warning-800 font-semibold">შეხსენება არ მიუღია</span>
            : <>{e.nudgeCount} შეხსენება, ბოლო {e.lastNudgeAt ? fmtKaDateTime(new Date(e.lastNudgeAt)) : '—'}</>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {e.slug && (
          <a
            href={`/tutors/${e.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 px-3 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 hover:border-ink-300 text-ink-700 font-display text-meta font-semibold inline-flex items-center gap-1.5 transition-colors duration-fast"
          >
            <Icon.external className="w-3.5 h-3.5" /> პროფილი
          </a>
        )}
        {e.email && (
          <button
            type="button"
            onClick={async () => { if (await copyToClipboard(e.email!)) { setCopied(true); setTimeout(() => setCopied(false), 1500) } }}
            className="h-9 px-3 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 hover:border-ink-300 text-ink-700 font-display text-meta font-semibold inline-flex items-center transition-colors duration-fast"
          >
            {copied ? 'დაკოპირდა' : 'ელფოსტა'}
          </button>
        )}
      </div>
    </div>
  )
}

export function ExpertsAttentionSection() {
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/admin/experts-attention', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('bad status'))))
      .then(j => { if (alive) setD(j) })
      // A failed fetch must not render as an empty list — „nobody needs
      // attention" is the most dangerous thing this panel could wrongly say.
      .catch(() => { if (alive) setErr(true) })
    return () => { alive = false }
  }, [])

  if (err) {
    return (
      <div className="rounded-card border border-danger-200 p-4 text-small text-danger-700">
        სია ვერ ჩაიტვირთა.
      </div>
    )
  }
  if (!d) return <div className="rounded-card border border-ink-200 bg-white px-5 py-6 text-small text-ink-600">იტვირთება…</div>

  if (d.items.length === 0) {
    return (
      <div className="rounded-card border border-brand-200 bg-white px-5 py-6 flex items-center gap-3">
        <Icon.check className="w-4 h-4 text-brand-600 shrink-0" />
        <span className="text-small text-ink-700">ყველა გამოქვეყნებული ექსპერტი დაჯავშნადია.</span>
      </div>
    )
  }

  return (
    <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-ink-100">
        <div className="font-display text-small font-bold text-ink-900">
          {d.items.length} ექსპერტი ვერ იღებს ჯავშანს
        </div>
        <div className="text-meta text-ink-600 mt-0.5 leading-snug">
          {d.liveExperts} დაჯავშნადიდან · ბოლო {d.days} დღეში <b className="text-ink-900">{d.lostViews}</b> ნახვა მოხვდა ჩიხში
          {d.neverNudged > 0 && <> · <span className="text-warning-800 font-semibold">{d.neverNudged}-ს შეხსენება ჯერ არ მიუღია</span></>}
        </div>
      </div>
      {d.items.map(e => <Row key={e.tutorProfileId} e={e} />)}
      <div className="px-4 sm:px-5 py-2.5 border-t border-ink-100 text-meta text-ink-500 leading-snug">
        შეხსენება ავტომატურად იგზავნება — სერვისზე სამჯერ (1, 4, 14 დღე), დროზე კი ორ კვირაში ერთხელ, სანამ პროფილი გამოქვეყნებულია. 22:00–08:00 არ იგზავნება.
      </div>
    </div>
  )
}

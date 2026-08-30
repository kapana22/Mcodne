'use client'
// ადმინი → „შეფასებები" — the one moderation surface for text the PUBLIC reads.
//
// ⚠️ WHY IT CAME BACK (2026-08-26). This tab existed and went on 2026-08-24,
// with the booking a review used to hang off. The review did not go with it: it
// hangs off a RequestOffer the client marked done, it is printed on the
// provider's catalogue card, on their profile hero and in the profile body, and
// it feeds the rating average beside their name. So for two days the site
// published free text written by strangers about named people, and the only way
// to take one down was to delete the account that wrote it.
//
// WHAT AN OPERATOR ACTUALLY DOES HERE, and why the screen is shaped like this:
// they arrive because somebody complained, so the first thing on screen is the
// filter that finds the complaint — „1–2 ★". Everything else is one list,
// newest first, because a review has no state to work through: you read it and
// you either leave it or you remove it.
//
// ⚠️ NO REPLY BUTTON, DELIBERATELY. `Review.tutorResponse` is the PROVIDER's
// answer and it is shown here as context; an admin writing into that column
// would put words in a provider's mouth on their own public profile. If a
// review needs an answer rather than a removal, the message tool on the user
// row is the honest way to ask its author for one.

import { useCallback, useEffect, useState } from 'react'
import { Icon } from '@/components/Icon'
import {
  TabHeader, SectionCard, RowList, AdminEmpty, AdminError, AdminLoading,
  AdminConfirmDialog, SubTabs, CopyBtn, OpenBtn, adminResult, fmtDT,
} from './_parts'
import { topicLabel } from '@/lib/requests'

type Row = {
  id: string
  rating: number
  body: string
  anonymous: boolean
  authorName: string | null
  authorEmail: string | null
  providerName: string | null
  providerUserId: string | null
  topic: string | null
  publicRef: string | null
  priceGel: number | null
  response: string | null
  respondedAt: string | null
  createdAt: string
}
type Counts = { total: number; low: number; unanswered: number }
type Filter = 'all' | 'low'

/** Five glyphs, and the number beside them for anybody who counts rather than
 *  looks. A rating is the one field here an operator scans rather than reads. */
const Stars = ({ n }: { n: number }) => (
  <span className="inline-flex items-center gap-1" aria-label={`${n} ვარსკვლავი`}>
    <span className="inline-flex" aria-hidden>
      {[1, 2, 3, 4, 5].map(i => (
        <Icon.star
          key={i}
          className={`w-3.5 h-3.5 ${i <= n ? 'text-warning-500' : 'text-ink-200'}`}
        />
      ))}
    </span>
    <span className="font-display text-small font-bold text-ink-900 tabular-nums">{n}</span>
  </span>
)

export const ReviewsSection = () => {
  const [filter, setFilter] = useState<Filter>('all')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, setPending] = useState<Row | null>(null)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const load = useCallback(async () => {
    setErr(null)
    try {
      const res = await fetch(`/api/admin/reviews${filter === 'low' ? '?low=1' : ''}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('http ' + res.status)
      const j = await res.json()
      setRows(Array.isArray(j?.items) ? j.items : [])
      if (j?.counts) setCounts(j.counts)
    } catch {
      setRows(null)
      setErr('შეფასებების ჩატვირთვა ვერ მოხერხდა.')
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const remove = async (reason: string) => {
    if (!pending) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/reviews/${pending.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const r = await adminResult(res)
      if (!r.ok) { setErr(r.message ?? 'წაშლა ვერ მოხერხდა.'); return }
      setRows(prev => (prev ?? []).filter(x => x.id !== pending.id))
      setCounts(c => (c ? { ...c, total: Math.max(0, c.total - 1), low: pending.rating <= 2 ? Math.max(0, c.low - 1) : c.low } : c))
      setFlash('შეფასება წაიშალა. ჩანაწერი აუდიტშია.')
    } catch {
      setErr('წაშლა ვერ მოხერხდა.')
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  return (
    <>
      <TabHeader
        eyebrow="შეფასებები"
        title="რას წერენ"
        sub="ყველა შეფასება, ახლიდან ძველისკენ. წაშლა შეუქცევადია და აუდიტში ჩაიწერება მიზეზთან და ტექსტთან ერთად."
      />

      <SubTabs<Filter>
        value={filter}
        onChange={setFilter}
        tabs={[
          { id: 'all', label: 'ყველა', count: counts?.total },
          // The reason an operator opens this tab at all.
          { id: 'low', label: '1–2 ★', count: counts?.low },
        ]}
      />

      <div className="px-6 lg:px-8 py-6 space-y-5">
        {flash && (
          <div role="status" className="rounded-btn border border-brand-200 bg-brand-50 px-3 py-2.5 text-small text-brand-800">
            {flash}
          </div>
        )}
        {err && <AdminError message={err} onRetry={load} />}

        {rows === null && !err && <AdminLoading label="შეფასებები იტვირთება…" />}

        {rows !== null && rows.length === 0 && (
          <AdminEmpty
            ok
            text={filter === 'low' ? 'დაბალი შეფასება არ არის.' : 'შეფასება ჯერ არავის დაუწერია.'}
          />
        )}

        {rows !== null && rows.length > 0 && (
          <SectionCard
            eyebrow="სია"
            title={`${rows.length} შეფასება`}
            sub={counts ? `${counts.unanswered} მათგანს ექსპერტი არ უპასუხა.` : ''}
          >
            <RowList>
              {rows.map(r => (
                <div key={r.id} className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Stars n={r.rating} />
                        <span className="font-display text-small font-semibold text-ink-900">
                          {r.providerName ?? 'ექსპერტი წაშლილია'}
                        </span>
                        {r.topic && (
                          <span className="text-meta text-ink-500">{topicLabel(r.topic)}</span>
                        )}
                      </div>
                      <p className="mt-2 text-small text-ink-800 leading-[1.55] whitespace-pre-wrap break-words max-w-[70ch]">
                        {r.body}
                      </p>
                      <div className="mt-2 font-mono text-meta text-ink-500 flex items-center gap-2 flex-wrap">
                        {/* The author, always — moderation of anonymous text is
                            moderation of nobody. The flag says how the PUBLIC
                            page renders it, which is a different question. */}
                        <span>{r.authorName ?? 'ავტორი წაშლილია'}</span>
                        {r.anonymous && (
                          <span className="inline-flex items-center h-5 px-1.5 rounded-pill border border-ink-200 text-ink-600 font-display text-micro font-bold uppercase">
                            საჯაროდ ანონიმური
                          </span>
                        )}
                        <span>· {fmtDT(r.createdAt)}</span>
                        {r.priceGel != null && <span>· {r.priceGel}₾</span>}
                      </div>
                      {r.response && (
                        <div className="mt-3 pl-3 border-l-2 border-ink-200">
                          <div className="font-display text-micro font-semibold uppercase text-ink-500">ექსპერტის პასუხი</div>
                          <p className="mt-1 text-small text-ink-700 leading-[1.55] whitespace-pre-wrap break-words max-w-[70ch]">{r.response}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {r.authorEmail && <CopyBtn value={r.authorEmail} label="ელფოსტა" />}
                      {r.providerUserId && <OpenBtn href={`/experts/${r.providerUserId}`} label="პროფილი" />}
                      <button
                        type="button"
                        onClick={() => { setFlash(null); setPending(r) }}
                        className="h-9 px-3 rounded-btn border border-danger-200 bg-white hover:bg-danger-50 text-danger-700 font-display text-small font-semibold inline-flex items-center transition-colors duration-fast"
                      >
                        წაშლა
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </RowList>
          </SectionCard>
        )}
      </div>

      <AdminConfirmDialog
        open={pending !== null}
        title="შეფასების წაშლა"
        tone="danger"
        confirmLabel="წაშალე"
        reason="required"
        reasonLabel="მიზეზი"
        reasonPlaceholder="რატომ ქრება ეს შეფასება — ერთი წინადადება."
        body={
          pending && (
            <>
              <span className="font-display font-semibold">{pending.rating} ★</span>{' '}
              „{pending.body.slice(0, 140)}{pending.body.length > 140 ? '…' : ''}“
              <br />
              წაშლა შეუქცევადია. ტექსტი და მიზეზი აუდიტში რჩება, თავად შეფასება კი
              ექსპერტის პროფილიდან და საშუალო ქულიდან მაშინვე ქრება.
            </>
          )
        }
        onConfirm={remove}
        onCancel={() => setPending(null)}
        busy={busy}
      />
    </>
  )
}

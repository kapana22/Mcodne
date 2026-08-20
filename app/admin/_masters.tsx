'use client'
// ადმინი → „ხელოსნები" — the queue that decides whether the services side exists.
//
// ⚠️ THIS IS A SUPPLY QUEUE, NOT A MODERATION QUEUE, and the difference shows in
// what the screen puts first. „განაცხადები" reviews credentials and its job is
// to keep people OUT. This one's job is to get people IN: every row that sits
// here unopened is a trade nobody can be routed to, and the client-side symptom
// is a request that gets no offers — which reads to that client as a dead site,
// not as an admin who was busy.
//
// So the row leads with the two facts that decide it — what they do and where —
// and the blockers are stated on the row rather than discovered after clicking
// „დამტკიცება" and getting a 400.
//
// ⚠️ THE PHOTOS LOAD PER OPENED ROW. The list endpoint omits them because they
// are base64 columns; see app/api/admin/master-applications for the arithmetic.

import { useCallback, useEffect, useState } from 'react'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import {
  TabHeader, RowList, AdminEmpty, AdminError, AdminLoading, fmtDT,
} from './_parts'
import { MASTER_KIND_LABEL, type MasterKind } from '@/lib/masterApplication'

type Row = {
  id: string; kind: MasterKind; fullName: string; companyName: string | null
  phone: string; email: string
  services: string[]; areas: string[]; yearsExp: number | null
  status: string; createdAt: string
}

type Detail = {
  about: string; photoUrl: string | null; workPhotos: string[]
  calloutFee: number | null; priceFrom: number | null
  taxId: string | null; moderatorNote: string | null
}

const STATUSES = [
  { id: 'SUBMITTED', l: 'ახალი' },
  { id: 'NEEDS_REVISION', l: 'დასაბრუნებელი' },
  { id: 'APPROVED', l: 'დამტკიცებული' },
  { id: 'REJECTED', l: 'უარყოფილი' },
] as const

export function MastersSection({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState<string>('SUBMITTED')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [failed, setFailed] = useState(false)

  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailFailed, setDetailFailed] = useState(false)
  const [blockers, setBlockers] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setRows(null); setFailed(false)
    try {
      // ⚠️ `no-store`, and it is not boilerplate. This list is re-read straight
      // after an approval, and a browser-cached copy would redraw the row the
      // admin just decided — see tests/adminNav.test.ts for the panel this
      // already happened to.
      const res = await fetch(`/api/admin/master-applications?status=${status}`, { cache: 'no-store' })
      const d = await res.json()
      if (!d?.ok) { setFailed(true); return }
      setRows(d.rows); setCounts(d.counts ?? {})
    } catch { setFailed(true) }
  }, [status])

  useEffect(() => { void load() }, [load])

  async function open(id: string) {
    if (openId === id) { setOpenId(null); setDetail(null); return }
    setOpenId(id); setDetail(null); setBlockers([]); setNote(''); setErr(null); setDetailFailed(false)
    try {
      const res = await fetch(`/api/master-applications/${id}`, { cache: 'no-store' })
      const d = await res.json()
      // ⚠️ THE FAILURE BRANCH USED TO BE AN EMPTY `catch` (2026-08-18), so a
      // failed detail load left `detail` null forever — and null is what the
      // LOADING state renders. The reviewer watched a spinner that would never
      // resolve, with no error and no retry, while every other branch in this
      // file already had an `AdminError`. Silence that looks like progress is
      // the worst of the three states.
      if (d?.ok) { setDetail(d.application); setBlockers(d.blockers ?? []) }
      else setDetailFailed(true)
    } catch { setDetailFailed(true) }
  }

  async function act(id: string, action: 'approve' | 'revise' | 'reject') {
    if (busy) return
    if (action !== 'approve' && !note.trim()) {
      setErr('დაწერე მიზეზი — განმცხადებელი ამას ხედავს.')
      return
    }
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/master-applications/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, note: note.trim() }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok || !d?.ok) {
        setErr(d?.message || (d?.error === 'ALREADY_APPROVED' ? 'უკვე დამტკიცებულია.' : 'ვერ შესრულდა.'))
        setBusy(false)
        return
      }
      setOpenId(null); setDetail(null); setBusy(false)
      onChanged?.()
      void load()
    } catch {
      setErr('ვერ შესრულდა.'); setBusy(false)
    }
  }

  return (
    <>
      <TabHeader
        eyebrow="სერვისები"
        title="სერვისის განაცხადები"
        sub="ვინც განაცხადი შემოიტანა. დამტკიცება ერთდროულად რთავს წვდომას და ქმნის პროფილს — მოთხოვნები მაშინვე იწყებს მისვლას."
      />

      <div className="px-6 lg:px-8 py-6">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map(s => (
            <button
              key={s.id}
              type="button"
              aria-pressed={status === s.id}
              onClick={() => { setStatus(s.id); setOpenId(null) }}
              className={`h-11 px-4 rounded-pill border font-display text-small font-semibold transition-[background-color,border-color] duration-fast ${
                status === s.id ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-ink-200 text-ink-700 hover:border-ink-300 hover:bg-ink-50'
              }`}
            >
              {s.l}
              {counts[s.id] != null && <span className="ml-1.5 tabular-nums opacity-70">{counts[s.id]}</span>}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {failed ? <AdminError onRetry={() => void load()} />
            : rows === null ? <AdminLoading />
            : rows.length === 0 ? <AdminEmpty text="ამ სტატუსში არავინ არის." />
            : (
              <RowList>
                {rows.map(r => (
                  <div key={r.id}>
                    <button
                      type="button"
                      onClick={() => void open(r.id)}
                      className="w-full text-left px-5 py-4 hover:bg-ink-50 transition-colors duration-fast"
                    >
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-display text-body font-semibold text-ink-900">
                          {r.companyName || r.fullName}
                        </span>
                        <span className="text-meta text-ink-500">{MASTER_KIND_LABEL[r.kind]}</span>
                        {r.yearsExp != null && <span className="text-meta text-ink-500">{r.yearsExp} წელი</span>}
                        <span className="ml-auto text-meta text-ink-400">{fmtDT(r.createdAt)}</span>
                      </div>
                      {/* The two facts the decision is actually made on. */}
                      <p className="mt-1 text-small text-ink-700">{r.services.join(' · ')}</p>
                      <p className="mt-0.5 text-meta text-ink-500">
                        {r.areas.join(', ')} · {r.phone} · {r.email}
                      </p>
                    </button>

                    {openId === r.id && (
                      <div className="px-5 pb-5 bg-ink-50/60">
                        {detailFailed ? (
                          <AdminError onRetry={() => { setOpenId(null); void open(r.id) }} />
                        ) : detail === null ? <AdminLoading inset /> : (
                          <>
                            {detail.photoUrl && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={detail.photoUrl} alt="" className="w-24 h-24 rounded-full object-cover ring-2 ring-ink-200" />
                            )}
                            <p className="mt-3 text-body text-ink-800 leading-relaxed whitespace-pre-wrap">{detail.about}</p>
                            {(detail.calloutFee != null || detail.priceFrom != null) && (
                              <p className="mt-2 text-small text-ink-600">
                                {detail.calloutFee != null && `გამოძახება ${detail.calloutFee}₾`}
                                {detail.calloutFee != null && detail.priceFrom != null && ' · '}
                                {detail.priceFrom != null && `სამუშაო ${detail.priceFrom}₾-დან`}
                              </p>
                            )}
                            {detail.taxId && <p className="mt-1 text-meta text-ink-500">ს/კ {detail.taxId}</p>}
                            {detail.workPhotos.length > 0 && (
                              <div className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-2">
                                {detail.workPhotos.map((u, i) => (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img key={i} src={u} alt="" className="aspect-square w-full object-cover rounded-card border border-ink-200" />
                                ))}
                              </div>
                            )}

                            {/* ⚠️ SAID BEFORE THE BUTTON, not after a 400. The
                                endpoint refuses an approval that would create a
                                master nobody can route to — the reviewer should
                                know that while they still have the row open. */}
                            {/* ⚠️ A COMPANY APPLICATION IS APPROVED AS A
                                PERSON, and the reviewer has to know before they
                                press the button (2026-08-18). Approval creates
                                a `ServiceProfile` on `userId`, never on
                                `companyId` — minting a Company row from a form
                                field would put an unverified entity into the
                                billing model. So the firm is listed under its
                                contact person's name with no „ფირმა" badge
                                until an admin attaches a real company in
                                ადმინი → წვდომა. Said here rather than left to
                                be noticed on the public page. */}
                            {r.kind === 'COMPANY' && (
                              <p className="mt-3 text-small text-ink-600 inline-flex items-center gap-1.5">
                                <Icon.warn className="w-4 h-4 shrink-0 text-ink-400" />
                                კომპანიად დარეგისტრირდა — დამტკიცების შემდეგ სიაში პიროვნების სახელით გამოჩნდება, სანამ კომპანიას არ მიაბამ.
                              </p>
                            )}

                            {blockers.length > 0 && (
                              <p className="mt-4 text-small text-warning-700 inline-flex items-center gap-1.5">
                                <Icon.warn className="w-4 h-4 shrink-0" />
                                დამტკიცებამდე: {blockers.join(' · ')}
                              </p>
                            )}

                            {r.status !== 'APPROVED' && (
                              <>
                                <textarea
                                  rows={2}
                                  value={note}
                                  onChange={e => setNote(e.target.value)}
                                  placeholder="მიზეზი — განმცხადებელი ამას ხედავს"
                                  className="mt-4 w-full px-3.5 py-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 placeholder-ink-400 focus:border-brand-500 outline-none resize-y transition-colors duration-fast"
                                />
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <Btn onClick={() => void act(r.id, 'approve')} disabled={busy || blockers.length > 0}>
                                    დამტკიცება
                                  </Btn>
                                  <Btn variant="secondary" onClick={() => void act(r.id, 'revise')} disabled={busy}>
                                    დასაბრუნებლად
                                  </Btn>
                                  <Btn variant="danger" onClick={() => void act(r.id, 'reject')} disabled={busy}>
                                    უარყოფა
                                  </Btn>
                                </div>
                              </>
                            )}
                            {detail.moderatorNote && (
                              <p className="mt-3 text-meta text-ink-500">ბოლო კომენტარი: {detail.moderatorNote}</p>
                            )}
                            {err && <p className="mt-2 text-small text-danger-700">{err}</p>}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </RowList>
            )}
        </div>
      </div>
    </>
  )
}

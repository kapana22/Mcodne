'use client'
// ადმინი → „მოთხოვნები" — the verification queue.
//
// MASTER–DETAIL, because the job is a phone call. The left column is the queue
// — enough per row to pick who to call next, nothing more. The right column is
// the ONE request being worked: the number first, the description under it, the
// note you type while talking, the decision buttons after hanging up — and,
// beside all that, the experts already filed under the request's sphere,
// because „who do I tell about this" is the operator's very next question after
// „is it real". The first version rendered every request fully expanded in one
// list; at ten requests it was a wall, and the wall is why queues stop being
// worked.
//
// Nothing here is automatic and nothing should become automatic — „verified" is
// a claim that a human spoke to somebody, and the moment it can be reached
// without one it stops meaning anything.
//
// ⚠️ THIS IS THE ONE SURFACE THAT SHOWS CONTACT DETAILS. Every other reader —
// provider or client — goes through the shaping functions in lib/requests,
// which cannot emit those columns at all. If a field appears here that also
// appears on a provider screen, one of the two is wrong.
//
// The tab renders at all only when requestsFeatureExists() — see _nav.tsx. This
// file therefore assumes it is allowed to be on screen and does not re-check;
// its APIs check for themselves regardless.

import { useCallback, useEffect, useState } from 'react'
import { Btn } from '@/components/Btn'
import { Card } from '@/components/Card'
import { RequestChat } from '@/components/RequestChat'
import {
  TabHeader, RowList, AdminEmpty, AdminError, AdminLoading, CopyBtn, OpenBtn,
  downloadCsv, fmtDT,
} from './_parts'
import {
  STATUS_LABEL, OFFER_STATUS_LABEL, REQUEST_STATUSES,
  KIND, kindOf, budgetLabel, timingLabel, formatLabel, cityLabel, topicLabel,
  extrasLabels, gel, offerPriceLabel,
  type RequestStatusName, type OfferStatusName,
} from '@/lib/requests'

type Offer = {
  id: string; priceGel: number; priceKind: string; daysEstimate: number | null; message: string
  status: string; createdAt: string; providerKind: string
  expertUser: { id: string; fullName: string; email: string; phone: string | null } | null
  company: { id: string; name: string } | null
}
type Req = {
  id: string; publicRef: string; description: string
  kind: string; topic: string
  budgetMin: number; budgetMax: number | null; budgetUnit: string
  timing: string; format: string; city: string; details: unknown
  contactName: string; phone: string; email: string | null
  status: string; adminNote: string | null
  offerLimit: number; offerCount: number
  verifiedAt: string | null; createdAt: string
  category: { id: string; name: string } | null
  user: { id: string; fullName: string; email: string } | null
  offers: Offer[]
}
type Notified = { id: string; name: string; email: string; at: string }
type RosterExpert = { id: string; name: string; email: string; categoryId: string | null }
type Candidate = {
  id: string; slug: string | null; verified: boolean; rating: number
  user: { fullName: string; email: string }
}

const INPUT =
  'w-full h-11 px-3.5 rounded-field border border-ink-200 bg-white text-body text-ink-900 ' +
  'placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none ' +
  'transition-colors duration-fast'

/** Server codes → Georgian. Never show a reader a raw code. */
function errText(code?: string): string {
  switch (code) {
    // The database refuses offerCount > offerLimit, so lowering the limit past
    // what has already arrived is a real conflict rather than a validation slip.
    case 'LIMIT_BELOW_RECEIVED': return 'უკვე მეტი შეთავაზებაა მიღებული — ლიმიტს ვერ დაწევ.'
    case 'NOTHING_TO_DO': return 'არაფერი შეცვლილა.'
    case 'INVALID': return 'შეავსე ველები სწორად.'
    case 'NOT_FOUND': return 'ვერ მოიძებნა.'
    // Somebody else changed the row between reading it and this click (D4).
    case 'CHANGED': return 'ეს მოთხოვნა ახლახან შეიცვალა — განაახლე გვერდი.'
    default: return 'ვერ შესრულდა — სცადე თავიდან.'
  }
}

/** The request's whole shape in one line — the same words every other surface
 *  uses, from the same functions, so the admin never reads a different label
 *  than the provider saw. */
function metaLine(r: Req): string {
  const kind = kindOf(r.kind)
  const parts = [
    KIND[kind].label,
    budgetLabel(kind, r.budgetMin, r.budgetMax),
    timingLabel(kind, r.timing),
    // The clarifying answers — the operator reads the same words the provider
    // and the client do, from the same function.
    ...extrasLabels(kind, r.topic, r.details).map(e => `${e.label}: ${e.value}`),
    formatLabel(r.format),
  ]
  if (r.format !== 'ONLINE') parts.push(cityLabel(r.city))
  return parts.join(' · ')
}

/* ───── Detail: the request being worked ───── */

function RequestDetail({ r, candidates, notified, experts, onChanged }: {
  r: Req
  candidates: Candidate[]
  /** Who this request actually reached, from Notification rows. */
  notified: Notified[]
  /** The whole hand-maintained allowlist, for the manual send. */
  experts: RosterExpert[]
  onChanged: () => void
}) {
  /** Ids ticked for a manual send. Empty means „use the routing rules" — the
   *  endpoint distinguishes an omitted list from an empty one, and so does
   *  this: `send()` only passes a list when something is ticked. */
  const [picked, setPicked] = useState<string[]>([])
  const [sendMsg, setSendMsg] = useState<string | null>(null)
  const [note, setNote] = useState(r.adminNote ?? '')
  /** Set only while this request belongs to ONE named provider: the invite
   *  writes an INVITED offer and drops the limit to 1 in the same breath
   *  (app/api/requests), so the pair is the state — neither half alone is. */
  const addressedTo = r.offerLimit === 1
    ? r.offers.find(o => o.status === 'INVITED')?.expertUser?.fullName
      ?? r.offers.find(o => o.status === 'INVITED')?.company?.name
      ?? null
    : null
  const [limit, setLimit] = useState(String(r.offerLimit))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // The draft belongs to ONE request: selecting another must show ITS note, not
  // the previous row's unsaved text. Keyed on the id at the call site would
  // remount and lose scroll; syncing on id change keeps both.
  useEffect(() => {
    setNote(r.adminNote ?? '')
    setLimit(String(r.offerLimit))
    setErr(null)
    setPicked([])
    setSendMsg(null)
  }, [r.id, r.adminNote, r.offerLimit])

  /**
   * Tell providers about this request, now, on purpose.
   *
   * ⚠️ REPEATABLE BY DESIGN. Sending used to be a side effect of verifying, so
   * it happened once at a moment nobody chose. This can be pressed again — to
   * reach somebody who joined the allowlist afterwards, or to send one request
   * to every chemistry teacher deliberately.
   */
  const send = async () => {
    setBusy(true); setErr(null); setSendMsg(null)
    try {
      const res = await fetch(`/api/admin/requests/${r.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Only when something is ticked: an empty array would mean „send to
        // nobody" and silently do nothing.
        body: JSON.stringify(picked.length ? { userIds: picked } : {}),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) {
        setErr(j?.error === 'NOT_VERIFIED' ? 'ჯერ დაამოწმე.' : errText(j?.error))
        return
      }
      setSendMsg(`გაიგზავნა ${j.sent} ადამიანთან.`)
      setPicked([])
      onChanged()
    } catch {
      setErr(errText())
    } finally {
      setBusy(false)
    }
  }

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/admin/requests/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) { setErr(errText(j?.error)); if (j?.error === 'CHANGED') onChanged(); return }
      onChanged()
    } catch {
      setErr(errText())
    } finally {
      setBusy(false)
    }
  }

  const limitN = Number(limit)
  const limitChanged = Number.isInteger(limitN) && limitN >= 1 && limitN <= 20 && limitN !== r.offerLimit
  const noteChanged = (note.trim() || null) !== (r.adminNote ?? null)
  const draft = {
    ...(noteChanged ? { adminNote: note.trim() || null } : {}),
    ...(limitChanged ? { offerLimit: limitN } : {}),
  }

  return (
    <div className="grid xl:grid-cols-[1fr_280px] gap-5 items-start">
      <div className="rounded-card border border-ink-200 bg-white">
        {/* ── who to call — the reason this panel exists ── */}
        <div className="p-5 border-b border-ink-100">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="font-display text-h3 font-bold text-ink-900">{r.contactName}</span>
            <span className="text-meta text-ink-500 tabular-nums">{r.publicRef} · {fmtDT(r.createdAt)}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <a href={`tel:${r.phone}`} className="text-body font-semibold text-brand-700 underline underline-offset-2 tabular-nums">
              {r.phone}
            </a>
            <CopyBtn value={r.phone} />
            {r.email && (
              <a href={`mailto:${r.email}`} className="text-small text-ink-600 underline underline-offset-2">{r.email}</a>
            )}
            {r.user && <span className="text-meta text-ink-500">ანგარიში: {r.user.email}</span>}
          </div>
        </div>

        {/* ── what they asked for ── */}
        <div className="p-5 border-b border-ink-100">
          <div className="font-display text-small font-semibold text-ink-900">{topicLabel(r.topic)}</div>
          <p className="mt-1 text-meta text-ink-600">{metaLine(r)}</p>
          {r.description
            ? <p className="mt-3 text-body text-ink-800 whitespace-pre-wrap leading-relaxed">{r.description}</p>
            : <p className="mt-3 text-small text-ink-500">აღწერა არ დაუწერია — დეტალები ზარზე.</p>}
        </div>

        {/* ── the call's paperwork ── */}
        <div className="p-5">
          <label className="block">
            <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">შენიშვნა</span>
            <textarea
              rows={3} maxLength={4000} value={note} onChange={e => setNote(e.target.value)}
              className="w-full px-3.5 py-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none resize-y transition-colors duration-fast"
              placeholder="ვისთან ვისაუბრე, რა უნდა"
            />
          </label>

          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">ლიმიტი</span>
              <input
                type="number" min={1} max={20} step={1} inputMode="numeric"
                value={limit} onChange={e => setLimit(e.target.value)}
                className={`${INPUT} w-24`}
              />
            </label>

            <Btn variant="secondary" disabled={busy || (!noteChanged && !limitChanged)} onClick={() => patch(draft)}>
              შენახვა
            </Btn>

            {/* The three decisions. „დამოწმება" is primary because it is the
                one that lets work happen; the other two are exits. Unsaved
                note/limit edits travel WITH the decision, so „type the note,
                press დამოწმება" is one action, not a lost draft. */}
            {r.status !== 'VERIFIED' && (
              <Btn disabled={busy} onClick={() => patch({ status: 'VERIFIED', ...draft })}>
                დამოწმება
              </Btn>
            )}
            {r.status !== 'REJECTED' && (
              <Btn variant="danger" disabled={busy} onClick={() => patch({ status: 'REJECTED', ...draft })}>
                უარყოფა
              </Btn>
            )}
            {r.status !== 'CLOSED' && (
              <Btn variant="ghost" disabled={busy} onClick={() => patch({ status: 'CLOSED', ...draft })}>
                დახურვა
              </Btn>
            )}
          </div>

          {err && <AdminError message={err} className="mt-3" />}
        </div>

        {/* ⚠️ ADDRESSED TO ONE PERSON — THE OPERATOR HAS TO KNOW (2026-08-20).
            A client who ordered from somebody's profile gets a request that is
            CLOSED to everybody else (`offerLimit: 1`, app/api/requests). This
            panel showed that state as „0/1" in the offers header — a number an
            operator reads as „nobody has bid yet", not as „this person chose
            somebody". And the operator PHONES every request: they would promise
            three offers on a request that is deliberately private, and the
            field below lets them raise the limit and silently undo the client's
            choice without ever seeing it.
            Owner's rule, 2026-08-20: „თუ მცოდნესთან აგზავნის, მხოლოდ
            მცოდნესთან უნდა მივიდეს." So it is said in words, above the fold,
            before the note field and the limit field it explains. */}
        {addressedTo && (
          <div className="mx-5 mb-5 -mt-1 px-3 py-2 rounded-field border border-brand-200 bg-brand-50/60">
            <p className="text-small text-ink-900">
              მისამართულია <span className="font-display font-bold">{addressedTo}</span>-სთან — სხვა ვერავინ ხედავს.
            </p>
            <p className="mt-0.5 text-meta text-ink-600">
              კლიენტმა ეს ადამიანი თვითონ აირჩია. ლიმიტის აწევა მოთხოვნას სხვებისთვისაც გახსნის.
            </p>
          </div>
        )}

        {/* ── the offers, when there are any ── */}
        {r.offers.length > 0 && (
          <div className="p-5 border-t border-ink-100 space-y-4">
            <div className="font-display text-micro font-semibold uppercase text-ink-500">
              შეთავაზებები · <span className="tabular-nums">{r.offerCount}/{r.offerLimit}</span>
            </div>
            {r.offers.map(o => (
              <div key={o.id}>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-body font-display font-semibold text-ink-900">
                    {o.expertUser?.fullName ?? o.company?.name ?? '—'}
                  </span>
                  <span className="text-body text-ink-900 tabular-nums">{offerPriceLabel(o.priceGel, o.priceKind)}</span>
                  <span className="text-meta text-ink-500">
                    {OFFER_STATUS_LABEL[o.status as OfferStatusName]}
                    {o.daysEstimate ? ` · ${o.daysEstimate} დღე` : ''}
                    {' · '}{fmtDT(o.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-small text-ink-700 whitespace-pre-wrap leading-relaxed">{o.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── WHO WAS ACTUALLY TOLD, AND SENDING TO MORE ────────────────────
          Owner, 2026-08-18: „ადმინ პანელშიც ჩანდეს ვისთან რა მივიდა."

          ⚠️ THE LIST IS HISTORY, NOT A PREDICTION. It is read from the
          notifications that were written at the time, so it keeps saying who
          was told even after the allowlist changes underneath it — which is the
          only version of this that can be debugged.

          Sending is separate from verifying and can be run again: tick nobody
          to use the routing rules, or tick people to send exactly there. */}
      <Card className="xl:col-start-2" as="aside">
        <div className="font-display text-micro font-semibold uppercase text-ink-500">
          ვის მიუვიდა <span className="tabular-nums">· {notified.length}</span>
        </div>

        {notified.length === 0 ? (
          <p className="mt-3 text-small text-ink-600">ჯერ არავის.</p>
        ) : (
          <div className="mt-3 divide-y divide-ink-100">
            {notified.map(n => (
              <div key={`${n.id}:${n.at}`} className="py-2">
                <div className="text-small text-ink-900">{n.name}</div>
                <div className="text-meta text-ink-500">{n.email} · {fmtDT(n.at)}</div>
              </div>
            ))}
          </div>
        )}

        {r.status === 'VERIFIED' && (
          <div className="mt-4 pt-4 border-t border-ink-100">
            <div className="font-display text-micro font-semibold uppercase text-ink-500">
              გაგზავნა
            </div>
            {experts.length === 0 ? (
              <p className="mt-2 text-small text-ink-600">allowlist ცარიელია.</p>
            ) : (
              <>
                <div className="mt-2 max-h-56 overflow-y-auto divide-y divide-ink-100">
                  {experts.map(e => (
                    <label key={e.id} className="py-2 flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={picked.includes(e.id)}
                        onChange={ev => setPicked(p => ev.target.checked
                          ? [...p, e.id]
                          : p.filter(x => x !== e.id))}
                        className="mt-1 w-4 h-4 accent-brand-600 shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="block text-small text-ink-900 truncate">{e.name}</span>
                        <span className="block text-meta text-ink-500 truncate">{e.email}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-meta text-ink-500">
                  {picked.length === 0
                    ? 'არავინ არ არის მონიშნული — გაიგზავნება წესების მიხედვით.'
                    : `მონიშნულია ${picked.length}.`}
                </p>
                <div className="mt-3">
                  <Btn size="sm" onClick={send} disabled={busy} aria-busy={busy}>
                    {busy ? 'იგზავნება…' : 'გაგზავნა'}
                  </Btn>
                </div>
                {sendMsg && <p className="mt-2 text-small text-brand-700">{sendMsg}</p>}
              </>
            )}
          </div>
        )}
      </Card>

      {/* ── the right rail: who could do this ─────────────────────────────
          The experts already filed under the request's sphere — the operator's
          next question after „is it real" is „who do I tell". Empty is an
          ANSWER, not a gap: it means the platform has nobody for what this
          person asked, which is the demand signal this subsystem exists to
          collect. */}
      <aside className="rounded-card border border-ink-200 bg-white p-5">
        <div className="font-display text-micro font-semibold uppercase text-ink-500">
          ექსპერტები {r.category ? `· ${r.category.name}` : ''}
        </div>
        {candidates.length === 0 ? (
          <p className="mt-3 text-small text-ink-600">
            {r.category
              ? 'ამ კატეგორიაში აქტიური ექსპერტი არ არის.'
              : 'ეს თემა ჯერ არცერთ კატეგორიას არ უკავშირდება — ამაზე ექსპერტი არ გვყავს.'}
          </p>
        ) : (
          <div className="mt-3 divide-y divide-ink-100">
            {candidates.map(c => (
              <div key={c.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-small font-display font-semibold text-ink-900 truncate">
                    {c.user.fullName}
                    {c.verified && <span className="ml-1.5 text-brand-700">✓</span>}
                  </div>
                  <div className="text-meta text-ink-500 truncate">{c.user.email}</div>
                </div>
                <OpenBtn href={`/experts/${c.slug ?? c.id}`} label="ნახვა" />
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* ── The client, talking to us ────────────────────────────────────────
          The operator's half of the thread the client sees on their own page
          (lib/requestThread). It sits in the detail rather than in a separate
          inbox on purpose: answering „და 300₾-ზე?" needs the budget, the topic
          and the admin note that are already on this screen, and an inbox
          somewhere else would have meant reading the request twice.

          Addressed by `requestId` — the operator has no reference and needs
          none; their ADMIN session is the key. Contacts are NOT masked here,
          which is why this pane must never be shown to an allowlisted provider:
          the endpoint refuses them, and this screen is admin-only anyway. */}
      <div className="lg:col-span-2 rounded-card border border-ink-200 bg-white p-5">
        <RequestChat
          thread={{ kind: 'PLATFORM', requestId: r.id }}
          defaultOpen
          peerName={r.contactName ?? 'კლიენტი'}
          emptyHint="კლიენტს ჯერ არაფერი დაუწერია."
        />
      </div>
    </div>
  )
}

/* ───── The tab ───── */

export function RequestsSection({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<Req[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [candidatesByCategory, setCandidatesByCategory] = useState<Record<string, Candidate[]>>({})
  /** Offer lifecycle totals — see lib/offerEvents. The ratio here is what the
   *  first real lead price will be set from. */
  const [funnel, setFunnel] = useState<Record<string, number>>({})
  /** Who each request actually reached — read from Notification rows, never
   *  recomputed from the routing rules. See the API for why. */
  const [notifiedByRequest, setNotifiedByRequest] = useState<Record<string, Notified[]>>({})
  /** The whole hand-maintained allowlist, for the manual picker. */
  const [experts, setExperts] = useState<RosterExpert[]>([])
  const [filter, setFilter] = useState<'' | RequestStatusName>('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setErr(null)
    try {
      // `no-store` — an admin screen that can be stale is an admin screen that
      // cannot be trusted (pinned by tests/adminNav).
      const r = await fetch(`/api/admin/requests${filter ? `?status=${filter}` : ''}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j?.error)
      setRows(j.requests)
      setCounts(j.counts ?? {})
      setCandidatesByCategory(j.candidatesByCategory ?? {})
      setFunnel(j.funnel ?? {})
      setNotifiedByRequest(j.notifiedByRequest ?? {})
      setExperts(j.experts ?? [])
    } catch (e: any) {
      setErr(errText(e?.message))
    }
  }, [filter])
  useEffect(() => { load() }, [load])

  const exportCsv = () => {
    if (!rows) return
    downloadCsv('requests.csv', [
      ['კოდი', 'სტატუსი', 'ტიპი', 'თემა', 'ბიუჯეტი', 'ვადა', 'ფორმატი', 'ქალაქი', 'სახელი', 'ტელეფონი', 'ელფოსტა', 'შეთავაზება', 'ლიმიტი', 'შენიშვნა', 'აღწერა', 'შექმნილია'],
      ...rows.map(r => {
        const kind = kindOf(r.kind)
        return [
          r.publicRef,
          STATUS_LABEL[r.status as RequestStatusName],
          KIND[kind].label,
          topicLabel(r.topic),
          budgetLabel(kind, r.budgetMin, r.budgetMax),
          timingLabel(kind, r.timing),
          formatLabel(r.format),
          cityLabel(r.city),
          r.contactName, r.phone, r.email ?? '',
          r.offerCount, r.offerLimit,
          r.adminNote ?? '',
          r.description,
          r.createdAt,
        ]
      }),
    ])
  }

  // The selection survives a reload (the row object is replaced, the id is
  // not); a filter that removes the selected row simply deselects.
  const selected = rows?.find(r => r.id === selectedId) ?? null

  return (
    <>
      <TabHeader
        eyebrow="მოთხოვნები"
        title="მოთხოვნები"
        sub="დაურეკე, გადაამოწმე, დაამოწმე. დამოწმებულს ექსპერტები ხედავენ."
        actions={<Btn variant="secondary" size="sm" onClick={exportCsv} disabled={!rows?.length}>CSV ექსპორტი</Btn>}
      />

      <div className="px-6 lg:px-8 py-6">
        {/* The filter. „ყველა" first and selected by default: the queue's whole
            value is that unhandled rows float to the top of it, and a default
            filter would hide the ones nobody has looked at. */}
        <div role="group" aria-label="სტატუსი" className="flex flex-wrap gap-2">
          {([['', 'ყველა'], ...REQUEST_STATUSES.map(s => [s, STATUS_LABEL[s]] as const)] as [string, string][]).map(([v, l]) => (
            <button
              key={v || 'all'}
              type="button"
              aria-pressed={filter === v}
              onClick={() => setFilter(v as '' | RequestStatusName)}
              className={`h-11 px-4 rounded-btn font-display text-small font-semibold border transition-colors duration-fast ${
                filter === v ? 'bg-ink-900 text-white border-ink-900' : 'bg-white text-ink-700 border-ink-200 hover:bg-ink-50'
              }`}
            >
              {l}
              {v && counts[v] ? <span className="ml-1.5 tabular-nums text-ink-400">{counts[v]}</span> : null}
            </button>
          ))}
        </div>

        {/* ── The offer funnel ────────────────────────────────────────────
            Shown here because it answers the one question this queue cannot:
            not „how many requests" but „does anybody on the other side ever
            look". Of the offers experts send, how many did a client open, and
            how many did they answer.

            ⚠️ THIS IS WHAT THE FIRST LEAD PRICE WILL BE SET FROM. The lead is
            0₾ today and will not stay that way; charging on „opened" before
            knowing what share ever opens is picking a number and finding out.
            Comparable platforms get told this ratio by their own angry experts
            (Bark's users measure ~44%); knowing it first is the difference
            between fixing routing and reading about it.

            Hidden until an offer exists — a funnel of zeros teaches nothing and
            reads as a broken widget. */}
        {(funnel.SENT ?? 0) > 0 && (
          // `<Card>` and not a hand-rolled shell: the same three classes
          // written out here would be a 202nd copy of the surface <Card>
          // exists to own, and tests/primitiveAdoption ratchets that count
          // downwards only.
          <Card padding="compact" className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
            {([
              ['გაგზავნილი', funnel.SENT ?? 0],
              ['გახსნილი', funnel.VIEWED ?? 0],
              ['პასუხი', funnel.REPLIED ?? 0],
              ['არჩეული', funnel.ACCEPTED ?? 0],
            ] as [string, number][]).map(([label, n]) => {
              const sent = funnel.SENT ?? 0
              // Share of SENT, so every column is read against the same base —
              // „opened" as a share of „delivered" would flatter us by hiding
              // the mail that never went.
              const pct = sent > 0 && label !== 'გაგზავნილი' ? Math.round((n / sent) * 100) : null
              return (
                <div key={label}>
                  <div className="text-meta text-ink-500">{label}</div>
                  <div className="font-display text-h3 font-bold text-ink-900 tabular-nums">
                    {n}
                    {pct !== null && <span className="ml-1.5 text-small font-semibold text-ink-500">{pct}%</span>}
                  </div>
                </div>
              )
            })}
          </Card>
        )}

        <div className="mt-5">
          {err && !rows ? <AdminError message={err} onRetry={load} />
            : !rows ? <AdminLoading />
            : rows.length === 0 ? <AdminEmpty text="ამ ფილტრში არაფერია." />
            : (
              <div className="grid lg:grid-cols-[360px_1fr] gap-5 items-start">
                {/* ── the queue ── */}
                <RowList>
                  {rows.map(r => {
                    const on = r.id === selectedId
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedId(r.id)}
                        aria-pressed={on}
                        className={`w-full text-left px-4 py-3.5 transition-colors duration-fast ${
                          on ? 'bg-ink-900 text-white' : 'hover:bg-ink-50'
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className={`font-display text-small font-semibold truncate ${on ? 'text-white' : 'text-ink-900'}`}>
                            {topicLabel(r.topic)}
                          </span>
                          <span className={`text-meta tabular-nums shrink-0 ${on ? 'text-white/70' : 'text-ink-400'}`}>
                            {r.publicRef}
                          </span>
                        </div>
                        <div className={`mt-0.5 text-meta ${on ? 'text-white/70' : 'text-ink-500'}`}>
                          {STATUS_LABEL[r.status as RequestStatusName]}
                          {' · '}{KIND[kindOf(r.kind)].label}
                          {' · '}<span className="tabular-nums">{r.offerCount}/{r.offerLimit}</span>
                          {' · '}{fmtDT(r.createdAt)}
                        </div>
                      </button>
                    )
                  })}
                </RowList>

                {/* ── the workbench ── */}
                {selected ? (
                  <RequestDetail
                    r={selected}
                    candidates={selected.category ? (candidatesByCategory[selected.category.id] ?? []) : []}
                    notified={notifiedByRequest[selected.id] ?? []}
                    experts={experts}
                    onChanged={() => { load(); onChanged?.() }}
                  />
                ) : (
                  <AdminEmpty text="აირჩიე მოთხოვნა სიიდან." />
                )}
              </div>
            )}
        </div>
      </div>
    </>
  )
}

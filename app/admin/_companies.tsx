'use client'
// ადმინი → „კომპანიები" — the B2B tab.
//
// ⚠️ IT HOLDS TWO DIFFERENT PRODUCTS, and they are easy to confuse because both
// are called „B2B" and both involve a company. Read the sub-tab order as the
// separation:
//
//   სერვისები + განაცხადები — WE SELL a consultation or a training at a price
//       we set. No expert, no calendar, no escrow: a request arrives, a price
//       is agreed, an invoice goes out (B2BService → BusinessLead). This is the
//       monetisation channel; the deal fields on a lead are where its money is
//       recorded.
//
//   ბალანსი — a company tops up and its members book ORDINARY EXPERTS with it
//       (Company.balance → Booking.paidBy = COMPANY_BALANCE). Nothing to do
//       with the catalogue above; it is the marketplace, paid differently.
//
// Do not merge the two into one narrative. „განაცხადები" is a QUEUE somebody is
// waiting at the other end of, „ბალანსი" is a ledger you open when you already
// know why. Deliberately not two sidebar entries, since the rail already
// carries sixteen.
//
// The tab renders at all only when b2bFeatureExists() — see _nav.tsx. This file
// therefore assumes it is allowed to be on screen and does not re-check.

import { useCallback, useEffect, useState } from 'react'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { fmtKaDateTime } from '@/lib/kaDate'
import { B2B_KINDS, kindLabel } from '@/lib/b2b'
import {
  TabHeader, SubTabs, SectionCard, RowList,
  AdminEmpty, AdminError, AdminLoading, CopyBtn, OpenBtn,
} from './_parts'

type Company = {
  id: string; name: string; taxId: string | null; balance: number
  status: 'ACTIVE' | 'SUSPENDED'; note: string | null; createdAt: string
  _count: { members: number; transactions: number }
}
type Member = {
  id: string; role: 'OWNER' | 'MEMBER'; createdAt: string
  user: { id: string; fullName: string; email: string; role: string }
}
type Txn = {
  id: string; type: 'TOPUP' | 'CHARGE'; amount: number; balanceAfter: number
  bookingId: string | null; actorId: string | null; note: string | null; createdAt: string
}
type Detail = Company & { members: Member[]; transactions: Txn[] }
type Lead = {
  id: string; companyName: string; taxId: string | null; contactName: string
  phone: string; email: string; interest: string | null; message: string | null
  status: 'NEW' | 'CONTACTED' | 'CLOSED'; createdAt: string
  agreedPrice: number | null; adminNote: string | null
  service: { id: string; kind: string; direction: string; title: string } | null
}
type Service = {
  id: string; kind: string; direction: string; title: string; description: string | null; format: string | null
  imageUrl: string | null
  priceGel: number; priceOnRequest: boolean; order: number; visible: boolean
  _count: { requests: number }
}

const GEL = (n: number) => `${n.toLocaleString('en-US')}₾`

const INPUT =
  'w-full h-11 px-3.5 rounded-field border border-ink-200 bg-white text-body text-ink-900 ' +
  'placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none ' +
  'transition-colors duration-fast'

/** Server codes → Georgian. Never show a reader a raw code. */
function errText(code?: string): string {
  switch (code) {
    case 'TAX_ID_TAKEN': return 'ეს საიდენტიფიკაციო კოდი უკვე გამოყენებულია.'
    case 'USER_NOT_FOUND': return 'ამ ელფოსტაზე ანგარიში არ არსებობს — ჯერ დარეგისტრირდეს.'
    case 'ADMIN_CANNOT_BE_MEMBER': return 'ადმინი ვერ იქნება კომპანიის წევრი — მოთხოვნის დატოვება ადმინს არ შეუძლია.'
    case 'USER_SUSPENDED': return 'ეს ანგარიში შეჩერებულია.'
    case 'ALREADY_MEMBER': return 'უკვე ამ კომპანიის წევრია.'
    case 'MEMBER_OF_ANOTHER': return 'უკვე სხვა კომპანიის წევრია.'
    case 'INSUFFICIENT': return 'ბალანსზე საკმარისი თანხა არ არის.'
    case 'NOT_FOUND': return 'ვერ მოიძებნა.'
    case 'INVALID': return 'შეავსე ველები სწორად.'
    default: return 'ვერ შესრულდა — სცადე თავიდან.'
  }
}

async function post(url: string, body: unknown, method: 'POST' | 'PATCH' | 'DELETE' = 'POST') {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'DELETE' ? undefined : JSON.stringify(body),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.ok) throw new Error(j?.error || 'ERROR')
  return j
}

/* ───── Companies ───── */

function CompanyDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [kind, setKind] = useState<'TOPUP' | 'CHARGE'>('TOPUP')
  const [email, setEmail] = useState('')

  const load = useCallback(async () => {
    setErr(null)
    try {
      const r = await fetch(`/api/admin/companies/${id}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j?.error)
      setD(j.company)
    } catch (e: any) { setErr(errText(e?.message)) }
  }, [id])
  useEffect(() => { load() }, [load])

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null)
    try { await fn(); await load(); onChanged() }
    catch (e: any) { setErr(errText(e?.message)) }
    finally { setBusy(false) }
  }

  if (err && !d) return <AdminError message={err} onRetry={load} />
  if (!d) return <AdminLoading />

  const amt = Number(amount)
  const amountOk = Number.isInteger(amt) && amt > 0 && amt <= 1_000_000
  const canSubmit = amountOk && note.trim().length >= 2 && !busy

  return (
    <div className="space-y-5">
      <SectionCard
        eyebrow="ბალანსი"
        title={GEL(d.balance)}
        sub={d.status === 'SUSPENDED'
          ? 'კომპანია გაყინულია — წევრები ვერ ხარჯავენ. თანხის დამატება მაინც შეიძლება.'
          : `${d._count.members} წევრი`}
      >
        <div className="grid sm:grid-cols-[130px_1fr_auto] gap-3 items-start">
          <select
            value={kind}
            onChange={e => setKind(e.target.value as 'TOPUP' | 'CHARGE')}
            className={INPUT}
          >
            <option value="TOPUP">ჩარიცხვა</option>
            <option value="CHARGE">ჩამოჭრა</option>
          </select>
          <div className="grid sm:grid-cols-[140px_1fr] gap-3">
            <input
              type="number" min={1} step={1} inputMode="numeric"
              value={amount} onChange={e => setAmount(e.target.value)}
              className={INPUT} placeholder="თანხა ₾"
            />
            {/* Required for BOTH directions: this is the only place the reason
                for a hand movement survives, and an optional field is empty
                exactly when somebody needs it. */}
            <input
              type="text" value={note} onChange={e => setNote(e.target.value)}
              className={INPUT} placeholder="კომენტარი — მაგ. გადმორიცხვა 11.08"
            />
          </div>
          <Btn
            disabled={!canSubmit} aria-busy={busy}
            onClick={() => act(async () => {
              await post(`/api/admin/companies/${d.id}/balance`, { type: kind, amount: amt, note: note.trim() })
              setAmount(''); setNote('')
            })}
          >
            {busy ? 'მიმდინარეობს…' : 'შესრულება'}
          </Btn>
        </div>
        {err && <div role="alert" className="mt-3 text-small text-danger-700">{err}</div>}
      </SectionCard>

      <SectionCard eyebrow="წევრები" title="ვინ ხარჯავს" sub="მხოლოდ არსებული ანგარიში — ერთი ადამიანი ერთ კომპანიაში.">
        <div className="grid sm:grid-cols-[1fr_auto] gap-3">
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            className={INPUT} placeholder="თანამშრომლის ელფოსტა"
          />
          <Btn
            variant="secondary" disabled={busy || !email.includes('@')}
            onClick={() => act(async () => {
              await post(`/api/admin/companies/${d.id}/members`, { email: email.trim(), role: 'MEMBER' })
              setEmail('')
            })}
          >
            დამატება
          </Btn>
        </div>
        <div className="mt-4">
          {d.members.length === 0
            ? <AdminEmpty text="წევრი ჯერ არავინაა." />
            : (
              <RowList>
                {d.members.map(m => (
                  <div key={m.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-small font-semibold text-ink-900 truncate">
                        {m.user.fullName}
                        {m.role === 'OWNER' && <span className="ml-2 text-micro uppercase text-ink-500">მთავარი</span>}
                      </div>
                      <div className="text-meta text-ink-500 truncate">{m.user.email}</div>
                    </div>
                    <button
                      type="button" disabled={busy}
                      onClick={() => act(() => post(`/api/admin/companies/${d.id}/members?userId=${m.user.id}`, null, 'DELETE'))}
                      className="h-9 px-3 rounded-btn text-small font-display font-semibold text-ink-600 hover:text-danger-700 hover:bg-danger-50 transition-colors duration-fast"
                    >
                      მოხსნა
                    </button>
                  </div>
                ))}
              </RowList>
            )}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="ისტორია"
        title="ტრანზაქციები"
        sub={d._count.transactions > d.transactions.length
          ? `ბოლო ${d.transactions.length} — სულ ${d._count.transactions}`
          : undefined}
      >
        {d.transactions.length === 0
          ? <AdminEmpty text="მოძრაობა ჯერ არ ყოფილა." />
          : (
            <RowList>
              {d.transactions.map(t => (
                <div key={t.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-small font-semibold text-ink-900">
                      <span className={t.type === 'TOPUP' ? 'text-brand-700' : 'text-ink-900'}>
                        {t.type === 'TOPUP' ? '+' : '−'}{GEL(t.amount)}
                      </span>
                      <span className="ml-2 font-normal text-ink-500 tabular-nums">→ {GEL(t.balanceAfter)}</span>
                    </div>
                    <div className="text-meta text-ink-500 truncate">
                      {fmtKaDateTime(new Date(t.createdAt))}
                      {t.note && ` · ${t.note}`}
                      {t.bookingId && ' · სამუშაო'}
                    </div>
                  </div>
                  {t.bookingId && <CopyBtn value={t.bookingId} label="ID" />}
                </div>
              ))}
            </RowList>
          )}
      </SectionCard>

      <div className="flex gap-2">
        <Btn
          variant="secondary" disabled={busy}
          onClick={() => act(() => post(`/api/admin/companies/${d.id}`,
            { status: d.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }, 'PATCH'))}
        >
          {d.status === 'ACTIVE' ? 'გაყინვა' : 'გაყინვის მოხსნა'}
        </Btn>
      </div>
    </div>
  )
}

function CompaniesView() {
  const [list, setList] = useState<Company[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [taxId, setTaxId] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setErr(null)
    try {
      const r = await fetch('/api/admin/companies', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j?.error)
      setList(j.companies)
    } catch (e: any) { setErr(errText(e?.message)) }
  }, [])
  useEffect(() => { load() }, [load])

  const create = async () => {
    setBusy(true); setErr(null)
    try {
      const j = await post('/api/admin/companies', { name: name.trim(), taxId: taxId.trim() })
      setName(''); setTaxId('')
      await load()
      setOpenId(j.company.id)
    } catch (e: any) { setErr(errText(e?.message)) }
    finally { setBusy(false) }
  }

  if (err && !list) return <AdminError message={err} onRetry={load} />
  if (!list) return <AdminLoading />

  return (
    <div className="space-y-5">
      <SectionCard eyebrow="ახალი" title="კომპანიის დამატება" sub="ბალანსი იწყება ნულით — თანხა ცალკე ემატება, რომ ყოველ მოძრაობას ჩანაწერი ჰქონდეს.">
        <div className="grid sm:grid-cols-[1fr_200px_auto] gap-3">
          <input value={name} onChange={e => setName(e.target.value)} className={INPUT} placeholder="კომპანიის სახელი" />
          <input value={taxId} onChange={e => setTaxId(e.target.value)} className={INPUT} placeholder="ს/კ (არასავალდებულო)" />
          <Btn disabled={busy || name.trim().length < 2} aria-busy={busy} onClick={create}>
            {busy ? 'იქმნება…' : 'დამატება'}
          </Btn>
        </div>
        {err && <div role="alert" className="mt-3 text-small text-danger-700">{err}</div>}
      </SectionCard>

      {list.length === 0
        ? <AdminEmpty text="კომპანია ჯერ არ დამატებულა." />
        : (
          <RowList>
            {list.map(c => (
              <div key={c.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(openId === c.id ? null : c.id)}
                  aria-expanded={openId === c.id}
                  className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-ink-50/70 transition-colors duration-fast"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-small font-semibold text-ink-900 truncate">
                      {c.name}
                      {c.status === 'SUSPENDED' && (
                        <span className="ml-2 text-micro uppercase text-warning-700">გაყინული</span>
                      )}
                    </div>
                    <div className="text-meta text-ink-500 truncate">
                      {c.taxId ? `ს/კ ${c.taxId} · ` : ''}{c._count.members} წევრი
                    </div>
                  </div>
                  <div className="font-display text-body font-bold text-ink-900 tabular-nums shrink-0">{GEL(c.balance)}</div>
                  <Icon.chevD className={`w-4 h-4 text-ink-400 shrink-0 transition-transform duration-fast ${openId === c.id ? 'rotate-180' : ''}`} />
                </button>
                {openId === c.id && (
                  <div className="px-4 pb-5 bg-ink-50/40">
                    <CompanyDetail id={c.id} onChanged={load} />
                  </div>
                )}
              </div>
            ))}
          </RowList>
        )}
    </div>
  )
}

/* ───── Leads ───── */

const LEAD_STATUS: Record<Lead['status'], string> = {
  NEW: 'ახალი', CONTACTED: 'დაკავშირებული', CLOSED: 'დახურული',
}

function LeadsView({ onCount, onChanged }: { onCount: (n: number) => void; onChanged?: () => void }) {
  const [list, setList] = useState<Lead[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setErr(null)
    try {
      const r = await fetch('/api/admin/business-leads', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j?.error)
      setList(j.leads)
      onCount(j.open)
    } catch (e: any) { setErr(errText(e?.message)) }
  }, [onCount])
  useEffect(() => { load() }, [load])

  /* THE DEAL. `agreedPrice` and `adminNote` were columns with a written intent
     and no way to fill them in — so the number that was actually agreed, and
     the invoice it went out on, lived only in somebody's inbox. This is the
     paid side of the product; it needs a home in the panel. */
  const saveDeal = async (id: string, agreedPrice: number | null, adminNote: string) => {
    try { await post('/api/admin/business-leads', { id, agreedPrice, adminNote }, 'PATCH'); await load() }
    catch (e: any) { setErr(errText(e?.message)) }
  }

  const setStatus = async (id: string, status: Lead['status']) => {
    // …and tell the shell, so the nav badge drops the moment a lead is handled.
    // Without it the count only refreshed on a full reload, i.e. the badge kept
    // claiming work that was already done — which is worse than no badge.
    try { await post('/api/admin/business-leads', { id, status }, 'PATCH'); await load(); onChanged?.() }
    catch (e: any) { setErr(errText(e?.message)) }
  }

  if (err && !list) return <AdminError message={err} onRetry={load} />
  if (!list) return <AdminLoading />
  if (list.length === 0) return <AdminEmpty text="განაცხადი ჯერ არ შემოსულა." />

  /* What this channel has actually agreed, summed off the leads themselves.
     Counted, never written down — the same rule /business states for its own
     numbers. Absent until there IS one: a „0₾" line on a channel nobody has
     closed a deal in yet says nothing. */
  const agreedTotal = list.reduce((n, l) => n + (l.agreedPrice ?? 0), 0)
  const agreedCount = list.filter(l => l.agreedPrice != null).length

  return (
    <div className="space-y-4">
      {agreedCount > 0 && (
        <div className="px-4 py-3 rounded-card border border-ink-200 bg-ink-50/50 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-small text-ink-600">შეთანხმებული:</span>
          <span className="font-display text-body-lg font-bold text-ink-900 tabular-nums">{GEL(agreedTotal)}</span>
          <span className="text-meta text-ink-500 tabular-nums">{agreedCount} განაცხადზე</span>
        </div>
      )}
    <RowList>
      {list.map(l => (
        <div key={l.id} className="px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-display text-small font-semibold text-ink-900">
                {l.companyName}
                <span className={`ml-2 text-micro uppercase ${l.status === 'NEW' ? 'text-brand-700' : 'text-ink-400'}`}>
                  {LEAD_STATUS[l.status]}
                </span>
              </div>
              <div className="text-meta text-ink-500">
                {l.contactName} · {l.phone} · {l.email}
                {l.taxId && ` · ს/კ ${l.taxId}`}
              </div>
              {l.service && (
                <div className="mt-1.5 inline-flex items-center h-6 px-2 rounded-pill border border-brand-200 text-brand-700 text-micro font-display font-semibold uppercase">
                  {l.service.direction} · {l.service.title}
                </div>
              )}
              {l.interest && <div className="mt-1 text-small text-ink-700">{l.interest}</div>}
              {l.message && <div className="mt-1 text-small text-ink-600 whitespace-pre-wrap">{l.message}</div>}
              <div className="mt-1 text-meta text-ink-400">{fmtKaDateTime(new Date(l.createdAt))}</div>
              <DealFields lead={l} onSave={saveDeal} />
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <CopyBtn value={l.email} label="ელფოსტა" />
              {l.status !== 'CLOSED' && (
                <button
                  type="button"
                  onClick={() => setStatus(l.id, l.status === 'NEW' ? 'CONTACTED' : 'CLOSED')}
                  className="h-9 px-3 rounded-btn text-small font-display font-semibold text-ink-700 border border-ink-200 hover:bg-ink-50 transition-colors duration-fast"
                >
                  {l.status === 'NEW' ? 'დავუკავშირდი' : 'დახურვა'}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </RowList>
    </div>
  )
}

/* One lead's money, edited in place. Local draft state so typing does not
   re-render the list, and the save button only lights up when something
   actually changed — a button that is always active teaches nobody whether
   their edit landed. An empty price field means „nothing agreed" and clears
   the column (the API takes null for exactly that). */
function DealFields({ lead, onSave }: { lead: Lead; onSave: (id: string, price: number | null, note: string) => Promise<void> }) {
  const [price, setPrice] = useState(lead.agreedPrice == null ? '' : String(lead.agreedPrice))
  const [note, setNote] = useState(lead.adminNote ?? '')
  const [busy, setBusy] = useState(false)
  const parsed = price.trim() === '' ? null : Number(price)
  const valid = parsed === null || (Number.isInteger(parsed) && parsed >= 0)
  const dirty = (parsed ?? null) !== (lead.agreedPrice ?? null) || note !== (lead.adminNote ?? '')

  return (
    <div className="mt-3 pt-3 border-t border-ink-100 flex flex-wrap items-center gap-2">
      <input
        value={price} onChange={e => setPrice(e.target.value)}
        inputMode="numeric" aria-label="შეთანხმებული ფასი"
        className="h-9 w-[130px] px-3 rounded-field border border-ink-200 bg-white text-small text-ink-900 placeholder-ink-400 focus:border-brand-500 outline-none transition-colors duration-fast"
        placeholder="შეთანხმდა ₾"
      />
      <input
        value={note} onChange={e => setNote(e.target.value)}
        aria-label="შენიშვნა"
        className="h-9 flex-1 min-w-[180px] px-3 rounded-field border border-ink-200 bg-white text-small text-ink-900 placeholder-ink-400 focus:border-brand-500 outline-none transition-colors duration-fast"
        placeholder="ინვოისი / შენიშვნა"
      />
      <button
        type="button"
        disabled={!dirty || !valid || busy}
        onClick={async () => { setBusy(true); await onSave(lead.id, parsed, note); setBusy(false) }}
        className="h-9 px-3 rounded-btn text-small font-display font-semibold text-ink-700 border border-ink-200 hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-fast"
      >
        {busy ? 'ინახება…' : 'შენახვა'}
      </button>
    </div>
  )
}

/* ───── Services — the price list a company reads on /business ───── */

/* The card picture, edited from the row it belongs to.
   /business shows services as CARDS, so the image is not decoration — a card
   without one falls back to a plain panel. Uploading it anywhere other than
   beside the service would mean remembering which row you were on.
   `kind=cover` is the same /api/uploads path the blog uses: hard-cropped to
   1200x675 webp, so a phone photo lands the right shape and the right weight
   without the admin thinking about it. */
function ServiceImage({
  service, busy, onSaved, onError,
}: {
  service: Service
  busy: boolean
  onSaved: () => Promise<void> | void
  onError: (msg: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const has = !!service.imageUrl

  const save = async (imageUrl: string) => {
    setUploading(true)
    try {
      await post('/api/admin/b2b-services', { id: service.id, imageUrl }, 'PATCH')
      await onSaved()
    } catch (e: any) { onError(errText(e?.message)) }
    finally { setUploading(false) }
  }

  return (
    <div className="shrink-0">
      <label className={`relative block w-[92px] aspect-[16/9] rounded-btn border border-ink-200 bg-ink-50 overflow-hidden ${busy || uploading ? 'opacity-50' : 'cursor-pointer hover:border-ink-300'} transition-colors duration-fast`}>
        {has
          ? <img src={service.imageUrl!} alt="" className="w-full h-full object-cover" />
          : <span className="absolute inset-0 inline-flex items-center justify-center text-micro text-ink-400">სურათი</span>}
        {uploading && (
          <span className="absolute inset-0 inline-flex items-center justify-center bg-white/80 text-micro font-display font-semibold text-ink-700">
            იტვირთება…
          </span>
        )}
        <input
          type="file" accept="image/*" className="sr-only" disabled={busy || uploading}
          onChange={async e => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            setUploading(true)
            try {
              const fd = new FormData()
              fd.append('file', f)
              fd.append('kind', 'cover')
              const res = await fetch('/api/uploads', { method: 'POST', body: fd })
              const j = await res.json().catch(() => null)
              if (!res.ok || !j?.url) {
                // Name the actual reason — „ვერ აიტვირთა" on a too-large file
                // tells the admin nothing about what to do next.
                onError(
                  j?.error === 'TOO_LARGE' ? `ფაილი ძალიან დიდია — მაქსიმუმ ${Math.round((j.maxBytes ?? 0) / 1024 / 1024)}MB`
                  : j?.error === 'BAD_TYPE' ? 'სურათი უნდა იყოს JPG, PNG ან WebP'
                  : 'ატვირთვა ვერ მოხერხდა',
                )
                return
              }
              await save(j.url)
            } catch { onError('ქსელის შეცდომა') }
            finally { setUploading(false) }
          }}
        />
      </label>
      {has && (
        <button
          type="button" disabled={busy || uploading}
          onClick={() => save('')}
          className="mt-1 w-full text-micro text-ink-500 hover:text-danger-700 disabled:opacity-40 transition-colors duration-fast"
        >
          წაშლა
        </button>
      )}
    </div>
  )
}

function ServicesView() {
  const [list, setList] = useState<Service[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({ kind: 'CONSULTATION', direction: '', title: '', description: '', format: '', priceGel: '', priceOnRequest: false })

  const load = useCallback(async () => {
    setErr(null)
    try {
      const r = await fetch('/api/admin/b2b-services', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j?.error)
      setList(j.services)
    } catch (e: any) { setErr(errText(e?.message)) }
  }, [])
  useEffect(() => { load() }, [load])

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null)
    try { await fn(); await load() }
    catch (e: any) { setErr(errText(e?.message)) }
    finally { setBusy(false) }
  }

  if (err && !list) return <AdminError message={err} onRetry={load} />
  if (!list) return <AdminLoading />

  const price = Number(draft.priceGel || 0)
  const canAdd = draft.direction.trim().length >= 2 && draft.title.trim().length >= 2
    && Number.isInteger(price) && price >= 0 && !busy

  return (
    <div className="space-y-5">
      <SectionCard
        eyebrow="ახალი"
        title="სერვისის დამატება"
        sub="ორი კითხვა: რა არის — კონსულტაცია თუ ტრენინგი, და რაში — მიმართულება."
      >
        <div className="grid sm:grid-cols-2 gap-3">
          {/* TWO AXES, TWO CONTROLS. They used to be one free-text field, so
              „ტრენინგები" ended up sitting in the same column as „იურიდიული" and
              a training in sales could not be filed as both. See lib/b2b. */}
          <select value={draft.kind} onChange={e => setDraft(d => ({ ...d, kind: e.target.value }))}
            className={INPUT} aria-label="ტიპი">
            {B2B_KINDS.map(k => <option key={k} value={k}>{kindLabel(k)}</option>)}
          </select>
          <input value={draft.direction} onChange={e => setDraft(d => ({ ...d, direction: e.target.value }))}
            className={INPUT} placeholder="მიმართულება — მაგ. გაყიდვები" />
          <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
            className={INPUT} placeholder="სერვისი — მაგ. სამართლებრივი აუდიტი" />
          <input value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            className={`${INPUT} sm:col-span-2`} placeholder="აღწერა — რა პრობლემას ხსნის (არასავალდებულო)" />
          {/* Matters most for a training: how long, how many people, where. */}
          <input value={draft.format} onChange={e => setDraft(d => ({ ...d, format: e.target.value }))}
            className={`${INPUT} sm:col-span-2`} placeholder="ფორმატი — მაგ. 4 საათი · ჯგუფური · ონლაინ (არასავალდებულო)" />
          <div className="flex items-center gap-3">
            <input type="number" min={0} step={1} inputMode="numeric" disabled={draft.priceOnRequest}
              value={draft.priceGel} onChange={e => setDraft(d => ({ ...d, priceGel: e.target.value }))}
              className={`${INPUT} disabled:opacity-40`} placeholder="ფასი ₾" />
            <label className="flex items-center gap-2 shrink-0 text-small text-ink-700 cursor-pointer">
              <input type="checkbox" checked={draft.priceOnRequest}
                onChange={e => setDraft(d => ({ ...d, priceOnRequest: e.target.checked }))}
                className="w-4 h-4 rounded accent-brand-600" />
              შეთანხმებით
            </label>
          </div>
          {/* justify-self-start: the button is a grid CELL, and a grid cell
              stretches — so the primary action rendered as a full-column pale
              bar that read as a disabled input rather than a button. */}
          <Btn className="justify-self-start" disabled={!canAdd} aria-busy={busy} onClick={() => act(async () => {
            await post('/api/admin/b2b-services', {
              kind: draft.kind, direction: draft.direction.trim(), title: draft.title.trim(),
              description: draft.description.trim(),
              format: draft.format.trim(),
              priceGel: draft.priceOnRequest ? 0 : price,
              priceOnRequest: draft.priceOnRequest,
            })
            setDraft({ kind: draft.kind, direction: '', title: '', description: '', format: '', priceGel: '', priceOnRequest: false })
          })}>
            {busy ? 'ემატება…' : 'დამატება'}
          </Btn>
        </div>
        {err && <div role="alert" className="mt-3 text-small text-danger-700">{err}</div>}
      </SectionCard>

      {list.length === 0
        ? <AdminEmpty text="სერვისი ჯერ არ დამატებულა — გვერდზე მხოლოდ ფორმა ჩანს." />
        : (
          <RowList>
            {list.map(s => (
              <div key={s.id} className="px-4 py-3.5 flex items-center gap-3">
                <ServiceImage service={s} busy={busy} onSaved={load} onError={setErr} />
                <div className="min-w-0 flex-1">
                  <div className="font-display text-small font-semibold text-ink-900 truncate">
                    {s.title}
                    {!s.visible && <span className="ml-2 text-micro uppercase text-ink-400">დამალული</span>}
                  </div>
                  <div className="text-meta text-ink-500 truncate">
                    {kindLabel(s.kind)} · {s.direction}
                    {s.format && ` · ${s.format}`}
                    {s._count.requests > 0 && ` · ${s._count.requests} მოთხოვნა`}
                  </div>
                </div>
                <div className="font-display text-body font-bold text-ink-900 tabular-nums shrink-0">
                  {s.priceOnRequest ? 'შეთანხმებით' : `${s.priceGel.toLocaleString('en-US')}₾`}
                </div>
                <button type="button" disabled={busy}
                  onClick={() => act(() => post('/api/admin/b2b-services', { id: s.id, visible: !s.visible }, 'PATCH'))}
                  className="h-9 px-3 rounded-btn text-small font-display font-semibold text-ink-700 border border-ink-200 hover:bg-ink-50 transition-colors duration-fast shrink-0">
                  {s.visible ? 'დამალვა' : 'გამოჩენა'}
                </button>
              </div>
            ))}
          </RowList>
        )}
    </div>
  )
}

/* ───── The tab ───── */

type Sub = 'leads' | 'services' | 'companies'

export function CompaniesSection({ onLeadsChanged }: { onLeadsChanged?: () => void } = {}) {
  const [sub, setSub] = useState<Sub>('leads')
  const [openLeads, setOpenLeads] = useState<number | undefined>(undefined)

  return (
    <div className="px-5 sm:px-8 py-7 sm:py-9 max-w-[1100px]">
      <TabHeader
        eyebrow="B2B"
        title="კომპანიები"
        sub="ორი რამ: სერვისები, რომლებსაც კომპანიას ვყიდით, და ბალანსები, რომლითაც კომპანია ჩვეულებრივ ექსპერტს უკვეთავს."
        actions={<OpenBtn href="/business" label="გვერდის ნახვა" />}
      />

      {/* The test path, on screen.
          This panel is FOR THE OWNER WHILE THE VERTICAL IS DARK, and it says so:
          the flow crosses four surfaces (this tab, the public page, a client's
          booking sheet, then back here) and nothing else on the panel tells you
          that the fourth step is where you find out whether the third worked.
          When B2B_VISIBILITY goes 'public' this block should go — at that point
          the reader is an operator doing a job, not somebody verifying a
          feature, and a checklist about testing is noise on their screen. */}
      <div className="mt-5 rounded-card border border-ink-200 bg-ink-50/60 p-5">
        <div className="font-display text-small font-semibold text-ink-900">როგორ შევამოწმო</div>
        <ol className="mt-2 space-y-1 text-small text-ink-700 list-decimal pl-4">
          <li>ამ ტაბზე დაამატე კომპანია და ჩარიცხე ბალანსი.</li>
          <li>წევრად დაამატე ჩვეულებრივი ანგარიში — ადმინი არ გამოდგება, მოთხოვნის დატოვება ადმინს არ შეუძლია.</li>
          <li>იმ ანგარიშით შედი და დატოვე მოთხოვნა — შეთავაზების მიღებისას გამოჩნდება ბალანსით გადახდა.</li>
          <li>დაბრუნდი აქ: ბალანსი შემცირებული უნდა იყოს და ტრანზაქციებში ახალი ჩანაწერი გაჩნდეს.</li>
        </ol>
        <p className="mt-2.5 text-meta text-ink-500">
          გვერდი და ეს ტაბი ახლა მხოლოდ ადმინს უჩანს — დანარჩენები 404-ს იღებენ.
        </p>
      </div>
      <div className="mt-6">
        <SubTabs<Sub>
          value={sub}
          onChange={setSub}
          tabs={[
            // Catalogue first, then its queue, then the other product. The
            // order is the separation: „what we sell" → „who asked" → „balances".
            { id: 'services', label: 'სერვისები' },
            { id: 'leads', label: 'განაცხადები', count: openLeads },
            { id: 'companies', label: 'ბალანსი' },
          ]}
        />
      </div>
      <div className="mt-6">
        {sub === 'leads' && <LeadsView onCount={setOpenLeads} onChanged={onLeadsChanged} />}
        {sub === 'services' && <ServicesView />}
        {sub === 'companies' && <CompaniesView />}
      </div>
    </div>
  )
}

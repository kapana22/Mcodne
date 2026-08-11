'use client'
// ადმინი → „კომპანიები" — the B2B tab.
//
// Two sub-views behind SubTabs, because they are two different jobs done at
// different times: „განაცხადები" is a QUEUE somebody is waiting at the other
// end of, „კომპანიები" is a ledger you open when you already know why. Same
// reasoning as the ინსაითები split; deliberately not two sidebar entries, since
// the rail already carries sixteen.
//
// The tab renders at all only when b2bFeatureExists() — see _nav.tsx. This file
// therefore assumes it is allowed to be on screen and does not re-check.

import { useCallback, useEffect, useState } from 'react'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { fmtKaDateTime } from '@/lib/kaDate'
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
    case 'ADMIN_CANNOT_BE_MEMBER': return 'ადმინი ვერ იქნება კომპანიის წევრი — ჯავშნა ადმინს არ შეუძლია.'
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
                      {t.bookingId && ' · ჯავშანი'}
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

  return (
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
              {l.interest && <div className="mt-1 text-small text-ink-700">{l.interest}</div>}
              {l.message && <div className="mt-1 text-small text-ink-600 whitespace-pre-wrap">{l.message}</div>}
              <div className="mt-1 text-meta text-ink-400">{fmtKaDateTime(new Date(l.createdAt))}</div>
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
  )
}

/* ───── The tab ───── */

type Sub = 'leads' | 'companies'

export function CompaniesSection({ onLeadsChanged }: { onLeadsChanged?: () => void } = {}) {
  const [sub, setSub] = useState<Sub>('leads')
  const [openLeads, setOpenLeads] = useState<number | undefined>(undefined)

  return (
    <div className="px-5 sm:px-8 py-7 sm:py-9 max-w-[1100px]">
      <TabHeader
        eyebrow="B2B"
        title="კომპანიები"
        sub="შემოსული განაცხადები, კომპანიების ბალანსები და ტრანზაქციების ისტორია."
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
          <li>წევრად დაამატე ჩვეულებრივი ანგარიში — ადმინი არ გამოდგება, ჯავშნა ადმინს არ შეუძლია.</li>
          <li>იმ ანგარიშით შედი და დაჯავშნე კონსულტაცია — „დეტალების“ ბოლოს გამოჩნდება ბალანსით გადახდა.</li>
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
            { id: 'leads', label: 'განაცხადები', count: openLeads },
            { id: 'companies', label: 'კომპანიები' },
          ]}
        />
      </div>
      <div className="mt-6">
        {sub === 'leads' ? <LeadsView onCount={setOpenLeads} onChanged={onLeadsChanged} /> : <CompaniesView />}
      </div>
    </div>
  )
}

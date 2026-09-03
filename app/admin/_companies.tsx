'use client'
// ადმინი → „კომპანიები" — the record behind a provider that is a firm.
//
// ⚠️ THIS TAB USED TO HOLD A WHOLE SECOND PRODUCT, and everything that made it
// confusing went on 2026-09-03. It carried the B2B vertical: a catalogue of
// fixed-price services we sold to companies (`B2BService`), the enquiry queue
// those produced (`BusinessLead`), and a prepaid balance a company topped up so
// its members could pay with it (`Company.balance`, `CompanyTransaction`). The
// owner removed the vertical — „ააღარ გვინდა ეგ ორი გვერდი" — and none of it had
// ever carried a live row.
//
// What is left is the ONE thing the marketplace itself needs: a `Company` row
// and its members, so a firm registering through /join („კომპანია", not
// „ფიზიკური პირი") has an identity to hang a ServiceProfile and a RequestAccess
// grant on. That is a supply-side record, not a sales channel — which is why
// there is nothing here to sell, nothing to invoice and no balance to spend.

import { useCallback, useEffect, useState } from 'react'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import {
  TabHeader, SectionCard, RowList,
  AdminEmpty, AdminError, AdminLoading,
} from './_parts'
import { actionError } from '@/lib/actionErrors'

type Company = {
  id: string; name: string; taxId: string | null
  status: 'ACTIVE' | 'SUSPENDED'; note: string | null; createdAt: string
  _count: { members: number }
}
type Member = {
  id: string; role: 'OWNER' | 'MEMBER'; createdAt: string
  user: { id: string; fullName: string; email: string; role: string }
}
type Detail = Company & { members: Member[] }

const INPUT =
  'w-full h-11 px-3.5 rounded-field border border-ink-200 bg-white text-body text-ink-900 ' +
  'placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none ' +
  'transition-colors duration-fast'

/** Server codes → Georgian. Never show a reader a raw code. */
/* USER_NOT_FOUND, NOT_FOUND, INVALID and the default are in lib/actionErrors. */
const errText = (code?: string) => actionError(code, {
  TAX_ID_TAKEN: 'ეს საიდენტიფიკაციო კოდი უკვე გამოყენებულია.',
  ADMIN_CANNOT_BE_MEMBER: 'ადმინი ვერ იქნება კომპანიის წევრი — მოთხოვნის დატოვება ადმინს არ შეუძლია.',
  USER_SUSPENDED: 'ეს ანგარიში შეჩერებულია.',
  ALREADY_MEMBER: 'უკვე ამ კომპანიის წევრია.',
  MEMBER_OF_ANOTHER: 'უკვე სხვა კომპანიის წევრია.',
})

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

function CompanyDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
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

  return (
    <div className="space-y-5">
      <SectionCard
        eyebrow="წევრები"
        title="ვინ მოქმედებს კომპანიის სახელით"
        sub={d.status === 'SUSPENDED'
          ? 'კომპანია გაყინულია — წევრები ვერ მოქმედებენ.'
          : 'მხოლოდ არსებული ანგარიში — ერთი ადამიანი ერთ კომპანიაში.'}
      >
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
        {err && <div role="alert" className="mt-3 text-small text-danger-700">{err}</div>}
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
      <SectionCard eyebrow="ახალი" title="კომპანიის დამატება" sub="შემდეგ დაამატე წევრი და მიეცი წვდომა „მოთხოვნებში“.">
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

export function CompaniesSection() {
  return (
    <div className="px-5 sm:px-8 py-7 sm:py-9 max-w-[1100px]">
      <TabHeader
        eyebrow="მიწოდება"
        title="კომპანიები"
        sub="ფირმა, რომელიც სერვისს ყიდის. /join-ზე „კომპანიად“ რეგისტრირებულს აქ სჭირდება ჩანაწერი და წევრი."
      />
      <div className="mt-6">
        <CompaniesView />
      </div>
    </div>
  )
}

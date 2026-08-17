'use client'
// ადმინი → „წვდომა" — who can see the requests subsystem at all.
//
// ⚠️ THE LIST STARTS EMPTY AND THAT IS THE DESIGN. The experts already approved
// on this platform applied to be BOOKED, not to bid on leads; switching them
// all on would ship an unfinished product to people who never asked for it. An
// empty list can only produce an empty audience, which is the only safe state
// for a stage-1 test — so this tab is how the audience is built, one name at a
// time, each with a reason beside it.
//
// TWO KINDS OF SUBJECT, and they are not the same thing wearing two labels:
//   ექსპერტი  — one person, found by the email address the admin knows.
//   კომპანია  — a company, and EVERY MEMBER of it becomes a provider. The
//               membership list is already an allowlist an admin maintains by
//               hand (CompanyMember), so this borrows it rather than inventing
//               a second one to keep in sync.
//
// There is no delete. Turning somebody off is a switch, so the note saying why
// survives the decision — a list you can only erase from is a list where „why
// is this person not here" has no answer.

import { useCallback, useEffect, useState } from 'react'
import { Btn } from '@/components/Btn'
import {
  TabHeader, SectionCard, RowList, AdminEmpty, AdminError, AdminLoading, fmtDT,
} from './_parts'
import { PROVIDER_KINDS, type ProviderKindName } from '@/lib/requests'

type Row = {
  id: string; kind: string; active: boolean; note: string | null; createdAt: string
  user: { id: string; fullName: string; email: string; role: string } | null
  company: { id: string; name: string; _count: { members: number } } | null
}

const INPUT =
  'w-full h-11 px-3.5 rounded-field border border-ink-200 bg-white text-body text-ink-900 ' +
  'placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none ' +
  'transition-colors duration-fast'

const KIND_LABEL: Record<ProviderKindName, string> = {
  EXPERT: 'ექსპერტი',
  COMPANY: 'კომპანია',
}

/** Server codes → Georgian. Never show a reader a raw code. */
function errText(code?: string): string {
  switch (code) {
    case 'USER_NOT_FOUND': return 'ამ ელფოსტაზე ანგარიში არ არსებობს — ჯერ დარეგისტრირდეს.'
    case 'COMPANY_NOT_FOUND': return 'ასეთი კომპანია არ არის.'
    // ADMIN_ALREADY_HAS_ACCESS was removed 2026-08-14: an admin sees the
    // subsystem by role but is not a PROVIDER without a row here, so refusing
    // the row meant they could never write an offer. The endpoint accepts them
    // now — see the note there.
    case 'SUBJECT_AMBIGUOUS': return 'აირჩიე ერთი — ან ექსპერტი, ან კომპანია.'
    case 'SUBJECT_MISSING':
    case 'SUBJECT_KIND_MISMATCH':
    case 'INVALID': return 'შეავსე ველები სწორად.'
    default: return 'ვერ შესრულდა — სცადე თავიდან.'
  }
}

export function AccessSection() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [kind, setKind] = useState<ProviderKindName>('EXPERT')
  const [email, setEmail] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    setErr(null)
    try {
      const r = await fetch('/api/admin/requests/access', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j?.error)
      setRows(j.access)
    } catch (e: any) {
      setErr(errText(e?.message))
    }
  }, [])
  useEffect(() => { load() }, [load])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setFormErr(null)
    try {
      const res = await fetch('/api/admin/requests/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, email, companyId, note }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) { setFormErr(errText(j?.error)); return }
      setEmail(''); setCompanyId(''); setNote('')
      await load()
    } catch {
      setFormErr(errText())
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (id: string, active: boolean) => {
    setBusy(true); setFormErr(null)
    try {
      const res = await fetch('/api/admin/requests/access', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, active }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) { setFormErr(errText(j?.error)); return }
      await load()
    } catch {
      setFormErr(errText())
    } finally {
      setBusy(false)
    }
  }

  const canAdd = !busy && (kind === 'EXPERT' ? email.trim().length > 3 : companyId.trim().length > 0)

  return (
    <>
      <TabHeader
        eyebrow="წვდომა"
        title="ვის უჩანს"
        sub="სიაში მყოფი ექსპერტი და კომპანიის წევრი ხედავს მოთხოვნებს. სხვას გვერდი არ ეხსნება."
      />

      <div className="px-6 lg:px-8 py-6 space-y-5">
        <SectionCard eyebrow="დამატება" title="ახალი წვდომა">
          <form onSubmit={add} noValidate className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">ტიპი</span>
              <select value={kind} onChange={e => setKind(e.target.value as ProviderKindName)} className={INPUT}>
                {PROVIDER_KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </label>

            {/* One field or the other — never both on screen. Exactly one
                subject is the rule (accessSubjectError in lib/requests), and a
                form that can hold two is a form that will eventually send two. */}
            {kind === 'EXPERT' ? (
              <label className="block">
                <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">ელფოსტა</span>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className={INPUT} placeholder="expert@example.ge"
                />
              </label>
            ) : (
              <label className="block">
                <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">კომპანიის ID</span>
                <input
                  type="text" value={companyId} onChange={e => setCompanyId(e.target.value)}
                  className={INPUT} placeholder="cme…"
                />
              </label>
            )}

            <label className="block sm:col-span-2">
              <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">
                შენიშვნა <span className="ml-1 font-normal text-ink-400">არასავალდებულო</span>
              </span>
              <input
                type="text" maxLength={500} value={note} onChange={e => setNote(e.target.value)}
                className={INPUT} placeholder="რატომ არის სიაში"
              />
            </label>

            {formErr && <div className="sm:col-span-2"><AdminError message={formErr} /></div>}

            <div className="sm:col-span-2">
              <Btn type="submit" disabled={!canAdd} aria-busy={busy}>დამატება</Btn>
            </div>
          </form>
        </SectionCard>

        {err && !rows ? <AdminError message={err} onRetry={load} />
          : !rows ? <AdminLoading />
          : rows.length === 0 ? <AdminEmpty text="სია ცარიელია — მოთხოვნებს ჯერ ვერავინ ხედავს." />
          : (
            <RowList>
              {rows.map(row => (
                <div key={row.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <div className="text-body font-display font-semibold text-ink-900">
                      {row.user
                        ? `${row.user.fullName} · ${row.user.email}`
                        : `${row.company?.name ?? '—'} · ${row.company?._count.members ?? 0} წევრი`}
                    </div>
                    <div className="text-meta text-ink-500">
                      {KIND_LABEL[row.kind as ProviderKindName]}
                      {' · '}{row.active ? 'აქტიური' : 'გამორთული'}
                      {' · '}{fmtDT(row.createdAt)}
                      {row.note && ` · ${row.note}`}
                    </div>
                  </div>
                  <Btn
                    variant={row.active ? 'danger' : 'secondary'}
                    size="sm"
                    disabled={busy}
                    onClick={() => toggle(row.id, !row.active)}
                  >
                    {row.active ? 'გამორთვა' : 'ჩართვა'}
                  </Btn>
                </div>
              ))}
            </RowList>
          )}
      </div>
    </>
  )
}

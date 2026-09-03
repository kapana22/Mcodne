'use client'
// The /business enquiry form.
//
// Validated with `BusinessLeadInput` from lib/b2b — the SAME zod object the API
// route parses the body with. That is the whole point of it living in lib:
// „valid" is decided once, so a field cannot be accepted by the browser and
// rejected by the server. This codebase has been bitten twice by exactly that
// gap (certificates max(500), blog covers max(2000) — both in the pre-deploy
// gate's header comment).
//
// Field markup is copied from app/contact/ContactClient.tsx deliberately, down
// to the class strings: h-11 inputs, rounded-field, text-body, the same focus
// treatment. Two contact-shaped forms on one site that look different is a
// worse outcome than a little duplication, and a shared <Field> abstraction is
// a decision for whoever needs the third one.
//
// ⚠️ THE ERROR MARKUP IS THE ONE PART THAT IS NOW SHARED (2026-08-31) — the
// third caller did arrive, twelve of them. components/FieldError owns the
// `aria-invalid` + `aria-describedby` + focus + message, because the copy here
// was missing two of the four: the sentence sat at the FOOT of the form,
// wired to nothing, so a screen reader announced „invalid" with no reason and
// a sighted reader read the border in one place and the cause in another.
//
// ⚠️ AND FOUR OF THE EIGHT FIELDS COULD NOT SHOW ONE AT ALL. `taxId`,
// `interest`, `message` and `serviceId` used the bare INPUT constant rather
// than `inputClass(field)` — so `taxId: "12"` (the schema is `min(4)`) was
// refused with „შეავსეთ ველები სწორად." and nothing on the page marked which
// of the eight boxes it meant. Every field is wired now, and `taxId` has a
// label in lib/validationMessages so the sentence can name it.

import { useEffect, useState } from 'react'
import { PhoneInput } from '@/components/PhoneInput'
import { Btn } from '@/components/Btn'
import { BusinessLeadInput, servicePriceLabel } from '@/lib/b2b'
import { validationIssueMessage } from '@/lib/validationMessages'
import { FIELD_ERROR_BORDER, FieldError, useFault } from '@/components/FieldError'
import type { PublicService } from './BusinessLanding'

type Status = 'idle' | 'sending' | 'ok' | 'error'

const INPUT =
  'w-full h-11 px-3.5 rounded-field border border-ink-200 bg-white text-body text-ink-900 ' +
  'placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none ' +
  'transition-colors duration-fast'

/** Map server codes to Georgian copy — never surface a raw code to a reader. */
function leadErrorText(code?: string): string {
  switch (code) {
    case 'RATE_LIMITED': return 'ძალიან ბევრი მოთხოვნა — სცადეთ ცოტა ხანში.'
    case 'INVALID': return 'შეავსეთ ველები სწორად.'
    default: return 'დაფიქსირდა შეცდომა — სცადეთ თავიდან.'
  }
}

const Label = ({ children, optional }: { children: React.ReactNode; optional?: boolean }) => (
  <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">
    {children}
    {optional && <span className="ml-1 font-normal text-ink-400">არასავალდებულო</span>}
  </span>
)

export function LeadForm({ services = [] }: { services?: PublicService[] }) {
  const [form, setForm] = useState({
    companyName: '', taxId: '', contactName: '', phone: '', email: '', interest: '', message: '',
    serviceId: '',
  })

  // A „მოთხოვნა" button on a service card is an anchor to #form-<id>. Reading
  // the hash here is what turns that jump into a PRESELECTION — otherwise the
  // person lands on a form that has forgotten which card they came from and has
  // to say it again in free text.
  //
  // Hash and not a query string: a query would reload the server component and
  // lose the scroll position, for a choice that is purely about this form.
  useEffect(() => {
    const apply = () => {
      const m = window.location.hash.match(/^#form-(.+)$/)
      if (m && services.some(s => s.id === m[1])) {
        setForm(f => ({ ...f, serviceId: m[1] }))
      }
    }
    apply()
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [services])
  const [status, setStatus] = useState<Status>('idle')
  const [errorText, setErrorText] = useState<string | null>(null)
  const { fault, fail, props, bad, clearField, reset: clearFault } = useFault('lead')
  const inputClass = (field: string) => bad(field) ? `${INPUT} ${FIELD_ERROR_BORDER}` : INPUT
  /** The message under this field. One call per box, so no field can be marked
   *  red with its reason printed somewhere else. */
  const err = (field: string) => <FieldError form="lead" field={field} fault={fault} />

  const set = (k: keyof typeof form) => (v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    // Clear a previous failure the moment they start fixing it — an error
    // sitting under a field they have already corrected is just noise.
    if (status === 'error') { setStatus('idle'); setErrorText(null) }
    clearField(k)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (status === 'sending') return

    // Validated HERE with the server's own schema, so „ნომერი არასწორია" is
    // answered before a round-trip rather than after one.
    const parsed = BusinessLeadInput.safeParse(form)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const field = typeof issue?.path[0] === 'string' ? issue.path[0] : ''
      const text = validationIssueMessage(issue, leadErrorText('INVALID'))
      if (field) { fail(field, text); return }
      setStatus('error')
      setErrorText(text)
      return
    }

    setStatus('sending')
    setErrorText(null); clearFault()
    try {
      const res = await fetch('/api/business/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) {
        const field = typeof j?.field === 'string' ? j.field : ''
        if (field && j?.message) { setStatus('idle'); fail(field, j.message); return }
        setStatus('error')
        setErrorText(j?.message ?? leadErrorText(j?.error))
        return
      }
      setStatus('ok')
      setForm({ companyName: '', taxId: '', contactName: '', phone: '', email: '', interest: '', message: '', serviceId: '' })
    } catch {
      setStatus('error')
      setErrorText('დაფიქსირდა შეცდომა — სცადეთ თავიდან.')
    }
  }

  // The terminal state replaces the form rather than sitting above it. A
  // successful send leaves nothing to do on this page, and an empty form under
  // a „მივიღეთ" line reads as an invitation to send it again.
  if (status === 'ok') {
    return (
      <div className="rounded-card border border-brand-200 bg-brand-50 p-6 lg:p-8">
        <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">მივიღეთ</div>
        <p className="mt-1 text-body text-ink-700">დაგიკავშირდებით მითითებულ კონტაქტზე.</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-card border border-ink-200 bg-white p-6 lg:p-8">
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block">
          <Label>კომპანიის სახელი</Label>
          <input
            type="text" required value={form.companyName}
            onChange={e => set('companyName')(e.target.value)}
            {...props('companyName')} className={inputClass('companyName')} placeholder="შპს მაგალითი"
          />
          {err('companyName')}
        </label>
        <label className="block">
          <Label optional>საიდენტიფიკაციო კოდი</Label>
          <input
            type="text" inputMode="numeric" value={form.taxId}
            onChange={e => set('taxId')(e.target.value)}
            {...props('taxId')} className={inputClass('taxId')} placeholder="123456789"
          />
          {err('taxId')}
        </label>
        <label className="block">
          <Label>საკონტაქტო პირი</Label>
          <input
            type="text" required autoComplete="name" value={form.contactName}
            onChange={e => set('contactName')(e.target.value)}
            {...props('contactName')} className={inputClass('contactName')} placeholder="სახელი და გვარი"
          />
          {err('contactName')}
        </label>
        <label className="block">
          <Label>ტელეფონი</Label>
          {/* THE phone input — same keyboard, same autofill hint and same
              filtering as every other number field on the site. */}
          <PhoneInput value={form.phone} onChange={set('phone')} className={inputClass('phone')} field={props('phone')} />
          {err('phone')}
        </label>
        <label className="block sm:col-span-2">
          <Label>ელფოსტა</Label>
          <input
            type="email" required autoComplete="email" value={form.email}
            onChange={e => set('email')(e.target.value)}
            {...props('email')} className={inputClass('email')} placeholder="you@company.ge"
          />
          {err('email')}
        </label>
        {services.length > 0 && (
          <label className="block sm:col-span-2">
            <Label optional>სერვისი</Label>
            <select
              value={form.serviceId}
              onChange={e => set('serviceId')(e.target.value)}
              {...props('serviceId')}
              className={inputClass('serviceId')}
            >
              <option value="">— აირჩიეთ (არასავალდებულო) —</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>
                  {s.direction} · {s.title}{s.format ? ` (${s.format})` : ''} — {servicePriceLabel(s)}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block sm:col-span-2">
          <Label optional>რომელი მიმართულება</Label>
          {/* Free text, NOT a list of the site's spheres. The taxonomy is
              admin-editable and a hardcoded copy of it here would drift the
              first time a sphere is renamed — and a company describes its need
              in its own words anyway („გადასახადები" vs „ბუღალტერია"). */}
          <input
            type="text" value={form.interest}
            onChange={e => set('interest')(e.target.value)}
            {...props('interest')} className={inputClass('interest')} placeholder="მაგ. იურიდიული, ფინანსები, მარკეტინგი"
          />
          {err('interest')}
        </label>
      </div>

      <label className="block mt-4">
        <Label optional>დამატებით</Label>
        <textarea
          rows={5} maxLength={4000} value={form.message}
          onChange={e => set('message')(e.target.value)}
          {...props('message')}
          className={`w-full px-3.5 py-3 rounded-field border bg-white text-body text-ink-900 placeholder-ink-400 focus:ring-2 outline-none resize-y transition-colors duration-fast ${bad('message') ? FIELD_ERROR_BORDER : 'border-ink-200 focus:border-brand-500 focus:ring-brand-100'}`}
          placeholder="რა გჭირდებათ და რამდენი ადამიანისთვის"
        />
        {err('message')}
      </label>

      {/* Left for what has no field: a rate limit, a dropped network. */}
      {status === 'error' && errorText && !fault && (
        <div role="alert" className="mt-4 rounded-field border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-body text-danger-700">
          {errorText}
        </div>
      )}

      <div className="mt-5">
        {/* aria-busy + the label change carry the state, not a spinner: a
            frozen arc is a lie about „working" when motion is reduced.
            CLAUDE.md's motion section spells this out. */}
        <Btn type="submit" disabled={status === 'sending'} aria-busy={status === 'sending'}>
          {status === 'sending' ? 'იგზავნება…' : 'გაგზავნა'}
        </Btn>
      </div>
    </form>
  )
}

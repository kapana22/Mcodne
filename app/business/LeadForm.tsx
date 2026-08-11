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

import { useState } from 'react'
import { PhoneInput } from '@/components/PhoneInput'
import { Btn } from '@/components/Btn'
import { BusinessLeadInput } from '@/lib/b2b'

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

export function LeadForm() {
  const [form, setForm] = useState({
    companyName: '', taxId: '', contactName: '', phone: '', email: '', interest: '', message: '',
  })
  const [status, setStatus] = useState<Status>('idle')
  const [errorText, setErrorText] = useState<string | null>(null)

  const set = (k: keyof typeof form) => (v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    // Clear a previous failure the moment they start fixing it — an error
    // sitting under a field they have already corrected is just noise.
    if (status === 'error') { setStatus('idle'); setErrorText(null) }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (status === 'sending') return

    // Validated HERE with the server's own schema, so „ნომერი არასწორია" is
    // answered before a round-trip rather than after one.
    const parsed = BusinessLeadInput.safeParse(form)
    if (!parsed.success) {
      setStatus('error')
      setErrorText(leadErrorText('INVALID'))
      return
    }

    setStatus('sending')
    setErrorText(null)
    try {
      const res = await fetch('/api/business/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) {
        setStatus('error')
        setErrorText(leadErrorText(j?.error))
        return
      }
      setStatus('ok')
      setForm({ companyName: '', taxId: '', contactName: '', phone: '', email: '', interest: '', message: '' })
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
            className={INPUT} placeholder="შპს მაგალითი"
          />
        </label>
        <label className="block">
          <Label optional>საიდენტიფიკაციო კოდი</Label>
          <input
            type="text" inputMode="numeric" value={form.taxId}
            onChange={e => set('taxId')(e.target.value)}
            className={INPUT} placeholder="123456789"
          />
        </label>
        <label className="block">
          <Label>საკონტაქტო პირი</Label>
          <input
            type="text" required autoComplete="name" value={form.contactName}
            onChange={e => set('contactName')(e.target.value)}
            className={INPUT} placeholder="სახელი და გვარი"
          />
        </label>
        <label className="block">
          <Label>ტელეფონი</Label>
          {/* THE phone input — same keyboard, same autofill hint and same
              filtering as every other number field on the site. */}
          <PhoneInput value={form.phone} onChange={set('phone')} className={INPUT} />
        </label>
        <label className="block sm:col-span-2">
          <Label>ელფოსტა</Label>
          <input
            type="email" required autoComplete="email" value={form.email}
            onChange={e => set('email')(e.target.value)}
            className={INPUT} placeholder="you@company.ge"
          />
        </label>
        <label className="block sm:col-span-2">
          <Label optional>რომელი მიმართულება</Label>
          {/* Free text, NOT a list of the site's spheres. The taxonomy is
              admin-editable and a hardcoded copy of it here would drift the
              first time a sphere is renamed — and a company describes its need
              in its own words anyway („გადასახადები" vs „ბუღალტერია"). */}
          <input
            type="text" value={form.interest}
            onChange={e => set('interest')(e.target.value)}
            className={INPUT} placeholder="მაგ. იურიდიული, ფინანსები, მარკეტინგი"
          />
        </label>
      </div>

      <label className="block mt-4">
        <Label optional>დამატებით</Label>
        <textarea
          rows={5} maxLength={4000} value={form.message}
          onChange={e => set('message')(e.target.value)}
          className="w-full px-3.5 py-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none resize-y transition-colors duration-fast"
          placeholder="რა გჭირდებათ და რამდენი ადამიანისთვის"
        />
      </label>

      {status === 'error' && errorText && (
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

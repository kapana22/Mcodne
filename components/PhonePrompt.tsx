'use client'
// Asks a signed-in user for their phone number when the account has none.
//
// WHY IT EXISTS. The number became required at signup on 2026-08-09, but the
// signup form is not the only door: Google SSO never shows it, and every
// account created before that date has an empty column. Enforcing it on the
// form alone would mean „required" was true for one third of new users and
// nobody else — so the requirement lives here, where it can reach everyone.
//
// It ASKS rather than traps. „შემდეგ" closes it for the rest of the browser
// session and it returns on the next visit. A hard wall would be the version
// that loses the account instead of the number: the person is already signed in,
// possibly mid-booking, and nothing they were doing is unsafe without a phone.
//
// Built on <Sheet> rather than a hand-rolled dialog — that is where the focus
// trap, the Escape handler and the mobile bottom-sheet geometry already live.

import { useEffect, useState } from 'react'
import { useMe, fetchMe } from '@/lib/me'
import { PhoneInput } from '@/components/PhoneInput'
import { phoneFormatError } from '@/lib/phone'
import { Sheet } from '@/components/Sheet'
import { Btn } from '@/components/Btn'

const SNOOZE_KEY = 'phone-prompt-snoozed'

export function PhonePrompt() {
  const { me, ready } = useMe()
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!ready || !me) return
    if (me.phone && me.phone.trim()) return
    if (sessionStorage.getItem(SNOOZE_KEY)) return
    // A beat after paint: opening this on top of a still-rendering page reads as
    // a glitch, and the user has not seen where they landed yet.
    const t = setTimeout(() => setOpen(true), 1200)
    return () => clearTimeout(t)
  }, [ready, me])

  const snooze = () => {
    sessionStorage.setItem(SNOOZE_KEY, '1')
    setOpen(false)
  }

  const save = async () => {
    const msg = phoneFormatError(phone, { required: true })
    if (msg) { setErr(msg); return }
    setSaving(true); setErr(null)
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // The route names the field and hands back the sentence to show.
        setErr(data.message ?? 'ვერ შევინახეთ — სცადე თავიდან.')
        setSaving(false)
        return
      }
      await fetchMe()
      setOpen(false)
    } catch {
      setErr('ქსელის შეცდომა — სცადე თავიდან.')
      setSaving(false)
    }
  }

  if (!me) return null

  return (
    <Sheet
      open={open}
      onClose={snooze}
      title="ტელეფონის ნომერი"
      size="sm"
      busy={saving}
      footer={
        <div className="flex items-center gap-2">
          <Btn variant="primary" onClick={save} disabled={saving} className="flex-1">
            {saving ? 'ინახება…' : 'შენახვა'}
          </Btn>
          <Btn variant="ghost" onClick={snooze}>შემდეგ</Btn>
        </div>
      }
    >
      <p className="text-small text-ink-600">ექსპერტს სჭირდება შეხვედრამდე დასაკავშირებლად.</p>

      <div className="mt-5">
        <label htmlFor="phone-prompt-input" className="block font-display text-micro font-semibold uppercase text-ink-700 mb-2">
          ტელეფონი
        </label>
        <PhoneInput
          id="phone-prompt-input"
          value={phone}
          onChange={v => { setPhone(v); if (err) setErr(null) }}
          className="w-full h-11 px-3.5 rounded-field border border-ink-200 text-body text-ink-900 placeholder:text-ink-400 focus:border-brand-500 transition-colors duration-fast"
        />
        {err && <p role="alert" className="mt-2 text-small text-danger-700">{err}</p>}
      </div>
    </Sheet>
  )
}

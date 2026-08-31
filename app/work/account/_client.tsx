'use client'
// „ანგარიში" — the two controls that touch nothing a client reads.
//
// ⚠️ WHY THIS PAGE EXISTS (2026-08-30). It is the residue of the merge: when
// /work/services and /work/profile became one editor for one row, everything
// that writes the public card went there — and exactly two things did not. The
// password, which is not a profile field at all, and the visibility switch,
// which is one field but is a DECISION rather than a piece of content.
//
// ⚠️ AND THE SWITCH IS THE REASON THIS IS NOT JUST A TIDY. `available` was
// edited in BOTH old screens: a checkbox on /work/services that took effect on
// save, an instant toggle here. One column, two controls, two interaction
// models — and, worse, two different claims about what it does:
//
//   /work/services  „დროებით გამორთულია — მოთხოვნები არ მოგდის."
//   /work/profile   „ძებნაში აღარ ჩანხარ."
//
// Both were half the truth, and the services half was the dangerous one. The
// column is read by `PUBLIC` in app/experts/_providers.ts and `VISIBLE` in
// app/experts/[slug]/_providerData.ts as well as by the routing, so switching
// it off ALSO takes the profile out of the catalogue and 404s their public
// page. A provider pausing their queue for a fortnight disappeared from the
// site and was told only about the queue.
//
// One switch, one place, and copy that names both halves.

import { useCallback, useEffect, useState } from 'react'
import { Btn } from '@/components/Btn'
import { Eyebrow } from '@/components/Eyebrow'
import { useToast } from '@/components/ToastProvider'
import { Field } from '../profile/_parts'
import { PWD_MIN, PWD_MIN_MSG } from '../profile/_types'

const INPUT =
  'w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body focus:border-brand-400 focus:outline-none'

export function AccountClient() {
  const { toast } = useToast()
  const [email, setEmail] = useState<string | null>(null)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' })
  const [savingPassword, setSavingPassword] = useState(false)
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const [me, prov] = await Promise.all([
        fetch('/api/me').then(r => r.json()).catch(() => ({})),
        fetch('/api/me/provider').then(r => r.json()).catch(() => ({})),
      ])
      setEmail(me?.user?.email ?? me?.email ?? null)
      setAvailable(prov?.profile?.available !== false)
    } catch { /* the switch simply does not draw until it knows its own state */ }
  }, [])
  useEffect(() => { load() }, [load])

  // ⚠️ IT SAVES ON THE FLIP, AND THAT IS DELIBERATELY UNLIKE THE EDITOR. „I am
  // going off for two weeks" is one decision with one consequence, not a draft
  // to be composed — and a switch that needed a second press to take effect is
  // what the services form had, where a provider could flip it, leave, and
  // still be public. The optimistic state is rolled back if the write fails.
  const toggle = async () => {
    if (available === null) return
    const next = !available
    setAvailable(next)
    try {
      const res = await fetch('/api/me/provider', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: next }),
      })
      if (!res.ok) {
        setAvailable(!next)
        toast('შენახვა ვერ მოხერხდა', 'error')
        return
      }
      toast(next ? 'გვერდი ისევ ჩანს' : 'გვერდი დამალულია', 'success')
    } catch {
      setAvailable(!next)
      toast('ქსელის შეცდომა', 'error')
    }
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwdMsg(null)
    if (pwd.next !== pwd.confirm) {
      setPwdMsg({ ok: false, text: 'პაროლები არ ემთხვევა' })
      return
    }
    if (pwd.next.length < PWD_MIN) {
      setPwdMsg({ ok: false, text: PWD_MIN_MSG })
      return
    }
    setSavingPassword(true)
    try {
      const res = await fetch('/api/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current: pwd.current, next: pwd.next }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) {
        setPwdMsg({
          ok: false,
          text: j.error === 'BAD_CURRENT' ? 'მიმდინარე პაროლი არასწორია'
            : j.error === 'INVALID' ? PWD_MIN_MSG
            : 'პაროლის შეცვლა ვერ მოხერხდა',
        })
        return
      }
      setPwd({ current: '', next: '', confirm: '' })
      toast('პაროლი შეიცვალა', 'success')
    } catch {
      setPwdMsg({ ok: false, text: 'პაროლის შეცვლა ვერ მოხერხდა' })
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-2xl">

      {/* ── Visibility ──────────────────────────────────────────────────── */}
      <section className="p-6 rounded-card border border-ink-200 bg-white">
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <Eyebrow tone="muted" className="mb-1">გვერდის ხილვადობა</Eyebrow>
            <div className="font-display text-body-lg font-bold text-ink-900">
              {available === false ? 'გვერდი დამალულია' : 'გვერდი ჩანს'}
            </div>
            {/* ⚠️ BOTH HALVES, IN ONE SENTENCE. The old copy named one each —
                the catalogue on this page, the request queue on the other — and
                the column does both. Naming only one is how somebody pauses
                their queue and finds out weeks later that they were also off
                the catalogue the whole time. */}
            <p className="mt-1.5 text-small text-ink-600 leading-snug">
              {available === false
                ? 'არც ძებნაში ჩანხარ, არც შენს გვერდზე შემოვლენ და არც ახალი მოთხოვნები მოგდის. მიმდინარე სამუშაოები გრძელდება.'
                : 'ჩანხარ ძებნაში, გვერდი ღიაა და მოთხოვნები მოგდის. გამორთე დროებითი შესვენებისთვის — სია და მიმდინარე სამუშაოები შენარჩუნდება.'}
            </p>
          </div>
          <button
            type="button"
            onClick={toggle}
            disabled={available === null}
            role="switch"
            aria-checked={available === true}
            aria-label="გვერდის ხილვადობა"
            className={`relative w-14 h-8 rounded-full transition-colors duration-fast shrink-0 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
              available !== false ? 'bg-success-500' : 'bg-ink-300'
            }`}
          >
            <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-xs transition-all duration-fast ${
              available !== false ? 'left-7' : 'left-1'
            }`} />
          </button>
        </div>
      </section>

      {/* ── Password ────────────────────────────────────────────────────── */}
      <form onSubmit={changePassword} className="p-6 rounded-card border border-ink-200 bg-white space-y-4">
        <Eyebrow tone="muted" className="mb-2">პაროლის შეცვლა</Eyebrow>
        {email && <p className="-mt-1 text-small text-ink-500 truncate">{email}</p>}

        <Field label="მიმდინარე პაროლი">
          <input type="password" required autoComplete="current-password" className={INPUT}
                 value={pwd.current} onChange={e => setPwd({ ...pwd, current: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="ახალი პაროლი">
            <input type="password" required autoComplete="new-password" minLength={PWD_MIN} className={INPUT}
                   value={pwd.next} onChange={e => setPwd({ ...pwd, next: e.target.value })} />
            <p className="mt-1.5 text-meta text-ink-500">მინიმუმ 8 სიმბოლო</p>
          </Field>
          <Field label="დაადასტურე ახალი პაროლი">
            <input type="password" required autoComplete="new-password" minLength={PWD_MIN} className={INPUT}
                   value={pwd.confirm} onChange={e => setPwd({ ...pwd, confirm: e.target.value })} />
          </Field>
        </div>

        {pwdMsg && (
          <div className={`text-small font-display font-semibold ${pwdMsg.ok ? 'text-success-700' : 'text-danger-700'}`}>
            {pwdMsg.text}
          </div>
        )}

        <div className="pt-2 flex items-center justify-end gap-2 border-t border-ink-100">
          <Btn variant="primary" size="md" type="submit" disabled={savingPassword}>
            {savingPassword ? 'იცვლება…' : 'შეცვლა'}
          </Btn>
        </div>
      </form>

      {/* ⚠️ „სახელი და გვარი" WAS HERE AND WENT UP TO THE CARD (2026-08-30). It
          is the largest text a client reads on a provider's card, and it was
          being edited two tabs away from the sentence printed under it, behind
          a save button of its own. It is the first field of the editor now.

          ⚠️ THE „პასუხის დრო" PICKER WAS DELETED 2026-07-29: it asked for a
          promise nothing on the site displayed, so its own copy („ჩანს
          პროფილსა და ძებნაში") was false. */}
    </div>
  )
}

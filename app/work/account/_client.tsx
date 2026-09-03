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
//
// ⚠️ AND IT NO LONGER GUESSES ITS OWN POSITION (2026-09-01). This file opened
// with `available = null`, fetched /api/me and /api/me/provider after mount, and
// drew the track on `available !== false` — so `null` rendered as ON. Measured
// today against the local database: the served HTML of this page reads „გვერდი
// ჩანს" and „ჩანხარ ძებნაში, გვერდი ღიაა და მოთხოვნები მოგდის" for everybody,
// a switched-off provider included, and the `catch {}` around the load left
// that sentence standing for the whole visit — with the control disabled
// underneath it, so there was nothing to press and nothing saying why.
//
// A note in this file used to excuse it: „the switch simply does not draw until
// it knows its own state". It DID draw. Both facts are the page's props now
// (see ./page.tsx) and there is no unknown state left to render.

import { useState } from 'react'
import { Btn } from '@/components/Btn'
import { Eyebrow } from '@/components/Eyebrow'
import { useToast } from '@/components/ToastProvider'
import { Field } from '../profile/_parts'
import { PWD_MIN, passwordError } from '../profile/_types'
import { PasswordChangeInput } from '@/lib/passwordPolicy'
import { FIELD_ERROR_BORDER, useFault } from '@/components/FieldError'

// ⚠️ 48px, NOT 44 (2026-08-31, the owner's design canvas → „Work Profile", the
// ACCOUNT screen). The canvas draws every field on this page at 48 with a 14px
// radius; `h-12` and `rounded-field` are exactly those two numbers, so this is
// the token pair rather than a measurement copied off an artboard.
const INPUT =
  'w-full h-12 px-4 rounded-field border border-ink-200 bg-white text-body focus:border-brand-400 focus:outline-none'

export function AccountClient({ email, available: initialAvailable }: {
  /** The signed-in address, printed under the password heading. Read on the
   *  server — a page that shows one row does not need a round trip for it. */
  email: string
  /** `ServiceProfile.available` as it stands right now. Never null: the switch
   *  must show the truth on the first paint or not be a switch. */
  available: boolean
}) {
  const { toast } = useToast()
  const [available, setAvailable] = useState(initialAvailable)
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' })
  const [savingPassword, setSavingPassword] = useState(false)
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null)
  // Which box is wrong, and why — see components/FieldError. Three password
  // fields under one line of red text was „one of these three", which is the
  // one thing the person already knew.
  const { fault, fail, props, bad, clearField, reset: clearFault, error } = useFault('work-pw')
  const set = (k: 'current' | 'next' | 'confirm') => (v: string) => {
    setPwd(p => ({ ...p, [k]: v }))
    clearField(k)
    if (pwdMsg && !pwdMsg.ok) setPwdMsg(null)
  }

  // ⚠️ IT SAVES ON THE FLIP, AND THAT IS DELIBERATELY UNLIKE THE EDITOR. „I am
  // going off for two weeks" is one decision with one consequence, not a draft
  // to be composed — and a switch that needed a second press to take effect is
  // what the services form had, where a provider could flip it, leave, and
  // still be public. The optimistic state is rolled back if the write fails.
  const toggle = async () => {
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

  /* ⚠️ THIS FORM COULD NOT CHANGE A PASSWORD AT ALL, AND SAID THE WRONG THING
   * ABOUT IT (fixed 2026-08-31). The body was `{ current, next }`; the route it
   * posts to parses `{ currentPassword, newPassword }` (app/api/me/password —
   * `z.object` with those two keys and nothing else). So EVERY submit failed
   * zod on two missing keys, came back 400 INVALID — and the branch below
   * translated INVALID into „პაროლი უნდა იყოს მინიმუმ 8 სიმბოლო". A provider
   * typing a perfectly good sixteen-character password was told it was too
   * short, forever, with no way to get past it.
   *
   * Two things were needed and only one of them is the key names. `INVALID` is
   * no longer read as „too short": the length is checked HERE, against the same
   * `passwordError` the route's schema bounds are built from, so a real INVALID
   * from the server now means something this screen did not predict and says so
   * rather than inventing a cause. */
  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwdMsg(null); clearFault()
    if (!pwd.current) {
      fail('current', 'შეიყვანე მიმდინარე პაროლი')
      return
    }
    // The length first, then the match: „they do not match" on a pair that are
    // both too short sends somebody to retype the same too-short password.
    const lenMsg = passwordError(pwd.next)
    if (lenMsg) {
      fail('next', lenMsg)
      return
    }
    if (pwd.next !== pwd.confirm) {
      fail('confirm', 'პაროლები არ ემთხვევა')
      return
    }
    // ⚠️ BUILT BY THE ROUTE'S OWN SCHEMA, not by an object literal that happens
    // to use the right words. That is what makes the bug above unrepeatable: a
    // renamed key fails HERE, in the browser, instead of arriving as a 400 that
    // the screen then mistranslates.
    const parsed = PasswordChangeInput.safeParse({ currentPassword: pwd.current, newPassword: pwd.next })
    if (!parsed.success) { fail('next', passwordError(pwd.next) ?? 'პაროლის შეცვლა ვერ მოხერხდა'); return }
    setSavingPassword(true)
    try {
      const res = await fetch('/api/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) {
        if (j.error === 'BAD_CURRENT') { fail('current', 'მიმდინარე პაროლი არასწორია'); return }
        setPwdMsg({
          ok: false,
          text: j.error === 'RATE_LIMITED' ? 'ბევრი მცდელობა — სცადე მოგვიანებით.'
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
    /* ⚠️ THE PAGE IS PANELS NOW (2026-08-31, the owner's design canvas → „Work
       Profile", the ACCOUNT screen): a 28px white plate on an ink hairline per
       SETTING, the name and its consequence on the left, the control on the
       right. It was two 24px ink-200 cards, and the visibility switch shared
       its card with nothing while the password shared one with three fields —
       so the page had no rule about what a card here contains.

       ⚠️ WHAT THE CANVAS DRAWS AND THIS PAGE DOES NOT: TWO SWITCHES. The
       artboard shows „ახალი მოთხოვნები მოგდის" and „გვერდი ჩანს კატალოგში" as
       separate settings. There is ONE column — `available` — and it does both,
       which is precisely the bug tests/providerEditor §E exists for: it was
       edited from two screens with two different claims, and the one that said
       only „requests stop coming" is how somebody paused their queue and
       vanished from the catalogue for a fortnight without being told. Two
       switches over one column would put that back with the two claims now
       side by side, contradicting each other on one screen. One switch, one
       place, copy that names both halves — see the head of this file. */
    <div className="flex flex-col gap-5 max-w-2xl">

      {/* ── Visibility ──────────────────────────────────────────────────── */}
      <section className="p-6 sm:p-7 rounded-panel border border-ink-100 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-4">
          <div className="min-w-[240px] flex-1">
            {/* ⚠️ `as="h2"` (2026-09-01). This page's two settings were the only
                panels in either room labelled by a non-heading: /work/balance
                writes `<Eyebrow as="h2">` for the identical shape one rail row
                away, so a screen-reader user rotoring headings found „ბალანსი
                / როგორ მუშაობს / პროფილის ბონუსი / მოძრაობა" there and only
                „ანგარიში" here. `Eyebrow` puts its classes on whatever tag it
                is handed — nothing on screen moves. */}
            <Eyebrow as="h2" tone="muted" className="mb-1">გვერდის ხილვადობა</Eyebrow>
            <div className="font-display text-h3 font-extrabold tracking-[-0.01em] text-ink-900">
              {available === false ? 'გვერდი დამალულია' : 'გვერდი ჩანს'}
            </div>
            {/* ⚠️ BOTH HALVES, IN ONE SENTENCE. The old copy named one each —
                the catalogue on this page, the request queue on the other — and
                the column does both. Naming only one is how somebody pauses
                their queue and finds out weeks later that they were also off
                the catalogue the whole time. */}
            <p className="mt-2 text-body text-ink-600 leading-relaxed">
              {available === false
                ? 'ძებნაში არ ჩანხარ და ახალი მოთხოვნები არ მოგდის. მიმდინარე სამუშაოები გრძელდება.'
                : 'ჩანხარ ძებნაში და მოთხოვნები მოგდის.'}
            </p>
          </div>
          {/* ⚠️ 60×34 IS THE CANVAS'S TRACK AND `tap-area` IS THE REASON IT IS
              ALLOWED. 34px tall is under this project's 40px floor and the one
              before it (56×32) was further under — a switch that decides
              whether somebody is on the site at all was the smallest target on
              the page. `.tap-area` (globals.css) hangs an invisible ::before
              at inset -12px, so the finger gets ~58px while the layout gets the
              track the canvas drew. Padding would have moved the panel. */}
          {/* `disabled={available === null}` and its `disabled:opacity-50` left
              with the null state (2026-09-01): the position arrives with the
              page now, so there is no moment when this control is real on
              screen and not yet pressable. A disabled attribute that can never
              be true is a control lying about a state it no longer has. */}
          <button
            type="button"
            onClick={toggle}
            role="switch"
            aria-checked={available}
            aria-label="გვერდის ხილვადობა"
            className={`tap-area relative w-[60px] h-[34px] rounded-pill transition-colors duration-fast shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
              available !== false ? 'bg-success-500' : 'bg-ink-300'
            }`}
          >
            <span className={`absolute top-1 w-[26px] h-[26px] rounded-pill bg-white shadow-xs transition-all duration-fast ${
              available !== false ? 'left-[30px]' : 'left-1'
            }`} />
          </button>
        </div>
      </section>

      {/* ── Password ────────────────────────────────────────────────────── */}
      <form onSubmit={changePassword} noValidate className="p-6 sm:p-7 rounded-panel border border-ink-100 bg-white space-y-4">
        <Eyebrow as="h2" tone="muted" className="mb-2">პაროლის შეცვლა</Eyebrow>
        <p className="-mt-1 text-small text-ink-500 truncate">{email}</p>

        {/* `noValidate`: the browser's own bubble fires before this form's
            handler can name the field, and it speaks the BROWSER's language on
            a Georgian screen. The rules below are the server's own, so nothing
            is lost by turning it off. */}
        <Field label="მიმდინარე პაროლი">
          <input type="password" required autoComplete="current-password"
                 className={`${INPUT} ${bad('current') ? FIELD_ERROR_BORDER : ''}`} {...props('current')}
                 value={pwd.current} onChange={e => set('current')(e.target.value)} />
          {error('current')}
        </Field>
        {/* ⚠️ auto-fit, NOT `sm:grid-cols-2` (2026-08-31, the canvas). The
            panel is `max-w-2xl` inside a workspace whose rail appears at `lg`,
            so the breakpoint the viewport reports and the width these two boxes
            actually have are different questions — at `sm` the pair went
            two-up in about 300px each. 220px is the canvas's own floor. */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          <Field label="ახალი პაროლი">
            <input type="password" required autoComplete="new-password" minLength={PWD_MIN}
                   className={`${INPUT} ${bad('next') ? FIELD_ERROR_BORDER : ''}`} {...props('next')}
                   value={pwd.next} onChange={e => set('next')(e.target.value)} />
            {error('next')}
            <p className="mt-1.5 text-meta text-ink-500">მინიმუმ {PWD_MIN} სიმბოლო</p>
          </Field>
          <Field label="დაადასტურე ახალი პაროლი">
            <input type="password" required autoComplete="new-password" minLength={PWD_MIN}
                   className={`${INPUT} ${bad('confirm') ? FIELD_ERROR_BORDER : ''}`} {...props('confirm')}
                   value={pwd.confirm} onChange={e => set('confirm')(e.target.value)} />
            {error('confirm')}
          </Field>
        </div>

        {/* Left for what is NOT a field: a rate limit, a network drop, a code
            this screen did not predict. Anything with a field goes on it. */}
        {pwdMsg && !fault && (
          <div role="alert" className={`text-small font-display font-semibold ${pwdMsg.ok ? 'text-success-700' : 'text-danger-700'}`}>
            {pwdMsg.text}
          </div>
        )}

        {/* ⚠️ NO DIVIDER ABOVE THE BUTTON (2026-08-31, the canvas). A hairline
            between a form's last field and its submit says the two are
            different sections; they are one act. The canvas ends the panel with
            the button alone, right-aligned, at the field height. */}
        <div className="pt-2 flex items-center justify-end gap-2">
          <Btn variant="primary" size="lg" type="submit" disabled={savingPassword}>
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

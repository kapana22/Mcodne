'use client'
import type { Dispatch, SetStateAction } from 'react'
// /settings — the change-password card.

import { Icon } from '@/components/Icon'
import { FIELD_ERROR_BORDER } from '@/components/FieldError'
import { PWD_MIN } from '@/lib/passwordPolicy'
import type { FaultKit, Msg } from './_types'

type Props = {
  currentPw: string
  setCurrentPw: Dispatch<SetStateAction<string>>
  newPw: string
  setNewPw: Dispatch<SetStateAction<string>>
  confirmPw: string
  setConfirmPw: Dispatch<SetStateAction<string>>
  showCurrentPw: boolean
  setShowCurrentPw: Dispatch<SetStateAction<boolean>>
  showNewPw: boolean
  setShowNewPw: Dispatch<SetStateAction<boolean>>
  showConfirmPw: boolean
  setShowConfirmPw: Dispatch<SetStateAction<boolean>>
  savingPw: boolean
  pwMsg: Msg
  savePassword: (e: React.FormEvent) => void
  /** Which of the three boxes a refusal is about — see ./client.tsx. */
  fault: FaultKit
}

export function PasswordSection({ currentPw, setCurrentPw, newPw, setNewPw, confirmPw, setConfirmPw, showCurrentPw, setShowCurrentPw, showNewPw, setShowNewPw, showConfirmPw, setShowConfirmPw, savingPw, pwMsg, savePassword, fault }: Props) {
  const { props, bad, clearField, error } = fault
  return (
    <section className="bg-white rounded-card border border-ink-200 p-6 lg:p-8">
      <div className="mb-6">
        <h2 className="font-display text-h3 font-bold text-ink-900 tracking-tight">პაროლის შეცვლა</h2>
        {/* PATCH /api/me/password calls revokeOtherSessions — the old copy
            („სხვა სესიები აქტიური დარჩება") promised the exact opposite. */}
        <p className="text-small text-ink-500 mt-0.5">შეცვლის შემდეგ სხვა მოწყობილობებზე ხელახლა უნდა შეხვიდე</p>
      </div>

      {/* `noValidate` — the handler names the field; the browser's own bubble
          fires first otherwise and it is not in this site's language. */}
      <form onSubmit={savePassword} noValidate className="space-y-4">
        {/* ⚠️ <div> + <label htmlFor>, not a wrapping <label> (2026-08-31). The
            show/hide eye is a BUTTON, and a <label> may not contain one: it
            named the password box with its own text PLUS the button's, so the
            field was „მიმდინარე პაროლი აჩვენე" — and renamed itself to
            „…დამალე" the moment anybody pressed the eye. The error message,
            wrapped in there too, was appended to the name as well. */}
        <div className="block">
          <label htmlFor="set-current-pw" className="font-display text-micro font-semibold uppercase text-ink-700">მიმდინარე პაროლი</label>
          <div className="relative mt-2">
            <input
              id="set-current-pw"
              type={showCurrentPw ? 'text' : 'password'}
              value={currentPw}
              onChange={e => { setCurrentPw(e.target.value); clearField('currentPassword') }}
              autoComplete="current-password"
              {...props('currentPassword')}
              className={`w-full h-11 pl-3.5 pr-12 rounded-field bg-white border focus:ring-2 focus:outline-none text-body text-ink-900 transition-colors duration-fast ${bad('currentPassword') ? FIELD_ERROR_BORDER : 'border-ink-200 focus:border-brand-500 focus:ring-brand-100'}`}
            />
            <button
              type="button"
              onClick={() => setShowCurrentPw(s => !s)}
              aria-label={showCurrentPw ? 'დამალე' : 'აჩვენე'}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-btn text-ink-500 hover:text-ink-800 hover:bg-ink-100 inline-flex items-center justify-center transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {showCurrentPw ? <Icon.eyeOff className="w-4 h-4" /> : <Icon.eye className="w-4 h-4" />}
            </button>
          </div>
          {error('currentPassword')}
        </div>
        <div className="block">
          <label htmlFor="set-new-pw" className="font-display text-micro font-semibold uppercase text-ink-700">ახალი პაროლი</label>
          <div className="relative mt-2">
            <input
              id="set-new-pw"
              type={showNewPw ? 'text' : 'password'}
              value={newPw}
              onChange={e => { setNewPw(e.target.value); clearField('newPassword') }}
              autoComplete="new-password"
              minLength={PWD_MIN}
              {...props('newPassword')}
              className={`w-full h-11 pl-3.5 pr-12 rounded-field bg-white border focus:ring-2 focus:outline-none text-body text-ink-900 transition-colors duration-fast ${bad('newPassword') ? FIELD_ERROR_BORDER : 'border-ink-200 focus:border-brand-500 focus:ring-brand-100'}`}
            />
            <button
              type="button"
              onClick={() => setShowNewPw(s => !s)}
              aria-label={showNewPw ? 'დამალე' : 'აჩვენე'}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-btn text-ink-500 hover:text-ink-800 hover:bg-ink-100 inline-flex items-center justify-center transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {showNewPw ? <Icon.eyeOff className="w-4 h-4" /> : <Icon.eye className="w-4 h-4" />}
            </button>
          </div>
          {error('newPassword')}
          <div className="mt-1 text-meta text-ink-500">მინიმუმ {PWD_MIN} სიმბოლო</div>
        </div>
        <div className="block">
          <label htmlFor="set-confirm-pw" className="font-display text-micro font-semibold uppercase text-ink-700">გაიმეორე ახალი პაროლი</label>
          <div className="relative mt-2">
            <input
              id="set-confirm-pw"
              type={showConfirmPw ? 'text' : 'password'}
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              autoComplete="new-password"
              className={`w-full h-11 pl-3.5 pr-12 rounded-field bg-white border focus:ring-2 focus:outline-none text-body text-ink-900 transition-colors duration-fast ${confirmPw.length > 0 && confirmPw !== newPw ? 'border-danger-300 focus:border-danger-500 focus:ring-danger-100' : 'border-ink-200 focus:border-brand-500 focus:ring-brand-100'}`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPw(s => !s)}
              aria-label={showConfirmPw ? 'დამალე' : 'აჩვენე'}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-btn text-ink-500 hover:text-ink-800 hover:bg-ink-100 inline-flex items-center justify-center transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {showConfirmPw ? <Icon.eyeOff className="w-4 h-4" /> : <Icon.eye className="w-4 h-4" />}
            </button>
          </div>
          {confirmPw.length > 0 && confirmPw !== newPw && (
            <div role="alert" className="mt-1 text-meta text-danger-700">პაროლი არ ემთხვევა</div>
          )}
        </div>

        {/* Left for what has no field — a rate limit, a network drop, and the
            success line. Anything with a field is on the field. */}
        {pwMsg && !fault.fault && (
          <div role="alert" className={`rounded-btn border px-3 py-2 text-small font-medium ${pwMsg.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
            {pwMsg.text}
          </div>
        )}

        <div className="flex justify-end">
          <button type="submit" disabled={savingPw || !currentPw || newPw.length < PWD_MIN || newPw !== confirmPw} className="h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 disabled:text-ink-500 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-2 transition-colors duration-fast">
            {savingPw && <span aria-hidden className="inline-block w-4 h-4 rounded-full border-2 border-white/60 border-t-transparent motion-safe:animate-spin" />}
            {savingPw ? 'ინახება…' : 'პაროლის შენახვა'}
          </button>
        </div>
        {!savingPw && (!currentPw || newPw.length < PWD_MIN || newPw !== confirmPw) && (
          <p className="text-meta text-ink-500 text-right">
            {!currentPw ? 'შეიყვანე მიმდინარე პაროლი' : !newPw ? 'შეიყვანე ახალი პაროლი' : newPw.length < PWD_MIN ? 'ახალი პაროლი — მინიმუმ 8 სიმბოლო' : 'პაროლები უნდა ემთხვეოდეს'}
          </p>
        )}
      </form>
    </section>
  )
}

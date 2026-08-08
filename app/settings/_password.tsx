'use client'
import type { Dispatch, SetStateAction } from 'react'
// /settings — the change-password card.

import { Icon } from '@/components/Icon'
import type { Msg } from './_types'

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
}

export function PasswordSection({ currentPw, setCurrentPw, newPw, setNewPw, confirmPw, setConfirmPw, showCurrentPw, setShowCurrentPw, showNewPw, setShowNewPw, showConfirmPw, setShowConfirmPw, savingPw, pwMsg, savePassword }: Props) {
  return (
    <section className="bg-white rounded-card border border-ink-200 p-6 lg:p-8">
      <div className="mb-6">
        <h2 className="font-display text-h3 font-bold text-ink-900 tracking-tight">პაროლის შეცვლა</h2>
        {/* PATCH /api/me/password calls revokeOtherSessions — the old copy
            („სხვა სესიები აქტიური დარჩება") promised the exact opposite. */}
        <p className="text-small text-ink-500 mt-0.5">შეცვლის შემდეგ სხვა მოწყობილობებზე ხელახლა უნდა შეხვიდე</p>
      </div>

      <form onSubmit={savePassword} className="space-y-4">
        <label className="block">
          <span className="font-display text-micro font-semibold uppercase text-ink-700">მიმდინარე პაროლი</span>
          <div className="relative mt-2">
            <input
              type={showCurrentPw ? 'text' : 'password'}
              value={currentPw}
              onChange={e => setCurrentPw(e.target.value)}
              autoComplete="current-password"
              className="w-full h-11 pl-3.5 pr-12 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-body text-ink-900 transition-colors duration-fast"
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
        </label>
        <label className="block">
          <span className="font-display text-micro font-semibold uppercase text-ink-700">ახალი პაროლი</span>
          <div className="relative mt-2">
            <input
              type={showNewPw ? 'text' : 'password'}
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              className="w-full h-11 pl-3.5 pr-12 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-body text-ink-900 transition-colors duration-fast"
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
          <div className="mt-1 text-meta text-ink-500">მინიმუმ 8 სიმბოლო</div>
        </label>
        <label className="block">
          <span className="font-display text-micro font-semibold uppercase text-ink-700">გაიმეორე ახალი პაროლი</span>
          <div className="relative mt-2">
            <input
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
            <div className="mt-1 text-meta text-danger-700">პაროლი არ ემთხვევა</div>
          )}
        </label>

        {pwMsg && (
          <div role="alert" className={`rounded-btn border px-3 py-2 text-small font-medium ${pwMsg.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
            {pwMsg.text}
          </div>
        )}

        <div className="flex justify-end">
          <button type="submit" disabled={savingPw || !currentPw || !newPw || newPw !== confirmPw} className="h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 disabled:text-ink-500 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-2 transition-colors duration-fast">
            {savingPw && <span aria-hidden className="inline-block w-4 h-4 rounded-full border-2 border-white/60 border-t-transparent motion-safe:animate-spin" />}
            {savingPw ? 'ინახება…' : 'პაროლის შენახვა'}
          </button>
        </div>
      </form>
    </section>
  )
}

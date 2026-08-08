'use client'
import type { Dispatch, SetStateAction } from 'react'
// /settings — the account card: email verification, sign out, delete.

import { Icon } from '@/components/Icon'
import type { Me, Msg } from './_types'

type Props = {
  me: Me
  verifyStage: 'idle' | 'sent'
  verifyCode: string
  setVerifyCode: Dispatch<SetStateAction<string>>
  verifyingBusy: boolean
  verifyMsg: Msg
  startVerify: () => void
  submitVerify: () => void
  setSignOutOpen: Dispatch<SetStateAction<boolean>>
  openDelete: () => void
}

export function AccountSection({ me, verifyStage, verifyCode, setVerifyCode, verifyingBusy, verifyMsg, startVerify, submitVerify, setSignOutOpen, openDelete }: Props) {
  return (
    <section className="bg-white rounded-card border border-ink-200 p-6 lg:p-8">
      <div className="mb-4">
        <h2 className="font-display text-h3 font-bold text-ink-900 tracking-tight">ანგარიში</h2>
      </div>
      <dl className="text-small space-y-2">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-500 shrink-0">ელფოსტა</dt>
          <dd className="font-display font-semibold text-ink-900 truncate max-w-[280px]" title={me.email}>{me.email}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-500">როლი</dt>
          <dd className="font-display font-semibold text-ink-900">
            {me.role === 'ADMIN' ? 'ადმინი' : me.role === 'TUTOR' ? 'ექსპერტი' : 'სტუდენტი'}
          </dd>
        </div>
        <div className="flex justify-between items-center gap-3">
          <dt className="text-ink-500">ვერიფიცირებული</dt>
          <dd className="font-display font-semibold flex items-center gap-2">
            {me.emailVerified
              ? <span className="text-success-700 inline-flex items-center gap-1"><Icon.check aria-hidden className="w-3.5 h-3.5" /> დადასტურებული</span>
              : (
                <>
                  <span className="text-warning-700 inline-flex items-center gap-1"><Icon.x aria-hidden className="w-3.5 h-3.5" /> არ არის</span>
                  {verifyStage === 'idle' && (
                    <button
                      type="button"
                      onClick={startVerify}
                      disabled={verifyingBusy}
                      // h-10 sm:h-9 = the canon compact tier (40px on touch,
                      // 36 on desktop). h-8 put a real action at 32px.
                      className="h-10 sm:h-9 px-3.5 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 disabled:text-ink-500 text-white font-display font-semibold text-small transition-colors duration-fast"
                    >
                      {verifyingBusy ? 'იგზავნება…' : 'ახლა დადასტურება'}
                    </button>
                  )}
                </>
              )}
          </dd>
        </div>
      </dl>

      {!me.emailVerified && verifyStage === 'sent' && (
        <div className="mt-4 rounded-btn border border-ink-200 bg-ink-50/60 p-4">
          <div className="text-small text-ink-700 mb-2">
            შეიყვანე ელფოსტაზე მიღებული კოდი
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={verifyCode}
              onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              placeholder="123456"
              className="flex-1 h-11 px-3 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-body tabular-nums text-ink-900 transition-colors duration-fast"
            />
            <button
              type="button"
              onClick={submitVerify}
              disabled={verifyingBusy || verifyCode.length !== 6}
              className="h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 disabled:text-ink-500 text-white font-display font-semibold text-body transition-colors duration-fast"
            >
              დადასტურება
            </button>
            <button
              type="button"
              onClick={startVerify}
              disabled={verifyingBusy}
              className="h-11 px-3 rounded-btn bg-white border border-ink-200 hover:border-ink-300 disabled:opacity-50 text-ink-700 font-display font-semibold text-small transition-colors duration-fast"
            >
              ხელახლა
            </button>
          </div>
        </div>
      )}

      {verifyMsg && (
        <div role="alert" className={`mt-3 rounded-btn border px-3 py-2 text-small font-medium ${verifyMsg.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
          {verifyMsg.text}
        </div>
      )}

      <div className="mt-6 pt-5 border-t border-ink-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
        <button type="button" onClick={openDelete} className="tap-area font-display text-meta font-semibold text-danger-700 hover:text-danger-800 self-start transition-colors duration-fast">
          ანგარიშის წაშლა
        </button>
        <button type="button" onClick={() => setSignOutOpen(true)} className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:border-danger-300 hover:text-danger-700 text-ink-700 font-display font-semibold text-small transition-colors duration-fast self-end sm:self-auto">
          გამოსვლა
        </button>
      </div>
    </section>
  )
}

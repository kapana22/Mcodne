'use client'
// /tutor/profile — tab 3: display name and password.

import type { Dispatch, SetStateAction } from 'react'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import type { ToastKind } from '@/components/Toast'
import { Field } from './_parts'
import { PWD_MIN, PWD_MIN_MSG, type ProfileForm, type TutorProfile } from './_types'

type Props = {
  profile: TutorProfile
  setProfile: Dispatch<SetStateAction<TutorProfile>>
  form: ProfileForm
  fullNameInput: string
  setFullNameInput: Dispatch<SetStateAction<string>>
  savingName: boolean
  saveName: (e: React.FormEvent) => void
  pwd: { current: string; next: string; confirm: string }
  setPwd: Dispatch<SetStateAction<{ current: string; next: string; confirm: string }>>
  savingPassword: boolean
  pwdMsg: { ok: boolean; text: string } | null
  changePassword: (e: React.FormEvent) => void
  toast: (msg: string, kind?: ToastKind) => void
}

export function AccountTab({ profile, setProfile, form, fullNameInput, setFullNameInput, savingName, saveName, pwd, setPwd, savingPassword, pwdMsg, changePassword, toast }: Props) {
  return (
    <>

        {/* Display name — the account name (user.fullName), saved to /api/me
            (a DIFFERENT endpoint from the tutor-profile PATCH). Most
            fundamental account field, so it sits at the top of the tab. */}
        <form onSubmit={saveName} className="p-6 rounded-card border border-ink-200 bg-white space-y-4">
          <Eyebrow tone="muted" className="mb-2">სახელი</Eyebrow>

          <Field label="სახელი და გვარი">
            <input type="text" required minLength={2} maxLength={80}
                   value={fullNameInput} onChange={e => setFullNameInput(e.target.value)}
                   className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
            <p className="mt-1.5 text-meta text-ink-500 leading-snug">შენი სახელი — ასე გამოჩნდები სტუდენტებთან.</p>
          </Field>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-ink-100">
            <Btn variant="primary" size="md" type="submit" disabled={savingName || fullNameInput.trim().length < 2}>
              {savingName ? 'ინახება…' : 'შენახვა'}
            </Btn>
          </div>
        </form>

        {/* Public visibility — pause self-listing without touching bookings */}
        {profile && (
          <section id="section-visibility" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Eyebrow tone="muted" className="mb-1">პროფილის ხილვადობა</Eyebrow>
                <div className="font-display text-body font-semibold text-ink-900">
                  {profile.available === false ? 'პროფილი დამალულია' : 'პროფილი საჯაროა'}
                </div>
                <p className="text-meta text-ink-500 mt-1 leading-snug max-w-[480px]">
                  {profile.available === false
                    ? 'ძებნაში აღარ ჩანხარ. არსებული ჯავშნები აქტიურია; ახლიდან ვერავინ დაგიჯავშნის.'
                    : 'ჩანხარ ძებნის სიაში. გამორთე დროებითი შესვენებისთვის — ჯავშნები არ დაზარალდება.'}
                </p>
              </div>
              <button type="button"
                onClick={async () => {
                  const next = profile.available === false
                  // Optimistic update; revert on failure.
                  setProfile(prev => prev ? { ...prev, available: next } : prev)
                  try {
                    const res = await fetch('/api/me/tutor', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ available: next }),
                    })
                    if (!res.ok) {
                      setProfile(prev => prev ? { ...prev, available: !next } : prev)
                      toast('შენახვა ვერ მოხერხდა', 'error')
                    } else {
                      toast(next ? 'პროფილი ცოცხალდა' : 'პროფილი დამალულია', 'success')
                    }
                  } catch {
                    setProfile(prev => prev ? { ...prev, available: !next } : prev)
                    toast('ქსელის შეცდომა', 'error')
                  }
                }}
                className={`relative w-14 h-8 rounded-full transition-colors duration-fast shrink-0 ${profile.available !== false ? 'bg-success-500' : 'bg-ink-300'}`}
                aria-pressed={profile.available !== false}
                aria-label="ხილვადობის გადამრთველი">
                <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-xs transition-all duration-fast ${profile.available !== false ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
          </section>
        )}

        {/* The „პასუხის დრო" picker was DELETED 2026-07-29. It asked the
            expert to promise a number that was never published: the public
            pages showed the MEASURED median (lib/responseTime), never this
            field — so its own copy, „ჩანს პროფილსა და ძებნაში", was false.
            Response time is now shown nowhere at all, which leaves this
            control asking for input that goes into a void. */}

        {/* Password */}
        <form onSubmit={changePassword} className="p-6 rounded-card border border-ink-200 bg-white space-y-4">
          <Eyebrow tone="muted" className="mb-2">პაროლის შეცვლა</Eyebrow>

          <Field label="მიმდინარე პაროლი">
            <input type="password" required
                   value={pwd.current} onChange={e => setPwd({ ...pwd, current: e.target.value })}
                   className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body focus:border-brand-400 focus:outline-none" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="ახალი პაროლი">
              <input type="password" required minLength={PWD_MIN}
                     value={pwd.next} onChange={e => setPwd({ ...pwd, next: e.target.value })}
                     className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body focus:border-brand-400 focus:outline-none" />
              <p className="mt-1.5 text-meta text-ink-500">მინიმუმ 8 სიმბოლო</p>
            </Field>
            <Field label="დაადასტურე ახალი პაროლი">
              <input type="password" required minLength={PWD_MIN}
                     value={pwd.confirm} onChange={e => setPwd({ ...pwd, confirm: e.target.value })}
                     className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body focus:border-brand-400 focus:outline-none" />
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
    </>
  )
}

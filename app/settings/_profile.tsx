'use client'
import type { Dispatch, SetStateAction } from 'react'
// /settings — the profile card: photo, name, phone, bio.

import { defaultAvatarFor } from '@/lib/defaultAvatar'
import { Icon } from '@/components/Icon'
import { FIELD_ERROR_BORDER } from '@/components/FieldError'
import type { FaultKit, Me, Msg } from './_types'

type Props = {
  me: Me
  fullName: string
  setFullName: Dispatch<SetStateAction<string>>
  phone: string
  setPhone: Dispatch<SetStateAction<string>>
  bio: string
  setBio: Dispatch<SetStateAction<string>>
  avatarUrl: string | null
  savingProfile: boolean
  profileMsg: Msg
  fileInput: React.RefObject<HTMLInputElement | null>
  uploading: boolean
  saveProfile: (e: React.FormEvent) => void
  pickAvatar: () => void
  uploadAvatar: (file: File) => void
  removeAvatar: () => void
  /** Which of the three boxes a refusal is about — see ./client.tsx. */
  fault: FaultKit
}

export function ProfileSection({ me, fullName, setFullName, phone, setPhone, bio, setBio, avatarUrl, savingProfile, profileMsg, fileInput, uploading, saveProfile, pickAvatar, uploadAvatar, removeAvatar, fault }: Props) {
  const { props, bad, clearField, error } = fault
  return (
    <section className="bg-white rounded-card border border-ink-200 p-6 lg:p-8">
      <div className="flex items-baseline justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h2 className="font-display text-h3 font-bold text-ink-900 tracking-tight">პროფილი</h2>
          <p className="text-small text-ink-500 mt-0.5">როგორ გხედავენ სხვები</p>
        </div>
        <span className="hidden sm:block font-mono text-meta tabular-nums text-ink-400 truncate max-w-[220px] shrink" title={me.email}>{me.email}</span>
      </div>

      {/* `noValidate` — the handler names the field; the browser's own bubble
          would fire first and it is not in this site's language. */}
      <form onSubmit={saveProfile} noValidate className="space-y-5">
        {/* Avatar — hover overlay on desktop, tap-to-change on mobile.
            Uses a real <button> for keyboard access; the hidden <input type="file">
            is triggered via `pickAvatar`. Overlay uses a subtle motion-safe fade
            so users with reduced-motion prefs see it instantly instead. */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={pickAvatar}
            disabled={uploading}
            aria-label="ავატარის შეცვლა"
            className="group relative w-20 h-20 rounded-full overflow-hidden bg-ink-100 ring-1 ring-ink-200 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-wait"
          >
            <img src={avatarUrl || defaultAvatarFor(me.fullName)} alt={me.fullName} className="w-full h-full object-cover" />
            {/* Desktop: overlay on hover; Mobile: overlay always visible (opacity-100). */}
            {!uploading && (
              <span
                aria-hidden="true"
                // bg-black/65, not /45: over an average photo the white label measured
                // 3.35:1 — under the 4.5:1 body-text floor. The scrim is the only
                // thing we control here (the photo underneath is the user's).
                className="absolute inset-0 inline-flex flex-col items-center justify-center gap-0.5 bg-black/65 text-white opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-visible:opacity-100 motion-safe:transition-opacity motion-safe:duration-fast"
              >
                <Icon.camera className="w-4 h-4" />
                <span className="font-display text-micro font-semibold uppercase">შეცვლა</span>
              </span>
            )}
            {uploading && (
              <span aria-hidden="true" className="absolute inset-0 inline-flex items-center justify-center bg-black/55 text-white">
                <span className="inline-block w-5 h-5 rounded-full border-2 border-white/70 border-t-transparent motion-safe:animate-spin" />
              </span>
            )}
          </button>
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-2">
              {avatarUrl && (
                <button type="button" onClick={removeAvatar} disabled={uploading} className="h-10 sm:h-9 px-3 rounded-btn bg-white border border-ink-200 hover:border-danger-300 hover:text-danger-700 disabled:opacity-50 text-ink-700 font-display font-semibold text-small transition-colors duration-fast">
                  წაშლა
                </button>
              )}
            </div>
            <div className="text-meta text-ink-500">მაქს. 8MB · JPG/PNG/WEBP/GIF</div>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) uploadAvatar(f)
                e.currentTarget.value = ''
              }}
            />
          </div>
        </div>

        {/* ⚠️ A <label htmlFor>, not a <span> inside a <label> (2026-08-31).
            An implicit label names its control with EVERYTHING it wraps, and
            each of these wrapped its own error message — so „ტელეფონი" became
            „ტელეფონი — არასავალდებულო ნომერი არასწორია" the moment it was,
            and `aria-describedby` read the same words a second time. */}
        {/* Name */}
        <div className="block">
          <label htmlFor="set-fullname" className="font-display text-micro font-semibold uppercase text-ink-700">სახელი და გვარი</label>
          <input
            id="set-fullname"
            type="text"
            value={fullName}
            onChange={e => { setFullName(e.target.value); clearField('fullName') }}
            maxLength={80}
            {...props('fullName')}
            className={`w-full mt-2 h-11 px-3.5 rounded-field bg-white border focus:ring-2 focus:outline-none text-body text-ink-900 transition-colors duration-fast ${bad('fullName') ? FIELD_ERROR_BORDER : 'border-ink-200 focus:border-brand-500 focus:ring-brand-100'}`}
          />
          {error('fullName')}
        </div>

        {/* Phone */}
        <div className="block">
          <label htmlFor="set-phone" className="font-display text-micro font-semibold uppercase text-ink-700">ტელეფონი <span className="text-ink-400 normal-case tracking-normal">— არასავალდებულო</span></label>
          <input
            id="set-phone"
            type="tel" inputMode="tel" autoComplete="tel"
            value={phone}
            onChange={e => { setPhone(e.target.value); clearField('phone') }}
            maxLength={40}
            placeholder="+995 5XX XXX XXX"
            {...props('phone')}
            className={`w-full mt-2 h-11 px-3.5 rounded-field bg-white border focus:ring-2 focus:outline-none text-body text-ink-900 placeholder:text-ink-400 transition-colors duration-fast ${bad('phone') ? FIELD_ERROR_BORDER : 'border-ink-200 focus:border-brand-500 focus:ring-brand-100'}`}
          />
          {error('phone')}
        </div>

        {/* Bio */}
        <div className="block">
          <label htmlFor="set-bio" className="font-display text-micro font-semibold uppercase text-ink-700">შესახებ</label>
          {/* ⚠️ THE BIO HAS A RULE NOBODY COULD SEE. /api/me runs
              `georgianRefine('აღწერა')` over it — the site is Georgian-only at
              this stage — and its sentence used to arrive in the strip at the
              bottom of the card, four fields away from the box it is about. */}
          <textarea
            id="set-bio"
            value={bio}
            onChange={e => { setBio(e.target.value.slice(0, 500)); clearField('bio') }}
            rows={4}
            placeholder="მოკლედ შენ შესახებ"
            {...props('bio')}
            className={`w-full mt-2 px-3.5 py-2.5 rounded-field bg-white border focus:ring-2 focus:outline-none text-body text-ink-900 placeholder:text-ink-400 resize-none transition-colors duration-fast ${bad('bio') ? FIELD_ERROR_BORDER : 'border-ink-200 focus:border-brand-500 focus:ring-brand-100'}`}
          />
          {error('bio')}
          {/* Counts on every keystroke — inside the label it was renaming the
              box as the person typed into it. */}
          <div className="text-right mt-1 font-mono text-meta tabular-nums text-ink-400">{bio.length} / 500</div>
        </div>

        {/* Left for what has no field — an avatar too large, a network drop,
            the success line. Anything with a field is on the field. */}
        {profileMsg && !fault.fault && (
          <div role="alert" className={`rounded-btn border px-3 py-2 text-small font-medium ${profileMsg.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
            {profileMsg.text}
          </div>
        )}

        <div className="flex justify-end">
          <button type="submit" disabled={savingProfile} className="h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 disabled:text-ink-500 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-2 transition-colors duration-fast">
            {savingProfile && <span aria-hidden className="inline-block w-4 h-4 rounded-full border-2 border-white/60 border-t-transparent motion-safe:animate-spin" />}
            {savingProfile ? 'ინახება…' : 'შენახვა'}
          </button>
        </div>
      </form>
    </section>
  )
}

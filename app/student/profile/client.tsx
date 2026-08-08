'use client'
import { useState } from 'react'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { useAvatarCropper } from '@/components/AvatarCropper'
import { Eyebrow } from '@/components/Eyebrow'
import { signOut } from '@/lib/signout'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'

type Props = {
  initialName: string
  initialEmail: string
  initialPhone: string
  initialBio: string
  initialAvatar: string | null
  role: string
}

export function ProfileClient({ initialName, initialEmail, initialPhone, initialBio, initialAvatar, role }: Props) {
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState(initialPhone)
  const [bio, setBio] = useState(initialBio)
  const [avatar, setAvatar] = useState<string | null>(initialAvatar)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: name.trim(), phone: phone.trim(), bio: bio.trim() }),
      })
      const data = await res.json()
      setMsg(res.ok ? { ok: true, text: 'პროფილი შენახულია' } : { ok: false, text: data.error || 'შეცდომა' })
    } catch { setMsg({ ok: false, text: 'ქსელის შეცდომა' }) }
    finally { setSaving(false) }
  }

  // `f` is the square crop produced by the shared cropper — the same framing
  // rule the expert surfaces use, so avatars can't drift apart per surface.
  async function uploadAvatar(f: File) {
    setSaving(true); setMsg(null)
    const form = new FormData()
    form.append('kind', 'avatar')
    form.append('file', f)
    try {
      const res = await fetch('/api/uploads', { method: 'POST', body: form })
      const data = await res.json()
      if (res.ok) { setAvatar(data.url); setMsg({ ok: true, text: 'ავატარი განახლდა' }) }
      else setMsg({ ok: false, text: data.error === 'TOO_LARGE' ? 'ფაილი 8MB-ზე დიდია' : data.error === 'BAD_TYPE' ? 'დაუშვებელი ტიპი' : 'შეცდომა' })
    } catch { setMsg({ ok: false, text: 'ატვირთვის შეცდომა' }) }
    finally { setSaving(false) }
  }

  const { open: pickAvatar, ui: avatarCropperUi } = useAvatarCropper({ onCropped: uploadAvatar })

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPw.length < 8) { setPwMsg({ ok: false, text: 'პაროლი მინიმუმ 6 სიმბოლო' }); return }
    setPwSaving(true); setPwMsg(null)
    try {
      const res = await fetch('/api/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: curPw, newPassword: newPw }),
      })
      const data = await res.json()
      if (res.ok) { setPwMsg({ ok: true, text: 'პაროლი შეიცვალა' }); setCurPw(''); setNewPw('') }
      else setPwMsg({ ok: false, text: data.error === 'BAD_CURRENT' ? 'მიმდინარე პაროლი არასწორია' : 'შეცდომა' })
    } catch { setPwMsg({ ok: false, text: 'ქსელის შეცდომა' }) }
    finally { setPwSaving(false) }
  }

  return (
    <div className="space-y-6">
      {/* Crop dialog + hidden file input live OUTSIDE the profile <form>: a
          range/file control nested in a form can trip implicit submission. */}
      {avatarCropperUi}

      {/* Avatar + basic info */}
      <form onSubmit={saveProfile} className="rounded-card border border-ink-200 bg-white p-6 space-y-5">
        <Eyebrow>პირადი ინფორმაცია</Eyebrow>

        <div className="flex items-center gap-5">
          <div className="relative w-20 h-20 rounded-full bg-brand-100 text-brand-700 overflow-hidden flex items-center justify-center font-display font-bold text-h1">
            {avatar ? <img src={avatar} alt={name} className="w-full h-full object-cover" /> : <img src={DEFAULT_AVATAR} alt={name} className="w-full h-full object-cover" />}
          </div>
          <div>
            <button type="button" onClick={pickAvatar} disabled={saving}
                    className="h-10 sm:h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-small disabled:opacity-60">
              ავატარის შეცვლა
            </button>
            {/* 8MB is what the server actually enforces (MAX_IMAGE_BYTES);
                „500KB" here was never true. */}
            <div className="text-meta text-ink-500 mt-1.5">PNG/JPG/WebP · მინ. 256×256 · მაქს. 8MB</div>
          </div>
        </div>

        {/* Every label here is a SIBLING of its input with no `htmlFor`, which
            looks correct on screen and is invisible to assistive tech: a screen
            reader announced five unnamed „edit text" fields. `id` + `htmlFor`
            binds them (and makes the label click-to-focus, which it never was).
            autoComplete added at the same time — this is a profile form, exactly
            what a password manager should be able to fill. */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="sp-name" className="text-meta font-medium text-ink-700 mb-1.5 block">სახელი გვარი</label>
            <input id="sp-name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} required minLength={2}
                   className="w-full h-11 px-3 rounded-field border border-ink-200 focus:border-brand-500 focus:outline-none text-body" />
          </div>
          <div>
            <label htmlFor="sp-phone" className="text-meta font-medium text-ink-700 mb-1.5 block">ტელეფონი</label>
            <input id="sp-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+995 555 000 000"
                   className="w-full h-11 px-3 rounded-field border border-ink-200 focus:border-brand-500 focus:outline-none text-body" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="sp-email" className="text-meta font-medium text-ink-700 mb-1.5 block">ელფოსტა</label>
            <input id="sp-email" type="email" autoComplete="email" value={initialEmail} disabled
                   className="w-full h-11 px-3 rounded-field border border-ink-200 bg-ink-50 text-ink-500 text-body cursor-not-allowed" />
            <div className="text-meta text-ink-500 mt-1.5">შესაცვლელად: {SUPPORT_EMAIL}</div>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="sp-bio" className="text-meta font-medium text-ink-700 mb-1.5 block">შესახებ</label>
            <textarea id="sp-bio" value={bio} onChange={e => setBio(e.target.value)} rows={4} maxLength={500}
                      placeholder="მოკლედ შენ შესახებ…"
                      className="w-full p-3 rounded-field border border-ink-200 focus:border-brand-500 focus:outline-none text-body resize-none" />
          </div>
        </div>

        {msg && (
          <div className={`rounded-field px-3 py-2 text-small ${msg.ok ? 'bg-success-50 border border-success-200 text-success-700' : 'bg-danger-50 border border-danger-200 text-danger-700'}`}>
            {msg.text}
          </div>
        )}

        <div className="flex justify-end">
          <button type="submit" disabled={saving}
                  className="h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 text-white font-display font-semibold text-body inline-flex items-center gap-2">
            {saving ? 'ინახება…' : 'შენახვა'}
          </button>
        </div>
      </form>

      {/* Password change */}
      <form onSubmit={changePassword} className="rounded-card border border-ink-200 bg-white p-6 space-y-4">
        <Eyebrow>პაროლის შეცვლა</Eyebrow>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="sp-curpw" className="text-meta font-medium text-ink-700 mb-1.5 block">მიმდინარე პაროლი</label>
            <input id="sp-curpw" autoComplete="current-password" type="password" value={curPw} onChange={e => setCurPw(e.target.value)} required minLength={8}
                   className="w-full h-11 px-3 rounded-field border border-ink-200 focus:border-brand-500 focus:outline-none text-body" />
          </div>
          <div>
            <label htmlFor="sp-newpw" className="text-meta font-medium text-ink-700 mb-1.5 block">ახალი პაროლი</label>
            <input id="sp-newpw" autoComplete="new-password" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required minLength={8}
                   className="w-full h-11 px-3 rounded-field border border-ink-200 focus:border-brand-500 focus:outline-none text-body" />
          </div>
        </div>

        {pwMsg && (
          <div className={`rounded-field px-3 py-2 text-small ${pwMsg.ok ? 'bg-success-50 border border-success-200 text-success-700' : 'bg-danger-50 border border-danger-200 text-danger-700'}`}>
            {pwMsg.text}
          </div>
        )}

        <div className="flex justify-end">
          <button type="submit" disabled={pwSaving || !curPw || newPw.length < 6}
                  className="h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 text-white font-display font-semibold text-body">
            {pwSaving ? 'შენახვა…' : 'პაროლის შეცვლა'}
          </button>
        </div>
      </form>

      {/* Notification preferences live on /settings — link instead of
          duplicating the prefs UI here. */}
      <div className="rounded-card border border-ink-200 bg-white p-6 flex items-center justify-between gap-4">
        <div>
          <div className="font-display text-small font-bold text-ink-900">შეტყობინებები</div>
          <div className="text-small text-ink-600 mt-0.5">აირჩიე, რაზე მიიღო.</div>
        </div>
        <a href="/settings" className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-small inline-flex items-center gap-1.5 shrink-0">
          გახსნა
        </a>
      </div>

      {/* ABOVE the sign-out card, deliberately. Traced from a real signup
          (2026-07-29): a user registered as a STUDENT, spent ten minutes hunting
          for how to offer consultations — including editing this very page — and
          left without ever reaching /apply. This was the ONLY entry point inside
          the student workspace, and it sat below „გამოსვლა", where nobody scrolls.
          Do not move it back down. */
      }
      {role !== 'TUTOR' && role !== 'ADMIN' && (
        <div className="rounded-card border border-brand-200 bg-brand-50/40 p-6 flex items-center justify-between">
          <div>
            <div className="font-display text-small font-bold text-ink-900">გახდი ექსპერტი</div>
            <div className="text-small text-ink-600 mt-0.5">გააზიარე ცოდნა, გამოიმუშავე.</div>
          </div>
          <a href="/apply" className="h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body inline-flex items-center gap-1.5">
            განაცხადი
          </a>
        </div>
      )}

      {/* Sign out */}
      <div className="rounded-card border border-danger-200 bg-white p-6 flex items-center justify-between">
        <div>
          <div className="font-display text-small font-bold text-ink-900">გამოსვლა</div>
          <div className="text-small text-ink-600 mt-0.5">სესია დასრულდება.</div>
        </div>
        {/* fetch + navigate (NOT a native form POST): the signout endpoint
            returns JSON, so a form submit would render {"ok":true} as a page. */}
        <button type="button" onClick={() => signOut()} className="h-11 px-4 rounded-btn bg-white border border-danger-300 text-danger-600 hover:bg-danger-50 font-display font-semibold text-small">
          გამოსვლა
        </button>
      </div>

    </div>
  )
}

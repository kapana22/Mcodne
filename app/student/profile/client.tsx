'use client'
import { useState, useRef } from 'react'
import { Icon } from '@/components/Icon'
import { signOut } from '@/lib/signout'

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
  const fileRef = useRef<HTMLInputElement>(null)

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

  async function uploadAvatar(f: File) {
    setSaving(true); setMsg(null)
    const form = new FormData()
    form.append('kind', 'avatar')
    form.append('file', f)
    try {
      const res = await fetch('/api/uploads', { method: 'POST', body: form })
      const data = await res.json()
      if (res.ok) { setAvatar(data.url); setMsg({ ok: true, text: 'ავატარი განახლდა' }) }
      else setMsg({ ok: false, text: data.error === 'TOO_LARGE' ? 'ფაილი > 500KB' : data.error === 'BAD_TYPE' ? 'დაუშვებელი ტიპი' : 'შეცდომა' })
    } catch { setMsg({ ok: false, text: 'ატვირთვის შეცდომა' }) }
    finally { setSaving(false) }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPw.length < 6) { setPwMsg({ ok: false, text: 'პაროლი მინიმუმ 6 სიმბოლო' }); return }
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
      {/* Avatar + basic info */}
      <form onSubmit={saveProfile} className="rounded-card border border-ink-200 bg-white p-6 space-y-5">
        <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-600">პირადი ინფორმაცია</div>

        <div className="flex items-center gap-5">
          <div className="relative w-20 h-20 rounded-full bg-brand-100 text-brand-700 overflow-hidden flex items-center justify-center font-display font-bold text-2xl">
            {avatar ? <img src={avatar} alt={name} className="w-full h-full object-cover" /> : name.slice(0, 1)}
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={e => e.target.files?.[0] && uploadAvatar(e.target.files[0])}
            />
            <button type="button" onClick={() => fileRef.current?.click()}
                    className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-[12.5px]">
              ავატარის შეცვლა
            </button>
            <div className="text-[11px] text-ink-500 mt-1.5">PNG/JPG/WebP · მაქს. 500KB</div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[12px] font-medium text-ink-700 mb-1.5 block">სახელი გვარი</label>
            <input value={name} onChange={e => setName(e.target.value)} required minLength={2}
                   className="w-full h-11 px-3 rounded-field border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-sm" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-ink-700 mb-1.5 block">ტელეფონი</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+995 555 000 000"
                   className="w-full h-11 px-3 rounded-field border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[12px] font-medium text-ink-700 mb-1.5 block">ელფოსტა</label>
            <input value={initialEmail} disabled
                   className="w-full h-11 px-3 rounded-field border border-ink-200 bg-ink-50 text-ink-500 text-sm cursor-not-allowed" />
            <div className="text-[11px] text-ink-500 mt-1.5">ელფოსტის შესაცვლელად დაუკავშირდით hi@mcodne.ge</div>
          </div>
          <div className="sm:col-span-2">
            <label className="text-[12px] font-medium text-ink-700 mb-1.5 block">შესახებ</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} rows={4} maxLength={500}
                      placeholder="მოკლედ შენ შესახებ..."
                      className="w-full p-3 rounded-field border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-sm resize-none" />
          </div>
        </div>

        {msg && (
          <div className={`rounded-field px-3 py-2 text-[12.5px] ${msg.ok ? 'bg-success-50 border border-success-200 text-success-700' : 'bg-danger-50 border border-danger-200 text-danger-700'}`}>
            {msg.text}
          </div>
        )}

        <div className="flex justify-end">
          <button type="submit" disabled={saving}
                  className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 text-white font-display font-semibold text-[13px] inline-flex items-center gap-2">
            {saving ? 'ინახება…' : 'შენახვა'}
          </button>
        </div>
      </form>

      {/* Password change */}
      <form onSubmit={changePassword} className="rounded-card border border-ink-200 bg-white p-6 space-y-4">
        <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-600">პაროლის შეცვლა</div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[12px] font-medium text-ink-700 mb-1.5 block">მიმდინარე პაროლი</label>
            <input type="password" value={curPw} onChange={e => setCurPw(e.target.value)} required minLength={6}
                   className="w-full h-11 px-3 rounded-field border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-sm" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-ink-700 mb-1.5 block">ახალი პაროლი</label>
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required minLength={6}
                   className="w-full h-11 px-3 rounded-field border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-sm" />
          </div>
        </div>

        {pwMsg && (
          <div className={`rounded-field px-3 py-2 text-[12.5px] ${pwMsg.ok ? 'bg-success-50 border border-success-200 text-success-700' : 'bg-danger-50 border border-danger-200 text-danger-700'}`}>
            {pwMsg.text}
          </div>
        )}

        <div className="flex justify-end">
          <button type="submit" disabled={pwSaving || !curPw || newPw.length < 6}
                  className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 text-white font-display font-semibold text-[13px]">
            {pwSaving ? 'შენახვა...' : 'პაროლის შეცვლა'}
          </button>
        </div>
      </form>

      {/* Sign out */}
      <div className="rounded-card border border-danger-200 bg-white p-6 flex items-center justify-between">
        <div>
          <div className="font-display text-[13px] font-bold text-ink-900">გამოსვლა</div>
          <div className="text-[12.5px] text-ink-600 mt-0.5">ამ მოწყობილობიდან სესია დასრულდება.</div>
        </div>
        {/* fetch + navigate (NOT a native form POST): the signout endpoint
            returns JSON, so a form submit would render {"ok":true} as a page. */}
        <button type="button" onClick={() => signOut()} className="h-11 px-4 rounded-btn bg-white border border-danger-300 text-danger-600 hover:bg-danger-50 font-display font-semibold text-[12.5px]">
          გამოსვლა
        </button>
      </div>

      {role !== 'TUTOR' && role !== 'ADMIN' && (
        <div className="rounded-card border border-brand-200 bg-brand-50/40 p-6 flex items-center justify-between">
          <div>
            <div className="font-display text-[13px] font-bold text-ink-900">გახდი ექსპერტი</div>
            <div className="text-[12.5px] text-ink-600 mt-0.5">გააზიარე ცოდნა, გამოიმუშავე შემოსავალი.</div>
          </div>
          <a href="/apply" className="h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] inline-flex items-center gap-1.5">
            განაცხადი <Icon.arrow className="w-3.5 h-3.5" />
          </a>
        </div>
      )}
    </div>
  )
}

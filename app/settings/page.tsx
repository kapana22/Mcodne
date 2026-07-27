'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Container } from '@/components/Container'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { Icon } from '@/components/Icon'
import { ConfirmModal } from '@/components/ConfirmModal'
import { signOut as doSignOut } from '@/lib/signout'
import { homeForRole } from '@/lib/roleHome'
import { Eyebrow } from '@/components/Eyebrow'

// Local mirror of lib/notify.ts PrefKey. Keeping this in-file so the Settings
// page doesn't import from a server helper. All keys default to true when
// the API returns null prefs (fresh account).
type PrefKey = 'BOOKING_CREATED' | 'MESSAGE_NEW' | 'REVIEW_NEW' | 'APPLICATION_STATUS' | 'ADMIN_BROADCAST'
type PrefsMap = Record<PrefKey, boolean>
const DEFAULT_PREFS: PrefsMap = {
  BOOKING_CREATED: true,
  MESSAGE_NEW: true,
  REVIEW_NEW: true,
  APPLICATION_STATUS: true,
  ADMIN_BROADCAST: true,
}
const PREF_ROWS: Array<{ key: PrefKey; label: string; hint: string }> = [
  { key: 'BOOKING_CREATED',    label: 'ჯავშნის ცვლილება',      hint: 'ახალი, გაუქმებული, დადასტურებული' },
  { key: 'MESSAGE_NEW',        label: 'ახალი შეტყობინება',     hint: 'ახალი ტექსტი მიმოწერაში' },
  { key: 'REVIEW_NEW',         label: 'ახალი შეფასება',        hint: 'სტუდენტმა შეგაფასა' },
  { key: 'APPLICATION_STATUS', label: 'განაცხადის სტატუსი',   hint: 'ექსპერტად რეგისტრაცია' },
  { key: 'ADMIN_BROADCAST',    label: 'პლატფორმის სიახლეები', hint: 'მნიშვნელოვანი განცხადებები' },
]

type Me = {
  id: string
  email: string
  fullName: string
  role: 'STUDENT' | 'TUTOR' | 'ADMIN'
  avatarUrl?: string | null
  bio?: string | null
  phone?: string | null
  emailVerified?: boolean
  // False for SSO-only accounts (Google) — they have no usable password, so the
  // delete flow must not demand one.
  hasPassword?: boolean
}

export default function SettingsPage() {
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  // A failed profile load is NOT „signed out" — see loadMe below.
  const [loadErr, setLoadErr] = useState(false)

  // profile fields
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  // password fields
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  // Per-field password visibility toggles. Each defaults to hidden.
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)

  // avatar upload
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)

  // notification prefs
  const [prefs, setPrefs] = useState<PrefsMap | null>(null)
  const [prefsMsg, setPrefsMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [savingKey, setSavingKey] = useState<PrefKey | null>(null)

  // verify-now
  const [verifyStage, setVerifyStage] = useState<'idle' | 'sent'>('idle')
  const [verifyCode, setVerifyCode] = useState('')
  const [verifyingBusy, setVerifyingBusy] = useState(false)
  const [verifyMsg, setVerifyMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  // ONLY a real 401 (or a 200 with no user) means „signed out". A 500/502/504,
  // a non-JSON body or a network drop must never bounce a valid session to
  // /signin — those land on a retry state instead. The abort timer makes even a
  // request that never returns settle.
  const loadMe = async () => {
    setLoading(true)
    setLoadErr(false)
    let redirecting = false
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 12_000)
    try {
      const r = await fetch('/api/me', { cache: 'no-store', signal: ctrl.signal })
      if (r.status === 401) { redirecting = true; router.push('/signin?redirect=/settings'); return }
      if (!r.ok) { setLoadErr(true); return }
      const { user } = await r.json()
      if (!user) { redirecting = true; router.push('/signin?redirect=/settings'); return }
      setMe(user)
      setFullName(user.fullName ?? '')
      setPhone(user.phone ?? '')
      setBio(user.bio ?? '')
      setAvatarUrl(user.avatarUrl ?? null)
    } catch {
      setLoadErr(true)
    } finally {
      clearTimeout(timer)
      // Keep the loader up while the signin redirect is in flight — never flash
      // the error card at a user who is simply being signed in again.
      if (!redirecting) setLoading(false)
    }
  }

  useEffect(() => {
    loadMe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load prefs alongside the profile — one fetch, no blocking of the initial
  // render. On any failure, fall back to DEFAULT_PREFS so the UI still renders
  // toggles (all-enabled state matches the server-side fallback).
  useEffect(() => {
    fetch('/api/me/notifications-prefs')
      .then(r => r.ok ? r.json() : { prefs: DEFAULT_PREFS })
      .then(({ prefs }) => setPrefs({ ...DEFAULT_PREFS, ...(prefs ?? {}) }))
      .catch(() => setPrefs({ ...DEFAULT_PREFS }))
  }, [])

  // Optimistic toggle — flip locally, PATCH in the background, revert on
  // failure. `savingKey` is used only to spin the row's control.
  const togglePref = async (key: PrefKey) => {
    if (!prefs) return
    const prev = prefs[key]
    const nextPrefs: PrefsMap = { ...prefs, [key]: !prev }
    setPrefs(nextPrefs)
    setSavingKey(key)
    setPrefsMsg(null)
    try {
      const res = await fetch('/api/me/notifications-prefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefs: { [key]: !prev } }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || data?.ok === false) {
        setPrefs({ ...prefs, [key]: prev })
        setPrefsMsg({ kind: 'error', text: 'შენახვა ვერ მოხერხდა' })
        return
      }
      setPrefsMsg({ kind: 'success', text: 'შენახულია' })
    } catch {
      setPrefs({ ...prefs, [key]: prev })
      setPrefsMsg({ kind: 'error', text: 'ქსელის შეცდომა' })
    } finally {
      setSavingKey(null)
    }
  }

  // Inline verify-now flow — send the OTP to the currently-signed-in email,
  // then let the user paste the 6-digit code without leaving Settings.
  const startVerify = async () => {
    if (!me || verifyingBusy) return
    setVerifyingBusy(true)
    setVerifyMsg(null)
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: me.email, purpose: 'verify' }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || data?.ok === false) {
        setVerifyMsg({
          kind: 'error',
          text: data?.error === 'RATE_LIMITED' ? 'ხშირად ცდი — მოგვიანებით.' : 'გაგზავნა ვერ მოხერხდა.',
        })
        return
      }
      setVerifyStage('sent')
      setVerifyMsg({ kind: 'success', text: 'კოდი გაიგზავნა.' })
    } catch {
      setVerifyMsg({ kind: 'error', text: 'ქსელის შეცდომა.' })
    } finally {
      setVerifyingBusy(false)
    }
  }

  const submitVerify = async () => {
    if (!me || verifyingBusy) return
    if (verifyCode.trim().length !== 6) {
      setVerifyMsg({ kind: 'error', text: 'კოდი უნდა იყოს 6 ციფრი.' })
      return
    }
    setVerifyingBusy(true)
    setVerifyMsg(null)
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: me.email, code: verifyCode.trim() }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || data?.ok === false) {
        setVerifyMsg({ kind: 'error', text: data?.error === 'BAD_CODE' ? 'კოდი არასწორია.' : 'ვერიფიკაცია ვერ მოხერხდა.' })
        return
      }
      setMe({ ...me, emailVerified: true })
      setVerifyStage('idle')
      setVerifyCode('')
      setVerifyMsg({ kind: 'success', text: 'ელფოსტა დადასტურდა.' })
    } catch {
      setVerifyMsg({ kind: 'error', text: 'ქსელის შეცდომა.' })
    } finally {
      setVerifyingBusy(false)
    }
  }

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (savingProfile) return
    if (fullName.trim().length < 2) {
      setProfileMsg({ kind: 'error', text: 'სახელი მინიმუმ 2 სიმბოლო' })
      return
    }
    setSavingProfile(true)
    setProfileMsg(null)
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: fullName.trim(), phone: phone.trim(), bio: bio.trim() }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || data?.ok === false) {
        setProfileMsg({ kind: 'error', text: 'შენახვა ვერ მოხერხდა' })
        return
      }
      setProfileMsg({ kind: 'success', text: 'პროფილი განახლდა' })
    } catch {
      setProfileMsg({ kind: 'error', text: 'ქსელის შეცდომა' })
    } finally {
      setSavingProfile(false)
    }
  }

  const pickAvatar = () => fileInput.current?.click()

  const uploadAvatar = async (file: File) => {
    if (uploading) return
    if (file.size > 500 * 1024) {
      setProfileMsg({ kind: 'error', text: 'ავატარი მაქსიმუმ 500KB' })
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setProfileMsg({ kind: 'error', text: 'დასაშვები ფორმატები: JPG, PNG, WEBP, GIF' })
      return
    }
    setUploading(true)
    setProfileMsg(null)
    try {
      const fd = new FormData()
      fd.append('kind', 'avatar')
      fd.append('file', file)
      const res = await fetch('/api/uploads', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || data?.ok === false) {
        setProfileMsg({ kind: 'error', text: data?.error === 'TOO_LARGE' ? 'ფაილი ძალიან დიდია' : 'ატვირთვა ვერ მოხერხდა' })
        return
      }
      setAvatarUrl(data.url)
      setProfileMsg({ kind: 'success', text: 'ავატარი განახლდა' })
    } catch {
      setProfileMsg({ kind: 'error', text: 'ქსელის შეცდომა' })
    } finally {
      setUploading(false)
    }
  }

  const removeAvatar = async () => {
    if (uploading) return
    setUploading(true)
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: null }),
      })
      if (res.ok) {
        setAvatarUrl(null)
        setProfileMsg({ kind: 'success', text: 'ავატარი წაიშალა' })
      } else {
        setProfileMsg({ kind: 'error', text: 'ვერ წაიშალა — სცადე თავიდან' })
      }
    } catch {
      setProfileMsg({ kind: 'error', text: 'ვერ წაიშალა — სცადე თავიდან' })
    } finally {
      setUploading(false)
    }
  }

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (savingPw) return
    if (newPw.length < 8) { setPwMsg({ kind: 'error', text: 'ახალი პაროლი მინიმუმ 8 სიმბოლო' }); return }
    if (newPw !== confirmPw) { setPwMsg({ kind: 'error', text: 'პაროლი არ ემთხვევა' }); return }
    if (!currentPw) { setPwMsg({ kind: 'error', text: 'შეიყვანე მიმდინარე პაროლი' }); return }
    setSavingPw(true)
    setPwMsg(null)
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || data?.ok === false) {
        setPwMsg({
          kind: 'error',
          text: data?.error === 'BAD_CURRENT_PASSWORD' ? 'მიმდინარე პაროლი არასწორია'
            : data?.error === 'INVALID' ? 'ახალი პაროლი მინიმუმ 8 სიმბოლო'
            : 'შენახვა ვერ მოხერხდა',
        })
        return
      }
      setPwMsg({ kind: 'success', text: 'პაროლი შეიცვალა' })
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    } catch {
      setPwMsg({ kind: 'error', text: 'ქსელის შეცდომა' })
    } finally {
      setSavingPw(false)
    }
  }

  // Funnel through the shared helper — location.replace drops the signed-in
  // page from history so back-navigation can't resurrect stale authed UI.
  const signOut = () => doSignOut()

  const [signOutOpen, setSignOutOpen] = useState(false)
  const [signOutBusy, setSignOutBusy] = useState(false)
  const confirmSignOut = async () => {
    setSignOutBusy(true)
    try { await signOut() } finally { setSignOutBusy(false) }
  }

  // Account deletion — double-confirm: the user must type "DELETE" to unlock
  // the destructive button. Prevents accidental clicks and telegraphs
  // finality.
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteAcknowledged, setDeleteAcknowledged] = useState('')
  const [deletePw, setDeletePw] = useState('')
  const [showDeletePw, setShowDeletePw] = useState(false)
  const [deleteErr, setDeleteErr] = useState<string | null>(null)
  // Password accounts must also enter their current password; SSO-only accounts
  // (no usable password) unlock on the typed word alone. The server is the
  // source of truth — this just gates the button for a cleaner UX.
  const needsDeletePw = !!me?.hasPassword
  const canDelete = deleteAcknowledged.trim() === 'წაშლა' && (!needsDeletePw || deletePw.length > 0)
  const openDelete = () => { setDeleteAcknowledged(''); setDeletePw(''); setShowDeletePw(false); setDeleteErr(null); setDeleteOpen(true) }
  const confirmDelete = async () => {
    if (!canDelete || deleteBusy) return
    setDeleteBusy(true); setDeleteErr(null)
    try {
      const body: { confirm: 'DELETE'; currentPassword?: string } = { confirm: 'DELETE' }
      if (deletePw) body.currentPassword = deletePw
      const res = await fetch('/api/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as any))
        setDeleteErr(
          data?.error === 'BAD_CURRENT_PASSWORD' ? 'მიმდინარე პაროლი არასწორია'
            : data?.error === 'CURRENT_PASSWORD_REQUIRED' ? 'შეიყვანე მიმდინარე პაროლი'
            : data?.error === 'HAS_ACTIVE_BOOKINGS' ? 'ჯერ დაასრულე ან გააუქმე აქტიური ჯავშნები'
            : data?.error === 'HAS_HISTORY' ? 'ანგარიშს აქვს ისტორია — მიმართე მხარდაჭერას'
            : 'წაშლა ვერ მოხერხდა — სცადე მოგვიანებით'
        )
        return
      }
      window.location.href = '/'
    } catch {
      setDeleteErr('ქსელის შეცდომა')
    } finally {
      setDeleteBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50">
        <div className="inline-flex items-center gap-2 text-ink-500 text-[13px]">
          <span aria-hidden className="inline-block w-4 h-4 rounded-full border-2 border-ink-300 border-t-transparent motion-safe:animate-spin" />
          იტვირთება…
        </div>
      </div>
    )
  }

  // No profile and not redirecting → a transient failure. Compact retry state
  // (never a blank white screen, and never a bogus sign-out).
  if (!me) {
    return (
      <div className="min-h-screen bg-ink-50/50 flex flex-col items-center justify-center gap-4 px-6">
        <Logo size="sm" />
        <div className="text-center max-w-[360px]">
          <div className="font-display text-[16px] font-bold text-ink-900 tracking-tight">ვერ ჩაიტვირთა</div>
          <p className="text-[12.5px] text-ink-500 mt-1.5 leading-relaxed">
            {loadErr ? 'შეამოწმე ინტერნეტი და სცადე თავიდან.' : 'პროფილის ჩატვირთვა ვერ მოხერხდა.'}
          </p>
          <button
            type="button"
            onClick={loadMe}
            className="mt-4 h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center gap-1.5 transition-colors"
          >
            <Icon.refresh className="w-3.5 h-3.5" />
            სცადე თავიდან
          </button>
        </div>
      </div>
    )
  }

  const backHref = homeForRole(me.role)

  return (
    <div className="min-h-screen bg-ink-50/50">
      <header className="sticky top-0 z-40 bg-ink-50 lg:bg-ink-50/90 lg:backdrop-blur-md border-b border-ink-100">
        <Container size="content" className="h-16 flex items-center justify-between gap-6">
          <div className="inline-flex items-center gap-2">
            <Link href={backHref} aria-label="უკან" className="inline-flex items-center text-ink-700 hover:text-ink-900 transition-colors">
              <Icon.chevR className="w-4 h-4 rotate-180" />
            </Link>
            {/* Logo always goes to the main page „/" — the chevron handles „back". */}
            <Logo size="sm" />
          </div>
          <span className="font-display text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-500">პარამეტრები</span>
        </Container>
      </header>

      <Container as="main" size="content" className="py-10 space-y-8">
        {/* Page header — the sticky utility bar above is chrome, not a
            heading; this h1 is the page's actual title. */}
        <div>
          <Eyebrow className="mb-2">ანგარიში</Eyebrow>
          <h1 className="font-display text-3xl font-bold text-ink-900 tracking-tight">პარამეტრები</h1>
        </div>

        {/* Profile section */}
        <section className="bg-white rounded-card border border-ink-200 p-6 lg:p-8">
          <div className="flex items-baseline justify-between gap-3 mb-6">
            <div className="min-w-0">
              <h2 className="font-display text-[18px] font-bold text-ink-900 tracking-tight">პროფილი</h2>
              <p className="text-[12.5px] text-ink-500 mt-0.5">როგორ გხედავენ სხვები</p>
            </div>
            <span className="hidden sm:block font-mono text-[10.5px] tabular-nums text-ink-400 truncate max-w-[220px] shrink" title={me.email}>{me.email}</span>
          </div>

          <form onSubmit={saveProfile} className="space-y-5">
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
                <img src={avatarUrl || DEFAULT_AVATAR} alt={me.fullName} className="w-full h-full object-cover" />
                {/* Desktop: overlay on hover; Mobile: overlay always visible (opacity-100). */}
                {!uploading && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 inline-flex flex-col items-center justify-center gap-0.5 bg-black/45 text-white opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-visible:opacity-100 motion-safe:transition-opacity motion-safe:duration-150"
                  >
                    <Icon.camera className="w-4 h-4" />
                    <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.14em]">შეცვლა</span>
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
                    <button type="button" onClick={removeAvatar} disabled={uploading} className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:border-danger-300 hover:text-danger-700 disabled:opacity-50 text-ink-700 font-display font-semibold text-[12.5px] transition-colors">
                      წაშლა
                    </button>
                  )}
                </div>
                <div className="text-[11px] text-ink-500">მაქს. 500KB · JPG/PNG/WEBP/GIF</div>
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

            {/* Name */}
            <label className="block">
              <span className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700">სახელი და გვარი</span>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                maxLength={80}
                className="w-full mt-2 h-11 px-3.5 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-[14px] text-ink-900 transition-colors"
              />
            </label>

            {/* Phone */}
            <label className="block">
              <span className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700">ტელეფონი <span className="text-ink-400 normal-case tracking-normal">— არასავალდებულო</span></span>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                maxLength={40}
                placeholder="+995 5XX XXX XXX"
                className="w-full mt-2 h-11 px-3.5 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors"
              />
            </label>

            {/* Bio */}
            <label className="block">
              <span className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700">შესახებ</span>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value.slice(0, 500))}
                rows={4}
                placeholder="მოკლედ შენ შესახებ"
                className="w-full mt-2 px-3.5 py-2.5 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-[14px] text-ink-900 placeholder:text-ink-400 resize-none transition-colors"
              />
              <div className="text-right mt-1 font-mono text-[10.5px] tabular-nums text-ink-400">{bio.length} / 500</div>
            </label>

            {profileMsg && (
              <div role="alert" className={`rounded-btn border px-3 py-2 text-[12.5px] font-medium ${profileMsg.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
                {profileMsg.text}
              </div>
            )}

            <div className="flex justify-end">
              <button type="submit" disabled={savingProfile} className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 disabled:text-ink-400 text-white font-display font-semibold text-[13px] tracking-wide inline-flex items-center gap-2 transition-colors">
                {savingProfile && <span aria-hidden className="inline-block w-4 h-4 rounded-full border-2 border-white/60 border-t-transparent motion-safe:animate-spin" />}
                {savingProfile ? 'ინახება…' : 'შენახვა'}
              </button>
            </div>
          </form>
        </section>

        {/* Password section */}
        <section className="bg-white rounded-card border border-ink-200 p-6 lg:p-8">
          <div className="mb-6">
            <h2 className="font-display text-[18px] font-bold text-ink-900 tracking-tight">პაროლის შეცვლა</h2>
            {/* PATCH /api/me/password calls revokeOtherSessions — the old copy
                („სხვა სესიები აქტიური დარჩება") promised the exact opposite. */}
            <p className="text-[12.5px] text-ink-500 mt-0.5">შეცვლის შემდეგ სხვა მოწყობილობებზე ხელახლა უნდა შეხვიდე</p>
          </div>

          <form onSubmit={savePassword} className="space-y-4">
            <label className="block">
              <span className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700">მიმდინარე პაროლი</span>
              <div className="relative mt-2">
                <input
                  type={showCurrentPw ? 'text' : 'password'}
                  value={currentPw}
                  onChange={e => setCurrentPw(e.target.value)}
                  autoComplete="current-password"
                  className="w-full h-11 pl-3.5 pr-12 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-[14px] text-ink-900 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPw(s => !s)}
                  aria-label={showCurrentPw ? 'დამალე' : 'აჩვენე'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-btn text-ink-500 hover:text-ink-800 hover:bg-ink-100 inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {showCurrentPw ? <Icon.eyeOff className="w-4 h-4" /> : <Icon.eye className="w-4 h-4" />}
                </button>
              </div>
            </label>
            <label className="block">
              <span className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700">ახალი პაროლი</span>
              <div className="relative mt-2">
                <input
                  type={showNewPw ? 'text' : 'password'}
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  className="w-full h-11 pl-3.5 pr-12 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-[14px] text-ink-900 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw(s => !s)}
                  aria-label={showNewPw ? 'დამალე' : 'აჩვენე'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-btn text-ink-500 hover:text-ink-800 hover:bg-ink-100 inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {showNewPw ? <Icon.eyeOff className="w-4 h-4" /> : <Icon.eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="mt-1 text-[11px] text-ink-500">მინიმუმ 8 სიმბოლო</div>
            </label>
            <label className="block">
              <span className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700">გაიმეორე ახალი პაროლი</span>
              <div className="relative mt-2">
                <input
                  type={showConfirmPw ? 'text' : 'password'}
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  autoComplete="new-password"
                  className={`w-full h-11 pl-3.5 pr-12 rounded-field bg-white border focus:ring-2 focus:outline-none text-[14px] text-ink-900 transition-colors ${confirmPw.length > 0 && confirmPw !== newPw ? 'border-danger-300 focus:border-danger-500 focus:ring-danger-100' : 'border-ink-200 focus:border-brand-500 focus:ring-brand-100'}`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPw(s => !s)}
                  aria-label={showConfirmPw ? 'დამალე' : 'აჩვენე'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-btn text-ink-500 hover:text-ink-800 hover:bg-ink-100 inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {showConfirmPw ? <Icon.eyeOff className="w-4 h-4" /> : <Icon.eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPw.length > 0 && confirmPw !== newPw && (
                <div className="mt-1 text-[11px] text-danger-700">პაროლი არ ემთხვევა</div>
              )}
            </label>

            {pwMsg && (
              <div role="alert" className={`rounded-btn border px-3 py-2 text-[12.5px] font-medium ${pwMsg.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
                {pwMsg.text}
              </div>
            )}

            <div className="flex justify-end">
              <button type="submit" disabled={savingPw || !currentPw || !newPw || newPw !== confirmPw} className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 disabled:text-ink-400 text-white font-display font-semibold text-[13px] tracking-wide inline-flex items-center gap-2 transition-colors">
                {savingPw && <span aria-hidden className="inline-block w-4 h-4 rounded-full border-2 border-white/60 border-t-transparent motion-safe:animate-spin" />}
                {savingPw ? 'ინახება…' : 'პაროლის შენახვა'}
              </button>
            </div>
          </form>
        </section>

        {/* Account section */}
        <section className="bg-white rounded-card border border-ink-200 p-6 lg:p-8">
          <div className="mb-4">
            <h2 className="font-display text-[18px] font-bold text-ink-900 tracking-tight">ანგარიში</h2>
          </div>
          <dl className="text-[13px] space-y-2">
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
                          className="h-8 px-3 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 disabled:text-ink-400 text-white font-display font-semibold text-[11.5px] transition-colors"
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
              <div className="text-[12.5px] text-ink-700 mb-2">
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
                  className="flex-1 h-11 px-3 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-[14px] tabular-nums text-ink-900 transition-colors"
                />
                <button
                  type="button"
                  onClick={submitVerify}
                  disabled={verifyingBusy || verifyCode.length !== 6}
                  className="h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 disabled:text-ink-400 text-white font-display font-semibold text-[12.5px] transition-colors"
                >
                  დადასტურება
                </button>
                <button
                  type="button"
                  onClick={startVerify}
                  disabled={verifyingBusy}
                  className="h-11 px-3 rounded-btn bg-white border border-ink-200 hover:border-ink-300 disabled:opacity-50 text-ink-700 font-display font-semibold text-[12.5px] transition-colors"
                >
                  ხელახლა
                </button>
              </div>
            </div>
          )}

          {verifyMsg && (
            <div role="alert" className={`mt-3 rounded-btn border px-3 py-2 text-[12.5px] font-medium ${verifyMsg.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
              {verifyMsg.text}
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-ink-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
            <button type="button" onClick={openDelete} className="font-display text-[12px] font-semibold text-danger-700 hover:text-danger-800 self-start transition-colors">
              ანგარიშის წაშლა
            </button>
            <button type="button" onClick={() => setSignOutOpen(true)} className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:border-danger-300 hover:text-danger-700 text-ink-700 font-display font-semibold text-[12.5px] transition-colors self-end sm:self-auto">
              გამოსვლა
            </button>
          </div>
        </section>

        {/* Notification preferences */}
        <section className="bg-white rounded-card border border-ink-200 p-6 lg:p-8">
          <div className="mb-5">
            <h2 className="font-display text-[18px] font-bold text-ink-900 tracking-tight">შეტყობინებები</h2>
            <p className="text-[12.5px] text-ink-500 mt-0.5">აირჩიე, რა მიიღო</p>
          </div>

          {!prefs ? (
            <div className="text-[12.5px] text-ink-500">იტვირთება…</div>
          ) : (
            <ul className="divide-y divide-ink-100">
              {PREF_ROWS.map(row => {
                const value = prefs[row.key]
                const busy = savingKey === row.key
                return (
                  /* Switch is a 44×44 tap target (canon floor 40px); the visible
                     track keeps its 44×24 proportions inside it. */
                  <li key={row.key} className="py-3.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-display text-[13.5px] font-semibold text-ink-900">{row.label}</div>
                      <div className="text-[11.5px] text-ink-500 mt-0.5">{row.hint}</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={value}
                      disabled={busy}
                      onClick={() => togglePref(row.key)}
                      className="shrink-0 h-11 rounded-btn inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <span className={`relative block w-11 h-6 rounded-full transition-colors ${value ? 'bg-brand-500' : 'bg-ink-200'} ${busy ? 'opacity-60' : ''}`}>
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`}
                        />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {prefsMsg && (
            <div role="alert" className={`mt-4 rounded-btn border px-3 py-2 text-[12.5px] font-medium ${prefsMsg.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
              {prefsMsg.text}
            </div>
          )}
        </section>
      </Container>

      <ConfirmModal
        open={signOutOpen}
        title="გამოსვლა?"
        body="ხელახლა უნდა შეხვიდე."
        tone="warning"
        confirmLabel="გამოსვლა"
        cancelLabel="დარჩი"
        onConfirm={confirmSignOut}
        onCancel={() => setSignOutOpen(false)}
        busy={signOutBusy}
      />

      <ConfirmModal
        open={deleteOpen}
        title="ანგარიშის წაშლა?"
        body={
          <div className="space-y-3">
            <p>
              წაშლა <span className="font-display font-bold text-danger-700">შეუქცევადია</span> — ყველა მონაცემი წაიშლება.
            </p>
            <label className="block">
              <Eyebrow as="span" tone="muted">
                დასადასტურებლად აკრიფე <span className="font-display font-bold text-danger-700">წაშლა</span>
              </Eyebrow>
              <input
                type="text"
                value={deleteAcknowledged}
                onChange={e => setDeleteAcknowledged(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="w-full mt-2 h-11 px-3 rounded-field border border-ink-200 focus:border-danger-500 focus:ring-2 focus:ring-danger-100 focus:outline-none text-[13.5px] text-ink-900 transition-colors"
                placeholder="წაშლა"
                disabled={deleteBusy}
              />
            </label>
            {needsDeletePw && (
              <label className="block">
                <Eyebrow as="span" tone="muted">მიმდინარე პაროლი</Eyebrow>
                <div className="relative mt-2">
                  <input
                    type={showDeletePw ? 'text' : 'password'}
                    value={deletePw}
                    onChange={e => setDeletePw(e.target.value)}
                    autoComplete="current-password"
                    className="w-full h-11 pl-3 pr-12 rounded-field border border-ink-200 focus:border-danger-500 focus:ring-2 focus:ring-danger-100 focus:outline-none text-[13.5px] text-ink-900 transition-colors"
                    disabled={deleteBusy}
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeletePw(s => !s)}
                    aria-label={showDeletePw ? 'დამალე' : 'აჩვენე'}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-btn text-ink-500 hover:text-ink-800 hover:bg-ink-100 inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    {showDeletePw ? <Icon.eyeOff className="w-4 h-4" /> : <Icon.eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>
            )}
            {deleteErr && (
              <div role="alert" className="rounded-btn border border-danger-200 bg-danger-50 text-danger-800 px-3 py-2 text-[12px] font-medium">
                {deleteErr}
              </div>
            )}
            {!canDelete && (
              <p className="text-[11.5px] text-ink-500">
                აკრიფე <span className="font-display font-bold">წაშლა</span> გასაგრძელებლად.
              </p>
            )}
          </div>
        }
        tone="danger"
        confirmLabel="წაშლა"
        cancelLabel="უკან"
        onConfirm={confirmDelete}
        onCancel={() => { if (!deleteBusy) setDeleteOpen(false) }}
        busy={deleteBusy}
        confirmDisabled={!canDelete}
      />
    </div>
  )
}

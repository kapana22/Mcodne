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
import { PageHeader } from '@/components/PageHeader'
import { georgianNameError } from '@/lib/georgianText'

// Local mirror of lib/notify.ts PrefKey. Keeping this in-file so the Settings
// page doesn't import from a server helper. All keys default to true when
// the API returns null prefs (fresh account).
import { DEFAULT_PREFS, type Me, type PrefKey, type PrefsMap } from './_types'
import { ProfileSection } from './_profile'
import { PasswordSection } from './_password'
import { AccountSection } from './_account'
import { PrefsSection } from './_prefs'
// ⚠️ SEEDED BY THE SERVER (2026-08-30). This page used to open as a FULL-SCREEN
// SPINNER — „იტვირთება…", centred, nothing else — until /api/me answered, on a
// page whose every value the server already holds. Owner, that morning:
// „ხანდახან დილეი აქვს, ნახევარს ტვირთავს ხოლმე რაღაცებს და მერე ჩნდება."
//
// The fetch is not gone, it MOVED: `reload()` still re-reads /api/me after a
// save, an avatar change or an email verification, which is what keeps the form
// honest. What went is the one on mount, and with it the blank first screen.
export default function SettingsClient({ initialMe }: { initialMe: Me }) {
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(initialMe)
  // Starts FALSE: the first values arrive with the document. It still turns
  // true for a deliberate reload, so a save that re-reads shows its own state.
  const [loading, setLoading] = useState(false)
  // A failed profile load is NOT „signed out" — see loadMe below.
  const [loadErr, setLoadErr] = useState(false)

  // profile fields
  const [fullName, setFullName] = useState(initialMe.fullName ?? '')
  const [phone, setPhone] = useState(initialMe.phone ?? '')
  const [bio, setBio] = useState(initialMe.bio ?? '')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialMe.avatarUrl ?? null)
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

  // ⚠️ NO LOAD ON MOUNT (2026-08-30). `initialMe` is the same object /api/me
  // returns, resolved by the server page — so re-reading it here would replace
  // every value on screen with the identical value, one round trip later, after
  // a full-screen spinner. `loadMe` stays for the deliberate re-reads: an
  // avatar upload, a saved profile, a verified email.

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
          text: data?.error === 'RATE_LIMITED' ? 'ბევრი მცდელობა — სცადე მოგვიანებით.' : 'გაგზავნა ვერ მოხერხდა.',
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
    // Same rule as /api/me, answered before the round-trip.
    const nameMsg = georgianNameError('სახელი და გვარი', fullName.trim())
    if (nameMsg) {
      setProfileMsg({ kind: 'error', text: nameMsg })
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
        // `message` carries our own validation copy (e.g. the Georgian-language
        // gate). Falling back to the generic line would hide the one thing the
        // user needs in order to fix the field.
        setProfileMsg({ kind: 'error', text: data?.message || 'შენახვა ვერ მოხერხდა' })
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
    if (file.size > 8 * 1024 * 1024) {
      setProfileMsg({ kind: 'error', text: 'ავატარი მაქსიმუმ 8MB' })
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
            : data?.error === 'HAS_ACTIVE_BOOKINGS' ? 'ჯერ დაასრულე ან დახურე მიმდინარე სამუშაოები'
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
        <div className="inline-flex items-center gap-2 text-ink-500 text-small">
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
          <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">ვერ ჩაიტვირთა</div>
          <p className="text-small text-ink-500 mt-1.5 leading-relaxed">
            {loadErr ? 'შეამოწმე ინტერნეტი და სცადე თავიდან.' : 'პროფილის ჩატვირთვა ვერ მოხერხდა.'}
          </p>
          <button
            type="button"
            onClick={loadMe}
            className="mt-4 h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-1.5 transition-colors duration-fast"
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
      <header className="sticky top-0 z-chrome bg-ink-50 lg:bg-ink-50/90 lg:backdrop-blur-md border-b border-ink-100">
        <Container size="content" className="h-16 flex items-center justify-between gap-6">
          <div className="inline-flex items-center gap-2">
            {/* 40×40, the canon icon-button tier. It was a bare 16×16 glyph — the
                smallest target in the product, on a primary nav control. The
                negative margin keeps the chevron optically where it was. */}
            <Link href={backHref} aria-label="უკან" className="w-10 h-10 -ml-2.5 rounded-btn inline-flex items-center justify-center text-ink-700 hover:text-ink-900 hover:bg-ink-100 transition-colors duration-fast">
              <Icon.chevR className="w-4 h-4 rotate-180" />
            </Link>
            {/* Logo always goes to the main page „/" — the chevron handles „back". */}
            <Logo size="sm" />
          </div>
          {/* The sticky bar no longer repeats the page title. „პარამეტრები"
              appeared here AND as the h1 directly beneath it — the same word
              twice within 200px, which reads as a rendering mistake rather than
              as navigation. The back chevron and logo carry the chrome. */}
        </Container>
      </header>

      <Container as="main" size="content" className="py-10 space-y-8">
        {/* Page header — the sticky utility bar above is chrome, not a
            heading; this is the page's actual title, on the shared workspace
            PageHeader (same scale as /student/bookings, /tutor/*). */}
        <PageHeader eyebrow="ანგარიში" title="პარამეტრები" />

        <ProfileSection
          me={me}
          fullName={fullName}
          setFullName={setFullName}
          phone={phone}
          setPhone={setPhone}
          bio={bio}
          setBio={setBio}
          avatarUrl={avatarUrl}
          savingProfile={savingProfile}
          profileMsg={profileMsg}
          fileInput={fileInput}
          uploading={uploading}
          saveProfile={saveProfile}
          pickAvatar={pickAvatar}
          uploadAvatar={uploadAvatar}
          removeAvatar={removeAvatar}
        />

        <PasswordSection
          currentPw={currentPw}
          setCurrentPw={setCurrentPw}
          newPw={newPw}
          setNewPw={setNewPw}
          confirmPw={confirmPw}
          setConfirmPw={setConfirmPw}
          showCurrentPw={showCurrentPw}
          setShowCurrentPw={setShowCurrentPw}
          showNewPw={showNewPw}
          setShowNewPw={setShowNewPw}
          showConfirmPw={showConfirmPw}
          setShowConfirmPw={setShowConfirmPw}
          savingPw={savingPw}
          pwMsg={pwMsg}
          savePassword={savePassword}
        />

        <AccountSection
          me={me}
          verifyStage={verifyStage}
          verifyCode={verifyCode}
          setVerifyCode={setVerifyCode}
          verifyingBusy={verifyingBusy}
          verifyMsg={verifyMsg}
          startVerify={startVerify}
          submitVerify={submitVerify}
          setSignOutOpen={setSignOutOpen}
          openDelete={openDelete}
        />

        <PrefsSection
          me={me}
          prefs={prefs}
          prefsMsg={prefsMsg}
          savingKey={savingKey}
          togglePref={togglePref}
        />
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
                className="w-full mt-2 h-11 px-3 rounded-field border border-ink-200 focus:border-danger-500 focus:ring-2 focus:ring-danger-100 focus:outline-none text-body text-ink-900 transition-colors duration-fast"
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
                    className="w-full h-11 pl-3 pr-12 rounded-field border border-ink-200 focus:border-danger-500 focus:ring-2 focus:ring-danger-100 focus:outline-none text-body text-ink-900 transition-colors duration-fast"
                    disabled={deleteBusy}
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeletePw(s => !s)}
                    aria-label={showDeletePw ? 'დამალე' : 'აჩვენე'}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-btn text-ink-500 hover:text-ink-800 hover:bg-ink-100 inline-flex items-center justify-center transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    {showDeletePw ? <Icon.eyeOff className="w-4 h-4" /> : <Icon.eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>
            )}
            {deleteErr && (
              <div role="alert" className="rounded-btn border border-danger-200 bg-danger-50 text-danger-800 px-3 py-2 text-meta font-medium">
                {deleteErr}
              </div>
            )}
            {!canDelete && (
              <p className="text-meta text-ink-500">
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

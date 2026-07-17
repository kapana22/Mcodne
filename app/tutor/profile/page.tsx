'use client'
import { useEffect, useRef, useState } from 'react'
import { TutorAppBar } from '@/components/TutorAppBar'
import { Footer } from '@/components/Footer'
import { Btn } from '@/components/Btn'
import { Avatar } from '@/components/Avatar'
import { Icon } from '@/components/Icon'
import { ConfirmModal } from '@/components/ConfirmModal'
import { useToast } from '@/components/ToastProvider'
import { ProfileCompleteness } from '@/components/ProfileCompleteness'
import { safeHttpUrl } from '@/lib/safeUrl'

type Me = {
  id: string
  fullName: string
  email: string
  avatarUrl?: string | null
  phone?: string | null
} | null

type TutorProfile = {
  id: string
  headline: string
  bio: string | null
  specialty: string
  yearsExp: number
  price: number
  languages: string[]
  serviceType?: 'CONSULTATION' | 'RECURRING'
  consultationDurationMin?: number
  videoUrl?: string | null
  available?: boolean
  linkedinUrl?: string | null
  websiteUrl?: string | null
  responseHours?: number
} | null

const RESPONSE_HOUR_OPTIONS: { value: 4 | 12 | 24 | 48; label: string }[] = [
  { value: 4,  label: '4 საათში' },
  { value: 12, label: '12 საათში' },
  { value: 24, label: '24 საათში' },
  { value: 48, label: '48 საათში' },
]

type Certificate = { id: string; title: string; issuer: string; year: number; fileUrl: string | null; verified: boolean }
type Education = { id: string; school: string; degree: string; field: string | null; startYear: number; endYear: number | null }
type Experience = { id: string; company: string; role: string; startYear: number; endYear: number | null; description: string | null }

const LANG_OPTIONS = [
  { code: 'ka', label: 'ქართული' },
  { code: 'en', label: 'ინგლისური' },
  { code: 'ru', label: 'რუსული' },
  { code: 'de', label: 'გერმანული' },
  { code: 'fr', label: 'ფრანგული' },
  { code: 'tr', label: 'თურქული' },
]

export default function TutorProfilePage() {
  const [me, setMe] = useState<Me>(null)
  const [profile, setProfile] = useState<TutorProfile>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  // Intro video is now YouTube-URL-only (no file upload). `videoInput` holds the
  // draft input while typing; `videoSaving` is the PATCH-in-flight flag.
  const [videoInput, setVideoInput] = useState('')
  const [videoSaving, setVideoSaving] = useState(false)
  const [videoErr, setVideoErr] = useState<string | null>(null)
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [form, setForm] = useState({
    headline: '', bio: '', specialty: '',
    yearsExp: 0, hourlyRate: 0,
    languages: [] as string[],
    linkedinUrl: '', websiteUrl: '',
  })
  // Snapshot of the last-saved form values. `dirty` drives the save button:
  // active "შეინახე ცვლილებები" when there are unsaved edits, disabled
  // "შენახულია ✓" once everything is persisted — so the tutor always knows
  // whether the public profile matches what's on screen.
  const [savedForm, setSavedForm] = useState<typeof form | null>(null)
  const dirty = savedForm !== null && JSON.stringify(form) !== JSON.stringify(savedForm)
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' })
  const fileRef = useRef<HTMLInputElement | null>(null)

  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [education, setEducation] = useState<Education[]>([])
  const [experience, setExperience] = useState<Experience[]>([])
  type ConsultTier = 'QUICK' | 'STANDARD' | 'DEEP'
  type Consultation = { id: string; tier: ConsultTier; title: string; description: string; minutes: number; price: number }
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [consForm, setConsForm] = useState<{ tier: ConsultTier; title: string; description: string; minutes: number; price: number }>({
    tier: 'STANDARD', title: '', description: '', minutes: 60, price: 80,
  })
  const [consBusy, setConsBusy] = useState(false)
  const [consErr, setConsErr] = useState<string | null>(null)

  // Unified confirm state for deleting a certificate / education / experience
  // entry. Only one modal is on screen at a time, so a single state suffices.
  type PendingDelete =
    | { kind: 'cert'; id: string }
    | { kind: 'edu';  id: string }
    | { kind: 'exp';  id: string }
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const { toast } = useToast()
  const [certForm, setCertForm] = useState({ title: '', issuer: '', year: new Date().getFullYear(), fileUrl: '', fileName: '' })
  const [certUploading, setCertUploading] = useState(false)
  const [certUploadErr, setCertUploadErr] = useState<string | null>(null)
  const certFileRef = useRef<HTMLInputElement | null>(null)

  const onCertFile = async (f: File) => {
    setCertUploadErr(null)
    if (f.size > 25 * 1024 * 1024) { setCertUploadErr('ფაილი > 25MB'); return }
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
      setCertUploadErr('მხოლოდ PDF ან სურათი')
      return
    }
    setCertUploading(true)
    try {
      const fd = new FormData()
      fd.append('kind', 'certificate')
      fd.append('file', f)
      const res = await fetch('/api/uploads', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setCertUploadErr(data.error === 'TOO_LARGE' ? 'ფაილი ძალიან დიდია' : 'ატვირთვა ვერ მოხერხდა')
        return
      }
      setCertForm(prev => ({ ...prev, fileUrl: data.url, fileName: data.fileName ?? f.name }))
    } catch {
      setCertUploadErr('ქსელის შეცდომა')
    } finally {
      setCertUploading(false)
    }
  }
  const [eduForm, setEduForm] = useState({ school: '', degree: '', field: '', startYear: new Date().getFullYear() - 4, endYear: '' as string | number })
  const [expForm, setExpForm] = useState({ company: '', role: '', startYear: new Date().getFullYear() - 2, endYear: '' as string | number, description: '' })
  const [certBusy, setCertBusy] = useState(false)
  const [eduBusy, setEduBusy] = useState(false)
  const [expBusy, setExpBusy] = useState(false)

  const loadCredentials = async () => {
    try {
      const [c, e, x, co] = await Promise.all([
        fetch('/api/me/tutor/certificates').then(r => r.json()),
        fetch('/api/me/tutor/education').then(r => r.json()),
        fetch('/api/me/tutor/experience').then(r => r.json()),
        fetch('/api/tutor/consultations').then(r => r.json()),
      ])
      setCertificates(c?.items ?? [])
      setEducation(e?.items ?? [])
      setExperience(x?.items ?? [])
      setConsultations(co?.items ?? [])
    } catch {}
  }

  const addConsultation = async (e: React.FormEvent) => {
    e.preventDefault()
    setConsBusy(true); setConsErr(null)
    try {
      const res = await fetch('/api/tutor/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(consForm),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) { setConsErr('ვერ დაემატა'); return }
      setConsultations(prev => [...prev, j.item])
      setConsForm({ tier: 'STANDARD', title: '', description: '', minutes: 60, price: 80 })
      toast('სერვისი დაემატა', 'success')
    } catch { setConsErr('ქსელის შეცდომა') }
    finally { setConsBusy(false) }
  }

  const deleteConsultation = async (id: string) => {
    if (!confirm('წავშალო ეს სერვისი?')) return
    try {
      const res = await fetch(`/api/tutor/consultations/${id}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) {
        toast(j.error === 'IN_USE' ? `ვერ წაიშლება — ${j.count} აქტიური ჯავშანი` : 'წაშლა ვერ მოხერხდა', 'error')
        return
      }
      setConsultations(prev => prev.filter(c => c.id !== id))
      toast('სერვისი წაიშალა', 'success')
    } catch { toast('ქსელის შეცდომა', 'error') }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [meRes, tRes] = await Promise.all([
          fetch('/api/me').then(r => r.json()),
          fetch('/api/me/tutor').then(r => r.json()),
        ])
        if (cancelled) return
        setMe(meRes?.user ?? null)
        const p = tRes?.profile ?? null
        setProfile(p)
        if (p) {
          const initial = {
            headline: p.headline ?? '',
            bio: p.bio ?? '',
            specialty: p.specialty ?? '',
            yearsExp: p.yearsExp ?? 0,
            hourlyRate: p.price ?? 0,
            languages: p.languages ?? [],
            linkedinUrl: p.linkedinUrl ?? '',
            websiteUrl: p.websiteUrl ?? '',
          }
          setForm(initial)
          setSavedForm(initial)
          loadCredentials()
        }
      } catch {
        if (!cancelled) setErr('მონაცემების ჩატვირთვა ვერ მოხერხდა')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    try {
      const res = await fetch('/api/me/tutor', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline: form.headline,
          bio: form.bio,
          specialty: form.specialty,
          yearsExp: Number(form.yearsExp),
          hourlyRate: Number(form.hourlyRate),
          languages: form.languages,
          linkedinUrl: form.linkedinUrl,
          websiteUrl: form.websiteUrl,
        }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || 'FAIL')
      setProfile(j.profile)
      setSavedForm({ ...form, languages: [...form.languages] })
      toast('პროფილი შენახულია', 'success')
    } catch {
      toast('შენახვა ვერ მოხერხდა — სცადე თავიდან', 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  const uploadAvatar = async (file: File) => {
    setAvatarUploading(true)
    try {
      const fd = new FormData()
      fd.append('kind', 'avatar')
      fd.append('file', file)
      const res = await fetch('/api/uploads', { method: 'POST', body: fd })
      const j = await res.json()
      if (j.ok) {
        setMe(prev => prev ? { ...prev, avatarUrl: j.url } : prev)
        toast('ავატარი განახლდა', 'success')
      } else {
        toast(j.error === 'TOO_LARGE' ? 'ფაილი ძალიან დიდია (მაქს. 500KB)' : 'ატვირთვა ვერ მოხერხდა', 'error')
      }
    } catch {
      toast('ქსელის შეცდომა — სცადე თავიდან', 'error')
    } finally {
      setAvatarUploading(false)
    }
  }

  // Save a YouTube URL as the intro video. Server normalizes any accepted form
  // (watch, youtu.be, shorts, embed, bare 11-char ID) to canonical "youtu.be/{id}".
  const saveIntroVideo = async () => {
    const raw = videoInput.trim()
    if (!raw) { setVideoErr('ჩააგდე YouTube ბმული'); return }
    setVideoErr(null)
    setVideoSaving(true)
    try {
      const res = await fetch('/api/me/tutor', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: raw }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        setVideoErr(j?.error === 'BAD_YOUTUBE_URL' ? 'არასწორი YouTube ბმული' : 'შენახვა ვერ მოხერხდა')
        return
      }
      setProfile(prev => prev ? { ...prev, videoUrl: j.profile?.videoUrl ?? null } : prev)
      setVideoInput('')
      toast('ვიდეო შენახულია', 'success')
    } catch { setVideoErr('ქსელის შეცდომა') }
    finally { setVideoSaving(false) }
  }

  const removeIntroVideo = async () => {
    if (!confirm('წავშალო intro ვიდეო?')) return
    setVideoSaving(true)
    setVideoErr(null)
    try {
      const res = await fetch('/api/me/tutor', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: null }),
      })
      if (!res.ok) { setVideoErr('წაშლა ვერ მოხერხდა'); return }
      setProfile(prev => prev ? { ...prev, videoUrl: null } : prev)
      toast('ვიდეო წაიშალა', 'success')
    } finally { setVideoSaving(false) }
  }

  // Extract the YouTube ID from any stored canonical URL for iframe/thumbnail
  // rendering. Legacy `data:video/…;base64,…` rows return null and render as
  // a plain "no video" placeholder in the section below.
  const currentYouTubeId = (() => {
    const v = profile?.videoUrl
    if (!v || v.startsWith('data:')) return null
    try {
      const url = v.startsWith('http') ? new URL(v) : new URL(`https://${v}`)
      const host = url.hostname.replace(/^www\./, '')
      if (host === 'youtu.be') {
        const id = url.pathname.slice(1).split('/')[0]
        return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null
      }
      if (host === 'youtube.com' || host === 'm.youtube.com') {
        const q = url.searchParams.get('v')
        if (q && /^[a-zA-Z0-9_-]{11}$/.test(q)) return q
        const parts = url.pathname.split('/').filter(Boolean)
        if (['shorts', 'embed', 'live'].includes(parts[0]) && parts[1] && /^[a-zA-Z0-9_-]{11}$/.test(parts[1])) {
          return parts[1]
        }
      }
      return null
    } catch { return null }
  })()

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwdMsg(null)
    if (pwd.next.length < 6) {
      setPwdMsg({ ok: false, text: 'პაროლი უნდა იყოს მინიმუმ 6 სიმბოლო' })
      return
    }
    if (pwd.next !== pwd.confirm) {
      setPwdMsg({ ok: false, text: 'პაროლები არ ემთხვევა' })
      return
    }
    setSavingPassword(true)
    try {
      const res = await fetch('/api/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwd.current, newPassword: pwd.next }),
      })
      const j = await res.json()
      if (!j.ok) {
        setPwdMsg({ ok: false, text: j.error === 'BAD_CURRENT' ? 'მიმდინარე პაროლი არასწორია' : 'პაროლის შეცვლა ვერ მოხერხდა' })
      } else {
        setPwdMsg({ ok: true, text: 'პაროლი შეიცვალა' })
        setPwd({ current: '', next: '', confirm: '' })
      }
    } catch {
      setPwdMsg({ ok: false, text: 'პაროლის შეცვლა ვერ მოხერხდა' })
    } finally {
      setSavingPassword(false)
    }
  }

  const toggleLang = (code: string) => {
    setForm(f => ({
      ...f,
      languages: f.languages.includes(code) ? f.languages.filter(l => l !== code) : [...f.languages, code],
    }))
  }

  const addCertificate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!certForm.title.trim() || !certForm.issuer.trim()) return
    setCertBusy(true)
    try {
      const res = await fetch('/api/me/tutor/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: certForm.title.trim(),
          issuer: certForm.issuer.trim(),
          year: Number(certForm.year),
          fileUrl: certForm.fileUrl.trim() || undefined,
        }),
      })
      const j = await res.json()
      if (j.ok) {
        setCertForm({ title: '', issuer: '', year: new Date().getFullYear(), fileUrl: '', fileName: '' })
        loadCredentials()
        toast('სერტიფიკატი დაემატა', 'success')
      } else {
        toast('დამატება ვერ მოხერხდა', 'error')
      }
    } catch {
      toast('ქსელის შეცდომა — სცადე თავიდან', 'error')
    } finally { setCertBusy(false) }
  }

  const deleteCertificate = (id: string) => {
    setPendingDelete({ kind: 'cert', id })
  }

  const addEducation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!eduForm.school.trim() || !eduForm.degree.trim()) return
    setEduBusy(true)
    try {
      const endYearNum = typeof eduForm.endYear === 'string' && eduForm.endYear.trim() === '' ? null : Number(eduForm.endYear)
      const res = await fetch('/api/me/tutor/education', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school: eduForm.school.trim(),
          degree: eduForm.degree.trim(),
          field: eduForm.field.trim() || undefined,
          startYear: Number(eduForm.startYear),
          endYear: endYearNum ?? undefined,
        }),
      })
      const j = await res.json()
      if (j.ok) {
        setEduForm({ school: '', degree: '', field: '', startYear: new Date().getFullYear() - 4, endYear: '' })
        loadCredentials()
        toast('განათლება დაემატა', 'success')
      } else {
        toast('დამატება ვერ მოხერხდა', 'error')
      }
    } catch {
      toast('ქსელის შეცდომა — სცადე თავიდან', 'error')
    } finally { setEduBusy(false) }
  }

  const deleteEducation = (id: string) => {
    setPendingDelete({ kind: 'edu', id })
  }

  const addExperience = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!expForm.company.trim() || !expForm.role.trim()) return
    setExpBusy(true)
    try {
      const endYearNum = typeof expForm.endYear === 'string' && expForm.endYear.trim() === '' ? null : Number(expForm.endYear)
      const res = await fetch('/api/me/tutor/experience', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: expForm.company.trim(),
          role: expForm.role.trim(),
          startYear: Number(expForm.startYear),
          endYear: endYearNum ?? undefined,
          description: expForm.description.trim() || undefined,
        }),
      })
      const j = await res.json()
      if (j.ok) {
        setExpForm({ company: '', role: '', startYear: new Date().getFullYear() - 2, endYear: '', description: '' })
        loadCredentials()
        toast('გამოცდილება დაემატა', 'success')
      } else {
        toast('დამატება ვერ მოხერხდა', 'error')
      }
    } catch {
      toast('ქსელის შეცდომა — სცადე თავიდან', 'error')
    } finally { setExpBusy(false) }
  }

  const deleteExperience = (id: string) => {
    setPendingDelete({ kind: 'exp', id })
  }

  // Endpoint + copy vary by entity — keep the mapping in one place so the
  // modal below stays declarative.
  const DELETE_META: Record<PendingDelete['kind'], { path: string; title: string; body: string }> = {
    cert: { path: 'certificates', title: 'სერტიფიკატის წაშლა?', body: 'ეს მოქმედება შეუქცევადია.' },
    edu:  { path: 'education',    title: 'განათლების ჩანაწერის წაშლა?', body: 'ეს მოქმედება შეუქცევადია.' },
    exp:  { path: 'experience',   title: 'გამოცდილების წაშლა?', body: 'ეს მოქმედება შეუქცევადია.' },
  }

  const confirmDelete = async () => {
    if (!pendingDelete || deleteBusy) return
    const meta = DELETE_META[pendingDelete.kind]
    setDeleteBusy(true)
    try {
      const res = await fetch(`/api/me/tutor/${meta.path}/${pendingDelete.id}`, { method: 'DELETE' })
      if (!res.ok) { toast('წაშლა ვერ მოხერხდა', 'error'); return }
      setPendingDelete(null)
      await loadCredentials()
      toast('წაიშალა', 'success')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-ink-50 flex flex-col">
      {/* globals.css puts `overflow-x: hidden` on html/body, which turns body into
          a scroll container and silently defeats every `position: sticky` on the
          page (left rail AND app bar). `clip` clips horizontal overflow identically
          but without creating a scroll container. Scoped to this page's mount. */}
      <style>{`html, body { overflow-x: clip; }`}</style>
      <TutorAppBar user={me ? { name: me.fullName, avatar: me.avatarUrl ?? undefined } : undefined} />

      <main className="flex-1 px-6 py-8 max-w-[900px] lg:max-w-[1120px] w-full mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-[26px] font-bold tracking-tight text-ink-900">პროფილი</h1>
            <p className="text-[13px] text-ink-500 mt-1">როგორ ხედავენ კლიენტები შენს პროფილს</p>
          </div>
          {profile && (
            <a
              href={`/tutors/${profile.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1.5 h-9 px-3 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Icon.external className="w-3.5 h-3.5" />
              იხილე პროფილი როგორც კლიენტი
            </a>
          )}
        </div>

        {err && (
          <div className="mb-4 p-4 rounded-card bg-danger-50 border border-danger-200 text-danger-700 text-[13px]">{err}</div>
        )}

        {loading ? (
          <div className="p-12 rounded-card border border-ink-200 bg-white flex items-center justify-center text-ink-400">
            <span className="inline-block w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <span className="ml-3 text-[13px]">იტვირთება…</span>
          </div>
        ) : (
          <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8 lg:items-start">
            {/* Left sticky rail — profile completeness + section navigation.
                On mobile it stacks above the content (nav hidden, completeness
                stays at the top exactly as before). */}
            <aside className="mb-6 lg:mb-0 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto space-y-4">
              {/* Profile completeness — always visible on the profile page so
                  tutors see immediate feedback as they fill in fields. */}
              {profile && (
                <ProfileCompleteness
                  profile={profile}
                  certificates={certificates.length}
                  education={education.length}
                  experience={experience.length}
                  avatarUrl={me?.avatarUrl ?? null}
                  variant="card"
                  alwaysShow
                />
              )}

              <nav aria-label="პროფილის სექციები" className="hidden lg:block p-4 rounded-card border border-ink-200 bg-white">
                <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.2em] text-ink-400 mb-2 px-2">სექციები</div>
                <ul className="space-y-0.5">
                  {[
                    { href: '#group-public',      label: 'საჯარო პროფილი' },
                    { href: '#group-services',    label: 'სერვისები და ფასი' },
                    { href: '#group-credentials', label: 'კვალიფიკაცია' },
                    { href: '#group-account',     label: 'ანგარიში' },
                  ].map(l => (
                    <li key={l.href}>
                      <a
                        href={l.href}
                        className="block px-2 py-1.5 rounded-btn font-display text-[13px] font-semibold text-ink-700 hover:text-brand-700 hover:bg-ink-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>

            {/* Main content column — 4 titled section groups */}
            <div className="min-w-0 space-y-10">

            {/* ——— Group 1: საჯარო პროფილი ——— */}
            <CollapsibleGroup id="group-public" title="საჯარო პროფილი" defaultOpen>

            {/* Avatar block — hover overlay pattern, keyboard-focusable button.
                Reuses the existing `uploadAvatar` handler and hidden file input. */}
            <section id="section-avatar" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white">
              <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-600 mb-4">ავატარი</div>
              <div className="flex items-center gap-5">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={avatarUploading}
                  aria-label="ავატარის შეცვლა"
                  className="group relative w-[72px] h-[72px] rounded-full overflow-hidden shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-wait"
                >
                  <span className="block w-full h-full">
                    <Avatar src={me?.avatarUrl ?? undefined} name={me?.fullName} size={72} />
                  </span>
                  {!avatarUploading && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full inline-flex flex-col items-center justify-center gap-0.5 bg-black/45 text-white opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-visible:opacity-100 motion-safe:transition-opacity motion-safe:duration-150"
                    >
                      <Icon.camera className="w-4 h-4" />
                      <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.14em]">შეცვლა</span>
                    </span>
                  )}
                  {avatarUploading && (
                    <span aria-hidden="true" className="absolute inset-0 rounded-full inline-flex items-center justify-center bg-black/55 text-white">
                      <svg viewBox="0 0 24 24" className="w-5 h-5 motion-safe:animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" />
                      </svg>
                    </span>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="font-display text-[15px] font-bold text-ink-900">{me?.fullName}</div>
                  <div className="text-[12.5px] text-ink-500 truncate">{me?.email}</div>
                  <div className="mt-1 text-[11px] text-ink-500">ავატარი მაქს. 500KB · JPG/PNG/WEBP/GIF</div>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadAvatar(f) }}
                />
              </div>
            </section>

            {/* Public profile form */}
            {profile ? (
              <form id="section-public-profile" onSubmit={saveProfile} className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-600">საჯარო პროფილი</div>
                  {dirty && (
                    <span className="text-[11.5px] font-display font-semibold text-warning-700">შეუნახავი ცვლილებები</span>
                  )}
                </div>

                <Field label="სათაური (headline)">
                  <input type="text" required maxLength={200}
                         value={form.headline} onChange={e => setForm({ ...form, headline: e.target.value })}
                         className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[14px] text-ink-900 focus:border-brand-400 focus:outline-none" />
                </Field>

                <Field label="სპეციალობა">
                  <input type="text" required maxLength={200}
                         value={form.specialty} onChange={e => setForm({ ...form, specialty: e.target.value })}
                         className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[14px] text-ink-900 focus:border-brand-400 focus:outline-none" />
                </Field>

                <Field label="ბიოგრაფია">
                  <textarea rows={5} maxLength={2000}
                            value={form.bio ?? ''} onChange={e => setForm({ ...form, bio: e.target.value })}
                            className="w-full px-3 py-2.5 rounded-field border border-ink-200 bg-white text-[14px] text-ink-900 focus:border-brand-400 focus:outline-none resize-y" />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="გამოცდილება (წლები)">
                    <input type="number" min={0} max={80} required
                           value={form.yearsExp} onChange={e => setForm({ ...form, yearsExp: Number(e.target.value) })}
                           className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[14px] text-ink-900 focus:border-brand-400 focus:outline-none tabular-nums" />
                  </Field>
                  <Field label="საათობრივი ტარიფი (₾)">
                    <input type="number" min={1} max={10000} required
                           value={form.hourlyRate} onChange={e => setForm({ ...form, hourlyRate: Number(e.target.value) })}
                           className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[14px] text-ink-900 focus:border-brand-400 focus:outline-none tabular-nums" />
                    <p className="mt-1.5 text-[11px] text-ink-500 leading-snug">ცვლილება მოქმედებს მხოლოდ ახალ ჯავშანზე — უკვე დაჯავშნილი სესიების ფასი უცვლელი რჩება.</p>
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="LinkedIn ბმული">
                    <input type="url" placeholder="https://linkedin.com/in/username" maxLength={500}
                           value={form.linkedinUrl} onChange={e => setForm({ ...form, linkedinUrl: e.target.value })}
                           className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[14px] text-ink-900 focus:border-brand-400 focus:outline-none" />
                  </Field>
                  <Field label="ვებ-გვერდი / ბლოგი">
                    <input type="url" placeholder="https://example.com" maxLength={500}
                           value={form.websiteUrl} onChange={e => setForm({ ...form, websiteUrl: e.target.value })}
                           className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[14px] text-ink-900 focus:border-brand-400 focus:outline-none" />
                  </Field>
                </div>

                <Field label="ენები">
                  <div className="flex flex-wrap gap-2">
                    {LANG_OPTIONS.map(l => {
                      const active = form.languages.includes(l.code)
                      return (
                        <button key={l.code} type="button" onClick={() => toggleLang(l.code)}
                                className={`h-9 px-3 rounded-pill border text-[13px] font-display font-semibold transition-colors ${
                                  active ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-ink-200 text-ink-700 hover:border-ink-300'
                                }`}>
                          {l.label}
                        </button>
                      )
                    })}
                  </div>
                </Field>

                {/* Sticky save bar — stays in view while scrolling the long form;
                    disabled "შენახულია ✓" doubles as saved-state confirmation. */}
                <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 rounded-b-card border-t border-ink-100 bg-white flex items-center justify-between gap-3">
                  <span className={`text-[12px] font-display font-semibold ${dirty ? 'text-warning-700' : 'text-ink-400'}`} aria-live="polite">
                    {savingProfile ? 'ინახება…' : dirty ? 'გაქვს შეუნახავი ცვლილებები' : 'ყველა ცვლილება შენახულია'}
                  </span>
                  <Btn variant="primary" size="md" type="submit" disabled={savingProfile || !dirty}>
                    {savingProfile ? 'ინახება…' : dirty ? 'შეინახე ცვლილებები' : 'შენახულია ✓'}
                  </Btn>
                </div>
              </form>
            ) : (
              <div className="p-6 rounded-card border border-warning-200 bg-warning-50 text-warning-800 text-[13px] flex items-start gap-3">
                <Icon.warn className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  ჯერ არ გაქვს ექსპერტის პროფილი. გაიარე განაცხადის პროცედურა და დაელოდე დადასტურებას.
                </div>
              </div>
            )}

            {/* Intro video — optional YouTube link shown in tutor detail hero */}
            {profile && (
              <section id="section-video" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-600 mb-1">Intro ვიდეო · YouTube</div>
                    <p className="text-[12px] text-ink-500 leading-snug max-w-[520px]">60-90 წამი შენს შესახებ. ჩანს პროფილის ბანერზე. Conversion 2-3x-ს ზრდის. ატვირთე YouTube-ზე და ჩააგდე აქ ბმული.</p>
                  </div>
                  {profile.videoUrl && !videoSaving && (
                    <button type="button" onClick={removeIntroVideo} className="font-display text-[11.5px] font-semibold text-ink-500 hover:text-danger-700">წაშლა</button>
                  )}
                </div>

                {currentYouTubeId ? (
                  <div className="rounded-card overflow-hidden bg-black aspect-video">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${currentYouTubeId}?rel=0&modestbranding=1`}
                      title="Intro video"
                      loading="lazy"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full border-0"
                    />
                  </div>
                ) : profile.videoUrl ? (
                  // Legacy base64-embedded video row (from the old file-upload path,
                  // deprecated). Keep it playable while it exists in the DB, but the
                  // remove-and-replace flow will null it out on next save.
                  <div className="space-y-2">
                    <video src={profile.videoUrl} controls className="w-full max-h-[300px] rounded-card bg-black" />
                    <p className="text-[11.5px] text-warning-700">ეს ვიდეო ძველი ატვირთვის სისტემიდანაა. სცადე ჩააგდო YouTube ბმული ქვემოთ — უფრო სწრაფად ჩაიტვირთება კლიენტებთან.</p>
                  </div>
                ) : (
                  <div className="p-4 rounded-card border border-dashed border-ink-300 bg-ink-50/40 text-center">
                    <div className="font-display text-[13px] font-semibold text-ink-700 mb-1">ჯერ არ აქვს intro ვიდეო</div>
                    <p className="text-[12px] text-ink-500 max-w-[400px] mx-auto">გაუკეთე რეკ. თემა: „ვინ ვარ · რას ვაკეთებ · რომელ პრობლემას ვხსნი".</p>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="url"
                      value={videoInput}
                      onChange={e => { setVideoInput(e.target.value); if (videoErr) setVideoErr(null) }}
                      placeholder="https://youtube.com/watch?v=… ან youtu.be/…"
                      disabled={videoSaving}
                      className="flex-1 min-w-[240px] h-11 px-3 rounded-btn border border-ink-200 focus:border-brand-500 focus:outline-none text-[13px] disabled:opacity-60"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveIntroVideo() } }}
                    />
                    <Btn variant="primary" size="sm" onClick={saveIntroVideo} disabled={videoSaving || !videoInput.trim()}>
                      {videoSaving ? 'ინახება…' : profile.videoUrl ? 'ჩანაცვლება' : 'შენახვა'}
                    </Btn>
                  </div>
                  <span className="text-[11px] text-ink-500">ატვირთე YouTube-ზე (public ან unlisted) და ჩააგდე ბმული. Shorts-ის ბმულიც მუშაობს.</span>
                </div>

                {videoErr && <div className="p-2.5 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-[12.5px]">{videoErr}</div>}
              </section>
            )}

            </CollapsibleGroup>

            {/* ——— Group 2: სერვისები და ფასი ——— */}
            {profile && (
            <CollapsibleGroup id="group-services" title="სერვისები და ფასი">

            {/* Service type + Available now (Type A) */}
            {profile && (
              <div id="section-availability" className="scroll-mt-24">
                <ServiceTypeAndAvailability
                  profile={profile}
                  onSaved={(next) => setProfile(next as any)}
                />
              </div>
            )}

            {/* Consultations */}
            {profile && (
              <section id="section-consultations" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-600 mb-1">კონსულტაციის ტიპები</div>
                    <p className="text-[12px] text-ink-500 leading-snug max-w-[520px]">გამოაქვეყნე რამდენიმე პროდუქტი — QUICK (15 წთ), STANDARD (60 წთ), DEEP (90 წთ). გამოჩნდება „სერვისები"-ს განყოფილებაში შენს პროფილზე.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {consultations.length === 0 ? (
                    <div className="text-[12.5px] text-ink-500">ჯერ არაფერი დამატებულა.</div>
                  ) : (
                    consultations.map(c => (
                      <div key={c.id} className="flex items-start gap-3 p-3 rounded-card border border-ink-200 bg-ink-50/40">
                        <span className={`shrink-0 inline-flex items-center h-6 px-2 rounded-pill border font-display text-[10px] font-bold uppercase tracking-[0.14em] ${
                          c.tier === 'QUICK' ? 'bg-brand-50 border-brand-200 text-brand-700'
                          : c.tier === 'DEEP' ? 'bg-iris-50 border-iris-200 text-iris-700'
                          : 'bg-ink-100 border-ink-200 text-ink-700'
                        }`}>{c.tier}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-display text-[13.5px] font-bold text-ink-900 truncate">{c.title}</div>
                          <div className="text-[12px] text-ink-700 leading-snug mt-0.5">{c.description}</div>
                          <div className="text-[11.5px] text-ink-500 tabular-nums mt-1">{c.minutes} წუთი · ₾{c.price}</div>
                        </div>
                        <button type="button" onClick={() => deleteConsultation(c.id)} className="font-display text-[11px] font-semibold text-ink-500 hover:text-danger-700">წაშლა</button>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={addConsultation} className="pt-3 border-t border-ink-100 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr] gap-3">
                    <Field label="ტიპი">
                      <select value={consForm.tier} onChange={e => setConsForm({ ...consForm, tier: e.target.value as ConsultTier })}
                              className="w-full h-11 px-2 rounded-field border border-ink-200 bg-white text-[13.5px] focus:border-brand-400 focus:outline-none">
                        <option value="QUICK">QUICK</option>
                        <option value="STANDARD">STANDARD</option>
                        <option value="DEEP">DEEP</option>
                      </select>
                    </Field>
                    <Field label="სათაური">
                      <input type="text" required maxLength={80} value={consForm.title}
                             onChange={e => setConsForm({ ...consForm, title: e.target.value })}
                             placeholder="მაგ. Pitch deck რევიუ"
                             className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[13.5px] focus:border-brand-400 focus:outline-none" />
                    </Field>
                  </div>
                  <Field label="აღწერა">
                    <textarea rows={2} required maxLength={400} value={consForm.description}
                              onChange={e => setConsForm({ ...consForm, description: e.target.value })}
                              placeholder="მოკლე აღწერა რას მოიცავს სესია"
                              className="w-full px-3 py-2 rounded-field border border-ink-200 bg-white text-[13px] focus:border-brand-400 focus:outline-none resize-y" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="ხანგრძლივობა (წუთი)">
                      <input type="number" required min={5} max={240} value={consForm.minutes}
                             onChange={e => setConsForm({ ...consForm, minutes: Number(e.target.value) })}
                             className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[13.5px] tabular-nums focus:border-brand-400 focus:outline-none" />
                    </Field>
                    <Field label="ფასი (₾)">
                      <input type="number" required min={0} max={10000} value={consForm.price}
                             onChange={e => setConsForm({ ...consForm, price: Number(e.target.value) })}
                             className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[13.5px] tabular-nums focus:border-brand-400 focus:outline-none" />
                    </Field>
                  </div>
                  {consErr && <div className="p-2.5 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-[12.5px]">{consErr}</div>}
                  <div className="flex justify-end">
                    <Btn variant="primary" size="sm" type="submit" disabled={consBusy}>
                      {consBusy ? 'ინახება…' : 'დამატება'}
                    </Btn>
                  </div>
                </form>
              </section>
            )}

            </CollapsibleGroup>
            )}

            {/* ——— Group 3: კვალიფიკაცია ——— */}
            {profile && (
            <CollapsibleGroup id="group-credentials" title="კვალიფიკაცია">

            {/* Certificates */}
            {profile && (
              <section id="section-certificates" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-4">
                <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-600 mb-2">სერტიფიკატები</div>

                <div className="space-y-2">
                  {certificates.length === 0 ? (
                    <div className="text-[12.5px] text-ink-500">ჯერ არაფერი დამატებულა.</div>
                  ) : (
                    certificates.map(c => (
                      <div key={c.id} className="flex items-center gap-3 p-3 rounded-card border border-ink-200 bg-ink-50/40">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <div className="font-display text-[13.5px] font-bold text-ink-900 truncate">{c.title}</div>
                            {c.verified && (
                              <span className="inline-flex items-center h-4 px-1.5 rounded-pill bg-brand-50 border border-brand-200 text-brand-800 font-display text-[9.5px] font-bold uppercase tracking-[0.12em]">გადამოწმებული</span>
                            )}
                          </div>
                          <div className="text-[11.5px] text-ink-500 tabular-nums">{c.issuer} · {c.year}</div>
                        </div>
                        {safeHttpUrl(c.fileUrl) && (
                          <a href={safeHttpUrl(c.fileUrl)} target="_blank" rel="noopener noreferrer" className="font-display text-[11px] font-semibold text-brand-700 hover:text-brand-800">გახსნა</a>
                        )}
                        <button type="button" onClick={() => deleteCertificate(c.id)} className="font-display text-[11px] font-semibold text-ink-500 hover:text-danger-700">წაშლა</button>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={addCertificate} className="pt-3 border-t border-ink-100 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="სახელი">
                      <input type="text" required maxLength={200} value={certForm.title}
                             onChange={e => setCertForm({ ...certForm, title: e.target.value })}
                             placeholder="მაგ. CFA Level III"
                             className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[13.5px] text-ink-900 focus:border-brand-400 focus:outline-none" />
                    </Field>
                    <Field label="გამცემი">
                      <input type="text" required maxLength={200} value={certForm.issuer}
                             onChange={e => setCertForm({ ...certForm, issuer: e.target.value })}
                             placeholder="CFA Institute"
                             className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[13.5px] text-ink-900 focus:border-brand-400 focus:outline-none" />
                    </Field>
                    <Field label="წელი">
                      <input type="number" required min={1900} max={2100} value={certForm.year}
                             onChange={e => setCertForm({ ...certForm, year: Number(e.target.value) })}
                             className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[13.5px] tabular-nums text-ink-900 focus:border-brand-400 focus:outline-none" />
                    </Field>
                    <Field label="ფაილი — PDF ან სურათი (არასავალდებულო)">
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          ref={certFileRef}
                          type="file"
                          accept="application/pdf,image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={e => e.target.files?.[0] && onCertFile(e.target.files[0])}
                        />
                        <Btn variant="secondary" size="sm" type="button" onClick={() => certFileRef.current?.click()} disabled={certUploading}>
                          {certUploading ? 'იტვირთება…' : certForm.fileUrl ? 'შეცვლა' : 'ფაილის არჩევა'}
                        </Btn>
                        {certForm.fileUrl && (
                          <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-700 truncate max-w-[240px]">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-success-500" />
                            {certForm.fileName || 'ატვირთულია'}
                            <button type="button" onClick={() => setCertForm({ ...certForm, fileUrl: '', fileName: '' })} className="ml-1 text-ink-400 hover:text-danger-600 text-[14px]" aria-label="მოხსნა">×</button>
                          </span>
                        )}
                      </div>
                      {certUploadErr && <div className="mt-1.5 text-[11.5px] text-danger-600">{certUploadErr}</div>}
                    </Field>
                  </div>
                  <div className="flex justify-end">
                    <Btn variant="primary" size="sm" type="submit" disabled={certBusy || certUploading}>
                      {certBusy ? 'ინახება…' : 'დაამატე'}
                    </Btn>
                  </div>
                </form>
              </section>
            )}

            {/* Education */}
            {profile && (
              <section id="section-education" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-4">
                <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-600 mb-2">განათლება</div>

                <div className="space-y-2">
                  {education.length === 0 ? (
                    <div className="text-[12.5px] text-ink-500">ჯერ არაფერი დამატებულა.</div>
                  ) : (
                    education.map(e => (
                      <div key={e.id} className="flex items-center gap-3 p-3 rounded-card border border-ink-200 bg-ink-50/40">
                        <div className="flex-1 min-w-0">
                          <div className="font-display text-[13.5px] font-bold text-ink-900 truncate">{e.school}</div>
                          <div className="text-[12px] text-ink-700">{e.degree}{e.field ? ` · ${e.field}` : ''}</div>
                          <div className="text-[11.5px] text-ink-500 tabular-nums">{e.startYear} – {e.endYear ?? 'დღემდე'}</div>
                        </div>
                        <button type="button" onClick={() => deleteEducation(e.id)} className="font-display text-[11px] font-semibold text-ink-500 hover:text-danger-700">წაშლა</button>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={addEducation} className="pt-3 border-t border-ink-100 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="სასწავლებელი">
                      <input type="text" required maxLength={200} value={eduForm.school}
                             onChange={e => setEduForm({ ...eduForm, school: e.target.value })}
                             placeholder="ილიას სახ. უნივერსიტეტი"
                             className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[13.5px] text-ink-900 focus:border-brand-400 focus:outline-none" />
                    </Field>
                    <Field label="ხარისხი">
                      <input type="text" required maxLength={200} value={eduForm.degree}
                             onChange={e => setEduForm({ ...eduForm, degree: e.target.value })}
                             placeholder="MBA / ბაკალავრი / მაგისტრი"
                             className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[13.5px] text-ink-900 focus:border-brand-400 focus:outline-none" />
                    </Field>
                    <Field label="დარგი (არასავალდებულო)">
                      <input type="text" maxLength={200} value={eduForm.field}
                             onChange={e => setEduForm({ ...eduForm, field: e.target.value })}
                             placeholder="Business Administration"
                             className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[13.5px] text-ink-900 focus:border-brand-400 focus:outline-none" />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="დაწყების წელი">
                        <input type="number" required min={1900} max={2100} value={eduForm.startYear}
                               onChange={e => setEduForm({ ...eduForm, startYear: Number(e.target.value) })}
                               className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[13.5px] tabular-nums text-ink-900 focus:border-brand-400 focus:outline-none" />
                      </Field>
                      <Field label="დასრულების წელი">
                        <input type="number" min={1900} max={2100} value={eduForm.endYear}
                               onChange={e => setEduForm({ ...eduForm, endYear: e.target.value })}
                               placeholder="ცარიელი — დღემდე"
                               className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[13.5px] tabular-nums text-ink-900 focus:border-brand-400 focus:outline-none" />
                      </Field>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Btn variant="primary" size="sm" type="submit" disabled={eduBusy}>
                      {eduBusy ? 'ინახება…' : 'დაამატე'}
                    </Btn>
                  </div>
                </form>
              </section>
            )}

            {/* Experience */}
            {profile && (
              <section id="section-experience" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-4">
                <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-600 mb-2">სამუშაო გამოცდილება</div>

                <div className="space-y-2">
                  {experience.length === 0 ? (
                    <div className="text-[12.5px] text-ink-500">ჯერ არაფერი დამატებულა.</div>
                  ) : (
                    experience.map(x => (
                      <div key={x.id} className="flex items-start gap-3 p-3 rounded-card border border-ink-200 bg-ink-50/40">
                        <div className="flex-1 min-w-0">
                          <div className="font-display text-[13.5px] font-bold text-ink-900 truncate">{x.role}</div>
                          <div className="text-[12px] text-ink-700 truncate">{x.company}</div>
                          <div className="text-[11.5px] text-ink-500 tabular-nums">{x.startYear} – {x.endYear ?? 'ახლა'}</div>
                          {x.description && <div className="mt-1 text-[12px] text-ink-600 leading-[1.5]">{x.description}</div>}
                        </div>
                        <button type="button" onClick={() => deleteExperience(x.id)} className="font-display text-[11px] font-semibold text-ink-500 hover:text-danger-700">წაშლა</button>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={addExperience} className="pt-3 border-t border-ink-100 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="კომპანია">
                      <input type="text" required maxLength={200} value={expForm.company}
                             onChange={e => setExpForm({ ...expForm, company: e.target.value })}
                             placeholder="McKinsey & Company"
                             className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[13.5px] text-ink-900 focus:border-brand-400 focus:outline-none" />
                    </Field>
                    <Field label="პოზიცია">
                      <input type="text" required maxLength={200} value={expForm.role}
                             onChange={e => setExpForm({ ...expForm, role: e.target.value })}
                             placeholder="Senior Associate"
                             className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[13.5px] text-ink-900 focus:border-brand-400 focus:outline-none" />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="დაწყების წელი">
                        <input type="number" required min={1900} max={2100} value={expForm.startYear}
                               onChange={e => setExpForm({ ...expForm, startYear: Number(e.target.value) })}
                               className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[13.5px] tabular-nums text-ink-900 focus:border-brand-400 focus:outline-none" />
                      </Field>
                      <Field label="დასრულების წელი">
                        <input type="number" min={1900} max={2100} value={expForm.endYear}
                               onChange={e => setExpForm({ ...expForm, endYear: e.target.value })}
                               placeholder="ცარიელი — ახლა"
                               className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[13.5px] tabular-nums text-ink-900 focus:border-brand-400 focus:outline-none" />
                      </Field>
                    </div>
                    <Field label="აღწერა (არასავალდებულო)">
                      <textarea rows={2} maxLength={2000} value={expForm.description}
                                onChange={e => setExpForm({ ...expForm, description: e.target.value })}
                                placeholder="მოკლე აღწერა"
                                className="w-full px-3 py-2 rounded-field border border-ink-200 bg-white text-[13px] text-ink-900 focus:border-brand-400 focus:outline-none resize-y" />
                    </Field>
                  </div>
                  <div className="flex justify-end">
                    <Btn variant="primary" size="sm" type="submit" disabled={expBusy}>
                      {expBusy ? 'ინახება…' : 'დაამატე'}
                    </Btn>
                  </div>
                </form>
              </section>
            )}

            </CollapsibleGroup>
            )}

            {/* ——— Group 4: ანგარიში ——— */}
            <CollapsibleGroup id="group-account" title="ანგარიში">

            {/* Public visibility — pause self-listing without touching bookings */}
            {profile && (
              <section id="section-visibility" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-600 mb-1">პროფილის ხილვადობა</div>
                    <div className="font-display text-[14px] font-semibold text-ink-900">
                      {profile.available === false ? 'პროფილი დამალულია' : 'პროფილი საჯაროა'}
                    </div>
                    <p className="text-[12px] text-ink-500 mt-1 leading-snug max-w-[480px]">
                      {profile.available === false
                        ? 'ძებნაში აღარ ჩანხარ. უკვე დაჯავშნილი სესიები აქტიური რჩება — კლიენტს ხედავს, დაწერს, შედის ვიდეო-ოთახში. ახლიდან ვერავინ დაგიჯავშნის.'
                        : 'შენ ჩანხარ ძებნის სიაში. გამორთე თუ დროებით შესვენება გინდა (მაგ. შვებულება, workload full) — არსებული ჯავშნები არ დაზარალდება.'}
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
                    className={`relative w-14 h-8 rounded-full transition-colors shrink-0 ${profile.available !== false ? 'bg-success-500' : 'bg-ink-300'}`}
                    aria-pressed={profile.available !== false}
                    aria-label="ხილვადობის toggle">
                    <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-xs transition-all ${profile.available !== false ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
              </section>
            )}

            {/* Response-time promise — shown as trust badge on /tutors/[id] */}
            {profile && (
              <section id="section-response-time" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-3">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-600 mb-1">პასუხის დროის ვალდებულება</div>
                    <p className="text-[12px] text-ink-500 leading-snug max-w-[480px]">რამდენ საათში ვპასუხობ ჯავშნის მოთხოვნას. ეს badge-ი ჩანს ჩემი პროფილის გვერდზე და ძებნის სიაში — trust signal კლიენტისთვის ჯავშნის წინ.</p>
                  </div>
                  <div className="inline-flex rounded-btn border border-ink-200 overflow-hidden shrink-0">
                    {RESPONSE_HOUR_OPTIONS.map(opt => {
                      const active = (profile.responseHours ?? 24) === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={async () => {
                            if (active) return
                            const prev = profile.responseHours ?? 24
                            setProfile(p => p ? { ...p, responseHours: opt.value } : p)
                            try {
                              const res = await fetch('/api/me/tutor', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ responseHours: opt.value }),
                              })
                              if (!res.ok) {
                                setProfile(p => p ? { ...p, responseHours: prev } : p)
                                toast('შენახვა ვერ მოხერხდა', 'error')
                              } else {
                                toast(`განახლდა — ${opt.label}`, 'success')
                              }
                            } catch {
                              setProfile(p => p ? { ...p, responseHours: prev } : p)
                              toast('ქსელის შეცდომა', 'error')
                            }
                          }}
                          className={`h-10 px-3 font-display text-[12.5px] font-semibold transition-colors ${
                            active ? 'bg-brand-500 text-white' : 'text-ink-700 hover:bg-ink-50'
                          }`}>
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </section>
            )}

            {/* Password */}
            <form onSubmit={changePassword} className="p-6 rounded-card border border-ink-200 bg-white space-y-4">
              <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-600 mb-2">პაროლის შეცვლა</div>

              <Field label="მიმდინარე პაროლი">
                <input type="password" required
                       value={pwd.current} onChange={e => setPwd({ ...pwd, current: e.target.value })}
                       className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[14px] focus:border-brand-400 focus:outline-none" />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="ახალი პაროლი">
                  <input type="password" required minLength={6}
                         value={pwd.next} onChange={e => setPwd({ ...pwd, next: e.target.value })}
                         className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[14px] focus:border-brand-400 focus:outline-none" />
                </Field>
                <Field label="დაადასტურე ახალი პაროლი">
                  <input type="password" required minLength={6}
                         value={pwd.confirm} onChange={e => setPwd({ ...pwd, confirm: e.target.value })}
                         className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[14px] focus:border-brand-400 focus:outline-none" />
                </Field>
              </div>

              {pwdMsg && (
                <div className={`text-[12.5px] font-display font-semibold ${pwdMsg.ok ? 'text-success-700' : 'text-danger-700'}`}>
                  {pwdMsg.text}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-ink-100">
                <Btn variant="primary" size="md" type="submit" disabled={savingPassword}>
                  {savingPassword ? 'იცვლება…' : 'შეცვლა'}
                </Btn>
              </div>
            </form>
            </CollapsibleGroup>

            </div>
          </div>
        )}
      </main>

      <Footer />

      <ConfirmModal
        open={!!pendingDelete}
        title={pendingDelete ? DELETE_META[pendingDelete.kind].title : ''}
        body={pendingDelete ? DELETE_META[pendingDelete.kind].body : undefined}
        tone="danger"
        confirmLabel="წაშალე"
        cancelLabel="უკან"
        onConfirm={confirmDelete}
        onCancel={() => { if (!deleteBusy) setPendingDelete(null) }}
        busy={deleteBusy}
      />
    </div>
  )
}

// Group heading — titles each of the 4 section groups (საჯარო პროფილი /
// სერვისები და ფასი / კვალიფიკაცია / ანგარიში) that the left-rail nav links to.
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="pt-1 font-display text-[12px] font-bold uppercase tracking-[0.22em] text-ink-400 select-none">
      {children}
    </h2>
  )
}

// Collapsible wrapper for a section group. Desktop: always expanded (the
// left-rail nav does the wayfinding). Mobile: an accordion — only the first
// group starts open, so the editor reads as 4 scannable headers instead of a
// ~5000px wall. ProfileCompleteness deep-links still work: scrollToAnchor
// broadcasts `mcodne:reveal-section` before scrolling and any group that
// contains the target id opens itself. Only rendered post-load (client data
// gate above), so the window-width initial state can't cause a hydration
// mismatch.
function CollapsibleGroup({ id, title, defaultOpen, children }: { id: string; title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<boolean>(() =>
    typeof window === 'undefined' ? true : window.innerWidth >= 1024 || !!defaultOpen,
  )
  useEffect(() => {
    const onReveal = (e: Event) => {
      const target = (e as CustomEvent<string>).detail
      if (target && ref.current?.querySelector(`#${CSS.escape(target)}`)) setOpen(true)
    }
    window.addEventListener('mcodne:reveal-section', onReveal)
    return () => window.removeEventListener('mcodne:reveal-section', onReveal)
  }, [])
  return (
    <div id={id} ref={ref} className="scroll-mt-24 space-y-6">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="lg:hidden w-full min-h-[44px] flex items-center justify-between gap-3 text-left"
      >
        <GroupLabel>{title}</GroupLabel>
        <Icon.chevD className={`w-4 h-4 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className="hidden lg:block"><GroupLabel>{title}</GroupLabel></div>
      <div className={`space-y-6 ${open ? '' : 'hidden lg:block'}`}>{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 mb-1.5">{label}</span>
      {children}
    </label>
  )
}

function ServiceTypeAndAvailability({
  profile,
  onSaved,
}: {
  profile: NonNullable<TutorProfile>
  onSaved: (next: NonNullable<TutorProfile>) => void
}) {
  const [duration, setDuration] = useState<number>(profile.consultationDurationMin ?? 30)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const save = async (patch: Record<string, any>) => {
    setBusy(true)
    setFlash(null)
    try {
      const res = await fetch('/api/me/tutor', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const j = await res.json()
      if (j.ok) {
        onSaved(j.profile)
        setDuration(j.profile.consultationDurationMin ?? 30)
        setFlash('შენახულია')
        setTimeout(() => setFlash(null), 2500)
      } else {
        setFlash('შენახვა ვერ მოხერხდა')
      }
    } catch {
      setFlash('შენახვა ვერ მოხერხდა')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="p-6 rounded-card border border-ink-200 bg-white space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-600">კონსულტაციის ხანგრძლივობა</div>
          <p className="text-[12.5px] text-ink-500 mt-1">ერთი სტანდარტული სესიის ხანგრძლივობა. ხელმისაწვდომი დროებს კალენდარში აქვეყნებ.</p>
        </div>
        {flash && <span className="text-[12px] font-display font-semibold text-success-700">{flash}</span>}
      </div>

      <div>
        <div className="inline-flex rounded-btn border border-ink-200 overflow-hidden">
          {[15, 30, 60].map(d => (
            <button key={d} type="button"
              onClick={() => save({ consultationDurationMin: d })}
              disabled={busy}
              className={`h-10 px-4 font-display text-[13px] font-semibold transition-colors ${
                duration === d ? 'bg-brand-500 text-white' : 'text-ink-700 hover:bg-ink-50'
              }`}>
              {d} წუთი
            </button>
          ))}
        </div>
      </div>

      <div className="pt-4 border-t border-ink-100 text-[12.5px] text-ink-500 leading-[1.5]">
        კვირის კალენდარი და ხელმისაწვდომობის სლოტები იმართება <a href="/tutor/schedule" className="font-display font-semibold text-brand-700 hover:text-brand-800">გრაფიკის</a> გვერდიდან.
      </div>
    </section>
  )
}

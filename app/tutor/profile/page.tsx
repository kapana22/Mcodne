'use client'
import { useEffect, useRef, useState } from 'react'
import { Btn } from '@/components/Btn'
import { Eyebrow } from '@/components/Eyebrow'
import { Avatar } from '@/components/Avatar'
import { Icon } from '@/components/Icon'
import { ConfirmModal } from '@/components/ConfirmModal'
import { useToast } from '@/components/ToastProvider'
import { ProfileCompleteness } from '@/components/ProfileCompleteness'
import { useAvatarCropper } from '@/components/AvatarCropper'
import { PageHeader } from '@/components/tutor/PageHeader'
import { PriceField } from '@/components/PriceField'
import { safeHttpUrl } from '@/lib/safeUrl'
import { normalizeLangs } from '@/lib/languages'
import { LanguagePicker } from '@/components/LanguagePicker'
import { useUnsavedGuard } from '@/lib/useUnsavedGuard'
import { HEADLINE_MAX } from '@/lib/headline'
import { PackagesSection } from './_packages'
import { StudentsSection } from './_students'

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
  bufferMin?: number
  videoUrl?: string | null
  available?: boolean
  linkedinUrl?: string | null
  websiteUrl?: string | null
  responseHours?: number
  categoryId?: string | null
} | null

type Category = { id: string; slug: string; name: string }


// `hasFile` replaces the scan itself in list payloads — see
// app/api/me/tutor/certificates/route.ts.
type Certificate = { id: string; title: string; issuer?: string | null; year: number; fileUrl?: string | null; hasFile?: boolean; verified: boolean }
type Education = { id: string; school: string; degree: string; field: string | null; startYear: number; endYear: number | null }
type Experience = { id: string; company: string; role: string; startYear: number; endYear: number | null; description: string | null }

// Password policy — mirrors /api/me/password (min 8). Kept in one place so the
// inline check, the input `minLength` and the copy can never drift apart again.
const PWD_MIN = 8
const PWD_MIN_MSG = 'პაროლი უნდა იყოს მინიმუმ 8 სიმბოლო'

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

  const [categories, setCategories] = useState<Category[]>([])
  const [form, setForm] = useState({
    headline: '', bio: '', specialty: '',
    yearsExp: 0, hourlyRate: 0,
    languages: [] as string[],
    linkedinUrl: '', websiteUrl: '',
    categoryId: '' as string,
  })
  // Snapshot of the last-saved form values. `dirty` drives the save button:
  // active "შეინახე ცვლილებები" when there are unsaved edits, disabled
  // "შენახულია ✓" once everything is persisted — so the tutor always knows
  // whether the public profile matches what's on screen.
  const [savedForm, setSavedForm] = useState<typeof form | null>(null)
  const dirty = savedForm !== null && JSON.stringify(form) !== JSON.stringify(savedForm)
  // …and now that `dirty` is known, refuse to lose it silently. Covers tab
  // close / reload AND in-app links (the sidebar is right there, one stray
  // click from a bio you spent ten minutes on).
  useUnsavedGuard(dirty, 'შენახული არ არის — თუ გახვალ, ცვლილებები დაიკარგება. მაინც გავიდე?')
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' })
  // Display name lives on the account (user.fullName), edited via /api/me —
  // NOT the tutor-profile PATCH. Seeded from the /api/me load below.
  const [fullNameInput, setFullNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)

  const [certificates, setCertificates] = useState<Certificate[]>([])
  // Only certificates that carry a document count toward completeness — a
  // `fileUrl = NULL` row is hidden on the public profile, so scoring it as done
  // would tell the expert their profile is more finished than a visitor sees.
  // Mirrors the same filter in /api/tutor/nav-badges and /api/admin/insights.
  const certificatesWithFile = certificates.filter(c => c.hasFile || !!safeHttpUrl(c.fileUrl)).length
  const [education, setEducation] = useState<Education[]>([])
  const [experience, setExperience] = useState<Experience[]>([])
  // Upcoming free-slot count — feeds the ProfileCompleteness „თავისუფალი დრო"
  // check. Booking is slot-gated, so 0 slots keeps that step incomplete.
  // Best-effort: stays 0 if the availability fetch fails.
  const [slotCount, setSlotCount] = useState(0)
  type ConsultTier = 'QUICK' | 'STANDARD' | 'DEEP'
  type Consultation = { id: string; tier: ConsultTier; title: string; description: string; minutes: number; price: number }
  const [consultations, setConsultations] = useState<Consultation[]>([])
  // The QUICK/STANDARD/DEEP tier is a backend enum — never surfaced to the
  // expert. It's derived from the chosen minutes at submit time so the saved
  // data shape stays valid while the UI only ever shows title/minutes/price.
  const tierFromMinutes = (m: number): ConsultTier => (m <= 20 ? 'QUICK' : m <= 45 ? 'STANDARD' : 'DEEP')
  const [consForm, setConsForm] = useState<{ title: string; description: string; minutes: number; price: number }>({
    title: '', description: '', minutes: 60, price: 80,
  })
  const [consBusy, setConsBusy] = useState(false)
  const [consErr, setConsErr] = useState<string | null>(null)
  // Inline edit of a single existing service row. `consEdit` holds the id +
  // prefilled fields of the row being edited (null = none). Same fields as the
  // add-form; tier is derived server-side on PATCH so we never surface it.
  const [consEdit, setConsEdit] = useState<{ id: string; title: string; description: string; minutes: number; price: number } | null>(null)
  const [consEditBusy, setConsEditBusy] = useState(false)
  const [consEditErr, setConsEditErr] = useState<string | null>(null)

  // Unified confirm state for EVERY destructive action on this page —
  // certificate / education / experience / consultation-service rows and the
  // intro video. One modal, one busy flag, one paradigm (no native confirm()).
  type PendingDelete =
    | { kind: 'cert';  id: string }
    | { kind: 'edu';   id: string }
    | { kind: 'exp';   id: string }
    | { kind: 'cons';  id: string }
    | { kind: 'video'; id?: string }
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  // ── Tabs. Panels stay MOUNTED (hidden, not unmounted) so in-progress form
  // state survives switches and every #section-* anchor stays in the DOM for
  // ProfileCompleteness deep links.
  const [activeTab, setActiveTab] = useState(0)
  const { toast } = useToast()

  // ProfileCompleteness checklist links dispatch `mcodne:reveal-section`
  // (and hard links may arrive as /tutor/profile#section-…). Activate the
  // owning tab, then scroll once the panel is visible (double rAF: state
  // flush → layout).
  useEffect(() => {
    const SECTION_TO_TAB: Record<string, number> = {
      'section-avatar': 0, 'section-public-profile': 0, 'section-video': 0,
      'section-availability': 1, 'section-consultations': 1,
      'section-certificates': 2, 'section-education': 2, 'section-experience': 2,
      'section-visibility': 3,
    }
    const revealTab = (id: string) => {
      const tab = SECTION_TO_TAB[id]
      if (tab === undefined) return
      setActiveTab(tab)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }))
    }
    const onReveal = (e: Event) => {
      const id = (e as CustomEvent<string>).detail
      if (id) revealTab(id)
    }
    window.addEventListener('mcodne:reveal-section', onReveal)
    if (window.location.hash.startsWith('#section-')) revealTab(window.location.hash.slice(1))
    return () => window.removeEventListener('mcodne:reveal-section', onReveal)
  }, [])
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
      const [c, e, x, co, av] = await Promise.all([
        fetch('/api/me/tutor/certificates').then(r => r.json()),
        fetch('/api/me/tutor/education').then(r => r.json()),
        fetch('/api/me/tutor/experience').then(r => r.json()),
        fetch('/api/tutor/consultations').then(r => r.json()),
        // Future free-slot count for the completeness checklist. Best-effort:
        // the availability GET returns { upcomingFreeCount }; default 0 on fail.
        fetch('/api/tutor/availability').then(r => r.ok ? r.json() : null).catch(() => null),
      ])
      setCertificates(c?.items ?? [])
      setEducation(e?.items ?? [])
      setExperience(x?.items ?? [])
      setConsultations(co?.items ?? [])
      setSlotCount(Number(av?.upcomingFreeCount ?? 0))
    } catch {}
  }

  const addConsultation = async (e: React.FormEvent) => {
    e.preventDefault()
    setConsBusy(true); setConsErr(null)
    try {
      const res = await fetch('/api/tutor/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...consForm, tier: tierFromMinutes(consForm.minutes) }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) { setConsErr('ვერ დაემატა'); return }
      setConsultations(prev => [...prev, j.item])
      setConsForm({ title: '', description: '', minutes: 60, price: 80 })
      toast('სერვისი დაემატა', 'success')
    } catch { setConsErr('ქსელის შეცდომა') }
    finally { setConsBusy(false) }
  }

  const deleteConsultation = (id: string) => {
    setPendingDelete({ kind: 'cons', id })
  }

  const startEditConsultation = (c: Consultation) => {
    setConsEditErr(null)
    setConsEdit({ id: c.id, title: c.title, description: c.description, minutes: c.minutes, price: c.price })
  }
  const cancelEditConsultation = () => { setConsEdit(null); setConsEditErr(null) }
  const saveConsultation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!consEdit) return
    const { id, ...body } = consEdit
    setConsEditBusy(true); setConsEditErr(null)
    try {
      const res = await fetch(`/api/tutor/consultations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) { setConsEditErr('ვერ შეინახა'); return }
      setConsultations(prev => prev.map(c => (c.id === id ? j.item : c)))
      setConsEdit(null)
      toast('სერვისი განახლდა', 'success')
    } catch { setConsEditErr('ქსელის შეცდომა') }
    finally { setConsEditBusy(false) }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [meRes, tRes, catRes] = await Promise.all([
          fetch('/api/me').then(r => r.json()),
          fetch('/api/me/tutor').then(r => r.json()),
          fetch('/api/categories').then(r => r.json()).catch(() => []),
        ])
        if (cancelled) return
        setMe(meRes?.user ?? null)
        setFullNameInput(meRes?.user?.fullName ?? '')
        setCategories(Array.isArray(catRes) ? catRes : (catRes?.items ?? []))
        const p = tRes?.profile ?? null
        setProfile(p)
        if (p) {
          const initial = {
            headline: p.headline ?? '',
            bio: p.bio ?? '',
            specialty: p.specialty ?? '',
            yearsExp: p.yearsExp ?? 0,
            hourlyRate: p.price ?? 0,
            // Legacy rows (and pre-fix approvals) hold Georgian NAMES instead of
            // codes — normalizing on load lights up the right chips instead of
            // none, and stops a re-pick from saving both spellings side by side.
            languages: normalizeLangs(p.languages),
            linkedinUrl: p.linkedinUrl ?? '',
            websiteUrl: p.websiteUrl ?? '',
            categoryId: p.categoryId ?? '',
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
          categoryId: form.categoryId || null,
        }),
      })
      const j = await res.json()
      // Our own validation copy (Georgian-language gate) rides in `message`;
      // throwing the generic error would drop the only actionable sentence.
      if (!j.ok) throw new Error(j.message || j.error || 'FAIL')
      setProfile(j.profile)
      setSavedForm({ ...form, languages: [...form.languages] })
      toast('პროფილი შენახულია', 'success')
    } catch (e) {
      const m = e instanceof Error && /[Ⴀ-ჿᲐ-Ჿ]/.test(e.message) ? e.message : 'შენახვა ვერ მოხერხდა — სცადე თავიდან'
      toast(m, 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  // Receives the SQUARE crop from the shared cropper (never a raw camera roll
  // file), so what lands in the DB matches what the browse card renders.
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
        toast(j.error === 'TOO_LARGE' ? 'ფაილი ძალიან დიდია (მაქს. 8MB)' : 'ატვირთვა ვერ მოხერხდა', 'error')
      }
    } catch {
      toast('ქსელის შეცდომა — სცადე თავიდან', 'error')
    } finally {
      setAvatarUploading(false)
    }
  }

  // Shared crop/zoom step — `pickAvatar` opens the picker, `avatarCropperUi`
  // (mounted in the avatar section below) carries the input + dialog.
  const { open: pickAvatar, ui: avatarCropperUi } = useAvatarCropper({ onCropped: uploadAvatar })

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

  const removeIntroVideo = () => {
    setPendingDelete({ kind: 'video' })
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

  // Save the account display name to /api/me (min 2 chars). Distinct from the
  // tutor-profile PATCH — this is how students see the expert's name.
  const saveName = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = fullNameInput.trim()
    if (name.length < 2) {
      toast('სახელი ძალიან მოკლეა', 'error')
      return
    }
    setSavingName(true)
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: name }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        toast('შენახვა ვერ მოხერხდა', 'error')
        return
      }
      setMe(prev => prev ? { ...prev, fullName: name } : prev)
      setFullNameInput(name)
      toast('სახელი შენახულია', 'success')
    } catch {
      toast('ქსელის შეცდომა — სცადე თავიდან', 'error')
    } finally {
      setSavingName(false)
    }
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwdMsg(null)
    // Min 8 — the SAME policy /api/me/password enforces (and signup/reset). The
    // client used to allow 6, so a 7-char password was rejected server-side with
    // a generic error the expert couldn't act on.
    if (pwd.next.length < PWD_MIN) {
      setPwdMsg({ ok: false, text: PWD_MIN_MSG })
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
        // INVALID = the body failed the server's schema, which in practice only
        // ever means „too short" here — surface the real rule, not a shrug.
        setPwdMsg({ ok: false, text: j.error === 'BAD_CURRENT' ? 'მიმდინარე პაროლი არასწორია' : j.error === 'INVALID' ? PWD_MIN_MSG : 'პაროლის შეცვლა ვერ მოხერხდა' })
      } else {
        // Success feedback is a toast everywhere on this page — inline slots
        // stay reserved for field-level errors.
        toast('პაროლი შეიცვალა', 'success')
        setPwd({ current: '', next: '', confirm: '' })
      }
    } catch {
      setPwdMsg({ ok: false, text: 'პაროლის შეცვლა ვერ მოხერხდა' })
    } finally {
      setSavingPassword(false)
    }
  }

  const addCertificate = async (e: React.FormEvent) => {
    e.preventDefault()
    // Only the title is required. Requiring an issuer silently blocked the
    // „add" button for anyone whose document has no issuing body.
    if (!certForm.title.trim()) return
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

  // Copy varies by entity — keep the mapping in one place so the modal below
  // stays declarative. `path` is only set for the /api/me/tutor/* entities;
  // cons/video have their own endpoints handled in confirmDelete.
  const DELETE_META: Record<PendingDelete['kind'], { path?: string; title: string; body: string }> = {
    cert:  { path: 'certificates', title: 'სერტიფიკატის წაშლა?', body: 'შეუქცევადია.' },
    edu:   { path: 'education',    title: 'განათლების წაშლა?', body: 'შეუქცევადია.' },
    exp:   { path: 'experience',   title: 'გამოცდილების წაშლა?', body: 'შეუქცევადია.' },
    cons:  { title: 'სერვისის წაშლა?', body: 'ამ ტიპს ვეღარ დაჯავშნიან. ჯავშნები არ იშლება.' },
    video: { title: 'ინტრო ვიდეოს წაშლა?', body: 'პროფილიდან მოიხსნება.' },
  }

  const confirmDelete = async () => {
    if (!pendingDelete || deleteBusy) return
    setDeleteBusy(true)
    try {
      if (pendingDelete.kind === 'cons') {
        const res = await fetch(`/api/tutor/consultations/${pendingDelete.id}`, { method: 'DELETE' })
        const j = await res.json().catch(() => ({} as any))
        if (!res.ok || !j.ok) {
          toast(j.error === 'IN_USE' ? `ვერ წაიშლება — ${j.count} აქტიური ჯავშანი` : 'წაშლა ვერ მოხერხდა', 'error')
          return
        }
        setConsultations(prev => prev.filter(c => c.id !== pendingDelete.id))
        setPendingDelete(null)
        toast('სერვისი წაიშალა', 'success')
        return
      }
      if (pendingDelete.kind === 'video') {
        const res = await fetch('/api/me/tutor', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: null }),
        })
        if (!res.ok) { toast('წაშლა ვერ მოხერხდა', 'error'); return }
        setProfile(prev => prev ? { ...prev, videoUrl: null } : prev)
        setPendingDelete(null)
        toast('ვიდეო წაიშალა', 'success')
        return
      }
      const res = await fetch(`/api/me/tutor/${DELETE_META[pendingDelete.kind].path}/${pendingDelete.id}`, { method: 'DELETE' })
      if (!res.ok) { toast('წაშლა ვერ მოხერხდა', 'error'); return }
      setPendingDelete(null)
      await loadCredentials()
      toast('წაიშალა', 'success')
    } catch {
      toast('ქსელის შეცდომა', 'error')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div>
        <PageHeader
          className="mb-6"
          title="პროფილი"
          sub="როგორ გხედავენ სტუდენტები"
          actions={profile && (
            <a
              href={`/tutors/${profile.id}?preview=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-small transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Icon.external className="w-3.5 h-3.5" />
              ნახე შენი პროფილი
            </a>
          )}
        />

        {err && (
          <div className="mb-4 p-4 rounded-card bg-danger-50 border border-danger-200 text-danger-700 text-small">{err}</div>
        )}

        {loading ? (
          <div className="p-12 rounded-card border border-ink-200 bg-white flex items-center justify-center text-ink-400">
            <span aria-hidden className="inline-block w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full motion-safe:animate-spin" />
            <span className="ml-3 text-small">იტვირთება…</span>
          </div>
        ) : (
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8 lg:items-start">
            {/* Main column: tab bar + one visible panel at a time. The old
                page-local section rail is redundant next to the workspace
                sidebar; tabs cut the ~5000px wall to one group. */}
            <div className="min-w-0">
              {/* Mobile: completeness compact above the tabs */}
              {profile && (
                <div className="lg:hidden mb-5">
                  <ProfileCompleteness
                    profile={profile}
                    certificates={certificatesWithFile}
                    education={education.length}
                    experience={experience.length}
                    avatarUrl={me?.avatarUrl ?? null}
                    slotCount={slotCount}
                    variant="compact"
                    alwaysShow
                  />
                </div>
              )}

              <div className="flex border-b border-ink-200 mb-6 overflow-x-auto scrollbar-hide rail-fade-end" role="tablist" aria-label="პროფილის სექციები">
                {['პროფილი', 'სესიები', 'კვალიფიკაცია', 'ანგარიში'].map((label, i) => {
                  const on = activeTab === i
                  return (
                    <button
                      key={label}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setActiveTab(i)}
                      className={`relative inline-flex items-center pb-3 px-1 mr-5 font-display text-small font-semibold whitespace-nowrap transition-colors duration-fast ${
                        on ? 'text-ink-900' : 'text-ink-500 hover:text-ink-800'
                      }`}
                    >
                      {label}
                      {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-brand-500 rounded-full" />}
                    </button>
                  )
                })}
              </div>

              {/* One-line orientation for the active tab — each tab is now a
                  single clear theme, so a plain-Georgian sub tells the expert
                  what belongs here. */}
              <p className="-mt-3 mb-6 text-small text-ink-500 leading-snug">
                {[
                  'ვინ ხარ — ფოტო, სათაური, ბიო.',
                  'რას სთავაზობ — ფასი, ხანგრძლივობა და თავისუფალი დრო.',
                  'სერტიფიკატები, განათლება და გამოცდილება — არასავალდებულო, მაგრამ ნდობას მატებს.',
                  'ხილვადობა და პარამეტრები.',
                ][activeTab]}
              </p>

              <div className="space-y-10">

            {/* ——— Tab 0: პროფილი ——— */}
            <TabPanel active={activeTab === 0}>

            {/* Avatar block — hover overlay pattern, keyboard-focusable button.
                Reuses the existing `uploadAvatar` handler and hidden file input. */}
            <section id="section-avatar" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white">
              <Eyebrow tone="muted" className="mb-4">ავატარი</Eyebrow>
              <div className="flex items-center gap-5">
                <button
                  type="button"
                  onClick={pickAvatar}
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
                      className="absolute inset-0 rounded-full inline-flex flex-col items-center justify-center gap-0.5 bg-black/45 text-white opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-visible:opacity-100 motion-safe:transition-opacity motion-safe:duration-fast"
                    >
                      <Icon.camera className="w-4 h-4" />
                      <span className="font-display text-micro font-semibold uppercase">შეცვლა</span>
                    </span>
                  )}
                  {avatarUploading && (
                    <span aria-hidden="true" className="absolute inset-0 rounded-full inline-flex items-center justify-center bg-black/55 text-white">
                      <svg aria-hidden viewBox="0 0 24 24" className="w-5 h-5 motion-safe:animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" />
                      </svg>
                    </span>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="font-display text-body-lg font-bold text-ink-900">{me?.fullName}</div>
                  <div className="text-small text-ink-500 truncate">{me?.email}</div>
                  {/* Truthful: the server caps images at MAX_IMAGE_BYTES = 8MB
                      (the old „500KB" was never the real limit). */}
                  <div className="mt-1 text-meta text-ink-500">JPG/PNG/WebP · მინ. 256×256 · მაქს. 8MB</div>
                  <div className="mt-1 text-meta text-ink-500 leading-[1.5]">სუფთა ფონი, კარგი განათება, სახე ცენტრში და ნათლად ჩანდეს — პროფესიული სურათი ნდობას ზრდის.</div>
                </div>
                {avatarCropperUi}
              </div>
            </section>

            {/* Public profile form */}
            {profile ? (
              <form id="section-public-profile" onSubmit={saveProfile} className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-4">
                {/* One dirty indicator only — the sticky save bar below owns it
                    („შეუნახავი ცვლილებები / შენახულია ✓“). */}
                <Eyebrow className="mb-2">საჯარო პროფილი</Eyebrow>

                {/* 200 → HEADLINE_MAX (60). 200 characters is not a headline, it
                    is a paragraph: the browse card gives this field ~2 lines and
                    truncates the rest, so an expert who filled the old limit
                    never saw the end of their own sentence anywhere on the site.
                    The counter and the hint below exist because the field's
                    failure mode was never length alone — the old hint („პირველი
                    ფრაზა, რასაც სტუდენტი ხედავს") did not say what NOT to put in
                    it, so experts typed their category and their years, both of
                    which the card already renders in their own slots. */}
                <Field label="სათაური">
                  <input type="text" required maxLength={HEADLINE_MAX}
                         value={form.headline} onChange={e => setForm({ ...form, headline: e.target.value })}
                         className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
                  <div className="mt-1.5 flex items-start justify-between gap-3">
                    <p className="text-meta text-ink-500 leading-snug">
                      რას აკეთებ კონკრეტულად. სფერო და გამოცდილების წლები ცალკე ჩანს — აქ ნუ გაიმეორებ.
                    </p>
                    <span className={`shrink-0 text-meta tabular-nums ${form.headline.length > HEADLINE_MAX - 10 ? 'text-warning-700' : 'text-ink-400'}`}>
                      {form.headline.length}/{HEADLINE_MAX}
                    </span>
                  </div>
                </Field>

                {/* „სპეციალობა" was a third field describing the same thing as the
                    headline and the category — and the data proved it: most rows
                    stored the SAME string twice („IT"/„IT", „ბიზნეს-სტრატეგია"
                    twice). It is no longer asked for. The value is still carried
                    in `form.specialty` and saved unchanged, so nothing is lost
                    for existing profiles and the approval flow keeps writing it. */}

                {/* Category — REQUIRED for public discovery. Without a live category
                    the browse query hides the expert entirely, so surface a quiet
                    inline warning while it's unset. Saved via the shared saveProfile
                    PATCH (categoryId is part of `form`). */}
                <Field label="კატეგორია">
                  <select
                    value={form.categoryId}
                    onChange={e => setForm({ ...form, categoryId: e.target.value })}
                    className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none"
                  >
                    <option value="">აირჩიე კატეგორია</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {!form.categoryId && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-meta text-warning-700 leading-snug">
                      <Icon.warn className="w-3.5 h-3.5 shrink-0 mt-px" />
                      <span>მის გარეშე პროფილი ვერ გამოჩნდება.</span>
                    </p>
                  )}
                </Field>

                {/* The single most consequential text on the profile — it is what
                    a client reads before booking and what Google indexes — and it
                    used to be a BARE textarea: no hint, no placeholder, no target
                    length, while the `სათაური` field right above it carried a
                    helper line. Measured 2026-08-01: 6 of 12 live experts had a
                    bio under 300 characters, one at 74. That is not laziness;
                    nobody told them what to write or how much.

                    The counter is deliberately encouraging rather than blocking:
                    a hard minimum here would just push people to pad. */}
                <Field label="ბიოგრაფია">
                  <p className="mb-2 text-meta text-ink-500 leading-snug">
                    ეს ტექსტი წყვეტს, აგირჩევენ თუ არა — და სწორედ ის იძებნება Google-ში. უპასუხე სამ კითხვას:
                    <span className="text-ink-700"> რა გამოცდილება გაქვს</span>,
                    <span className="text-ink-700"> რა კონკრეტულ პრობლემებში ეხმარები</span>,
                    <span className="text-ink-700"> რა შედეგამდე მიჰყავხარ სტუდენტი</span>.
                  </p>
                  <textarea rows={8} maxLength={2000}
                            placeholder={'მაგ.: 12 წელია ვმუშაობ ბუღალტრად — ძირითადად მცირე ბიზნესთან და ინდმეწარმეებთან.\n\nყველაზე ხშირად მომმართავენ, როცა დღგ-ს ზღვარს უახლოვდებიან ან დეკლარაციაში ვერ არკვევენ, რა უნდა ჩააბარონ და როდის. ვმუშაობდი…\n\nსესიის ბოლოს გექნება კონკრეტული ნაბიჯები: რა ჩააბარო, რა ვადაში და რა დაგიჯდება.'}
                            value={form.bio ?? ''} onChange={e => setForm({ ...form, bio: e.target.value })}
                            className="w-full px-3 py-2.5 rounded-field border border-ink-200 bg-white text-body text-ink-900 placeholder:text-ink-400 focus:border-brand-400 focus:outline-none resize-y" />
                  {(() => {
                    const n = (form.bio ?? '').trim().length
                    // Thresholds from what actually reads as a complete profile,
                    // not from an SEO rule: ~300 is one paragraph, 600+ is the
                    // three questions above genuinely answered.
                    const state = n >= 600 ? { t: 'ძალიან კარგი სიგრძე', c: 'text-success-700' }
                      : n >= 300 ? { t: 'კარგია — კიდევ ერთი აბზაცი და სრულყოფილია', c: 'text-ink-600' }
                      : n > 0 ? { t: 'ჯერ მოკლეა — სცადე 300+ სიმბოლო', c: 'text-warning-700' }
                      : { t: 'ორიენტირი: 600+ სიმბოლო', c: 'text-ink-500' }
                    return (
                      <div className="mt-1.5 flex items-center justify-between gap-3 text-meta">
                        <span className={state.c}>{state.t}</span>
                        <span className="text-ink-400 tabular-nums shrink-0">{n} / 2000</span>
                      </div>
                    )
                  })()}
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="გამოცდილება (წლები)">
                    <input type="number" min={0} max={80} required
                           value={form.yearsExp} onChange={e => setForm({ ...form, yearsExp: Number(e.target.value) })}
                           className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none tabular-nums" />
                  </Field>
                  <Field label="სესიის ფასი (₾)">
                    <input type="number" min={1} max={10000} required
                           value={form.hourlyRate} onChange={e => setForm({ ...form, hourlyRate: Number(e.target.value) })}
                           className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none tabular-nums" />
                    <p className="mt-1.5 text-meta text-ink-500 leading-snug">ნაგულისხმევი ფასი — ტიპების დამატებისას ჩანაცვლდება.</p>
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="LinkedIn ბმული">
                    <input type="url" placeholder="https://linkedin.com/in/username" maxLength={500}
                           value={form.linkedinUrl} onChange={e => setForm({ ...form, linkedinUrl: e.target.value })}
                           className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
                  </Field>
                  <Field label="ვებგვერდი / ბლოგი">
                    <input type="url" placeholder="https://example.com" maxLength={500}
                           value={form.websiteUrl} onChange={e => setForm({ ...form, websiteUrl: e.target.value })}
                           className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
                  </Field>
                </div>

                <Field label="ენები">
                  <LanguagePicker
                    value={form.languages}
                    onChange={langs => setForm(f => ({ ...f, languages: langs }))}
                    idPrefix="profile-lang"
                  />
                </Field>

                {/* Sticky save bar — stays in view while scrolling the long form;
                    disabled "შენახულია ✓" doubles as saved-state confirmation. */}
                <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 rounded-b-card border-t border-ink-100 bg-white flex items-center justify-between gap-3">
                  <span className={`text-meta font-display font-semibold ${dirty ? 'text-warning-700' : 'text-ink-400'}`} aria-live="polite">
                    {savingProfile ? 'ინახება…' : dirty ? 'შეუნახავი ცვლილებები' : 'ყველაფერი შენახულია'}
                  </span>
                  <Btn variant="primary" size="md" type="submit" disabled={savingProfile || !dirty}>
                    {savingProfile ? 'ინახება…' : dirty ? 'შეინახე ცვლილებები' : 'შენახულია ✓'}
                  </Btn>
                </div>
              </form>
            ) : (
              <div className="p-6 rounded-card border border-warning-200 bg-warning-50 text-warning-800 text-small flex items-start gap-3">
                <Icon.warn className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  ჯერ არ გაქვს ექსპერტის პროფილი — შეავსე განაცხადი.
                </div>
              </div>
            )}

            {/* Intro video — optional YouTube link shown in tutor detail hero */}
            {profile && (
              <section id="section-video" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <Eyebrow tone="muted" className="mb-1">ინტრო ვიდეო · YouTube</Eyebrow>
                    <p className="text-meta text-ink-500 leading-snug max-w-[520px]">60–90 წამი შენ შესახებ. ჩანს პროფილის ბანერზე.</p>
                  </div>
                  {profile.videoUrl && !videoSaving && (
                    <button type="button" onClick={removeIntroVideo} aria-label="ინტრო ვიდეოს წაშლა" className="min-h-[44px] -my-2 px-3 -mr-3 inline-flex items-center rounded-btn font-display text-meta font-semibold text-ink-500 hover:text-danger-700 hover:bg-danger-50 transition-colors duration-fast">წაშლა</button>
                  )}
                </div>

                {currentYouTubeId ? (
                  <div className="rounded-card overflow-hidden bg-black aspect-video">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${currentYouTubeId}?rel=0&modestbranding=1`}
                      title="ინტრო ვიდეო"
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
                    <p className="text-meta text-warning-700">ძველი ატვირთვა — ჩააგდე YouTube ბმული ქვემოთ.</p>
                  </div>
                ) : (
                  <div className="p-4 rounded-card border border-dashed border-ink-300 bg-ink-50/40 text-center">
                    <div className="font-display text-small font-semibold text-ink-700 mb-1">ინტრო ვიდეო არ არის</div>
                    <p className="text-meta text-ink-500 max-w-[400px] mx-auto">ვინ ვარ · რას ვაკეთებ · რომელ პრობლემას ვხსნი.</p>
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
                      className="flex-1 min-w-[240px] h-11 px-3 rounded-btn border border-ink-200 focus:border-brand-500 focus:outline-none text-small disabled:opacity-60"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveIntroVideo() } }}
                    />
                    <Btn variant="primary" size="sm" onClick={saveIntroVideo} disabled={videoSaving || !videoInput.trim()}>
                      {videoSaving ? 'ინახება…' : profile.videoUrl ? 'ჩანაცვლება' : 'შენახვა'}
                    </Btn>
                  </div>
                  <span className="text-meta text-ink-500">YouTube-ის ბმული (Shorts-იც მუშაობს).</span>
                </div>

                {videoErr && <div className="p-2.5 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-small">{videoErr}</div>}
              </section>
            )}

            </TabPanel>

            {/* ——— Tab 1: სესიები (availability + consultation types) ——— */}
            {profile && (
            <TabPanel active={activeTab === 1}>

            {/* Service type + Available now (Type A) */}
            {profile && (
              <div id="section-availability" className="scroll-mt-24">
                <ServiceTypeAndAvailability
                  profile={profile}
                  servicesCount={consultations.length}
                  onSaved={(next) => setProfile(next as any)}
                />
              </div>
            )}

            {/* Consultations */}
            {profile && (
              <section id="section-consultations" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <Eyebrow tone="muted" className="mb-1">კონსულტაციის ტიპები</Eyebrow>
                    <p className="text-meta text-ink-500 leading-snug max-w-[520px]">თითოეულს თავისი ხანგრძლივობა და ფასი — ჩაანაცვლებს ნაგულისხმევს.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {consultations.length === 0 ? (
                    <div className="text-small text-ink-500">ჯერ არაფერი დამატებულა.</div>
                  ) : (
                    consultations.map(c => (
                      consEdit?.id === c.id ? (
                        <form key={c.id} onSubmit={saveConsultation} className="p-3 rounded-card border border-brand-200 bg-white space-y-3">
                          <Field label="სათაური">
                            <input type="text" required maxLength={80} value={consEdit.title}
                                   onChange={e => setConsEdit({ ...consEdit, title: e.target.value })}
                                   placeholder="მაგ. ინდივიდუალური კონსულტაცია"
                                   className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body focus:border-brand-400 focus:outline-none" />
                          </Field>
                          <Field label="აღწერა">
                            <textarea rows={2} required maxLength={400} value={consEdit.description}
                                      onChange={e => setConsEdit({ ...consEdit, description: e.target.value })}
                                      placeholder="რას მოიცავს სესია"
                                      className="w-full px-3 py-2 rounded-field border border-ink-200 bg-white text-small focus:border-brand-400 focus:outline-none resize-y" />
                          </Field>
                          <Field label="ხანგრძლივობა (წუთი)">
                            <input type="number" required min={5} max={240} value={consEdit.minutes}
                                   onChange={e => setConsEdit({ ...consEdit, minutes: Number(e.target.value) })}
                                   className="w-full sm:max-w-[200px] h-11 px-3 rounded-field border border-ink-200 bg-white text-body tabular-nums focus:border-brand-400 focus:outline-none" />
                          </Field>
                          {/* Same price control as /apply — this editor previously
                              had no guidance and no earnings preview at all. */}
                          <PriceField
                            className="pt-3 border-t border-ink-100"
                            value={consEdit.price}
                            onChange={price => setConsEdit({ ...consEdit, price })}
                            minutes={consEdit.minutes}
                            required
                          />
                          {consEditErr && <div className="p-2.5 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-small">{consEditErr}</div>}
                          <div className="flex justify-end gap-2">
                            <Btn variant="ghost" size="sm" type="button" onClick={cancelEditConsultation} disabled={consEditBusy}>გაუქმება</Btn>
                            <Btn variant="primary" size="sm" type="submit" disabled={consEditBusy}>
                              {consEditBusy ? 'ინახება…' : 'შენახვა'}
                            </Btn>
                          </div>
                        </form>
                      ) : (
                      <div key={c.id} className="flex items-start gap-3 p-3 rounded-card border border-ink-200 bg-ink-50/40">
                        <span className="shrink-0 inline-flex items-center h-6 px-2 rounded-pill border border-ink-200 bg-ink-75 text-ink-700 font-display text-micro font-bold uppercase tabular-nums">{c.minutes} წთ</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-display text-body font-bold text-ink-900 truncate">{c.title}</div>
                          <div className="text-meta text-ink-700 leading-snug mt-0.5">{c.description}</div>
                          <div className="text-meta text-ink-500 tabular-nums mt-1">₾{c.price}</div>
                        </div>
                        <div className="shrink-0 self-center flex items-center">
                          <button type="button" onClick={() => startEditConsultation(c)} aria-label="სერვისის რედაქტირება" className="min-h-[44px] -my-2 px-3 inline-flex items-center rounded-btn font-display text-meta font-semibold text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors duration-fast">რედაქტირება</button>
                          <button type="button" onClick={() => deleteConsultation(c.id)} aria-label="სერვისის წაშლა" className="min-h-[44px] -my-2 px-3 -mr-2 inline-flex items-center rounded-btn font-display text-meta font-semibold text-ink-500 hover:text-danger-700 hover:bg-danger-50 transition-colors duration-fast">წაშლა</button>
                        </div>
                      </div>
                      )
                    ))
                  )}
                </div>

                <form onSubmit={addConsultation} className="pt-3 border-t border-ink-100 space-y-3">
                  <Field label="სათაური">
                    <input type="text" required maxLength={80} value={consForm.title}
                           onChange={e => setConsForm({ ...consForm, title: e.target.value })}
                           placeholder="მაგ. ინდივიდუალური კონსულტაცია"
                           className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body focus:border-brand-400 focus:outline-none" />
                  </Field>
                  <Field label="აღწერა">
                    <textarea rows={2} required maxLength={400} value={consForm.description}
                              onChange={e => setConsForm({ ...consForm, description: e.target.value })}
                              placeholder="რას მოიცავს სესია"
                              className="w-full px-3 py-2 rounded-field border border-ink-200 bg-white text-small focus:border-brand-400 focus:outline-none resize-y" />
                  </Field>
                  <Field label="ხანგრძლივობა (წუთი)">
                    <input type="number" required min={5} max={240} value={consForm.minutes}
                           onChange={e => setConsForm({ ...consForm, minutes: Number(e.target.value) })}
                           className="w-full sm:max-w-[200px] h-11 px-3 rounded-field border border-ink-200 bg-white text-body tabular-nums focus:border-brand-400 focus:outline-none" />
                  </Field>
                  <PriceField
                    className="pt-3 border-t border-ink-100"
                    value={consForm.price}
                    onChange={price => setConsForm({ ...consForm, price })}
                    minutes={consForm.minutes}
                    required
                  />
                  {consErr && <div className="p-2.5 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-small">{consErr}</div>}
                  <div className="flex justify-end">
                    <Btn variant="primary" size="sm" type="submit" disabled={consBusy}>
                      {consBusy ? 'ინახება…' : 'დამატება'}
                    </Btn>
                  </div>
                </form>
              </section>
            )}

            {/* Teaching packages — renders nothing at all unless the vertical is
                on for this deployment; see app/tutor/profile/_packages.tsx. It
                sits AFTER consultations deliberately: a session is what most
                experts sell, a package is the second shape. */}
            {profile && <PackagesSection />}
            {/* The roster sits ABOVE nothing and BELOW packages on purpose: you
                define what you sell, then you manage who bought it. */}
            {profile && <StudentsSection />}

            </TabPanel>
            )}

            {/* ——— Tab 2: კვალიფიკაცია — now its own tab, separate from სესიები:
                certificates + education + experience. Each tab is one clear
                theme (was crammed into the old „სერვისები და კვალიფიკაცია“). ——— */}
            {profile && (
            <TabPanel active={activeTab === 2}>

            {/* Certificates */}
            {profile && (
              <section id="section-certificates" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-4">
                <Eyebrow tone="muted" className="mb-2">სერტიფიკატები</Eyebrow>

                <div className="space-y-2">
                  {certificates.length === 0 ? (
                    <div className="text-small text-ink-500">ჯერ არაფერი დამატებულა.</div>
                  ) : (
                    certificates.map(c => {
                      // Resolve the document EXACTLY as the public profile does.
                      // This row used to test `safeHttpUrl(c.fileUrl)` alone and
                      // never looked at `hasFile`, so a certificate stored the
                      // modern way (bytes served from /api/certificates/<id>/file)
                      // had no „გახსნა" link here at all — the expert could not
                      // open their own upload from their own editor.
                      const href = c.hasFile ? `/api/certificates/${c.id}/file` : safeHttpUrl(c.fileUrl)
                      return (
                      <div key={c.id} className="flex items-center gap-3 p-3 rounded-card border border-ink-200 bg-ink-50/40">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <div className="font-display text-body font-bold text-ink-900 truncate">{c.title}</div>
                            {c.verified && (
                              <span className="inline-flex items-center h-4 px-1.5 rounded-pill bg-brand-50 border border-brand-200 text-brand-800 font-display text-micro font-bold uppercase">გადამოწმებული</span>
                            )}
                          </div>
                          <div className="text-meta text-ink-500 tabular-nums">{[c.issuer?.trim(), c.year].filter(Boolean).join(' · ')}</div>
                          {/* The public profile hides a document-less certificate
                              outright (an empty frame under „გადამოწმებული
                              აღინიშნება" reads as a credential that FAILED to
                              verify). Without this line the expert would have no
                              way to know that: their row looks complete here.
                              All five certificates on the live roster are in this
                              state — a zod `max(500)` on `fileUrl` rejected every
                              base64 scan before 2026-07-29, so the upload appeared
                              to succeed and stored nothing. */}
                          {!href && (
                            <p className="mt-1 flex items-start gap-1.5 text-meta text-warning-700 leading-snug">
                              <Icon.warn className="w-3.5 h-3.5 shrink-0 mt-px" />
                              <span>ფაილი არ აიტვირთა — პროფილზე არ ჩანს. წაშალე და დაამატე თავიდან.</span>
                            </p>
                          )}
                        </div>
                        {href && (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="font-display text-meta font-semibold text-brand-700 hover:text-brand-800">გახსნა</a>
                        )}
                        <button type="button" onClick={() => deleteCertificate(c.id)} aria-label="სერტიფიკატის წაშლა" className="min-h-[44px] -my-2 px-3 -mr-2 inline-flex items-center rounded-btn font-display text-meta font-semibold text-ink-500 hover:text-danger-700 hover:bg-danger-50 transition-colors duration-fast">წაშლა</button>
                      </div>
                      )
                    })
                  )}
                </div>

                <AddDisclosure label="სერტიფიკატის დამატება" forceOpen={certificates.length === 0}>
                <form onSubmit={addCertificate} className="pt-3 border-t border-ink-100 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="სახელი">
                      <input type="text" required maxLength={200} value={certForm.title}
                             onChange={e => setCertForm({ ...certForm, title: e.target.value })}
                             placeholder="მაგ. სერტიფიკატის სახელი"
                             className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
                    </Field>
                    <Field label="გამცემი">
                      <input type="text" required maxLength={200} value={certForm.issuer}
                             onChange={e => setCertForm({ ...certForm, issuer: e.target.value })}
                             placeholder="მაგ. გამცემი ორგანიზაცია"
                             className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
                    </Field>
                    <Field label="წელი">
                      <input type="number" required min={1900} max={2100} value={certForm.year}
                             onChange={e => setCertForm({ ...certForm, year: Number(e.target.value) })}
                             className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body tabular-nums text-ink-900 focus:border-brand-400 focus:outline-none" />
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
                          <span className="inline-flex items-center gap-1.5 text-meta text-ink-700 truncate max-w-[240px]">
                            {certForm.fileName || 'ატვირთულია'}
                            <button type="button" onClick={() => setCertForm({ ...certForm, fileUrl: '', fileName: '' })} className="ml-1 text-ink-400 hover:text-danger-600 text-body" aria-label="მოხსნა">×</button>
                          </span>
                        )}
                      </div>
                      {certUploadErr && <div className="mt-1.5 text-meta text-danger-600">{certUploadErr}</div>}
                    </Field>
                  </div>
                  <div className="flex justify-end">
                    <Btn variant="primary" size="sm" type="submit" disabled={certBusy || certUploading}>
                      {certBusy ? 'ინახება…' : 'დაამატე'}
                    </Btn>
                  </div>
                </form>
                </AddDisclosure>
              </section>
            )}

            {/* Education */}
            {profile && (
              <section id="section-education" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-4">
                <Eyebrow tone="muted" className="mb-2">განათლება</Eyebrow>

                <div className="space-y-2">
                  {education.length === 0 ? (
                    <div className="text-small text-ink-500">ჯერ არაფერი დამატებულა.</div>
                  ) : (
                    education.map(e => (
                      <div key={e.id} className="flex items-center gap-3 p-3 rounded-card border border-ink-200 bg-ink-50/40">
                        <div className="flex-1 min-w-0">
                          <div className="font-display text-body font-bold text-ink-900 truncate">{e.school}</div>
                          <div className="text-meta text-ink-700">{e.degree}{e.field ? ` · ${e.field}` : ''}</div>
                          <div className="text-meta text-ink-500 tabular-nums">{e.startYear} – {e.endYear ?? 'დღემდე'}</div>
                        </div>
                        <button type="button" onClick={() => deleteEducation(e.id)} aria-label="განათლების ჩანაწერის წაშლა" className="min-h-[44px] -my-2 px-3 -mr-2 inline-flex items-center rounded-btn font-display text-meta font-semibold text-ink-500 hover:text-danger-700 hover:bg-danger-50 transition-colors duration-fast">წაშლა</button>
                      </div>
                    ))
                  )}
                </div>

                <AddDisclosure label="განათლების დამატება" forceOpen={education.length === 0}>
                <form onSubmit={addEducation} className="pt-3 border-t border-ink-100 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="სასწავლებელი">
                      <input type="text" required maxLength={200} value={eduForm.school}
                             onChange={e => setEduForm({ ...eduForm, school: e.target.value })}
                             placeholder="ილიას სახ. უნივერსიტეტი"
                             className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
                    </Field>
                    <Field label="ხარისხი">
                      <input type="text" required maxLength={200} value={eduForm.degree}
                             onChange={e => setEduForm({ ...eduForm, degree: e.target.value })}
                             placeholder="მაგ. ბაკალავრი / მაგისტრი"
                             className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
                    </Field>
                    <Field label="დარგი (არასავალდებულო)">
                      <input type="text" maxLength={200} value={eduForm.field}
                             onChange={e => setEduForm({ ...eduForm, field: e.target.value })}
                             placeholder="მაგ. დარგი"
                             className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="დაწყების წელი">
                        <input type="number" required min={1900} max={2100} value={eduForm.startYear}
                               onChange={e => setEduForm({ ...eduForm, startYear: Number(e.target.value) })}
                               className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body tabular-nums text-ink-900 focus:border-brand-400 focus:outline-none" />
                      </Field>
                      <Field label="დასრულების წელი">
                        <input type="number" min={1900} max={2100} value={eduForm.endYear}
                               onChange={e => setEduForm({ ...eduForm, endYear: e.target.value })}
                               placeholder="ცარიელი — დღემდე"
                               className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body tabular-nums text-ink-900 focus:border-brand-400 focus:outline-none" />
                      </Field>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Btn variant="primary" size="sm" type="submit" disabled={eduBusy}>
                      {eduBusy ? 'ინახება…' : 'დაამატე'}
                    </Btn>
                  </div>
                </form>
                </AddDisclosure>
              </section>
            )}

            {/* Experience */}
            {profile && (
              <section id="section-experience" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-4">
                <Eyebrow tone="muted" className="mb-2">სამუშაო გამოცდილება</Eyebrow>

                <div className="space-y-2">
                  {experience.length === 0 ? (
                    <div className="text-small text-ink-500">ჯერ არაფერი დამატებულა.</div>
                  ) : (
                    experience.map(x => (
                      <div key={x.id} className="flex items-start gap-3 p-3 rounded-card border border-ink-200 bg-ink-50/40">
                        <div className="flex-1 min-w-0">
                          <div className="font-display text-body font-bold text-ink-900 truncate">{x.role}</div>
                          <div className="text-meta text-ink-700 truncate">{x.company}</div>
                          <div className="text-meta text-ink-500 tabular-nums">{x.startYear} – {x.endYear ?? 'ახლა'}</div>
                          {x.description && <div className="mt-1 text-meta text-ink-600 leading-[1.5]">{x.description}</div>}
                        </div>
                        <button type="button" onClick={() => deleteExperience(x.id)} aria-label="გამოცდილების ჩანაწერის წაშლა" className="min-h-[44px] -my-2 px-3 -mr-2 self-center inline-flex items-center rounded-btn font-display text-meta font-semibold text-ink-500 hover:text-danger-700 hover:bg-danger-50 transition-colors duration-fast">წაშლა</button>
                      </div>
                    ))
                  )}
                </div>

                <AddDisclosure label="გამოცდილების დამატება" forceOpen={experience.length === 0}>
                <form onSubmit={addExperience} className="pt-3 border-t border-ink-100 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="კომპანია">
                      <input type="text" required maxLength={200} value={expForm.company}
                             onChange={e => setExpForm({ ...expForm, company: e.target.value })}
                             placeholder="მაგ. კომპანია"
                             className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
                    </Field>
                    <Field label="პოზიცია">
                      <input type="text" required maxLength={200} value={expForm.role}
                             onChange={e => setExpForm({ ...expForm, role: e.target.value })}
                             placeholder="მაგ. პოზიცია"
                             className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="დაწყების წელი">
                        <input type="number" required min={1900} max={2100} value={expForm.startYear}
                               onChange={e => setExpForm({ ...expForm, startYear: Number(e.target.value) })}
                               className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body tabular-nums text-ink-900 focus:border-brand-400 focus:outline-none" />
                      </Field>
                      <Field label="დასრულების წელი">
                        <input type="number" min={1900} max={2100} value={expForm.endYear}
                               onChange={e => setExpForm({ ...expForm, endYear: e.target.value })}
                               placeholder="ცარიელი — ახლა"
                               className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body tabular-nums text-ink-900 focus:border-brand-400 focus:outline-none" />
                      </Field>
                    </div>
                    <Field label="აღწერა (არასავალდებულო)">
                      <textarea rows={2} maxLength={2000} value={expForm.description}
                                onChange={e => setExpForm({ ...expForm, description: e.target.value })}
                                placeholder="მოკლე აღწერა"
                                className="w-full px-3 py-2 rounded-field border border-ink-200 bg-white text-small text-ink-900 focus:border-brand-400 focus:outline-none resize-y" />
                    </Field>
                  </div>
                  <div className="flex justify-end">
                    <Btn variant="primary" size="sm" type="submit" disabled={expBusy}>
                      {expBusy ? 'ინახება…' : 'დაამატე'}
                    </Btn>
                  </div>
                </form>
                </AddDisclosure>
              </section>
            )}

            </TabPanel>
            )}

            {/* ——— Tab 3: ანგარიში (visibility + response-time + password) ——— */}
            <TabPanel active={activeTab === 3}>

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
            </TabPanel>

              {/* Bottom step navigation — walk the tabs like a wizard
                  (fill → შემდეგი), not only via the top tab bar. Scrolls to the
                  top of the new tab so you always land at its start. */}
              <div className="flex items-center justify-between gap-3 pt-5 mt-2 border-t border-ink-100">
                {activeTab > 0
                  ? <Btn variant="secondary" size="md" onClick={() => { setActiveTab(activeTab - 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>უკან</Btn>
                  : <span />}
                {activeTab < 3
                  ? <Btn variant="primary" size="md" onClick={() => { setActiveTab(activeTab + 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>შემდეგი</Btn>
                  : (profile && <a href={`/tutors/${profile.id}?preview=1`} target="_blank" rel="noopener noreferrer" className="h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body inline-flex items-center gap-2 transition-colors duration-fast"><Icon.external className="w-4 h-4" /> ნახე შენი პროფილი</a>)}
              </div>

              </div>
            </div>

            {/* Desktop: completeness lives in a sticky right rail */}
            <aside className="hidden lg:block lg:sticky lg:top-[84px]">
              {profile && (
                <ProfileCompleteness
                  profile={profile}
                  certificates={certificatesWithFile}
                  education={education.length}
                  experience={experience.length}
                  avatarUrl={me?.avatarUrl ?? null}
                  slotCount={slotCount}
                  variant="card"
                  alwaysShow
                />
              )}
            </aside>
          </div>
        )}

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
/* One tab's content. `hidden` (not unmount) keeps form state alive and every
   #section-* anchor findable for ProfileCompleteness deep links. */
function TabPanel({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div role="tabpanel" hidden={!active} className={active ? 'space-y-6' : undefined}>
      {children}
    </div>
  )
}

/* Progressive disclosure for the credential add-forms: collapsed behind a
   "+ დამატება" row once the list has entries; auto-open while empty so the
   first item has zero extra clicks. Form stays mounted (state survives). */
function AddDisclosure({ label, forceOpen, children }: { label: string; forceOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const show = forceOpen || open
  return (
    <div>
      {!show && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full min-h-[44px] pt-3 border-t border-ink-100 inline-flex items-center justify-center gap-2 font-display text-small font-semibold text-brand-700 hover:text-brand-800 transition-colors duration-fast"
        >
          <Icon.plus className="w-4 h-4" /> {label}
        </button>
      )}
      <div hidden={!show}>{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <Eyebrow as="span" tone="muted" className="block mb-1.5">{label}</Eyebrow>
      {children}
    </label>
  )
}

function ServiceTypeAndAvailability({
  profile,
  servicesCount,
  onSaved,
}: {
  profile: NonNullable<TutorProfile>
  servicesCount: number
  onSaved: (next: NonNullable<TutorProfile>) => void
}) {
  const [duration, setDuration] = useState<number>(profile.consultationDurationMin ?? 30)
  const [buffer, setBuffer] = useState<number>(profile.bufferMin ?? 0)
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
        setBuffer(j.profile.bufferMin ?? 0)
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
        <div className="min-w-0">
          <Eyebrow tone="muted">ნაგულისხმევი ხანგრძლივობა</Eyebrow>
          {/* This length is a DEFAULT, not a calendar grid: the schedule holds
              free WINDOWS and bookable starts are derived from the service the
              client picks (see lib/availability.ts). The old copy — and the old
              behavior — implied it chopped the calendar into fixed pieces. */}
          <p className="text-small text-ink-500 mt-1 max-w-[520px] leading-snug">
            {servicesCount > 0
              ? 'ტიპები თავად განსაზღვრავს ხანგრძლივობასა და ფასს. ეს ნაგულისხმევი მხოლოდ მათ გარეშე მოქმედებს.'
              : 'ერთი სესიის ნაგულისხმევი ხანგრძლივობა. ტიპების დამატებისას აღარ იმოქმედებს.'}
          </p>
        </div>
        {flash && <span className="text-meta font-display font-semibold text-success-700">{flash}</span>}
      </div>

      <div>
        <div className="inline-flex rounded-btn border border-ink-200 overflow-hidden">
          {[15, 30, 60].map(d => (
            <button key={d} type="button"
              onClick={() => save({ consultationDurationMin: d })}
              disabled={busy}
              className={`h-11 px-4 font-display text-small font-semibold transition-colors duration-fast ${
                duration === d ? 'bg-brand-600 text-white' : 'text-ink-700 hover:bg-ink-50'
              }`}>
              {d} წუთი
            </button>
          ))}
        </div>
        <p className="text-meta text-ink-500 mt-2 max-w-[520px] leading-snug">
          გრაფიკს არ ჭრის — შენ თავისუფალ შუალედებს აქვეყნებ, დაწყების დროები კი სტუდენტის არჩეული სერვისის ხანგრძლივობით გამოითვლება.
        </p>
      </div>

      {/* Buffer — a gap RESERVED around every booked session, so back-to-back
          bookings become impossible. 0 = today's behavior (back-to-back allowed). */}
      <div className="pt-5 border-t border-ink-100">
        <Eyebrow tone="muted">შესვენება სესიებს შორის</Eyebrow>
        <p className="text-small text-ink-500 mt-1 mb-3 max-w-[520px] leading-snug">
          ყოველი დაჯავშნილი სესიის წინ და შემდეგ დაცული ინტერვალი — ზედიზედ ჯავშნები ვეღარ დაგიდგება.
        </p>
        <div className="inline-flex rounded-btn border border-ink-200 overflow-hidden">
          {[0, 5, 10, 15, 30].map(b => (
            <button key={b} type="button"
              onClick={() => save({ bufferMin: b })}
              disabled={busy}
              className={`h-11 px-4 font-display text-small font-semibold transition-colors duration-fast ${
                buffer === b ? 'bg-brand-600 text-white' : 'text-ink-700 hover:bg-ink-50'
              }`}>
              {b === 0 ? 'გარეშე' : `${b} წთ`}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-4 border-t border-ink-100 text-small text-ink-500">
        თავისუფალი შუალედები იმართება <a href="/tutor/schedule" className="font-display font-semibold text-brand-700 hover:text-brand-800">გრაფიკის</a> გვერდზე.
      </div>
    </section>
  )
}

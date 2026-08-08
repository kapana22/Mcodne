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
import {
  PWD_MIN, PWD_MIN_MSG,
  type Category, type CertForm, type Certificate, type ConsEdit, type ConsForm, type Consultation,
  type ConsultTier, type EduForm, type Education, type ExpForm, type Experience, type Me,
  type PendingDelete, type ProfileForm, type TutorProfile,
} from './_types'
import { TabPanel } from './_parts'
import { ProfileTab } from './_tabProfile'
import { ServicesTab } from './_tabServices'
import { CredentialsTab } from './_tabCredentials'
import { AccountTab } from './_tabAccount'


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
  const [form, setForm] = useState<ProfileForm>({
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
  const [consultations, setConsultations] = useState<Consultation[]>([])
  // The QUICK/STANDARD/DEEP tier is a backend enum — never surfaced to the
  // expert. It's derived from the chosen minutes at submit time so the saved
  // data shape stays valid while the UI only ever shows title/minutes/price.
  const tierFromMinutes = (m: number): ConsultTier => (m <= 20 ? 'QUICK' : m <= 45 ? 'STANDARD' : 'DEEP')
  const [consForm, setConsForm] = useState<ConsForm>({
    title: '', description: '', minutes: 60, price: 80,
  })
  const [consBusy, setConsBusy] = useState(false)
  const [consErr, setConsErr] = useState<string | null>(null)
  // Inline edit of a single existing service row. `consEdit` holds the id +
  // prefilled fields of the row being edited (null = none). Same fields as the
  // add-form; tier is derived server-side on PATCH so we never surface it.
  const [consEdit, setConsEdit] = useState<ConsEdit | null>(null)
  const [consEditBusy, setConsEditBusy] = useState(false)
  const [consEditErr, setConsEditErr] = useState<string | null>(null)

  // Unified confirm state for EVERY destructive action on this page —
  // certificate / education / experience / consultation-service rows and the
  // intro video. One modal, one busy flag, one paradigm (no native confirm()).
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
  const [certForm, setCertForm] = useState<CertForm>({ title: '', issuer: '', year: new Date().getFullYear(), fileUrl: '', fileName: '' })
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
  const [eduForm, setEduForm] = useState<EduForm>({ school: '', degree: '', field: '', startYear: new Date().getFullYear() - 4, endYear: '' as string | number })
  const [expForm, setExpForm] = useState<ExpForm>({ company: '', role: '', startYear: new Date().getFullYear() - 2, endYear: '' as string | number, description: '' })
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
        <ProfileTab
          me={me}
          profile={profile}
          loading={loading}
          form={form}
          setForm={setForm}
          dirty={dirty}
          savingProfile={savingProfile}
          saveProfile={saveProfile}
          avatarUploading={avatarUploading}
          pickAvatar={pickAvatar}
          avatarCropperUi={avatarCropperUi}
          categories={categories}
          currentYouTubeId={currentYouTubeId}
          videoInput={videoInput}
          setVideoInput={setVideoInput}
          videoSaving={videoSaving}
          videoErr={videoErr}
          setVideoErr={setVideoErr}
          saveIntroVideo={saveIntroVideo}
          removeIntroVideo={removeIntroVideo}
        />
            </TabPanel>

            {/* ——— Tab 1: სესიები (availability + consultation types) ——— */}
            {profile && (
            <TabPanel active={activeTab === 1}>
        <ServicesTab
          profile={profile}
          setProfile={setProfile}
          form={form}
          consultations={consultations}
          consForm={consForm}
          setConsForm={setConsForm}
          consBusy={consBusy}
          consErr={consErr}
          addConsultation={addConsultation}
          consEdit={consEdit}
          setConsEdit={setConsEdit}
          consEditBusy={consEditBusy}
          consEditErr={consEditErr}
          startEditConsultation={startEditConsultation}
          cancelEditConsultation={cancelEditConsultation}
          saveConsultation={saveConsultation}
          deleteConsultation={deleteConsultation}
        />
            </TabPanel>
            )}

            {/* ——— Tab 2: კვალიფიკაცია — now its own tab, separate from სესიები:
                certificates + education + experience. Each tab is one clear
                theme (was crammed into the old „სერვისები და კვალიფიკაცია“). ——— */}
            {profile && (
            <TabPanel active={activeTab === 2}>
        <CredentialsTab
          profile={profile}
          form={form}
          certificates={certificates}
          certForm={certForm}
          setCertForm={setCertForm}
          certBusy={certBusy}
          certUploading={certUploading}
          certUploadErr={certUploadErr}
          certFileRef={certFileRef}
          onCertFile={onCertFile}
          addCertificate={addCertificate}
          deleteCertificate={deleteCertificate}
          education={education}
          eduForm={eduForm}
          setEduForm={setEduForm}
          eduBusy={eduBusy}
          addEducation={addEducation}
          deleteEducation={deleteEducation}
          experience={experience}
          expForm={expForm}
          setExpForm={setExpForm}
          expBusy={expBusy}
          addExperience={addExperience}
          deleteExperience={deleteExperience}
        />
            </TabPanel>
            )}

            {/* ——— Tab 3: ანგარიში (visibility + response-time + password) ——— */}
            <TabPanel active={activeTab === 3}>
        <AccountTab
          profile={profile}
          setProfile={setProfile}
          form={form}
          fullNameInput={fullNameInput}
          setFullNameInput={setFullNameInput}
          savingName={savingName}
          saveName={saveName}
          pwd={pwd}
          setPwd={setPwd}
          savingPassword={savingPassword}
          pwdMsg={pwdMsg}
          changePassword={changePassword}
          toast={toast}
        />
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
'use client'
import React, { useState, useEffect, useRef } from 'react'
import { extractYouTubeId } from '@/lib/youtube'
import { Icon } from '@/components/Icon'
import { Logo } from '@/components/Logo'
import { VerifiedMark } from '@/components/Avatar'

/* ───── Top bar ───── */
const TopBar = () => (
  <header className="sticky top-0 z-40 h-16 px-6 lg:px-8 flex items-center justify-between gap-4 border-b border-ink-200 bg-white/95 backdrop-blur">
    <div className="flex items-center gap-3 min-w-0">
      <Logo />
      <span className="hidden md:inline-block h-5 w-px bg-ink-200" />
      <span className="hidden md:inline-flex items-center gap-2">
        <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-400">ექსპერტი / განცხადება</span>
        <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-pill bg-ink-50 border border-ink-200 text-ink-700 font-display text-[10px] font-bold uppercase tracking-[0.14em]">
          <Icon.briefcase className="w-2.5 h-2.5" /> რეგისტრაცია
        </span>
      </span>
    </div>
    <div className="flex items-center gap-2">
      {/* "პროგრესის შენახვა" removed — server-side draft persistence isn't
          implemented yet. Advertising a button that does nothing is worse than
          not offering it. The form state lives in memory only for now. */}
      <a href="/" aria-label="დახურვა" className="h-9 w-9 rounded-btn text-ink-500 hover:text-ink-900 hover:bg-ink-100 inline-flex items-center justify-center transition-colors">
        <Icon.x className="w-4 h-4" />
      </a>
    </div>
  </header>
)

/* ───── Steps ───── */
type StepId = 1 | 2 | 3 | 4 | 5
const STEPS: { id: StepId; l: string; sub: string; icon: any }[] = [
  { id: 1, l: 'კონტაქტი',    sub: 'სახელი და კონტაქტი',     icon: Icon.user },
  { id: 2, l: 'ექსპერტიზა',   sub: 'რა იცი და რა გამოცდილებაა', icon: Icon.bolt },
  { id: 3, l: 'პორტფოლიო',    sub: 'სერტიფიკატები + ვიდეო',  icon: Icon.award },
  { id: 4, l: 'სერვისები',    sub: 'ფასი + ვინაობა',          icon: Icon.wallet },
  { id: 5, l: 'მოდერაცია',    sub: 'წარდგენა · 48 სთ',       icon: Icon.shield },
]

/* ───── Progress sidebar ───── */
const ProgressNav = ({ step, setStep, completed }: { step: StepId; setStep: (s: StepId) => void; completed: Set<StepId> }) => {
  return (
    <aside className="hidden lg:flex flex-col w-[260px] shrink-0 border-r border-ink-200 bg-white p-6 sticky top-16 self-start lg:h-[836px]">
      <div className="inline-flex items-center gap-1.5 h-6 px-2.5 mb-3 self-start rounded-pill bg-brand-50 border border-brand-200 text-brand-700 font-display text-[9.5px] font-bold uppercase tracking-[0.16em]">
        <Icon.shield className="w-2.5 h-2.5" /> ხელით შემოწმებული ქსელი
      </div>
      <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-500 mb-2">ნაბიჯი {step} / 5</div>
      <h2 className="font-display text-[20px] font-bold text-ink-900 tracking-tight leading-tight mb-1">გახდი ექსპერტი მცოდნე-ზე</h2>
      <p className="text-[12.5px] text-ink-600 leading-[1.5] mb-5">ვიღებთ განაცხადების მცირე ნაწილს — ვამოწმებთ თითოეულს <span className="font-display font-bold text-ink-900">ხელით</span>.</p>

      {/* Vertical progress */}
      <ol className="relative space-y-1">
        <span className="absolute left-[18px] top-3 bottom-3 w-px bg-ink-200" aria-hidden />
        {STEPS.map(s => {
          const isDone = completed.has(s.id)
          const isActive = step === s.id
          const Ic = s.icon
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setStep(s.id)}
                className={`group relative w-full flex items-start gap-3 p-2.5 -ml-2 rounded-card transition-colors ${
                  isActive ? 'bg-brand-50/60' : 'hover:bg-ink-50'
                }`}
              >
                <span className={`relative z-10 w-9 h-9 shrink-0 rounded-full inline-flex items-center justify-center transition-all duration-fast ${
                  isDone ? 'bg-brand-500 text-white shadow-xs' :
                  isActive ? 'bg-brand-500 text-white ring-4 ring-brand-500/15 shadow-sm' :
                  'bg-white border-2 border-ink-200 text-ink-400 group-hover:border-ink-300'
                }`}>
                  {isDone ? <Icon.check className="w-4 h-4" /> : <Ic className="w-4 h-4" />}
                </span>
                <div className="min-w-0 flex-1 text-left pt-1">
                  <div className={`font-display text-[13.5px] font-bold tracking-tight ${isActive ? 'text-brand-800' : isDone ? 'text-ink-900' : 'text-ink-700'}`}>{s.l}</div>
                  <div className="text-[11px] text-ink-500">{s.sub}</div>
                </div>
              </button>
            </li>
          )
        })}
      </ol>

      {/* Help block */}
      <div className="mt-6 pt-5 border-t border-ink-100">
        <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-500 mb-2">დაგვიკავშირდი</div>
        <p className="text-[11.5px] text-ink-600 leading-[1.5]">თუ შეგექმნა კითხვა — მოგვწერე, გიპასუხებთ სამუშაო დღეს.</p>
        <a href="/contact" className="mt-3 h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-[12px] inline-flex items-center gap-1.5 transition-colors">
          დაწერე ჩვენ
        </a>
      </div>
    </aside>
  )
}

/* ───── Step layout shell ───── */
const StepHeader = ({ n, total, eyebrow, title, sub }: { n: number; total: number; eyebrow: string; title: string; sub: string }) => (
  <div className="mb-6">
    <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2">{eyebrow} · ნაბიჯი {n} / {total}</div>
    <h1 className="font-display text-[28px] lg:text-[34px] font-bold text-ink-900 tracking-tight leading-[1.1] motion-safe:animate-rise-in">{title}</h1>
    <p className="mt-2 text-[13.5px] text-ink-600 max-w-[560px] leading-[1.55]">{sub}</p>
  </div>
)

const FormSection = ({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) => (
  <section className="rounded-card bg-white border border-ink-200 shadow-xs p-6 mb-4 transition-shadow duration-fast hover:shadow-sm">
    <div className="mb-4">
      <h2 className="font-display text-[15px] font-bold text-ink-900 tracking-tight">{title}</h2>
      {sub && <p className="mt-1 text-[12px] text-ink-600 leading-[1.5]">{sub}</p>}
    </div>
    {children}
  </section>
)

const Field = ({ l, sub, required, children }: { l: string; sub?: string; required?: boolean; children: React.ReactNode }) => (
  <label className="block">
    <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.2em] text-ink-500 block mb-1.5">{l}{required && <span className="text-danger-500 ml-0.5" aria-hidden>*</span>}</span>
    {children}
    {sub && <span className="block mt-1.5 text-[11px] text-ink-500 leading-[1.4]">{sub}</span>}
  </label>
)

/* Honest note — uploaded media is intentionally NOT persisted to the draft
 * (base64 data URLs would blow the ~5MB localStorage quota), so a refresh
 * silently drops it. Shown near every upload so expectations stay accurate. */
const MediaWarning = () => (
  <div className="flex items-start gap-2 p-3 rounded-card bg-warning-50/70 border border-warning-200">
    <Icon.warn className="w-3.5 h-3.5 text-warning-700 mt-0.5 shrink-0" />
    <p className="text-[11.5px] text-warning-800 leading-[1.5]">
      ატვირთული ფაილები (ვიდეო, დოკუმენტები, სერტიფიკატები, ფოტო) <span className="font-display font-semibold">არ ინახება</span> გვერდის განახლებისას — ტექსტური ველები ინახება, ფაილები კი ხელახლა უნდა ატვირთო. დაასრულე ატვირთვები ერთ სესიაში, წარდგენამდე.
    </p>
  </div>
)

const Input = (p: any) => <input {...p} className={`w-full h-11 px-3.5 rounded-field border border-ink-200 bg-white text-[13.5px] text-ink-900 placeholder:text-ink-400 hover:border-ink-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-[border-color,box-shadow] duration-fast ${p.className || ''}`} />

/* ───── Upload plumbing ───── */
// Media captured during apply. Kept OUT of the localStorage draft (base64 data
// URLs would blow the ~5MB quota) — merged into the submit body directly.
type MediaState = {
  idDocUrl?: string
  selfieUrl?: string
  photoUrl?: string
  certificates: { title: string; url: string }[]
}

type UploadResult = { ok: true; url: string; fileName?: string } | { ok: false; code: string }

async function uploadToApi(kind: string, file: File): Promise<UploadResult> {
  try {
    const fd = new FormData()
    fd.append('kind', kind)
    fd.append('file', file)
    const res = await fetch('/api/uploads', { method: 'POST', body: fd })
    const d = await res.json().catch(() => null)
    if (!res.ok || !d?.ok || !d.url) return { ok: false, code: d?.error || 'FAILED' }
    return { ok: true, url: d.url, fileName: d.fileName }
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
}

function uploadErrMsg(code: string): string {
  return code === 'TOO_LARGE' ? 'ფაილი ძალიან დიდია'
    : code === 'BAD_TYPE' || code === 'BAD_CONTENT' ? 'ფაილის ტიპი დაუშვებელია'
    : code === 'RATE_LIMITED' ? 'ბევრი მცდელობა — სცადე ცოტა ხანში'
    : 'ატვირთვა ვერ მოხერხდა'
}

const isImg = (u?: string) => !!u && (/^data:image\//.test(u) || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u))

/* Dashed drop-tile that uploads a single file (image or PDF) and reports the URL. */
const DocUploadTile = ({ label, hint, kind, value, onChange, icon }: {
  label: string; hint: string; kind: string; value?: string
  onChange: (url: string | undefined) => void; icon: React.ReactNode
}) => {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!f) return
    setBusy(true); setErr(null)
    const r = await uploadToApi(kind, f)
    setBusy(false)
    if (!r.ok) { setErr(uploadErrMsg(r.code)); return }
    onChange(r.url)
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className={`w-full p-6 rounded-card border border-dashed text-center transition-colors ${value ? 'border-success-300 bg-success-50/40' : 'border-ink-300 hover:border-brand-400 hover:bg-brand-50/30'} disabled:opacity-60`}
      >
        {value && isImg(value) ? (
          <img src={value} alt="" className="w-16 h-16 rounded-btn object-cover mx-auto mb-2 ring-1 ring-ink-200" />
        ) : value ? (
          <div className="w-16 h-10 rounded-btn bg-white border border-ink-200 text-ink-700 font-display text-[10px] font-bold inline-flex items-center justify-center mx-auto mb-2">PDF</div>
        ) : (
          <div className="mb-2">{icon}</div>
        )}
        <div className="font-display text-[13px] font-semibold text-ink-900">{busy ? 'იტვირთება…' : value ? '✓ ატვირთულია — შეცვლა' : label}</div>
        {!value && <div className="text-[11.5px] text-ink-500 mt-0.5">{hint}</div>}
      </button>
      {value && !busy && (
        <button type="button" onClick={() => onChange(undefined)} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white border border-ink-200 text-ink-500 hover:text-danger-700 inline-flex items-center justify-center">
          <Icon.x className="w-3.5 h-3.5" />
        </button>
      )}
      {err && <p className="mt-1.5 text-[11.5px] text-danger-700">{err}</p>}
      {/* idDoc/selfie are image-only server-side (kind → ALLOWED_IMG). */}
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFile} />
    </div>
  )
}

/* Round profile-photo picker — uploads as `avatar` (sets user.avatarUrl). */
const PhotoUploader = ({ value, onChange }: { value?: string; onChange: (url?: string) => void }) => {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true); setErr(null)
    const r = await uploadToApi('avatar', f)
    setBusy(false)
    if (!r.ok) { setErr(uploadErrMsg(r.code)); return }
    onChange(r.url)
  }
  return (
    <div className="flex items-center gap-5">
      {value
        ? <img src={value} alt="" className="w-24 h-24 rounded-full object-cover ring-2 ring-ink-200 shrink-0" />
        : <div className="w-24 h-24 rounded-full bg-ink-100 ring-2 ring-ink-200 shrink-0 inline-flex items-center justify-center text-ink-400"><Icon.user className="w-9 h-9" /></div>}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-[12.5px] inline-flex items-center gap-1.5 transition-colors disabled:opacity-60">
            <Icon.upload className="w-3.5 h-3.5" /> {busy ? 'იტვირთება…' : value ? 'ცვლა' : 'ატვირთვა'}
          </button>
          {value && <button type="button" onClick={() => onChange(undefined)} className="h-11 px-3 rounded-btn text-ink-500 hover:text-danger-700 font-display font-semibold text-[12px] transition-colors">წაშლა</button>}
        </div>
        {err
          ? <p className="mt-2 text-[11.5px] text-danger-700">{err}</p>
          : <p className="mt-2 text-[11.5px] text-ink-500 leading-[1.5]">სასურველი — სახეზე ცოცხალი გამოხედვა. JPG / PNG · მინ. 400×400.</p>}
      </div>
    </div>
  )
}

/* Certificate list — each row is a titled diploma/cert scan (image or PDF). */
const CertificateUploader = ({ items, onChange }: { items: { title: string; url: string }[]; onChange: (list: { title: string; url: string }[]) => void }) => {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true); setErr(null)
    const r = await uploadToApi('certificate', f)
    setBusy(false)
    if (!r.ok) { setErr(uploadErrMsg(r.code)); return }
    onChange([...items, { title: title.trim() || f.name, url: r.url }])
    setTitle('')
  }
  return (
    <div className="space-y-2.5">
      {items.map((c, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-card border border-ink-200 bg-white">
          <span className="w-10 h-10 rounded-btn inline-flex items-center justify-center overflow-hidden font-display text-[10px] font-bold tracking-wider border border-ink-200 bg-ink-50 text-ink-700 shrink-0">
            {isImg(c.url) ? <img src={c.url} alt="" className="w-full h-full object-cover" /> : 'PDF'}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-display text-[13px] font-semibold text-ink-900 truncate">{c.title}</div>
            <div className="text-[11.5px] text-ink-500">ატვირთულია</div>
          </div>
          <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="font-display text-[11px] font-semibold text-ink-500 hover:text-danger-700">წაშლა</button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Input value={title} onChange={(e: any) => setTitle(e.target.value)} placeholder="სახელი (მაგ. MBA · INSEAD)" className="flex-1" />
        <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="h-11 px-4 shrink-0 rounded-btn border border-dashed border-ink-300 hover:border-brand-400 hover:bg-brand-50/30 text-ink-600 hover:text-brand-700 font-display font-semibold text-[12.5px] inline-flex items-center gap-2 transition-colors disabled:opacity-60">
          <Icon.plus className="w-4 h-4" /> {busy ? 'იტვირთება…' : 'დამატება'}
        </button>
      </div>
      {err && <p className="text-[11.5px] text-danger-700">{err}</p>}
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={onFile} />
    </div>
  )
}

/* Language chips with add/remove — stored as free-text "Lang · Level" tags. */
const LanguageEditor = ({ value, onChange }: { value: string[]; onChange: (list: string[]) => void }) => {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (!v || value.includes(v)) { setDraft(''); return }
    onChange([...value, v])
    setDraft('')
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map(l => (
          <span key={l} className="inline-flex items-center gap-1 h-8 px-3 rounded-pill bg-brand-50 border border-brand-200 text-brand-800 font-display text-[11.5px] font-semibold">
            {l}
            <button type="button" onClick={() => onChange(value.filter(x => x !== l))} className="ml-1 text-brand-600 hover:text-brand-800"><Icon.x className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e: any) => setDraft(e.target.value)}
          onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="მაგ. English · C2"
          className="flex-1"
        />
        <button type="button" onClick={add} className="h-11 px-3 shrink-0 rounded-btn border border-dashed border-ink-300 hover:border-ink-400 text-ink-500 hover:text-ink-800 font-display text-[11.5px] font-semibold inline-flex items-center gap-1 transition-colors">
          <Icon.plus className="w-3 h-3" /> დამატება
        </button>
      </div>
    </div>
  )
}

/* ───── Form State ───── */
type FormState = {
  firstName: string; lastName: string; personalId: string; dob: string; email: string; phone: string
  cats: string[]; headline: string; motivation: string; city: string; yearsExp: string; linkedin: string; website: string
  introVideoUrl: string
  languages: string[]
  services: { name: string; dur: number; price: number; free: boolean; desc: string }[]
  bank: string; iban: string
  professionData: Record<string, any>
}
const INITIAL_FORM: FormState = {
  firstName: '', lastName: '', personalId: '', dob: '', email: '', phone: '',
  cats: [], headline: '', motivation: '', city: '', yearsExp: '', linkedin: '', website: '',
  introVideoUrl: '',
  languages: ['ქართული · მშობლიური'],
  services: [
    { name: 'სრული სტრატეგიული სესია', dur: 60, price: 80, free: false, desc: 'ღრმა მუშაობა ერთ კონკრეტულ თემაზე — pitch, GTM, org design.' },
    { name: 'სწრაფი კონსულტაცია', dur: 30, price: 45, free: false, desc: 'მცირე გადაწყვეტილებები ან ერთი დოკუმენტის რევიუ.' },
    { name: 'გაცნობითი სესია', dur: 15, price: 25, free: false, desc: 'fit-ის შემოწმება — ვისთვის ვუმუშავებ კარგად.' },
  ],
  bank: 'TBC', iban: '',
  professionData: {},
}

type StepProps = {
  form: FormState
  set: (patch: Partial<FormState>) => void
  media?: MediaState
  setMedia?: (patch: Partial<MediaState>) => void
  // Long steps (2, 4) render in two shorter screens — `part` picks which half.
  part?: StepPart
}

/* Steps 2 and 4 are split into two sub-screens each: one long scroll of six
 * form sections was the single most fatiguing surface of the mobile wizard.
 * The part lives alongside `step`; the footer advances part-first. */
type StepPart = 1 | 2
const STEP_PARTS: Partial<Record<StepId, number>> = { 2: 2, 4: 2 }
const partsOf = (s: StepId) => STEP_PARTS[s] ?? 1

/* ───── STEP 1 — Contact (light) ─────
 * Deliberately light: name + contact only. The heavy KYC (personal ID, DOB,
 * ID-document photo, selfie) is deferred to Step 4, just before submit — so the
 * first thing an applicant sees isn't a wall of identity documents. */
const Step1 = ({ form, set }: StepProps) => (
  <>
    <StepHeader n={1} total={5} eyebrow="კონტაქტი" title="დავიწყოთ — ვინ ხარ და როგორ დაგიკავშირდეთ." sub="მხოლოდ საბაზისო კონტაქტი — 1 წუთი. ვინაობის დოკუმენტურ დადასტურებას ბოლოს, წარდგენამდე ვთხოვთ — მას შემდეგ, რაც პროფილს შეავსებ." />

    <FormSection title="სახელი და კონტაქტი" sub="სახელი და გვარი გამოჩნდება პროფილზე. ელფოსტა და ტელეფონი — კავშირისა და გადახდისთვის.">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field l="სახელი" required><Input value={form.firstName} onChange={(e: any) => set({ firstName: e.target.value })} placeholder="სახელი" /></Field>
        <Field l="გვარი" required><Input value={form.lastName} onChange={(e: any) => set({ lastName: e.target.value })} placeholder="გვარი" /></Field>
        <Field l="ელფოსტა" required><Input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={form.email} onChange={(e: any) => set({ email: e.target.value })} placeholder="you@example.com" /></Field>
        <Field l="ტელეფონი" required><Input type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e: any) => set({ phone: e.target.value })} placeholder="+995 5XX XX XX XX" /></Field>
      </div>
    </FormSection>
  </>
)

/* ───── Profession-specific fields ───── */
type FieldDef =
  | { key: string; label: string; kind: 'text'; placeholder?: string; sub?: string }
  | { key: string; label: string; kind: 'number'; placeholder?: string; sub?: string }
  | { key: string; label: string; kind: 'chips'; options?: string[]; sub?: string }
  | { key: string; label: string; kind: 'list'; placeholder?: string; sub?: string }

type ProfessionGroup = { id: string; title: string; cats: string[]; fields: FieldDef[] }

const PROFESSION_GROUPS: ProfessionGroup[] = [
  {
    id: 'business',
    title: 'ბიზნეს-სტრატეგია / Fundraising / პროდუქტი',
    cats: ['ბიზნეს-სტრატეგია', 'Fundraising', 'პროდუქტი', 'პროდუქტი / UX'],
    fields: [
      { key: 'exitsCount', label: 'Exit-ების რაოდენობა', kind: 'number', placeholder: 'მაგ. 2' },
      { key: 'avgDealSize', label: 'საშუალო deal size', kind: 'text', placeholder: 'მაგ. $1M–5M' },
      { key: 'industriesServed', label: 'ინდუსტრიები', kind: 'list', placeholder: 'დაამატე ინდუსტრია' },
      { key: 'pastCompanies', label: 'წინა კომპანიები', kind: 'list', placeholder: 'დაამატე კომპანია' },
    ],
  },
  {
    id: 'law',
    title: 'სამართალი',
    cats: ['სამართალი'],
    fields: [
      { key: 'barLicenseNumber', label: 'Bar ლიცენზიის ნომერი', kind: 'text', placeholder: 'GE-BAR-XXXX' },
      { key: 'practiceAreas', label: 'პრაქტიკის სფეროები', kind: 'chips', options: ['საკორპორაციო', 'საგადასახადო', 'შრომითი', 'ინტელექტ. საკუთრება', 'ლიტიგაცია', 'IT / პერს. მონაცემები'] },
      { key: 'courtExperience', label: 'სასამართლო გამოცდილება', kind: 'text', placeholder: 'რამდენი წელი / ინსტანციები' },
    ],
  },
  {
    id: 'mental',
    title: 'მენტალური ჯანმრთელობა',
    cats: ['მენტალური ჯანმრთელობა'],
    fields: [
      { key: 'licenseId', label: 'ლიცენზიის ID', kind: 'text', placeholder: 'მაგ. GE-PSY-XXXX' },
      { key: 'modalities', label: 'მეთოდები', kind: 'chips', options: ['CBT', 'EMDR', 'Systemic', 'Psychodynamic'] },
      { key: 'ageGroups', label: 'ასაკობრივი ჯგუფები', kind: 'chips', options: ['ბავშვები', 'მოზარდები', 'ზრდასრულები', 'ხანდაზმულები'] },
    ],
  },
  {
    id: 'finance',
    title: 'ფინანსები / საგადასახადო',
    cats: ['ფინანსები', 'საგადასახადო'],
    fields: [
      { key: 'credentials', label: 'სერტიფიკატები', kind: 'chips', options: ['CFA', 'CPA', 'ACCA', 'IE'] },
      { key: 'aum', label: 'AUM (არასავალდებულო)', kind: 'text', placeholder: 'მაგ. $50M' },
      { key: 'subSpecialty', label: 'ქვე-სპეციალობა', kind: 'text', placeholder: 'მაგ. M&A, portfolio' },
    ],
  },
  {
    id: 'marketing',
    title: 'მარკეტინგი',
    cats: ['მარკეტინგი'],
    fields: [
      { key: 'platforms', label: 'პლატფორმები', kind: 'chips', options: ['Meta', 'Google', 'TikTok', 'LinkedIn'] },
      { key: 'verticals', label: 'ვერტიკალები', kind: 'list', placeholder: 'დაამატე ვერტიკალი' },
      { key: 'avgROAS', label: 'საშუალო ROAS', kind: 'text', placeholder: 'მაგ. 3.5x' },
    ],
  },
  {
    id: 'data',
    title: 'Data / AI / დეველოპერი',
    cats: ['Data / AI', 'დეველოპერი'],
    fields: [
      { key: 'techStack', label: 'ტექნიკური სტეკი', kind: 'list', placeholder: 'Python, TS, PyTorch…' },
      { key: 'githubUrl', label: 'GitHub URL', kind: 'text', placeholder: 'https://github.com/…' },
      { key: 'openSourceCommits', label: 'Open-source ჩართულობა', kind: 'text', placeholder: 'მაგ. 200+ commits' },
    ],
  },
  {
    id: 'product-design',
    title: 'პროდუქტი / UX / დიზაინი',
    cats: ['პროდუქტი / UX', 'დიზაინი'],
    fields: [
      { key: 'tools', label: 'ხელსაწყოები', kind: 'chips', options: ['Figma', 'Sketch', 'Adobe'] },
      { key: 'portfolioUrl', label: 'პორტფოლიოს URL', kind: 'text', placeholder: 'https://…' },
      { key: 'industriesServed', label: 'ინდუსტრიები', kind: 'list', placeholder: 'დაამატე ინდუსტრია' },
    ],
  },
  {
    id: 'career',
    title: 'კარიერა',
    cats: ['კარიერა'],
    fields: [
      { key: 'industriesServed', label: 'ინდუსტრიები', kind: 'list', placeholder: 'დაამატე ინდუსტრია' },
      { key: 'senioritySpecialty', label: 'სენიორობის სპეციალობა', kind: 'text', placeholder: 'მაგ. mid → senior' },
      { key: 'resumesReviewed', label: 'გადახედილი CV-ები', kind: 'text', placeholder: 'მაგ. 200+' },
    ],
  },
]

const groupsForCategories = (cats: string[]): ProfessionGroup[] => {
  const matched = new Set<string>()
  const out: ProfessionGroup[] = []
  for (const g of PROFESSION_GROUPS) {
    if (g.cats.some(c => cats.includes(c)) && !matched.has(g.id)) {
      matched.add(g.id)
      out.push(g)
    }
  }
  return out
}

const ProfessionField = ({
  def, value, onChange,
}: { def: FieldDef; value: any; onChange: (v: any) => void }) => {
  if (def.kind === 'text') {
    return (
      <Field l={def.label} sub={def.sub}>
        <Input value={value ?? ''} onChange={(e: any) => onChange(e.target.value)} placeholder={def.placeholder} />
      </Field>
    )
  }
  if (def.kind === 'number') {
    return (
      <Field l={def.label} sub={def.sub}>
        <Input type="number" min={0} value={value ?? ''} onChange={(e: any) => onChange(e.target.value === '' ? '' : Number(e.target.value))} placeholder={def.placeholder} />
      </Field>
    )
  }
  if (def.kind === 'chips') {
    const arr: string[] = Array.isArray(value) ? value : []
    const toggle = (opt: string) => onChange(arr.includes(opt) ? arr.filter(x => x !== opt) : [...arr, opt])
    return (
      <Field l={def.label} sub={def.sub}>
        <div className="flex flex-wrap gap-1.5">
          {(def.options ?? []).map(opt => {
            const on = arr.includes(opt)
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className={`h-9 px-3.5 rounded-pill border font-display text-[12.5px] font-semibold tracking-wide inline-flex items-center gap-1.5 transition-all duration-fast motion-safe:active:scale-[0.97] ${
                  on ? 'bg-brand-500 text-white border-brand-500 shadow-sm' : 'bg-white text-ink-700 border-ink-200 hover:border-ink-400'
                }`}
              >
                {on && <Icon.check className="w-3 h-3" />}
                {opt}
              </button>
            )
          })}
        </div>
      </Field>
    )
  }
  // list — dynamic add
  const arr: string[] = Array.isArray(value) ? value : []
  const remove = (i: number) => onChange(arr.filter((_, idx) => idx !== i))
  return (
    <Field l={def.label} sub={def.sub}>
      <ListInput values={arr} onChange={onChange} placeholder={def.placeholder} />
      {arr.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {arr.map((v, i) => (
            <span key={i} className="inline-flex items-center gap-1 h-8 px-3 rounded-pill bg-brand-50 border border-brand-200 text-brand-800 font-display text-[11.5px] font-semibold">
              {v}
              <button type="button" onClick={() => remove(i)} className="ml-1 text-brand-600 hover:text-brand-800"><Icon.x className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
    </Field>
  )
}

const ListInput = ({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder?: string }) => {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (!v) return
    if (values.includes(v)) { setDraft(''); return }
    onChange([...values, v])
    setDraft('')
  }
  return (
    <div className="flex gap-2">
      <Input
        value={draft}
        onChange={(e: any) => setDraft(e.target.value)}
        onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={add}
        className="h-11 px-3 rounded-btn border border-ink-200 hover:border-ink-400 hover:bg-ink-50 text-ink-700 font-display font-semibold text-[12px] inline-flex items-center gap-1 shrink-0"
      >
        <Icon.plus className="w-3.5 h-3.5" /> დაამატე
      </button>
    </div>
  )
}

const ProfessionFields = ({ form, set }: StepProps) => {
  const groups = groupsForCategories(form.cats)
  if (groups.length === 0) return null
  const setField = (key: string, v: any) => set({ professionData: { ...form.professionData, [key]: v } })
  return (
    <>
      {groups.map(g => (
        <FormSection key={g.id} title={`დამატებითი ინფო · ${g.title}`} sub="ეს ინფორმაცია მოდერაციის დროს გვეხმარება უფრო სწრაფად დაგადასტუროთ.">
          <div className="grid sm:grid-cols-2 gap-3">
            {g.fields.map(f => (
              <ProfessionField key={f.key} def={f} value={form.professionData[f.key]} onChange={v => setField(f.key, v)} />
            ))}
          </div>
        </FormSection>
      ))}
    </>
  )
}

/* ───── STEP 2 — Expertise (2 parts: focus → details) ───── */
const Step2 = ({ form, set, part = 1 }: StepProps) => {
  const ALL_CATS = ['ბიზნეს-სტრატეგია', 'Fundraising', 'მარკეტინგი', 'პროდუქტი / UX', 'სამართალი', 'საგადასახადო', 'კარიერა', 'Data / AI', 'მენტალური ჯანმრთელობა', 'ენები', 'ფინანსები']
  const cats = form.cats
  const toggle = (c: string) => set({ cats: cats.includes(c) ? cats.filter(x => x !== c) : [...cats, c] })

  if (part === 2) return (
    <>
      <StepHeader n={2} total={5} eyebrow="ექსპერტიზა · 2/2" title="დეტალები — ენები, ლოკაცია, გამოცდილება." sub="ეს ველები პროფილს ავსებს და მოდერაციას აჩქარებს. LinkedIn და ვებსაიტი არასავალდებულოა — მაგრამ ნდობას მკვეთრად ზრდის." />

      <FormSection title="ენები + ლოკაცია">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field l="ენები" sub="დაამატე ენა და დონე (A1–C2 ან მშობლიური)">
            <LanguageEditor value={form.languages} onChange={list => set({ languages: list })} />
          </Field>
          <Field l="ქალაქი (საჯარო)" sub="მისამართი არ ჩანს — მხოლოდ ქალაქი">
            <Input value={form.city} onChange={(e: any) => set({ city: e.target.value })} placeholder="თბილისი" />
          </Field>
        </div>
      </FormSection>

      <FormSection title="გამოცდილების წლები + ფორმალური საფუძველი">
        <div className="grid sm:grid-cols-3 gap-3">
          <Field l="გამოცდილების წლები">
            <Input type="number" min={0} max={80} value={form.yearsExp} onChange={(e: any) => set({ yearsExp: e.target.value })} placeholder="მაგ. 12" />
          </Field>
          <Field l="LinkedIn (არასავალდებულო)">
            <Input placeholder="linkedin.com/in/…" value={form.linkedin} onChange={(e: any) => set({ linkedin: e.target.value })} />
          </Field>
          <Field l="ვებსაიტი / პორტფოლიო (არასავალდებულო)">
            <Input placeholder="https://…" value={form.website} onChange={(e: any) => set({ website: e.target.value })} />
          </Field>
        </div>
      </FormSection>

      <ProfessionFields form={form} set={set} />
    </>
  )

  return (
    <>
      <StepHeader n={2} total={5} eyebrow="ექსპერტიზა · 1/2" title="რა იცი და სად შეგიძლია ფაუნდერი დაგეხმარო?" sub="ეს არის ის, რასაც მომხმარებლები ნახავენ შენს პროფილზე. იყავი კონკრეტული — abstract-ი არ ყიდის. ერთი ფოკუსი > ხუთი 'სხვადასხვა'." />

      <FormSection title="კატეგორიები" sub="აირჩიე 1–3 ძირითადი მიმართულება. ერთი მთავარი + ერთი მეორადი ჯობია სამ ბუნდოვანზე.">
        <div className="flex flex-wrap gap-1.5">
          {ALL_CATS.map(c => {
            const on = cats.includes(c)
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggle(c)}
                className={`h-9 px-3.5 rounded-pill border font-display text-[12.5px] font-semibold tracking-wide inline-flex items-center gap-1.5 transition-all duration-fast motion-safe:active:scale-[0.97] ${
                  on ? 'bg-brand-500 text-white border-brand-500 shadow-sm' : 'bg-white text-ink-700 border-ink-200 hover:border-ink-400'
                }`}
              >
                {on && <Icon.check className="w-3 h-3" />}
                {c}
              </button>
            )
          })}
        </div>
        <div className="mt-3 text-[11.5px] text-ink-500 tabular-nums">არჩეული: <span className="font-display font-bold text-ink-900">{cats.length}</span> / 3</div>
      </FormSection>

      <FormSection title="პროფესია (headline)" sub="ერთი წინადადება. გამოჩნდება ბარათში — სიტყვა-სიტყვით. რა-ვ-როგორ-სად ხარ.">
        <Input value={form.headline} onChange={(e: any) => set({ headline: e.target.value })} placeholder="მაგ. ბიზნეს-სტრატეგი · ყოფ. McKinsey · 12 წელი" maxLength={80} />
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-500 tabular-nums">
          <span>{form.headline.length} / 80 სიმბოლო</span>
          {form.headline.length >= 20 && form.headline.length <= 80 && (
            <span className="inline-flex items-center gap-1 text-success-700"><Icon.check className="w-3 h-3" /> კარგი სიგრძე</span>
          )}
        </div>
      </FormSection>

      <FormSection title="შესახებ" sub="მინ. 150 სიმბოლო · იდეალურად 300–600 (2–4 აბზაცი). დაიწყე იმით, რა გამოცდილებაა შენ უკან. დაასრულე იმით, ვინ უნდა გადმოგწეროს.">
        <textarea
          value={form.motivation}
          onChange={e => set({ motivation: e.target.value })}
          placeholder="მოკლედ აღწერე — რა გამოცდილება გაქვს, რა კონკრეტულ პრობლემებში ეხმარები ფაუნდერს, რა შედეგებზე შეიძლება იქცეს."
          rows={9}
          className="w-full p-3 rounded-field border border-ink-200 bg-white text-[13.5px] text-ink-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none resize-none leading-[1.55]"
        />
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-500 tabular-nums">
          <span>{form.motivation.length} / მინ. 150 სიმბოლო</span>
          {form.motivation.trim().length >= 300 && (
            <span className="inline-flex items-center gap-1 text-success-700"><Icon.check className="w-3 h-3" /> ოპტიმალური</span>
          )}
        </div>
      </FormSection>

      <p className="mb-4 text-[12px] text-ink-500">ენები, ლოკაცია და გამოცდილების დეტალები — შემდეგ ეკრანზე.</p>
    </>
  )
}

const YouTubeIntroInput = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const url = value
  const setUrl = onChange
  const id = extractYouTubeId(url)
  const invalid = url.length > 0 && !id
  const thumb = id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null

  return (
    <div>
      <div className={`relative rounded-card border-2 bg-white transition-colors duration-fast ${
        id ? 'border-brand-300' : invalid ? 'border-danger-300' : 'border-dashed border-ink-300 hover:border-brand-400'
      }`}>
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-full bg-brand-50 border border-brand-200 text-brand-700 inline-flex items-center justify-center">
              <Icon.video className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-[14.5px] sm:text-[15px] font-bold text-ink-900 mb-1">
                ატვირთე ვიდეო YouTube-ზე და ლინკი ჩააგდე
              </div>
              <div className="text-[12px] text-ink-500 mb-3">
                Unlisted (არასაჯარო) ვიდეო — ჩვენ ვნახავთ, საჯარო არ იქნება. 30–60 წამი.
              </div>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=… ან youtu.be/…"
                inputMode="url"
                autoComplete="url"
                className={`w-full h-11 px-3.5 rounded-field border bg-white text-[13.5px] text-ink-900 placeholder:text-ink-400 focus:outline-none no-caps ${
                  id ? 'border-brand-300 focus:border-brand-500' : invalid ? 'border-danger-300 focus:border-danger-500' : 'border-ink-200 focus:border-brand-500'
                }`}
              />
              {invalid && (
                <p className="mt-2 text-[11.5px] text-danger-700 font-display font-semibold inline-flex items-center gap-1">
                  <Icon.warn className="w-3 h-3" />
                  ეს YouTube-ს ლინკი არ ჰგავს — შეამოწმე.
                </p>
              )}
              {id && (
                <p className="mt-2 text-[11.5px] text-brand-700 font-display font-semibold inline-flex items-center gap-1 no-caps">
                  <Icon.check className="w-3.5 h-3.5" />
                  ვიდეო ID: {id}
                </p>
              )}
            </div>
          </div>

          {thumb && (
            <div className="mt-5 rounded-card overflow-hidden border border-ink-200 relative motion-safe:animate-scale-in">
              <a
                href={`https://youtu.be/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block relative aspect-video bg-ink-900 group"
              >
                <img src={thumb} alt="YouTube preview" loading="lazy" className="absolute inset-0 w-full h-full object-cover motion-safe:animate-fade-in-fast" />
                <span className="absolute inset-0 flex items-center justify-center bg-ink-900/20 group-hover:bg-ink-900/40 transition-colors">
                  <span className="w-14 h-14 rounded-full bg-white/95 shadow-float inline-flex items-center justify-center">
                    <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-brand-700 ml-1">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                </span>
                <span className="absolute top-2 left-2 inline-flex items-center gap-1 h-5 px-2 rounded-pill bg-white/95 backdrop-blur text-[10px] font-display font-bold uppercase tracking-[0.14em] text-ink-800">
                  <Icon.external className="w-2.5 h-2.5" /> გახსენი YouTube-ზე
                </span>
              </a>
            </div>
          )}
        </div>
      </div>

      <details className="mt-3 text-[12px] text-ink-600 group">
        <summary className="cursor-pointer font-display font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1 no-caps">
          <Icon.chevR className="w-3 h-3 group-open:rotate-90 transition-transform duration-fast" />
          როგორ ავტვირთო ვიდეო YouTube-ზე?
        </summary>
        <ol className="mt-2 pl-5 list-decimal space-y-1.5 text-[12.5px] text-ink-700 leading-[1.55] no-caps">
          <li>გახსენი <a href="https://studio.youtube.com" target="_blank" rel="noopener noreferrer" className="font-display font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2">studio.youtube.com</a> და დააჭირე Upload.</li>
          <li>აირჩიე ვიდეო-ფაილი. სახელი: „მცოდნე — [შენი სახელი] — ინტრო“.</li>
          <li>Visibility სექციაში აირჩიე <span className="font-display font-semibold text-ink-900">Unlisted</span> (არასაჯარო) — მხოლოდ ის, ვისაც ლინკი აქვს, ნახავს.</li>
          <li>Publish-ის შემდეგ დააკოპირე ლინკი და ჩააგდე აქ.</li>
        </ol>
      </details>
    </div>
  )
}

/* ───── STEP 3 — Portfolio ───── */
const Step3 = ({ form, set, media, setMedia }: StepProps) => (
  <>
    <StepHeader n={3} total={5} eyebrow="პორტფოლიო" title="დაარწმუნე — ვიდეო + სერტიფიკატებით." sub="ფაუნდერი 80 ლარს იხდის უცნობს. ვიდეო — ეს ფაუნდერი ხდის გადაწყვეტილებას შენთან ჯავშნისთვის. ჩვენი მონაცემებით, ვიდეო-ით ექსპერტებს 4×-ჯერ უფრო მეტი ჯავშნა აქვთ." />

    <div className="mb-4"><MediaWarning /></div>

    <FormSection title="ინტრო ვიდეო · 30–60 წმ" sub="2-3 ფრაზაში: ვინ ხარ, რა გამოცდილებაა, ვისთვის სასარგებლო. გადაიღე ფანჯრიდან — სუფთა ფონი, კარგი შუქი.">
      <YouTubeIntroInput value={form.introVideoUrl} onChange={(v) => set({ introVideoUrl: v })} />
    </FormSection>

    <FormSection title="სერტიფიკატები + ფორმალური განათლება" sub="არასავალდებულო. სასურველი მათთვის, ვინც ფინანსურ, სამართლებრივ ან საგადასახადო კონსულტაციას სთავაზობს.">
      <CertificateUploader
        items={media?.certificates ?? []}
        onChange={list => setMedia?.({ certificates: list })}
      />
    </FormSection>

    <FormSection title="პროფილის ფოტო" sub="JPG / PNG · მინ. 400×400 · ფონი მარტივი (ერთფერად ან გასუფთავებული).">
      <PhotoUploader value={media?.photoUrl} onChange={url => setMedia?.({ photoUrl: url })} />
    </FormSection>
  </>
)

/* ───── STEP 4 — Services + Pricing (1/2) · Payout + Identity/KYC (2/2) ───── */
const Step4 = ({ form, set, media, setMedia, part = 1 }: StepProps) => {
  const updateService = (i: number, patch: Partial<FormState['services'][number]>) => {
    const next = form.services.map((s, idx) => idx === i ? { ...s, ...patch } : s)
    set({ services: next })
  }
  const removeService = (i: number) => set({ services: form.services.filter((_, idx) => idx !== i) })
  const addService = () => set({ services: [...form.services, { name: '', dur: 60, price: 60, free: false, desc: '' }] })

  if (part === 2) return (
    <>
      <StepHeader n={4} total={5} eyebrow="ვინაობა · 2/2" title="ანგარიში და ვინაობის დადასტურება." sub="ბოლო ველები წარდგენამდე: payout-ანგარიში GEL-ში და ვინაობის დოკუმენტები. ეს ინფორმაცია კლიენტებზე არასდროს ჩანს." />

      <FormSection title="Payout — ანგარიში" sub="GEL-ში, საქართველოს ბანკიდან.">
        <div className="grid sm:grid-cols-[120px_1fr] gap-3">
          <Field l="ბანკი">
            <div className="relative">
              <select value={form.bank} onChange={e => set({ bank: e.target.value })} className="w-full h-11 pl-3.5 pr-9 rounded-field border border-ink-200 bg-white text-ink-900 text-[13px] appearance-none hover:border-ink-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-[border-color,box-shadow] duration-fast">
                <option>TBC</option>
                <option>BOG</option>
                <option>Liberty</option>
              </select>
              <Icon.chevR className="w-3.5 h-3.5 text-ink-500 rotate-90 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </Field>
          <Field l="IBAN" sub="22 სიმბოლო · GE-ით იწყება"><Input value={form.iban} onChange={(e: any) => set({ iban: e.target.value })} placeholder="GE00 XX00 0000 0000 0000 0000" /></Field>
        </div>
      </FormSection>

      {/* KYC deferred here (from Step 1) — the applicant reaches identity documents
          only after investing in the profile, just before submitting. */}
      <FormSection title="ვინაობის დადასტურება" sub="საქართველოს კანონის მიხედვით, ექსპერტი ვერ შემოვა ანონიმურად. ეს ინფორმაცია არ ჩანს მომხმარებლებზე — მხოლოდ შენი ვინაობის გადამოწმებისთვის.">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field l="პირადი ნომერი" sub="დაშიფრულია · არ ვუზიარებთ მესამე მხარეს"><Input value={form.personalId} onChange={(e: any) => set({ personalId: e.target.value })} placeholder="01234567890" /></Field>
          <Field l="დაბადების თარიღი" required><Input type="date" value={form.dob} onChange={(e: any) => set({ dob: e.target.value })} /></Field>
        </div>
      </FormSection>

      <FormSection title="დოკუმენტი" sub="პირადობის მოწმობა ან საქართველოს პასპორტი — მხოლოდ წინა გვერდის ფოტო. რეცენზია 24 საათში.">
        <div className="grid sm:grid-cols-2 gap-3">
          <DocUploadTile
            label="პირადობის წინა გვერდი"
            hint="JPG / PNG · მაქს. 8 MB"
            kind="idDoc"
            icon={<Icon.upload className="w-7 h-7 mx-auto text-ink-400" />}
            value={media?.idDocUrl}
            onChange={url => setMedia?.({ idDocUrl: url })}
          />
          <DocUploadTile
            label="სელფი დოკუმენტთან"
            hint="გადაიღე დოკუმენტი სახესთან ერთად"
            kind="selfie"
            icon={<Icon.user className="w-7 h-7 mx-auto text-ink-400" />}
            value={media?.selfieUrl}
            onChange={url => setMedia?.({ selfieUrl: url })}
          />
        </div>
        <div className="mt-3"><MediaWarning /></div>
      </FormSection>

      <div className="flex items-start gap-2.5 p-4 rounded-card bg-brand-50/40 border border-brand-200">
        <Icon.shield className="w-4 h-4 text-brand-700 mt-0.5 shrink-0" />
        <p className="text-[12px] text-ink-700 leading-[1.55]">პერსონალური მონაცემები ინახება საქართველოს კანონის შესაბამისად. ვერ ვუზიარებთ მესამე მხარეს ვერც ერთ შემთხვევაში. შენს პროფილზე ნახავენ მხოლოდ სახელი, გვარი და საჯაროდ მონიშნული ინფორმაცია.</p>
      </div>
    </>
  )

  return (
  <>
    <StepHeader n={4} total={5} eyebrow="სერვისები · 1/2" title="რას სთავაზობ — და რა ფასად?" sub="დაიწყე 2-3 ტიპით. ფასს შენ ადგენ — რაც დადებ, ის ერიცხება კლიენტს. ბიზნეს-სტრატეგიის საშუალო კონსულტაცია — ₾60–₾120. ნუ შეუმცირებ — ფაუნდერი 'საუკეთესოს' ეძებს, არა 'იაფს'." />

    <FormSection title="კონსულტაცია-ტიპები" sub="თითო ტიპს უნდა ჰქონდეს მკაფიო სახელი, ფასი და ხანგრძლივობა.">
      <div className="space-y-3">
        {form.services.map((s, i) => (
          <div key={i} className={`p-4 rounded-card border ${s.free ? 'bg-brand-50/30 border-brand-200' : 'bg-white border-ink-200'}`}>
            <div className="grid sm:grid-cols-[1fr_120px_120px_auto] gap-3 items-start">
              <div className="min-w-0">
                <Input value={s.name} onChange={(e: any) => updateService(i, { name: e.target.value })} placeholder="სერვისის სახელი" className="!h-9 !text-[13px] font-display font-bold" />
                <textarea value={s.desc} onChange={e => updateService(i, { desc: e.target.value })} placeholder="მოკლე აღწერა" rows={2} className="mt-2 w-full p-2 rounded-field border border-ink-200 bg-white text-[12px] text-ink-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none resize-none leading-[1.45]" />
              </div>
              <div>
                <span className="font-display text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 block mb-1">ხანგრძ. (წთ)</span>
                <Input type="number" min={15} max={240} value={s.dur} onChange={(e: any) => updateService(i, { dur: Number(e.target.value) || 0 })} className="!h-9 !text-[13px] tabular-nums font-display font-bold" />
              </div>
              <div>
                <span className="font-display text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 block mb-1">ფასი (₾)</span>
                <Input type="number" min={0} value={s.price} onChange={(e: any) => updateService(i, { price: Number(e.target.value) || 0 })} className="!h-9 !text-[13px] tabular-nums font-display font-bold" disabled={s.free} />
              </div>
              <button type="button" onClick={() => removeService(i)} aria-label="სერვისის წაშლა" className="h-9 w-9 self-end rounded-btn text-ink-500 hover:text-danger-700 hover:bg-danger-50 inline-flex items-center justify-center transition-colors">
                <Icon.x className="w-4 h-4" />
              </button>
            </div>
            {!s.free && (
              <div className="mt-3 pt-3 border-t border-ink-100 flex items-center justify-between gap-3 text-[11.5px]">
                <span className="text-ink-600">ექსპერტი მიიღებს (15% კომისიის შემდეგ)</span>
                <span className="font-display font-bold text-brand-700 tabular-nums">₾{(s.price * 0.85).toFixed(2)}</span>
              </div>
            )}
          </div>
        ))}

        <button type="button" onClick={addService} className="w-full h-12 rounded-card border border-dashed border-ink-300 hover:border-brand-400 hover:bg-brand-50/30 text-ink-600 hover:text-brand-700 font-display font-semibold text-[12.5px] inline-flex items-center justify-center gap-2 transition-colors">
          <Icon.plus className="w-4 h-4" /> ახალი ტიპის დამატება
        </button>
      </div>
    </FormSection>

    <FormSection title="ხელმისაწვდომობა" sub="ჩვეულებრივი დღე. დეტალური კალენდარი მოგვიანებით.">
      <div className="grid sm:grid-cols-2 gap-3">
        {[
          { d: 'ორშ', h: '09:00 – 18:00', on: true },
          { d: 'სამშ', h: '09:00 – 18:00', on: true },
          { d: 'ოთხ', h: '09:00 – 18:00', on: true },
          { d: 'ხუთ', h: '09:00 – 18:00', on: true },
          { d: 'პარ', h: '10:00 – 19:00', on: true },
          { d: 'შაბ', h: '11:00 – 16:00', on: true },
          { d: 'კვ', h: 'უქმე', on: false },
        ].map((d, i) => (
          <div key={i} className={`flex items-center justify-between gap-3 p-3 rounded-card border ${d.on ? 'bg-white border-ink-200' : 'bg-ink-50/50 border-ink-100'}`}>
            <span className={`font-display text-[13px] font-bold w-14 ${d.on ? 'text-ink-900' : 'text-ink-400'}`}>{d.d}</span>
            <span className={`flex-1 font-mono text-[12px] tabular-nums ${d.on ? 'text-ink-700' : 'text-ink-400'}`}>{d.h}</span>
            <span className={`relative w-9 h-5 rounded-full transition-colors ${d.on ? 'bg-brand-500' : 'bg-ink-200'}`}>
              <span className={`absolute top-0.5 ${d.on ? 'right-0.5' : 'left-0.5'} w-4 h-4 rounded-full bg-white shadow-xs transition-all`} />
            </span>
          </div>
        ))}
      </div>
    </FormSection>

    <p className="mb-4 text-[12px] text-ink-500">payout-ანგარიში და ვინაობის დადასტურება — შემდეგ ეკრანზე.</p>
  </>
  )
}

/* ───── STEP 5 — Review status ───── */
const Step5 = ({ email }: { email: string }) => (
  <>
    <StepHeader n={5} total={5} eyebrow="მოდერაცია" title="წარდგენილია — ვამოწმებთ ხელით." sub="ჩვენი მოდერატორი გადახედავს თითოეულ პროფილს ხელით — 24–48 საათში. ეს არ არის ავტომატური; გვაინტერესებს, რომ მხოლოდ რეალური ექსპერტები მოვიდნენ პლატფორმაზე." />

    <div className="rounded-card overflow-hidden border border-ink-200 bg-white mb-4">
      <div className="px-6 py-5 border-b border-ink-100 bg-warning-50 flex items-center gap-3">
        <span className="relative inline-flex">
          <span className="absolute inset-0 rounded-full bg-warning-500 opacity-40 animate-ping" />
          <span className="relative w-3 h-3 rounded-full bg-warning-500" />
        </span>
        <div className="min-w-0">
          <div className="font-display text-[13.5px] font-bold text-warning-900">მოდერაცია მიმდინარეობს</div>
          <div className="text-[11.5px] text-warning-800 tabular-nums">წარდგენილია 9 ივნ. 14:32 · ვამოწმებთ 18 საათში</div>
        </div>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-warning-700">№ APP-0247</span>
      </div>

      <div className="p-6">
        <ol className="space-y-3">
          {[
            { l: 'ვინაობის გადამოწმება', sub: 'პირადობის მოწმობა + სელფი — ავტომატური OCR + ხელით', state: 'done', d: '9 ივნ. 14:35' },
            { l: 'ექსპერტიზის რეცენზია', sub: 'შენი bio + headline + კატეგორიების შესაბამისობა', state: 'active', d: 'ახლა' },
            { l: 'ვიდეო და სერტიფიკატების შემოწმება', sub: 'მოდერატორი უყურებს ვიდეოს, ამოწმებს დოკუმენტებს', state: 'next', d: 'მოლოდინში' },
            { l: 'საბოლოო დასტური', sub: 'პროფილი გასაჯაროვდება ან მოვა feedback გადასაკეთებლად', state: 'next', d: 'მოლოდინში' },
          ].map((s, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className={`mt-0.5 w-7 h-7 shrink-0 rounded-full inline-flex items-center justify-center font-display text-[11px] font-bold tabular-nums ${
                s.state === 'done' ? 'bg-success-500 text-white' :
                s.state === 'active' ? 'bg-brand-500 text-white ring-4 ring-brand-500/15' :
                'bg-white border-2 border-ink-200 text-ink-400'
              }`}>
                {s.state === 'done' ? <Icon.check className="w-3.5 h-3.5" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-display text-[13px] font-bold ${s.state === 'done' ? 'text-ink-900' : s.state === 'active' ? 'text-brand-800' : 'text-ink-700'}`}>{s.l}</span>
                  <span className="font-mono text-[10.5px] tabular-nums text-ink-500 shrink-0">{s.d}</span>
                </div>
                <div className="text-[11.5px] text-ink-600">{s.sub}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>

    <FormSection title="რა მოხდება შემდეგ" sub="ვცდილობთ, რომ 80%-ის შემთხვევაში 24 საათში მოვინახულოთ. რთული პროფილები — მაქს. 48 სთ.">
      <div className="grid sm:grid-cols-3 gap-3">
        {[
          { i: 1, l: 'ემაილით გავარკვევთ', sub: `მისამართზე ${email.trim() || 'შენს ელფოსტაზე'} გავაგზავნით ან დასტურს, ან კონკრეტულ feedback-ს.` },
          { i: 2, l: 'პროფილი გასაჯაროვდება', sub: 'ცოცხალდება ძებნაში. პირველი ჯავშანი — საშუალოდ 5 დღეში.' },
          { i: 3, l: 'პირველი ჯავშანი ⇒ ხელფასი', sub: 'სესიის შემდეგ 14 დღეში პირველი payout TBC-ზე.' },
        ].map((s, i) => (
          <div key={i} className="p-4 rounded-card bg-ink-50/50 border border-ink-200">
            <div className="w-7 h-7 rounded-full bg-brand-500 text-white inline-flex items-center justify-center font-display text-[12px] font-bold mb-2">{s.i}</div>
            <div className="font-display text-[13px] font-bold text-ink-900 tracking-tight mb-1">{s.l}</div>
            <p className="text-[11.5px] text-ink-600 leading-[1.5]">{s.sub}</p>
          </div>
        ))}
      </div>
    </FormSection>

    <div className="p-5 rounded-card bg-brand-50/50 border border-brand-200 flex items-start gap-3">
      <Icon.bolt className="w-5 h-5 text-brand-700 mt-0.5 shrink-0" />
      <div>
        <div className="font-display text-[13.5px] font-bold text-ink-900 tracking-tight">ჩვენთან გელოდება ექსპერტი-მენტორი</div>
        <p className="mt-1 text-[12px] text-ink-700 leading-[1.55]">ნინო კიკნაძე — 4.96★ · 320 სესია — შენი ონბორდინგის გავლის შემდეგ პირველი თვის განმავლობაში დაგეხმარება პროფილის გაუმჯობესებაში. უფასოდ.</p>
        <button type="button" className="mt-3 h-9 px-3 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12px] inline-flex items-center gap-1.5 transition-colors">
          ნინოსთან ჩატის გახსნა
        </button>
      </div>
    </div>
  </>
)

/* ───── Live preview card (right side) ───── */
const LivePreview = ({ step, form }: { step: StepId; form: FormState }) => {
  const displayName = `${form.firstName} ${form.lastName}`.trim() || 'შენი სახელი'
  const displayCity = form.city.trim() || 'ქალაქი'
  const displayYears = form.yearsExp ? `${form.yearsExp} წ. გამოცდილება` : 'გამოცდილება'
  const displayHeadline = form.headline.trim() || 'შენი პროფესია გამოჩნდება აქ'
  const primaryCat = form.cats[0] || 'კატეგორია'
  const bio = form.motivation.trim() || form.headline.trim() || 'შესახებ — ეს ტექსტი გამოჩნდება ბარათში.'
  const paidService = form.services.find(s => !s.free && s.price > 0)
  const price = paidService?.price ?? 0
  return (
  <aside className="hidden xl:block w-[320px] shrink-0 p-6 border-l border-ink-200 bg-white sticky top-16 self-start xl:h-[836px] overflow-y-auto">
    <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-500 mb-2">ცოცხალი გადახედვა</div>
    <h3 className="font-display text-[15px] font-bold text-ink-900 tracking-tight mb-4">ასე ხედავენ მომხმარებლები</h3>

    <article className="rounded-card border border-ink-200 bg-white shadow-card overflow-hidden transition-shadow duration-fast hover:shadow-float">
      <div className="h-14 bg-gradient-to-br from-brand-100 to-brand-50 border-b border-ink-100" aria-hidden />
      <div className="px-4 pb-4 -mt-8">
        <div className="relative inline-block">
          <div className="w-16 h-16 rounded-card bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center ring-4 ring-white shadow-sm font-display text-[22px] font-bold text-white">
            {(form.firstName[0] || 'მ').toUpperCase()}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-success-500 ring-2 ring-white" />
        </div>
        <div className="mt-2.5 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-display text-[15px] font-bold text-ink-900 tracking-tight truncate">{displayName}</span>
            <VerifiedMark size={13} />
          </div>
          <div className="mt-0.5 text-[12px] text-ink-700 leading-[1.35] line-clamp-2">{displayHeadline}</div>
          <div className="mt-0.5 text-[11px] text-ink-400 truncate">{displayCity} · {displayYears}</div>
        </div>

        <div className="mt-2.5 inline-flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 h-[22px] px-2 rounded-pill bg-brand-50 border border-brand-200 text-brand-800 font-display text-[10px] font-bold uppercase tracking-[0.12em]">
            <Icon.award className="w-2.5 h-2.5" /> {primaryCat.slice(0, 22)}
          </span>
        </div>

        <p className="mt-2.5 text-[12.5px] text-ink-700 leading-[1.45] line-clamp-3">{bio}</p>

        <div className="mt-3 pt-3 border-t border-ink-100 flex items-center justify-between text-[12px]">
          <span className="inline-flex items-center gap-1"><Icon.star aria-hidden className="w-3 h-3 text-warning-500" /><span className="font-display font-bold tabular-nums text-ink-900">—</span><span className="text-ink-400 tabular-nums">(ახალი)</span></span>
          <span className="font-display text-[15px] font-bold text-ink-900 tabular-nums">₾{price}<span className="text-[11px] font-medium text-ink-500"> / სესია</span></span>
        </div>
        <div aria-hidden className="mt-3 w-full h-9 rounded-btn bg-brand-500 text-white font-display font-semibold text-[12px] tracking-wide inline-flex items-center justify-center gap-1.5 select-none cursor-default shadow-xs" title="ეს არის პრევიუ — მოცემულ დროდე ასე ჩანს ჯავშნის ღილაკი კლიენტებისთვის"><Icon.cal className="w-3.5 h-3.5" /> დაიჯავშნე (პრევიუ)</div>
      </div>
    </article>

    <div className="mt-5 p-4 rounded-card bg-ink-50/50 border border-ink-200">
      <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-500 mb-2">ნაბიჯი {step} / 5 — რჩევა</div>
      <p className="text-[12px] text-ink-700 leading-[1.55]">
        {step === 1 && 'დაიწყე კონტაქტით — ვინაობის დოკუმენტს ბოლოს, წარდგენამდე ვთხოვთ.'}
        {step === 2 && 'ერთი ფოკუსი > ხუთი "სხვადასხვა". ფაუნდერი არჩევს იმას, ვინც ერთ რამეში მკაფიოდ ჩანს ექსპერტი.'}
        {step === 3 && 'ვიდეო — 4×-ჯერ მეტი ჯავშანი. სუფთა ფონი, კარგი შუქი, 30-45 წამი.'}
        {step === 4 && 'არ შეუმცირო ფასი. ფაუნდერი "საუკეთესოს" ეძებს, არა "იაფს".'}
        {step === 5 && 'საშუალოდ 24-48 სთ. პირველი ჯავშანი — 5 დღეში.'}
      </p>
    </div>
  </aside>
  )
}

/* ───── Per-step validation helpers ───── */
const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
// Georgian mobile: 9 digits starting with 5 (5XXXXXXXX), or with +995 prefix (9955XXXXXXXX).
const isValidGeorgianPhone = (raw: string) => {
  const d = raw.replace(/\D/g, '')
  if (d.length === 9) return /^5\d{8}$/.test(d)
  if (d.length === 12) return /^9955\d{8}$/.test(d)
  return false
}

/* ───── Footer with next/back (part-aware: multi-part steps advance within
   the step before moving on; back re-enters the previous step's LAST part) ───── */
const FormFooter = ({ step, setStep, part, setPart, completed, setCompleted, onSubmit, submitting, validateStep, onError }: { step: StepId; setStep: (s: StepId) => void; part: StepPart; setPart: (p: StepPart) => void; completed: Set<StepId>; setCompleted: (c: Set<StepId>) => void; onSubmit: () => void; submitting: boolean; validateStep: (s: StepId, p: StepPart) => string | null; onError: (msg: string | null) => void }) => {
  const next = () => {
    if (step === 5) { onSubmit(); return }
    const err = validateStep(step, part)
    if (err) { onError(err); return }
    onError(null)
    if (part < partsOf(step)) { setPart((part + 1) as StepPart); return }
    const c = new Set(completed); c.add(step)
    setCompleted(c)
    setStep((step + 1) as StepId)
    setPart(1)
  }
  const back = () => {
    if (part > 1) { setPart((part - 1) as StepPart); return }
    if (step > 1) {
      const prev = (step - 1) as StepId
      setStep(prev)
      setPart(partsOf(prev) as StepPart)
    }
  }
  const isFinalPart = part >= partsOf(step)
  return (
    // Sticky below lg: on a long step (expertise, services+KYC) the advance
    // button would otherwise sit far off-screen — the #1 "am I stuck?" moment
    // of the mobile application. Desktop keeps the in-flow footer.
    <footer className="mt-8 pt-5 border-t border-ink-200 max-lg:sticky max-lg:bottom-0 max-lg:-mx-6 max-lg:px-6 max-lg:pb-3 max-lg:bg-white/95 max-lg:backdrop-blur max-lg:safe-area-bottom">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={back} disabled={step === 1} className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 active:bg-ink-100 disabled:opacity-50 disabled:cursor-not-allowed text-ink-700 font-display font-semibold text-[13px] inline-flex items-center gap-1.5 transition-[background-color,border-color,transform] duration-fast motion-safe:active:scale-[0.97]">
          <Icon.chevL className="w-4 h-4" /> უკან
        </button>

        <div className="text-[12px] text-ink-500 tabular-nums hidden sm:block">
          {step} / 5 · საშუალო დრო — <span className="font-display font-bold text-ink-700">12 წთ</span>
        </div>

        <div className="flex items-center gap-2">
          {/* "შენახვა + გასვლა" removed — server-side draft persistence isn't
              implemented yet. Users can safely leave; the form is one flow. */}
          <button type="button" onClick={next} disabled={submitting} className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:bg-ink-200 disabled:text-ink-400 text-white font-display font-semibold text-[13px] shadow-xs hover:shadow-sm inline-flex items-center gap-2 transition-[background-color,box-shadow,transform] duration-fast motion-safe:active:scale-[0.97]">
            {submitting ? 'იგზავნება…' : step === 5 ? 'წარდგენა მოდერაციისთვის' : step === 4 && isFinalPart ? 'შემდეგი — წარდგენა' : 'შემდეგი'}
            <Icon.arrow className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Trust / reassurance line — reinforces that the process is secure & human-vetted */}
      <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-ink-500">
        <Icon.shield className="w-3 h-3 text-brand-600 shrink-0" />
        <span className="text-center">მონაცემები დაცულია · ხელით მოდერაცია 48 სთ-ში · SSL დაშიფვრა</span>
      </div>
    </footer>
  )
}

/* ───── Status type (post-submission) ───── */
type Stage = 'submitted' | 'reviewing' | 'needs_info' | 'approved' | 'rejected'

/* ───── Status: Hero ───── */
const StatusHero = ({ stage, countdown }: { stage: Stage; countdown: { h: number; m: number } }) => {
  const meta: Record<Stage, { eyebrow: string; title: React.ReactNode; sub: string; tone: 'brand'|'warning'|'success'|'ink' }> = {
    submitted: { eyebrow: 'წარდგენილია · რიგში ვართ',          title: <>გადახედვა — <span className="text-brand-600">{countdown.h} სთ {countdown.m} წთ</span></>, sub: '5 ნაბიჯი დასრულდა. ჩვენი მოდერატორი ხელით კითხულობს — გადაცემული მონაცემები, ვიდეო-წარდგენა, რეფერენსები.', tone: 'brand' },
    reviewing: { eyebrow: 'მიმდინარეობს გადახედვა',              title: <>ნ. ხუროძე კითხულობს — <span className="text-brand-600">2 სთ-ში</span></>, sub: 'მოდერატორი წავიდა შენი პროფილის ფურცელზე. შესვლა — ხუთშაბათ-პარასკევს.', tone: 'brand' },
    needs_info:{ eyebrow: 'ინფო გვჭირდება',                       title: <>ერთი ცვლილება — <span className="text-warning-700">48 სთ-ში</span></>, sub: 'ნ. ხუროძემ ნახა შენი პროფილი — ერთი ცვლილება გვინდა. 48 სთ-ში თუ მოგვცემ, თავიდან ვიხილავთ.', tone: 'warning' },
    approved:  { eyebrow: 'მიგესალმებით — დადასტურდი ✓',         title: <>გიორგი, კეთილი იყოს — <span className="text-success-700">პროფილი ცოცხალია.</span></>, sub: 'პროფილი ცოცხალდა მცოდნე-ზე. პირველი 7 დღე — "ახალი" ბადგით.', tone: 'success' },
    rejected:  { eyebrow: 'სამწუხაროდ ვერ დადგა',                  title: <>ნ. ხუროძემ არ დაამტკიცა — <span className="text-ink-500">ვაცნობებთ მიზეზებს.</span></>, sub: 'ხელახლა შეგიძლია წარდგენა 30 დღის შემდეგ.', tone: 'ink' },
  }
  const m = meta[stage]
  const ring = m.tone === 'brand' ? 'ring-brand-500/15 bg-brand-500' : m.tone === 'warning' ? 'ring-warning-500/15 bg-warning-500' : m.tone === 'success' ? 'ring-success-500/15 bg-success-500' : 'ring-ink-500/15 bg-ink-500'
  return (
    <section className="bg-gradient-to-b from-brand-50/40 via-white to-white border-b border-ink-200">
      <div className="max-w-[1100px] mx-auto px-6 lg:px-8 py-12 lg:py-16 text-center">
        <div className={`w-20 h-20 mx-auto rounded-full ring-8 ${ring} text-white inline-flex items-center justify-center mb-5`}>
          {stage === 'approved' ? <Icon.check className="w-9 h-9" /> :
           stage === 'rejected' || stage === 'needs_info' ? <Icon.warn className="w-9 h-9" /> :
           <svg aria-hidden viewBox="0 0 24 24" className="w-9 h-9 animate-spin" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>}
        </div>
        <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-3">{m.eyebrow}</div>
        <h1 className="font-display text-[34px] sm:text-[42px] lg:text-[52px] font-bold text-ink-900 tracking-[-0.025em] leading-[1.05] max-w-[760px] mx-auto">{m.title}</h1>
        <p className="mt-5 text-[15px] text-ink-600 max-w-[600px] mx-auto leading-[1.55]">{m.sub}</p>
      </div>
    </section>
  )
}

/* ───── Status: Timeline ───── */
const StatusTimeline = ({ stage }: { stage: Stage }) => {
  const items = [
    { id: 'submit',   t: '32 წთ წინ',  l: 'წარდგენა მზადაა',     sub: '5 ნაბიჯი დასრულდა',                                 state: 'past'   as const },
    { id: 'auto',     t: '32 წთ წინ',  l: 'ავტო-სკორი (90/100)', sub: 'ვინაობა ✓ · ისტორია ✓ · ვიდეო ✓',                  state: 'past'   as const },
    { id: 'queue',    t: '30 წთ წინ',  l: 'მოდერატორის რიგში',   sub: 'საშუალო ლოდინი ბოლო 7 დღეში · 4 სთ',              state: (stage === 'submitted' ? 'active' : 'past') as 'active'|'past' },
    { id: 'review',   t: 'მოგვიანებით', l: 'ხელით გადახედვა',     sub: 'ნ. ხუროძე · ოპერაციული გუნდი',                     state: (stage === 'reviewing' || stage === 'needs_info' ? 'active' : stage === 'submitted' ? 'future' : 'past') as 'active'|'future'|'past' },
    { id: 'decision', t: 'მოგვიანებით', l: 'გადაწყვეტილება',      sub: 'დადასტურდი / დაიხურა / ინფო ვითხოვ',               state: (stage === 'approved' || stage === 'rejected' ? 'past' : 'future') as 'past'|'future' },
    { id: 'live',     t: 'მოგვიანებით', l: 'პროფილი ცოცხალია',    sub: 'პირველი 7 დღე — "ახალი" ბადგით',                   state: (stage === 'approved' ? 'past' : 'future') as 'past'|'future' },
  ]
  return (
    <section className="rounded-card border border-ink-200 bg-white p-6 lg:p-7">
      <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-500 mb-3">პროცესი</div>
      <h2 className="font-display text-[20px] font-bold text-ink-900 tracking-tight mb-5">6 ნაბიჯი · 4 საათამდე</h2>
      <ol className="relative space-y-4">
        <span className="absolute top-3 bottom-3 left-[14px] w-px bg-ink-200" aria-hidden />
        {items.map(s => (
          <li key={s.id} className="relative flex gap-4">
            <span className={`relative z-10 w-7 h-7 shrink-0 rounded-full inline-flex items-center justify-center border-2 ${
              s.state === 'past' ? 'bg-success-500 border-success-500 text-white' :
              s.state === 'active' ? 'bg-brand-500 border-brand-500 text-white ring-4 ring-brand-500/15' :
              'bg-white border-ink-300 text-ink-400'
            }`}>
              {s.state === 'past' ? <Icon.check className="w-3 h-3" /> :
               s.state === 'active' ? <svg aria-hidden viewBox="0 0 24 24" className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg> :
               <span className="w-1.5 h-1.5 rounded-full bg-ink-300" />}
            </span>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10.5px] tabular-nums text-ink-400">{s.t}</span>
                {s.state === 'active' && <span className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-brand-700">მიმდინარე</span>}
              </div>
              <div className={`mt-0.5 font-display text-[14px] font-bold tracking-tight ${s.state === 'future' ? 'text-ink-500' : 'text-ink-900'}`}>{s.l}</div>
              <div className="text-[12px] text-ink-600 mt-0.5">{s.sub}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/* ───── Status: Submitted summary ───── */
const StatusSummary = () => (
  <section className="rounded-card border border-ink-200 bg-white p-6 lg:p-7">
    <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
      <div>
        <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-500 mb-1">წარდგენილია</div>
        <h2 className="font-display text-[18px] font-bold text-ink-900 tracking-tight">გადახედე რა გაგზავნე</h2>
      </div>
      <button type="button" className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-[12px] inline-flex items-center gap-1.5">
        <Icon.edit className="w-3.5 h-3.5" /> შესწორება
      </button>
    </div>
    <div className="grid sm:grid-cols-2 gap-3">
      {[
        { l: 'სახელი',         v: 'გიორგი მელაძე · 12 წ. გამოცდილება', i: <Icon.shield className="w-3.5 h-3.5" /> },
        { l: 'სფერო',          v: 'ბიზნეს-სტრატეგია · org design',     i: <Icon.briefcase className="w-3.5 h-3.5" /> },
        { l: 'ფასი',           v: '₾80 / 60 წთ',        i: <Icon.wallet className="w-3.5 h-3.5" /> },
        { l: 'ენები',          v: 'ქართული C2 · English C2',           i: <Icon.globe className="w-3.5 h-3.5" /> },
        { l: 'ვიდეო წარდგენა', v: 'introduction.mp4 · 01:24',           i: <Icon.video className="w-3.5 h-3.5" /> },
        { l: 'სერტიფიკატი',    v: '3 ფაილი · McKinsey, Wharton, TBC',   i: <Icon.doc className="w-3.5 h-3.5" /> },
      ].map(b => (
        <div key={b.l} className="p-3.5 rounded-card border border-ink-200 bg-ink-50/40">
          <div className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500 inline-flex items-center gap-1.5">{b.i} {b.l}</div>
          <div className="mt-1 font-display text-[13.5px] font-bold text-ink-900 truncate">{b.v}</div>
        </div>
      ))}
    </div>
  </section>
)

/* ───── Status: SideRail ───── */
const StatusSideRail = ({ stage }: { stage: Stage }) => (
  <aside className="space-y-4">
    {stage === 'needs_info' && (
      <div className="rounded-card border border-warning-300 bg-warning-50/70 p-5">
        <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-warning-700 mb-2 inline-flex items-center gap-1.5">
          <Icon.warn className="w-3 h-3" /> ცვლილება გვინდა
        </div>
        <h3 className="font-display text-[14.5px] font-bold text-ink-900 mb-2">CV-ი 2024 წლის ვერსიაა — ახალი ატვირთე</h3>
        <p className="text-[12px] text-ink-700 leading-[1.55]">"გვინდა 2025-ის ვერსია, სადაც ნაჩვენებია ბოლო 12 თვის როლი." — <span className="font-display font-semibold">ნ. ხუროძე</span></p>
        <button type="button" className="mt-3 w-full h-9 rounded-btn bg-warning-600 hover:bg-warning-700 text-white font-display font-semibold text-[12px] inline-flex items-center justify-center gap-2"><Icon.upload className="w-3 h-3" /> ახალი CV-ის ატვირთვა</button>
        <div className="mt-2 text-center font-mono text-[10.5px] tabular-nums text-ink-500">48 სთ-ში — სხვა შემთხვევაში ცარიელდება</div>
      </div>
    )}
    {stage === 'approved' && (
      <div className="rounded-card bg-success-500 text-white p-5">
        <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-success-100 mb-2">დადასტურდი</div>
        <h3 className="font-display text-[18px] font-bold tracking-tight">გადადი შენს სივრცეში</h3>
        <p className="mt-1 text-[12.5px] text-white/85">პროფილი ცოცხალია, საკომისიო 15%, payout ყოველი ორ კვირაში.</p>
        <button type="button" className="mt-3 w-full h-10 rounded-btn bg-white text-success-700 hover:bg-success-50 font-display font-semibold text-[13px] inline-flex items-center justify-center gap-2">ჩემი სივრცე <Icon.arrow className="w-3.5 h-3.5" /></button>
      </div>
    )}
    <div className="rounded-card bg-white border border-ink-200 p-5">
      <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-500 mb-3">შენი მოდერატორი</div>
      {stage === 'submitted' ? (
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-ink-100 inline-flex items-center justify-center text-ink-500"><Icon.refresh className="w-4 h-4" /></span>
          <div><div className="font-display text-[13px] font-bold text-ink-900">რიგში ვართ</div><div className="text-[11.5px] text-ink-500">საშუალო — 30 წთ რიგში</div></div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <img src="https://i.pravatar.cc/96?img=44" alt="ნ. ხუროძე" className="w-10 h-10 rounded-full object-cover ring-1 ring-ink-200" />
          <div className="min-w-0 flex-1"><div className="font-display text-[13px] font-bold text-ink-900 truncate">ნ. ხუროძე</div><div className="text-[11.5px] text-ink-500 truncate">მცოდნე ოპერაციული გუნდი</div></div>
        </div>
      )}
    </div>
    <div className="rounded-card bg-white border border-ink-200 p-5">
      <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-500 mb-3">დახმარება</div>
      <div className="space-y-2">
        <a href="/contact" className="flex items-center gap-2.5 p-2.5 rounded-btn hover:bg-ink-50 transition-colors">
          <span className="w-7 h-7 rounded-btn bg-brand-50 text-brand-700 inline-flex items-center justify-center shrink-0"><Icon.chat className="w-3.5 h-3.5" /></span>
          <div className="min-w-0 flex-1"><div className="font-display text-[12.5px] font-semibold text-ink-900">დაწერე ჩვენ</div><div className="text-[10.5px] text-ink-500">~ 4 წთ პასუხი</div></div>
        </a>
        <a href="mailto:hi@mcodne.ge" className="flex items-center gap-2.5 p-2.5 rounded-btn hover:bg-ink-50 transition-colors">
          <span className="w-7 h-7 rounded-btn bg-ink-50 text-ink-700 inline-flex items-center justify-center shrink-0"><Icon.mail className="w-3.5 h-3.5" /></span>
          <div className="min-w-0 flex-1"><div className="font-display text-[12.5px] font-semibold text-ink-900">hi@mcodne.ge</div></div>
        </a>
      </div>
    </div>
  </aside>
)

/* ───── Draft persistence ─────
 *
 * localStorage-backed draft — restores the form on mount (only if <7 days
 * old), saves after every field change, and clears on successful submit or
 * once the flow reaches step 5.
 */
const APPLY_DRAFT_KEY = 'mcodne:apply-draft'
const APPLY_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

type ApplyDraftEnvelope = { form: FormState; savedAt: number }

function readApplyDraft(): FormState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(APPLY_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ApplyDraftEnvelope>
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.savedAt !== 'number') return null
    if (Date.now() - parsed.savedAt > APPLY_DRAFT_TTL_MS) return null
    if (!parsed.form || typeof parsed.form !== 'object') return null
    // Shape guard: merge over INITIAL_FORM so missing fields fall back to defaults.
    return { ...INITIAL_FORM, ...parsed.form } as FormState
  } catch {
    return null
  }
}

function writeApplyDraft(form: FormState) {
  if (typeof window === 'undefined') return
  try {
    const env: ApplyDraftEnvelope = { form, savedAt: Date.now() }
    window.localStorage.setItem(APPLY_DRAFT_KEY, JSON.stringify(env))
  } catch {
    // Storage full/disabled — silent no-op.
  }
}

function clearApplyDraft() {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(APPLY_DRAFT_KEY) } catch {}
}

/* ───── Page ───── */
export default function TutorApply() {
  const [submitted, setSubmitted] = useState(false)
  const [stage, setStage] = useState<Stage>('reviewing')
  const [step, setStep] = useState<StepId>(1)
  const [part, setPart] = useState<StepPart>(1)
  // Jumping via the progress nav always lands on a step's first screen; the
  // footer's back/next manage `part` themselves.
  const jumpToStep = (s: StepId) => { setStep(s); setPart(1) }
  const [completed, setCompleted] = useState<Set<StepId>>(new Set())
  const [countdown] = useState({ h: 3, m: 28 })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Email-verification state, detected up front via /api/me so an unverified
  // applicant is warned from step 1 — not blocked only at final submit.
  // null = unknown/loading (or signed-out), true/false = known.
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null)
  const [accountEmail, setAccountEmail] = useState('')
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  // Uploaded media — deliberately NOT persisted to the localStorage draft (base64
  // data URLs would exceed the quota); re-upload after a refresh is acceptable.
  const [media, setMedia] = useState<MediaState>({ certificates: [] })
  const setMediaPatch = (patch: Partial<MediaState>) => setMedia(m => ({ ...m, ...patch }))
  const [draftRestored, setDraftRestored] = useState(false)
  const [draftLoaded, setDraftLoaded] = useState(false)
  // Restore any recent draft on mount. Runs once client-side.
  useEffect(() => {
    const restored = readApplyDraft()
    if (restored) {
      // Merge over INITIAL_FORM so a draft saved before a field existed (e.g.
      // `languages`) doesn't leave it undefined and crash consumers.
      setForm({ ...INITIAL_FORM, ...restored })
      setDraftRestored(true)
    }
    setDraftLoaded(true)
  }, [])
  // Detect email-verification status up front. If the account exists but the
  // email isn't verified, we can warn from the first step instead of failing
  // only at submit. Signed-out users are handled by the 401 redirect on submit.
  useEffect(() => {
    let cancelled = false
    fetch('/api/me')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d?.user) {
          setEmailVerified(!!d.user.emailVerified)
          if (d.user.email) setAccountEmail(d.user.email)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  // Recovery action for the unverified banner — (re)send the code and hand the
  // user to the verify view, which returns here (?next=/apply) once verified.
  const requestEmailVerify = () => {
    const em = (accountEmail || form.email).trim().toLowerCase()
    if (em) {
      fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em, purpose: 'verify' }),
      }).catch(() => {})
    }
    window.location.href = `/signin?view=verify${em ? `&email=${encodeURIComponent(em)}&next=/apply` : ''}`
  }
  // Persist the merged form after each edit. `draftLoaded` guards against
  // clobbering a saved draft with the empty INITIAL_FORM before restore runs.
  const set = (patch: Partial<FormState>) => {
    setForm(f => {
      const next = { ...f, ...patch }
      if (draftLoaded) writeApplyDraft(next)
      return next
    })
    if (submitError) setSubmitError(null)
  }
  // If the user reaches / lands on the "submitted" step 5, drop the draft.
  useEffect(() => {
    if (step === 5) clearApplyDraft()
  }, [step])
  // Each screen change starts at the top — without this, advancing from a long
  // screen leaves the user mid-scroll on the next one, which reads as broken.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [step, part])

  const validate = (): string | null => {
    const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim()
    if (fullName.length < 2) return 'შეავსე სახელი და გვარი.'
    if (form.phone.replace(/\D/g, '').length < 6) return 'ტელეფონის ნომერი არასწორია.'
    const specialty = form.cats[0] || form.headline.trim()
    if (specialty.length < 2) return 'აირჩიე კატეგორია ან შეავსე პროფესია.'
    const years = Number(form.yearsExp)
    if (!Number.isInteger(years) || years < 0 || years > 80) return 'გამოცდილების წლები არასწორია.'
    const paidService = form.services.find(s => !s.free && s.price > 0)
    const rate = paidService?.price ?? 0
    if (rate < 10) return 'დაუმატე მინიმუმ ერთი ფასიანი სერვისი (ფასი ≥ ₾10).'
    if (rate > 5000) return 'ფასი მაქს. ₾5000.'
    if (form.motivation.trim().length < 150) return 'შესახებ ტექსტი მინ. 150 სიმბოლო უნდა იყოს.'
    return null
  }

  // Per-step gate — runs before advancing from a step, so users can't reach the
  // end with empty required fields. Only gates fields that exist on each step.
  const validateStep = (s: StepId, p: StepPart = 1): string | null => {
    if (s === 1) {
      if (`${form.firstName.trim()} ${form.lastName.trim()}`.trim().length < 2) return 'შეავსე სახელი და გვარი.'
      if (!isValidEmail(form.email)) return 'შეიყვანე სწორი ელფოსტა.'
      if (!isValidGeorgianPhone(form.phone)) return 'ტელეფონი ქართული ნომერი უნდა იყოს — მაგ. 5XX XX XX XX ან +995 5XX XX XX XX.'
      return null
    }
    if (s === 2) {
      if (p === 1) {
        if (form.cats.length < 1) return 'აირჩიე მინიმუმ ერთი კატეგორია.'
        if (form.headline.trim().length < 2) return 'შეავსე პროფესია (headline).'
        if (form.motivation.trim().length < 150) return 'შესახებ ტექსტი მინ. 150 სიმბოლო უნდა იყოს.'
        return null
      }
      // Part 2 — details. Years get gated here (not only at final submit).
      const years = Number(form.yearsExp)
      if (form.yearsExp.trim() !== '' && (!Number.isInteger(years) || years < 0 || years > 80)) return 'გამოცდილების წლები არასწორია.'
      return null
    }
    if (s === 3) {
      const v = form.introVideoUrl.trim()
      if (v && !extractYouTubeId(v)) return 'YouTube ვიდეოს ლინკი არასწორია. შეამოწმე ან ცარიელი დატოვე.'
      return null
    }
    if (s === 4) {
      if (p === 1) {
        const paidService = form.services.find(sv => !sv.free && sv.price > 0)
        const rate = paidService?.price ?? 0
        if (rate < 10) return 'დაუმატე მინიმუმ ერთი ფასიანი სერვისი (ფასი ≥ ₾10).'
        if (rate > 5000) return 'ფასი მაქს. ₾5000.'
        return null
      }
      // Part 2 — KYC lives on this screen, just before final submit.
      if (!form.dob.trim()) return 'მიუთითე დაბადების თარიღი.'
      const dob = new Date(form.dob)
      if (Number.isNaN(dob.getTime()) || dob.getTime() > Date.now()) return 'დაბადების თარიღი არასწორია.'
      return null
    }
    return null
  }

  const submitApplication = async () => {
    const err = validate()
    if (err) { setSubmitError(err); return }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const paidService = form.services.find(s => !s.free && s.price > 0)!
      const specialty = form.cats[0] || form.headline.trim().slice(0, 60)
      const body = {
        fullName: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
        phone: form.phone.trim(),
        city: form.city.trim() || undefined,
        specialty,
        yearsExp: Number(form.yearsExp),
        hourlyRate: paidService.price,
        motivation: form.motivation.trim(),
        linkedinUrl: form.linkedin.trim() || undefined,
        websiteUrl: form.website.trim() || undefined,
        introVideoUrl: form.introVideoUrl.trim() || undefined,
        // Languages are public info → fold into professionData (which the profile
        // may surface). Verification docs stay on their own admin-only fields.
        professionData: (() => {
          const pd: Record<string, any> = { ...form.professionData }
          if (form.languages.length) pd.languages = form.languages
          return Object.keys(pd).length ? pd : undefined
        })(),
        idDocUrl: media.idDocUrl || undefined,
        selfieUrl: media.selfieUrl || undefined,
        certificates: media.certificates.length ? media.certificates : undefined,
      }
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 401) {
        window.location.href = '/signin?redirect=/apply'
        return
      }
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || data?.ok === false) {
        const code = data?.error
        const msg =
          code === 'INVALID_VIDEO_URL' ? 'YouTube ვიდეოს ლინკი არასწორია. შეამოწმე ან ცარიელი დატოვე.' :
          code === 'INVALID' ? 'შეავსე ყველა აუცილებელი ველი.' :
          code === 'EMAIL_NOT_VERIFIED' ? 'დაადასტურე ელფოსტა /settings-ში, სანამ განაცხადს გააგზავნი.' :
          'განაცხადის გაგზავნა ვერ მოხერხდა. სცადე თავიდან.'
        setSubmitError(msg)
        return
      }
      setSubmitted(true)
      setStage('submitted')
      clearApplyDraft()
    } catch {
      setSubmitError('ქსელის შეცდომა. შეამოწმე კავშირი და სცადე თავიდან.')
    } finally {
      setSubmitting(false)
    }
  }

  const clearDraftAndReset = () => {
    clearApplyDraft()
    setForm(INITIAL_FORM)
    setDraftRestored(false)
    setStep(1)
    setCompleted(new Set())
  }

  if (submitted) {
    return (
      <div className="font-sans bg-ink-50/30 text-ink-900 antialiased min-h-[1100px]">
        <TopBar />
        <StatusHero stage={stage} countdown={countdown} />
        <main className="max-w-[1100px] mx-auto px-6 lg:px-8 py-10 lg:py-14 grid lg:grid-cols-[1fr_320px] gap-6">
          <div className="space-y-5 min-w-0">
            <StatusTimeline stage={stage} />
            <StatusSummary />
          </div>
          <StatusSideRail stage={stage} />
        </main>
      </div>
    )
  }

  return (
    <div className="font-sans bg-ink-50/50 text-ink-900 antialiased min-h-[1000px] flex flex-col">
      <TopBar />

      {/* Top horizontal progress (mobile + desktop) */}
      <div className="border-b border-ink-200 bg-white">
        <div className="max-w-[1240px] mx-auto px-6 lg:px-8 py-4">
          {/* Scarcity / vetting framing — sets a selective, prestigious tone */}
          <div className="lg:hidden flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-pill bg-brand-50 border border-brand-200 text-brand-700 font-display text-[9.5px] font-bold uppercase tracking-[0.16em]">
              <Icon.shield className="w-2.5 h-2.5" /> ხელით შემოწმებული ქსელი
            </span>
            <span className="text-[11px] text-ink-500 tabular-nums">ნაბიჯი {step} / 5</span>
          </div>
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => {
              const isDone = completed.has(s.id)
              const isActive = step === s.id
              return (
                <React.Fragment key={s.id}>
                  <button type="button" onClick={() => jumpToStep(s.id)} className="group flex items-center gap-2 min-h-[44px]">
                    <span className={`w-9 h-9 sm:w-7 sm:h-7 shrink-0 rounded-full inline-flex items-center justify-center font-display text-[13px] sm:text-[11px] font-bold tabular-nums transition-all duration-fast ${
                      isDone ? 'bg-brand-500 text-white shadow-xs' :
                      isActive ? 'bg-brand-500 text-white ring-4 ring-brand-500/15 shadow-sm' :
                      'bg-white border-2 border-ink-200 text-ink-400 group-hover:border-ink-300'
                    }`}>
                      {isDone ? <Icon.check className="w-4 h-4 sm:w-3.5 sm:h-3.5" /> : s.id}
                    </span>
                    <span className={`hidden lg:inline font-display text-[12px] font-semibold tracking-tight transition-colors ${isActive ? 'text-brand-800' : isDone ? 'text-ink-900' : 'text-ink-500'}`}>{s.l}</span>
                  </button>
                  {i < STEPS.length - 1 && <span className={`flex-1 h-[3px] rounded-full transition-colors duration-fast ${isDone ? 'bg-brand-400' : 'bg-ink-100'}`} />}
                </React.Fragment>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-[1240px] mx-auto w-full flex">
        <ProgressNav step={step} setStep={jumpToStep} completed={completed} />

        <main className="flex-1 min-w-0 px-6 lg:px-8 py-8 lg:py-10">
          <div className="max-w-[720px]">
            {draftRestored && (
              <div
                role="status"
                aria-live="polite"
                className="mb-4 rounded-card border border-brand-200 bg-brand-50 text-brand-900 px-4 py-2.5 flex items-center gap-3 motion-safe:transition-opacity"
              >
                <span className="font-display text-[12.5px] font-semibold tracking-tight">
                  ნახევრადი შეტანა აღდგა
                </span>
                <button
                  type="button"
                  onClick={clearDraftAndReset}
                  className="ml-auto h-8 px-3 rounded-btn bg-white border border-brand-200 hover:border-brand-300 text-brand-700 hover:text-brand-800 font-display font-semibold text-[11.5px] tracking-wide inline-flex items-center motion-safe:transition-colors"
                >
                  დაწყე თავიდან
                </button>
                <button
                  type="button"
                  onClick={() => setDraftRestored(false)}
                  aria-label="დახურვა"
                  className="w-7 h-7 rounded-full text-brand-700 hover:bg-brand-100 inline-flex items-center justify-center motion-safe:transition-colors"
                >
                  <Icon.x className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {emailVerified === false && (
              <div role="alert" className="mb-4 rounded-card border border-warning-300 bg-warning-50 px-4 py-3 flex items-start gap-3">
                <Icon.warn className="w-4 h-4 text-warning-700 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[12.5px] font-bold text-warning-900">ელფოსტა ჯერ არ არის დადასტურებული</div>
                  <p className="text-[11.5px] text-warning-800 mt-0.5 leading-[1.5]">
                    წარდგენამდე უნდა დაადასტურო ელფოსტა{accountEmail ? <> — <span className="font-display font-semibold break-all">{accountEmail}</span></> : ''}. კოდს ახლავე გამოგიგზავნით — დაასრულე ახლა, რომ ბოლოს არ შეგაჩეროს.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={requestEmailVerify}
                  className="shrink-0 h-8 px-3 rounded-btn bg-warning-600 hover:bg-warning-700 text-white font-display font-semibold text-[11.5px] tracking-wide inline-flex items-center transition-colors"
                >
                  დადასტურება
                </button>
              </div>
            )}
            {step === 1 && <Step1 form={form} set={set} />}
            {step === 2 && <Step2 form={form} set={set} part={part} />}
            {step === 3 && <Step3 form={form} set={set} media={media} setMedia={setMediaPatch} />}
            {step === 4 && <Step4 form={form} set={set} media={media} setMedia={setMediaPatch} part={part} />}
            {step === 5 && <Step5 email={form.email} />}

            {submitError && (
              <div role="alert" className="mt-3 rounded-btn border border-danger-200 bg-danger-50 text-danger-800 px-3 py-2 text-[12.5px] font-medium leading-[1.45] break-words">
                {submitError}
              </div>
            )}

            <FormFooter step={step} setStep={setStep} part={part} setPart={setPart} completed={completed} setCompleted={setCompleted} onSubmit={submitApplication} submitting={submitting} validateStep={validateStep} onError={setSubmitError} />
          </div>
        </main>

        <LivePreview step={step} form={form} />
      </div>
    </div>
  )
}



'use client'
import React, { useState, useEffect, useRef } from 'react'
import { langLabel, normalizeLangs } from '@/lib/languages'
import { LanguagePicker } from '@/components/LanguagePicker'
import Link from 'next/link'
import { Container } from '@/components/Container'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { PriceField } from '@/components/PriceField'
import { Illustration } from '@/components/Illustration'
import { PublicTopBar } from '@/components/PublicTopBar'
import { Footer } from '@/components/Footer'
import { useAvatarCropper } from '@/components/AvatarCropper'
import { HEADLINE_MAX } from '@/lib/headline'

/* Chrome: the bespoke local TopBar (logo + „დახურვა" ✕) is gone — /apply now
 * mounts the SHARED <PublicTopBar activeHref="/apply" /> + <Footer />, so the
 * header doesn't swap out and the footer doesn't vanish when a visitor taps
 * „გახდი ექსპერტი". The ✕ escape hatch isn't missed: the shared header carries
 * the full site nav (and the logo → home). PublicTopBar is h-16 sm:h-20 — the
 * sticky rails below use `top-20`, since both only render at lg+/xl+. */

/* ───── Steps ───── */
/* Onboarding was 5 steps (6 screens) asking for phone, city, languages, years,
 * LinkedIn, website, an intro video, certificates AND a per-profession block
 * (bar-licence number, licence ID, AUM, ROAS, exit count, GitHub…). Those
 * profession fields were technically optional, but a field labelled „Bar
 * ლიცენზიის ნომერი" reads as a REQUIREMENT and turned applicants away.
 *
 * It is now 2 screens: who you are + what you charge. Everything else moved to
 * the profile editor (app/tutor/profile), which the expert reaches AFTER being
 * approved — at which point they are invested and will actually fill it in.
 * Nothing was deleted from the product; it was re-sequenced.
 *
 * ONE thing came back (2026-07-29) without growing the screen count: an OPTIONAL
 * diploma/certificate attachment, on the existing review step. It is not the
 * hostile half of the old block — there is no profession-specific label and no
 * licence NUMBER to type — and it is the only material a moderator can actually
 * verify, which is what lets the review copy make any verification claim at all.
 * See MAX_CERTS / CertificateUploader below. */
/* TWO screens since 2026-08-07 (owner's call), not three.
 *
 * The third step was „გაგზავნა": a review header, an optional diploma
 * uploader, two optional link fields and an info box — then the button. None of
 * it was work the applicant had to do; it was a screen standing between them
 * and finishing, and every screen on this form loses people. What was real (the
 * attachment, the links) moved onto step 1 as COLLAPSED optional blocks, so the
 * page no longer looks like homework, and „გაგზავნა" now lives at the bottom of
 * step 2 where the last decision (price, availability) is made. */
type StepId = 1 | 2
/* One word per step, no second line (2026-08-05, owner's call).
 *
 * Each step used to carry a description under its name — „სახელი, სფერო,
 * აღწერა" and so on. A progress rail answers one question: where am I. The
 * screen beside it already says what to fill in, and a rail that explains the
 * form is a second form to read. */
const STEPS: { id: StepId; l: string; icon: any }[] = [
  { id: 1, l: 'პროფილი', icon: Icon.user },
  { id: 2, l: 'ფასი და დრო', icon: Icon.wallet },
]

/* ───── Progress sidebar ───── */
const ProgressNav = ({ step, setStep, completed }: { step: StepId; setStep: (s: StepId) => void; completed: Set<StepId> }) => {
  return (
    <aside className="hidden lg:flex flex-col w-[260px] shrink-0 border-r border-ink-200 bg-white p-6 sticky top-20 self-start lg:h-[836px]">
      <Eyebrow tone="muted" className="mb-2">ნაბიჯი {step} / 2</Eyebrow>
      <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight leading-tight mb-1">გახდი ექსპერტი მცოდნეზე</h2>
      <p className="text-small text-ink-600 mb-5">ყველა განაცხადს <span className="font-display font-bold text-ink-900">ადამიანი</span> კითხულობს.</p>

      {/* Vertical progress */}
      <ol className="relative space-y-1">
        <span className="absolute left-[18px] top-3 bottom-3 w-px bg-ink-200" aria-hidden />
        {STEPS.map(s => {
          const isDone = completed.has(s.id)
          const isActive = step === s.id
          const Ic = s.icon
          /* BACKWARDS ALWAYS, FORWARDS ONLY INTO A FINISHED STEP.
           *
           * This used to jump anywhere. A real applicant (08-03, again 08-05)
           * stalled on step 2 and, in his own account of it, came away thinking
           * the application demanded diploma verification — text that lives on
           * step 3 and describes an OPTIONAL attachment. Reading a later step
           * out of order is how an optional thing becomes a wall, and the panel
           * cannot see it happen. Going back to re-read or edit is different:
           * that is the applicant's own work, and it stays open. */
          const reachable = isDone || isActive || s.id < step
          return (
            <li key={s.id}>
              <button
                type="button"
                disabled={!reachable}
                aria-disabled={!reachable}
                title={reachable ? undefined : 'ჯერ დაასრულე მიმდინარე ნაბიჯი'}
                onClick={() => { if (reachable) setStep(s.id) }}
                // items-center, not items-start: with the second line gone the label
                // is a single row and must sit level with its circle.
                className={`group relative w-full flex items-center gap-3 p-2.5 -ml-2 rounded-card transition-colors duration-fast ${
                  isActive ? 'bg-brand-50/60' : reachable ? 'hover:bg-ink-50' : 'cursor-not-allowed'
                }`}
              >
                <span className={`relative z-10 w-9 h-9 shrink-0 rounded-full inline-flex items-center justify-center transition-all duration-fast ${
                  isDone ? 'bg-brand-600 text-white shadow-xs' :
                  isActive ? 'bg-brand-600 text-white ring-4 ring-brand-500/15 shadow-sm' :
                  'bg-white border-2 border-ink-200 text-ink-400 group-hover:border-ink-300'
                }`}>
                  {isDone ? <Icon.check className="w-4 h-4" /> : <Ic className="w-4 h-4" />}
                </span>
                <div className="min-w-0 flex-1 text-left">
                  <div className={`font-display text-body font-bold tracking-tight ${isActive ? 'text-brand-800' : isDone ? 'text-ink-900' : 'text-ink-700'}`}>{s.l}</div>
                </div>
              </button>
            </li>
          )
        })}
      </ol>

      {/* Help block */}
      <div className="mt-6 pt-5 border-t border-ink-100">
        <Eyebrow tone="muted" className="mb-2">დახმარება</Eyebrow>
        <p className="text-meta text-ink-600 leading-[1.5]">კითხვა თუ გაგიჩნდა, მოგვწერე — გიპასუხებთ.</p>
        <a href="/contact" className="mt-3 h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast">
          დაგვიკავშირდი
        </a>
      </div>
    </aside>
  )
}

/* ───── Step layout shell ───── */
/* The eyebrow („შენ და შენი სფერო · ნაბიჯი 1 / 3") was removed 2026-08-05
 * (owner's call). It named the step a third time — the progress sidebar and the
 * mobile header both already carry the name and the counter — and it sat
 * directly above a title that says the same thing in a full sentence. */
const StepHeader = ({ title, sub }: { title: string; sub: string }) => (
  <div className="mb-6">
    <h1 className="font-display text-h1 lg:text-display font-bold text-ink-900 tracking-tight leading-[1.1] motion-safe:animate-rise-in">{title}</h1>
    <p className="mt-2 text-body text-ink-600 max-w-[560px]">{sub}</p>
  </div>
)

/**
 * A card. `fields` are the `data-field` anchors it contains — when the failing
 * one is inside, THE WHOLE CARD turns red (owner's call 2026-08-07). A hairline
 * under one input is easy to scroll past on a phone; a red card is not, and it
 * survives the fact that some controls in here (the sphere chips, the photo
 * tile, the services block) are not inputs at all and cannot show a field ring.
 */
const FormSection = ({ title, sub, required, fields, children }: {
  title: string; sub?: string; required?: boolean; fields?: string[]; children: React.ReactNode
}) => {
  const err = React.useContext(ApplyErrCtx)
  const invalid = !!err && !!fields?.includes(err.field)
  return (
    <section
      aria-invalid={invalid || undefined}
      className={`rounded-card border shadow-xs p-6 mb-4 transition-[box-shadow,border-color,background-color] duration-fast ${
        invalid
          ? 'border-danger-300 bg-danger-50/40 shadow-sm'
          : 'border-ink-200 bg-white hover:shadow-sm'
      }`}
    >
      <div className="mb-4">
        <h2 className="font-display text-body-lg font-bold text-ink-900 tracking-tight">
          {title}
          {required && <span className="text-danger-500 ml-1" title="სავალდებულო">*</span>}
        </h2>
        {sub && <p className="mt-1 text-meta text-ink-600 leading-[1.5]">{sub}</p>}
      </div>
      {children}
    </section>
  )
}

/**
 * An OPTIONAL block, closed by default (owner's call 2026-08-07: „რაც
 * სავალდებულო არაა … ასაკეცი იყოს"). Everything required stays open and
 * unavoidable; the extras stop making the form look long. It opens itself if
 * the failing field is inside — an error must never hide behind a closed lid.
 */
const Collapsible = ({ title, sub, fields, children }: {
  title: string; sub?: string; fields?: string[]; children: React.ReactNode
}) => {
  const err = React.useContext(ApplyErrCtx)
  const forced = !!err && !!fields?.includes(err.field)
  const [open, setOpen] = useState(false)
  const shown = open || forced
  return (
    <section className={`rounded-card border shadow-xs mb-4 overflow-hidden ${forced ? 'border-danger-300 bg-danger-50/40' : 'border-ink-200 bg-white'}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={shown}
        className="w-full min-h-[64px] px-6 py-4 flex items-start gap-3 text-left hover:bg-ink-50/60 transition-colors duration-fast"
      >
        {/* Two ROWS, not three columns. At 390px a title + a pill + a chevron on
            one line left the title ~130px wide and „ბმულები და დოკუმენტი"
            wrapped to three lines beside an empty pill. */}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-display text-body-lg font-bold text-ink-900 tracking-tight">{title}</span>
            <span className="h-5 px-2 rounded-pill border border-ink-200 text-ink-500 font-display text-micro font-bold uppercase inline-flex items-center">
              არასავალდებულო
            </span>
          </span>
          {sub && <span className="block mt-1 text-meta text-ink-600 leading-[1.5]">{sub}</span>}
        </span>
        <Icon.chevR aria-hidden className={`shrink-0 mt-1 w-4 h-4 text-ink-400 transition-transform duration-fast ${shown ? 'rotate-90' : ''}`} />
      </button>
      {shown && <div className="px-6 pb-6">{children}</div>}
    </section>
  )
}

/* ───── Where an error is SAID ─────
 *
 * A single red box at the bottom of the form (which is all this had) tells the
 * applicant that something is wrong, then makes them find it. The box stays —
 * it sits directly above „შემდეგი", which is where the eye already is — but the
 * sentence must ALSO appear under the control that refused, because that is
 * where the applicant will be after the jump.
 *
 * Context rather than props: `Field` is used ~15 times across three step
 * components, and threading an error object through every one of them is how
 * the next field gets added without one. */
type ApplyErr = { field: string; msg: string } | null
const ApplyErrCtx = React.createContext<ApplyErr>(null)

/** The message under the offending control. Renders nothing for every other field. */
const FieldError = ({ name }: { name: string }) => {
  const err = React.useContext(ApplyErrCtx)
  if (!err || err.field !== name) return null
  return (
    <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-meta font-medium text-danger-700 leading-[1.45]">
      <Icon.warn aria-hidden className="w-3.5 h-3.5 shrink-0 mt-px" />
      <span>{err.msg}</span>
    </p>
  )
}

/** True while `name` is the field the last validation failure named. */
const useFieldInvalid = (name?: string) => {
  const err = React.useContext(ApplyErrCtx)
  return !!name && err?.field === name
}

const Field = ({ l, sub, required, name, children }: { l: string; sub?: string; required?: boolean; name?: string; children: React.ReactNode }) => {
  const invalid = useFieldInvalid(name)
  return (
    <label className="block">
      <Eyebrow as="span" tone="muted" className="block mb-1.5">{l}{required && <span className="text-danger-500 ml-0.5" aria-hidden>*</span>}</Eyebrow>
      {/* The border is repainted from the wrapper so the invalid state costs
          nothing at ~15 call sites (and `Input` keeps its single className). */}
      <span className={invalid ? 'block [&_input]:border-danger-400 [&_textarea]:border-danger-400' : 'block'}>{children}</span>
      {/* The hint yields to the error: two lines under one input, one saying
          „fill this in like so" and one saying „this is wrong", is noise. */}
      {sub && !invalid && <span className="block mt-1.5 text-meta text-ink-500 leading-[1.4]">{sub}</span>}
      {name && <FieldError name={name} />}
    </label>
  )
}

const Input = (p: any) => <input {...p} className={`w-full h-11 px-3.5 rounded-field border border-ink-200 bg-white text-body text-ink-900 placeholder:text-ink-400 hover:border-ink-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-[border-color,box-shadow] duration-fast ${p.className || ''}`} />

/* ───── Upload plumbing ───── */
// Media captured during apply. Kept OUT of the localStorage draft (base64 data
// URLs would blow the ~5MB quota) — merged into the submit body directly.
type MediaState = {
  idDocUrl?: string
  selfieUrl?: string
  photoUrl?: string
  certificates: { title: string; issuer?: string; url: string }[]
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
  // Each message says what will actually make the error go away; the accepted
  // formats are listed next to every picker, so BAD_TYPE points at them rather
  // than naming a list that differs per upload kind (avatar vs certificate).
  return code === 'TOO_LARGE' ? 'ფაილი ძალიან დიდია — ატვირთე უფრო მცირე ზომის'
    : code === 'BAD_TYPE' || code === 'BAD_CONTENT' ? 'ეს ფორმატი არ იტვირთება — იხილე დაშვებული ფორმატები ღილაკის გვერდით'
    : code === 'RATE_LIMITED' ? 'ბევრი ატვირთვა — დაელოდე ერთ წუთს და სცადე თავიდან'
    : 'ატვირთვა ვერ მოხერხდა — სცადე თავიდან'
}

const isImg = (u?: string) => !!u && (/^data:image\//.test(u) || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u))

/* ───── Optional credential attachment — policy + pure helpers ─────
 *
 * The 2026-07-28 cut removed the whole per-profession block (Bar licence
 * number, AUM, ROAS, GitHub…) because a field labelled „Bar ლიცენზიის ნომერი"
 * reads as a REQUIREMENT. That stays removed. What came back with it — and
 * should not have — is the plain „attach a diploma if you have one" uploader:
 * an optional file deters nobody, and it is the ONLY material a moderator can
 * actually check (name + sphere + one sentence + a price cannot be verified).
 *
 * OPTIONAL BY CONSTRUCTION: nothing in validate() / validateStep() reads
 * media.certificates, a failed upload only shows a message, and the submit body
 * simply omits the field when nothing is attached. Pinned by
 * tests/apply-certificates.test.ts.
 *
 * The cap is small on purpose: 3 is „a diploma, a licence and one certificate",
 * not a portfolio dump. Files ride the submit body as base64 data URLs, so the
 * bound is also what keeps the payload sane. */
export const MAX_CERTS = 3

/** How many more files the picker may accept. Never negative. */
export function certSlotsLeft(attached: number, max: number = MAX_CERTS): number {
  return Math.max(0, max - Math.max(0, attached))
}

/** Trim a multi-file pick to the free slots; `dropped` drives the honest „მაქსიმუმ N ფაილი" note. */
export function takeCertFiles<T>(attached: number, picked: readonly T[], max: number = MAX_CERTS): { accepted: T[]; dropped: number } {
  const accepted = picked.slice(0, certSlotsLeft(attached, max))
  return { accepted, dropped: picked.length - accepted.length }
}

/** The `certificates` field of the submit body — `undefined` when nothing usable
 *  is attached, which is exactly how the API reads „no documents". */
export function certificatesPayload(
  certs: { title: string; issuer?: string; url: string }[],
  max: number = MAX_CERTS,
): { title: string; issuer?: string; url: string }[] | undefined {
  const clean = (Array.isArray(certs) ? certs : [])
    .filter(c => typeof c?.url === 'string' && c.url.trim().length > 0)
    .slice(0, max)
    .map(c => {
      // `issuer` was collected by the uploader, accepted by the API schema and
      // read by approval — and dropped HERE, so every applicant's answer was
      // discarded silently and the profile fell back to an empty issuer.
      const issuer = (c.issuer || '').trim().slice(0, 200)
      return {
        title: (c.title || '').trim().slice(0, 200) || 'დოკუმენტი',
        ...(issuer ? { issuer } : {}),
        url: c.url,
      }
    })
  return clean.length ? clean : undefined
}

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
        className={`w-full p-6 rounded-card border border-dashed text-center transition-colors duration-fast ${value ? 'border-success-300 bg-success-50/40' : 'border-ink-300 hover:border-brand-400 hover:bg-brand-50/30'} disabled:opacity-60`}
      >
        {value && isImg(value) ? (
          <img src={value} alt="" className="w-16 h-16 rounded-btn object-cover mx-auto mb-2 ring-1 ring-ink-200" />
        ) : value ? (
          <div className="w-16 h-10 rounded-btn bg-white border border-ink-200 text-ink-700 font-display text-meta font-bold inline-flex items-center justify-center mx-auto mb-2">PDF</div>
        ) : (
          <div className="mb-2">{icon}</div>
        )}
        <div className="font-display text-small font-semibold text-ink-900">{busy ? 'იტვირთება…' : value ? '✓ ატვირთულია — შეცვლა' : label}</div>
        {!value && <div className="text-meta text-ink-500 mt-0.5">{hint}</div>}
      </button>
      {/* `.tap-area`, not a bigger box: the remove button floats over the file
          preview, and a 40px disc would cover the thing it lets you remove. The
          utility hangs an invisible ≥40px target over the 32px visual — see
          globals.css. */}
      {value && !busy && (
        <button type="button" onClick={() => onChange(undefined)} aria-label="ფაილის მოხსნა" className="tap-area absolute top-2 right-2 w-8 h-8 rounded-full bg-white border border-ink-200 text-ink-500 hover:text-danger-700 hover:border-danger-200 inline-flex items-center justify-center transition-colors duration-fast">
          <Icon.x className="w-4 h-4" />
        </button>
      )}
      {err && <p className="mt-1.5 text-meta text-danger-700">{err}</p>}
      {/* idDoc/selfie are image-only server-side (kind → ALLOWED_IMG). */}
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFile} />
    </div>
  )
}

/* Round profile-photo picker — uploads as `avatar` (sets user.avatarUrl).
   Framing goes through the shared cropper so the stored square always follows
   the same rule here, on the expert profile and on the student profile. */
const PhotoUploader = ({ value, onChange }: { value?: string; onChange: (url?: string) => void }) => {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const { open: pickPhoto, ui: cropperUi } = useAvatarCropper({
    onCropped: async f => {
      setBusy(true); setErr(null)
      const r = await uploadToApi('avatar', f)
      setBusy(false)
      if (!r.ok) { setErr(uploadErrMsg(r.code)); return }
      onChange(r.url)
    },
  })
  return (
    <div className="flex items-center gap-5">
      {value
        ? <img src={value} alt="" className="w-24 h-24 rounded-full object-cover ring-2 ring-ink-200 shrink-0" />
        : <div className="w-24 h-24 rounded-full bg-ink-100 ring-2 ring-ink-200 shrink-0 inline-flex items-center justify-center text-ink-400"><Icon.user className="w-9 h-9" /></div>}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <button type="button" onClick={pickPhoto} disabled={busy} className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-small inline-flex items-center gap-1.5 transition-colors duration-fast disabled:opacity-60">
            <Icon.upload className="w-3.5 h-3.5" /> {busy ? 'იტვირთება…' : value ? 'შეცვლა' : 'ატვირთვა'}
          </button>
          {value && <button type="button" onClick={() => onChange(undefined)} className="h-11 px-3 rounded-btn text-ink-500 hover:text-danger-700 font-display font-semibold text-meta transition-colors duration-fast">წაშლა</button>}
        </div>
        {/* „მინ. 256×256" was dropped from the hint: nothing enforces a minimum
            resolution, and 8MB is the one limit the server actually applies. */}
        {err
          ? <p className="mt-2 text-meta text-danger-700">{err}</p>
          : <p className="mt-2 text-meta text-ink-500 leading-[1.5]">JPG, PNG ან WebP · მაქსიმუმ 8MB.</p>}
        <p className="mt-1 text-meta text-ink-500 leading-[1.5]">აირჩიე ფოტო, სადაც სახე კარგად ჩანს — სუფთა ფონი და კარგი განათება.</p>
      </div>
      {/* Hidden file input + crop dialog. The „ატვირთვა" button calls pickPhoto;
          the upload only runs after the crop is confirmed. */}
      {cropperUi}
    </div>
  )
}

/* Optional diploma / certificate / licence attachment. Lives on the LAST step —
   the person is already committed there, so it can't read as a first-contact
   requirement. Reuses the existing upload path (`kind=certificate`: PDF/JPG/PNG,
   magic-byte sniffed server-side) and writes straight into media.certificates,
   which the submit body already carries. */
const CertificateUploader = ({ items, onChange }: {
  items: { title: string; issuer?: string; url: string }[]
  onChange: (next: { title: string; issuer?: string; url: string }[]) => void
}) => {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const left = certSlotsLeft(items.length)

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files ? Array.from(e.target.files) : []
    e.target.value = '' // allow re-selecting the same file
    if (!picked.length) return
    const { accepted, dropped } = takeCertFiles(items.length, picked)
    setBusy(true); setNote(null)
    const added: { title: string; issuer?: string; url: string }[] = []
    let firstErr: string | null = null
    // Sequential on purpose: uploads are base64-in-DB and rate-limited (20/min).
    for (const f of accepted) {
      const r = await uploadToApi('certificate', f)
      // Default title = the file name WITHOUT its extension. The raw name went
      // straight through before, so public profiles ended up advertising
      // „IMG_2763.jpeg" as a diploma. The expert renames it in the row below.
      if (r.ok) {
        const raw = (r.fileName || f.name || 'დოკუმენტი').replace(/\.[a-z0-9]{2,5}$/i, '').trim()
        added.push({ title: (raw || 'დოკუმენტი').slice(0, 200), issuer: '', url: r.url })
      }
      else if (!firstErr) firstErr = uploadErrMsg(r.code)
    }
    setBusy(false)
    if (added.length) onChange([...items, ...added])
    // Never silent: a failed upload says so, and so does a pick over the cap.
    setNote(firstErr ?? (dropped > 0 ? `მაქსიმუმ ${MAX_CERTS} ფაილი — დანარჩენი არ დაემატა.` : null))
  }

  return (
    <div>
      {items.length > 0 && (
        <ul className="space-y-2 mb-3">
          {/* Each file gets a NAME and an ISSUER. Both were previously
              un-askable, so the public profile showed the raw file name and a
              placeholder issuer — the section was unusable to a visitor and
              embarrassing to the expert. Two fields, both optional-feeling,
              filled in the moment the file lands. */}
          {items.map((c, i) => {
            const patch = (next: Partial<{ title: string; issuer: string }>) =>
              onChange(items.map((it, idx) => (idx === i ? { ...it, ...next } : it)))
            return (
              <li key={i} className="rounded-btn border border-ink-200 bg-white p-3">
                <div className="flex items-center gap-2.5">
                  <Icon.doc className="w-4 h-4 text-ink-500 shrink-0" />
                  <span className="min-w-0 flex-1 text-meta text-ink-500 truncate">ატვირთულია</span>
                  <button
                    type="button"
                    onClick={() => { setNote(null); onChange(items.filter((_, idx) => idx !== i)) }}
                    aria-label="ფაილის მოხსნა"
                    className="w-10 h-10 shrink-0 -my-2 rounded-full text-ink-500 hover:text-danger-700 inline-flex items-center justify-center transition-colors duration-fast"
                  >
                    <Icon.x className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 gap-2 mt-2">
                  <Input
                    value={c.title}
                    onChange={(e: any) => patch({ title: e.target.value.slice(0, 200) })}
                    placeholder="რა დოკუმენტია — მაგ. ბაკალავრის დიპლომი"
                    className="!h-10 !text-small"
                  />
                  <Input
                    value={c.issuer ?? ''}
                    onChange={(e: any) => patch({ issuer: e.target.value.slice(0, 200) })}
                    placeholder="ვინ გასცა (არასავალდებულო)"
                    className="!h-10 !text-small"
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy || left === 0}
          aria-busy={busy}
          className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 disabled:opacity-60 text-ink-800 font-display font-semibold text-small inline-flex items-center gap-1.5 transition-colors duration-fast"
        >
          <Icon.paperclip className="w-4 h-4" />
          {busy ? 'იტვირთება…' : items.length ? 'კიდევ ერთის დამატება' : 'ფაილის დამატება'}
        </button>
        <span className="text-meta text-ink-500">
          {left === 0 ? `დაემატა მაქსიმუმი — ${MAX_CERTS} ფაილი.` : `PDF, JPG ან PNG · კიდევ ${left} ფაილის დამატება შეგიძლია.`}
        </span>
      </div>

      {note && <p role="status" aria-live="polite" className="mt-2 text-meta text-danger-700">{note}</p>}

      <input
        ref={ref}
        type="file"
        multiple
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onFiles}
      />
    </div>
  )
}

import { APPLY_FUNNEL_EVENTS, newApplyFlowId, trackApply } from './applyFunnelEvents'
import { checkGeorgian, georgianError } from '@/lib/georgianText'
// ONE source for every bound and every message — the API imports the same
// functions. See lib/applyValidation.ts for why this file exists.
import {
  APPLY, bioError, nameError, phoneError, priceError, specialtyError, urlError, videoError, yearsError,
} from '@/lib/applyValidation'

/* ───── Form State ───── */

type FormState = {
  firstName: string; lastName: string; email: string; phone: string
  cats: string[]; headline: string; motivation: string; city: string; yearsExp: string; linkedin: string; website: string
  introVideoUrl: string
  languages: string[]
  services: { name: string; dur: number; price: number; free: boolean; desc: string }[]
  /** Weekly availability, published on approval. Mon=0 … Sun=6. */
  avail: { days: boolean[]; startHour: number; endHour: number }
  professionData: Record<string, any>
}

/** Mon=0 … Sun=6 — the same convention as the schedule grid and the bulk API. */
const DAY_LABELS = ['ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ', 'კვი']
/** FULL TIME, pre-filled. See <AvailabilityPicker> for the reasoning. */
const DEFAULT_AVAIL = { days: [true, true, true, true, true, false, false], startHour: 10, endHour: 18 }
/** How far ahead approval opens the calendar. */
export const AVAIL_WEEKS = 8
/* The free 15-minute intro, defined ONCE. It is a toggle on step 2 (see
 * `toggleFree`), so the form has to be able to rebuild it after it is switched
 * off — which is exactly what it could not do while this object existed only
 * as a literal inside INITIAL_FORM. */
export const FREE_INTRO: FormState['services'][number] = {
  name: 'გაცნობითი შეხვედრა',
  dur: 15,
  price: 0,
  free: true,
  desc: 'გაესაუბრე ექსპერტს მოკლედ და დარწმუნდი, რომ სწორ სპეციალისტს ირჩევ.',
}

const INITIAL_FORM: FormState = {
  firstName: '', lastName: '', email: '', phone: '',
  cats: [], headline: '', motivation: '', city: '', yearsExp: '', linkedin: '', website: '',
  introVideoUrl: '',
  languages: ['ქართული'],
  services: [
    // ONE paid hour is the product. Three pre-filled paid services made this
    // screen read as homework and pushed the expert to price a catalogue before
    // they had a single client. The second row is a FREE 15-min intro: optional,
    // and the honest way for a new expert to earn their first booking — so it
    // ships pre-filled but free, not as another price to think about.
    // COPY PATTERN, from how Georgian service sites actually write (researched
    // 2026-07-31: ekimo.ge, tnet.ge, mindflow.ge, tbcbank.ge). Their service
    // cards are: a NOUN PHRASE that names the service, then ONE imperative
    // sentence addressed to the user carrying a concrete benefit —
    // „სატელეფონო კონსულტაცია / გაესაუბრე ექიმს დისტანციურად, სახლიდან ან
    // სამსახურიდან გაუსვლელად და დაზოგე დრო". Never the provider speaking in
    // the first person, never a dash-joke. The line this replaced („გაიგებ,
    // ერთმანეთს თუ შეეფერებით", then „შენს საკითხს ვიღებ თუ არა") did both.
    // PRICE STARTS EMPTY, not at 80 — measured 2026-08-02: 10 of 19 live
    // profiles carry exactly ₾80, the number this field used to pre-fill, and
    // 11 of the paid services do too. That is not a market forming a price, it
    // is a form being accepted. A pre-filled number is an anchor, and half the
    // roster never argued with it — which also priced the budget end of the
    // market out of existence before it could appear. Zero renders as an empty
    // input (see PriceField), so the expert has to make the decision the field
    // is asking for; validation already refuses anything under ₾10.
    { name: 'კონსულტაცია', dur: 60, price: 0, free: false, desc: 'დასვი შენი კითხვა და ერთ საათში მიიღე კონკრეტული ნაბიჯები.' },
    { ...FREE_INTRO },
  ],
  avail: { ...DEFAULT_AVAIL, days: [...DEFAULT_AVAIL.days] },
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

/* Multi-part steps are gone with the long steps that needed them. The type and
 * `partsOf` stay so the footer/validation signatures don't have to change; both
 * are now constant-1. */
type StepPart = 1 | 2
const STEP_PARTS: Partial<Record<StepId, number>> = {}
const partsOf = (s: StepId) => STEP_PARTS[s] ?? 1

/** Bio length feedback. Silent in the middle, where there is nothing to say. */
const BioCounter = ({ value }: { value: string }) => {
  const n = value.trim().length
  const short = n > 0 && n < APPLY.BIO_MIN
  const near = n > APPLY.BIO_MAX - 200
  if (!short && !near) return null
  return (
    <p className={`mt-1.5 text-meta tabular-nums ${near ? 'text-warning-800' : 'text-ink-500'}`}>
      {near ? `დარჩა ${APPLY.BIO_MAX - n} სიმბოლო` : `კიდევ ${APPLY.BIO_MIN - n} სიმბოლო`}
    </p>
  )
}

/** Live „your name has to be Georgian" note — see its call site in Step1. */
const NameScriptHint = ({ form }: { form: FormState }) => {
  const err = React.useContext(ApplyErrCtx)
  const full = `${form.firstName.trim()} ${form.lastName.trim()}`.trim()
  // Nothing typed yet → not a problem yet. And when the gate has already
  // flagged the field, that red line is saying this; don't say it twice.
  if (!full || !nameError(full) || err?.field === 'firstName' || err?.field === 'lastName') return null
  return (
    <p className="mt-2 flex items-start gap-1.5 text-meta text-warning-800 leading-[1.45]">
      <Icon.warn aria-hidden className="w-3.5 h-3.5 shrink-0 mt-px text-warning-600" />
      <span>{nameError(full)}</span>
    </p>
  )
}

/* ───── STEP 1 — Who you are + what you do (one screen) ─────
 * Merges the old "contact" step with the old expertise step, minus everything
 * that isn't needed to judge an application: phone (now optional), city,
 * languages, years, LinkedIn, website, intro video, certificates and the whole
 * per-profession block. Those are all editable in the profile after approval.
 *
 * The bio minimum dropped 150 → 40 characters. 150 is roughly a full paragraph
 * in Georgian, and it was the last hard gate before the finish line — the
 * server has only ever asked for 20. */
const Step1 = ({ form, set, media, setMedia }: StepProps) => {
  const [dbCats, setDbCats] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    fetch('/api/categories')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: any[]) => { if (!cancelled && Array.isArray(rows)) setDbCats(rows.map(c => c?.name).filter(Boolean)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  // Fallback MUST mirror the deployed category NAMES (prisma/seedCategories.ts +
  // the /tutors filter), because the discovery filter matches by name — a stale
  // fallback lets an applicant pick a category that then never shows in browse.
  const ALL_CATS = dbCats.length ? dbCats : ['ბიზნესი', 'გადასახადები', 'ფინანსები', 'სამართალი', 'მარკეტინგი', 'გაყიდვები', 'IT და პროგრამირება', 'პროდაქტი', 'დიზაინი', 'კარიერა', 'HR და რეკრუტინგი', 'უძრავი ქონება', 'რელოკაცია', 'კრიპტო']
  const cats = form.cats
  const toggle = (c: string) => set({ cats: cats.includes(c) ? cats.filter(x => x !== c) : [...cats, c] })

  return (
    <>
      {/* The sub lists EXACTLY what validateStep(1) gates: name, email, sphere,
          the one-line pitch and the short bio. It used to omit the bio, which is
          the longest required field on the screen. */}
      <StepHeader title="ვინ ხარ და რაში ეხმარები ადამიანებს?" sub="სავალდებულოა სახელი, ელფოსტა, სფერო, ერთი წინადადება შენზე და მოკლე აღწერა. დანარჩენი სურვილისამებრ — მაგრამ პროფილს ავსებს." />

      <FormSection title="სახელი და კონტაქტი" required fields={['firstName', 'lastName', 'email', 'phone']}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field l="სახელი" required name="firstName"><Input data-field="firstName" autoComplete="given-name" value={form.firstName} onChange={(e: any) => set({ firstName: e.target.value })} placeholder="მაგ. ნინო" /></Field>
          <Field l="გვარი" required name="lastName"><Input data-field="lastName" autoComplete="family-name" value={form.lastName} onChange={(e: any) => set({ lastName: e.target.value })} placeholder="მაგ. ბერიძე" /></Field>
        </div>
        {/* SAID BEFORE IT BLOCKS, not at the gate. These two inputs are
            PRE-FILLED from the signed-in account, and a Georgian's Google
            account name is very often Latin — so the applicant is holding a
            value they never typed and which the API will refuse. Waiting for
            „შემდეგი" to mention it is how the 400 became invisible in the first
            place. Renders only while the name is actually unusable, and stands
            down once the red error takes over the same message. */}
        <NameScriptHint form={form} />
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          {/* READ-ONLY. The application is tied to the session and POST
              /api/applications takes no email at all — every letter goes to the
              ACCOUNT address. An editable field here let someone type a second
              address and believe the answer would arrive there; it never would.
              Show the real destination instead, and say where to change it. */}
          <Field l="ელფოსტა" sub="აქ მოგივა პასუხი. შესაცვლელად — პარამეტრები.">
            <Input
              type="email"
              data-field="email"
              readOnly
              tabIndex={-1}
              aria-readonly="true"
              value={form.email}
              className="bg-ink-50 text-ink-600 cursor-default"
            />
          </Field>
          {/* Optional now. It was a hard gate with a strict validator; the only
              consumer is the admin, who already has the applicant's email. */}
          <Field l="ტელეფონი (არასავალდებულო)"><Input data-field="phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e: any) => set({ phone: e.target.value })} placeholder="+995 5XX XX XX XX" /></Field>
        </div>
      </FormSection>

      {/* City / years / languages. All three lived in FormState, were rendered in
          the live preview and were carried into the created profile — but NO
          input ever showed them, so every applicant shipped them empty and the
          public profile was born half-blank. Restored as ONE optional row: the
          brief was to SIMPLIFY these fields, not to delete them. */}
      <Collapsible title="ქალაქი, გამოცდილება, ენები" sub="პროფილზე ჩანს — ერთ წუთში შეავსებ." fields={['city', 'yearsExp']}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field l="ქალაქი"><Input data-field="city" autoComplete="address-level2" value={form.city} onChange={(e: any) => set({ city: e.target.value })} placeholder="თბილისი" /></Field>
          {/* `max` matches the API's ceiling (was 60 against a server 80 — a
              number the browser doesn't enforce while typing anyway, so the
              real gate is yearsError()). The anchor is what lets the error
              jump here at all. */}
          <Field l="გამოცდილება (წელი)" name="yearsExp">
            <Input data-field="yearsExp" type="number" inputMode="numeric" min={0} max={APPLY.YEARS_MAX} step={1} value={form.yearsExp} onChange={(e: any) => set({ yearsExp: e.target.value })} placeholder="5" />
          </Field>
        </div>
        <div className="mt-3">
          <Field l="ენები" sub="მონიშნე ენები, რომლებზეც კონსულტაციას ჩაატარებ.">
            {/* The shared picker speaks canonical CODES; this form has always
                stored human labels (older rows even carried „ქართული · მშობლიური").
                Convert at the boundary rather than forking the component —
                approval normalizes the same way, so the two can't drift. */}
            <LanguagePicker
              value={normalizeLangs(form.languages)}
              onChange={codes => set({ languages: codes.map(langLabel) })}
              idPrefix="apply-lang"
            />
          </Field>
        </div>
      </Collapsible>

      {/* „პირველივე გახდება მთავარი" is not a style note: submitApplication()
          sends `cats[0]` as the specialty, and approval resolves the live
          Category from it — the rest are context for the moderator. */}
      <FormSection title="სფერო" required fields={['cats']} sub="აირჩიე 1–3 მიმართულება. პირველივე გახდება შენი მთავარი კატეგორია ძებნაში.">
        {/* The `cats` anchor moved here from the deleted free-text box. Without
            it „აირჩიე სფერო." would render with nowhere to scroll to —
            tests/apply-error-focus.test.ts F2 catches exactly that. */}
        <div data-field="cats" className="flex flex-wrap gap-1.5">
          {ALL_CATS.map(c => {
            const on = cats.includes(c)
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggle(c)}
                className={`h-9 px-3.5 rounded-pill border font-display text-small font-semibold tracking-wide inline-flex items-center gap-1.5 transition-all duration-fast motion-safe:active:scale-[0.97] ${
                  on ? 'bg-brand-600 text-white border-brand-500 shadow-sm' : 'bg-white text-ink-700 border-ink-200 hover:border-ink-400'
                }`}
              >
                {on && <Icon.check className="w-3 h-3" />}
                {c}
              </button>
            )
          })}
        </div>
        <FieldError name="cats" />

        {/* The „სფერო სიაში არ არის?" free-text box was removed 2026-08-05.
            MEASURED before deleting: 8 of the 16 people who finished step 1 typed
            something into it, and exactly ONE of those strings was ever stored —
            `requestedCategory` was written only when NO chip was picked, so the
            other seven were discarded at submit and nobody ever read them. What
            the surviving entries showed was not rare professions but people
            retyping a category that already exists („IT" three times, with the
            „IT და პროგრამირება" chip on screen). That is a chip-labelling
            problem, and it is not solved by a second input. */}
      </FormSection>

      {/* The placeholder used to read „მაგ. ბიზნეს-სტრატეგი · 12 წელი" — a worked
          example that TAUGHT applicants to put their years in this field. It was
          learned faithfully: three of the nine live profiles carry „- 7 წელი" /
          „4 წელი" / „1 წლიანი გამოცდილება" here, while the card renders the very
          same years in their own row directly below. A placeholder is the
          strongest instruction on a form; this one now demonstrates the shape we
          actually want, and the sub-line names the two things the card already
          shows so nobody spends their 60 characters repeating them.
          maxLength 80 → HEADLINE_MAX (60), matching the profile editor — the two
          forms write the SAME column and had different ceilings. */}
      <FormSection title="ერთი წინადადება შენზე" required fields={['headline']} sub="ზუსტად ასე გამოჩნდება შენს ბარათზე. სფერო და წლები ცალკე ჩანს — აქ ნუ გაიმეორებ.">
        <Input data-field="headline" value={form.headline} onChange={(e: any) => set({ headline: e.target.value })} placeholder="მაგ. ბრენდის სტრატეგია მცირე ბიზნესისთვის" maxLength={HEADLINE_MAX} />
        <FieldError name="headline" />
      </FormSection>

      <FormSection title="მოკლედ — ვის და რაში ეხმარები" required fields={['motivation']} sub={`2–3 წინადადება საკმარისია — მინიმუმ ${MIN_BIO} სიმბოლო. ეს ტექსტი პროფილზე გამოჩნდება.`}>
        {/* maxLength, not a validator: the API's ceiling is 2000 and a textarea
            with no cap let an applicant write 2500 characters and lose the
            submit to a generic 400 naming no field. A hard stop can't happen. */}
        <textarea
          data-field="motivation"
          value={form.motivation}
          onChange={e => set({ motivation: e.target.value })}
          placeholder="რა გამოცდილება გაქვს და რა საკითხებში ეხმარები ადამიანებს."
          rows={4}
          maxLength={APPLY.BIO_MAX}
          className="w-full p-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none resize-none"
        />
        {/* The counter appears only once it can mean something: while short it
            counts UP to the minimum, near the ceiling it counts what's left. */}
        <BioCounter value={form.motivation} />
        <FieldError name="motivation" />
      </FormSection>

      {/* REQUIRED from 2026-07-29 (was optional). It is the single biggest visual
          difference on an expert card, and a faceless profile reads as unfinished.
          Saves straight to the account avatar rather than riding in the
          application payload — and an account that already has one is seeded
          into `media.photoUrl` on load, so nobody re-uploads a photo they have. */}
      {/* PHOTO + VIDEO together (moved 2026-07-30). The video field used to sit
          on the LAST screen, inside a collapsed „გააძლიერე განაცხადი
          (არასავალდებულო)" pile, after the applicant had already decided they
          were finished. Result, measured in production: ZERO of ten live experts
          had one. It is not a nice-to-have — Preply, the only comparable site
          with public guidance, calls the intro video the single most important
          asset on a profile, and students almost always watch before booking.
          It stays OPTIONAL (a hard gate here would cost us applicants), but it
          belongs where the applicant is already thinking about how a client
          meets them: right next to their face. */}
      <FormSection title="ფოტო" required fields={['photo']} sub="ეს არის პირველი, რასაც შენზე ხედავენ — ატვირთე მკაფიო, კარგი ხარისხის სურათი, სადაც სახე ჩანს.">
        <div data-field="photo">
          <PhotoUploader value={media?.photoUrl} onChange={url => setMedia?.({ photoUrl: url })} />
        </div>
        <FieldError name="photo" />
      </FormSection>

      <Collapsible
        title="ვიდეოგაცნობა"
        sub="ყველაზე ძლიერი: სანამ შეფასებები არ გაქვს, ვიდეო ყველაზე მეტად აჩენს ნდობას."
        fields={['introVideoUrl']}
      >
        <Field l="YouTube-ის ბმული" sub="60 წამი საკმარისია — ვინ ხარ და რაში ეხმარები." name="introVideoUrl">
          <Input data-field="introVideoUrl" type="url" inputMode="url" autoCapitalize="none" spellCheck={false} autoComplete="url" value={form.introVideoUrl} onChange={(e: any) => set({ introVideoUrl: e.target.value })} placeholder="https://youtu.be/…" />
        </Field>
      </Collapsible>

      {/* MOVED HERE FROM THE DELETED THIRD STEP (2026-08-07). These are the only
          two things that step actually asked for; everything else on it was
          text. Collapsed, because a diploma uploader open on screen reads as a
          requirement — which is precisely what the 2026-07-28 cut removed and
          what one applicant, in his own account, still came away believing. */}
      <Collapsible
        title="ბმულები და დოკუმენტი"
        sub="დიპლომი, ლიცენზია, LinkedIn ან ვებგვერდი — რასაც დაურთავ, ის აძლიერებს განაცხადს."
        fields={['certificates', 'linkedin', 'website']}
      >
        <div className="space-y-4">
          <div>
            <span className="font-display text-micro font-semibold uppercase text-ink-500 block mb-1.5">დიპლომი ან სერტიფიკატი</span>
            <p className="text-meta text-ink-600 mb-2 leading-[1.5]">დიპლომს, ლიცენზიასა და სამუშაო გამოცდილებას ტექსტით ვერ გადავამოწმებთ — დოკუმენტი ერთადერთია, რისი შემოწმებაც შეგვიძლია. თუ დაურთავ, „გადამოწმებული“ ნიშანიც შეიძლება მიიღო.</p>
            <div data-field="certificates">
              <CertificateUploader items={media?.certificates ?? []} onChange={certificates => setMedia?.({ certificates })} />
            </div>
            <FieldError name="certificates" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field l="LinkedIn" name="linkedin"><Input data-field="linkedin" type="url" inputMode="url" autoCapitalize="none" spellCheck={false} maxLength={APPLY.URL_MAX} value={form.linkedin} onChange={(e: any) => set({ linkedin: e.target.value })} placeholder="linkedin.com/in/…" /></Field>
            <Field l="ვებგვერდი" name="website"><Input data-field="website" type="url" inputMode="url" autoCapitalize="none" spellCheck={false} maxLength={APPLY.URL_MAX} value={form.website} onChange={(e: any) => set({ website: e.target.value })} placeholder="example.ge" /></Field>
          </div>
        </div>
      </Collapsible>
    </>
  )
}


/* ───── STEP 2 — Pricing (single screen) ─────
   KYC (ID/selfie) + payout account (bank/IBAN) removed from onboarding: expert
   registration is just profile + one priced service. Payout details are
   collected later, in the expert's workspace, when payments integrate. */
const Step2 = ({ form, set }: StepProps) => {
  const updateService = (i: number, patch: Partial<FormState['services'][number]>) => {
    const next = form.services.map((s, idx) => idx === i ? { ...s, ...patch } : s)
    set({ services: next })
  }
  const removeService = (i: number) => set({ services: form.services.filter((_, idx) => idx !== i) })
  const addService = () => set({ services: [...form.services, { name: '', dur: 60, price: 40, free: false, desc: '' }] })

  /* THE FREE INTRO IS A SWITCH, NOT A ROW (fixed 2026-08-06, reported from a
   * phone). It used to render inside the services loop, so unticking the box
   * DELETED it from `services` — and the moment it was gone the checkbox went
   * with it. There was no way back: „სერვისის დამატება" adds a PAID service,
   * and nothing in the form could reconstruct a free 15-minute one. An expert
   * who tapped it to see what it did lost the feature permanently, silently,
   * and mid-application.
   *
   * The row now lives OUTSIDE the loop and always renders. Off is a state, not
   * a deletion — which is what a checkbox promises when you draw one. */
  const freeIdx = form.services.findIndex(s => s.free)
  const hasFree = freeIdx !== -1
  const freeIntro = hasFree ? form.services[freeIdx] : FREE_INTRO
  const toggleFree = () => set({
    services: hasFree
      ? form.services.filter((_, idx) => idx !== freeIdx)
      : [...form.services, { ...FREE_INTRO }],
  })

  return (
  <>
    {/* The pricing guidance used to live in this subtitle (with a „ჩვეულებრივ
        ₾60–₾150“ line that read like market data we don't have). It now lives
        inside <PriceField>, framed as our recommendation. */}
    {/* The old sub said the expert would add further services „მოგვიანებით,
        პროფილიდან" — while a „სერვისის დამატება" button sits right below it. */}
    <StepHeader title="რა ღირს შენი კონსულტაცია და როდის ხარ თავისუფალი?" sub="ერთი ფასიანი კონსულტაცია საკმარისია. განრიგი უკვე შევსებულია სამუშაო კვირით — შეამოწმე და გააგზავნე." />

    <FormSection title="შენი კონსულტაცია" sub="სახელი და აღწერა უკვე შევსებულია — შეცვალე, თუ გინდა. მთავარი გადაწყვეტილება ფასია.">
      <div data-field="services" className="space-y-3">
        {form.services.map((s, i) => (
          s.free ? null : (
          <div key={i} className="p-4 rounded-card border bg-white border-ink-200">
            {/* Row 1 — what the service IS. Price used to sit here in a 120px
                column, visually equal to duration though far more consequential;
                it now gets its own block below. */}
            <div className="grid sm:grid-cols-[1fr_120px_auto] gap-3 items-start">
              <div className="min-w-0">
                <Input value={s.name} onChange={(e: any) => updateService(i, { name: e.target.value })} placeholder="სერვისის სახელი" className="!h-9 !text-small font-display font-bold" />
                <textarea value={s.desc} onChange={e => updateService(i, { desc: e.target.value })} placeholder="მოკლე აღწერა" rows={2} className="mt-2 w-full p-2 rounded-field border border-ink-200 bg-white text-meta text-ink-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none resize-none" />
              </div>
              <div>
                <span className="font-display text-micro font-semibold uppercase text-ink-500 block mb-1">ხანგრძლივობა · წთ</span>
                <Input type="number" min={15} max={240} value={s.dur} onChange={(e: any) => updateService(i, { dur: Number(e.target.value) || 0 })} className="!h-9 !text-small tabular-nums font-display font-bold" />
              </div>
              {/* Removing the ONLY paid service leaves the form unsubmittable
                  („add at least one paid service") — so don't offer the action. */}
              {form.services.filter(x => !x.free).length > 1 ? (
                <button type="button" onClick={() => removeService(i)} aria-label="სერვისის წაშლა" className="h-9 w-9 self-end rounded-btn text-ink-500 hover:text-danger-700 hover:bg-danger-50 inline-flex items-center justify-center transition-colors duration-fast">
                  <Icon.x className="w-4 h-4" />
                </button>
              ) : <span aria-hidden />}
            </div>

            {/* Row 2 — the decision. Shared with the workspace profile editor so
                the guidance can't drift between onboarding and later edits. */}
            <PriceField
              className="mt-3 pt-3 border-t border-ink-100"
              value={s.price}
              onChange={(price) => updateService(i, { price })}
              minutes={s.dur}
              disabled={s.free}
            />
          </div>
          )
        ))}

        <button type="button" onClick={addService} className="w-full h-12 rounded-card border border-dashed border-ink-300 hover:border-brand-400 hover:bg-brand-50/30 text-ink-600 hover:text-brand-700 font-display font-semibold text-small inline-flex items-center justify-center gap-2 transition-colors duration-fast">
          <Icon.plus className="w-4 h-4" /> სერვისის დამატება
        </button>

        {/* Always here — checked or not. See `toggleFree` above for why. */}
        <label className={`flex items-start gap-3 p-4 rounded-card border cursor-pointer transition-colors duration-fast ${
          hasFree ? 'border-brand-200 bg-brand-50/30' : 'border-ink-200 bg-white hover:border-ink-300'
        }`}>
          <input
            type="checkbox"
            checked={hasFree}
            onChange={toggleFree}
            className="mt-0.5 w-5 h-5 shrink-0 accent-brand-600"
          />
          <span className="min-w-0">
            <span className="block font-display text-small font-bold text-ink-900">უფასო {freeIntro.dur}-წუთიანი გაცნობითი შეხვედრა</span>
            <span className="block text-meta text-ink-600 mt-0.5 leading-snug">
              მოკლე უფასო საუბარი, სადაც სტუდენტი საკითხს დააზუსტებს — პირველი ჯავშნების მოსაზიდად ყველაზე ეფექტური გზაა.
              {hasFree ? ' თუ არ გჭირდება, მოხსენი მონიშვნა — ნებისმიერ დროს დააბრუნებ.' : ' მონიშნე, თუ გინდა, რომ შესთავაზო.'}
            </span>
          </span>
        </label>
      </div>
      <FieldError name="services" />
    </FormSection>

    <AvailabilityPicker form={form} set={set} />

    {/* Was: „დამტკიცების შემდეგ პირველი საქმე თავისუფალი დროის გამოქვეყნებაა".
        That sentence described the failure it caused — 46% of booking attempts
        died on „დრო არ არის", because publishing time was a separate job nobody
        did after approval. The calendar is now filled in here, on the screen
        where they are already deciding when they work. */}
    <div className="flex items-start gap-2.5 p-4 rounded-card bg-brand-50/50 border border-brand-200">
      <Icon.bolt className="w-4 h-4 text-brand-700 mt-0.5 shrink-0" />
      <p className="text-meta text-ink-700 leading-[1.55]">დამტკიცებისთანავე ეს დრო გამოქვეყნდება და დაჯავშნა შესაძლებელი გახდება. განრიგს ნებისმიერ დროს შეცვლი — დღეს ან საათს ერთი შეხებით ამოიღებ.</p>
    </div>
  </>
  )
}

/* ───── Availability — FULL TIME by default (owner's call 2026-08-07) ─────
 *
 * WHY IT LIVES ON THE PRICE SCREEN, PRE-FILLED. Publishing time used to be a
 * separate job after approval, and the measurement is unambiguous: 46% of
 * booking attempts died on „this expert has no free time". An empty calendar is
 * an expert who cannot be booked, so an empty calendar is the default that must
 * be removed — not the one to ship.
 *
 * AND WHY IT IS STILL A QUESTION, not a silent default: this publishes real
 * bookable hours to real clients under this person's name. Pre-ticked answers
 * the „nobody fills it in" problem; SHOWING it answers the „a client books an
 * hour the expert never agreed to" one. Both matter, and only one of them is a
 * funnel number. */
const AvailabilityPicker = ({ form, set }: { form: FormState; set: (patch: Partial<FormState>) => void }) => {
  const a = form.avail
  const toggleDay = (i: number) => set({ avail: { ...a, days: a.days.map((v, idx) => (idx === i ? !v : v)) } })
  const dayCount = a.days.filter(Boolean).length
  const hours = Math.max(0, a.endHour - a.startHour)
  return (
    <FormSection
      title="როდის ხარ თავისუფალი?"
      required
      fields={['avail']}
      sub="უკვე შევსებულია სამუშაო კვირით — შეცვალე, თუ სხვანაირად მუშაობ. სტუდენტი კონკრეტულ საათს ამ შუალედის შიგნით აირჩევს."
    >
      <div data-field="avail">
        <Eyebrow as="span" id="avail-days" tone="muted" className="block mb-2">დღეები</Eyebrow>
        {/* A 7-COLUMN GRID, not wrapping chips. Seven 44px pills plus gaps come
            to 344px against the 342px a 390px phone actually offers, so one day
            wrapped onto a line of its own — a week that doesn't look like a
            week. The grid divides whatever width there is; each cell still
            clears the 40px tap floor down to 320px. */}
        <div className="grid grid-cols-7 gap-1.5" role="group" aria-labelledby="avail-days">
          {DAY_LABELS.map((d, i) => (
            <button
              key={d}
              type="button"
              aria-pressed={a.days[i]}
              onClick={() => toggleDay(i)}
              className={`h-11 w-full rounded-pill border font-display text-small font-bold inline-flex items-center justify-center transition-colors duration-fast motion-safe:active:scale-[0.97] ${
                a.days[i] ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-ink-600 border-ink-200 hover:border-ink-400'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <Field l="დაწყება">
            <select
              value={a.startHour}
              onChange={e => {
                const h = Number(e.target.value)
                // The end follows the start — the schedule page's old picker let
                // them cross and then refused the save, which is the exact
                // friction being removed here.
                set({ avail: { ...a, startHour: h, endHour: Math.max(h + 1, a.endHour) } })
              }}
              className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 tabular-nums focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
            >
              {Array.from({ length: 23 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </Field>
          <Field l="დასრულება">
            <select
              value={a.endHour}
              onChange={e => set({ avail: { ...a, endHour: Number(e.target.value) } })}
              className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 tabular-nums focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
            >
              {Array.from({ length: 24 }, (_, i) => i + 1).filter(h => h > a.startHour).map(h => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
          </Field>
        </div>

        <p className="mt-3 text-meta text-ink-600 leading-[1.5]">
          {dayCount === 0
            ? 'აირჩიე მინიმუმ ერთი დღე — ამის გარეშე დაჯავშნა შეუძლებელია.'
            : <>კვირაში <span className="font-display font-bold text-ink-900 tabular-nums">{dayCount} დღე</span> · დღეში <span className="font-display font-bold text-ink-900 tabular-nums">{hours} საათი</span> · სულ <span className="font-display font-bold text-ink-900 tabular-nums">{dayCount * hours} საათი</span>. თბილისის დროით.</>}
        </p>
        <FieldError name="avail" />
      </div>
    </FormSection>
  )
}

/* ───── Live preview card (right side) ───── */
const LivePreview = ({ step, form }: { step: StepId; form: FormState }) => {
  const displayName = `${form.firstName} ${form.lastName}`.trim() || 'შენი სახელი'
  // City and years are no longer asked for during onboarding (they moved to the
  // profile editor), so this line is normally empty. It stays because a
  // „needs revision" resubmit DOES restore both from the prior application —
  // but it must render nothing rather than the placeholders „ქალაქი · გამოცდილება",
  // which promised a card detail the applicant never entered.
  const meta = [form.city.trim(), form.yearsExp ? `${form.yearsExp} წლის გამოცდილება` : ''].filter(Boolean).join(' · ')
  const displayHeadline = form.headline.trim() || 'შენი პროფესია აქ გამოჩნდება'
  const primaryCat = form.cats[0] || 'კატეგორია'
  const bio = form.motivation.trim() || form.headline.trim() || 'აქ გამოჩნდება შენი მოკლე აღწერა.'
  const paidService = form.services.find(s => !s.free && s.price > 0)
  const price = paidService?.price ?? 0
  return (
  <aside className="hidden xl:block w-[320px] shrink-0 p-6 border-l border-ink-200 bg-white sticky top-20 self-start xl:h-[836px] overflow-y-auto">
    {/* Was an eyebrow („წინასწარი ხედი") plus a heading („ასე დაინახავენ
        სტუდენტები") — two lines naming the same thing above a card that shows
        it. One line, 2026-08-05 (owner's call). */}
    <h3 className="font-display text-body-lg font-bold text-ink-900 tracking-tight mb-4">თქვენი პროფილი</h3>

    <article className="rounded-card border border-ink-200 bg-white shadow-card overflow-hidden transition-shadow duration-fast hover:shadow-float">
      <div className="h-14 bg-gradient-to-br from-brand-100 to-brand-50 border-b border-ink-100" aria-hidden />
      <div className="px-4 pb-4 -mt-8">
        <div className="relative inline-block">
          <div className="w-16 h-16 rounded-card bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center ring-4 ring-white shadow-sm font-display text-h2 font-bold text-white">
            {(form.firstName[0] || 'მ').toUpperCase()}
          </div>
        </div>
        <div className="mt-2.5 min-w-0">
          <div className="flex items-center gap-1.5">
            {/* No VerifiedMark and no status dot here. This is a PREVIEW of the
                applicant's own future card — the badge is granted by a moderator
                and most profiles will not have it, so drawing it promised
                something we hadn't given (and the dot breaks the no-status-dots
                canon besides). */}
            <span className="font-display text-body-lg font-bold text-ink-900 tracking-tight truncate">{displayName}</span>
          </div>
          <div className="mt-0.5 text-meta text-ink-700 leading-[1.35] line-clamp-2">{displayHeadline}</div>
          {meta && <div className="mt-0.5 text-meta text-ink-400 truncate">{meta}</div>}
        </div>

        <div className="mt-2.5 inline-flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 h-[22px] px-2 rounded-pill bg-brand-50 border border-brand-200 text-brand-800 font-display text-micro font-bold uppercase">
            <Icon.award className="w-3 h-3" /> {primaryCat.slice(0, 22)}
          </span>
        </div>

        <p className="mt-2.5 text-small text-ink-700 leading-[1.45] line-clamp-3">{bio}</p>

        <div className="mt-3 pt-3 border-t border-ink-100 flex items-center justify-between text-meta">
          <span className="inline-flex items-center gap-1"><Icon.star aria-hidden className="w-3 h-3 text-warning-500" /><span className="font-display font-bold tabular-nums text-ink-900">—</span><span className="text-ink-400 tabular-nums">(ახალი)</span></span>
          {/* No price yet → say so, never „₾0". The field now starts empty
              (the ₾80 pre-fill was an anchor half the roster accepted), and a
              preview advertising ₾0 would read as a free session. */}
          {price > 0
            ? <span className="font-display text-body-lg font-bold text-ink-900 tabular-nums">₾{price}<span className="text-meta font-medium text-ink-500"> / სესია</span></span>
            : <span className="font-display text-body-lg font-bold text-ink-400">ფასი — შენ ადგენ</span>}
        </div>
        <div aria-hidden className="mt-3 w-full h-9 rounded-btn bg-brand-600 text-white font-display font-semibold text-meta tracking-wide inline-flex items-center justify-center gap-1.5 select-none cursor-default shadow-xs" title="ნიმუში — ასე გამოიყურება ჯავშნის ღილაკი"><Icon.cal className="w-3.5 h-3.5" /> დაჯავშნე (ნიმუში)</div>
      </div>
    </article>

    {/* The per-step „რჩევა" box was removed 2026-08-05 (owner's call). Advice
        that sits beside the form on every step is one more thing to read on the
        screen that already loses half the applicants; what each field needs is
        said by the field itself. */}
  </aside>
  )
}

/* ───── Per-step validation helpers ───── */
/** API field name → this form's `data-field` anchor. The API speaks in DB
 *  columns („fullName", „hourlyRate"); the form has two name inputs and a
 *  services block, so the two vocabularies have to be mapped, not assumed. */
const SERVER_FIELD: Record<string, string> = {
  fullName: 'firstName',
  specialty: 'cats',
  motivation: 'motivation',
  hourlyRate: 'services',
  yearsExp: 'yearsExp',
  phone: 'phone',
  city: 'city',
  linkedinUrl: 'linkedin',
  websiteUrl: 'website',
  introVideoUrl: 'introVideoUrl',
  certificates: 'certificates',
}

/* Bio floor. Was 150 — roughly a full paragraph in Georgian, and the last hard
 * gate before the finish line. The server has only ever required 20; 40 keeps
 * the public profile from reading as empty without turning the form into an
 * essay. Both validators below read this, so there is one number to change. */
const MIN_BIO = APPLY.BIO_MIN
const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
// Phone. Georgian mobile is the EXPECTED shape — 9 digits starting with 5
// (5XXXXXXXX), or the same with a +995 prefix (9955XXXXXXXX) — but relocation /
// international experts apply with a +1 or +44 number, so any plausible
// international number passes too (E.164: 8–15 digits, spaces/dashes/parens
// tolerated). Junk (too short, letters) still fails; the server only asks for
// min-6, so this stays the friendlier of the two gates.
const isValidPhone = (raw: string) => {
  const v = raw.trim()
  // Digits + phone punctuation only (leading + allowed) — letters are junk.
  if (!/^\+?[\d\s\-().]+$/.test(v)) return false
  const d = v.replace(/\D/g, '')
  if (/^5\d{8}$/.test(d) || /^9955\d{8}$/.test(d)) return true
  // Anything else must look international: an explicit + and an E.164 length.
  return v.startsWith('+') && d.length >= 8 && d.length <= 15
}

/* ───── Footer with next/back (part-aware: multi-part steps advance within
   the step before moving on; back re-enters the previous step's LAST part) ───── */
const FormFooter = ({ step, setStep, part, setPart, completed, setCompleted, onSubmit, submitting, validateStep, onError, onStepDone, onBlocked }: { step: StepId; setStep: (s: StepId) => void; part: StepPart; setPart: (p: StepPart) => void; completed: Set<StepId>; setCompleted: (c: Set<StepId>) => void; onSubmit: () => void; submitting: boolean; validateStep: (s: StepId, p: StepPart) => string | null; onError: (msg: string | null) => void; onStepDone: (s: StepId) => void; onBlocked: (s: StepId) => void }) => {
  const next = () => {
    if (step === 2) { onSubmit(); return }
    const err = validateStep(step, part)
    // A refusal is a funnel fact. Reporting it is what turns „stopped on step 2"
    // into „could not set a price" — see APPLY_FUNNEL_EVENTS.blocked.
    if (err) { onError(err); onBlocked(step); return }
    onError(null)
    if (part < partsOf(step)) { setPart((part + 1) as StepPart); return }
    const c = new Set(completed); c.add(step)
    setCompleted(c)
    onStepDone(step)
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
    <footer className="mt-8 pt-5 border-t border-ink-200 max-lg:sticky max-lg:bottom-0 max-lg:-mx-6 max-lg:px-6 max-lg:pb-3 max-lg:bg-white max-lg:safe-area-bottom">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={back} disabled={step === 1} className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 active:bg-ink-100 disabled:opacity-50 disabled:cursor-not-allowed text-ink-700 font-display font-semibold text-small inline-flex items-center gap-1.5 transition-[background-color,border-color,transform] duration-fast motion-safe:active:scale-[0.97]">
          <Icon.chevL className="w-4 h-4" /> უკან
        </button>

        <div className="text-meta text-ink-500 tabular-nums hidden sm:block">
          {step} / 2
        </div>

        <div className="flex items-center gap-2">
          {/* "შენახვა + გასვლა" removed — server-side draft persistence isn't
              implemented yet. Users can safely leave; the form is one flow. */}
          <button type="button" onClick={next} disabled={submitting} className="h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 active:bg-brand-800 disabled:bg-ink-100 disabled:text-ink-500 text-white font-display font-semibold text-body shadow-xs hover:shadow-sm inline-flex items-center gap-2 transition-[background-color,box-shadow,transform] duration-fast motion-safe:active:scale-[0.97]">
            {submitting ? 'იგზავნება…' : step === 2 ? "გაგზავნა" : "შემდეგი"}
          </button>
        </div>
      </div>

      {/* The „a human reads every application · 24–48h" reassurance line was
          removed 2026-08-05 (owner's call). It repeated what step 3's own
          header already says, one line under the advance button, on every
          step. */}
    </footer>
  )
}

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
  const [step, setStep] = useState<StepId>(1)
  const [part, setPart] = useState<StepPart>(1)
  // Jumping via the progress nav always lands on a step's first screen; the
  // footer's back/next manage `part` themselves.
  const jumpToStep = (s: StepId) => { setStep(s); setPart(1) }
  const [completed, setCompleted] = useState<Set<StepId>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // The same message, pinned to the control that refused. See ApplyErrCtx.
  const [fieldErr, setFieldErr] = useState<ApplyErr>(null)
  // Email-verification state, detected up front via /api/me so an unverified
  // applicant is warned from step 1 — not blocked only at final submit.
  // null = unknown/loading (or signed-out), true/false = known.
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null)
  const [accountEmail, setAccountEmail] = useState('')
  // Existing application status, so a returning applicant sees "under review" /
  // "rejected (reason)" instead of a blank form they might re-fill blindly.
  const [appStatus, setAppStatus] = useState<'SUBMITTED' | 'REJECTED' | 'APPROVED' | 'NEEDS_REVISION' | null>(null)
  const [appNote, setAppNote] = useState<string | null>(null)
  const [appLoaded, setAppLoaded] = useState(false)
  // A SUBMITTED applicant can choose to edit + re-submit; this reveals the form.
  const [forceEdit, setForceEdit] = useState(false)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  // Uploaded media — deliberately NOT persisted to the localStorage draft (base64
  // data URLs would exceed the quota); re-upload after a refresh is acceptable.
  const [media, setMedia] = useState<MediaState>({ certificates: [] })
  const setMediaPatch = (patch: Partial<MediaState>) => {
    setMedia(m => ({ ...m, ...patch }))
    // Uploading the photo IS the fix for „ატვირთე პროფილის ფოტო" — the error
    // has to clear on it exactly as it does on a keystroke.
    setSubmitError(e => (e ? null : e))
    setFieldErr(e => (e ? null : e))
  }
  const [draftRestored, setDraftRestored] = useState(false)
  const [draftLoaded, setDraftLoaded] = useState(false)
  // Restore any recent draft on mount. Runs once client-side.
  // One anonymous id per attempt — stitches this session's funnel rows together.
  // A ref, not state: it must never change and must never cause a re-render.
  const flowId = useRef<string>('')
  if (!flowId.current) flowId.current = newApplyFlowId()

  useEffect(() => {
    const restored = readApplyDraft()
    if (restored) {
      // Merge over INITIAL_FORM so a draft saved before a field existed (e.g.
      // `languages`) doesn't leave it undefined and crash consumers.
      setForm({ ...INITIAL_FORM, ...restored })
      setDraftRestored(true)
    }
    setDraftLoaded(true)
    // The funnel's denominator. Without it „two people applied" and „twenty
    // started and two finished" are indistinguishable — opposite problems.
    trackApply(APPLY_FUNNEL_EVENTS.opened, { flowId: flowId.current, resumed: !!restored })
  }, [])
  // Prefill from the signed-in account so the expert never re-types what signup
  // already collected. The account carries fullName + email; we split fullName
  // on the first space into first/last and fill ONLY still-empty fields — so a
  // restored draft (or anything the user already typed) is never clobbered.
  useEffect(() => {
    let cancelled = false
    fetch('/api/me')
      .then(r => r.json())
      .then(d => {
        if (cancelled || !d?.user) return
        setEmailVerified(!!d.user.emailVerified)
        if (d.user.email) setAccountEmail(d.user.email)
        const full = (d.user.fullName ?? '').trim()
        const sp = full.indexOf(' ')
        const first = sp === -1 ? full : full.slice(0, sp)
        const last = sp === -1 ? '' : full.slice(sp + 1).trim()
        setForm(f => ({
          ...f,
          firstName: f.firstName.trim() ? f.firstName : first,
          lastName: f.lastName.trim() ? f.lastName : last,
          // ALWAYS the account address — the field is read-only and represents
          // where the answer actually goes, so a restored draft (or an older
          // typed value) must never win over it.
          email: d.user.email ?? f.email,
        }))
        // The photo is REQUIRED, and an avatar the person UPLOADED already
        // satisfies it — nobody should have to re-upload a photo they gave us.
        //
        // ⚠️ A GOOGLE AVATAR DOES NOT COUNT (owner's call, 2026-08-05, and the
        // URLs confirm it): Google hands back `…googleusercontent.com/a/…=s96`,
        // i.e. 96×96 pixels. That is fine for a small client avatar and far too
        // small for an expert's card and profile, where the photo is the first
        // thing a paying visitor judges. Seeding it silently marked the field
        // done and shipped a blurry expert — 17 of the 30 stored avatars are
        // exactly these. An uploaded one is a `data:` URL (our own /api/uploads
        // output, sharp-resized), which is why that is the whole test.
        const uploaded = d.user.avatarUrl?.startsWith('data:') ? d.user.avatarUrl : null
        if (uploaded) setMedia(m => (m.photoUrl ? m : { ...m, photoUrl: uploaded }))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  // Fetch the caller's own application so a returning applicant gets a real
  // status screen (under review / rejected) instead of a blank wizard.
  const [appPrefill, setAppPrefill] = useState<any>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/applications')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled) return
        const a = d?.application
        if (a?.status) { setAppStatus(a.status); setAppNote(a.moderatorNote ?? null) }
        if (a) setAppPrefill(a)
        setAppLoaded(true)
      })
      .catch(() => { if (!cancelled) setAppLoaded(true) })
    return () => { cancelled = true }
  }, [])
  // Seed the wizard from the applicant's OWN previously-submitted values so the
  // „needs revision" (or edit-and-resubmit) re-edit isn't a blank form off-device
  // / after the 7-day draft expired. A local draft always wins (it's the freshest
  // in-progress state), so we only seed when NO draft was restored. Runs once.
  const appSeeded = useRef(false)
  useEffect(() => {
    if (appSeeded.current) return
    if (!appLoaded || !draftLoaded) return   // wait for both status + draft to settle
    if (draftRestored) { appSeeded.current = true; return } // draft is fresher → don't overwrite
    const a = appPrefill
    if (!a) { appSeeded.current = true; return }
    appSeeded.current = true
    const pd = (a.professionData && typeof a.professionData === 'object') ? a.professionData : {}
    const full = (a.fullName ?? '').trim()
    const sp = full.indexOf(' ')
    const first = sp === -1 ? full : full.slice(0, sp)
    const last = sp === -1 ? '' : full.slice(sp + 1).trim()
    // Invert submitApplication()'s specialty packing: a niche the applicant typed
    // lands in professionData.requestedCategory (cats was empty); otherwise
    // specialty is the picked category name.
    const requestedCategory: string = typeof pd.requestedCategory === 'string' ? pd.requestedCategory : ''
    const specialty: string = typeof a.specialty === 'string' ? a.specialty : ''
    const services = Array.isArray(pd.services) && pd.services.length
      ? pd.services.map((s: any) => ({
          name: String(s?.name ?? ''),
          dur: Number(s?.dur) || 60,
          price: Number(s?.price) || 0,
          free: !!s?.free,
          desc: String(s?.desc ?? ''),
        }))
      : null
    const languages = Array.isArray(pd.languages) && pd.languages.length
      ? pd.languages.map((l: any) => String(l))
      : null
    // Strip the keys we unpacked back into first-class form fields so the leftover
    // professionData (dynamic profession-specific answers) is preserved cleanly.
    // The weekly pattern, inverted back into the picker's shape. Without this a
    // „needs revision" resubmit would silently republish the DEFAULT week over
    // whatever the applicant actually chose the first time.
    const av = pd.availability
    const avail = av && Array.isArray(av.days)
      ? {
          days: Array.from({ length: 7 }, (_, i) => av.days.includes(i)),
          startHour: Number(av.startHour) || DEFAULT_AVAIL.startHour,
          endHour: Number(av.endHour) || DEFAULT_AVAIL.endHour,
        }
      : null
    const { requestedCategory: _rc, headline: _hl, languages: _lg, services: _sv, availability: _av, ...restPd } = pd
    setForm(f => ({
      ...f,
      firstName: f.firstName.trim() ? f.firstName : first,
      lastName: f.lastName.trim() ? f.lastName : last,
      phone: f.phone.trim() ? f.phone : (a.phone ?? ''),
      city: f.city.trim() ? f.city : (a.city ?? ''),
      yearsExp: f.yearsExp.trim() ? f.yearsExp : (a.yearsExp != null ? String(a.yearsExp) : ''),
      motivation: f.motivation.trim() ? f.motivation : (a.motivation ?? ''),
      linkedin: f.linkedin.trim() ? f.linkedin : (a.linkedinUrl ?? ''),
      website: f.website.trim() ? f.website : (a.websiteUrl ?? ''),
      introVideoUrl: f.introVideoUrl.trim() ? f.introVideoUrl : (a.introVideoUrl ?? ''),
      headline: f.headline.trim() ? f.headline : (typeof pd.headline === 'string' ? pd.headline : ''),
      cats: f.cats.length ? f.cats : (requestedCategory || !specialty ? [] : [specialty]),
      languages: languages ?? f.languages,
      services: services ?? f.services,
      avail: avail ?? f.avail,
      professionData: { ...restPd, ...f.professionData },
    }))
  }, [appLoaded, draftLoaded, draftRestored, appPrefill])
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
    // Editing anything clears the complaint — including the one pinned under a
    // field. A red line that survives the fix reads as „still wrong".
    if (submitError) setSubmitError(null)
    if (fieldErr) setFieldErr(null)
  }
  // The draft is cleared on a SUCCESSFUL SUBMIT only (see submitApplication) —
  // never on merely reaching the last screen. It used to clear on `step === 3`,
  // so refreshing or navigating back on the review screen silently threw the
  // whole application away with nothing submitted.
  // Each screen change starts at the top — without this, advancing from a long
  // screen leaves the user mid-scroll on the next one, which reads as broken.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [step, part])

  // Final pre-submit gate. Must stay a SUPERSET of what /api/applications
  // enforces (fullName ≥2, specialty ≥2, motivation ≥20, hourlyRate 10–5000),
  // so a form that passes here can never be rejected by the server with the
  // generic „შეავსე ყველა აუცილებელი ველი" — which tells the user nothing.
  // Phone is NOT gated: it's optional in onboarding now.
  // A validator that only produces TEXT leaves the applicant hunting: the error
  // renders in a box at the bottom of the form, and if the offending field is
  // above the fold they are told „fill in the field" with no way to tell which.
  // `fail` keeps the message identical and records WHERE — the UI then takes
  // them there. Anchors are `data-field` attributes on the inputs.
  const invalidField = useRef<string | null>(null)
  const fail = (field: string, msg: string): string => {
    invalidField.current = field
    // Also render the sentence UNDER the control (ApplyErrCtx → <FieldError/>).
    // The box at the bottom says something is wrong; this says which thing.
    setFieldErr({ field, msg })
    return msg
  }
  /** Which screen each anchor lives on — so a jump can change steps first. */
  const FIELD_STEP: Record<string, StepId> = {
    firstName: 1, lastName: 1, email: 1, phone: 1, cats: 1, headline: 1,
    photo: 1, motivation: 1, yearsExp: 1, city: 1, introVideoUrl: 1,
    // Moved onto step 1 with the third screen's removal (2026-08-07).
    linkedin: 1, website: 1, certificates: 1,
    services: 2, avail: 2,
  }
  /** Scroll to and focus the field the last validation failure named. */
  const focusInvalidField = () => {
    const key = invalidField.current
    if (!key || typeof document === 'undefined') return
    // THE FIELD MAY NOT BE ON SCREEN. The final gate re-checks all three steps
    // (and the API can refuse a step-1 value at submit time), so an error can
    // name a field two screens back. Without this the applicant reads „fix your
    // name" on the review screen with no name field in sight.
    const target = FIELD_STEP[key]
    const needsJump = target !== undefined && target !== step
    if (needsJump) { setStep(target); setPart(1) }
    // Next frame: the error box renders in the same commit and shifts layout,
    // so measuring before paint would scroll to the wrong place. A step change
    // needs one more — the new screen has to mount before it can be measured.
    const afterPaint = (fn: () => void) =>
      needsJump ? requestAnimationFrame(() => requestAnimationFrame(fn)) : requestAnimationFrame(fn)
    afterPaint(() => {
      const anchor = document.querySelector<HTMLElement>(`[data-field="${key}"]`)
      if (!anchor) return
      const target = anchor.matches('input,textarea,select,button')
        ? anchor
        : anchor.querySelector<HTMLElement>('input,textarea,select,button')
      ;(target ?? anchor).scrollIntoView({ block: 'center', behavior: 'smooth' })
      // preventScroll: scrollIntoView above already owns the movement, and a
      // second one from focus() lands a frame later as a visible jerk.
      target?.focus({ preventScroll: true })
    })
  }

  // The step gate reports through this, so „შემდეგი" also takes you to the
  // field instead of just complaining underneath the form.
  const onStepError = (msg: string | null) => {
    setSubmitError(msg)
    if (msg) focusInvalidField()
  }

  /* THE CONTRACT WITH THE API (lib/applyValidation.ts): everything this accepts,
   * POST /api/applications accepts. Both sides now call the SAME rule functions,
   * so „the form let it through and the server refused it" cannot come back by
   * someone editing one bound and not the other. The step gates below are the
   * same rules, applied as soon as the field is on screen — the last thing an
   * applicant should meet is a wall on the final screen. */
  const validateStep = (s: StepId, _p: StepPart = 1): string | null => {
    if (s === 1) {
      const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim()
      { const e = nameError(fullName); if (e) return fail('firstName', e) }
      if (!isValidEmail(form.email)) return fail('email', 'შეიყვანე სწორი ელფოსტა.')
      // Phone is optional — but if something WAS typed it still has to be a
      // real number, otherwise a typo is silently stored and never reachable.
      if (form.phone.trim() && !isValidPhone(form.phone)) return fail('phone', 'ტელეფონი არასწორია — მაგ. 555 12 34 56, ან საერთაშორისო ნომერი კოდით (+44…). ველი ცარიელიც შეიძლება დატოვო.')
      { const e = phoneError(form.phone); if (e) return fail('phone', e) }
      if (form.cats.length < 1) return fail('cats', 'აირჩიე სფერო.')
      if (form.headline.trim().length < 2) return fail('headline', 'დაწერე ერთი წინადადება შენზე.')
      { const e = georgianError('ერთი წინადადება შენზე', checkGeorgian(form.headline)); if (e) return fail('headline', e) }
      // A profile with no face is the single weakest thing on the marketplace —
      // it converts badly and it reads as unfinished. Required from 2026-07-29.
      if (!media?.photoUrl) return fail('photo', 'ატვირთე პროფილის ფოტო — ის ყველგან გამოჩნდება, სადაც სტუდენტი შენ გხედავს.')
      { const e = bioError(form.motivation); if (e) return fail('motivation', e) }
      // Optional fields, but a bad value in one still 400s the whole submit —
      // and it does so two screens later, where nothing points back here.
      { const e = yearsError(form.yearsExp); if (e) return fail('yearsExp', e) }
      { const e = videoError(form.introVideoUrl); if (e) return fail('introVideoUrl', e) }
      return null
    }
    if (s === 2) {
      const paidService = form.services.find(sv => !sv.free && sv.price > 0)
      { const e = priceError(paidService?.price ?? 0); if (e) return fail('services', e) }
      // An expert with no published day cannot be booked at all — the single
      // biggest hole in the funnel. It is pre-filled, so this only fires when
      // someone deliberately unticked everything.
      if (!form.avail.days.some(Boolean)) return fail('avail', 'აირჩიე მინიმუმ ერთი დღე — ამის გარეშე შენთან ჯავშანი შეუძლებელია.')
      if (form.avail.endHour <= form.avail.startHour) return fail('avail', 'დასრულების საათი დაწყებაზე გვიან უნდა იყოს.')
      return null
    }
    return null
  }

  /* Final gate before the POST. Deliberately re-runs EVERY step, not just the
   * last one: a draft restored from localStorage, a value seeded from a previous
   * application, or a step reached before a rule existed can all put an invalid
   * value behind the applicant. `fail()` carries the step, so the jump lands on
   * the right screen instead of pointing at a field that isn't rendered. */
  const validate = (): string | null =>
    validateStep(1) ?? validateStep(2) ?? (() => {
      // `specialty` is derived at submit (cats[0], else the headline) — so it is
      // the one value no single input owns and no step gate covers.
      const specialty = form.cats[0] || form.headline.trim().slice(0, 60)
      const e = specialtyError(specialty)
      return e ? fail('cats', e) : null
    })()

  /**
   * Field → block code. The names are the FIELD that refused, spelled as the
   * SCREAMING_SNAKE constants the events validator already accepts for `code`,
   * so no new prop key and no validator change is needed.
   *
   * A code, never the message: the message is copy and will be reworded, while
   * „PHOTO_REQUIRED" stays comparable across every rewrite.
   */
  const BLOCK_CODE: Record<string, string> = {
    firstName: 'NAME_REQUIRED',
    email: 'EMAIL_INVALID',
    phone: 'PHONE_INVALID',
    cats: 'CATEGORY_REQUIRED',
    headline: 'HEADLINE_INVALID',
    photo: 'PHOTO_REQUIRED',
    motivation: 'BIO_TOO_SHORT',
    services: 'PRICE_REQUIRED',
  }

  /** „გაგრძელება" was refused. `invalidField` was just set by `fail()`. */
  const onStepBlocked = (step: StepId) => {
    trackApply(APPLY_FUNNEL_EVENTS.blocked, {
      flowId: flowId.current,
      step,
      code: BLOCK_CODE[invalidField.current ?? ''] ?? 'UNKNOWN',
    })
  }

  // Step-completion facts. COUNTS and BOOLEANS only — the applicant's bio and
  // headline are them describing themselves; their length is a funnel signal,
  // the text is not ours to log (same rule as the booking funnel).
  const onStepDone = (done: StepId) => {
    if (done === 1) {
      trackApply(APPLY_FUNNEL_EVENTS.profileDone, {
        flowId: flowId.current,
        step: 1,
        catCount: form.cats.length,
        headlineLen: form.headline.trim().length,
        bioLen: form.motivation.trim().length,
        hasPhone: form.phone.trim().length > 0,
        hasPhoto: !!media.photoUrl,
        certCount: media.certificates.length,
      })
    } else if (done === 2) {
      const paid = form.services.find(sv => !sv.free && sv.price > 0)
      trackApply(APPLY_FUNNEL_EVENTS.pricingDone, {
        flowId: flowId.current,
        step: 2,
        serviceCount: form.services.filter(sv => sv.name.trim()).length,
        priceGel: paid?.price ?? 0,
      })
    }
  }

  const submitApplication = async () => {
    const err = validate()
    if (err) {
      setSubmitError(err)
      focusInvalidField()
      // A CLIENT-side block is still a funnel loss, and knowing it was a block
      // (not a shrug) is the whole point of separating these two events.
      trackApply(APPLY_FUNNEL_EVENTS.failed, { flowId: flowId.current, step: 2, code: 'CLIENT_VALIDATION' })
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const paidService = form.services.find(s => !s.free && s.price > 0)!
      // Custom/niche field falls back into specialty so a not-listed expert is
      // never blocked; it's also stashed in professionData so the admin can
      // review it and promote it to a real category.
      const specialty = form.cats[0] || form.headline.trim().slice(0, 60)
      const body = {
        fullName: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
        phone: form.phone.trim(),
        city: form.city.trim() || undefined,
        specialty,
        yearsExp: Number(form.yearsExp) || 0,
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
          // The one-line pitch the applicant wrote (and saw in the live preview)
          // used to be discarded at submit — the approved profile then showed the
          // category name as its headline. Stash it here so approval can seed the
          // real headline, not re-ask for it.
          if (form.headline.trim()) pd.headline = form.headline.trim()
          // Preserve EVERY service the expert defined (name/desc/duration/price),
          // not just the one paid rate sent as hourlyRate above — these become
          // real Consultation tiers on approval. Previously all but the first
          // paid service were silently dropped at submit.
          const services = form.services
            .filter(s => s.name.trim())
            .map(s => ({ name: s.name.trim(), desc: s.desc.trim(), dur: s.dur, price: s.free ? 0 : s.price, free: !!s.free }))
          if (services.length) pd.services = services
          // The weekly pattern approval materializes into real windows. Sent as
          // day INDEXES (Mon=0) — the same convention as the bulk availability
          // API, so nothing has to translate between them.
          pd.availability = {
            days: form.avail.days.map((on, i) => (on ? i : -1)).filter(i => i >= 0),
            startHour: form.avail.startHour,
            endHour: form.avail.endHour,
            weeks: AVAIL_WEEKS,
          }
          return Object.keys(pd).length ? pd : undefined
        })(),
        // ID doc / selfie removed from onboarding — no KYC gate. The optional
        // diploma/licence attachment from step 3 rides here; `undefined` when
        // nothing was attached, which never blocks the submit.
        // `issuer` rides along: approval already reads it (it writes the real
        // issuer onto the profile's certificate rows instead of a placeholder),
        // but the payload builder dropped it — so the input the applicant filled
        // in had never once reached the server.
        certificates: certificatesPayload(media.certificates),
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
        /* THE SERVER'S OWN SENTENCE COMES FIRST.
         *
         * This is the bug that started the 2026-08-06 pass: the API answered
         * „სახელი და გვარი ქართულად ჩაწერე…" in `message`, and this branch
         * dropped it on the floor, showed „სცადე თავიდან", and the applicant
         * retried the identical payload until they gave up. The API contract is
         * now { error, field, message } — read all three. The fallbacks below
         * only cover a response that predates it, or a code with no message. */
        const msg =
          (typeof data?.message === 'string' && data.message.trim()) ? data.message.trim() :
          code === 'INVALID_VIDEO_URL' ? 'YouTube-ის ბმული არასწორია — შეამოწმე ან ცარიელი დატოვე.' :
          code === 'INVALID' || code === 'INVALID_TEXT' ? 'ერთი ველი არასწორად არის შევსებული — შეამოწმე ფორმა და სცადე თავიდან.' :
          code === 'EMAIL_NOT_VERIFIED' ? 'ჯერ დაადასტურე ელფოსტა პარამეტრებში, შემდეგ გამოგზავნე განაცხადი.' :
          res.status === 429 ? 'ძალიან ბევრი მცდელობა — დაელოდე ერთ წუთს და სცადე თავიდან.' :
          res.status >= 500 ? 'სერვერზე შეცდომაა — შენი ნაწერი შენახულია, სცადე რამდენიმე წუთში.' :
          !res.ok && !code ? 'გაგზავნა ვერ მოხერხდა. თუ დოკუმენტი დაურთე, სცადე უფრო მცირე ზომის ფაილით.' :
          'განაცხადის გაგზავნა ვერ მოხერხდა — სცადე თავიდან.'
        setSubmitError(msg)
        // …and TAKE THEM TO IT. The API names the field in its own vocabulary;
        // SERVER_FIELD maps it onto this form's anchors, and focusInvalidField()
        // changes step if the field lives on a screen they have already left.
        const anchor = SERVER_FIELD[String(data?.field ?? '')]
        if (anchor) {
          invalidField.current = anchor
          setFieldErr({ field: anchor, msg })
          focusInvalidField()
        }
        // The server's own code, so „blocked by a rule" is separable from
        // „gave up". `reason` is a constant the API returned — never a message.
        trackApply(APPLY_FUNNEL_EVENTS.failed, {
          flowId: flowId.current,
          step: 2,
          code: typeof code === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(code) ? code : 'UNKNOWN',
        })
        return
      }
      setSubmitted(true)
      clearApplyDraft()
      trackApply(APPLY_FUNNEL_EVENTS.submitted, { flowId: flowId.current, step: 2 })
    } catch {
      setSubmitError('ქსელის შეცდომა — შეამოწმე კავშირი და სცადე თავიდან.')
      trackApply(APPLY_FUNNEL_EVENTS.failed, { flowId: flowId.current, step: 2, code: 'NETWORK' })
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
    // Honest confirmation: recap what the applicant ACTUALLY submitted (from
    // form state) + honest next steps. No fabricated moderator / auto-score /
    // countdown / file list — those were fiction shown right after the KYC step.
    const specialty = form.headline.trim() || form.cats[0] || 'ექსპერტი'
    const serviceCount = form.services.filter(s => s.name.trim()).length
    const recap: { l: string; v: string }[] = [
      { l: 'მიმართულება', v: specialty },
      ...(form.cats.length ? [{ l: 'სფერო', v: form.cats.join(', ') }] : []),
      ...(form.yearsExp.trim() ? [{ l: 'გამოცდილება', v: `${form.yearsExp} წელი` }] : []),
      ...(serviceCount > 0 ? [{ l: 'სერვისები', v: `${serviceCount} სერვისი` }] : []),
    ]
    return (
      <div className="font-sans bg-ink-50/30 text-ink-900 antialiased min-h-screen flex flex-col">
        <PublicTopBar activeHref="/apply" />
        <Container as="main" size="content" className="flex-1 py-16 lg:py-24">
          <div className="max-w-[560px] mx-auto text-center">
            {/* The illustration REPLACES the green check medallion — a tinted
                disc behind a transparent drawing is the „separate background"
                the illustration rules forbid, and two success graphics stacked
                above one heading reads as a template. */}
            <div className="flex justify-center mb-4 motion-safe:animate-scale-in">
              <Illustration name="expertApplication" alt="" />
            </div>
            <h1 className="font-display text-h1 font-bold tracking-tight">განაცხადი მიღებულია</h1>
            <p className="mt-3 text-body text-ink-600 leading-[1.6]">
              მადლობა! განაცხადს ადამიანი წაიკითხავს და პასუხს ჩვეულებრივ 24–48 საათში მიიღებ — შეტყობინებით, დამტკიცების შემთხვევაში კი ელფოსტითაც.
            </p>

            <div className="mt-8 text-left rounded-card border border-ink-200 bg-white p-5">
              <div className="font-display text-micro font-semibold uppercase text-ink-500 mb-3">შენი განაცხადი</div>
              <dl className="space-y-2.5">
                {recap.map(r => (
                  <div key={r.l} className="flex items-baseline justify-between gap-4 text-small">
                    <dt className="text-ink-500 shrink-0">{r.l}</dt>
                    <dd className="font-display font-semibold text-ink-900 text-right">{r.v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row gap-2.5 justify-center">
              <Link href="/" className="h-11 px-6 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center justify-center transition-colors duration-fast">მთავარზე დაბრუნება</Link>
              <Link href="/tutors" className="h-11 px-5 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-small tracking-wide inline-flex items-center justify-center transition-colors duration-fast">ექსპერტების ნახვა</Link>
            </div>
          </div>
        </Container>
        <Footer />
      </div>
    )
  }

  // Returning applicant who ALREADY submitted and is awaiting review → show the
  // status, not a blank form. (A just-submitted user hits the `submitted` screen
  // above.) They can still choose "edit + re-submit" to reopen the wizard.
  if (appLoaded && appStatus === 'SUBMITTED' && !forceEdit) {
    return (
      <div className="font-sans bg-ink-50/30 text-ink-900 antialiased min-h-screen flex flex-col">
        <PublicTopBar activeHref="/apply" />
        <Container as="main" size="content" className="flex-1 py-16 lg:py-24">
          <div className="max-w-[560px] mx-auto text-center">
            <div className="w-16 h-16 rounded-full bg-brand-50 text-brand-700 inline-flex items-center justify-center mb-6 motion-safe:animate-scale-in">
              <Icon.clock className="w-8 h-8" />
            </div>
            <h1 className="font-display text-h1 font-bold tracking-tight">განაცხადი განიხილება</h1>
            <p className="mt-3 text-body text-ink-600 leading-[1.6]">
              განაცხადი მიღებულია და განხილვის რიგშია — თავიდან შევსება არ სჭირდება. პასუხს ჩვეულებრივ 24–48 საათში მიიღებ.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-2.5 justify-center">
              <Link href="/" className="h-11 px-6 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center justify-center transition-colors duration-fast">მთავარზე დაბრუნება</Link>
              <button type="button" onClick={() => setForceEdit(true)} className="h-11 px-5 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-small tracking-wide inline-flex items-center justify-center transition-colors duration-fast">რედაქტირება და თავიდან გაგზავნა</button>
            </div>
          </div>
        </Container>
        <Footer />
      </div>
    )
  }

  // Sent back for correction → NEEDS_REVISION. Softer than a reject: the applicant
  // keeps their draft and just fixes what the moderator flagged (e.g. „სახელი
  // ქართულად ჩაწერე"), then re-submits (the /apply POST resets them to SUBMITTED).
  // Mirrors the SUBMITTED/APPROVED short-circuit; „შეასწორე…" reveals the wizard.
  if (appLoaded && appStatus === 'NEEDS_REVISION' && !forceEdit) {
    return (
      <div className="font-sans bg-ink-50/30 text-ink-900 antialiased min-h-screen flex flex-col">
        <PublicTopBar activeHref="/apply" />
        <Container as="main" size="content" className="flex-1 py-16 lg:py-24">
          <div className="max-w-[560px] mx-auto text-center">
            <div className="w-16 h-16 rounded-full bg-warning-50 text-warning-700 inline-flex items-center justify-center mb-6 motion-safe:animate-scale-in">
              <Icon.edit className="w-8 h-8" />
            </div>
            <h1 className="font-display text-h1 font-bold tracking-tight">საჭიროა შესწორება</h1>
            <p className="mt-3 text-body text-ink-600 leading-[1.6]">
              განაცხადი უარყოფილი არ არის — შეასწორე მითითებული და თავიდან გამოგზავნე.
            </p>
            {appNote?.trim() && (
              <div className="mt-6 text-left rounded-card border border-warning-200 bg-warning-50 px-4 py-3">
                <div className="font-display text-micro font-bold uppercase text-warning-700">რა უნდა შესწორდეს</div>
                <p className="mt-1.5 text-body text-ink-800 whitespace-pre-wrap">{appNote}</p>
              </div>
            )}
            <div className="mt-8 flex flex-col sm:flex-row gap-2.5 justify-center">
              <button type="button" onClick={() => setForceEdit(true)} className="h-11 px-6 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center justify-center transition-colors duration-fast">შეასწორე და თავიდან გააგზავნე</button>
              <Link href="/" className="h-11 px-5 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-small tracking-wide inline-flex items-center justify-center transition-colors duration-fast">მთავარზე დაბრუნება</Link>
            </div>
          </div>
        </Container>
        <Footer />
      </div>
    )
  }

  // Already an approved expert (or promoted to TUTOR) → the wizard is a dead end
  // for them (the API rejects non-students with ONLY_STUDENTS_CAN_APPLY). Show a
  // friendly "you're already an expert" screen instead of a blank form + generic
  // submit error.
  if (appLoaded && appStatus === 'APPROVED') {
    return (
      <div className="font-sans bg-ink-50/30 text-ink-900 antialiased min-h-screen flex flex-col">
        <PublicTopBar activeHref="/apply" />
        <Container as="main" size="content" className="flex-1 py-16 lg:py-24">
          <div className="max-w-[560px] mx-auto text-center">
            <div className="w-16 h-16 rounded-full bg-success-100 text-success-700 inline-flex items-center justify-center mb-6 motion-safe:animate-scale-in">
              <Icon.check className="w-8 h-8" />
            </div>
            <h1 className="font-display text-h1 font-bold tracking-tight">შენ უკვე ექსპერტი ხარ</h1>
            <p className="mt-3 text-body text-ink-600 leading-[1.6]">
              განაცხადი დამტკიცებულია. გამოაქვეყნე თავისუფალი დრო, რომ დაჯავშნა შესაძლებელი გახდეს.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-2.5 justify-center">
              <Link href="/tutor/profile" className="h-11 px-6 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center justify-center transition-colors duration-fast">გახსენი პროფილი</Link>
              <Link href="/tutor" className="h-11 px-5 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-small tracking-wide inline-flex items-center justify-center transition-colors duration-fast">ჩემი სივრცე</Link>
            </div>
          </div>
        </Container>
        <Footer />
      </div>
    )
  }

  return (
    <div className="font-sans bg-ink-50/50 text-ink-900 antialiased min-h-[1000px] flex flex-col">
      <PublicTopBar activeHref="/apply" />

      {/* Top horizontal progress (mobile + desktop) */}
      <div className="border-b border-ink-200 bg-white">
        <Container className="py-4">
          <div className="lg:hidden mb-3">
            <span className="text-meta text-ink-500 tabular-nums">ნაბიჯი {step} / 2</span>
          </div>
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => {
              const isDone = completed.has(s.id)
              const isActive = step === s.id
              return (
                <React.Fragment key={s.id}>
                  <button type="button" onClick={() => jumpToStep(s.id)} className="group flex items-center gap-2 min-h-[44px]">
                    <span className={`w-9 h-9 sm:w-7 sm:h-7 shrink-0 rounded-full inline-flex items-center justify-center font-display text-small sm:text-meta font-bold tabular-nums transition-all duration-fast ${
                      isDone ? 'bg-brand-600 text-white shadow-xs' :
                      isActive ? 'bg-brand-600 text-white ring-4 ring-brand-500/15 shadow-sm' :
                      'bg-white border-2 border-ink-200 text-ink-400 group-hover:border-ink-300'
                    }`}>
                      {isDone ? <Icon.check className="w-4 h-4 sm:w-3.5 sm:h-3.5" /> : s.id}
                    </span>
                    <span className={`hidden lg:inline font-display text-meta font-semibold tracking-tight transition-colors duration-fast ${isActive ? 'text-brand-800' : isDone ? 'text-ink-900' : 'text-ink-500'}`}>{s.l}</span>
                  </button>
                  {i < STEPS.length - 1 && <span className={`flex-1 h-[3px] rounded-full transition-colors duration-fast ${isDone ? 'bg-brand-400' : 'bg-ink-100'}`} />}
                </React.Fragment>
              )
            })}
          </div>
        </Container>
      </div>

      {/* NOT a <Container>, deliberately: this is the layout FRAME, and its
          gutter belongs to its children. <ProgressNav> is a bordered white rail
          that must sit flush against the column edge — Container always pads,
          which would inset the rail and leave its `border-r` floating. The
          gutter is applied by <main> below instead. Width matched to the canon
          column (1280) so the rail stays aligned with the step circles above,
          which DO go through Container. */}
      <div className="flex-1 max-w-[1280px] mx-auto w-full flex">
        <ProgressNav step={step} setStep={jumpToStep} completed={completed} />

        <main className="flex-1 min-w-0 px-6 lg:px-8 py-8 lg:py-10">
          <div className="max-w-[720px]">
            {draftRestored && (
              <div
                role="status"
                aria-live="polite"
                className="mb-4 rounded-card border border-brand-200 bg-brand-50 text-brand-900 px-4 py-2.5 flex items-center gap-3 motion-safe:transition-opacity motion-safe:duration-fast"
              >
                <span className="font-display text-small font-semibold tracking-tight">
                  შენახული მონახაზი აღდგა
                </span>
                <button
                  type="button"
                  onClick={clearDraftAndReset}
                  className="ml-auto h-8 px-3 rounded-btn bg-white border border-brand-200 hover:border-brand-300 text-brand-700 hover:text-brand-800 font-display font-semibold text-meta tracking-wide inline-flex items-center motion-safe:transition-colors motion-safe:duration-fast"
                >
                  დაიწყე თავიდან
                </button>
                <button
                  type="button"
                  onClick={() => setDraftRestored(false)}
                  aria-label="დახურვა"
                  className="w-7 h-7 rounded-full text-brand-700 hover:bg-brand-100 inline-flex items-center justify-center motion-safe:transition-colors motion-safe:duration-fast"
                >
                  <Icon.x className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {/* Email-verification banner removed: signup no longer sends an OTP and
                the applications API does NOT require a verified email, so this was
                a false blocker that navigated users out of the wizard (losing
                their uploads). Verification is not part of the apply flow. */}
            {appStatus === 'REJECTED' && (
              <div role="alert" className="mb-4 rounded-card border border-danger-200 bg-danger-50 px-4 py-3">
                <div className="font-display text-small font-bold text-danger-900">წინა განაცხადი უარყოფილია</div>
                <p className="text-meta text-danger-800 mt-1 leading-[1.5]">
                  {appNote?.trim()
                    ? <>მიზეზი: <span className="font-semibold">{appNote}</span>. გაითვალისწინე და თავიდან გამოგზავნე.</>
                    : <>შეასწორე და თავიდან გააგზავნე.</>}
                </p>
              </div>
            )}
            {appStatus === 'NEEDS_REVISION' && (
              <div role="alert" className="mb-4 rounded-card border border-warning-200 bg-warning-50 px-4 py-3">
                <div className="font-display text-small font-bold text-warning-800">საჭიროა შესწორება</div>
                <p className="text-meta text-ink-800 mt-1 leading-[1.5]">
                  {appNote?.trim()
                    ? <>შესასწორებელია: <span className="font-semibold">{appNote}</span>. შემდეგ თავიდან გააგზავნე.</>
                    : <>შეასწორე და თავიდან გააგზავნე.</>}
                </p>
              </div>
            )}
            <ApplyErrCtx.Provider value={fieldErr}>
              {step === 1 && <Step1 form={form} set={set} media={media} setMedia={setMediaPatch} />}
              {step === 2 && <Step2 form={form} set={set} />}
            </ApplyErrCtx.Provider>

            {submitError && (
              <div role="alert" className="mt-3 rounded-btn border border-danger-200 bg-danger-50 text-danger-800 px-3 py-2 text-small font-medium leading-[1.45] break-words">
                {submitError}
              </div>
            )}

            <FormFooter step={step} setStep={setStep} part={part} setPart={setPart} completed={completed} setCompleted={setCompleted} onSubmit={submitApplication} submitting={submitting} validateStep={validateStep} onError={onStepError} onStepDone={onStepDone} onBlocked={onStepBlocked} />
          </div>
        </main>

        <LivePreview step={step} form={form} />
      </div>

      {/* The wizard's own next/back bar is `max-lg:sticky bottom-0` INSIDE the
          form column, so it unpins the moment the form ends — it never covers
          the site footer, and the footer never hides the last field. */}
      <Footer />
    </div>
  )
}



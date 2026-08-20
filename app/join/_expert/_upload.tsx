'use client'
// /apply — every upload on the form: the photo, the optional diploma
// attachments, the shared POST helper and the certificate payload builder.

import React, { useState, useRef } from 'react'
import { Icon } from '@/components/Icon'
import { useAvatarCropper } from '@/components/AvatarCropper'
import { Input } from './_fields'

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
export const PhotoUploader = ({ value, onChange }: { value?: string; onChange: (url?: string) => void }) => {
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
export const CertificateUploader = ({ items, onChange }: {
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

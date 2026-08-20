'use client'
// PHOTOS OF FINISHED WORK — the site's first multi-image upload.
//
// ⚠️ WHY THIS IS NOT `CertificateUploader` REUSED. That one collects
// { title, issuer, url } triples and asks the applicant to name each file,
// because a diploma without an issuer is unverifiable. A photo of a finished
// bathroom needs no title, and asking for one per photo is six text fields
// nobody fills — so this is a grid of thumbnails with a delete on each and
// nothing else.
//
// ⚠️ SEQUENTIAL, NOT PARALLEL, and it is not a style choice: /api/uploads rate
// limits at 20 uploads per minute per user. Firing six at once from a picker is
// a third of the budget in one gesture, and a 429 mid-batch would leave the
// applicant with a partial set and an error that reads as our fault.
//
// ⚠️ `kind: 'attachment'` — 1600px longest edge, JPEG q82, 8MB ceiling, magic-
// byte sniffed. NOT 'avatar', which would overwrite the applicant's profile
// photo as a side effect of uploading a picture of a pipe.

import { useRef, useState } from 'react'
import { Icon } from '@/components/Icon'

export function WorkPhotos({ value, onChange, max }: {
  value: string[]
  onChange: (v: string[]) => void
  max: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const left = Math.max(0, max - value.length)

  async function pick(files: FileList | null) {
    if (!files || files.length === 0) return
    setErr(null); setBusy(true)
    const taken = Array.from(files).slice(0, left)
    const added: string[] = []
    for (const f of taken) {
      try {
        const fd = new FormData()
        fd.append('kind', 'attachment')
        fd.append('file', f)
        const res = await fetch('/api/uploads', { method: 'POST', body: fd })
        const d = await res.json().catch(() => null)
        if (!res.ok || !d?.ok || !d.url) {
          setErr(
            d?.error === 'TOO_LARGE' ? 'ფოტო ძალიან დიდია — მაქსიმუმ 8MB'
              : d?.error === 'RATE_LIMITED' ? 'ბევრი ატვირთვა — დაელოდე ერთ წუთს'
              : 'ფოტო ვერ აიტვირთა',
          )
          break
        }
        added.push(d.url)
      } catch {
        setErr('ფოტო ვერ აიტვირთა')
        break
      }
    }
    // Whatever succeeded is kept. Dropping the whole batch because the fifth
    // file failed would throw away four good uploads and the minute they cost.
    if (added.length) onChange([...value, ...added])
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      {value.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {value.map((u, i) => (
            <div key={u.slice(0, 64) + i} className="relative aspect-square rounded-card overflow-hidden border border-ink-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                aria-label="ფოტოს წაშლა"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="absolute top-1.5 right-1.5 w-9 h-9 rounded-full bg-white/90 border border-ink-200 inline-flex items-center justify-center text-ink-600 hover:text-danger-700 transition-colors duration-fast"
              >
                <Icon.x className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || left === 0}
          onClick={() => inputRef.current?.click()}
          className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-small inline-flex items-center gap-1.5 transition-colors duration-fast disabled:opacity-60"
        >
          <Icon.upload className="w-3.5 h-3.5" />
          {busy ? 'იტვირთება…' : 'ფოტოს დამატება'}
        </button>
        <span className="text-meta text-ink-500 tabular-nums">
          {value.length} / {max}
        </span>
      </div>

      {err && <p className="mt-2 text-meta text-danger-700">{err}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={e => pick(e.target.files)}
      />
    </div>
  )
}

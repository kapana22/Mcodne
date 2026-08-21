'use client'
// AvatarCropper — the ONE place a profile photo gets framed before upload.
//
// Why it exists: `/api/uploads` used to centre-crop whatever arrived, so one
// expert's head landed at the frame edge and another got mostly background.
// The browse card renders a 128px square, which makes bad framing obvious.
// Now the client always sends a square the user framed themselves.
//
// Contract:
//   • Output is ALWAYS a square `AVATAR_OUTPUT_PX` JPEG (white-matted, so a
//     transparent PNG can't come out black). The server re-encodes it to webp.
//   • Sources shorter than `AVATAR_MIN_SOURCE_PX` on the short edge are refused
//     — we never silently upscale a thumbnail into a blurry banner.
//   • Cancel never touches the existing avatar: the upload only runs after the
//     user confirms the crop.
//
// Usage (all three upload surfaces go through this — don't hand-roll a fourth):
//   const { open, ui } = useAvatarCropper({ onCropped: file => upload(file) })
//   <button onClick={open}>ავატარის შეცვლა</button>
//   {ui}
//
// `ui` renders the hidden <input type="file"> AND the crop dialog, so it must be
// mounted once wherever the trigger lives.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Sheet } from '@/components/Sheet'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'

// 512px: the card renders a 128px square, so a 3× DPR phone wants 384px and a
// 2× desktop retina 256px. 512 covers both with headroom. Raising this means
// re-checking `AVATAR_MAX` in lib/stripTutorBlobs.ts — that guard nulls any
// stored avatar whose base64 exceeds it.
const AVATAR_OUTPUT_PX = 512
// Half the output. Below this we'd be upscaling more than 2×, which reads as
// mush at 128px. Refuse instead.
const AVATAR_MIN_SOURCE_PX = 256
// Mirrors MAX_IMAGE_BYTES in app/api/uploads/route.ts so the „მაქს. 8MB" copy
// on the profile editors stays literally true.
const MAX_SOURCE_BYTES = 8 * 1024 * 1024
// GIF is deliberately absent: a canvas export would flatten it to one frame, so
// accepting it would promise something we don't deliver.
const ACCEPT = 'image/jpeg,image/png,image/webp'

const MAX_ZOOM = 3
const NUDGE_PX = 12

type Loaded = { img: HTMLImageElement; w: number; h: number }
type Phase =
  | { k: 'idle' }
  | { k: 'loading' }
  | { k: 'error'; msg: string }
  | ({ k: 'ready' } & Loaded)

function readFile(file: File): Promise<Phase> {
  if (file.size > MAX_SOURCE_BYTES) {
    return Promise.resolve({ k: 'error', msg: 'ფაილი 8MB-ზე დიდია — აირჩიე უფრო მსუბუქი ფოტო.' })
  }
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      if (Math.min(w, h) < AVATAR_MIN_SOURCE_PX) {
        URL.revokeObjectURL(url)
        resolve({
          k: 'error',
          msg: `ეს ფოტო ძალიან პატარაა (${w}×${h}). მინიმუმი ${AVATAR_MIN_SOURCE_PX}×${AVATAR_MIN_SOURCE_PX}-ია — უფრო პატარა პროფილზე დაბინდული გამოჩნდება.`,
        })
        return
      }
      resolve({ k: 'ready', img, w, h })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({ k: 'error', msg: 'ფოტო ვერ წავიკითხე — სცადე სხვა ფაილი (JPG, PNG ან WebP).' })
    }
    img.src = url
  })
}

type CropperProps = {
  file: File | null
  onCancel: () => void
  onReselect: () => void
  onCropped: (file: File) => void | Promise<void>
}

function AvatarCropperSheet({ file, onCancel, onReselect, onCropped }: CropperProps) {
  const [phase, setPhase] = useState<Phase>({ k: 'idle' })
  const [frame, setFrame] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [off, setOff] = useState({ x: 0, y: 0 })
  const [saving, setSaving] = useState(false)
  const frameRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)

  // Decode + validate whenever a new file is picked. The object URL stays alive
  // for as long as the dialog shows the image; it's revoked on teardown.
  useEffect(() => {
    if (!file) { setPhase({ k: 'idle' }); return }
    let alive = true
    setPhase({ k: 'loading' })
    let src: string | null = null
    readFile(file).then(p => {
      if (p.k === 'ready') src = p.img.src
      if (!alive) { if (src) URL.revokeObjectURL(src); return }
      setPhase(p)
    })
    return () => { alive = false; if (src) URL.revokeObjectURL(src) }
  }, [file])

  // The frame is fluid (320px desktop, viewport-width minus gutters on a 390px
  // phone) and every offset is expressed in frame pixels, so measure it.
  useLayoutEffect(() => {
    const el = frameRef.current
    if (!el) { setFrame(0); return }
    const read = () => setFrame(el.clientWidth)
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [phase.k])

  // Centre the image (cover-fit, zoom 1) on load and on any frame resize.
  useEffect(() => {
    if (phase.k !== 'ready' || !frame) return
    const base = frame / Math.min(phase.w, phase.h)
    setZoom(1)
    setOff({ x: (frame - phase.w * base) / 2, y: (frame - phase.h * base) / 2 })
  }, [phase, frame])

  const ready = phase.k === 'ready' ? phase : null
  const baseScale = ready && frame ? frame / Math.min(ready.w, ready.h) : 0
  const scale = baseScale * zoom
  const dw = ready ? ready.w * scale : 0
  const dh = ready ? ready.h * scale : 0

  // The image must always cover the frame: never let a gap open at any edge.
  const clamp = useCallback(
    (x: number, y: number, w: number, h: number) => ({
      x: Math.max(frame - w, Math.min(0, x)),
      y: Math.max(frame - h, Math.min(0, y)),
    }),
    [frame],
  )

  const applyZoom = (z: number) => {
    if (!ready || !frame) return
    const next = Math.min(MAX_ZOOM, Math.max(1, z))
    const sOld = baseScale * zoom
    const sNew = baseScale * next
    // Keep whatever sits under the frame's centre pinned there while zooming.
    const cx = (frame / 2 - off.x) / sOld
    const cy = (frame / 2 - off.y) / sOld
    setZoom(next)
    setOff(clamp(frame / 2 - cx * sNew, frame / 2 - cy * sNew, ready.w * sNew, ready.h * sNew))
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ready) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { px: e.clientX, py: e.clientY, ox: off.x, oy: off.y }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || !ready) return
    setOff(clamp(d.ox + (e.clientX - d.px), d.oy + (e.clientY - d.py), dw, dh))
  }
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already released */ }
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!ready) return
    const map: Record<string, [number, number]> = {
      ArrowLeft: [-NUDGE_PX, 0], ArrowRight: [NUDGE_PX, 0],
      ArrowUp: [0, -NUDGE_PX], ArrowDown: [0, NUDGE_PX],
    }
    const d = map[e.key]
    if (d) { e.preventDefault(); setOff(clamp(off.x + d[0], off.y + d[1], dw, dh)); return }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); applyZoom(zoom + 0.2) }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); applyZoom(zoom - 0.2) }
  }

  const save = async () => {
    if (!ready || !frame || saving) return
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_OUTPUT_PX
    canvas.height = AVATAR_OUTPUT_PX
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // White matte first: the export is JPEG, and a transparent PNG drawn onto a
    // bare canvas would come out with black wherever alpha was 0.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, AVATAR_OUTPUT_PX, AVATAR_OUTPUT_PX)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    // Frame → source coordinates. `side` is the frame's edge measured in source
    // pixels; the offsets are negative, hence the sign flip.
    const side = frame / scale
    ctx.drawImage(ready.img, -off.x / scale, -off.y / scale, side, side, 0, 0, AVATAR_OUTPUT_PX, AVATAR_OUTPUT_PX)
    setSaving(true)
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.92))
    if (!blob) { setSaving(false); setPhase({ k: 'error', msg: 'ფოტოს დამუშავება ვერ მოხერხდა — სცადე თავიდან.' }); return }
    try {
      await onCropped(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={!!file}
      onClose={onCancel}
      title="ფოტოს მორგება"
      eyebrow="პროფილის ფოტო"
      size="sm"
      busy={saving}
      footer={
        phase.k === 'error' ? (
          <>
            <Btn variant="ghost" onClick={onCancel}>გაუქმება</Btn>
            <Btn variant="secondary" onClick={onReselect}>სხვა ფოტო</Btn>
          </>
        ) : (
          <>
            <Btn variant="ghost" onClick={onCancel} disabled={saving}>გაუქმება</Btn>
            <Btn onClick={save} loading={saving} disabled={!ready}>შენახვა</Btn>
          </>
        )
      }
    >
      {phase.k === 'error' ? (
        <p className="text-small text-danger-700 leading-relaxed py-2">{phase.msg}</p>
      ) : (
        <div>
          <p className="text-small text-ink-600 leading-[1.55] mb-3">
            გადაათრიე ფოტო და მოარგე მასშტაბი — სახემ წრე შეავსოს.
          </p>

          <div
            ref={frameRef}
            role="group"
            aria-label="ფოტოს კადრირება"
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onKeyDown}
            data-testid="crop-frame"
            className="relative w-full max-w-[320px] mx-auto aspect-square rounded-card overflow-hidden bg-ink-100 touch-none select-none cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            {ready && frame > 0 && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={ready.img.src}
                alt=""
                draggable={false}
                data-testid="crop-image"
                style={{ width: dw, height: dh, transform: `translate(${off.x}px, ${off.y}px)` }}
                className="absolute top-0 left-0 max-w-none origin-top-left pointer-events-none"
              />
            )}
            {/* Guide: everything outside the circle is dimmed by an oversized
                ring-shadow, so the rule („სახე წრეში") reads without a caption. */}
            <div
              aria-hidden="true"
              className="absolute inset-[6%] rounded-full border border-white/85 pointer-events-none"
              style={{ boxShadow: '0 0 0 9999px rgba(28,26,23,0.46)' }}
            />
            {phase.k === 'loading' && (
              <div className="absolute inset-0 inline-flex items-center justify-center text-ink-500 text-small">
                იტვირთება…
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2 max-w-[320px] mx-auto">
            <button
              type="button"
              onClick={() => applyZoom(zoom - 0.25)}
              disabled={!ready || zoom <= 1}
              aria-label="დაშორება"
              className="w-10 h-10 shrink-0 rounded-btn border border-ink-200 bg-white text-ink-700 hover:bg-ink-50 inline-flex items-center justify-center transition-colors duration-fast disabled:opacity-40"
            >
              <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14" /></svg>
            </button>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              disabled={!ready}
              aria-label="მასშტაბი"
              data-testid="crop-zoom"
              onChange={e => applyZoom(Number(e.target.value))}
              className="flex-1 h-10 accent-brand-500 cursor-pointer disabled:opacity-40"
            />
            <button
              type="button"
              onClick={() => applyZoom(zoom + 0.25)}
              disabled={!ready || zoom >= MAX_ZOOM}
              aria-label="მიახლოება"
              className="w-10 h-10 shrink-0 rounded-btn border border-ink-200 bg-white text-ink-700 hover:bg-ink-50 inline-flex items-center justify-center transition-colors duration-fast disabled:opacity-40"
            >
              <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </div>

          <button
            type="button"
            onClick={onReselect}
            className="mt-3 mx-auto block h-11 px-3 rounded-btn text-ink-600 hover:text-ink-900 hover:bg-ink-100 font-display font-semibold text-meta transition-colors duration-fast"
          >
            <span className="inline-flex items-center gap-1.5"><Icon.refresh className="w-3.5 h-3.5" /> სხვა ფოტო</span>
          </button>
        </div>
      )}
    </Sheet>
  )
}

/**
 * Wires a trigger button to the shared crop dialog.
 * `onCropped` receives a square `AVATAR_OUTPUT_PX` JPEG File ready to POST as
 * `kind=avatar`; throw or resolve — the dialog closes once it resolves.
 */
export function useAvatarCropper({ onCropped }: { onCropped: (file: File) => void | Promise<void> }): {
  open: () => void
  ui: ReactNode
} {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  // Consumers pass an inline arrow, so read it through a ref — otherwise the
  // dialog would close over a stale handler after any parent re-render.
  const croppedRef = useRef(onCropped)
  useEffect(() => { croppedRef.current = onCropped })

  const open = useCallback(() => inputRef.current?.click(), [])

  const ui = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        data-testid="avatar-file-input"
        // Reset the value so re-picking the SAME file still fires onChange.
        onChange={e => { const f = e.target.files?.[0] ?? null; e.target.value = ''; setFile(f) }}
      />
      <AvatarCropperSheet
        file={file}
        onCancel={() => setFile(null)}
        onReselect={open}
        onCropped={async f => { await croppedRef.current(f); setFile(null) }}
      />
    </>
  )

  return { open, ui }
}

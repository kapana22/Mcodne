'use client'
// „ვინ ვარ" — THE MASTER'S HALF OF THE PROFILE.
//
// ⚠️ IT WAS INSIDE „ჩემი სერვისები" UNTIL 2026-08-21, AND THAT IS THE SPLIT THE
// OWNER KEPT POINTING AT. „ეს სივრცე ძველებურად არის მოწყობილი, კონსულტაციაზეა
// აგებული." The workspace grew as an EXPERT's workspace and the service pages
// were added beside it, so the two halves answered the same two questions in
// different places:
//
//     ვინ ვარ?     expert → /work/profile        master → inside /work/services
//     რას ვყიდი?   expert → /work/services       master → /work/services
//
// So the rail carried „პროფილი" AND „ჩემი სერვისები" and, for a master, the
// second one was both — a page called „my services" that opened with a photo
// upload and a paragraph about themselves. One question per page, the same two
// pages for everybody: this file is the master's answer to the first, and
// app/work/services keeps the second.
//
// ⚠️ IT WRITES THROUGH THE SERVICE PROFILE'S OWN ENDPOINT, AND IT SENDS ONE
// FIELD (2026-08-29). Until that day the endpoint REQUIRED the five core
// fields, so this form loaded the whole row and sent it back with only the
// photos edited — which meant it also wrote back the `available`, `services`,
// `areas` and `about` it had read ON MOUNT, over whatever had changed since.
// One of those is a switch on this very page. See lib/serviceProfile →
// ServiceProfileInput for the sequence that flipped a hidden profile public.
//
// Every field is optional now and absent means leave it alone, so the rule is
// the plain one: a form sends what it draws, and nothing else.
//
// ⚠️ AND THE STORED PHOTOS ARE TOKENS, NEVER BYTES. `kept:<n>` stands for „the
// n-th photo you already hold" — the endpoint resolves it (see the route). A
// form that had to receive six base64 images to let somebody delete one would
// ship a megabyte on every open.

import { useCallback, useEffect, useState } from 'react'
import { WorkPhotos } from '@/app/join/_master/_workPhotos'
import { Btn } from '@/components/Btn'
import { Card } from '@/components/Card'
import { MAX_WORK_PHOTOS } from '@/lib/serviceProfile'
import { useUnsavedGuard } from '@/lib/useUnsavedGuard'

type Loaded = {
  id: string | null
  stamp: string
  photos: string[]
}

export function MasterProfileEditor() {
  const [data, setData] = useState<Loaded | null>(null)
  const [photos, setPhotos] = useState<string[]>([])
  /** The last-saved list, so „is there unsaved work here" is answerable. */
  const [savedPhotos, setSavedPhotos] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)
  /** What the save just paid for („20₾"), straight from the endpoint. */
  const [earned, setEarned] = useState<string[]>([])

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/provider/service-profile', { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) { setError('ვერ ჩაიტვირთა.'); return }
      const p = j.profile ?? {}
      const count: number = Number(j.workPhotoCount) || 0
      setData({
        id: p.id ?? null,
        stamp: p.updatedAt ?? '',
        photos: Array.from({ length: count }, (_, i) => `kept:${i}`),
      })
      setPhotos(Array.from({ length: count }, (_, i) => `kept:${i}`))
      setSavedPhotos(Array.from({ length: count }, (_, i) => `kept:${i}`))
    } catch {
      setError('ვერ ჩაიტვირთა.')
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ⚠️ THIS FORM WAS OUTSIDE THE GUARD UNTIL 2026-08-29, AND IT IS THE HALF OF
  // THE PAGE HOLDING UPLOADS. `useUnsavedGuard` was called once, in
  // _expertClient, over the TABS' form state — so the tabs above warned before
  // a stray click on the rail and the six work photos underneath them went
  // without a word. Same hook, same sentence, one per form; it must sit here,
  // above the early returns, or React counts a different number of hooks
  // before and after the fetch (#310).
  const dirty = JSON.stringify(photos) !== JSON.stringify(savedPhotos)
  useUnsavedGuard(dirty, 'შენახული არ არის — თუ გახვალ, ცვლილებები დაიკარგება. მაინც გავიდე?')

  if (error && !data) return <p className="text-body text-danger-700">{error}</p>
  if (!data) return <p className="text-body text-ink-500">იტვირთება…</p>

  const touch = () => {
    if (status === 'saved') { setStatus('idle'); setEarned([]) }
    setError(null)
  }

  /** A stored photo draws through the public route by index; a fresh one is
   *  already a data URI and draws itself. `?v=` busts the year-long cache. */
  const photoSrc = (v: string, i: number) =>
    v.startsWith('kept:') && data.id
      ? `/api/masters/${data.id}/photo?n=${v.slice(5)}&v=${data.stamp}-${i}`
      : v

  const save = async () => {
    setStatus('saving'); setError(null)
    try {
      const r = await fetch('/api/provider/service-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // ⚠️ ONE FIELD, BECAUSE THIS FORM DRAWS ONE THING (2026-08-29). It used
        // to send `...data.core` — services, areas, calloutFee, priceFrom,
        // available — plus `about` and `photoUrl`, none of which it has a
        // control for. What it sent was therefore whatever the row held WHEN
        // THIS COMPONENT MOUNTED, and it wrote that over anything changed
        // since. Two of those were reachable in one sitting:
        //
        //   · hide the profile in the ხილვადობა tab ABOVE THIS FORM, then add
        //     a work photo and save → `available: true` went back over it and
        //     the provider was public and routable again, silently;
        //   · edit the bio in the tab above, save, then save here → the old
        //     paragraph came back.
        //
        // The endpoint's fields are all optional now and absent means leave it
        // alone, so this is the whole body.
        body: JSON.stringify({ workPhotos: photos }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) {
        setError(j?.detail ?? 'ვერ შეინახა.')
        setStatus('idle')
        return
      }
      const count: number = typeof j.workPhotoCount === 'number' ? j.workPhotoCount : photos.length
      const next = Array.from({ length: count }, (_, i) => `kept:${i}`)
      setData(d => (d ? { ...d, stamp: j.profile?.updatedAt ?? d.stamp, photos: next } : d))
      setPhotos(next)
      setSavedPhotos(next)
      setEarned(Array.isArray(j.earned) ? j.earned.map((e: { label: string }) => e.label) : [])
      setStatus('saved')
    } catch {
      setError('ვერ შეინახა.')
      setStatus('idle')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ⚠️ THE FACE UPLOADER WAS HERE AND IT WAS THE SECOND ONE (removed
          2026-08-29). This card wrote `ServiceProfile.photoUrl` under the words
          „ფოტო — ეს ჩანს კლიენტთან, სიაში", while the ავატარი block in the tabs
          above wrote `User.avatarUrl` under „ატვირთე პროფილის ფოტო". Two
          uploaders, one face, both claiming to be the public one — and only one
          of them was, silently: app/experts/_providers.ts prefers `photoUrl`
          and falls back to the avatar. So a provider could replace their photo
          in the block the completeness checklist scores, be told they were
          finished, and keep showing the old face in the catalogue.

          One uploader now, the avatar, and /api/uploads drops `photoUrl` when a
          new one is picked so the fallback takes over. The column stays — 27
          migrated professionals have never written it and their cards read
          through it — this page simply no longer offers a second way to set
          the same thing.

          ⚠️ „შენ შესახებ" WAS ALSO HERE AND MOVED UP THE PAGE (2026-08-24). The
          paragraph is one column (`about`) and it had two editors on the same
          screen once the two profiles became one row — this card and the
          „ბიოგრაფია" field in the tabs above. The tab keeps it, with the longer
          guidance it already carried; this form no longer sends the field at
          all, and the endpoint leaves absent fields alone, so neither can blank
          the other. */}

      <Card>
        <h2 className="font-display text-h3 font-bold text-ink-900">ნამუშევრის ფოტოები</h2>
        <p className="mt-1 text-small text-ink-600">
          შესრულებული სამუშაო ყველაზე კარგი მტკიცებულებაა. მაქსიმუმ {MAX_WORK_PHOTOS}.
        </p>
        <div className="mt-4">
          <WorkPhotos
            // Display only: what the form keeps is the token or the data URI.
            value={photos.map((v, i) => photoSrc(v, i))}
            onChange={next => {
              touch()
              setPhotos(next.map(src => photos.find((v, i) => photoSrc(v, i) === src) ?? src))
            }}
            max={MAX_WORK_PHOTOS}
          />
        </div>
      </Card>

      {error && (
        <div role="alert" className="rounded-field border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-body text-danger-700">
          {error}
        </div>
      )}

      {/* The same bar the other two long forms carry — see
          app/work/services/_trades.tsx for why it is sticky and why the copy is
          not re-invented here. This form is short, but it sits at the BOTTOM of
          a tabbed page, so its button is reached by the same long scroll. */}
      <div className="sticky bottom-0 -mx-6 sm:-mx-8 px-6 sm:px-8 py-3 border-t border-ink-100 bg-white flex items-center justify-between gap-3">
        <span
          className={`text-meta font-display font-semibold ${dirty ? 'text-warning-700' : 'text-ink-400'}`}
          aria-live="polite"
        >
          {status === 'saving' ? 'ინახება…' : dirty ? 'შეუნახავი ცვლილებები' : 'ყველაფერი შენახულია'}
        </span>
        <Btn onClick={save} disabled={status === 'saving' || !dirty} aria-busy={status === 'saving'}>
          {status === 'saving' ? 'ინახება…' : dirty ? 'შეინახე ცვლილებები' : 'შენახულია ✓'}
        </Btn>
      </div>

      {/* The grant, said where it was earned. The wording is the sanctioned one
          (lib/credits, SAY / NEVER SAY): a balance that buys offers, never
          money owed. */}
      {status === 'saved' && earned.length > 0 && (
        <div className="rounded-card border border-brand-200 bg-brand-50 px-4 py-3">
          <p className="text-body text-brand-800">
            <b className="font-display font-semibold">+{earned.join(' +')}</b> ბალანსზე დაგერიცხა.
          </p>
        </div>
      )}
    </div>
  )
}

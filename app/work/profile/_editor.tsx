'use client'
// ONE EDITOR FOR ONE ROW — „ჩემი გვერდი".
//
// ⚠️ WHY THIS FILE EXISTS (2026-08-30). Owner, looking at the rail: „ჩემი
// სერვისები / პროფილი — ეს ორი არის და შიგნით ერთი და იგივე ინფოს აკეთებს
// თითქოს და რატომ, თან არცერთი მხარე არაა კომფორტულად მოწყობილი."
//
// It was exactly true, and the cause was mechanical: on 2026-08-24 `TutorProfile`
// was absorbed into `ServiceProfile` — two tables became one row — and the two
// SCREENS that edited them stayed two. So a provider met the same thing twice,
// five ways over:
//
//   · `available` — ONE column, two switches. A checkbox on /work/services that
//     took effect on save, an instant toggle on /work/profile. And the services
//     copy said only „მოთხოვნები არ მოგდის", while the column ALSO drops the
//     profile out of the catalogue and 404s /experts/<slug> (see `PUBLIC` in
//     app/experts/_providers.ts). Somebody pausing their queue vanished from
//     the site without being told.
//   · the same `ShopfrontCard` in the same sticky corner of both pages — and
//     half-dead on each: /work/profile drew the SAVED services and never any
//     work photos, although the uploader was on that very page; /work/services
//     drew the SAVED headline.
//   · „ნახე შენი პროფილი" in both headers, one target.
//   · „რას აკეთებ" asked twice — `professions` there, `services` here.
//   · six save controls, and /work/profile alone ran two `useUnsavedGuard`s.
//
// ⚠️ THE SHAPE IS THE PRODUCT'S, NOT A TIDY. A provider on this site has ONE
// sellable object — one `ServiceProfile`, and there is no second listing
// anywhere in the schema. That is the Upwork / TaskRabbit shape (one profile IS
// the product), not Fiverr's, where splitting is right because one seller keeps
// MANY separately-priced gigs. One object, one editor.
//
// ⚠️ AND ONE SAVE MEANS ONE REQUEST, not two behind one button. Two writes can
// half-fail, and „half your page saved" is a worse answer than either outcome —
// so `/api/provider/service-profile` absorbed the professional half and writes
// all of it, plus the name, in a single transaction. See ServiceProfileInput.
//
// What did NOT come here: the password and the visibility switch. They are the
// only two controls on the old pair that touch nothing a client reads, and they
// are /work/account now — one switch, in one place, saying what it really does.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { PageHeader } from '@/components/PageHeader'
import { ProfileCompleteness } from '@/components/ProfileCompleteness'
import { useAvatarCropper } from '@/components/AvatarCropper'
import { useToast } from '@/components/ToastProvider'
import { useUnsavedGuard } from '@/lib/useUnsavedGuard'
import { ShopfrontCard, ShopfrontLabel } from '../_components/ShopfrontCard'
import { ConfirmServicesNote } from '../_components/ConfirmServicesNote'
import { IdentitySection } from './_secIdentity'
import { ServicesSections } from './_secServices'
import { PhotosSection } from './_secPhotos'
import type { Category, Draft, Loaded } from './_types'

export function ProfileEditor() {
  const { toast } = useToast()
  const [data, setData] = useState<Loaded | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  /** The last-saved values, so „is there unsaved work here" is answerable. */
  const [saved, setSaved] = useState<Draft | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  /** Whether they have ever said „yes, this is what I sell" — null means never;
   *  the endpoint stamps it the moment a save carries a service list. */
  const [unconfirmed, setUnconfirmed] = useState(false)
  /** What the save just paid for, in lari. The grant has to arrive attached to
   *  the act that earned it, not silently on the next navigation. */
  const [earned, setEarned] = useState<string[]>([])

  // ⚠️ EVERY HOOK ABOVE EVERY BRANCH. The old services form learned this the
  // hard way: hooks declared past the „loading" early return meant React
  // counted five on the first render and six on the next (#310), which reaches
  // the provider as a blank screen.
  const dirty = draft !== null && saved !== null && JSON.stringify(draft) !== JSON.stringify(saved)
  // ⚠️ ONE GUARD, WHERE THERE WERE THREE. /work/profile ran two of these at
  // once — one for the tabs, one for the work-photo form below them — so one
  // page could ask „შენახული არ არის?" twice, about two halves of one row, at
  // two different moments.
  useUnsavedGuard(dirty, 'შენახული არ არის — თუ გახვალ, ცვლილებები დაიკარგება. მაინც გავიდე?')

  const load = useCallback(async () => {
    try {
      const [r, cats] = await Promise.all([
        fetch('/api/provider/service-profile', { cache: 'no-store' }),
        fetch('/api/categories').then(x => x.json()).catch(() => []),
      ])
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) { setError('ვერ ჩაიტვირთა.'); return }
      const p = j.profile ?? {}
      setData({
        id: p.id ?? null,
        stamp: String(p.updatedAt ?? ''),
        gaps: j.gaps ?? [],
        groups: j.groups ?? [],
        cities: j.cities ?? [],
        available: p.available !== false,
      })
      setCategories(Array.isArray(cats) ? cats : (cats?.categories ?? []))
      setAvatarUrl(j.user?.avatarUrl ?? null)
      setUnconfirmed(p.id != null && p.servicesConfirmedAt == null)
      // ⚠️ THE STORED PHOTOS ARRIVE AS A COUNT, NEVER AS BYTES — the GET refuses
      // to ship six base64 images so somebody can delete one. The draft holds
      // the `kept:<n>` token for each, which is what the endpoint resolves.
      const loaded: Draft = {
        fullName: j.user?.fullName ?? '',
        headline: p.headline ?? '',
        about: p.about ?? '',
        yearsExp: p.yearsExp ?? 0,
        languages: p.languages ?? [],
        linkedinUrl: p.linkedinUrl ?? '',
        websiteUrl: p.websiteUrl ?? '',
        categoryId: p.categoryId ?? '',
        professions: p.professions ?? [],
        services: p.services ?? [],
        areas: p.areas ?? [],
        calloutFee: p.calloutFee ?? null,
        priceFrom: p.priceFrom ?? null,
        priceList: (p.priceList ?? {}) as Record<string, number>,
        workPhotos: Array.from({ length: Number(j.workPhotoCount) || 0 }, (_, i) => `kept:${i}`),
      }
      setDraft(loaded)
      setSaved(loaded)
    } catch {
      setError('ვერ ჩაიტვირთა.')
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Receives the SQUARE crop from the shared cropper (never a raw camera-roll
  // file), so what lands in the DB matches what the card renders.
  //
  // ⚠️ THE FACE SAVES ON ITS OWN, AND IT IS NOT AN EXCEPTION TO „ONE SAVE".
  // /api/uploads stores the image and returns an address; there is no draft
  // state for it to sit in and nothing to press save on. A picture the provider
  // has already cropped and confirmed is committed.
  const uploadAvatar = async (file: File) => {
    setAvatarUploading(true)
    try {
      const fd = new FormData()
      fd.append('kind', 'avatar')
      fd.append('file', file)
      const res = await fetch('/api/uploads', { method: 'POST', body: fd })
      const j = await res.json()
      if (j.ok) {
        setAvatarUrl(j.url)
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
  const { open: pickAvatar, ui: avatarCropperUi } = useAvatarCropper({ onCropped: uploadAvatar })

  if (error && !draft) return <p className="text-body text-danger-700">{error}</p>
  if (!data || !draft) return <p className="text-body text-ink-500">იტვირთება…</p>

  const patch = (p: Partial<Draft>) => {
    setDraft(d => (d ? { ...d, ...p } : d))
    // A saved badge that survives the next edit is a badge that lies — and so
    // does a „+20₾ დაგერიცხა" line left hanging over the next thing they type.
    if (status === 'saved') { setStatus('idle'); setEarned([]) }
    setError(null)
  }

  // ⚠️ BUILT FROM THE DRAFT, ALL OF IT (2026-08-30). This is the fix the merge
  // was worth on its own: the card stood on both old pages and each drew only
  // its own half live. Now every value under it is the draft — the name, the
  // sentence, the services, their prices and the photo count — so what stands
  // here is what WOULD be saved rather than a mixture of that and last week.
  const shopfront = draft.services.map(id => ({
    id,
    label: data.groups.flatMap(g => g.topics).find(t => t.id === id)?.label ?? id,
    price: draft.priceList[id] ?? null,
  }))

  const save = async () => {
    setStatus('saving'); setError(null)
    try {
      const r = await fetch('/api/provider/service-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // The draft IS the body — the field names are the endpoint's, so
        // nothing translates in between. `available` is deliberately absent:
        // this screen does not draw the switch, and absent means leave it
        // alone, so saving here can never flip somebody public again. That is
        // the exact sequence that reached production on 2026-08-29.
        body: JSON.stringify(draft),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) {
        // The endpoint's own message when it has one — these are written to be
        // read by the person who filled the form in.
        setError(j?.detail ?? 'ვერ შეინახა.')
        setStatus('idle')
        return
      }
      // ⚠️ FROM WHAT THE SERVER STORED, NOT FROM WHAT WE SENT. The PUT fills the
      // single city in on our behalf and drops a profession the vocabulary no
      // longer knows, so a snapshot of the request body would differ from the
      // row and the bar would say „შეუნახავი ცვლილებები" the instant the save
      // succeeded.
      const p = j.profile ?? {}
      const count = typeof j.workPhotoCount === 'number' ? j.workPhotoCount : draft.workPhotos.length
      const stored: Draft = {
        ...draft,
        fullName: j.user?.fullName ?? draft.fullName,
        headline: p.headline ?? '',
        about: p.about ?? '',
        yearsExp: p.yearsExp ?? 0,
        languages: p.languages ?? [],
        linkedinUrl: p.linkedinUrl ?? '',
        websiteUrl: p.websiteUrl ?? '',
        categoryId: p.categoryId ?? '',
        professions: p.professions ?? [],
        services: p.services ?? [],
        areas: p.areas ?? [],
        calloutFee: p.calloutFee ?? null,
        priceFrom: p.priceFrom ?? null,
        priceList: (p.priceList ?? {}) as Record<string, number>,
        workPhotos: Array.from({ length: count }, (_, i) => `kept:${i}`),
      }
      setDraft(stored)
      setSaved(stored)
      setData(d => (d ? { ...d, gaps: j.gaps ?? [], stamp: String(p.updatedAt ?? d.stamp) } : d))
      // Saving IS the confirmation — see the endpoint. The note goes on save,
      // not on dismiss: pressing save is having looked.
      setUnconfirmed(false)
      setEarned(Array.isArray(j.earned) ? j.earned.map((e: { label: string }) => e.label) : [])
      setStatus('saved')
    } catch {
      setError('ვერ შეინახა.')
      setStatus('idle')
    }
  }

  /** What `ProfileCompleteness` scores. It reads the stored shape, and it is
   *  fed the DRAFT so the checklist moves while somebody types rather than one
   *  save later — the same rule the card beside it follows. */
  const scored = {
    id: data.id ?? '',
    headline: draft.headline,
    about: draft.about,
    services: draft.services,
    priceList: draft.priceList,
    languages: draft.languages,
    yearsExp: draft.yearsExp,
    professions: draft.professions,
    categoryId: draft.categoryId || null,
    servicesConfirmedAt: unconfirmed ? null : new Date().toISOString(),
  }

  return (
    <div>
      <PageHeader
        className="mb-6"
        title="ჩემი გვერდი"
        sub="ეს არის ის, რასაც კლიენტი ხედავს"
        actions={data.id && (
          <a
            href={`/experts/${data.id}?preview=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-small transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <Icon.external className="w-3.5 h-3.5" />
            ნახე შენი პროფილი
          </a>
        )}
      />

      {/* Above the form, because it explains why the form is not already right. */}
      {unconfirmed && <div className="mb-5"><ConfirmServicesNote /></div>}

      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-7 xl:items-start">
        <div className="flex flex-col gap-5 min-w-0">

          {/* ── Is this page actually going to receive anything ──────────────
              ⚠️ IT REPORTS, IT NO LONGER SWITCHES (2026-08-30). The control that
              sat in this row was the SECOND writer of `available`, and its copy
              named only half of what the column does. The switch is on
              /work/account now, alone, saying both halves; this line is left
              doing what it always did well — telling somebody whose list is
              empty that nothing is being routed to them, which nothing else on
              the page would say. */}
          <div className={`rounded-card border px-4 py-3 flex items-center justify-between gap-4 flex-wrap ${
            data.gaps.length > 0 || !data.available ? 'border-warning-200 bg-warning-50' : 'border-ink-200 bg-ink-50'
          }`}>
            <p className="text-body text-ink-900">
              {!data.available
                ? 'გვერდი დამალულია — არც ძებნაში ჩანხარ და არც მოთხოვნები მოგდის.'
                : data.gaps.length > 0
                  ? `ჯერ არ ხარ სიაში — ${data.gaps.join(', ')}.`
                  : (data.cities.length > 1
                      ? 'მოთხოვნები მოგდის არჩეულ სერვისებზე და ქალაქებზე.'
                      : 'მოთხოვნები მოგდის არჩეულ სერვისებზე.')}
            </p>
            {!data.available && (
              <Link href="/work/account" className="text-small font-display font-semibold text-brand-700 hover:text-brand-800 min-h-11 inline-flex items-center">
                ჩართვა ანგარიშშია
              </Link>
            )}
          </div>

          <IdentitySection
            avatarUrl={avatarUrl}
            avatarUploading={avatarUploading}
            pickAvatar={pickAvatar}
            avatarCropperUi={avatarCropperUi}
            categories={categories}
            draft={draft}
            patch={patch}
          />

          <ServicesSections data={data} draft={draft} patch={patch} />

          <PhotosSection
            profileId={data.id}
            stamp={data.stamp}
            photos={draft.workPhotos}
            setPhotos={next => patch({ workPhotos: next })}
          />
        </div>

        {/* ── The card, and what is still missing ────────────────────────────
            ⚠️ BELOW THE FORM ON A NARROW SCREEN, NOT HIDDEN. The grid only
            splits at `xl`; under it the card falls to the bottom of the column,
            which is where somebody scrolling a phone expects the result of what
            they just typed. */}
        <aside className="mt-6 xl:mt-0 xl:sticky xl:top-7 flex flex-col gap-4">
          <div>
            <ShopfrontLabel />
            <ShopfrontCard
              name={draft.fullName}
              avatarUrl={avatarUrl}
              headline={draft.headline || null}
              services={shopfront}
              workPhotos={draft.workPhotos.length}
            />
          </div>
          <ProfileCompleteness profile={scored} avatarUrl={avatarUrl} variant="card" alwaysShow />
        </aside>
      </div>

      {/* ── The one save bar ───────────────────────────────────────────────
          ⚠️ ONE, WHERE THERE WERE SIX ACROSS TWO SCREENS: the services bar, the
          profile-tab bar, the name button, the visibility toggle, the password
          button and the work-photo bar. Four of those wrote the same row.
          Sticky, because this is the longest form in the workspace and the tick
          somebody came here to make is made a long way from the button. */}
      <div className="sticky bottom-0 -mx-6 sm:-mx-8 mt-5 px-6 sm:px-8 py-3 border-t border-ink-100 bg-white flex items-center justify-between gap-3">
        <span className={`text-meta font-display font-semibold ${dirty ? 'text-warning-700' : 'text-ink-400'}`} aria-live="polite">
          {status === 'saving' ? 'ინახება…' : dirty ? 'შეუნახავი ცვლილებები' : 'ყველაფერი შენახულია'}
        </span>
        <Btn onClick={save} disabled={status === 'saving' || !dirty} aria-busy={status === 'saving'}>
          {status === 'saving' ? 'ინახება…' : dirty ? 'შეინახე ცვლილებები' : 'შენახულია ✓'}
        </Btn>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-field border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-body text-danger-700">
          {error}
        </div>
      )}

      {/* The grant, said where it was earned. The wording is the sanctioned one
          (lib/credits, SAY / NEVER SAY): a balance that buys offers, never
          money owed. */}
      {status === 'saved' && earned.length > 0 && (
        <div className="mt-4 rounded-card border border-brand-200 bg-brand-50 px-4 py-3">
          <p className="text-body text-brand-800">
            <b className="font-display font-semibold">+{earned.join(' +')}</b> ბალანსზე დაგერიცხა.
          </p>
        </div>
      )}
    </div>
  )
}

'use client'
// The BOOKABLE half of /work/services: the consultation types an expert sells,
// their default length, the packages and the roster that hang off them.
//
// ⚠️ IT MOVED, IT DID NOT CHANGE (2026-08-19). This was the „სესიები" tab of
// /work/profile — app/work/(expert)/profile/_tabServices.tsx plus the
// consultation state and the four handlers that lived in that page's body. The
// markup below is that tab, and the handlers are those handlers: same
// endpoints (/api/tutor/consultations, /api/me/tutor), same validation, same
// toasts, same confirm copy. What changed is WHERE it lives — a profile is who
// you are, a service is what you sell, and the second question already had a
// page of its own on the trades side.
//
// ⚠️ IT FETCHES ITS OWN PROFILE, the way _packages and _students already do.
// The tab used to be handed `profile` and eleven props by a 900-line parent; on
// a page whose other half knows nothing about a TutorProfile there is nobody to
// hand it down, and one GET is cheaper than a shared parent whose only job is
// to own state for one child.
//
// The building blocks stay where the profile editor keeps them (`Field`,
// `ServiceTypeAndAvailability`, `PackagesSection`, `StudentsSection`): they are
// the expert's, they are imported by name, and a copy here would be a second
// place to fix the next time one of them changes.

import { useEffect, useState } from 'react'
import { Btn } from '@/components/Btn'
import { ConfirmModal } from '@/components/ConfirmModal'
import { Eyebrow } from '@/components/Eyebrow'
import { PriceField } from '@/components/PriceField'
import { useToast } from '@/components/ToastProvider'
import { Field, ServiceTypeAndAvailability } from '@/app/work/(expert)/profile/_parts'
import { PackagesSection } from '@/app/work/(expert)/profile/_packages'
import { StudentsSection } from '@/app/work/(expert)/profile/_students'
import type { TutorProfile } from '@/app/work/(expert)/profile/_types'

// ⚠️ THE TIER LEFT THIS FILE ON 2026-08-21. It was computed here from the
// minutes and posted with every save, and the identical ladder lived in
// app/api/applications/[id] — two copies of a derivation whose result nothing
// reads. It is derived once on the server now (app/api/tutor/consultations).
// The old note read:
// The QUICK/STANDARD/DEEP tier is a backend enum — never surfaced to the
// expert. It is derived from the chosen minutes at submit time.
// ⚠️ TWO SHAPES, ONE LIST (2026-08-20) — see Consultation.bookable in
// schema.prisma. `bookable: false` is a JOB: a name, a price, and no clock. It
// exists because until today the only thing an expert could publish was an
// hour, so „დეკლარაციის შევსება — 100₾" had to be invented as a 60-minute
// session on a calendar, and the whole expert half of the catalogue sold
// nothing but time.
type Consultation = { id: string; title: string; description: string; minutes: number; price: number; bookable: boolean }
type ConsForm = { title: string; description: string; minutes: number; price: number; bookable: boolean }
type ConsEdit = { id: string; title: string; description: string; minutes: number; price: number; bookable: boolean }


export function ConsultationsSection() {
  const [profile, setProfile] = useState<TutorProfile>(null)
  const [loading, setLoading] = useState(true)
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [consForm, setConsForm] = useState<ConsForm>({ title: '', description: '', minutes: 60, price: 80, bookable: true })
  const [consBusy, setConsBusy] = useState(false)
  const [consErr, setConsErr] = useState<string | null>(null)
  // Inline edit of a single existing service row. `consEdit` holds the id +
  // prefilled fields of the row being edited (null = none). Same fields as the
  // add-form; tier is derived server-side on PATCH so we never surface it.
  const [consEdit, setConsEdit] = useState<ConsEdit | null>(null)
  const [consEditBusy, setConsEditBusy] = useState(false)
  const [consEditErr, setConsEditErr] = useState<string | null>(null)
  // The same one-modal paradigm the profile editor uses for every destructive
  // action here — never a native confirm().
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [tRes, co] = await Promise.all([
          fetch('/api/me/tutor').then(r => r.json()),
          fetch('/api/tutor/consultations').then(r => r.json()),
        ])
        if (cancelled) return
        setProfile(tRes?.profile ?? null)
        setConsultations(co?.items ?? [])
      } catch {
        /* An empty list and no profile — the sections below simply do not draw. */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

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
      if (!res.ok || !j.ok) { setConsErr(j?.message || 'ვერ დაემატა'); return }
      setConsultations(prev => [...prev, j.item])
      setConsForm({ title: '', description: '', minutes: 60, price: 80, bookable: true })
      toast('სერვისი დაემატა', 'success')
    } catch { setConsErr('ქსელის შეცდომა') }
    finally { setConsBusy(false) }
  }

  const startEditConsultation = (c: Consultation) => {
    setConsEditErr(null)
    setConsEdit({ id: c.id, title: c.title, description: c.description, minutes: c.minutes, price: c.price, bookable: c.bookable })
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
      if (!res.ok || !j.ok) { setConsEditErr(j?.message || 'ვერ შეინახა'); return }
      setConsultations(prev => prev.map(c => (c.id === id ? j.item : c)))
      setConsEdit(null)
      toast('სერვისი განახლდა', 'success')
    } catch { setConsEditErr('ქსელის შეცდომა') }
    finally { setConsEditBusy(false) }
  }

  const confirmDelete = async () => {
    if (!pendingDelete || deleteBusy) return
    setDeleteBusy(true)
    try {
      const res = await fetch(`/api/tutor/consultations/${pendingDelete}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        toast(j.error === 'IN_USE' ? `ვერ წაიშლება — ${j.count} აქტიური ჯავშანი` : 'წაშლა ვერ მოხერხდა', 'error')
        return
      }
      setConsultations(prev => prev.filter(c => c.id !== pendingDelete))
      setPendingDelete(null)
      toast('სერვისი წაიშალა', 'success')
    } catch {
      toast('ქსელის შეცდომა', 'error')
    } finally {
      setDeleteBusy(false)
    }
  }

  if (loading) return <p className="text-body text-ink-500">იტვირთება…</p>
  if (!profile) return null

  return (
    <div className="space-y-6">

      {/* ⚠️ THE DEFAULT LENGTH IS ONLY SHOWN WHILE IT CAN DO SOMETHING (2026-08-21).
          Its own copy admitted the rest: „ტიპები თავად განსაზღვრავს
          ხანგრძლივობასა და ფასს. ეს ნაგულისხმევი მხოლოდ მათ გარეშე მოქმედებს."
          A card with a heading, three buttons and two paragraphs of explanation,
          standing at the TOP of the page, whose entire message is that it does
          not apply to you — every expert with a single type read that before
          reaching the types they actually edit. Owner: „უფრო მარტივი და
          კომფორტული უნდა იყოს."

          It is not deleted: with no types at all the default IS the session
          length, and that is exactly when it appears. */}
      {consultations.length === 0 && (
        <div id="section-availability" className="scroll-mt-24">
          <ServiceTypeAndAvailability
            profile={profile}
            servicesCount={consultations.length}
            onSaved={(next) => setProfile(next as any)}
          />
        </div>
      )}

      {/* Consultations */}
      <section id="section-consultations" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          {/* ⚠️ NO SECOND HEADING HERE (2026-08-21). The screen said the same
              thing four times on the way down: „ჩემი სერვისები" (page title) →
              „კონსულტაციები" (section h2) → „კონსულტაციის ტიპები" (this
              eyebrow) → and then each row offers to be a „სერვისი". Owner:
              „ბევრია, უფრო მარტივი და კომფორტული უნდა იყოს." The h2 above is
              the heading; this was a label for the thing already labelled.

              The old line also promised „ჩაანაცვლებს ნაგულისხმევს" — pointing
              at the default-length card, which is no longer on screen once a
              type exists. Copy that names something invisible is worse than no
              copy. */}
          <div>
            <p className="text-meta text-ink-500 leading-snug max-w-[520px]">თითოეულს თავისი ხანგრძლივობა და ფასი.</p>
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
                              placeholder={consForm.bookable ? 'რას მოიცავს სესია' : 'რას მოიცავს სამუშაო'}
                              className="w-full px-3 py-2 rounded-field border border-ink-200 bg-white text-small focus:border-brand-400 focus:outline-none resize-y" />
                  </Field>
                  {/* The shape can be changed after the fact — an expert who
                      published „კონსულტაცია 60წთ" because it was the only thing
                      the form offered can turn it into the service it always
                      was. The API clears the leftover minutes; see the PATCH
                      handler's pairing rule. */}
                  <Field label="რა ტიპისაა?">
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { on: false, label: 'სერვისი', hint: 'ფასი, დროის გარეშე' },
                        { on: true, label: 'სერვისი დროით', hint: 'ჯავშნადი — კლიენტი დროს ირჩევს' },
                      ] as const).map(o => {
                        const active = consEdit.bookable === o.on
                        return (
                          <button
                            key={String(o.on)}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setConsEdit({ ...consEdit, bookable: o.on, minutes: o.on && consEdit.minutes < 5 ? 60 : consEdit.minutes })}
                            className={`text-left px-3 py-2.5 rounded-field border transition-colors duration-fast ${
                              active ? 'border-brand-400 bg-brand-50/60' : 'border-ink-200 bg-white hover:bg-ink-50'
                            }`}
                          >
                            <span className="block font-display text-small font-semibold text-ink-900">{o.label}</span>
                            <span className="block text-meta text-ink-500">{o.hint}</span>
                          </button>
                        )
                      })}
                    </div>
                  </Field>
                  {consEdit.bookable && (
                    <Field label="ხანგრძლივობა (წუთი)">
                      <input type="number" inputMode="numeric" required min={5} max={240} value={consEdit.minutes}
                             onChange={e => setConsEdit({ ...consEdit, minutes: Number(e.target.value) })}
                             className="w-full sm:max-w-[200px] h-11 px-3 rounded-field border border-ink-200 bg-white text-body tabular-nums focus:border-brand-400 focus:outline-none" />
                    </Field>
                  )}
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
                {/* The badge answers „what is this?" — for a bookable row the
                    length IS the answer („60 წთ"), for a service there is no
                    length and the word is. */}
                <span className="shrink-0 inline-flex items-center h-6 px-2 rounded-pill border border-ink-200 bg-ink-75 text-ink-700 font-display text-micro font-bold uppercase tabular-nums">
                  {c.bookable ? `${c.minutes} წთ` : 'სერვისი'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-display text-body font-bold text-ink-900 truncate">{c.title}</div>
                  <div className="text-meta text-ink-700 leading-snug mt-0.5">{c.description}</div>
                  <div className="text-meta text-ink-500 tabular-nums mt-1">₾{c.price}</div>
                </div>
                <div className="shrink-0 self-center flex items-center">
                  <button type="button" onClick={() => startEditConsultation(c)} aria-label="სერვისის რედაქტირება" className="min-h-[44px] -my-2 px-3 inline-flex items-center rounded-btn font-display text-meta font-semibold text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors duration-fast">რედაქტირება</button>
                  <button type="button" onClick={() => setPendingDelete(c.id)} aria-label="სერვისის წაშლა" className="min-h-[44px] -my-2 px-3 -mr-2 inline-flex items-center rounded-btn font-display text-meta font-semibold text-ink-500 hover:text-danger-700 hover:bg-danger-50 transition-colors duration-fast">წაშლა</button>
                </div>
              </div>
              )
            ))
          )}
        </div>

        <form onSubmit={addConsultation} className="pt-3 border-t border-ink-100 space-y-3">
          {/* ⚠️ THE SHAPE IS THE FIRST QUESTION, and it changes the form under
              it. Everything an expert could publish before today was an hour on
              a calendar; „რას ვყიდი?" now has two honest answers and this is
              where they diverge. Two buttons rather than a checkbox, because a
              checkbox has a default that reads as the normal case and neither
              of these is more normal than the other. */}
          <Field label="რა ტიპისაა?">
            <div className="grid grid-cols-2 gap-2">
              {([
                { on: false, label: 'სერვისი', hint: 'ფასი, დროის გარეშე' },
                { on: true, label: 'სერვისი დროით', hint: 'ჯავშნადი — კლიენტი დროს ირჩევს' },
              ] as const).map(o => {
                const active = consForm.bookable === o.on
                return (
                  <button
                    key={String(o.on)}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setConsForm({ ...consForm, bookable: o.on })}
                    className={`text-left px-3 py-2.5 rounded-field border transition-colors duration-fast ${
                      active ? 'border-brand-400 bg-brand-50/60' : 'border-ink-200 bg-white hover:bg-ink-50'
                    }`}
                  >
                    <span className="block font-display text-small font-semibold text-ink-900">{o.label}</span>
                    <span className="block text-meta text-ink-500">{o.hint}</span>
                  </button>
                )
              })}
            </div>
          </Field>
          <Field label="სათაური">
            <input type="text" required maxLength={80} value={consForm.title}
                   onChange={e => setConsForm({ ...consForm, title: e.target.value })}
                   placeholder={consForm.bookable ? 'მაგ. ინდივიდუალური კონსულტაცია' : 'მაგ. დეკლარაციის შევსება'}
                   className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body focus:border-brand-400 focus:outline-none" />
          </Field>
          <Field label="აღწერა">
            <textarea rows={2} required maxLength={400} value={consForm.description}
                      onChange={e => setConsForm({ ...consForm, description: e.target.value })}
                      placeholder={consForm.bookable ? 'რას მოიცავს სესია' : 'რას მოიცავს სამუშაო'}
                      className="w-full px-3 py-2 rounded-field border border-ink-200 bg-white text-small focus:border-brand-400 focus:outline-none resize-y" />
          </Field>
          {/* A service has no clock — the field is not disabled, it is ABSENT.
              A greyed-out box still asks a question, and the answer to this one
              does not exist. See Consultation.bookable. */}
          {consForm.bookable && (
            <Field label="ხანგრძლივობა (წუთი)">
              <input type="number" inputMode="numeric" required min={5} max={240} value={consForm.minutes}
                     onChange={e => setConsForm({ ...consForm, minutes: Number(e.target.value) })}
                     className="w-full sm:max-w-[200px] h-11 px-3 rounded-field border border-ink-200 bg-white text-body tabular-nums focus:border-brand-400 focus:outline-none" />
            </Field>
          )}
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

      {/* Teaching packages — renders nothing at all unless the vertical is
          on for this deployment; see app/work/(expert)/profile/_packages.tsx.
          It sits AFTER consultations deliberately: a session is what most
          experts sell, a package is the second shape. */}
      <PackagesSection />
      {/* The roster sits ABOVE nothing and BELOW packages on purpose: you
          define what you sell, then you manage who bought it. */}
      <StudentsSection />

      <ConfirmModal
        open={!!pendingDelete}
        title="სერვისის წაშლა?"
        body="ამ ტიპს ვეღარ დაჯავშნიან. ჯავშნები არ იშლება."
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

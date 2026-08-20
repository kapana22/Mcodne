'use client'
// The teacher's package editor — „თვიური პაკეტები".
//
// Split into its own file the way the admin panel splits its tabs: the profile
// page is already 1,600+ lines and this section owns its own fetch, its own
// form state and its own error handling, so nothing here needs to be threaded
// through the parent.
//
// THE ONE RULE THIS FORM ENFORCES, and the reason it exists as a form at all:
// the teacher types the TOTAL price and nothing else. The per-lesson figure is
// computed and shown live, never entered. Airtasker states it plainly and it is
// worth copying — „a package must be the total and final price the customer
// will pay… do not put only a single package with an hourly price, starting
// price or unit price." This project has already paid for the alternative: one
// expert's card read „₾80 · 30 წთ" while their profile rail read „₾25-დან".

import { useCallback, useEffect, useState } from 'react'
import { Btn } from '@/components/Btn'
import { Eyebrow } from '@/components/Eyebrow'
import { useToast } from '@/components/ToastProvider'
import {
  PACKAGE_LESSON_COUNTS,
  DEFAULT_LESSON_COUNT,
  DEFAULT_LESSON_MINUTES,
  DEFAULT_VALID_DAYS,
  perLessonPrice,
  teacherFieldLabels,
  TEACHER_LEVELS,
  TEACHER_AGES,
  type TeacherFields,
} from '@/lib/packages'

type Pkg = {
  id: string
  title: string
  description: string
  lessonsCount: number
  minutesPerLesson: number
  price: number
  validDays: number
  active: boolean
}

type Draft = Omit<Pkg, 'id' | 'active'>

const EMPTY: Draft = {
  title: '',
  description: '',
  lessonsCount: DEFAULT_LESSON_COUNT,
  minutesPerLesson: DEFAULT_LESSON_MINUTES,
  // 0 means „not answered yet", and the field renders it as an EMPTY input —
  // never as ₾0. See PriceEcho.
  price: 0,
  validDays: DEFAULT_VALID_DAYS,
}

const inputCls =
  'w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body focus:border-brand-400 focus:outline-none'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block font-display text-meta font-semibold text-ink-700 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block mt-1 text-meta text-ink-500">{hint}</span>}
    </label>
  )
}

/** The size picker. Three fixed options, not a free number — see lib/packages. */
function SizePicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-2" role="radiogroup" aria-label="გაკვეთილების რაოდენობა">
      {PACKAGE_LESSON_COUNTS.map(n => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          onClick={() => onChange(n)}
          className={`h-11 px-4 rounded-btn border font-display text-body font-bold tabular-nums transition-colors duration-fast ${
            value === n
              ? 'border-brand-500 bg-brand-50 text-brand-800'
              : 'border-ink-200 bg-white text-ink-700 hover:border-brand-400'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

/**
 * THE schedule-gate warning, in one place.
 *
 * Was inlined on the saved-package row only. Extracted verbatim — same words,
 * same tokens — so the DRAFT form can show the identical verdict before the
 * teacher commits, which is the one moment it can still change the decision.
 */
function CapacityWarning({ capacity, lessonsCount, validDays }: { capacity: number; lessonsCount: number; validDays: number }) {
  return (
    <div className="mt-2 p-2.5 rounded-btn bg-warning-50 border border-warning-200">
      <div className="font-display text-meta font-bold text-warning-800">
        განრიგი ვერ იტევს — ვერ გაიყიდება
      </div>
      <div className="mt-0.5 text-meta text-warning-800 tabular-nums">
        {validDays} დღეში თავისუფალია {capacity} გაკვეთილი {lessonsCount}-იდან.
        გამოაქვეყნე მეტი დრო „განრიგში“.
      </div>
    </div>
  )
}

/** Live „this is what a client sees" line. Derived, never stored. */
function PriceEcho({ d }: { d: Draft }) {
  const per = perLessonPrice(d.price, d.lessonsCount)
  return (
    <div className="p-3 rounded-card bg-ink-50 border border-ink-100">
      <div className="font-display text-meta font-semibold text-ink-500 mb-1">კლიენტი ნახავს</div>
      <div className="font-display text-body font-bold text-ink-900 tabular-nums">
        {d.lessonsCount} გაკვეთილი
        <span className="text-ink-500 font-normal"> · {d.minutesPerLesson} წთ · {d.validDays} დღე</span>
        <span className="mx-2 text-ink-300">—</span>
        {/* ₾0 is not a price, it is an unanswered question. Printing it as one
            is the anchor bug /apply already paid for: a pre-filled figure got
            published verbatim by 10 of 19 experts. Same wording as the apply
            preview so the two surfaces say one thing. */}
        {d.price > 0 ? (
          <>
            ₾{d.price}
            <span className="text-meta font-medium text-ink-500 ml-1.5">₾{per} / გაკვეთილი</span>
          </>
        ) : (
          <span className="text-ink-400">ფასი — შენ ადგენ</span>
        )}
      </div>
    </div>
  )
}

/**
 * Lesson length: fixed options, for the same reason the lesson COUNT is fixed
 * („a free-form lesson count makes cards incomparable" — lib/packages). A free
 * number let a teacher sell 47-minute lessons, which is a number nobody is
 * comparing against. These four are what the market actually quotes.
 */
const LESSON_MINUTES = [30, 45, 50, 60, 90] as const

function DraftFields({ d, set, capacity }: { d: Draft; set: (d: Draft) => void; capacity: number | null }) {
  // A package saved before this picker existed could hold any value in 15–240.
  // Show it as its own chip rather than leaving the row with nothing selected:
  // an unselected radiogroup invites a click that silently rewrites a length
  // the teacher never meant to change.
  const minuteOptions: number[] = (LESSON_MINUTES as readonly number[]).includes(d.minutesPerLesson)
    ? [...LESSON_MINUTES]
    : [...LESSON_MINUTES, d.minutesPerLesson].sort((a, b) => a - b)
  return (
    <>
      <Field label="სახელი">
        <input type="text" required maxLength={80} value={d.title} onChange={e => set({ ...d, title: e.target.value })} className={inputCls} />
      </Field>
      <Field label="აღწერა">
        <textarea
          rows={2}
          required
          maxLength={400}
          value={d.description}
          onChange={e => set({ ...d, description: e.target.value })}
          className="w-full px-3 py-2 rounded-field border border-ink-200 bg-white text-small focus:border-brand-400 focus:outline-none resize-y"
        />
      </Field>
      <Field label="გაკვეთილების რაოდენობა">
        <SizePicker value={d.lessonsCount} onChange={n => set({ ...d, lessonsCount: n })} />
      </Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="ერთი გაკვეთილი (წუთი)">
          <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="ერთი გაკვეთილი (წუთი)">
            {minuteOptions.map(m => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={d.minutesPerLesson === m}
                onClick={() => set({ ...d, minutesPerLesson: m })}
                className={`h-11 px-3.5 rounded-btn border font-display text-body font-bold tabular-nums transition-colors duration-fast ${
                  d.minutesPerLesson === m
                    ? 'border-brand-500 bg-brand-50 text-brand-800'
                    : 'border-ink-200 bg-white text-ink-700 hover:border-brand-400'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </Field>
        <Field label="ვადა (დღე)" hint="რამდენ ხანში უნდა გამოიყენოს">
          <input type="number" inputMode="numeric" required min={7} max={365} value={d.validDays}
                 onChange={e => set({ ...d, validDays: Number(e.target.value) })}
                 className={`${inputCls} tabular-nums`} />
        </Field>
      </div>
      {/* The gate, asked BEFORE the package exists. `capacity` is null while the
          answer is in flight or the server has not been asked — render nothing
          rather than a reassuring blank. */}
      {capacity !== null && capacity < d.lessonsCount && (
        <CapacityWarning capacity={capacity} lessonsCount={d.lessonsCount} validDays={d.validDays} />
      )}
      {/* TOTAL price. The per-lesson number below is computed — it is deliberately
          not an input, so the two can never disagree. */}
      <Field label="სრული ფასი (₾)" hint="მთლიან პაკეტში, არა ერთ გაკვეთილში">
        <input type="number" inputMode="numeric" required min={0} max={100000}
               value={d.price === 0 ? '' : d.price}
               onChange={e => set({ ...d, price: Number(e.target.value) || 0 })}
               className={`${inputCls} tabular-nums sm:max-w-[220px]`} />
      </Field>
      <PriceEcho d={d} />
    </>
  )
}

export function PackagesSection() {
  const { toast } = useToast()
  const [items, setItems] = useState<Pkg[]>([])
  // Schedule-gate verdict per package id, from the API. Recomputed server-side
  // on every load — published availability changes and a stale „fits" would be
  // a promise that quietly stopped being true.
  const [fit, setFit] = useState<Record<string, { capacity: number; fits: boolean }>>({})
  const [enabled, setEnabled] = useState(false)
  // What this profile IS, from the server. Separate from `enabled` (the admin
  // rollout allowlist) so the empty state can say which of the two is shut.
  const [isTeacher, setIsTeacher] = useState(false)
  const [teacher, setTeacher] = useState<TeacherFields>({})
  const [loaded, setLoaded] = useState(false)
  const [form, setForm] = useState<Draft>(EMPTY)
  const [edit, setEdit] = useState<(Draft & { id: string }) | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Capacity for whichever draft is currently open (new or edit). Asked of the
  // server because availability derivation has exactly one implementation
  // (lib/availability) and a client-side second copy would drift.
  const [draftCap, setDraftCap] = useState<number | null>(null)
  const openDraft = edit ?? form
  const draftKey = `${openDraft.minutesPerLesson}:${openDraft.validDays}`

  useEffect(() => {
    if (!enabled || !isTeacher) return
    let cancelled = false
    setDraftCap(null)
    // Debounced: `validDays` is a free number input, so this would otherwise
    // fire once per keystroke on a query that does three indexed reads.
    const t = setTimeout(async () => {
      const [min, days] = draftKey.split(':')
      try {
        const res = await fetch(`/api/tutor/packages?draftMinutes=${min}&draftDays=${days}`, { cache: 'no-store' })
        if (!res.ok) return
        const j = await res.json()
        if (!cancelled && typeof j.draftCapacity === 'number') setDraftCap(j.draftCapacity)
      } catch {
        // Stay null — „we don't know" must not render as „your schedule fits".
      }
    }, 400)
    return () => { cancelled = true; clearTimeout(t) }
  }, [draftKey, enabled, isTeacher])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tutor/packages', { cache: 'no-store' })
      // 404 = the vertical is off for this deployment. Render nothing at all
      // rather than an empty section that hints at something unfinished.
      if (res.status === 404) return setLoaded(true)
      const j = await res.json()
      setItems(j.items ?? [])
      setFit(j.fit ?? {})
      setEnabled(!!j.enabled)
      setIsTeacher(!!j.isTeacher)
      setTeacher(j.teacher ?? {})
    } catch {
      // A failed fetch must never render as „you have no packages" — that is a
      // documented rule in this codebase. Leave `loaded` false so the section
      // stays out of the way instead of lying about the data.
      return
    }
    setLoaded(true)
  }, [])

  useEffect(() => { void load() }, [load])

  const msgOf = async (res: Response) => {
    const j = await res.json().catch(() => ({}))
    return j.message || (j.error === 'NOT_ENABLED' ? 'პაკეტები ჯერ არ გაქვს ჩართული.' : 'ვერ შეინახა.')
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/tutor/packages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      if (!res.ok) { setErr(await msgOf(res)); return }
      const j = await res.json()
      setItems(prev => [...prev, j.item].sort((a, b) => a.lessonsCount - b.lessonsCount))
      setForm(EMPTY)
      toast('პაკეტი დაემატა', 'success')
    } catch { setErr('ქსელის შეცდომა.') }
    finally { setBusy(false) }
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!edit) return
    setBusy(true); setErr(null)
    const { id, ...body } = edit
    try {
      const res = await fetch(`/api/tutor/packages/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) { setErr(await msgOf(res)); return }
      const j = await res.json()
      setItems(prev => prev.map(p => (p.id === id ? j.item : p)).sort((a, b) => a.lessonsCount - b.lessonsCount))
      setEdit(null)
      toast('პაკეტი განახლდა', 'success')
    } catch { setErr('ქსელის შეცდომა.') }
    finally { setBusy(false) }
  }

  const toggleActive = async (p: Pkg) => {
    const res = await fetch(`/api/tutor/packages/${p.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !p.active }),
    })
    if (!res.ok) return toast('ვერ შეიცვალა', 'error')
    const j = await res.json()
    setItems(prev => prev.map(x => (x.id === p.id ? j.item : x)))
  }

  const remove = async (p: Pkg) => {
    const res = await fetch(`/api/tutor/packages/${p.id}`, { method: 'DELETE' })
    if (!res.ok) return toast(await msgOf(res), 'error')
    setItems(prev => prev.filter(x => x.id !== p.id))
    toast('პაკეტი წაიშალა', 'success')
  }

  // Absent, not disabled — for BOTH reasons it can be absent:
  //   · the vertical is off for this deployment (fetch 404s), or
  //   · this teacher has not been enabled by an admin.
  //
  // The second case matters more than it looks. Rendering „you don't have this
  // yet" to every expert would advertise an unfinished feature to the whole
  // roster on the first deploy — the opposite of the quiet rollout this vertical
  // is being shipped under. An expert who has not been let in has nothing to do
  // here, so there is nothing to show them.
  // Both gates must be open. A consultant is not shown a teaching section at
  // all — it is not „locked", it simply is not part of what they do.
  if (!loaded || !enabled || !isTeacher) return null

  const levelLabels = teacherFieldLabels(teacher.levels, TEACHER_LEVELS)
  const ageLabels = teacherFieldLabels(teacher.ages, TEACHER_AGES)

  return (
    <section id="section-packages" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-4">
      <div>
        <Eyebrow tone="muted" className="mb-1">თვიური პაკეტები</Eyebrow>
        <p className="text-meta text-ink-500 leading-snug max-w-[520px]">
          წინასწარ ნაყიდი გაკვეთილები. კლიენტი ერთხელ იხდის და შემდეგ სათითაოდ ჯავშნის.
        </p>
      </div>

      {/* What this teacher teaches, to whom, at what level — the three facts a
          parent actually asks for. Read-only here: they are collected in the
          apply flow and live in professionData. Shown so the teacher can see
          what the client sees. */}
      {(teacher.subjects || levelLabels.length > 0 || ageLabels.length > 0) && (
        <div className="p-3 rounded-card bg-ink-50 border border-ink-100 text-small text-ink-700 space-y-1">
          {teacher.subjects && <div><span className="text-ink-500">საგნები:</span> <span className="font-display font-semibold">{teacher.subjects}</span></div>}
          {levelLabels.length > 0 && <div><span className="text-ink-500">დონეები:</span> <span className="font-display font-semibold">{levelLabels.join(' · ')}</span></div>}
          {ageLabels.length > 0 && <div><span className="text-ink-500">ასაკი:</span> <span className="font-display font-semibold">{ageLabels.join(' · ')}</span></div>}
        </div>
      )}

      {(
        <>
          <div className="space-y-2">
            {items.length === 0 ? (
              <div className="text-small text-ink-500">ჯერ არაფერი დამატებულა.</div>
            ) : (
              items.map(p =>
                edit?.id === p.id ? (
                  <form key={p.id} onSubmit={save} className="p-3 rounded-card border border-brand-200 bg-white space-y-3">
                    <DraftFields d={edit} set={d => setEdit({ ...d, id: p.id })} capacity={draftCap} />
                    {err && <div className="p-2.5 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-small">{err}</div>}
                    <div className="flex justify-end gap-2">
                      <Btn variant="ghost" size="sm" type="button" onClick={() => { setEdit(null); setErr(null) }} disabled={busy}>გაუქმება</Btn>
                      <Btn variant="primary" size="sm" type="submit" disabled={busy}>{busy ? 'ინახება…' : 'შენახვა'}</Btn>
                    </div>
                  </form>
                ) : (
                  <div key={p.id} className="p-3 rounded-card border border-ink-200 flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-display text-body font-bold text-ink-900">
                        {p.title}
                        {!p.active && <span className="ml-2 font-normal text-meta text-ink-500">— გაყიდვიდან გამორთულია</span>}
                      </div>
                      <div className="mt-0.5 text-meta text-ink-600 tabular-nums">
                        {p.lessonsCount} გაკვეთილი · {p.minutesPerLesson} წთ · {p.validDays} დღე
                        <span className="mx-1.5 text-ink-300">—</span>
                        <span className="font-display font-bold text-ink-900">₾{p.price}</span>
                        <span className="text-ink-500"> (₾{perLessonPrice(p.price, p.lessonsCount)} / გაკვეთილი)</span>
                      </div>
                      {/* THE SCHEDULE GATE, stated at the one moment it can be
                          acted on. Not a toast and not a disabled button: the
                          teacher needs the number (how many fit vs how many they
                          sold) and the action (publish more time). */}
                      {fit[p.id] && !fit[p.id].fits && (
                        <CapacityWarning capacity={fit[p.id].capacity} lessonsCount={p.lessonsCount} validDays={p.validDays} />
                      )}
                    </div>
                    <div className="flex items-center shrink-0">
                      <button type="button" onClick={() => toggleActive(p)}
                              className="min-h-[44px] -my-2 px-3 inline-flex items-center rounded-btn font-display text-meta font-semibold text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors duration-fast">
                        {p.active ? 'გამორთვა' : 'ჩართვა'}
                      </button>
                      <button type="button" onClick={() => { setErr(null); setEdit({ ...p }) }}
                              className="min-h-[44px] -my-2 px-3 inline-flex items-center rounded-btn font-display text-meta font-semibold text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors duration-fast">
                        რედაქტირება
                      </button>
                      <button type="button" onClick={() => remove(p)}
                              className="min-h-[44px] -my-2 px-3 -mr-2 inline-flex items-center rounded-btn font-display text-meta font-semibold text-ink-500 hover:text-danger-700 hover:bg-danger-50 transition-colors duration-fast">
                        წაშლა
                      </button>
                    </div>
                  </div>
                ),
              )
            )}
          </div>

          {!edit && (
            <form onSubmit={add} className="pt-3 border-t border-ink-100 space-y-3">
              <DraftFields d={form} set={setForm} capacity={draftCap} />
              {err && <div className="p-2.5 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-small">{err}</div>}
              <div className="flex justify-end">
                <Btn variant="primary" size="sm" type="submit" disabled={busy}>{busy ? 'ინახება…' : 'დამატება'}</Btn>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  )
}

'use client'
// /apply — the form's furniture: step progress, step header, section and
// collapsible wrappers, and the footer that carries the next/submit button.

import React, { useState } from 'react'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { ApplyErrCtx } from './_fields'
import { STEPS, StepId, StepPart, partsOf } from './_form'

/* ───── Progress sidebar ───── */
export const ProgressNav = ({ step, setStep, completed }: { step: StepId; setStep: (s: StepId) => void; completed: Set<StepId> }) => {
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
export const StepHeader = ({ title, sub }: { title: string; sub: string }) => (
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
export const FormSection = ({ title, sub, required, fields, children }: {
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
export const Collapsible = ({ title, sub, fields, children }: {
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

/* ───── Footer with next/back (part-aware: multi-part steps advance within
   the step before moving on; back re-enters the previous step's LAST part) ───── */
export const FormFooter = ({ step, setStep, part, setPart, completed, setCompleted, onSubmit, submitting, validateStep, onError, onStepDone, onBlocked }: { step: StepId; setStep: (s: StepId) => void; part: StepPart; setPart: (p: StepPart) => void; completed: Set<StepId>; setCompleted: (c: Set<StepId>) => void; onSubmit: () => void; submitting: boolean; validateStep: (s: StepId, p: StepPart) => string | null; onError: (msg: string | null) => void; onStepDone: (s: StepId) => void; onBlocked: (s: StepId) => void }) => {
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
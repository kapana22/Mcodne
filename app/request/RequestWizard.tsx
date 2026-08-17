'use client'
// The request wizard — the container.
//
// One question per screen, the tap advances, the run is derived from the draft
// (see _model → stepsFor). This file owns the draft, the current STEP ID and
// the submit; every screen is a sibling component and every rule lives in
// _model or lib/requests — the container holds no validation of its own.

import { useEffect, useRef, useState } from 'react'
import { Btn } from '@/components/Btn'
import {
  ServiceRequestInput, KIND, kindOf, BUDGET_BANDS, TIMING, FORMATS, CITIES,
  extrasFor, topicLabel,
} from '@/lib/requests'
import { newFlowId } from '@/components/booking/funnelEvents'
import { REQUEST_FUNNEL_EVENTS, trackRequestFunnel } from './requestFunnelEvents'
import { RequestShell } from './_shell'
import {
  EMPTY_DRAFT, stepsFor, stepComplete, nextStepId, prevStepId, resumeStepId,
  progressOf, reviveDraft, withTopic, withKind, withAccountContact,
  type Draft, type AccountContact,
} from './_model'
import { Transcript } from './_transcript'
import { StepWhat, StepKindPick } from './_stepWhat'
import { StepPick } from './_stepPick'
import { StepDetails } from './_stepDetails'
import { StepContact } from './_stepContact'
import type { AccountOutcome } from '@/lib/requestAccount'
import { ThanksCard } from './_thanks'

type Status = 'idle' | 'sending' | 'error'
export type Sent = {
  publicRef: string | null
  rejected: boolean
  /** What happened to the account while the request was sending — see
   *  lib/requestAccount. The thanks screen is the only reader. */
  account: AccountOutcome
}

/** Server codes → Georgian. Never surface a raw code to a reader. */
function errText(code?: string): string {
  switch (code) {
    case 'RATE_LIMITED': return 'ძალიან ბევრი მოთხოვნა — სცადე ცოტა ხანში.'
    case 'INVALID': return 'შეავსე ველები სწორად.'
    default: return 'ვერ გაიგზავნა — სცადე თავიდან.'
  }
}

/* ── The draft survives a refresh ──────────────────────────────────────────
   sessionStorage, revived through reviveDraft and applied AFTER mount — the
   hydration lesson this wizard already paid for once. */
const DRAFT_KEY = 'mcodne:request-draft'

function loadDraft(): Draft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    return raw ? reviveDraft(JSON.parse(raw)) : EMPTY_DRAFT
  } catch {
    return EMPTY_DRAFT
  }
}

export function RequestWizard({ account }: {
  /** The signed-in person's contact details, or null for a guest. Passed from
   *  the server page rather than fetched: /api/me would arrive after the first
   *  paint, so the last screen would render its fields empty and then fill
   *  them under the cursor — and a field that changes while you are typing in
   *  it is worse than one that was never prefilled. */
  account: AccountContact | null
}) {
  // Seeded WITH the account, so the fields are already right in the server's
  // HTML — no flash, nothing to reconcile at hydration.
  const [draft, setDraft] = useState<Draft>(() => withAccountContact(EMPTY_DRAFT, account))
  const [stepId, setStepId] = useState('what')
  const [restored, setRestored] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [errorText, setErrorText] = useState<string | null>(null)
  const [sent, setSent] = useState<Sent | null>(null)
  const hydratedRef = useRef(false)
  const sentRef = useRef(false)
  const flowIdRef = useRef('')
  if (!flowIdRef.current) flowIdRef.current = newFlowId()

  useEffect(() => {
    trackRequestFunnel(REQUEST_FUNNEL_EVENTS.opened, { flowId: flowIdRef.current })
    const d = loadDraft()
    hydratedRef.current = true
    // ⚠️ The „is there a draft" test compares against EMPTY_DRAFT, NOT against
    // the seeded state. A signed-in person's name and number are not something
    // they started filling in — announcing „დაწყებული ფორმა აღდგა" because we
    // prefilled their own account details would be the banner lying.
    if (JSON.stringify(d) !== JSON.stringify(EMPTY_DRAFT)) {
      setDraft(withAccountContact(d, account))
      setStepId(resumeStepId(d))
      setRestored(true)
    }
    // Mount-only by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydratedRef.current) return
    try {
      if (sentRef.current) sessionStorage.removeItem(DRAFT_KEY)
      else sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch { /* resume is a nicety */ }
  }, [draft, sent])

  const startOver = () => {
    try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* nicety */ }
    // „თავიდან" means the ANSWERS, not the identity — starting over should not
    // make a signed-in person type their own name again.
    setDraft(withAccountContact(EMPTY_DRAFT, account))
    setStepId('what')
    setRestored(false)
  }

  const steps = stepsFor(draft)
  const step = steps.find(s => s.id === stepId) ?? steps[0]
  const isLast = nextStepId(step.id, draft) === null

  const patch = (p: Partial<Draft>) => {
    setDraft(d => ({ ...d, ...p }))
    if (status === 'error') { setStatus('idle'); setErrorText(null) }
  }

  const submit = async (d: Draft) => {
    if (status === 'sending') return
    const parsed = ServiceRequestInput.safeParse(d)
    if (!parsed.success) { setStatus('error'); setErrorText(errText('INVALID')); return }
    setStatus('sending')
    setErrorText(null)
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) {
        trackRequestFunnel(REQUEST_FUNNEL_EVENTS.failed, { flowId: flowIdRef.current, code: String(j?.error ?? 'ERROR') })
        setStatus('error'); setErrorText(errText(j?.error)); return
      }
      trackRequestFunnel(REQUEST_FUNNEL_EVENTS.sent, {
        flowId: flowIdRef.current, kind: d.kind, topic: d.topic, rejected: Boolean(j.rejected),
      })
      sentRef.current = true
      setSent({
        publicRef: j.publicRef ?? null,
        rejected: Boolean(j.rejected),
        account: (j.account ?? 'NONE') as AccountOutcome,
      })
    } catch {
      setStatus('error'); setErrorText(errText())
    } finally {
      setStatus(s => (s === 'sending' ? 'idle' : s))
    }
  }

  // ⚠️ Advance takes the DRAFT AS AN ARGUMENT: the tap that advances has just
  // patched state this closure cannot see yet — the stale-closure lesson this
  // wizard already paid for once.
  const advance = (d: Draft, from: string = step.id) => {
    const nx = nextStepId(from, d)
    if (nx === null) { submit(d); return }
    // The details gate — fired once, when the two priced answers are in.
    if (from === 'timing') {
      trackRequestFunnel(REQUEST_FUNNEL_EVENTS.detailsDone, {
        flowId: flowIdRef.current, kind: d.kind, topic: d.topic, band: d.budgetBand,
        notesLen: d.description.trim().length,
      })
    }
    setStepId(nx)
    window.scrollTo({ top: 0 })
  }
  const back = () => setStepId(prevStepId(step.id, draft))

  /** One tap on a single-question screen: record the answer, go. */
  const pickAndGo = (p: Partial<Draft>) => {
    const d = { ...draft, ...p }
    setDraft(d)
    advance(d)
  }

  if (sent) {
    return (
      <RequestShell>
        <ThanksCard sent={sent} topic={draft.topic} />
      </RequestShell>
    )
  }

  const kind = kindOf(draft.kind)
  const extraQ = step.extraId ? extrasFor(kind, draft.topic).find(q => q.id === step.extraId) : null

  return (
    <RequestShell progress={progressOf(step.id, draft)}>
      {/* ── ONE COLUMN, 560px ────────────────────────────────────────────────
          The shell's container is 820 (it also serves /request/[ref], which
          lists offers and needs the width). A wizard does not: every screen
          here is one question and a handful of short labels, and at 820 an
          option row was 756px wide carrying ~25 characters — the text ended at
          a third of the target and the rest was empty. That gap is what read as
          „dead" (owner, 2026-08-17).
          560 is the house `narrow` token — the width auth and focused forms
          already use. It is stated ONCE, here, rather than per step: the
          contact screen used to cap itself at 440 while every other screen ran
          full width, so the column jumped on the last tap. */}
      {/* Centred, like every other focused form on the site (auth is
          Container size="narrow", which is 560 and mx-auto). Left-aligned
          inside the 820 shell it sat off-centre — a column that is neither
          full width nor centred reads as a layout that lost an argument. */}
      <div className="max-w-[560px] mx-auto">
      {restored && (
        <div className="mb-4 rounded-field border border-ink-200 bg-white px-3.5 py-2.5 flex items-center justify-between gap-3">
          <span className="text-small text-ink-600">დაწყებული ფორმა აღდგა.</span>
          <button
            type="button"
            onClick={startOver}
            className="text-small font-display font-semibold text-brand-700 underline underline-offset-2 shrink-0"
          >
            თავიდან დაწყება
          </button>
        </div>
      )}

      {/* ── The conversation so far ─────────────────────────────────────────
          Everything already answered, kept on the page as bubbles. See
          _transcript for why the run stopped erasing itself. */}
      <Transcript
        steps={steps}
        currentId={step.id}
        draft={draft}
        onEdit={id => setStepId(id)}
      />

      {/* The current question keeps the h1 — it is still the page's heading and
          the thing a screen reader announces on arrival. Only the SIZE steps
          down once there is a transcript above it: at text-h1 the live question
          shouted over the conversation it belongs to, and the reader's eye had
          nothing to follow from one bubble to the next. */}
      <h1 className={`font-display font-bold text-ink-900 tracking-tight ${
        step.id === 'what' ? 'text-h1' : 'text-h2'
      }`}>
        {step.title}
      </h1>
      {step.id === 'what' && (
        <p className="mt-2 text-body text-ink-600">აღწერე — გადავამოწმებთ და ექსპერტები ფასს შემოგთავაზებენ. უფასოა.</p>
      )}
      {/* ⚠️ THE „kind · topic" RESTATEMENT LIVED HERE AND IS GONE (2026-08-17).
          It existed because the reader was several taps in with nothing on
          screen to remind them what this run was about — the transcript above
          now says it in their own words, at the top, where they said it. Kept,
          it printed „კონსულტაცია · ხელშეკრულება" a second time three lines
          under its own bubble. The same reasoning retires the contact screen's
          summary line; see _stepContact. */}

      <div key={step.id} className="mt-6 motion-safe:animate-slide-in-b">
        {step.id === 'what' && (
          <StepWhat
            draft={draft}
            onPick={topicId => {
              const d = withTopic(draft, topicId)
              setDraft(d)
              trackRequestFunnel(REQUEST_FUNNEL_EVENTS.topicChosen, { flowId: flowIdRef.current, topic: topicId, kind: d.kind || 'pending' })
              if (d.kind) trackRequestFunnel(REQUEST_FUNNEL_EVENTS.kindChosen, { flowId: flowIdRef.current, kind: d.kind })
              advance(d, 'what')
            }}
          />
        )}
        {step.id === 'kind' && (
          <StepKindPick
            draft={draft}
            onPick={k => {
              const d = withKind(draft, k)
              setDraft(d)
              trackRequestFunnel(REQUEST_FUNNEL_EVENTS.kindChosen, { flowId: flowIdRef.current, kind: k })
              advance(d, 'kind')
            }}
          />
        )}
        {extraQ && (
          <StepPick
            options={extraQ.options}
            value={draft.details[extraQ.id] ?? ''}
            onPick={id => pickAndGo({ details: { ...draft.details, [extraQ.id]: id } })}
            onSkip={() => advance(draft)}
          />
        )}
        {step.id === 'budget' && (
          <StepPick
            options={BUDGET_BANDS[kind]}
            value={draft.budgetBand}
            onPick={id => pickAndGo({ budgetBand: id })}
          />
        )}
        {step.id === 'timing' && (
          <StepPick
            options={TIMING[kind]}
            value={draft.timing}
            onPick={id => pickAndGo({ timing: id })}
          />
        )}
        {step.id === 'format' && (
          <StepPick
            options={FORMATS.map(f => f.id === 'IN_PERSON'
              ? { id: f.id, label: f.label, hint: 'ქალაქს შემდეგ იკითხავს' }
              : f)}
            value={draft.format}
            onPick={id => {
              // In-person needs the city; online does not — the sub-question
              // appears only on the answer that earns it.
              if (id === 'ONLINE' || id === 'EITHER') {
                pickAndGo({ format: id as Draft['format'] })
              } else {
                patch({ format: id as Draft['format'] })
              }
            }}
          />
        )}
        {step.id === 'format' && draft.format === 'IN_PERSON' && (
          <div className="mt-5">
            <p className="text-small font-display font-semibold text-ink-800 mb-2.5">რომელ ქალაქში?</p>
            <StepPick
              options={CITIES}
              value={draft.city}
              onPick={id => pickAndGo({ city: id as Draft['city'] })}
            />
          </div>
        )}
        {step.id === 'details' && <StepDetails draft={draft} patch={patch} />}
        {step.id === 'contact' && <StepContact draft={draft} patch={patch} signedIn={account !== null} />}
      </div>

      {status === 'error' && errorText && (
        <div role="alert" className="mt-5 rounded-field border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-body text-danger-700">
          {errorText}
        </div>
      )}

      {/* Tap-screens advance on the tap; the two typing screens keep explicit
          controls, and the optional details screen carries its skip. */}
      <div className="mt-6 flex items-center justify-between gap-3">
        {step.id !== 'what' ? (
          <Btn variant="ghost" onClick={back}>უკან</Btn>
        ) : <span />}
        {step.id === 'details' && (
          <Btn onClick={() => advance(draft)}>
            {draft.description.trim() === '' ? 'გამოტოვება' : 'შემდეგი'}
          </Btn>
        )}
        {step.id === 'contact' && (
          <Btn
            onClick={() => advance(draft)}
            disabled={!stepComplete('contact', draft) || status === 'sending'}
            aria-busy={status === 'sending'}
          >
            {status === 'sending' ? 'იგზავნება…' : 'გაგზავნა'}
          </Btn>
        )}
      </div>
      </div>
    </RequestShell>
  )
}

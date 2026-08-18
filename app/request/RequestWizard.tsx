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
  extrasFor, topicLabel, kindsOfTopic, budgetIsBelowFloor, amountIsBelowFloor, OTHER_TOPIC,
  type RequestKindName,
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
import { StepWhat } from './_stepWhat'
import { StepPick } from './_stepPick'
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

export function RequestWizard({ account, initialQuery = '' }: {
  /** What they typed on the home band, handed to the first screen's search so
   *  nobody retypes the answer they just gave. See app/request/page. */
  initialQuery?: string
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

  const kind = kindOf(draft.kind)
  /** Every clarifier this draft asks — all of them on one screen now, so this
   *  is a list rather than the single question it used to resolve. */
  const extras = step.id === 'extras' ? extrasFor(kind, draft.topic) : []

  /**
   * Every option the LIVE question offers, in the order it is drawn.
   *
   * One list, two consumers: the rows render from it and the number keys index
   * into it. Deriving the keyboard's list separately from the screen's is how
   * „press 3" and „tap the third row" start meaning different things.
   *
   * On the format screen after „ადგილზე" the live question is the CITY — the
   * format row above it is already answered, so the numbers belong to the
   * question actually being asked.
   */
  const options: { id: string; label: string; hint?: string }[] =
    step.id === 'kind' ? kindsOfTopic(draft.topic).map((k: RequestKindName) => ({ id: k, label: KIND[k].label, hint: KIND[k].hint }))
    // ⚠️ THE NUMBER KEYS ANSWER THE FIRST UNANSWERED CLARIFIER. With two
    // questions on one screen the keyboard has to pick one, and „the one you
    // have not answered" is the only choice that matches what a person doing
    // this by keyboard expects. Taps are unaffected — they name their own
    // question.
    : step.id === 'extras'
      ? [...(extras.find(q => !draft.details[q.id]) ?? extras[0])?.options ?? []]
    : step.id === 'budget' ? [...BUDGET_BANDS[kind]]
    : step.id === 'timing' ? [...TIMING[kind]]
    : step.id === 'format'
      ? (draft.format === 'IN_PERSON'
          ? [...CITIES]
          : FORMATS.map(f => f.id === 'IN_PERSON' ? { ...f, hint: 'ქალაქს შემდეგ იკითხავს' } : f))
    // The service run's place screen. Same list the format screen reveals after
    // „ადგილზე", except here it is the whole question rather than a follow-up —
    // see _model → stepsFor.
    : step.id === 'city' ? [...CITIES]
    : []

  /**
   * Answer the live question with one option id — from a tap OR from a number
   * key, through the same door.
   *
   * ⚠️ DISAMBIGUATED BY ID, not by which list was clicked. On the format screen
   * both the format rows and the city rows are on screen at once; their ids
   * cannot collide (ONLINE/IN_PERSON/EITHER vs TBILISI/…), so one function
   * serves both and there is no „which list did this come from" to get wrong.
   */
  const pickOption = (id: string) => {
    if (step.id === 'kind') {
      const k = id as Exclude<Draft['kind'], ''>
      const d = withKind(draft, k)
      setDraft(d)
      trackRequestFunnel(REQUEST_FUNNEL_EVENTS.kindChosen, { flowId: flowIdRef.current, kind: k })
      advance(d, 'kind')
      return
    }
    if (step.id === 'extras') {
      // ⚠️ ANSWERING ONE OF TWO DOES NOT ADVANCE. The screen holds every
      // clarifier, so a tap records an answer and leaves the reader on the page
      // to give the other one; „შემდეგი" is what leaves. The single-question
      // screens still advance on the tap, exactly as before.
      const q = extras.find(x => x.options.some(o => o.id === id))
      if (q) patch({ details: { ...draft.details, [q.id]: id } })
      return
    }
    if (step.id === 'budget') {
      // ⚠️ A BELOW-FLOOR BAND SELECTS BUT DOES NOT ADVANCE (2026-08-17).
      //
      // The floor is known the instant they tap it — `budgetIsBelowFloor` has
      // always been there — and until today the wizard never asked. So somebody
      // who chose „20₾-მდე" answered four more screens, typed their name, phone
      // and email, pressed send, and read „ამ ბიუჯეტში ვერ დაგეხმარებით" on the
      // thanks card. Seven screens of work to be told something true at the
      // first of them.
      //
      // Said HERE instead, where it is still a decision: they can raise the
      // budget, or continue knowingly. The row stays either way — „how many
      // arrive under the floor" is exactly what this stage exists to measure,
      // and the endpoint still writes it as REJECTED.
      //
      // Not-advancing is the same shape „ადგილზე" already uses two branches
      // down: a tap that opens something rather than closing the screen.
      if (budgetIsBelowFloor(kind, id)) { patch({ budgetBand: id }); return }
      pickAndGo({ budgetBand: id })
      return
    }
    if (step.id === 'timing') { pickAndGo({ timing: id }); return }
    if (step.id === 'city') { pickAndGo({ city: id as Draft['city'] }); return }
    if (step.id === 'format') {
      if (CITIES.some(c => c.id === id)) { pickAndGo({ city: id as Draft['city'] }); return }
      // In-person needs the city; online does not — the sub-question appears
      // only on the answer that earns it, so this one does NOT advance.
      if (id === 'ONLINE' || id === 'EITHER') { pickAndGo({ format: id as Draft['format'] }); return }
      patch({ format: id as Draft['format'] })
    }
  }

  /* ── The keyboard ────────────────────────────────────────────────────────
   *
   * 1–9 answers, Esc and Backspace go back. Nothing here is the only way to do
   * anything — it is the shortcut a person who fills forms all day reaches for,
   * and its whole value is that it costs nothing to ignore.
   *
   * ⚠️ ENTER IS DELIBERATELY NOT BOUND. It already belongs to the text fields:
   * a newline in the details box, submit in the contact form. Taking it would
   * be removing behaviour people already have to add behaviour they did not
   * ask for.
   *
   * ⚠️ AND NOTHING FIRES WHILE SOMEBODY IS TYPING. Backspace inside an input is
   * „delete a character" and always was; a global handler that stole it would
   * throw away the phone number somebody was correcting. The tag test is the
   * whole guard and it runs first.
   *
   * No dependency array: the handler closes over `draft` and `step`, both of
   * which change every answer. Re-subscribing per render is a listener swap;
   * a stale closure would be a key that answers the previous question.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape' || e.key === 'Backspace') {
        if (step.id === 'what') return
        e.preventDefault()
        back()
        return
      }
      if (/^[1-9]$/.test(e.key)) {
        const o = options[Number(e.key) - 1]
        if (!o) return
        e.preventDefault()
        pickOption(o.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (sent) {
    return (
      <RequestShell>
        <ThanksCard sent={sent} topic={draft.topic} />
      </RequestShell>
    )
  }

  return (
    <RequestShell
      progress={progressOf(step.id, draft)}
      // Not on the first screen: until a topic is picked the run's length is a
      // guess, and a denominator that changes on the first tap is the „form
      // growing under you" the bar exists to avoid. From step two it is settled
      // — see _shell.
      step={step.id === 'what' ? undefined : {
        index: steps.findIndex(s => s.id === step.id) + 1,
        total: steps.length,
      }}
    >
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

      {/* ── Back, then the record, then the live question ───────────────────
          It used to live in the footer, under the options — and on a five-row
          budget list that is off the bottom of a phone, so the one control a
          person reaches for after a mis-tap was the one they had to scroll to
          find (owner, 2026-08-17). Here it is the first thing above the live
          question, which is also where the eye already is.
          ONE back control on the screen: the footer's was removed rather than
          duplicated — two buttons doing the same thing is a reader wondering
          whether they differ. */}
      {step.id !== 'what' && (
        <div className="mb-3">
          <button
            type="button"
            onClick={back}
            className="inline-flex items-center gap-1.5 h-9 -ml-1 px-2 rounded-btn text-small font-display font-semibold text-ink-600 hover:text-ink-900 hover:bg-ink-75 motion-safe:active:scale-[0.97] transition-[color,background-color,transform] duration-fast"
          >
            {/* Functional, not decoration: it is the direction of travel and the
                whole label at 390px where the word is what shrinks first. */}
            <span aria-hidden>←</span>
            უკან
          </button>
        </div>
      )}

      {/* Everything already answered: the newest exchange as bubbles, the rest
          folded into one chip row. See _transcript for the measurements that
          retired the six-pair stack. */}
      <Transcript
        steps={steps}
        currentId={step.id}
        draft={draft}
        onEdit={id => setStepId(id)}
      />

      {/* ⚠️ ONE HEADING, ONE SIZE, ON EVERY SCREEN (2026-08-17, second pass).
          The live question was a `text-body` bubble on steps 2..n and a
          `text-h1` heading on step 1 — so the run changed its voice after the
          first tap, and on every later screen the question was set at exactly
          the size of the option labels below it (both `text-body`). A question
          that is the same size as its answers is not a question, it is a label.

          `text-h1` and not `text-h2`: this element IS the page's h1, so the
          canon's „no h2 at or above its own page's h1" makes 28 the honest
          step — and using the same token on the first screen as on the last is
          what removes the seam rather than moving it.

          Keyed on the step so each new question ENTERS rather than swapping in
          place — `slide-in-b` is the existing token the booking steps use; no
          new animation was minted for this. */}
      <div key={`q:${step.id}`} className="motion-safe:animate-slide-in-b">
        <h1 className="font-display text-h1 font-bold text-ink-900 tracking-tight text-balance">
          {step.title}
        </h1>
        {/* The sub-copy belongs to the opening screen alone: it explains what
            the whole run is for, which nobody needs repeated at step four. */}
        {step.id === 'what' && (
          <p className="mt-2 text-body text-ink-600">
            აღწერე — გადავამოწმებთ და ექსპერტები ფასს შემოგთავაზებენ. უფასოა.
          </p>
        )}
      </div>
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
            initialQuery={initialQuery}
            // ⚠️ THE CATALOGUE COULD NOT NAME IT, SO THE SENTENCE BECOMES THE
            // REQUEST (2026-08-17). „მჭირდება სახლის დალაგება" matched nothing
            // — there is no cleaning topic — and the screen used to answer
            // „choose „სხვა" and write it in the description", which is our
            // filing problem handed to somebody with a job and money.
            // Their words go straight into the description, the topic is filed
            // as „სხვა" (which is true), and the run continues. The operator
            // phones every request anyway; a taxonomy gap is ours to close, not
            // theirs to work around.
            onFreeText={text => {
              const d = { ...withTopic(draft, OTHER_TOPIC.id), description: text }
              setDraft(d)
              trackRequestFunnel(REQUEST_FUNNEL_EVENTS.topicChosen, {
                flowId: flowIdRef.current, topic: OTHER_TOPIC.id, kind: d.kind || 'pending',
              })
              advance(d, 'what')
            }}
            // ⚠️ AN AMBIGUOUS TOPIC NO LONGER ADVANCES (2026-08-18). It used
            // to go straight on to a „აირჩიე ტიპი" screen; the kinds now appear
            // under the topic on THIS screen, so advancing here would skip past
            // the question the tap just raised. A topic that resolves its own
            // kind still advances on the tap, exactly as before.
            onPick={topicId => {
              const d = withTopic(draft, topicId)
              setDraft(d)
              trackRequestFunnel(REQUEST_FUNNEL_EVENTS.topicChosen, { flowId: flowIdRef.current, topic: topicId, kind: d.kind || 'pending' })
              if (d.kind) {
                trackRequestFunnel(REQUEST_FUNNEL_EVENTS.kindChosen, { flowId: flowIdRef.current, kind: d.kind })
                advance(d, 'what')
              }
            }}
            onPickKind={k => {
              const d = withKind(draft, k)
              setDraft(d)
              trackRequestFunnel(REQUEST_FUNNEL_EVENTS.kindChosen, { flowId: flowIdRef.current, kind: k })
              advance(d, 'what')
            }}
          />
        )}
        {/* ⚠️ EVERY TAP SCREEN RENDERS FROM `options` AND ANSWERS THROUGH
            `pickOption` (2026-08-17). It used to be five branches, each with its
            own list and its own handler — fine while a tap was the only way to
            answer. The number keys made that a liability: the keyboard indexed
            one list while the screen drew another, and „press 3" and „tap the
            third row" were two implementations of one promise. Now there is one
            of each, so they cannot disagree.
            The format screen is the exception that proves it: after „ადგილზე"
            it shows the answered format rows AND the live city question, so it
            keeps its own list for the part that is already answered. */}
        {step.id === 'kind' && (
          <StepPick options={options} value={draft.kind} onPick={pickOption} numbered />
        )}
        {step.id === 'extras' && (
          <div className="flex flex-col gap-6">
            {extras.map((q, i) => (
              <div key={q.id}>
                {/* The screen's own title names the group, so each question
                    still has to name itself — two unlabelled chip rows are two
                    questions nobody can tell apart. */}
                <p className="text-small font-display font-semibold text-ink-800 mb-2.5">{q.label}</p>
                <StepPick
                  options={[...q.options]}
                  value={draft.details[q.id] ?? ''}
                  onPick={pickOption}
                  // Numbered on the first UNANSWERED one only — the keys index
                  // that list (see `options`), and a badge on a row the digits
                  // do not reach is a lie about the shortcut.
                  numbered={q.id === (extras.find(x => !draft.details[x.id]) ?? extras[0])?.id}
                />
              </div>
            ))}
          </div>
        )}
        {step.id === 'budget' && (
          <>
            <StepPick options={options} value={draft.budgetBand} onPick={pickOption} numbered />
            {/* ── …or just type it (2026-08-18) ──────────────────────────────
                Owner: „აქ ხელით უნდა იწერებოდეს." The ladder stays because
                somebody who does not know what the work costs cannot type a
                figure — that is why bands exist at all. But somebody who DOES
                know was being made to hunt for the range containing their
                number, and then we stored the range instead of the number.

                Typing WINS over the band and is stored exactly: „45₾" is more
                information than „30–60₾", and snapping it to a range throws
                away the one thing they actually told us. */}
            <div className="mt-4 pt-4 border-t border-ink-100">
              <label className="block">
                <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">
                  ან ჩაწერე ზუსტი თანხა
                </span>
                <div className="flex items-center gap-2 max-w-[220px]">
                  <input
                    type="number" min={1} max={1000000} step={1} inputMode="numeric"
                    value={draft.budgetAmount ?? ''}
                    onChange={e => {
                      const n = Number(e.target.value)
                      // A typed amount clears the band: two answers to one
                      // question, and the transcript would otherwise show the
                      // one they abandoned.
                      patch({
                        budgetAmount: e.target.value.trim() === '' || !Number.isFinite(n) || n <= 0
                          ? null : Math.trunc(n),
                        budgetBand: '',
                      })
                    }}
                    placeholder="45"
                    className="w-full h-11 px-3.5 rounded-field border border-ink-200 bg-white text-body text-ink-900 placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition-colors duration-fast"
                  />
                  <span className="text-body text-ink-600 shrink-0">₾ {KIND[kind].unitLabel}</span>
                </div>
              </label>
              {(draft.budgetAmount ?? 0) > 0 && (
                <div className="mt-3">
                  <Btn onClick={() => advance(draft)}>შემდეგი</Btn>
                </div>
              )}
            </div>
          </>
        )}
        {/* ── The floor, said at the moment of choosing ─────────────────────
            Only on the band that earns it, and it does not block: the request
            is written either way (see the endpoint — the row is the
            measurement). What it buys is the chance to change the answer
            before spending four more screens on it. */}
        {step.id === 'budget' && (
          draft.budgetBand !== ''
            ? budgetIsBelowFloor(kind, draft.budgetBand)
            // ⚠️ THE SAME RULE FOR A TYPED NUMBER. Warning somebody who tapped
            // „20₾-მდე" and staying silent for somebody who typed „18" is one
            // answer with two outcomes, decided by which control they used.
            : amountIsBelowFloor(kind, draft.budgetAmount ?? 0)
        ) && (
          <div className="mt-4 rounded-card border border-warning-200 bg-warning-50 px-4 py-3">
            <p className="text-body text-ink-900">ამ ბიუჯეტში ექსპერტს ვერ მოგიძებნით.</p>
            <p className="mt-1 text-small text-ink-700">
              აირჩიე სხვა ბიუჯეტი, ან გააგრძელე — მოთხოვნას მაინც მივიღებთ.
            </p>
            <div className="mt-3">
              <Btn variant="secondary" size="sm" onClick={() => advance(draft)}>
                მაინც გავაგრძელებ
              </Btn>
            </div>
          </div>
        )}
        {step.id === 'timing' && (
          <StepPick options={options} value={draft.timing} onPick={pickOption} numbered />
        )}
        {step.id === 'format' && (
          <StepPick
            options={FORMATS.map(f => f.id === 'IN_PERSON'
              ? { id: f.id, label: f.label, hint: 'ქალაქს შემდეგ იკითხავს' }
              : f)}
            value={draft.format}
            onPick={pickOption}
            // Numbered only while it IS the live question — once „ადგილზე" is
            // chosen the numbers belong to the city list below.
            numbered={draft.format !== 'IN_PERSON'}
          />
        )}
        {/* The service run asks the city on its own screen — one list, one
            question, no format rows above it. */}
        {step.id === 'city' && (
          <StepPick options={options} value={draft.city} onPick={pickOption} numbered />
        )}
        {step.id === 'format' && draft.format === 'IN_PERSON' && (
          <div className="mt-5">
            <p className="text-small font-display font-semibold text-ink-800 mb-2.5">რომელ ქალაქში?</p>
            <StepPick options={options} value={draft.city} onPick={pickOption} numbered />
          </div>
        )}
        {step.id === 'contact' && <StepContact draft={draft} patch={patch} signedIn={account !== null} />}
      </div>

      {status === 'error' && errorText && (
        <div role="alert" className="mt-5 rounded-field border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-body text-danger-700">
          {errorText}
        </div>
      )}

      {/* Tap-screens advance on the tap; the two typing screens keep explicit
          controls, and the optional details screen carries its skip. */}
      {/* ⚠️ „უკან" IS NOT HERE ANY MORE — it moved above the question (2026-08-17;
          see the note there). The empty span stays so `justify-between` keeps
          the primary action on the right rather than jumping to the left edge
          on the screens that have one. */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <span />
        {step.id === 'extras' && (
          <Btn onClick={() => advance(draft)}>
            {Object.keys(draft.details).length === 0 ? 'გამოტოვება' : 'შემდეგი'}
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

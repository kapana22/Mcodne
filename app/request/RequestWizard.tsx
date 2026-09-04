'use client'
// The request wizard — the container.
//
// One question per screen, the tap advances, the run is derived from the draft
// (see _model → stepsFor). This file owns the draft, the current STEP ID and
// the submit; every screen is a sibling component and every rule lives in
// _model or lib/requests — the container holds no validation of its own.

import { useEffect, useRef, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import {
  ServiceRequestInput, KIND, kindOf, TIMING, BUDGET_BANDS, FORMATS, CITIES, ONE_CITY,
  extrasFor, topicLabel, kindsOfTopic, OTHER_TOPIC,
  MAX_REQUEST_PHOTOS, VERTICAL_COPY,
  type RequestKindName, type Vertical,
} from '@/lib/requests'
import { validationIssueMessage } from '@/lib/validationMessages'
import { useFault } from '@/components/FieldError'
import { newFlowId } from '@/lib/funnelEvents'
import { WorkPhotos } from '@/app/join/_provider/_workPhotos'
import { REQUEST_FUNNEL_EVENTS, trackRequestFunnel } from './requestFunnelEvents'
import { RequestShell } from './_shell'
import {
  EMPTY_DRAFT, stepsFor, stepComplete, nextStepId, prevStepId, resumeStepId, stageOfStep,
  stagesFor, progressOf, reviveDraft, withTopic, withKind, withAccountContact, withTarget,
  type Draft, type AccountContact,
} from './_model'
import { Transcript } from './_transcript'
import { StepWhat, type CatTile } from './_stepWhat'
import { StepPick } from './_stepPick'
import { StepContact } from './_stepContact'
import type { AccountOutcome } from '@/lib/requestAccount'
import { ThanksCard } from './_thanks'
import { actionError, SEND_FAILED } from '@/lib/actionErrors'

type Status = 'idle' | 'sending' | 'error'
export type Sent = {
  publicRef: string | null
  rejected: boolean
  /** Did it go straight to the providers, or is somebody reading it first?
   *  See the endpoint — the screen cannot work this out for itself. */
  autoVerified: boolean
  /** What happened to the account while the request was sending — see
   *  lib/requestAccount. The thanks screen is the only reader. */
  account: AccountOutcome
}

/** Server codes → Georgian. Never surface a raw code to a reader. */
/* Every case this screen had is a shared one — RATE_LIMITED, INVALID, and a
   send's default. It keeps no map of its own. */
const errText = (code?: string) => actionError(code, {}, SEND_FAILED)

/**
 * The three boxes the LAST screen owns, and the only ones a refusal can be put
 * on from here.
 *
 * ⚠️ EVERY OTHER FIELD BELONGS TO A SCREEN THAT IS NO LONGER ON SCREEN. A
 * `topic`, `timing` or `budgetBand` issue means the draft got past
 * `stepComplete` in some state the wizard did not expect (that has happened
 * once — see the clarifier note further down, where a chip id was written into
 * `draft.timing` and „გაგზავნა" then stayed dead for the rest of the run). It
 * cannot be pointed at a control, so it stays a form-level line — with, at
 * least, the field-aware sentence `validationIssueMessage` builds from the path.
 *
 * `description` IS on the list even though it folds away: its only rule is
 * `.max(4000)`, so a value that breaks it is by definition non-empty, and the
 * screen opens the box for any non-empty description. There is no state where
 * that fault has no control to land on.
 */
const CONTACT_FIELDS = new Set(['contactName', 'phone', 'email', 'description'])

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

export function RequestWizard({ account, initialQuery = '', initialTopic = '', initialCategory = '', vertical = 'EXPERT', to = null, covered = [], tiles = [] }: {
  /** ⚠️ THE DOOR, FROM THE URL (`?for=service`). Owner, 2026-08-18, approving
   *  option „ა": the entry point picks the vertical and the wizard never asks
   *  again — the ss.ge shape, where you choose the world at the entrance and
   *  everything inside is that world's.
   *
   *  Defaulted rather than required, because /request is reached bare from the
   *  home band's field and from the expert half of the site, and a missing
   *  parameter must land somebody somewhere sensible rather than on a chooser
   *  they did not ask for. */
  vertical?: Vertical
  /** What they typed on the home band, handed to the first screen's search so
   *  nobody retypes the answer they just gave. See app/request/page. */
  initialQuery?: string
  /** A topic the visitor already chose by name on the home band — validated in
   *  app/request/page against the vocabulary before it reaches here. Empty is
   *  the ordinary case and changes nothing. */
  initialTopic?: string
  /** A sphere named on the home band — see _stepWhat. */
  initialCategory?: string
  /** The spheres the first screen draws under its field — resolved on the
   *  server because the price floor is a measurement, never a constant.
   *  Passed straight through; nothing here reads them. */
  tiles?: CatTile[]
  /** Topic ids at least one live provider offers — see lib/requestsServer →
   *  coveredTopicIds. Empty is „do not narrow", which is what a database with
   *  no providers at all should do rather than offering nothing. */
  covered?: string[]
  /** The signed-in person's contact details, or null for a guest. Passed from
   *  the server page rather than fetched: /api/me would arrive after the first
   *  paint, so the last screen would render its fields empty and then fill
   *  them under the cursor — and a field that changes while you are typing in
   *  it is worse than one that was never prefilled. */
  account: AccountContact | null
  /**
   * ⚠️ WHO THIS REQUEST IS BEING WRITTEN TO — `?to=<slug>`, already resolved to
   * a visible provider on the server (lib/requestTarget). Null is the ordinary
   * case and changes nothing: the wizard this component draws without a
   * recipient is exactly the wizard it drew before this existed.
   *
   * Three things it does, and no fourth: names the recipient in the chrome,
   * narrows the first screen's catalogue to that provider's own topics, and
   * rides back to the server on submit so the endpoint can open the INVITED
   * thread. The SLUG is what is sent, never a user id — the browser holds a
   * public address, and the endpoint resolves it again anyway.
   */
  to?: { slug: string; name: string; photoSrc?: string | null; topics: string[] } | null
}) {
  // Seeded WITH the account AND with the chosen provider's topic, so the first
  // paint is already the right screen — no flash, nothing to reconcile at
  // hydration.
  /* ⚠️ THE TOPIC IS APPLIED TO THE SEED, not set afterwards — the same reason
     the account and the target are: a first paint that is already the right
     screen has nothing to reconcile at hydration. `withTopic` also resolves the
     kind when the topic carries only one, so a person who tapped „ხელშეკრულება"
     on the home page lands on the money question rather than on a screen asking
     what they just answered. */
  const seed = () => {
    const base = withTarget(withAccountContact({ ...EMPTY_DRAFT, vertical }, account), to?.topics ?? [], !!to)
    return initialTopic ? withTopic(base, initialTopic) : base
  }
  const [draft, setDraft] = useState<Draft>(seed)
  // ⚠️ NOT THE LITERAL 'what'. With a provider chosen the run starts on the
  // budget question and there IS no „what" screen — a hard-coded first step
  // would park the wizard on a screen `stepsFor` does not list, which renders
  // as the first one anyway and then disagrees with the counter.
  const [stepId, setStepId] = useState(() => stepsFor(seed())[0].id)
  const [restored, setRestored] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [errorText, setErrorText] = useState<string | null>(null)
  // Which box on the contact screen is wrong, and why — see components/FieldError.
  const contact = useFault('req')
  const [sent, setSent] = useState<Sent | null>(null)
  const hydratedRef = useRef(false)
  const sentRef = useRef(false)
  const flowIdRef = useRef('')
  if (!flowIdRef.current) flowIdRef.current = newFlowId()
  const router = useRouter()

  // ── THE ROOM'S ADDRESS, WITHOUT LEAVING THE ROOM (stage 10) ───────────────
  // Owner: „ფორმა გაიგზავნა → ფანჯარა ღია რჩება." On send this component does
  // NOT navigate: the same screen becomes the room (ThanksCard — the stations,
  // the thread), so nothing flashes and nothing reloads. What changes is the
  // ADDRESS BAR: `history.replaceState` to /request/<ref>, so a refresh, a
  // bookmark or a shared tab lands on the server-rendered room for this
  // request rather than on an empty wizard. Next's router hears the
  // replaceState (it patches it) and updates `usePathname` — AppShell keys its
  // page wrapper on the pathname and would remount this whole tree, so it
  // treats the intake as ONE room (see components/AppShell). Never
  // `router.push`/`router.replace` here — either is a navigation, and a
  // navigation is the flash this exists to remove.
  useEffect(() => {
    if (!sent?.publicRef) return
    const target = `/request/${sent.publicRef}`
    if (window.location.pathname === target) return
    try { window.history.replaceState(window.history.state, '', target) } catch { /* the room still works at /request */ }
  }, [sent])

  // ⚠️ THE ONE CASE THAT IS A NAVIGATION: this wizard MOUNTING under a room's
  // address. That happens on Back — room → „შეთავაზებების ნახვა" (the [ref]
  // page) → Back lands on the history entry whose URL is /request/<ref> but
  // whose tree is still the wizard's (the entry was replaced in place, not
  // pushed). A fresh, empty wizard at a room's address is a lie about where you
  // are, so it hands over to the page that owns that URL — a replace, so the
  // history stack stays the same length.
  useEffect(() => {
    if (sentRef.current) return
    const here = window.location.pathname
    if (/^\/request\/[^/]+$/.test(here)) router.replace(here)
    // Mount-only by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ⚠️ THE COOKIE BANNER WAS SITTING ON THE ANSWERS AND ON THE SEND BUTTON
  // (2026-08-18, measured at 390×844 on a first visit).
  //
  //   extras screen — the option „4 ან მეტი" occupied y 806–862, the banner
  //                   787–844. The option was UNREACHABLE.
  //   contact screen — „გაგზავნა" occupied 813–857, the banner 787–844: 31 of
  //                   its 44 pixels covered, on the last screen of the funnel.
  //
  // _shell reserves `pb-28 sm:pb-32` and its comment claims that handles it. It
  // does not, and the reason is worth writing down: that reserve is PAGE-BOTTOM
  // padding, while a wizard step's controls sit mid-page — a short screen puts
  // them exactly where a `fixed bottom-0` banner floats, and no amount of
  // padding under them moves them.
  //
  // The mechanism already existed: globals.css lifts the banner 132px for
  // `body[data-mobile-cta]`, and four other screens set it. The wizard never
  // did. `'lift'` rather than `'1'` because this route does not want the body
  // reserve that value also carries — see the rule's own note.
  useEffect(() => {
    document.body.setAttribute('data-mobile-cta', 'lift')
    return () => { document.body.removeAttribute('data-mobile-cta') }
  }, [])

  useEffect(() => {
    trackRequestFunnel(REQUEST_FUNNEL_EVENTS.opened, { flowId: flowIdRef.current })
    const d = loadDraft()
    hydratedRef.current = true
    // ⚠️ The „is there a draft" test compares against EMPTY_DRAFT, NOT against
    // the seeded state. A signed-in person's name and number are not something
    // they started filling in — announcing „დაწყებული ფორმა აღდგა" because we
    // prefilled their own account details would be the banner lying.
    if (JSON.stringify(d) !== JSON.stringify({ ...EMPTY_DRAFT, vertical: d.vertical })) {
      // ⚠️ THE URL WINS OVER THE SAVED DRAFT ON THIS ONE FIELD. Somebody who
      // abandoned an expert request last week and then arrived through a trades
      // door (`?for=service`) has just told us which door they are at now;
      // restoring the old vertical would answer their tap with the other half's
      // questions and there is no control on screen to correct it.
      // ⚠️ THE URL WINS ON THE RECIPIENT TOO, for the same reason it wins on
      // the vertical: `withTarget` re-applies the pin (and clears it when there
      // is no provider — see _model → reviveDraft), so a run once started from
      // somebody's profile cannot go on shortening a bare /request.
      const revived = withTarget(withAccountContact({ ...d, vertical }, account), to?.topics ?? [], !!to)
      setDraft(revived)
      setStepId(resumeStepId(revived))
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
    const fresh = seed()
    setDraft(fresh)
    setStepId(stepsFor(fresh)[0].id)
    setRestored(false)
  }

  const steps = stepsFor(draft)
  const step = steps.find(s => s.id === stepId) ?? steps[0]
  const isLast = nextStepId(step.id, draft) === null

  const patch = (p: Partial<Draft>) => {
    setDraft(d => ({ ...d, ...p }))
    if (status === 'error') { setStatus('idle'); setErrorText(null) }
    // Clear the fault the moment they start fixing THAT box — a red border
    // under a field they have already corrected is noise.
    for (const k of Object.keys(p)) contact.clearField(k)
  }

  /* ⚠️ A REFUSAL USED TO LAND AT THE FOOT OF THE PAGE (fixed 2026-08-31). The
   * contact screen is three boxes and a submit; the schema already knew which
   * one was wrong — `issues[0].path` — and the wizard threw the path away and
   * printed the sentence in a red strip under the button. On a phone, with the
   * description box open, „ნომერი არასწორია" appeared below the fold of the
   * field it was about, with nothing marking that field at all.
   *
   * The path is now carried onto the control: red border, `aria-invalid`,
   * `aria-describedby` → the sentence, and the cursor moved there. The sentence
   * itself is unchanged — the schema's own Georgian message, or
   * `validationIssueMessage` for a structural issue with no copy of its own. */
  const submit = async (d: Draft) => {
    if (status === 'sending') return
    contact.reset()
    const parsed = ServiceRequestInput.safeParse(d)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const path = typeof issue?.path?.[0] === 'string' ? issue.path[0] : ''
      const text = validationIssueMessage(issue, errText('INVALID'))
      if (CONTACT_FIELDS.has(path)) { contact.fail(path, text); return }
      setStatus('error')
      setErrorText(text)
      return
    }
    setStatus('sending')
    setErrorText(null)
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // ⚠️ `to` RIDES OUTSIDE THE PARSED BODY, and it is a SLUG. It is not a
        // field of the request (ServiceRequestInput strips it — the row records
        // what was asked for, not who it was aimed at; the aim is the INVITED
        // offer the endpoint writes). The endpoint resolves this string again
        // against the same visibility rule the page used, so a crafted value
        // buys nothing: the worst case is a thread with somebody the catalogue
        // already shows publicly.
        body: JSON.stringify(to ? { ...parsed.data, to: to.slug } : parsed.data),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) {
        trackRequestFunnel(REQUEST_FUNNEL_EVENTS.failed, { flowId: flowIdRef.current, code: String(j?.error ?? 'ERROR') })
        // The endpoint answers with the SAME `field` + `message` pair the schema
        // produced here, so a refusal that only the server could reach (a
        // crafted body, a schema this build is behind on) still lands on a box.
        const field = typeof j?.field === 'string' ? j.field : ''
        if (CONTACT_FIELDS.has(field) && j?.message) { contact.fail(field, j.message); return }
        setStatus('error'); setErrorText(j?.message ?? errText(j?.error)); return
      }
      trackRequestFunnel(REQUEST_FUNNEL_EVENTS.sent, {
        flowId: flowIdRef.current, kind: d.kind, topic: d.topic, rejected: Boolean(j.rejected),
      })
      sentRef.current = true
      setSent({
        publicRef: j.publicRef ?? null,
        rejected: Boolean(j.rejected),
        autoVerified: Boolean(j.autoVerified),
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
    setGoingBack(false)
    setStepId(nx)
    window.scrollTo({ top: 0 })
  }
  /* ⚠️ WHICH WAY THE LAST MOVE WENT (2026-09-03). Owner: „ანიმაცია არაა
     დამახასიათებელი… იგივეა." It was: every screen played the same
     `slide-in-b`, so stepping forward and stepping back were the same
     gesture on screen and the motion told the reader nothing.
     The pattern every multi-step form settles on is direction-aware — next
     arrives from one side, previous from the other. The keyframe library is
     CLOSED (lib/design/README §4), so this picks between two entrances that
     already exist rather than minting a third: forward SLIDES IN from the
     right, back FADES in. Different, and honest about which is which — going
     back is a retreat and a quiet arrival is what that is. */
  const [goingBack, setGoingBack] = useState(false)

  /* The typed budget, and the band it lands in. Kept as a STRING because that
     is what an input holds — „0" and „" are different states and a number would
     collapse them. `amountBand` is null while the box is empty or the figure is
     outside every band, which is what disables the button: a screen that
     advanced on an unresolvable number would file a request with no budget
     after asking for one. */
  const [amount, setAmount] = useState('')
  const amountBand = useMemo(() => {
    const n = Number(amount)
    if (!amount.trim() || !Number.isFinite(n) || n <= 0) return null
    return BUDGET_BANDS[kindOf(draft.kind)].find(b => n >= b.min && (b.max === null || n <= b.max)) ?? null
  }, [amount, draft.kind])

  const back = () => { setGoingBack(true); setStepId(prevStepId(step.id, draft)) }

  /** One tap on a single-question screen: record the answer, go. */
  /** The question this screen is waiting on, once somebody has tried to leave
   *  it. Null until then — a form that goes red before you have touched it is
   *  telling you off for arriving. */
  const [missingQ, setMissingQ] = useState<string | null>(null)

  /** Mark it, and take them to it. The same gesture app/join uses for a refused
   *  field (`stopOn`): a message with nothing scrolled into view is a message
   *  nobody reads on a screen this long. */
  const stopOnQuestion = (id: string) => {
    setMissingQ(id)
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-question="${id}"]`)
      if (!el) return
      const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' })
    })
  }

  const pickAndGo = (p: Partial<Draft>) => {
    const d = { ...draft, ...p }
    setDraft(d)
    advance(d)
  }

  const kind = kindOf(draft.kind)
  /* ⚠️ `extras` STOOD HERE AND IT WAS THE LAST HALF OF A HALF-DONE SPLIT
     (removed 2026-09-04). The clarifiers went back to their own screens on
     2026-09-03 (`stepsFor` → `extra:<id>`), which made this list — every
     clarifier the draft asks, computed for the TIMING step — describe a screen
     that no longer exists. The render was corrected in that commit and the
     PICK HANDLER was not, so `pickOption` still asked `extras.length > 0` and
     took the „record, do not advance" branch on every topic that has a
     clarifier. That branch was written for a screen with three questions and a
     „გავაგრძელოთ" button; the button went with the screen. The result on
     production: you tap a date, the row ticks, and nothing else ever happens.
     Owner, with a screenshot of step 4/6: „ბაგი ვიპოვე, ამის მერე არ გადადის."
     Same class as the blank screens and the empty option list before it — a
     step whose three parts (produce · draw · advance) were not changed
     together. */

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
    // ⚠️ THE NUMBER KEYS ANSWER THE TIMING, even when clarifiers share the
    // screen. It is the question everybody is asked and the only one that
    // advances the run; pointing the digits at an optional chip row would make
    // „press 2" mean something different on 94 of 171 topics. The clarifiers
    // answer by tap, which names its own question.
    /* ⚠️ THE BANDS ARE THIS KIND'S OWN (2026-09-03). LEARNING prices a LESSON,
       SERVICE a VISIT, PROJECT the whole job — one shared ladder would ask a
       tutor's client about 15 000₾. `BUDGET_BANDS` is keyed on the kind for
       exactly that reason, and the label is the band's, never a number this
       screen invents. */
    /* ⚠️ ONE CLARIFIER PER SCREEN SINCE 2026-09-03 (see _model → stepsFor for
       the owner's words and what it costs). The question is named by the step,
       so the digits point at the only list on the page — which is what makes
       them honest again: while two questions shared a screen the badges could
       only ever number one of them. */
    : step.extraId ? [...(extrasFor(kind, draft.topic).find(q => q.id === step.extraId)?.options ?? [])]
    : step.id === 'budget' ? BUDGET_BANDS[kind].map(b => ({ id: b.id, label: b.label }))
    : step.id === 'timing' ? [...TIMING[kind]]
    // ⚠️ THE CITY FOLLOW-UP IS SKIPPED WHILE THERE IS ONE CITY (2026-08-20).
    // With a single row the reveal is a list that answers itself, and the
    // number keys would point at it instead of at the format rows the person
    // is actually reading. See CITIES in lib/requestTopics.
    : step.id === 'format'
      ? (draft.format === 'IN_PERSON' && !ONE_CITY
          ? [...CITIES]
          : FORMATS.map(f => f.id === 'IN_PERSON' ? (ONE_CITY ? f : { ...f, hint: 'ქალაქს შემდეგ იკითხავს' }) : f))
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
   * cannot collide (ONLINE/IN_PERSON vs TBILISI/…), so one function serves both
   * and there is no „which list did this come from" to get wrong.
   */
  /**
   * A tap on a CLARIFIER chip — and it is deliberately NOT `pickOption`.
   *
   * ⚠️ THE QUESTION IS PASSED IN, NEVER LOOKED UP BY OPTION ID. The clarifiers
   * share the timing screen (see _model → stepsFor), and the two vocabularies
   * COLLIDE: „unsure" is a `level` option on 177 learning topics AND the
   * LEARNING timing id. Any handler that resolves „which question was this?"
   * from the id alone therefore has 177 topics on which it is guessing.
   *
   * That is exactly how this broke: the routing lived in `pickOption` under
   * `step.id === 'extras'`, an id `stepsFor` stopped producing when the
   * clarifiers moved onto the timing screen — so a clarifier tap fell through
   * to the timing branch, wrote the chip's id into `draft.timing`, and
   * ADVANCED. `stepComplete('contact')` then parsed the draft, found a timing
   * that is on no ladder, and kept „გაგზავნა" disabled for the rest of the
   * run: a request that could never be sent, on the 94 of 171 topics that
   * carry clarifiers.
   *
   * ⚠️ AND IT DOES NOT ADVANCE. The screen holds every clarifier, so a tap
   * records an answer and leaves the reader on the page to give the other one.
   * The timing tap below is the one that leaves, because it is the question
   * asked of everybody.
   */
  const answerExtra = (questionId: string, optionId: string) => {
    // Functional, not `patch({ details: { ...draft.details, … } })`: two chips
    // tapped in the same tick would otherwise both spread the SAME stale
    // `draft.details` and the first answer would be dropped.
    setDraft(d => ({ ...d, details: { ...d.details, [questionId]: optionId } }))
    if (status === 'error') { setStatus('idle'); setErrorText(null) }
  }

  const pickOption = (id: string) => {
    if (step.id === 'kind') {
      const k = id as Exclude<Draft['kind'], ''>
      const d = withKind(draft, k)
      setDraft(d)
      trackRequestFunnel(REQUEST_FUNNEL_EVENTS.kindChosen, { flowId: flowIdRef.current, kind: k })
      advance(d, 'kind')
      return
    }
    /* A clarifier: write the answer under ITS OWN question id and move on. The
       option ids collide across ladders („unsure" is in three of them), so the
       question can only come from the screen — never from the option. */
    if (step.extraId) {
      const d = { ...draft, details: { ...draft.details, [step.extraId]: id } }
      setDraft(d)
      advance(d)
      return
    }
    /* One tap, and it is the only question on the screen — so it advances,
       the same contract every single-question screen in this run has. */
    if (step.id === 'budget') { pickAndGo({ budgetBand: id }); return }
    /* ⚠️ AND THE DATE ADVANCES AGAIN (2026-09-04). It did not between
       2026-09-01 and today, on purpose then and by omission after: the
       clarifiers were briefly drawn on THIS screen, so a tap on a date could
       have ended a page holding three questions with two of them unanswered
       (owner, 2026-09-01: „ერთს რომ ვაწვები ვერ ვხდები რომ მეორესაც უნდა
       დავაწვე" — reproduced on „ბინის დალაგება", where the room count was
       silently dropped). The answer then was to let nothing on the screen
       advance and to add „გავაგრძელოთ".
       The clarifiers moved back to their own screens on 2026-09-03 and the
       button went with the stacked page — but this branch kept asking whether
       clarifiers existed, so on every topic that has one the screen recorded
       the tap and offered no way out. One question on the screen, one tap that
       ends it: the contract every other single-question step here follows. */
    if (step.id === 'timing') { pickAndGo({ timing: id }); return }
    if (step.id === 'city') { pickAndGo({ city: id as Draft['city'] }); return }
    if (step.id === 'format') {
      if (CITIES.some(c => c.id === id)) { pickAndGo({ city: id as Draft['city'] }); return }
      // ⚠️ ONLY THE ANSWER THAT ACTUALLY OPENS A SUB-QUESTION HOLDS THE SCREEN,
      // and until 2026-08-31 „ადგილზე" held it unconditionally. The city list
      // it was waiting for is drawn under `!ONE_CITY` (below), and ONE_CITY has
      // been true since 2026-08-20 — so tapping „ადგილზე" highlighted the row,
      // revealed nothing, and left a run with no way forward: no city list, no
      // continue button, and the number keys landing on this same branch.
      // Owner, 2026-08-31: „როცა ადგილზე ვაწვები არ მუშაობს."
      //
      // The `numbered` prop three hundred lines down had ALREADY been taught
      // about one city („with one city there is no list below"); the advance
      // had not, which is why the screen looked right and did nothing.
      if (id === 'IN_PERSON' && !ONE_CITY) { patch({ format: 'IN_PERSON' }); return }
      pickAndGo({ format: id as Draft['format'] })
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
        // The FIRST screen of THIS run — which is no longer always „what" (a
        // chosen provider drops it; see _model → stepsFor).
        if (step.id === steps[0].id) return
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
      <RequestShell
    >
        {/* The transform, not a page: the last screen leaves and the room
            arrives with the same entrance every step used (`slide-in-b`), so
            it reads as the next step of the same errand — which it is. One
            entrance, on the root, nothing staggered. */}
        <div className="motion-safe:animate-slide-in-b">
          <ThanksCard sent={sent} topic={draft.topic} />
        </div>
      </RequestShell>
    )
  }

  return (
    <RequestShell
      /* ⚠️ THE PRIMARY ACTION IS THE SHELL'S STICKY BAR NOW (2026-08-31, from
         the owner's `Mobile.dc.html`). It was an in-flow row at the foot of a
         column whose answers sit above the fold, so on a phone the way forward
         was below the scroll on the one screen that has to be effortless. The
         BUTTON is unchanged — same handler, same disabled and busy states, same
         words; only where it lives moved. Tap-screens still advance on the tap,
         so the bar is empty on those and the shell draws nothing.

         ⚠️ AND IT MUST LIVE ON *THIS* SHELL. It was attached to the one inside
         `if (sent)` — the THANK-YOU screen — where `step.id` is never 'contact',
         so the bar was empty there AND absent here: the contact screen had no
         send button at all and a finished request could not be filed. Found by
         walking the intake signed in (2026-09-01); the wizard renders two
         shells and the prop went to the wrong one. */
      action={step.id === 'contact' ? (
        <Btn
          onClick={() => advance(draft)}
          disabled={status === 'sending'}
          aria-busy={status === 'sending'}
          size="lg"
          className="w-full"
        >
          {status === 'sending' ? 'იგზავნება…' : 'გაგზავნა'}
        </Btn>
      ) : undefined}
      // ⚠️ SHOWN FROM THE FIRST SCREEN, unlike the counter below it. The whole
      // point is that the SHAPE of the run is legible before the first tap —
      // three named parts, so „how long is this" has an answer that does not
      // depend on knowing the topic yet. The counter cannot do that (its
      // denominator is unsettled until a topic lands); the stage names never
      // move, whatever gets picked.
      progress={progressOf(step.id, draft)}
      stage={stageOfStep(step.id)}
      // Two when the person is already chosen, three otherwise — one source,
      // `stepsFor`, so a stage cannot be named that this run never reaches.
      stages={stagesFor(draft)}
      // ⚠️ BACK ONLY, AND THE SHELL ENFORCES THAT — it hands this to the
      // FINISHED rows and nothing else (2026-09-01). The target is the first
      // step of the stage, read from `stepsFor` rather than a second table, so
      // a stage whose screens change cannot start landing on the wrong one.
      // Nothing is cleared: the draft is untouched and walking forward again
      // steps over answers that are already there.
      onStage={id => {
        const first = stepsFor(draft).find(st => stageOfStep(st.id) === id)
        if (first) {
          setStepId(first.id)
          window.scrollTo({ top: 0 })
        }
      }}
      // The recipient's name, said once, for the whole run — see _shell.
      to={to ? { name: to.name, photoSrc: to.photoSrc } : null}
      // Not on the first screen: until a topic is picked the run's length is a
      // guess, and a denominator that changes on the first tap is the „form
      // growing under you" the bar exists to avoid. From step two it is settled
      // — see _shell. With the topic already answered by the provider there is
      // no such screen and the counter is honest from the start.
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
      {/* ⚠️ THE `mx-auto` IS GONE AND THE CAP STAYS (2026-08-18). The shell now
          uses `Container size="narrow"` — the same 560 — for its logo row,
          stage row, counter and footer, so this column is already in the right
          place and centring it again inside an equal container did nothing but
          make the two disagree whenever the shell's token changed. The cap
          survives because the shell's container is the page's, and a step that
          set its own width would jump on the tap that rendered it. */}
      <div className="max-w-[560px]">
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
      {step.id !== steps[0].id && (
        <div className="mb-3">
          <button
            type="button"
            onClick={back}
            className="inline-flex items-center gap-1.5 h-10 sm:h-9 -ml-1 px-2 rounded-btn text-small font-display font-semibold text-ink-600 hover:text-ink-900 hover:bg-ink-75 motion-safe:active:scale-[0.97] transition-[color,background-color,transform] duration-fast"
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
          place. The entrance now depends on the DIRECTION — see `goingBack`.
          Both tokens already existed; no new animation was minted. */}
      <div
        key={`q:${step.id}`}
        className={goingBack ? 'motion-safe:animate-fade-in' : 'motion-safe:animate-slide-in-r'}
      >
        <h1 className="font-display text-h1 font-bold text-ink-900 tracking-tight text-balance">
          {step.title}
        </h1>
        {/* The sub-copy belongs to the opening screen alone: it explains what
            the whole run is for, which nobody needs repeated at step four. */}
        {/* …and only while the search box is still on screen: once a topic is
            chosen the screen's live question is „რა სახის დახმარება", and
            „აღწერე" would be pointing at a field that is no longer there. */}
        {/* ⚠️ „ექსპერტები ფასს შემოგთავაზებენ" WAS WRONG ON HALF THE SITE
            (2026-08-18). One sentence served both doors, so somebody who came
            in to have a tap fixed was told experts would quote them — the word
            for the other product, in the first paragraph they read. The line
            now comes from the door's own copy. */}
        {step.id === 'what' && draft.topic === '' && (
          <p className="mt-2 text-body text-ink-600">
            {VERTICAL_COPY[draft.vertical].hint}
          </p>
        )}
        {/* ⚠️ THE BUDGET SCREEN HAS TO SAY WHAT THE NUMBER MEASURES (2026-09-03).
            Owner, pointing at the bare ladder: „ესე ვერ მიხვდება."

            The bands are PER UNIT and the unit is different for every kind —
            „20–40₾" is per LESSON on a learning request, per VISIT on a service,
            and the WHOLE JOB on a project (lib/requestTopics → BUDGET_BANDS,
            which says so in a comment at each). Somebody budgeting 2 000₾ to
            learn web development reads „120₾-ზე მეტი" as the top of the ladder
            and cannot tell whether that is absurd or exactly right.

            The provider has always been told: their job card prints
            `budgetLabel`, which ends „30–60₾ ერთ გამოძახებაზე". The person
            CHOOSING the band was the only one who was not. Same word, from the
            same table — `KIND[kind].unitLabel` — so the two sides cannot say it
            differently, and nothing new is written. */}
        {step.id === 'budget' && (
          <p className="mt-2 text-body text-ink-600">{KIND[kind].unitLabel}</p>
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
            // The door, straight off the draft — see _model → Draft.vertical.
            vertical={draft.vertical}
            initialQuery={initialQuery}
            // ⚠️ THE CATALOGUE, NARROWED TO THE PERSON THEY CHOSE. Reached only
            // when the provider does SEVERAL things (one unambiguous thing
            // drops this screen entirely — _model → withTarget), and then the
            // honest question is „which of THEIRS", not „which of the 132".
            // Empty = every topic, i.e. exactly the screen as it was.
            /* ⚠️ THE DIRECT TARGET WINS, AND IT IS ALREADY THE NARROWER ONE.
               `?to=` means „this provider" and their own list is the only
               honest offer; `covered` is the whole roster's. Both narrow the
               browse list AND the search hits (see _stepWhat → `only`), and
               empty means „no narrowing", never „nothing". */
            tiles={tiles}
            initialCategory={initialCategory}
            onlyTopics={to?.topics ?? covered}
            /* ⚠️ THE HALF `onlyTopics` CAN NO LONGER SAY (2026-09-02). The list
               above is narrowed in two very different senses — to ONE provider
               the client chose, or to the roster's covered topics — and only
               the first should greet somebody with the browse panel already
               open. `covered` is never empty, so passing that distinction
               through the array's length opened the panel for every visitor. */
            narrowed={Boolean(to?.topics?.length)}
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
            // ⚠️ THE ONLY WAY OUT OF THE KIND QUESTION. It replaces the browse
            // list rather than sitting under it (see _stepWhat → awaitingKind),
            // and step one draws no „უკან", so the chip carrying the chosen
            // topic has to undo the tap. `withTopic(draft, '')` and not a hand
            // written reset: that function already owns „a kind that no longer
            // fits clears the priced answers", and a second copy of the rule is
            // the copy that goes stale.
            onClearTopic={() => setDraft(withTopic(draft, ''))}
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
        {/* ══════ THE DETAILS SCREEN — EVERY QUESTION DRAWN THE SAME WAY ══════
            ⚠️ MEASURED ON THE LIVE WIZARD, 2026-09-01, „ბინის დალაგება" at
            390px, and every number below is why this block was rewritten:

              · the two clarifier headings were 13px/600 — SMALLER than the
                16px option labels underneath them. A heading quieter than its
                own answers is not a heading, it is a caption.
              · the THIRD question had no heading at all. `stepsFor` swaps
                `KIND[kind].timingLabel` for the page title „ორიოდე დეტალი" when
                clarifiers exist, so the one question that ended the screen was
                the only one with nothing naming it — it read as four more rows
                of „რამდენი ოთახია".
              · 10px between rows of one question, 24px between two DIFFERENT
                questions. Nine identical rows, one list.

            So the three complaints in the owner's sentence are one defect: the
            page never said it was asking three things. It says so now — one
            heading treatment, a tick that fills as each is answered, and real
            air between them.

            ⚠️ THE TIMING QUESTION IS IN THIS LIST, NOT UNDER IT. It is asked of
            everybody and the others are not, which is why it used to be the
            exit — but „asked of everybody" is a fact about the vocabulary, not
            something the person answering can see. On this screen it is simply
            the last question, and it gets its own name back. */}
        {/* ⚠️ THE STACKED-QUESTIONS SCREEN STOOD HERE AND IS GONE (2026-09-03).
            It drew every clarifier AND the timing ladder down one page, with a
            „გავაგრძელოთ" button because no single tap could be allowed to end a
            screen holding three questions. The clarifiers have their own
            screens again — owner: „ორად რომ არის ჩამოშლილი… დაყო ცალკე
            გვერდებად" — so `extras` on this step is always empty, this branch
            was unreachable, and the `extras.length === 0` guard below it was
            the only thing still drawing anything. Both are simplified into the
            one unconditional render.

            ⚠️ IT ALSO TOOK A LIVE BUG WITH IT. Between the split and this
            commit the guard read `extras.length === 0`, and `extras` was still
            computed for the timing step — so on every topic WITH a clarifier
            the timing screen rendered no options at all. Same class of mistake
            as the two screens below: a step added to the run without a block
            that draws it. */}
        {step.id === 'timing' && (
          <StepPick options={options} value={draft.timing} onPick={pickOption} numbered />
        )}

        {/* ⚠️ THE BUDGET SCREEN, AND THE REASON THIS BLOCK EXISTS AT ALL. It was
            added to `stepsFor` and to `options` and to `pickOption` on
            2026-09-03 and NOT here — so it shipped as a heading with nothing
            under it and no way forward: the request funnel's own dead end,
            found on production by the owner („რა არის ესა?"). Every screen in
            this file needs three things and the run only checks two of them. */}
        {/* ── THE BRIEF, ON ITS OWN SCREEN AND REQUIRED (2026-09-04) ──────
            Owner: „ცალკე უნდა იყოს ველი, დამატე, გაზარდე." Ten rows rather than
            the four the collapsed field on the contact step had — a box is an
            instruction about how much to write, and a four-row box asks for
            four rows.
            ⚠️ TYPING DOES NOT ADVANCE, and there is no „skip": „გავაგრძელოთ"
            enables at twelve characters (_model → stepComplete) and the line
            beside it says why it is still grey, so the wall is never silent. */}
        {step.id === 'details' && (
          <div className="mt-5">
            <textarea
              id="req-details"
              autoFocus
              rows={10}
              maxLength={4000}
              value={draft.description}
              onChange={e => patch({ description: e.target.value })}
              placeholder="დაწერე რაც შეიძლება დაწვრილებით — რა გჭირდება, სად და როდის."
              className="w-full resize-y rounded-field border border-ink-200 bg-white px-4 py-3.5 text-body text-ink-900 outline-none transition-colors duration-fast placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Btn
                variant="primary"
                size="md"
                disabled={draft.description.trim().length < 12}
                onClick={() => advance(draft, 'details')}
              >
                გავაგრძელოთ
              </Btn>
              {draft.description.trim().length < 12 && (
                <span className="text-meta text-ink-500">დაწერე ორი-სამი სიტყვა მაინც</span>
              )}
            </div>
          </div>
        )}
        {step.id === 'budget' && (
          <>
            <StepPick options={options} value={draft.budgetBand} onPick={pickOption} numbered />
            {/* ── …OR TYPE THE AMOUNT ────────────────────────────────────────
                Owner, 2026-09-03: „ჩასაწერი ველი მინდა."

                ⚠️ IT RESOLVES TO A BAND, IT DOES NOT REPLACE ONE. The typed
                number picks the band it falls into and stores THAT — so
                everything downstream is unchanged: `serviceRequestRow` still
                derives budgetMin/Max from a band id, the provider's card still
                reads „30–60₾ ერთ გამოძახებაზე", and the contact fee is still
                priced off the same two columns (lib/credits →
                contactCostTetri). No schema change, no second meaning for one
                column.

                ⚠️ AND IT ANSWERS THE OBJECTION THE BANDS WERE CHOSEN FOR. The
                bands exist because „750₾" is a figure somebody has to invent
                (the 2026-08-19 removal argued exactly that). This does not
                force anybody to invent one — the ladder is still there and
                still one tap. What it adds is the person who ALREADY KNOWS
                their number and was being made to translate it into somebody
                else's range.

                ⚠️ TYPING DOES NOT ADVANCE. A screen that moved on mid-number
                would leave on „7" of „750". The row below shows which band the
                figure landed in — so the translation is visible rather than
                silent — and „გავაგრძელოთ" is the exit. */}
            <div className="mt-5 border-t border-ink-100 pt-5">
              <label htmlFor="req-budget-amount" className="block text-small font-display font-semibold text-ink-800">
                ან ჩაწერე თანხა
              </label>
              <div className="mt-2 flex flex-wrap items-center gap-2.5">
                <span className="inline-flex h-12 w-[150px] items-center gap-1.5 rounded-field border border-ink-200 bg-white px-4 transition-[border-color,box-shadow] duration-fast focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
                  <input
                    id="req-budget-amount"
                    type="number" min={1} max={1000000} step={1} inputMode="numeric"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="min-w-0 flex-1 border-0 bg-transparent p-0 text-right font-display text-h3 font-bold tabular-nums text-ink-900 placeholder-ink-400 outline-none"
                    placeholder="0"
                  />
                  <span className="shrink-0 text-small text-ink-500">₾</span>
                </span>
                <Btn
                  size="lg"
                  disabled={!amountBand}
                  onClick={() => { if (amountBand) pickAndGo({ budgetBand: amountBand.id }) }}
                >
                  გავაგრძელოთ
                </Btn>
              </div>
              {amountBand && (
                <p className="mt-2 text-meta text-ink-500">
                  {amountBand.label} · {KIND[kind].unitLabel}
                </p>
              )}
            </div>
          </>
        )}

        {/* One clarifier, one screen — the same three parts. `step.extraId`
            names the question; `options` above resolves its rows. */}
        {step.extraId && (
          <StepPick
            options={options}
            value={draft.details[step.extraId] ?? ''}
            onPick={pickOption}
            numbered
          />
        )}
        {/* ⚠️ THE BUDGET SCREEN IS GONE (2026-08-19). Owner: „არ გვინდა
            ბიუჯეტი საერთოდ, 5 ეტაპამდე უნდა შემცირდეს."

            It asked the one person on the screen who cannot know what the work
            costs to name a figure BEFORE anybody had looked at the job — and
            that figure then set the ceiling on every offer that came back.
            Guess low and the providers who could help skip it; guess high and
            you have bid against yourself. The same objection that took the
            price off the catalogue card („არ იცის კლიენტმა რამდენი ღირს
            სერვისი"), one screen earlier.

            Do NOT bring it back as an optional question either: an optional
            money field on a funnel's most abandoned screen is the same anchor
            with a skip button. What replaced it is the model — the provider
            quotes („ფასს შემოგთავაზებს"), and the conversation settles it.

            The band still exists in the schema as UNSTATED (min 0, max null =
            „not asked"), so the row and every reader of it keep working. The
            floor warning that lived here went with the question: nothing left
            to warn about. */}
        {step.id === 'format' && (
          <StepPick
            options={FORMATS.map(f => f.id === 'IN_PERSON' && !ONE_CITY
              ? { id: f.id, label: f.label, hint: 'ქალაქს შემდეგ იკითხავს' }
              : f)}
            value={draft.format}
            onPick={pickOption}
            // Numbered only while it IS the live question — once „ადგილზე" is
            // chosen the numbers belong to the city list below. With one city
            // there is no list below, so it stays the live question throughout.
            numbered={ONE_CITY || draft.format !== 'IN_PERSON'}
          />
        )}
        {/* The service run asks the city on its own screen — one list, one
            question, no format rows above it. */}
        {step.id === 'city' && (
          <StepPick options={options} value={draft.city} onPick={pickOption} numbered />
        )}
        {/* ⚠️ THE „როგორ გირჩევნია?" SCREEN STOOD HERE (removed 2026-08-29) —
            see app/request/_model.ts for why, and for what happened to the list
            it used to gate. */}
        {step.id === 'format' && draft.format === 'IN_PERSON' && !ONE_CITY && (
          <div className="mt-5">
            <p className="text-small font-display font-semibold text-ink-800 mb-2.5">რომელ ქალაქში?</p>
            <StepPick options={options} value={draft.city} onPick={pickOption} numbered />
          </div>
        )}
        {/* ⚠️ OPTIONAL, AND THE WAY PAST IT IS ON THE SCREEN. „გამოტოვება" is a
            real control rather than a small link, because the person who has
            nothing to photograph is the one in a hurry — see _model → stepsFor. */}
        {step.id === 'photos' && (
          <div className="mt-5">
            <WorkPhotos
              value={draft.photos}
              onChange={next => patch({ photos: next })}
              max={MAX_REQUEST_PHOTOS}
            />
            <div className="mt-5 flex items-center gap-3">
              {/* ⚠️ „გამოტოვება" IS GONE AND A PHOTO IS REQUIRED (2026-09-04).
                  Owner: „ასევე ფოტოს ატვირთვა [სავალდებულო]."

                  This screen shipped on 2026-08-29 with the opposite rule
                  written into `stepsFor`: „`photos: []` is a complete request —
                  the person with water on the floor is exactly the one who has
                  nothing to upload and exactly the one whose request must still
                  arrive." That reasoning is answered rather than forgotten:
                  the screen only EXISTS for SERVICE (39 of the 171 topic×kind
                  combinations — a tap, a leak, a move), where there is always
                  something to point a phone at. The 77 MEETING, 77 PROJECT and
                  55 LEARNING runs never reach this step at all, so a lawyer and
                  a tutor are not being asked to photograph anything.
                  Inside SERVICE the picture is what lets a first offer be a
                  price rather than a question, which is the whole argument the
                  step was added on. */}
              <Btn
                variant="primary"
                size="md"
                disabled={draft.photos.length === 0}
                onClick={() => advance(draft, 'photos')}
              >
                გავაგრძელოთ
              </Btn>
              {draft.photos.length === 0 && (
                <span className="text-meta text-ink-500">ერთი ფოტო მაინც დაურთე</span>
              )}
              {draft.photos.length > 0 && (
                <span className="text-small text-ink-500 tabular-nums">
                  {draft.photos.length} / {MAX_REQUEST_PHOTOS}
                </span>
              )}
            </div>
          </div>
        )}
        {step.id === 'contact' && <StepContact draft={draft} patch={patch} signedIn={account !== null} fault={contact} />}
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
      </div>
    </RequestShell>
  )
}

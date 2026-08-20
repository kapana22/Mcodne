// The wizard's state and its rules — the leaf.
//
// ⚠️ IMPORTS NO SIBLING, by the rule in CLAUDE.md's „Where things live": the
// model is a leaf and everything else imports it. A cycle here always means a
// piece of this file was left in a UI file.
//
// ONE QUESTION PER SCREEN — the reference model, adopted whole (owner,
// 2026-08-17: ours was „უფრო რთულად გაკეთებული" than the sites it imitates).
// Profi's intake is a run of single-question screens where the TAP IS THE
// ANSWER AND THE ADVANCE, skippable wherever honest, free text optional at the
// end. The previous revision stacked six questions onto one „დეტალები" screen
// and demanded a 40-character essay — more fields per screen than any
// reference, on the exact field where forms die.
//
// NO REGISTRATION, ANYWHERE (owner, same day: „რეგისტრაციაც მარტივად უნდა
// მოხდეს, სულ ბოლოს"). Taken to its limit: the contact screen at the END is
// the whole identity — name and phone, no password, no account. The publicRef
// link the thanks screen hands over IS the client's key to their own request.
// Asking somebody to sign up before they may ask for help is the reference
// products' own anti-pattern, and we simply do not have the step.
//
// THE STEP LIST IS DERIVED, NOT DECLARED. Which screens exist depends on the
// draft: the kind screen folds away for unambiguous topics, and the clarifier
// screens come from the vocabulary (extrasFor). So `stepsFor(draft)` computes
// the run and navigation is BY ID, never by index — an index into a list that
// changes length under you is how a wizard loses its place.

import {
  ServiceRequestInput, bandOf, TIMING, isTopicOfKind, kindsOfTopic, extrasFor,
  KIND, kindOf, REQUEST_KINDS, PICK_MODE_OPTION, UNSTATED,
  // The label vocabulary, for the transcript — see answerLabel. Imported rather
  // than re-derived so a renamed band or city renames in the conversation too.
  topicLabel, budgetLabel, timingLabel, formatLabel, cityLabel,
  VERTICAL_COPY, verticalOfTopic,
  type RequestKindName, type Vertical,
} from '@/lib/requests'

/** Everything the steps collect. One flat object rather than a slice per
 *  step: the last step needs to submit all of it, and a nested shape would only
 *  be flattened again at that moment. */
export type Draft = {
  /** ⚠️ WHICH DOOR THEY CAME THROUGH — and it is NOT submitted (2026-08-18).
   *
   *  Owner, approving option „ა": the entry point picks the vertical and the
   *  wizard never asks again. It lives on the draft because two screens need it
   *  — the what-step's catalogue and this file's step titles — and threading it
   *  as a second parameter through `stepsFor` would have put the same value in
   *  two places for the same run.
   *
   *  It is deliberately absent from `ServiceRequestInput`. The intake is ONE
   *  system (owner: „როცა გამოგზავნას ეხება, აუცილებლად ერთ სისტემაში
   *  იგზავნება") — one row, one queue, one routing pass. The vertical is
   *  already recoverable from the topic, so storing it would be a second copy
   *  of a fact, and the copy that drifts is the one nobody reads. */
  vertical: Vertical
  /** ⚠️ THE TOPIC CAME FROM THE PERSON THEY CHOSE (2026-08-19), not from the
   *  catalogue — so the „რა გჭირდება" screen has nothing left to ask and the
   *  run starts on „დეტალები".
   *
   *  Set only when `?to=` named a provider whose own offering implies EXACTLY
   *  ONE topic AND that topic carries exactly one kind (see `withTarget`). Two
   *  topics, or one ambiguous topic, leave this false: the screen stays, it is
   *  simply narrowed to that provider's own list.
   *
   *  It is a fact about the RUN, not about the request — deliberately absent
   *  from `ServiceRequestInput`, like `vertical`, and cleared on every restored
   *  draft so a saved run can never shorten a wizard that carries no `?to=`. */
  topicPinned: boolean
  /** ⚠️ A MESSAGE TO ONE PERSON, NOT AN OPEN REQUEST (2026-08-19). `?to=` named
   *  somebody, so the structured questions stop earning their screens: budget,
   *  timing, city and format exist so a provider can quote BLIND, and this one
   *  can just ask in the thread. Owner: „მინდა რომ მარტივად, სწრაფად და
   *  კომფორტულად იყოს." Measured before the change: six screens after the
   *  visitor had already chosen the person. */
  directTo: boolean
  kind: RequestKindName | ''
  topic: string
  description: string
  budgetBand: string
  /** 'OFFERS' | 'SELF' — see lib/requests → PICK_MODES. */
  pickMode: 'OFFERS' | 'SELF'
  timing: string
  /** The clarifying answers ({ audience: 'pupil' }). Optional per key and as a
   *  whole — see the schema comment in lib/requests. */
  details: Record<string, string>
  format: 'ONLINE' | 'IN_PERSON' | 'EITHER'
  city: 'TBILISI' | 'BATUMI' | 'KUTAISI' | 'RUSTAVI' | 'OTHER'
  contactName: string
  phone: string
  email: string
  /** The honeypot. Never rendered visibly, never touched by a person. */
  website: string
}

/* ── what the account already knows ────────────────────────────────────────
 *
 * Owner, 2026-08-17: „როცა რეგისტრირებული ვარ რატომ უნდა მიწევდეს — default
 * შევსებული ხომ უნდა იყოს." Correct, and it is the oldest rule in form design:
 * never ask for something you already hold. The whole point of the last screen
 * is a name and a number to ring — and for a signed-in person the platform has
 * both, has had them since signup, and was making them type them again in the
 * one place where retyping is most likely to end the run.
 *
 * ⚠️ PREFILLED, NOT HIDDEN. The fields still SHOW, and stay editable. Two
 * reasons and both are load-bearing: the number on an account can be years old,
 * and this screen promises „ამ ნომერზე დაგირეკავთ" — a promise about a number
 * nobody was shown is a promise about the wrong number. Hiding known details
 * behind „we have them" is the checkout pattern that produces deliveries to
 * addresses people moved out of. */
export type AccountContact = {
  fullName: string | null
  phone: string | null
  email: string | null
}

/**
 * Fill the contact fields the account can answer — and ONLY the empty ones.
 *
 * ⚠️ NEVER OVERWRITES. It runs twice: on the seed draft, and again over a draft
 * revived from sessionStorage. That second call is the reason for the rule — a
 * resumed run may already carry a phone the person typed BECAUSE the account's
 * one was wrong, and re-applying the account over it would silently undo their
 * correction on a refresh.
 */
export function withAccountContact(d: Draft, a: AccountContact | null): Draft {
  if (!a) return d
  const fill = (typed: string, known: string | null) =>
    typed.trim() !== '' ? typed : (known ?? '').trim()
  return {
    ...d,
    contactName: fill(d.contactName, a.fullName),
    phone: fill(d.phone, a.phone),
    email: fill(d.email, a.email),
  }
}

export const EMPTY_DRAFT: Draft = {
  // The default door. „EXPERT" and not „SERVICE" because a bare /request with
  // no parameter is reached from the expert half of the site and from the home
  // band's own field; the trades door always sets ?for=service explicitly.
  vertical: 'EXPERT',
  topicPinned: false,
  directTo: false,
  kind: '',
  topic: '',
  description: '',
  // ⚠️ THE BUDGET QUESTION IS GONE (2026-08-19) — owner: „არ გვინდა ბიუჯეტი
  // საერთოდ, 5 ეტაპამდე უნდა შემცირდეს." It asked the person who knows least
  // what the work costs to name a number first, and that number then anchored
  // every offer they received: guess low and the good providers skip you, guess
  // high and you have bid against yourself. It is the same objection that took
  // the price off the card („არ იცის კლიენტმა რამდენი ღირს სერვისი") — the
  // provider quotes, the client does not.
  //
  // What went with it: `budgetIsBelowFloor` no longer fires, so requests under
  // 30₾ are not refused on arrival any more. That guard was protecting
  // providers from unservable leads and the owner chose the shorter form over
  // it, knowingly. If junk arrives, the answer is a rule about the DESCRIPTION,
  // not the money question coming back.
  budgetBand: UNSTATED,
  pickMode: 'OFFERS',
  timing: '',
  details: {},
  // Pre-set, and only these two. „ონლაინ" is the honest default for most of
  // this catalogue and „თბილისი" for most of this country — the format screen
  // still SHOWS, pre-highlighted, and one tap confirms or changes it. The
  // fields that must NOT default are budget and timing: each is a real answer,
  // and a pre-selected real answer is an answer nobody gave.
  format: 'ONLINE',
  city: 'TBILISI',
  contactName: '',
  phone: '',
  email: '',
  website: '',
}

/* ═══════════ the run of screens ════════════════════════════════════════ */

/* ═══════════ THE THREE STAGES ═══════════════════════════════════════════ */

/**
 * ⚠️ THREE STAGES OVER THE SAME SCREENS — NOT THREE SCREENS (2026-08-18).
 *
 * Owner, holding a screenshot of the budget question: „სამ ეტაპიანი გავაკეთოთ —
 * პრობლემის კატეგორია, ვის უნდა მიუდეს … აღწერა … და ბოლოს ფორმა."
 *
 * The obvious reading — merge everything into three long screens — would undo
 * the one-question-per-screen work this file's header records, which was
 * adopted from the reference products after the owner called the previous
 * revision „უფრო რთულად გაკეთებული". Six questions on one page is the exact
 * shape that was removed.
 *
 * What the screenshot actually shows missing is not fewer screens; it is ANY
 * SENSE OF WHERE YOU ARE. „ბიუჯეტი — ერთ გაკვეთილზე" arrives with a thin
 * percentage bar and no name for the part of the journey it belongs to, so a
 * run of seven taps feels unbounded — and an unbounded form is one you can quit
 * without losing anything, which is how they get quit.
 *
 * So the screens stay one question each, and they are GROUPED. Three names,
 * shown from the first screen, so the whole shape is legible before the first
 * tap: what you need · the details · how to reach you.
 *
 * ⚠️ DERIVED FROM `stepsFor`, NEVER A SECOND LIST. Which screens exist depends
 * on the draft (the kind screen folds away, the clarifiers come from the
 * vocabulary), so a hand-kept mapping would go stale the first time a step is
 * added — and its symptom would be a stage that never lights up, which nobody
 * would notice. `stageOfStep` is the one rule and everything reads it.
 */
export const STAGES = [
  { id: 'what', label: 'რა გჭირდება' },
  { id: 'detail', label: 'დეტალები' },
  { id: 'contact', label: 'კონტაქტი' },
] as const

export type StageId = (typeof STAGES)[number]['id']

/**
 * The stages THIS run actually has.
 *
 * ⚠️ THE FIRST ONE GOES WHEN THE PERSON IS ALREADY CHOSEN (2026-08-19). Somebody
 * who arrived from a plumber's profile answered „რა გჭირდება" by tapping the
 * plumber; a stage row still naming that question would be the wizard claiming
 * a step it is not going to run, and the counter under it would never reach it.
 * Same source as the screens themselves — `stepsFor` decides, this filters, and
 * neither is a hand-kept second list.
 */
export function stagesFor(d: Draft): typeof STAGES[number][] {
  const ids = new Set(stepsFor(d).map(s => stageOfStep(s.id)))
  return STAGES.filter(s => ids.has(s.id))
}

/**
 * Which stage a screen belongs to.
 *
 * The default is `detail` on purpose: every clarifier the vocabulary can invent
 * (`extra:*`) and every question added later is a detail until somebody says
 * otherwise, so a new screen lands somewhere sensible rather than nowhere.
 */
export function stageOfStep(stepId: string): StageId {
  // The topic, and the „what kind of help" question that only exists because
  // the topic was ambiguous — one decision in two taps, so one stage.
  if (stepId === 'what' || stepId === 'kind') return 'what'
  if (stepId === 'contact') return 'contact'
  return 'detail'
}

/** How far along the run is, as three states per stage. `done` is what makes
 *  the row worth showing at all — „two of three finished" is the answer to the
 *  question a progress bar is asked. */
export function stageState(stageId: StageId, currentStepId: string): 'done' | 'live' | 'todo' {
  const order = STAGES.map(s => s.id)
  const here = order.indexOf(stageOfStep(currentStepId))
  const mine = order.indexOf(stageId)
  return mine < here ? 'done' : mine === here ? 'live' : 'todo'
}

export type StepDef = {
  /** Stable within a draft; clarifier screens are `extra:<questionId>`. */
  id: string
  title: string
  /** Skippable screens carry the skip affordance; nothing else does. */
  skippable?: boolean
  /** For `extra:*` screens — which clarifier this screen asks. */
  extraId?: string
}

/**
 * The screens THIS draft runs through, in order.
 *
 * Before the kind is known the tail is the generic three (budget/timing/
 * format) so the progress bar has a sane denominator; once the kind lands the
 * clarifier screens splice in and the titles take the kind's own words
 * („რამდენად ხშირად" over frequencies, „რა ვადაში" over deadlines).
 */
export function stepsFor(d: Draft): StepDef[] {
  // ⚠️ THE FIRST QUESTION IS THE DOOR'S, and it follows the ANSWER once the two
  // disagree. Search crosses the vertical line on purpose (lib/requestTopics →
  // VERTICALS: a separation that loses a request is worse than the confusion it
  // fixed), so somebody who came in through the trades door and typed
  // „ინგლისური" is now choosing a tutor — and a screen still headed „რა
  // გაფუჭდა?" at that moment is telling them they are somewhere they are not.
  const asked: Vertical = verticalOfTopic(d.topic) ?? d.vertical
  // ⚠️ THE FIRST SCREEN IS NOT ASKED WHEN THE PERSON IS ALREADY CHOSEN
  // (2026-08-19). `?to=` named a provider who does exactly one thing, so the
  // topic is already known — see Draft.topicPinned. Dropping the SCREEN rather
  // than pre-filling it is the point: a search box holding an answer somebody
  // did not type invites them to change it, and the thing they would be
  // changing is the person they just chose.
  // ⚠️ ONE SCREEN WHEN THE PERSON IS ALREADY CHOSEN (2026-08-19). Everything
  // between the door and the contact form exists so a stranger can quote
  // without asking — a named provider asks in the thread instead. What is left
  // is the only thing they cannot get any other way: what you need, and how to
  // reach you. The contact screen carries both (see _stepContact: with
  // `directTo` the description opens and is the first thing on it).
  if (d.directTo) return [{ id: 'contact', title: 'რა გჭირდება?' }]
  const pinned = d.topicPinned && d.topic !== ''
  const out: StepDef[] = pinned ? [] : [{ id: 'what', title: VERTICAL_COPY[asked].title }]
  // ⚠️ „აირჩიე ტიპი" IS NO LONGER A SCREEN (2026-08-18). It asked one question
  // with two or three answers, on a page of its own, immediately after the
  // question it depends on — so a person who tapped „ხელშეკრულება" was made to
  // press Next to be asked what they meant by it.
  //
  // It is now the SECOND HALF OF SCREEN ONE: pick a topic and, when the topic is
  // genuinely ambiguous, the kinds appear under it in place. Same tap count,
  // one fewer screen, and the two halves of one decision are finally on one
  // page. See _stepWhat.
  //
  // The step id survives ONLY while nothing is chosen yet, so `stepsFor` still
  // has a sane denominator for the counter before the first tap — it is never
  // reachable once a topic exists.
  if (d.topic === '') {
    out.push({ id: 'kind', title: 'აირჩიე ტიპი' })
  }
  const kind = d.kind !== '' ? d.kind : null
  if (kind) {
    // ⚠️ ALL THE CLARIFIERS ON ONE SCREEN (2026-08-18), not one screen each.
    //
    // They used to get a page apiece, so a chemistry request answered „ვისთვის"
    // and „რა დონეა" on two consecutive screens that between them held nine
    // words. Two one-tap questions about the same thing are one question in two
    // parts, and splitting them cost a whole step in a run that was already too
    // long.
    //
    // Still optional, still one tap each — what changed is the paper they are
    // printed on. The title comes from the kind rather than the question,
    // because a screen holding two questions cannot be named after one of them.
    // ⚠️ THE CLARIFIERS SHARE THE TIMING SCREEN (2026-08-19) — they no longer
    // get one of their own. Owner: „5 ეტაპამდე უნდა შემცირდეს." Removing the
    // budget question took the trades run to five and left 94 of 171 topics at
    // six, all of them for this screen: one or two optional taps on a page by
    // themselves, immediately before another one-tap question.
    //
    // Same move the „აირჩიე ტიპი" screen made a day earlier — the questions are
    // not merged, the PAPER is. Every clarifier stays optional and answers in
    // place; the timing tap is the one that advances, because it is the last
    // question on the page and the only one that is asked of everybody.
    const hasExtras = extrasFor(kind, d.topic).length > 0
    out.push({
      id: 'timing',
      // The heading has to name the whole page. With clarifiers on it the page
      // is „a couple of details", of which when-you-need-it is one.
      title: hasExtras ? 'ორიოდე დეტალი' : KIND[kind].timingLabel,
    })
  } else {
    out.push({ id: 'timing', title: 'როდის' })
  }
  // ⚠️ A SERVICE IS NEVER ASKED „ONLINE OR IN PERSON" — there is no online
  // plumber, so the question has exactly one answer and asking it is the wizard
  // performing a choice nobody has. What a visit DOES need is the city, which
  // until now only existed as a sub-question hidden behind „ადგილზე". For this
  // kind it is the question.
  //
  // (The finer-grained district this really wants is the address work, and it
  // is deliberately not here yet — see the services model. City is the honest
  // amount of place we can route on today.)
  if (kind === 'SERVICE') out.push({ id: 'city', title: 'რომელ ქალაქში?' })
  else out.push({ id: 'format', title: 'ონლაინ თუ ადგილზე?' })
  // Free text LAST among the questions and OPTIONAL — the reference decision.
  // The structured taps above already carry a quotable request, and the
  // admin's verification call fills any gap a sentence would have.
  // ⚠️ THE „დეტალები" SCREEN IS GONE (2026-08-18), and the measurement is why.
  // Of 19 real requests, 8 carried a description — 58% walked through a whole
  // screen to skip it. A step that most people advance past without typing is
  // not an optional question, it is a tax on everybody for the benefit of two
  // in five.
  //
  // The capability is not lost, it moved to where it costs no screen: the
  // contact step carries it as a collapsed optional field, and the free-text
  // entry on step one already writes a typed sentence straight into
  // `description` (see RequestWizard → onFreeText). What used to be a screen is
  // now a line somebody opens if they have more to say.
  // ⚠️ A SCREEN, AND IT EARNS ONE. Every other cut this week removed a step
  // that most people advanced past without answering; this one is a single tap
  // that changes what the next screen offers them. The owner chose to ask it
  // before sending rather than after (2026-08-18) — at that point they are
  // still deciding how they want to be helped, and afterwards they are waiting.
  out.push({ id: 'mode', title: 'როგორ გირჩევნია?' })
  out.push({ id: 'contact', title: 'როგორ დაგიკავშირდეთ?' })
  return out
}

/**
 * What the person ANSWERED on a screen, in the words they would recognise.
 *
 * ⚠️ THE TRANSCRIPT IS THE PRODUCT NOW (2026-08-17). The wizard reads as a
 * conversation — every answered screen stays on the page as a pair of bubbles,
 * ours asking and theirs answering — and this is the second half of every pair.
 * Owner: „ეს ფორმასავით შემოდის და პირდაპირ ლაივ ჩათი რომ ეხსნებოდეს."
 *
 * ⚠️ IT RETURNS THE LABEL, NEVER THE ID. `budgetBand` is „c2" in the draft and
 * „100–250₾ ერთ კონსულტაციაზე" to a reader, and the difference is the whole
 * point of showing the answer back: a transcript of ids is a debug view. Every
 * label comes from the ONE function that already owns that vocabulary in
 * lib/requestTopics, so a renamed band renames here too.
 *
 * Null means „nothing to show" — a screen not yet answered, or one that was
 * skipped. A skipped screen deliberately leaves NO bubble rather than an empty
 * one: „—" in a conversation is a person who said nothing, which is exactly
 * what happened and is not worth a line.
 */
export function answerLabel(id: string, d: Draft): string | null {
  if (id === 'what') return d.topic ? topicLabel(d.topic) : null
  if (id === 'kind') return d.kind ? KIND[kindOf(d.kind)].label : null
  // One screen, so one chip — every answer given on it, joined. „—" for the
  // unanswered halves would be a person who said nothing, which is not worth
  // printing (see the note above).
  // ONE SCREEN, ONE BUBBLE. The clarifiers and the timing are answered on the
  // same page (see stepsFor), so the transcript shows them as one answer —
  // „კვირაში ორჯერ · აბიტურიენტი" — rather than inventing a second exchange
  // for a question that was never asked on its own.
  if (id === 'timing') {
    if (!d.kind) return null
    const said = extrasFor(kindOf(d.kind), d.topic)
      .map(q => q.options.find(o => o.id === d.details[q.id])?.label)
      .filter((v): v is string => !!v)
    const when = d.timing ? timingLabel(kindOf(d.kind), d.timing) : null
    return [when, ...said].filter(Boolean).join(' · ') || null
  }
  // The service run's own place question. It reads back as just the city —
  // „ადგილზე · თბილისი" would restate a format nobody was offered a choice of.
  if (id === 'city') return d.city ? cityLabel(d.city) : null
  if (id === 'mode') return PICK_MODE_OPTION[d.pickMode].label
  if (id === 'format') {
    if (!d.format) return null
    // The city rides on the format answer rather than getting a bubble of its
    // own: it is a sub-question of „ადგილზე" and only ever asked there, so two
    // bubbles would show a question the transcript never printed.
    const f = formatLabel(d.format)
    return d.format === 'IN_PERSON' && d.city ? `${f} · ${cityLabel(d.city)}` : f
  }
  if (id === 'details') return d.description.trim() || null
  // The contact screen is the one that is never behind the reader — it is where
  // the send button lives, so it has no answered state to restate.
  return null
}

/**
 * May the wizard stand PAST this screen?
 *
 * ⚠️ ONE FUNCTION, THREE CONSUMERS: the advance guard, the resume point and
 * the contact screen's submit gate. Skippable screens are always complete —
 * skipping IS their answer.
 */
export function stepComplete(id: string, d: Draft): boolean {
  if (id === 'what') return d.topic !== '' && kindsOfTopic(d.topic).length > 0
  if (id === 'kind') return d.kind !== '' && d.topic !== '' && isTopicOfKind(d.kind, d.topic)
  if (id === 'timing') return d.kind !== '' && TIMING[kindOf(d.kind)].some(t => t.id === d.timing)
  // format and city both carry an honest default (ONLINE / თბილისი) that the
  // screen shows pre-selected; details and the clarifiers are optional.
  if (id === 'format' || id === 'city' || id === 'extras') return true
  // Always answered — it ships with a default, and the screen shows that
  // default pre-selected so one tap confirms or changes it.
  if (id === 'mode') return true
  if (id === 'contact') return ServiceRequestInput.safeParse(d).success
  return false
}

/** The id after `id` in this draft's run, or null at the end. */
export function nextStepId(id: string, d: Draft): string | null {
  const steps = stepsFor(d)
  const ix = steps.findIndex(s => s.id === id)
  return ix >= 0 && ix < steps.length - 1 ? steps[ix + 1].id : null
}

/** The id before `id`, floored at the first screen. */
export function prevStepId(id: string, d: Draft): string {
  const steps = stepsFor(d)
  const ix = steps.findIndex(s => s.id === id)
  return ix > 0 ? steps[ix - 1].id : steps[0].id
}

/**
 * Where a restored draft resumes: the frontier — the first REQUIRED screen
 * that is incomplete, or the first unanswered optional BEFORE any later
 * required answer exists. A person who deliberately skipped an optional and
 * went on is never dragged back to it.
 */
export function resumeStepId(d: Draft): string {
  const steps = stepsFor(d)
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    if (!stepComplete(s.id, d)) return s.id
    if (s.skippable) {
      const answered = s.id === 'extras'
        ? Object.keys(d.details).length > 0
        : d.description !== ''
      if (answered) continue
      const later = steps.slice(i + 1)
      const anyLaterAnswered = later.some(l =>
        (l.id === 'timing' && d.timing !== '') ||
        (l.id === 'contact' && (d.contactName !== '' || d.phone !== '')))
      if (!anyLaterAnswered) return s.id
    }
  }
  return steps[steps.length - 1].id
}

/** 0..1 — the shell's thin progress bar. The reference products show a bar,
 *  not „3 / 4": with a run whose length depends on answers, a shrinking
 *  denominator reads as the form growing under you. */
export function progressOf(id: string, d: Draft): number {
  const steps = stepsFor(d)
  const ix = Math.max(0, steps.findIndex(s => s.id === id))
  return (ix + 1) / steps.length
}

/**
 * Changing the kind INVALIDATES the answers that were keyed to it — a budget
 * band and a timing id belong to one kind's ladder. The TOPIC survives: the
 * kind is chosen ABOUT the topic.
 */
export function withKind(d: Draft, kind: RequestKindName): Draft {
  if (d.kind === kind) return d
  return {
    ...d, kind, budgetBand: UNSTATED, timing: '', details: {},
    // ⚠️ THE FORMAT IS DECIDED BY THE KIND FOR A SERVICE, not asked. Somebody
    // has to be in the room, so the row must say IN_PERSON whatever the draft
    // was carrying — and the run never shows the format screen for this kind
    // (see stepsFor), so nothing else would ever set it. Leaving the ONLINE
    // default in place would file every plumbing request as an online job.
    // Moving OFF the kind restores the default rather than leaving a stale
    // IN_PERSON behind, for the same reason the budget band is cleared here.
    format: kind === 'SERVICE' ? 'IN_PERSON' : EMPTY_DRAFT.format,
  }
}

/**
 * Picking a topic decides as much of the kind as it honestly can. One kind
 * possible → set it and the run never shows the disambiguation screen; several
 * → keep a still-compatible previous choice, clear an incompatible one.
 */
export function withTopic(d: Draft, topicId: string): Draft {
  const kinds = kindsOfTopic(topicId)
  const next = { ...d, topic: topicId }
  if (kinds.length === 1) return withKind(next, kinds[0])
  if (next.kind !== '' && !kinds.includes(next.kind)) {
    return { ...next, kind: '', budgetBand: UNSTATED, timing: '', details: {} }
  }
  return next
}

/**
 * Seed a draft from the provider `?to=` named — see lib/requestTarget.
 *
 * ⚠️ IT NEVER GUESSES. Three outcomes and only the first one shortens anything:
 *   • ONE topic that carries ONE kind → the topic is set and the „რა გჭირდება"
 *     screen is dropped (`topicPinned`). „მჭირდება სანტექნიკოსი" is not
 *     ambiguous between a conversation and a job, so nothing is being decided
 *     on somebody's behalf.
 *   • ONE topic carrying SEVERAL kinds → the topic is set, the screen STAYS and
 *     asks the one question that is still open („რა სახის დახმარება?").
 *   • SEVERAL topics, or none → nothing is set. The screen behaves exactly as
 *     it does for a visitor who arrived with no provider; what changes is that
 *     the catalogue on it is narrowed to that provider's own list (_stepWhat).
 *
 * Never silently submitting a wrong topic is the whole rule: a request filed
 * under the wrong thing is worse for the client AND for the person they chose.
 */
export function withTarget(d: Draft, topics: string[], chosen = false): Draft {
  // ⚠️ `chosen` IS THE PERSON, NOT THE TOPIC. A provider was named, so this is a
  // message to somebody rather than a request into the room — and that is true
  // whether or not their topic could be inferred (see `directTo`).
  // ⚠️ `directTo` IS EARNED, NOT ASSUMED (2026-08-19, the same day it shipped
  // wrong). It collapses the whole run to one screen, so it may only be true
  // when every question that screen skips already HAS an answer. The first
  // version set it from `chosen` alone: a provider whose offering spans two
  // topics, or one topic that could be a lesson or a consultation, left `kind`
  // empty — and the wizard then showed one screen, took the person's name and
  // number, and answered „INVALID" on send, every time, with nothing on the
  // page pointing at what was wrong. Measured: 0 of the direct runs could
  // submit. The rule now is the one the name always implied — the person is
  // chosen AND there is nothing left to ask.
  if (topics.length !== 1) return { ...d, directTo: false, topicPinned: false }
  const only = topics[0]
  // `withTopic` already owns „one possible kind → set it", so the pin is only
  // asking whether that happened.
  const next = withTopic({ ...d }, only)
  const pinned = kindsOfTopic(only).length === 1
  if (!(chosen && pinned)) return { ...next, directTo: false, topicPinned: pinned }
  // The questions this run will never ask, answered as „not asked" rather than
  // left empty. A named provider quotes after a conversation, not blind — see
  // UNSTATED_BUDGET in lib/requestTopics for why this is a sentinel and not a
  // band anybody can pick.
  return { ...next, directTo: true, topicPinned: true, timing: UNSTATED }
}

/**
 * A draft restored from storage, made trustworthy. sessionStorage outlives
 * deploys, so every keyed answer is re-checked the way a fresh tap would be;
 * anything that no longer parses drops to its empty value.
 */
export function reviveDraft(raw: unknown): Draft {
  if (!raw || typeof raw !== 'object') return EMPTY_DRAFT
  const d = { ...EMPTY_DRAFT, ...(raw as Partial<Draft>) }
  // ⚠️ A RESTORED DRAFT NEVER CARRIES THE PIN. It is a fact about the URL that
  // was open when the run started (`?to=`), and the URL open NOW is the one
  // that decides — the same rule `vertical` follows in RequestWizard. Without
  // this, one run started from a plumber's profile would silently shorten every
  // later visit to a bare /request, hiding the topic question from somebody who
  // has not chosen anybody.
  d.topicPinned = false
  // ⚠️ A DRAFT WRITTEN BEFORE THE TYPED BUDGET WENT (2026-08-19) still carries
  // `budgetAmount`, and the spread above copies it straight back in. The wire
  // schema no longer has that key, so it would be stripped at submit and the
  // person would meet „INVALID" on the last screen for an answer they gave.
  // Dropped here instead: `stepComplete('budget')` then reads false and the
  // resume logic parks them on the budget question, which is the truth — the
  // ladder is the only way to answer it now.
  delete (d as Record<string, unknown>).budgetAmount
  if (typeof d.details !== 'object' || d.details === null || Array.isArray(d.details)) d.details = {}
  // ⚠️ READ FROM `REQUEST_KINDS`, NEVER RE-TYPED HERE (2026-08-17). This was a
  // literal `['LEARNING', 'CONSULTATION', 'PROJECT']`, so the day a fourth kind
  // was added every revived SERVICE draft silently reset to EMPTY_DRAFT — a
  // person who refreshed mid-request would have lost every answer, and nothing
  // would have thrown. A list of the legal values already exists; a second copy
  // of it is a copy that goes stale exactly once and expensively.
  if (d.kind !== '' && !(REQUEST_KINDS as readonly string[]).includes(d.kind)) {
    return EMPTY_DRAFT
  }
  if (d.kind !== '') {
    if (d.topic && !isTopicOfKind(d.kind, d.topic)) d.topic = ''
    // A draft saved before the budget question went carries a real band id.
    // It is harmless (the schema still accepts it), but anything the ladder no
    // longer knows drops to UNSTATED rather than to '' — '' is the one value
    // ServiceRequestInput refuses, and the screen that used to fix it is gone.
    if (bandOf(d.kind, d.budgetBand) === undefined) d.budgetBand = UNSTATED
    if (d.timing && !TIMING[d.kind].some(t => t.id === d.timing)) d.timing = ''
  }
  for (const k of ['description', 'contactName', 'phone', 'email', 'website'] as const) {
    if (typeof d[k] !== 'string') d[k] = ''
  }
  return d
}

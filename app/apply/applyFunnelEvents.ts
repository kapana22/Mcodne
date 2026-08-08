// Expert-application funnel — the CONTRACT shared by the browser (ApplyClient)
// and the server (app/api/events/route.ts).
//
// WHY IT EXISTS: the admin panel could see how many applications were SUBMITTED
// and nothing at all about the ones that were not. Someone who opens /apply,
// picks a sphere, then closes the tab left no trace anywhere — the draft is
// localStorage-only, so the whole abandonment path was invisible. „Ten people
// started and two finished" is a completely different problem from „two people
// started", and the panel could not tell them apart.
//
// Deliberately mirrors components/booking/funnelEvents.ts — same shape, same
// discipline, so the two funnels read the same way in the insights tab.
//
// Discipline (identical to the booking funnel):
//   • names are added HERE, never typed inline at a call site;
//   • props carry FACTS, never words the applicant wrote. Their bio is a person
//     describing themselves — a character count is a funnel signal, the text is
//     not ours to log.
//
// IDENTITY: /apply requires a signed-in session, so app/api/events attaches the
// real `userId` to every row. That is what lets the panel say WHO stopped and
// on which step, without this module ever carrying a name, an email or a phone.

/** Every event the apply funnel may emit. The API allow-list derives from this. */
export const APPLY_FUNNEL_EVENTS = {
  /** /apply opened by a signed-in STUDENT — the denominator of the funnel. */
  opened: 'apply_opened',
  /** Step 1 completed: name, sphere, headline and bio all valid. */
  profileDone: 'apply_profile_done',
  /** Step 2 completed: at least one priced service — they reached the review step. */
  pricingDone: 'apply_pricing_done',
  /** POST /api/applications succeeded. */
  submitted: 'apply_submitted',
  /** Submit was attempted and REJECTED — carries the reason, so „blocked" is
   *  distinguishable from „lost interest". */
  failed: 'apply_failed',
  /**
   * „გაგრძელება" was pressed and validation refused — the applicant is still on
   * the step, looking at a red message.
   *
   * WHY IT WAS ADDED (2026-08-05). The funnel recorded only what people
   * COMPLETED, so the panel could say „stopped on step 2" and never why. A real
   * applicant opened /apply on 08-03, finished step 1, stopped; came back on
   * 08-05, finished step 1 again, stopped again — same wall twice, and nothing
   * anywhere said which field it was. „Stopped" and „was refused" are opposite
   * problems: one is a design question, the other is a bug we can fix.
   *
   * Fires on every refusal, including repeats — pressing the button four times
   * against the same wall is exactly the signal worth seeing.
   */
  blocked: 'apply_blocked',
} as const

export type ApplyFunnelEvent = typeof APPLY_FUNNEL_EVENTS[keyof typeof APPLY_FUNNEL_EVENTS]

/** Flat list — what the events route folds into its allow-list. */
export const APPLY_FUNNEL_EVENT_NAMES: readonly ApplyFunnelEvent[] =
  Object.values(APPLY_FUNNEL_EVENTS)

/**
 * Every prop key this funnel may send. An allow-list (not just a size cap) is
 * what makes it structurally impossible for free text to arrive under an
 * improvised key.
 */
export const APPLY_FUNNEL_PROP_KEYS = [
  'flowId',     // stable per-attempt id, anonymous — stitches the steps together
  'step',       // 1 | 2 | 3 — where they were when the event fired
  'catCount',   // how many spheres they selected
  'bioLen',     // CHARACTER COUNT of „რაში ეხმარები" — never the text
  'headlineLen',// CHARACTER COUNT of the one-liner — never the text
  'hasPhone',   // they filled the optional phone (boolean, never the number)
  'hasPhoto',   // they uploaded a profile photo
  'certCount',  // how many diplomas they attached
  'serviceCount', // how many services they defined
  'priceGel',   // the flagship price they set
  'code',       // server error code on `failed` — a constant, never a message.
                // Reuses the booking funnel's key on purpose: it is the only
                // string prop besides flowId/tutorId the validator allows, and
                // it is already regex-bound to SCREAMING_SNAKE constants.
  'resumed',    // the localStorage draft was restored on open
] as const

export type ApplyFunnelPropKey = typeof APPLY_FUNNEL_PROP_KEYS[number]
export type ApplyFunnelProps = Partial<Record<ApplyFunnelPropKey, string | number | boolean>>

/**
 * Anonymous per-attempt id: 16 lowercase hex characters.
 *
 * ⚠️ THE SHAPE IS PART OF THE VALIDATOR'S CONTRACT — `FLOW_ID_RE` in
 * components/booking/funnelEvents.ts is `^[a-z0-9]{8,32}$`. This first used
 * `crypto.randomUUID()`, whose hyphens fail that test, so every apply event
 * would have been rejected at the API and the whole funnel would have recorded
 * nothing while appearing to work.
 *
 * Deliberately DUPLICATED rather than imported from the booking module: that
 * module imports this one's constants for its allow-list, and importing back
 * would close a cycle — with module-level `Set`s built at load time, a cycle can
 * silently produce empty allow-lists. Two small generators beat that risk.
 */
export function newApplyFlowId(): string {
  try {
    const c = typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined
    if (c?.getRandomValues) {
      const b = new Uint8Array(8)
      c.getRandomValues(b)
      return Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
    }
  } catch { /* fall through */ }
  // Non-crypto fallback, same alphabet and length band.
  let out = ''
  while (out.length < 16) out += Math.random().toString(16).slice(2)
  return out.slice(0, 16)
}

/**
 * Fire-and-forget. `keepalive` so the event still leaves a tab that is closing —
 * which is precisely the moment an abandonment happens.
 *
 * Never awaited, never throws: analytics may not break an application.
 */
export function trackApply(name: ApplyFunnelEvent, props: ApplyFunnelProps): void {
  if (typeof window === 'undefined') return
  try {
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, props }),
      keepalive: true,
      cache: 'no-store',
    }).catch(() => {})
  } catch {
    /* analytics may never break /apply */
  }
}

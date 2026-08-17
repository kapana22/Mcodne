// Request-wizard funnel — the CONTRACT shared by the browser (RequestWizard)
// and the server (app/api/events/route.ts).
//
// WHY IT EXISTS. The owner's instruction is that this vertical's UX decisions
// be made on evidence — and the one instrument that produces the evidence is
// the funnel: „ten people opened the wizard and two sent" is a different
// problem from „two people opened it", and without these rows the two are
// indistinguishable. Which STEP eats people, and for which KIND, is the first
// question every next design round will ask.
//
// Deliberately mirrors app/apply/applyFunnelEvents.ts — same shape, same
// discipline, so the three funnels read the same way in the insights tab:
//   • names are added HERE, never typed inline at a call site;
//   • props carry FACTS from the fixed vocabulary (kind ids, topic slugs, band
//     ids), never words the person wrote. The description is somebody's
//     problem in their own words — a character count is a funnel signal, the
//     text is not ours to log.
//
// IDENTITY: /request is reachable without an account at later stages, so rows
// may carry no userId. The flowId stitches one attempt's steps together and
// dies with the tab — same anonymity contract as the booking funnel.

/** Every event the request wizard may emit. The API allow-list derives from this. */
export const REQUEST_FUNNEL_EVENTS = {
  /** The wizard rendered — the denominator of the whole funnel. */
  opened: 'request_opened',
  /** Step 1: a kind card was tapped. Props: { flowId, kind }. */
  kindChosen: 'request_kind_chosen',
  /** Step 2: a topic was tapped. Props: { flowId, kind, topic }. */
  topicChosen: 'request_topic_chosen',
  /** Step 3 passed its gate — description, band and timing all valid.
   *  Props: { flowId, kind, topic, band, notesLen }. */
  detailsDone: 'request_details_done',
  /** POST /api/requests succeeded. Props carry `rejected` so the below-floor
   *  arrivals — the demand the platform refuses — are countable from here too. */
  sent: 'request_sent',
  /** Submit was attempted and refused. Props: { flowId, code }. */
  failed: 'request_failed',
} as const

export type RequestFunnelEvent = typeof REQUEST_FUNNEL_EVENTS[keyof typeof REQUEST_FUNNEL_EVENTS]

/** Flat list — what the events route folds into its allow-list. */
export const REQUEST_FUNNEL_EVENT_NAMES: readonly RequestFunnelEvent[] =
  Object.values(REQUEST_FUNNEL_EVENTS)

/**
 * The prop keys this funnel may send, beyond the shared flowId/code/notesLen
 * the other funnels already registered. All three hold ids from
 * lib/requestTopics — slugs, never free text — and the events route constrains
 * them to slug shape so a crafted POST cannot smuggle words through them.
 */
export const REQUEST_FUNNEL_PROP_KEYS = ['kind', 'topic', 'band', 'rejected'] as const

/** kind/topic/band are vocabulary slugs: latin, digits, dash/underscore. */
export const REQUEST_SLUG_RE = /^[a-z0-9_-]{1,40}$/i

/** Scalars only, keys from this funnel's own contract. */
export type RequestFunnelProps = Partial<
  Record<(typeof REQUEST_FUNNEL_PROP_KEYS)[number] | 'flowId' | 'code' | 'notesLen', string | number | boolean>
>

/**
 * Fire-and-forget, same transport and same never-break-the-page contract as
 * components/booking/funnelEvents → trackFunnel. A separate function only so
 * the props type is THIS funnel's — reusing trackFunnel would force every call
 * site through a cast, and a cast is where a renamed key stops being caught.
 */
export function trackRequestFunnel(name: RequestFunnelEvent, props: RequestFunnelProps): void {
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
    // Analytics may never break the wizard.
  }
}

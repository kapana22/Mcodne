'use client'
// The offers on a client's request — the list, the one they are reading, and
// the button that decides it.
//
// ⚠️ TWO PANES SINCE 2026-09-01, FROM THE OWNER'S DESIGN CANVAS („Request Room
// v2" → artboard 2 „შეთავაზებები"). It was a vertical stack of full cards, each
// carrying a name, a price, a paragraph, a collapsed conversation and its own
// „ავირჩევ" — so comparing three offers meant scrolling past three of
// everything, and the ONE line that actually differs between them („მასალა
// ფასში შედის" vs „მასალა ცალკე") was buried in paragraph four.
//
// The canvas splits the screen the way every reference marketplace does: a
// narrow column of comparable summaries on the left — verified, name, price,
// what the price covers, when it came — and ONE detail pane on the right that
// carries everything about the offer being read, the conversation included.
// Three offers are then three lines of difference, not three pages.
//
// ⚠️ `priceIncludes` IS WHY THE LIST CAN BE A LIST. It is the provider's
// one-line answer to „what does the price cover" (prisma/schema →
// RequestOffer.priceIncludes, required on new offers, 120 characters so it
// survives an ellipsis on a 350px card). It is NULL on every offer written
// before that column existed, and where it is null NOTHING is drawn — never a
// dash, never a placeholder: „—" reads as a claim the provider never made.
//
// ⚠️ TWO CHANNELS PER OFFER SINCE 2026-09-03 — „მიწერა" AND „დარეკვა".
// Owner: „ვისაც უნდა დარეკავას ვისაც უნდა არაა", then „დარეკვა უნდა იყოს
// ასარჩევად ორი ღილაკი და შემდეგ აირჩიოს რომელი სჭირდება." Every card carries
// both, before the choice as well as after it, and the client picks.
//
// ⚠️ „დარეკვა" IS A PURCHASE, AND THAT IS WHY IT IS A BUTTON AND NOT A LINK.
// Pressing it charges the PROVIDER `CONTACT_COST_TETRI` and only then returns
// the number — POST /api/requests/[ref]/call, which carries the whole decision
// and the market check behind it. The client is told none of that and should
// not be: from where they sit they pressed „call" and got a number.
//
// It began the day as an `<a href="tel:">` with the number already in the
// props. That was wrong the moment the call became billable — digits in a
// page's props are readable from the source, so the fee would have been
// optional. `providerCanCall` is a boolean now and the digits are sold.
//
// ⚠️ WHERE THE BUTTON IS ABSENT IT IS ABSENT, NEVER DISABLED. Two reasons put
// it there — no number on file, or a provider whose balance cannot carry the
// charge — and neither is the client's business or anything they could fix. A
// control that cannot act is a promise the screen cannot keep.
//
// What did NOT move: nothing on this screen says anything about the CLIENT,
// whose contact still needs an accepted offer and is still bought.
//
// ⚠️ AND THE CARD IS NO LONGER ONE BIG <button>. It cannot be: a button inside
// a button is invalid, and a screen reader handed „ლუკა 124₾ … მიწერა დარეკვა"
// as one control has been told nothing it can act on. The card is a <div>, the
// summary is the button that selects it, and the two channels are their own
// controls beneath — three targets that each say what they do.
//
// A client component only because accepting is a mutation — the page itself is
// server-rendered and hands this the ALREADY SHAPED offers. It receives no row
// and does no query, so there is nothing here that could widen what a client
// sees beyond what `clientOfferView` released.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/components/Avatar'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { RequestChat } from '@/components/RequestChat'
import {
  offerPriceLabel, OFFER_PRICE_KIND_LABEL, OFFER_PRICE_FIELD,
  OFFER_STATUS_LABEL, type OfferStatusName, type OfferPriceKind,
} from '@/lib/requests'
import { CloseRequest } from './_close'

type Offer = {
  id: string
  priceGel: number
  priceKind: string
  daysEstimate: number | null
  /** ⚠️ MAY BE '' SINCE 2026-09-01. The provider's own note stopped being the
   *  required field the day `priceIncludes` became one. */
  message: string
  /** What the price covers — one line, or null on an offer written before the
   *  column existed. */
  priceIncludes: string | null
  status: string
  providerName: string
  providerProfileHref: string | null
  providerVerified: boolean
  providerRating: number | null
  providerReviews: number
  /** ⚠️ A BOOLEAN, NOT THE NUMBER. The digits are bought — see the header —
   *  and a string in these props would be readable by anybody who opened the
   *  page source, which would make the fee optional. False also when the
   *  provider's own balance could not carry the charge; the button is then
   *  absent rather than disabled, because the reason is a stranger's ledger. */
  providerCanCall: boolean
  unread: number
  /** „12 წუთის წინ", worded on the SERVER (lib/requests → timeAgoKa). Not
   *  computed here: `Date.now()` in a client render disagrees with the one the
   *  server used and React reports a hydration mismatch on a string nobody
   *  needed to be live. */
  age: string
  /** After the choice (stage 7): QUOTE offers can be marked done and reviewed. */
  kind: string
  doneAt: string | null
  review: { rating: number; body: string } | null
}

/** Server codes → Georgian. Never surface a raw code to a reader.
 *  Exported because ./_close speaks to the same two endpoints and a second
 *  copy of this table is how one 409 comes to read two ways. */
/* ⚠️ THE RESOLVER MOVED TO lib/requestRoomErrors (2026-09-02) and is re-exported
   here so `_close.tsx` — which has imported it from this file since it was
   written — does not have to change. It left because a `'use client'` file
   cannot be imported by a test, so the only available assertion was a grep over
   its source; tests/offerLifecycle §E now calls it instead. */
export { errText } from '@/lib/requestRoomErrors'
import { errText } from '@/lib/requestRoomErrors'
/**
 * The KIND, as a chip beside the price — but only where it says something the
 * price does not.
 *
 * `offerPriceLabel` already spells the kind into the number for two of the
 * four: „75₾-დან" IS „-დან", and „გამოძახება 20₾ · სამუშაო ადგილზე" IS
 * „ადგილზე შევაფასებ". Printing the label beside those is the same fact twice
 * on a card whose whole job is to be scannable.
 */
/** Place the call where the device can. See the note at `call`. */
function dial(tel: string) {
  try {
    if (window.matchMedia('(pointer: coarse)').matches) window.location.href = tel
  } catch { /* an old browser without matchMedia simply prints the number */ }
}

function kindChip(priceKind: string): string | null {
  if (priceKind !== 'FIXED' && priceKind !== 'HOURLY') return null
  return OFFER_PRICE_KIND_LABEL[priceKind as OfferPriceKind] ?? null
}

export function OfferList({ publicRef, statusWord, offers, matched, canReview, selectedOfferId = null }: {
  publicRef: string
  /** The conversation to open on arrival, from `?o=` — see the state below. */
  selectedOfferId?: string | null
  /** „აქტიური მოთხოვნა" — the client's word for the state, beside the code. */
  statusWord: string
  offers: Offer[]
  matched: boolean
  /** The request has an account user to sign a review as (lib/offerLifecycle
   *  → reviewGate). Without one the picker is not drawn — a form that can only
   *  answer NO_ACCOUNT is not a form. */
  canReview: boolean
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /* ── Which offer is being read ────────────────────────────────────────────
     Deterministic on both sides of hydration, and it survives a
     `router.refresh()` because the state lives here rather than in the URL:
     an offer arriving while you read another one must not move you off it.
     The ACCEPTED one wins when there is one — after the choice there is only
     one conversation left that matters.

     ⚠️ `selectedOfferId` COMES FIRST WHEN IT NAMES A REAL ROW (2026-09-02).
     It is what /me/r/<ref>?o=<id> carries, and that link is followed by the two
     things that say „somebody wrote to you": the bell, and a row of the inbox.
     Landing on the request and having to find the conversation again is the
     step this whole pass exists to remove — owner: „მთავარი ნიშა პარალელურად
     არის რომ სწრაფად მოხდეს კავშირი."

     ⚠️ IT IS AN INITIAL VALUE, NOT A CONTROLLED PROP. Clicking another offer
     must not be undone by the query string still sitting in the address bar,
     and a `useEffect` syncing the two would fight the reader. An id that names
     no row (a withdrawn offer, a stale link) falls through to the old answer
     rather than selecting nothing. */
  const [selId, setSelId] = useState<string | null>(
    (selectedOfferId && offers.some(o => o.id === selectedOfferId) ? selectedOfferId : null)
      ?? offers.find(o => o.status === 'ACCEPTED')?.id
      ?? offers[0]?.id
      ?? null,
  )

  // „მოაგვარე?" is offered rather than forced: it takes the whole column, and
  // taking it the second an offer is accepted would replace the conversation
  // the client just opened with a question about work that has not started.
  // 'RATE' below is the exception — somebody has already said the job
  // finished, so the rating IS the only thing left on this screen.
  const [asking, setAsking] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // ── Which offers ARRIVED while you were looking (stage 10) ────────────────
  // The page is re-rendered by the room's stream (../_liveRefresh) the moment
  // an offer is written; React keeps the cards already on screen and mounts
  // the new one. Only THAT one enters (`slide-in-b`, motion-safe) — the ids
  // present at first render are remembered and never animate, so a reload
  // does not play four entrances over a list the reader has already seen.
  // Owner: „პასუხები სათითაოდ მოდის, ჩვეულებრივი ჩატივით." A card that
  // arrived keeps its class; an animation runs once, on the node's mount, and
  // a re-render does not restart it.
  const seenAtMount = useRef<Set<string> | null>(null)
  if (seenAtMount.current === null) seenAtMount.current = new Set(offers.map(o => o.id))
  const arrived = (id: string) => !seenAtMount.current!.has(id)

  /* ── „მიწერა" — what makes it different from tapping the card ────────────
     Tapping a card selects it and shows the offer's TOP: the price, the terms,
     the profile. „მიწერა" is a claim about a CHANNEL, so it has to land on the
     conversation — otherwise the two controls do the same thing and one of them
     is decoration.

     A counter rather than a boolean: pressing it twice on the same card must
     scroll twice, and a boolean that is already `true` fires no effect.

     ⚠️ NO `focus()` ON THE COMPOSER, DELIBERATELY. The pane is keyed on the
     offer id, so choosing another card REMOUNTS RequestChat — the textarea
     that would be focused does not exist until after the re-render, by which
     time iOS has ended the user gesture and refuses to raise the keyboard
     anyway. A focus that works on a desktop and silently does nothing on the
     phone is worse than none: it makes the button behave differently on the
     device most of these clients are holding. */
  /* ── „დარეკვა" — the purchase, and what the card does with it ────────────
     Keyed by offer id: a client comparing three offers may open two numbers,
     and a single „the number" would replace one card's answer with another's.
     Once opened it stays — the charge is spent and re-asking would only be a
     second round trip for a fact we already hold.

     ⚠️ THE DIAL IS ATTEMPTED ONLY ON A TOUCH POINTER. `location.href = 'tel:'`
     on a desktop opens nothing, or a „choose an application" dialog nobody
     asked for; the number is PRINTED there instead and the reader picks up
     their own handset. `(pointer: coarse)` is the honest test for „this device
     can place the call itself" — a viewport width is not. */
  const [numbers, setNumbers] = useState<Record<string, { tel: string; phone: string }>>({})
  const [callingId, setCallingId] = useState<string | null>(null)

  const call = async (id: string) => {
    const held = numbers[id]
    if (held) { dial(held.tel); return }
    if (callingId) return
    setCallingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/requests/${publicRef}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId: id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok || typeof j.tel !== 'string') { setError(errText(j?.error)); return }
      setNumbers(n => ({ ...n, [id]: { tel: j.tel, phone: String(j.phone ?? '') } }))
      dial(j.tel)
    } catch {
      setError(errText())
    } finally {
      setCallingId(null)
    }
  }

  const chatRef = useRef<HTMLDivElement | null>(null)
  const [chatNudge, setChatNudge] = useState(0)
  useEffect(() => {
    if (chatNudge === 0) return
    /* CLAUDE.md §1 in the one place a Tailwind `motion-safe:` cannot reach —
       scrollIntoView has no media-query variant, so the question is asked in
       JS. Same answer, same reason: an unrequested animation is a symptom for
       somebody with a vestibular disorder. */
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    chatRef.current?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' })
  }, [chatNudge])

  const accept = async (id: string) => {
    if (busyId) return
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/requests/${publicRef}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId: id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) { setError(errText(j?.error)); return }
      // Re-render from the server rather than patching state: the accept
      // declines every other offer too. Both sides are decided server-side, so
      // reading them back is the only way this screen and the database agree.
      router.refresh()
    } catch {
      setError(errText())
    } finally {
      setBusyId(null)
    }
  }

  if (offers.length === 0) return null

  const sel = offers.find(o => o.id === selId) ?? offers[0]
  const accepted = offers.find(o => o.status === 'ACCEPTED') ?? null

  /* ── What is still open on the job, once one was chosen ───────────────────
     'DONE' — nobody has said the work finished; 'RATE' — somebody has (this
     client on an earlier visit, or the provider from their own screen) and the
     rating has not been written. QUOTE only: a BOOKING offer's completion is
     the booking's, and lib/offerLifecycle refuses to stamp one here. */
  const pending: 'DONE' | 'RATE' | null =
    accepted && accepted.kind === 'QUOTE' && !accepted.review
      ? (!accepted.doneAt ? 'DONE' : (canReview ? 'RATE' : null))
      : null

  const showClose = accepted !== null && pending !== null && !dismissed && (asking || pending === 'RATE')

  if (showClose && accepted) {
    return (
      <CloseRequest
        publicRef={publicRef}
        offerId={accepted.id}
        providerName={accepted.providerName}
        done={accepted.doneAt !== null}
        canReview={canReview}
        onBack={() => { setAsking(false); setDismissed(true) }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-h1 font-extrabold leading-tight tracking-[-0.025em] text-balance sm:text-display">
          {offers.length} შეთავაზება მოვიდა
        </h1>
        {/* The reference stays on the page — small, `tabular-nums`, and read
            down a phone when somebody calls us about this request. It was the
            h1 once (2026-08-18: „ძალიან არაკომფორტულია"); it is meta now. */}
        <p className="mt-2 text-meta tabular-nums text-ink-400">{statusWord} · {publicRef}</p>
      </div>

      {error && (
        <div role="alert" className="rounded-field border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-body text-danger-700">
          {error}
        </div>
      )}

      {/* ⚠️ THE COLUMNS WRAP ON THE CONTAINER, NOT ON THE VIEWPORT. `flex-wrap`
          with a basis and a floor per pane means the two sit side by side
          wherever there is room for both and stack where there is not — which
          is the only thing that works here, because this page renders inside
          the request shell's 560px column and a `lg:` breakpoint would put a
          two-column layout into it the moment the WINDOW was wide, not the
          space. (The shell wants a wider size on this page — see the note in
          page.tsx.) */}
      {/* ⚠️ THE ACCORDION IS PURE CSS, AND `offers-room` IS WHAT MAKES IT
          POSSIBLE (2026-09-03). See app/globals.css → „the offers room".
          Narrow: `.offers-list` becomes `display: contents`, the cards become
          direct children of the wrap, and the `order` values below drop the
          detail pane immediately AFTER the card it belongs to. Wide: the list
          is a real column again and the same orders leave everything where the
          canvas drew it. One DOM, two layouts — the alternative was rendering
          the pane twice, which means two RequestChat mounts, two streams and
          two of every unread receipt.
          Owner, on the screenshot of the stacked list: „ეს პროცესი აქ
          არაკომფორტულია შეიძლება დაიკარგოს ოფერი." It could: the pane sat
          after the WHOLE list, so tapping a card changed something two screens
          below and read as „nothing happened". */}
      <div className="offers-room">
      <div className="offers-wrap flex flex-wrap items-stretch gap-4">
        <div className="offers-list flex flex-[1_1_320px] flex-col gap-2.5">
          {offers.map((o, i) => {
            const isSel = o.id === sel.id
            const chip = kindChip(o.priceKind)
            const shown = numbers[o.id] ?? null
            /* ⚠️ THE SAME CONDITION THE CONVERSATION IS DRAWN UNDER, and it has
               to be the same one. A DECLINED offer has no thread in the pane
               („{sel.status === 'SENT' || 'ACCEPTED'}" below), so a „მიწერა" on
               its card would select it, scroll to a composer that is not there,
               and look broken. And there is nothing to say: the client chose
               somebody else, and a call button beside a refusal invites an
               awkward phone call nobody wanted. Neither channel, no strip. */
            const open = o.status === 'SENT' || o.status === 'ACCEPTED'
            return (
              <div
                key={o.id}
                /* Even numbers, so the detail pane can take an odd one between
                   any two of them. Set inline because it is DATA — which card
                   is selected — not a style. */
                style={{ order: i * 2 }}
                className={[
                  'flex w-full flex-col overflow-hidden rounded-card border bg-white transition-[border-color,box-shadow] duration-fast',
                  isSel
                    ? 'border-ink-900 shadow-pop'
                    : o.status === 'ACCEPTED'
                      ? 'border-brand-200'
                      : 'border-ink-100 hover:border-ink-300',
                  arrived(o.id) ? 'motion-safe:animate-slide-in-b' : '',
                ].filter(Boolean).join(' ')}
              >
              <button
                type="button"
                onClick={() => setSelId(o.id)}
                aria-current={isSel ? 'true' : undefined}
                /* It opens the detail below itself on a phone, so it says so —
                   the same control, honestly described in both layouts. */
                aria-expanded={isSel}
                className={[
                  // ⚠️ `no-caps`, AND IT IS NOT A PREFERENCE. globals.css puts
                  // every <button> into Georgian mtavruli — right for a control
                  // with a two-word label, and this summary is a paragraph: a
                  // person's name, a price, and up to 120 characters of what
                  // that price covers. Rendered in caps the line the whole
                  // redesign is built around becomes the least readable thing
                  // on the screen. (The two channel buttons below ARE two-word
                  // controls, so they keep the house caps.)
                  'no-caps flex w-full flex-col gap-2.5 px-4 pt-4 pb-3 text-left',
                ].join(' ')}
              >
                <span className="flex items-center gap-2">
                  {/* The dot is the canvas's summary of „გადამოწმებული"; the
                      WORD is in the pane beside the name. A colour alone would
                      be a fact only a sighted reader gets, so the fact travels
                      with it. */}
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-pill ${o.providerVerified ? 'bg-brand-500' : 'bg-ink-200'}`} />
                  {o.providerVerified && <span className="sr-only">გადამოწმებული</span>}
                  <span className={`min-w-0 flex-1 truncate font-display text-body-lg text-ink-900 ${o.unread > 0 ? 'font-extrabold' : 'font-bold'}`}>
                    {o.providerName}
                  </span>
                  {o.unread > 0 && (
                    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-pill bg-danger-500 px-1.5 text-micro font-bold tabular-nums text-white">
                      {o.unread}
                      <span className="sr-only"> წაუკითხავი</span>
                    </span>
                  )}
                </span>

                <span className="flex flex-wrap items-baseline gap-2">
                  {/* Read through the ONE function that knows what the number
                      means — „80₾-დან" and „90₾/სთ" are the same column with a
                      different kind beside it. */}
                  <span className="font-display text-h2 font-extrabold tabular-nums text-ink-900">
                    {offerPriceLabel(o.priceGel, o.priceKind)}
                  </span>
                  {chip && (
                    <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-pill border border-brand-100 bg-brand-50 px-2.5 text-micro font-semibold text-ink-600">
                      {chip}
                    </span>
                  )}
                </span>

                {o.priceIncludes && (
                  <span className="truncate text-small leading-relaxed text-ink-600">{o.priceIncludes}</span>
                )}

                <span className="mt-0.5 flex items-center gap-2">
                  <span className="text-meta text-ink-500">{o.age}</span>
                  {o.status === 'ACCEPTED' && (
                    <span className="ml-auto inline-flex h-[22px] items-center whitespace-nowrap rounded-pill border border-brand-200 bg-brand-50 px-2.5 text-micro font-bold text-brand-700">
                      არჩეული
                    </span>
                  )}
                </span>
              </button>

              {/* ── THE TWO CHANNELS ────────────────────────────────────────
                  Owner, 2026-09-03: „ორი ღილაკი და შემდეგ აირჩიოს რომელი
                  სჭირდება." Equal weight on purpose — neither is the primary,
                  because which one is right is the CLIENT's answer and not
                  ours. The one thing that outranks both is still „ავირჩევ",
                  which lives in the detail pane where the terms being agreed
                  to are on screen.
                  h-10 is the floor from CLAUDE.md §3, and these sit at the
                  bottom edge of a card on a phone — the least forgiving place
                  on the screen for a small target. */}
              {open && (
              <div className="flex items-center gap-2 border-t border-ink-75 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => { setSelId(o.id); setChatNudge(n => n + 1) }}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-btn border border-ink-200 bg-white text-small font-semibold text-ink-800 transition-colors duration-fast hover:border-ink-300 hover:bg-ink-50"
                >
                  <Icon.chat aria-hidden className="h-4 w-4" />
                  მიწერა
                </button>
                {/* ⚠️ ONCE THE NUMBER IS BOUGHT THE CARD PRINTS IT, and the
                    anchor takes over from the button. That is the only state in
                    which an `<a href="tel:">` is right here — it long-presses,
                    it copies, it works with a keyboard, and on a desktop the
                    digits are the whole point because `tel:` does nothing
                    there. The button before it cannot be an anchor: it spends
                    money and has to wait for the server.
                    Absent — not disabled — where the call cannot happen. */}
                {shown ? (
                  <a
                    href={shown.tel}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-btn border border-brand-200 bg-brand-50 px-2 text-small font-bold tabular-nums text-brand-800 transition-colors duration-fast hover:border-brand-300 hover:bg-brand-100"
                  >
                    <Icon.phone aria-hidden className="h-4 w-4 shrink-0" />
                    <span className="truncate">{shown.phone}</span>
                  </a>
                ) : o.providerCanCall ? (
                  <button
                    type="button"
                    onClick={() => call(o.id)}
                    disabled={callingId !== null}
                    aria-busy={callingId === o.id}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-btn border border-brand-200 bg-brand-50 text-small font-semibold text-brand-700 transition-colors duration-fast hover:border-brand-300 hover:bg-brand-100 disabled:opacity-50"
                  >
                    <Icon.phone aria-hidden className="h-4 w-4" />
                    {callingId === o.id ? 'იხსნება…' : 'დარეკვა'}
                  </button>
                ) : null}
              </div>
              )}
              </div>
            )
          })}
        </div>

        {/* ── The one being read ─────────────────────────────────────────────
            Narrow: `order` drops it straight under the card that opened it.
            Wide: it is the right-hand column and the order is inert. */}
        <div
          style={{ order: Math.max(0, offers.findIndex(o => o.id === sel.id)) * 2 + 1 }}
          className="offers-detail flex flex-[1_1_420px] flex-col overflow-hidden rounded-panel border border-ink-100 bg-white"
        >
          <div className="flex flex-wrap items-start gap-4 border-b border-ink-100 px-5 py-5 sm:px-6">
            {/* No photo reaches this side — `clientOfferView` hands over the
                name and the public profile facts and nothing else — so this is
                the primitive's own photo-less state, not an empty circle. */}
            <Avatar name={sel.providerName} size={60} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-pill ${sel.providerVerified ? 'bg-brand-500' : 'bg-ink-200'}`} />
                <span className="font-display text-h3 font-extrabold tracking-tight text-ink-900">{sel.providerName}</span>
              </div>
              <p className="mt-1 text-small text-ink-500">
                {/* Verified = the word the whole site uses; the rating only
                    where reviews exist — a number from nothing is noise. */}
                {sel.providerVerified && <span className="font-semibold text-brand-700">✓ გადამოწმებული · </span>}
                {sel.providerRating !== null && (
                  <span className="tabular-nums text-ink-700">★ {sel.providerRating.toFixed(1)} ({sel.providerReviews}) · </span>
                )}
                {sel.daysEstimate ? `${sel.daysEstimate} დღე` : 'ვადა შეთანხმებით'}
                {sel.status !== 'SENT' && ` · ${OFFER_STATUS_LABEL[sel.status as OfferStatusName]}`}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {/* What the amount IS called — the same table the provider's own
                  form heads the box with (lib/requests → OFFER_PRICE_FIELD), so
                  the two sides of one offer cannot name it two ways. */}
              <div className="text-meta text-ink-400">{OFFER_PRICE_FIELD[sel.priceKind as OfferPriceKind]?.label ?? ''}</div>
              <div className="font-display text-h1 font-extrabold tabular-nums tracking-[-0.02em] text-ink-900">
                {offerPriceLabel(sel.priceGel, sel.priceKind)}
              </div>
            </div>
          </div>

          {(sel.priceIncludes || sel.message) && (
            <div className="border-b border-ink-100 px-5 py-5 sm:px-6">
              <p className="whitespace-pre-wrap text-body-lg leading-relaxed text-ink-700">
                {sel.priceIncludes}
                {sel.priceIncludes && sel.message ? ' ' : ''}
                {sel.message}
              </p>
            </div>
          )}

          {/* ── Ask before choosing ──────────────────────────────────────────
              Open from the moment the offer exists, which is the whole point:
              without it the client picks blind from a price and a line, or
              hands out their number early to ask one question. The seal is
              unchanged — the endpoint masks anything shaped like a contact
              until the choice is made.
              Bounded rather than free-growing: the pane scrolls its own
              transcript, which is what makes the two columns the same object
              instead of a list beside a page. */}
          {(sel.status === 'SENT' || sel.status === 'ACCEPTED') && (
            <div ref={chatRef} className="flex min-h-[220px] max-h-[440px] flex-col">
              <RequestChat
                key={sel.id}
                thread={{ kind: 'OFFER', offerId: sel.id, refCode: publicRef }}
                unread={sel.unread}
                peerName={sel.providerName}
                layout="pane"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 px-5 py-4 sm:px-6">
            {sel.providerProfileHref && (
              // The public page is where the choice is really made — reviews,
              // work, verification. NEW TAB, and that is why this is an <a>
              // rather than a <Btn href>: the primitive forwards `target` at
              // runtime but types itself as a button, so the pair cannot be
              // written type-safely. Same geometry as `variant="secondary"
              // size="lg"`.
              <a
                href={sel.providerProfileHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center rounded-btn border border-ink-200 bg-white px-5 font-display text-body font-semibold tracking-tight text-ink-900 transition-colors duration-fast hover:border-ink-300 hover:bg-ink-50"
              >
                პროფილი
              </a>
            )}
            <span className="min-w-[140px] flex-1 text-small leading-relaxed text-brand-700">
              {sel.status === 'ACCEPTED' ? 'დაგიკავშირდება' : ''}
            </span>

            {/* The button exists only while there is a choice to make. Once the
                request is matched every other offer is DECLINED, and a live
                „ავირჩევ" beside one would offer something that cannot happen. */}
            {!matched && sel.status === 'SENT' && (
              <Btn
                size="lg"
                onClick={() => accept(sel.id)}
                disabled={busyId !== null}
                aria-busy={busyId === sel.id}
              >
                {busyId === sel.id ? 'ინახება…' : 'ავირჩევ'}
              </Btn>
            )}
            {sel.status === 'ACCEPTED' && (
              <>
                <span className="inline-flex h-12 items-center whitespace-nowrap rounded-btn bg-brand-50 px-5 font-display text-body font-bold text-brand-900">
                  არჩეული
                </span>
                {/* The way INTO the close screen, and the only one — „ჯერ არა"
                    comes back here, so a client who put the question off must
                    be able to answer it later. The label is the question they
                    are about to be asked: „did you get it sorted", or, once
                    somebody has already said so, „rate it". */}
                {pending && (
                  <Btn variant="secondary" size="lg" onClick={() => { setDismissed(false); setAsking(true) }}>
                    {pending === 'DONE' ? 'მოაგვარე?' : 'შეფასება'}
                  </Btn>
                )}
              </>
            )}
          </div>

          {/* The rating, once it is written — read-only, on the offer it
              belongs to. */}
          {sel.review && (
            <div className="border-t border-ink-100 px-5 py-4 sm:px-6">
              <Stars n={sel.review.rating} />
              {sel.review.body && (
                <p className="mt-2 whitespace-pre-wrap text-body text-ink-800">{sel.review.body}</p>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}

/* ── ★ read-only ──────────────────────────────────────────────────────────
   The expert profile's Stars (app/experts/[slug]/_bits), at the same size. */
function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${n} 5-დან`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Icon.star key={i} aria-hidden className={`w-3.5 h-3.5 ${i <= n ? 'text-warning-500' : 'text-ink-200'}`} />
      ))}
    </span>
  )
}

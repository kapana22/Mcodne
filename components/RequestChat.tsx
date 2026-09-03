'use client'
// The conversation pane — one component, both sides.
//
// The client mounts it with their `ref`; the provider mounts it without one and
// is identified by their session. Neither is told which side it is rendering:
// the endpoint decides that (a `side` prop would be a claim the browser makes
// about itself) and answers with `mine` per message, which is all the bubbles
// need.
//
// COLLAPSED BY DEFAULT, opened per offer. A client comparing three offers is
// reading prices, not three transcripts at once; a provider's list is the same.
// The unread count on the closed state is what says „there is something here",
// which is exactly the job a collapsed thread should do.
//
// Polling while OPEN only — a conversation is the one screen where a reply
// arriving thirty seconds late is felt, and the one screen nobody leaves open
// in a background tab by accident. Same visibility-aware contract as
// AutoRefresh, and stopped the moment the pane is closed. (Since stage 10 the
// poll is the fallback — see „LIVE, NOT POLLED" below.)

// ── TWO THREADS, ONE PANE (2026-08-17) ──────────────────────────────────────
// A second conversation exists now — the client and US, from the moment they
// press send until a provider has answered (lib/requestThread). It is the same
// bubbles, the same receipts, the same poll; what differs is the endpoint, who
// may read it, and whether contacts are masked — and none of those are things
// this component knows or should know.
//
// So the pane takes a THREAD DESCRIPTOR and derives the URL from it, rather than
// being copied. The alternative was a second component that would have drifted
// on the first change to a bubble.
//
// ── LIVE, NOT POLLED, ON THE CLIENT'S SIDE (stage 10) ───────────────────────
// A pane that holds the reference (`refCode`) joins the request's one stream
// (lib/requestLiveClient ↔ /api/requests/[ref]/events) and refetches its thread
// the moment the route says a message, a receipt or the desk moved — through
// the SAME endpoint as before, so the masking and side rules stay where they
// live. The 15-second poll is the FALLBACK, run only while the stream is down.
// A pane without the reference (the provider's, the operator's) has no room
// to join and polls exactly as it always did.

// ── ONE PANE, TWO LAYOUTS (2026-08-31) ──────────────────────────────────────
// The owner's „Messages" artboard draws a conversation that FILLS its column:
// bubbles on the cream ground, a composer bar pinned to the bottom edge, day
// separators between the runs. That is not the shape this component had — an
// `inline` accordion with a 288px scroll box, which is right where it is used
// (one of three offer cards on /request/<ref>, the thread with us under a
// thank-you page) and wrong as the whole screen.
//
// So `layout` picks the shape and NOTHING else. Both branches read the same
// endpoint, run the same poll and the same stream, mask the same way and render
// the same bubble — a second component would have drifted on the first change
// to a receipt or a closed thread, which is the exact failure this file's own
// header already warns about for the two THREAD KINDS.

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { fmtKaDateTime, fmtKaDayLabel } from '@/lib/kaDate'
import { sanitizeMsgBody } from '@/lib/msgText'
import { presenceLabel, presenceHint } from '@/lib/requestThread'
import { subscribeRequestLive, type LiveState } from '@/lib/requestLiveClient'
import { actionError, SEND_FAILED } from '@/lib/actionErrors'

type Msg = { id: string; mine: boolean; body: string; createdAt: string; readByOther: boolean }

/**
 * Which conversation this pane is showing.
 *
 * `OFFER` — the client and one provider, keyed by the offer. The client proves
 *           themselves with `refCode`; the provider is their session.
 * `PLATFORM` — the client and us. The client proves themselves with `refCode`;
 *           an operator passes `requestId` and is their ADMIN session.
 */
type ThreadRef =
  | { kind: 'OFFER'; offerId: string; refCode?: string }
  | { kind: 'PLATFORM'; refCode?: string; requestId?: string }

const POLL_MS = 15_000

/** Server codes → Georgian. Never surface a raw code to a reader. */
/* ⚠️ `INVALID` MEANS SOMETHING SHARPER HERE, which is why the caller's map wins
   in `actionError`: this screen has ONE field, so „შეავსე ველები სწორად." would
   point at nothing and „შეტყობინება ცარიელია." names the box. */
const errText = (code?: string) => actionError(code, {
  CLOSED: 'მიმოწერა დახურულია.',
  INVALID: 'შეტყობინება ცარიელია.',
}, SEND_FAILED)

/* ═══════════ the bubble, drawn once ═════════════════════════════════════ */

/**
 * ⚠️ ONE BUBBLE FOR BOTH LAYOUTS, and the geometry is the artboard's: 18px
 * corners with the one nearest the speaker cut to 6px, my side filled
 * brand-700, theirs white on a hairline. `max-w-[72%]` is the artboard's too —
 * a bubble that reaches the far edge stops reading as one side of a
 * conversation.
 *
 * `sanitizeMsgBody` because a message body is arbitrary input: a U+202E in it
 * flips the reading direction of everything after it, which is a spoof, not a
 * message. React escapes markup; nothing escapes bidi marks.
 */
function Bubble({ text, mine }: { text: string; mine: boolean }) {
  return (
    <div
      className={`max-w-[72%] px-4 py-3 text-body leading-relaxed whitespace-pre-wrap break-words border ${
        mine
          ? 'self-end bg-brand-700 border-brand-700 text-white rounded-tile rounded-br-[6px]'
          : 'self-start bg-white border-ink-100 text-ink-900 rounded-tile rounded-bl-[6px]'
      }`}
    >
      {sanitizeMsgBody(text)}
    </div>
  )
}

/** The centred pill between two days. See lib/kaDate → fmtKaDayLabel. */
function DayPill({ label }: { label: string }) {
  return (
    <span className="self-center inline-flex items-center h-[26px] px-3 rounded-pill bg-ink-100 text-micro font-bold text-ink-600">
      {label}
    </span>
  )
}

/** Where the pane reads and writes, from the descriptor alone. One function, so
 *  the GET and the POST cannot address different threads. */
function endpointOf(t: ThreadRef): { url: string; keys: Record<string, string> } {
  if (t.kind === 'OFFER') {
    return {
      url: '/api/request-chat',
      keys: { offerId: t.offerId, ...(t.refCode ? { ref: t.refCode } : {}) },
    }
  }
  return {
    url: '/api/request-thread',
    keys: t.refCode ? { ref: t.refCode } : { requestId: t.requestId ?? '' },
  }
}

export function RequestChat({
  thread, unread = 0, peerName, defaultOpen = false, emptyHint, layout = 'inline',
}: {
  thread: ThreadRef
  /**
   * `inline` — an accordion inside a card: a header line, a 288px scroll box, a
   *            textarea and a labelled „გაგზავნა". Right where the thread is
   *            ONE of several things on the page.
   * `pane`   — the artboard's: the transcript fills the column on the cream
   *            ground and the composer is the bottom edge. Right where the
   *            conversation IS the screen. Implies `defaultOpen` and draws no
   *            header of its own — the pane above it has one.
   */
  layout?: 'inline' | 'pane'
  /** Rendered on the collapsed state so „there is something here" is visible
   *  without opening every thread. */
  unread?: number
  /** Who the reader is talking TO, for the opener line. */
  peerName?: string
  /** ⚠️ TRUE ON THE PLATFORM THREAD, and that is the whole point of it. The
   *  offer chat is one of several on a page and collapses so a client comparing
   *  three offers reads prices, not three transcripts. The thread with us is
   *  the ONLY thing on the screen it lives on — collapsed, it would be a
   *  thank-you card with a link, which is what this replaced. */
  defaultOpen?: boolean
  /** What an empty thread says. Differs per thread and cannot be derived: the
   *  offer chat's line („without sharing your number") is about a masking rule
   *  that does not exist on the platform thread. */
  emptyHint?: string
}) {
  const pane = layout === 'pane'
  // A pane IS the screen — there is nothing for it to collapse into, and a
  // collapsed one would be a blank column beside a list somebody just tapped.
  const [open, setOpen] = useState(defaultOpen || pane)
  const [msgs, setMsgs] = useState<Msg[] | null>(null)
  const [closedReason, setClosedReason] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [maskedNote, setMaskedNote] = useState(false)
  // `undefined` = this thread has no presence to report (every offer thread,
  // and the operator's own view). Distinct from `false`, which is „nobody is at
  // the desk" and IS shown.
  const [online, setOnline] = useState<boolean | undefined>(undefined)
  /** 'open' = the room's stream is delivering; 'down' = poll. Starts down, so a
   *  pane with no room to join (no `refCode`) simply keeps polling. */
  const [live, setLive] = useState<LiveState>('down')
  /** ⚠️ THE FIREWALL'S STATE, ANSWERED BY THE ENDPOINT (never derived here).
   *  True once this offer is the accepted one, which is the same moment
   *  /api/request-chat stops scrubbing numbers out of what is sent. `undefined`
   *  on a thread that has not loaded, and on the platform thread, which has no
   *  such gate — so the line only ever appears where it is a fact. */
  const [contactOpen, setContactOpen] = useState<boolean | undefined>(undefined)
  const endRef = useRef<HTMLDivElement | null>(null)
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  /** The transcript we last held, as „how many, ending in which id". Only a
   *  CHANGE is worth telling the rest of the app about — see the dispatch. */
  const sigRef = useRef<string | null>(null)
  // The collapsible transcript, so the toggle below can point at it.
  const bodyId = useId()

  const { url, keys } = endpointOf(thread)
  const qs = new URLSearchParams(keys).toString()
  const refCode = thread.refCode

  const load = useCallback(async (scroll = false) => {
    try {
      const r = await fetch(`${url}?${qs}`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) return
      setMsgs(j.messages)
      setClosedReason(j.open ? null : j.closedReason)
      setOnline(j.online)
      setContactOpen(j.contactOpen)
      /* ⚠️ THE EVENT NOBODY WAS FIRING (2026-09-01).
         components/chat/ConversationList says in its own header that it reloads
         „on the `mcodne:threads-refresh` window event the thread pane fires
         after sends/receives", and lib/messagesUnread — the header badge and
         the rail pill — listens for the same one. Grepped the tree: the ONLY
         dispatcher was that list's own „თავიდან" retry button. So the contract
         had a subscriber on each side and no publisher at all, and the cost was
         paid on the screen where it shows most: send a message and the row
         beside it keeps the old preview, the old time and the old position for
         up to twenty seconds; open a thread and the unread badge in the header
         survives for up to ninety.
         Fired on a CHANGE, not on every poll — a signature the poll can compare
         — so a quiet thread costs the inbox nothing. A send lands here too, via
         its own `load`, which is why `send` has no dispatch of its own.
         ⚠️ AND IT IS ONLY HALF THE FIX TODAY. The two listeners re-read
         /api/{me,work}/threads with a bare `fetch`, and neither route sends a
         `Cache-Control` header, so the browser may answer that read out of its
         own http cache — walked it on 2026-09-01 and the row kept its old
         preview even with this event arriving. The other half is `no-store` on
         those two reads (or the header on the routes); this side is right
         either way, and the 20s poll is what covers the gap meanwhile. */
      const sig = `${j.messages.length}:${j.messages.at(-1)?.id ?? ''}`
      if (sigRef.current !== sig) {
        sigRef.current = sig
        window.dispatchEvent(new Event('mcodne:threads-refresh'))
      }
      if (scroll) requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'nearest' }))
    } catch { /* a failed poll is a poll that tries again */ }
  }, [url, qs])

  /* ⚠️ THE FIELD GROWS WITH WHAT IS IN IT (2026-09-01). The composer has
     accepted line breaks since it was written — that is the argued reason it is
     a `textarea` and not an `<input>`, and the bubbles render them — but it was
     drawn at a fixed 48px, so the second line of a three-line message scrolled
     out of sight as it was typed. A field that takes a paragraph and shows one
     line of it is not the artboard's single-line field, it is a one-line window
     onto a paragraph. Capped at 120px (≈4 lines) so the transcript keeps the
     column; past that the field scrolls, which is the right loser. */
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [body])

  // The stream, while the pane is open and holds the reference. The event is a
  // nudge, never the messages — the pane reads them back through its own
  // endpoint. Scrolls to the newest, the way a reply arriving in a chat does.
  useEffect(() => {
    if (!open || !refCode) return
    return subscribeRequestLive(refCode, {
      onMessages: () => { load(true) },
      onState: setLive,
    })
  }, [open, refCode, load])

  // The fallback: the first read and the poll, while the stream is down. Same
  // visibility-aware contract as AutoRefresh, stopped the moment the pane is
  // closed. The stream reports 'down' until its socket opens, so this is also
  // what paints the pane first; once 'open', the route's first event is the
  // catch-up and the timer never starts.
  useEffect(() => {
    if (!open || live === 'open') return
    load(true)
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [open, live, load])

  // Takes anything with a `preventDefault` rather than a `React.FormEvent`: the
  // pane's composer also sends on Enter, and that event is a KeyboardEvent.
  const send = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    const text = body.trim()
    if (!text || busy) return
    setBusy(true); setError(null); setMaskedNote(false)
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The same keys the GET addressed the thread with — one derivation, so
        // a pane cannot read one conversation and write to another.
        body: JSON.stringify({ ...keys, body: text }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) { setError(errText(j?.error)); return }
      setBody('')
      // Told, never silent: the sentence went, a number in it did not.
      if (j.masked) setMaskedNote(true)
      await load(true)
    } catch {
      setError(errText())
    } finally {
      setBusy(false)
    }
  }

  // The newest message of MINE the other side has read. Derived here rather
  // than stored: the endpoint already answers `readByOther` per message, so the
  // last one carrying it IS the read mark, and nothing has to be kept in sync.
  const lastReadMineId = msgs?.filter(m => m.mine && m.readByOther).at(-1)?.id ?? null

  /* ── THE TRANSCRIPT, BUILT ONCE ───────────────────────────────────────────
     Bubbles with a „დღეს" / „გუშინ" / „24 აგვ" pill wherever the calendar day
     changes — the artboard's separator. Built here rather than inside each
     layout, so the two can never disagree about where a day starts.

     No per-bubble clock, and that is the artboard's decision rather than an
     omission: a time under every line in a four-message thread is noise, and a
     day is the unit somebody actually looks for. The exact moment stays on the
     element's `title`, which costs nothing and answers the rare question. */
  const now = new Date()
  const transcript: React.ReactNode[] = []
  {
    let lastDay = ''
    for (const m of msgs ?? []) {
      const at = new Date(m.createdAt)
      const day = fmtKaDayLabel(at, now)
      if (day !== lastDay) {
        transcript.push(<DayPill key={`day-${m.id}`} label={day} />)
        lastDay = day
      }
      transcript.push(
        <div key={m.id} className={`flex flex-col ${m.mine ? 'items-end' : 'items-start'}`} title={fmtKaDateTime(at)}>
          <Bubble text={m.body} mine={m.mine} />
          {/* ⚠️ ONCE, UNDER THE LAST ONE — not on every bubble (2026-08-21).
              The receipt used to be rendered inside each of my read bubbles, so
              a ten-message morning printed „წაკითხულია" ten times and the word
              stopped being read. „Read up to here" is what the reader actually
              wants, and one line at the bottom says it; it is also what every
              messenger they already use does. OUTSIDE the bubble in ink-500
              rather than white-on-brand: the canon measures a second white tier
              on a brand fill as failing contrast at every opacity. */}
          {m.mine && m.readByOther && m.id === lastReadMineId && (
            <span className="mt-0.5 text-micro text-ink-500">წაკითხულია</span>
          )}
        </div>,
      )
    }
  }

  /* ── THE FULL-COLUMN LAYOUT — the owner's artboard ────────────────────────
     Transcript on the cream ground, composer welded to the bottom edge. It
     never collapses and draws no header: the pane above it (components/chat/
     OfferThreadPane) carries the name, the price and the way back to the job. */
  if (pane) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto bg-ink-50 px-4 sm:px-5 py-5 flex flex-col gap-3">
          {msgs === null && <p className="self-center text-small text-ink-500">იტვირთება…</p>}
          {msgs?.length === 0 && (
            <p className="self-center max-w-[320px] text-center text-small text-ink-500">
              {emptyHint ?? 'დასვი კითხვა — ტელეფონის ნომრის გაზიარების გარეშე.'}
            </p>
          )}
          {transcript}
          {/* ⚠️ A STATE, NOT A RECEIPT. The artboard's line here reads
              „კონტაქტი გახსნილია · ბალანსიდან ჩამოიჭრა 1₾" — the second half is
              a number nothing on this platform charges or records (an offer
              costs credits when it is SENT; reading a thread costs nothing, and
              lib/offerEvents says in as many words that the price is 0 today).
              So the fact stays and the figure goes: what this says is exactly
              what the endpoint does — after acceptance `maskContacts` stops
              scrubbing, so a number may finally be typed here. */}
          {contactOpen === true && (
            <div className="self-center mt-1 px-4 py-3 rounded-tile bg-brand-50 border border-brand-100 text-small font-semibold text-brand-800 text-center">
              კონტაქტი გახსნილია — ნომრები აქვე გაცვალეთ
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="shrink-0 border-t border-ink-100 bg-white px-4 sm:px-5 py-3.5">
          {closedReason ? (
            <p className="text-small text-ink-500 text-center">{closedReason}</p>
          ) : (
            <>
              {/* `items-end`, not `items-center`: the field grows upward from
                  the baseline it shares with the button (see the auto-grow
                  effect), so the send control stays welded to the bottom edge
                  instead of drifting to the middle of a four-line draft. At one
                  line — the artboard's state — the two are identical. */}
              <form onSubmit={send} className="flex items-end gap-2.5">
                {/* A `textarea`, drawn as the artboard's single-line field.
                    ⚠️ IT IS NOT AN `<input>`, deliberately: the composer has
                    accepted line breaks since it was written and the bubbles
                    render them (`whitespace-pre-wrap`), so an input would have
                    quietly removed a capability to match a drawing. Enter
                    sends, Shift+Enter breaks the line — what every messenger
                    the reader already uses does. */}
                <textarea
                  ref={taRef}
                  rows={1}
                  maxLength={2000}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e) }
                  }}
                  placeholder="დაწერე შეტყობინება"
                  aria-label="შეტყობინება"
                  className="flex-1 min-w-0 min-h-[48px] max-h-[120px] px-4 py-[13px] rounded-field border border-ink-200 bg-white text-body text-ink-900 placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none resize-none transition-colors duration-fast"
                />
                <button
                  type="submit"
                  disabled={busy || body.trim() === ''}
                  aria-busy={busy}
                  aria-label="გაგზავნა"
                  className="shrink-0 h-12 w-12 rounded-field bg-brand-700 hover:bg-brand-800 active:bg-brand-900 text-white inline-flex items-center justify-center transition-colors duration-fast motion-safe:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-400 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {busy
                    ? <span aria-hidden className="motion-safe:animate-spin inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent" />
                    : <Icon.send className="w-[19px] h-[19px]" />}
                </button>
              </form>
              {online !== undefined && (
                <p className="mt-1.5 text-meta text-ink-500">{presenceHint(online)}</p>
              )}
              {maskedNote && (
                <p className="mt-1.5 text-meta text-warning-700">
                  ნომერი და ელფოსტა დაიმალა — კონტაქტი არჩევის შემდეგ იხსნება.
                </p>
              )}
              {/* `role="alert"` — a send that failed is the one thing on this
                  pane a person MUST be told about, and a plain <p> appearing
                  in a live region-less corner is told to nobody using a screen
                  reader. The composer itself is not marked invalid: the text
                  they typed is fine, the send is what failed. */}
              {error && <p role="alert" className="mt-1.5 text-meta text-danger-700">{error}</p>}
            </>
          )}
        </div>
      </div>
    )
  }

  if (!open) {
    return (
      /* ⚠️ IT NAMES ITS PEER, LIKE THE OPEN STATE (2026-09-01). The label was
         the bare word „მიმოწერა" — and on /request/<ref> that word is on the
         screen twice: once as this toggle, which opens the thread with US, and
         once over the offer conversation with the PROVIDER, which is already
         expanded a few hundred pixels above with a composer of its own. Two
         identical invitations to write, no way to tell which one reaches whom.
         The information was never missing — `peerName` is passed in from both
         call sites — only dropped: the OPEN header a few lines down has always
         rendered „მიმოწერა · {peerName}", so this is that same expression, not
         a new sentence.
         ⚠️ AND IT IS A TAP TARGET NOW. It was a bare underlined 20px line of
         text, four pixels of glyph either side of the baseline, and it is the
         ONLY way into a conversation that is collapsed by default (CLAUDE.md,
         „anything tappable is ≥40px"). */
      <button
        type="button"
        onClick={() => setOpen(true)}
        // `aria-expanded` alone, no `aria-controls`: while collapsed there is
        // no transcript in the document for an id to point at.
        aria-expanded={false}
        className="mt-4 -mx-2 px-2 min-h-[40px] inline-flex items-center gap-2 text-small font-display font-semibold text-brand-700 underline underline-offset-2 rounded-btn hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-400 transition-colors duration-fast"
      >
        მიმოწერა{peerName ? ` · ${peerName}` : ''}
        {unread > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-pill inline-flex items-center justify-center text-meta font-bold tabular-nums bg-brand-600 text-white">
            {unread}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="mt-4 pt-4 border-t border-ink-100">
      <div className="flex items-center justify-between gap-3">
        <span className="text-small font-display font-semibold text-ink-800">
          მიმოწერა{peerName ? ` · ${peerName}` : ''}
        </span>
        {/* ── Is anybody at the desk ─────────────────────────────────────────
            Shown only where it is answerable — `online` is undefined on every
            offer thread, and „ონლაინ" about a single expert would be a claim
            nothing measures. The dot is NOT a status dot in the banned sense
            (canon: no decorative status dots); it is the entire content of the
            indicator, carrying a fact the words then name — and the words are
            always there, so nobody has to decode a colour. */}
        {online !== undefined && (
          <span className="inline-flex items-center gap-1.5 text-meta text-ink-600">
            <span
              aria-hidden
              className={`w-1.5 h-1.5 rounded-pill ${online ? 'bg-brand-600' : 'bg-ink-300'}`}
            />
            {presenceLabel(online)}
          </span>
        )}
        {!defaultOpen && (
          // The other half of the same control, and the same 40px floor: it was
          // a 16px line of text, which on a phone is a miss more often than a
          // press.
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-expanded
            aria-controls={bodyId}
            className="-mx-2 px-2 min-h-[40px] inline-flex items-center text-meta font-semibold text-ink-500 hover:text-ink-800 underline underline-offset-2 rounded-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-400 transition-colors duration-fast"
          >
            დახურვა
          </button>
        )}
      </div>

      {/* The newest message of MINE the other side has read — the one row that
          carries the receipt. Null when they are behind, which is the state
          that must show nothing at all rather than „unread": this platform
          never claims to know what somebody has not done. */}
      <div id={bodyId} className="mt-3 max-h-72 overflow-y-auto flex flex-col gap-2 pr-1">
        {msgs === null && <p className="text-small text-ink-500">იტვირთება…</p>}
        {msgs?.length === 0 && (
          <p className="text-small text-ink-500">
            {emptyHint ?? 'დასვი კითხვა — ტელეფონის ნომრის გაზიარების გარეშე.'}
          </p>
        )}
        {/* ⚠️ THE SAME NODES THE PANE RENDERS (2026-08-31). The bubbles used to
            be spelled out here — `rounded-card`, `max-w-[85%]`, brand-600 — and
            a second spelling of them landed the day the artboard did. One
            builder, above; only the SCROLL BOX differs between the layouts. */}
        {transcript}
        <div ref={endRef} />
      </div>

      {closedReason ? (
        <p className="mt-3 text-small text-ink-500">{closedReason}</p>
      ) : (
        <form onSubmit={send} className="mt-3">
          <textarea
            rows={2}
            maxLength={2000}
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="დაწერე შეტყობინება"
            // The same label the pane's composer carries. A placeholder is not
            // a label — it is gone the moment the field has anything in it, and
            // a screen reader landing on a half-typed message heard „edit
            // text" and nothing else.
            aria-label="შეტყობინება"
            className="w-full px-3.5 py-2.5 rounded-field border border-ink-200 bg-white text-body text-ink-900 placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none resize-y transition-colors duration-fast"
          />
          {/* ⚠️ The offline half is a PROMISE and it has to stay true: the
              endpoint mails the operator inbox on every client message, which
              is the only reason „გიპასუხებთ" is not wishful. See
              lib/requestThread → presenceHint. */}
          {online !== undefined && (
            <p className="mt-1.5 text-meta text-ink-500">{presenceHint(online)}</p>
          )}
          {maskedNote && (
            <p className="mt-1.5 text-meta text-warning-700">
              ნომერი და ელფოსტა დაიმალა — კონტაქტი არჩევის შემდეგ იხსნება.
            </p>
          )}
          {error && <p role="alert" className="mt-1.5 text-meta text-danger-700">{error}</p>}
          <div className="mt-2">
            <Btn type="submit" size="sm" disabled={busy || body.trim() === ''} aria-busy={busy}>
              {busy ? 'იგზავნება…' : 'გაგზავნა'}
            </Btn>
          </div>
        </form>
      )}
    </div>
  )
}

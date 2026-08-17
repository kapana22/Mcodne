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
// AutoRefresh, and stopped the moment the pane is closed.

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

import { useCallback, useEffect, useRef, useState } from 'react'
import { Btn } from '@/components/Btn'
import { presenceLabel, presenceHint } from '@/lib/requestThread'

type Msg = { id: string; mine: boolean; body: string; createdAt: string; readByOther: boolean }

/**
 * Which conversation this pane is showing.
 *
 * `OFFER` — the client and one provider, keyed by the offer. The client proves
 *           themselves with `refCode`; the provider is their session.
 * `PLATFORM` — the client and us. The client proves themselves with `refCode`;
 *           an operator passes `requestId` and is their ADMIN session.
 */
export type ThreadRef =
  | { kind: 'OFFER'; offerId: string; refCode?: string }
  | { kind: 'PLATFORM'; refCode?: string; requestId?: string }

const POLL_MS = 15_000

/** Server codes → Georgian. Never surface a raw code to a reader. */
function errText(code?: string): string {
  switch (code) {
    case 'CLOSED': return 'მიმოწერა დახურულია.'
    case 'INVALID': return 'შეტყობინება ცარიელია.'
    default: return 'ვერ გაიგზავნა — სცადე თავიდან.'
  }
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
  thread, unread = 0, peerName, defaultOpen = false, emptyHint,
}: {
  thread: ThreadRef
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
  const [open, setOpen] = useState(defaultOpen)
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
  const endRef = useRef<HTMLDivElement | null>(null)

  const { url, keys } = endpointOf(thread)
  const qs = new URLSearchParams(keys).toString()

  const load = useCallback(async (scroll = false) => {
    try {
      const r = await fetch(`${url}?${qs}`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) return
      setMsgs(j.messages)
      setClosedReason(j.open ? null : j.closedReason)
      setOnline(j.online)
      if (scroll) requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'nearest' }))
    } catch { /* a failed poll is a poll that tries again */ }
  }, [url, qs])

  useEffect(() => {
    if (!open) return
    load(true)
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [open, load])

  const send = async (e: React.FormEvent) => {
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

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center gap-2 text-small font-display font-semibold text-brand-700 underline underline-offset-2"
      >
        მიმოწერა
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
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-meta font-semibold text-ink-500 underline underline-offset-2"
          >
            დახურვა
          </button>
        )}
      </div>

      <div className="mt-3 max-h-72 overflow-y-auto space-y-2 pr-1">
        {msgs === null && <p className="text-small text-ink-500">იტვირთება…</p>}
        {msgs?.length === 0 && (
          <p className="text-small text-ink-500">
            {emptyHint ?? 'დასვი კითხვა — ტელეფონის ნომრის გაზიარების გარეშე.'}
          </p>
        )}
        {msgs?.map(m => (
          <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-card px-3.5 py-2 text-body leading-relaxed whitespace-pre-wrap ${
                m.mine ? 'bg-brand-600 text-white' : 'bg-ink-75 text-ink-900'
              }`}
            >
              {m.body}
              {m.mine && m.readByOther && (
                // On brand-600 a second white tier fails contrast at every
                // opacity (the canon states the measurement), so the receipt
                // is carried by SIZE, at full white.
                <span className="block text-micro text-white mt-0.5">წაკითხულია</span>
              )}
            </div>
          </div>
        ))}
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
          {error && <p className="mt-1.5 text-meta text-danger-700">{error}</p>}
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

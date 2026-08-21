'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { lastReadMessageId } from '@/lib/chatRead'
import { Avatar } from '@/components/Avatar'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { fmtDateTime as fmtInTz, userTimezone, TBILISI } from '@/lib/tz'
import { safeStoredFileUrl } from '@/lib/safeUrl'
import { fmtKaDate } from '@/lib/kaDate'
import { sanitizeMsgBody, MSG_MAX_LEN } from '@/lib/msgText'
import { useBookingThread, type ChatMessage, type ChatUser, type ThreadBooking, type ThreadPair, type ThreadPre } from './useBookingThread'
import { CallInviteCard } from './CallInviteCard'

type BookingChatProps = {
  /** Booking-scoped thread. Provide EITHER bookingId or withUser (not both). */
  bookingId?: string
  /** Pre-booking pair thread — the other user's id. Drives ?withUser / toUserId. */
  withUser?: string
  me: ChatUser | null
  /** Avatar/name fallback for the other party before the first poll lands. */
  counterparty?: ChatUser | null
  /** Seed messages (booking detail already fetched them with the booking). */
  initialMessages?: ChatMessage[]
  /** embedded = card with a capped scroll area (booking detail);
      fill = flex column that fills its parent's height (messages center). */
  variant?: 'embedded' | 'fill'
  /** Optional custom header: a node, or a render function that receives the
      booking summary, the pair summary, and (booking mode) the earlier
      pre-booking thread with the same partner, from the thread GET. The embedded
      default renders the classic "მიმოწერა კლიენტთან · N" bar; pass null to
      hide entirely. */
  header?: React.ReactNode | ((booking: ThreadBooking | null, pair: ThreadPair | null, preThread: ThreadPre | null) => React.ReactNode)
  /** Override the empty-thread copy (the default is client-facing). */
  emptyState?: { title: string; body: string }
  /** Fired after a successful send and when polling brings new messages —
      callers refresh adjacent surfaces (inbox list, router cache). */
  onActivity?: () => void
  autoFocus?: boolean
  className?: string
}

const fmtTime = (iso: string, tz: string) => {
  const { local } = fmtInTz(iso, { hour: '2-digit', minute: '2-digit' }, tz)
  return local
}

function MessageBubble({
  m, mine, tz, groupedWithPrev, groupedWithNext, avatarSrc,
}: {
  m: ChatMessage
  mine: boolean
  tz: string
  groupedWithPrev: boolean
  groupedWithNext: boolean
  /** Sender avatar resolved from the thread participants (avatars are no longer
      embedded per message). Falls back to any avatar on the message itself
      (optimistic bubbles carry `me`'s). */
  avatarSrc?: string | null
}) {
  const senderAvatar = avatarSrc ?? m.from.avatarUrl
  // Never render an attachment href with an unsafe scheme (guards legacy rows
  // predating the server-side scheme check). Uses the STORED-file guard — the
  // same allow-list POST /api/messages enforces — so an inline PDF renders as
  // the file/download row below instead of silently disappearing, while
  // `mailto:`/relative/`javascript:` values stay non-navigable.
  const safeFile = safeStoredFileUrl(m.fileUrl)

  // Instant-call invite (fileName sentinel) → a join card, not a normal bubble.
  if (m.fileName === '__call__') {
    return (
      <div className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'} ${groupedWithPrev ? 'mt-1' : 'mt-3'}`}>
        {!mine && (groupedWithPrev
          ? <span className="w-7 shrink-0" aria-hidden />
          : <Avatar src={senderAvatar ?? undefined} name={m.from.fullName} size={28} />)}
        <CallInviteCard fileUrl={m.fileUrl} fromName={m.from.fullName} mine={mine} time={fmtTime(m.createdAt, tz)} />
      </div>
    )
  }

  return (
    <div className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'} ${groupedWithPrev ? 'mt-1' : 'mt-3'}`}>
      {!mine && (groupedWithPrev
        ? <span className="w-7 shrink-0" aria-hidden />
        : <Avatar src={senderAvatar ?? undefined} name={m.from.fullName} size={28} />)}
      <div className={`max-w-[85%] sm:max-w-[75%] rounded-card px-3 py-2 text-body ${mine ? 'bg-brand-600 text-white shadow-xs' : 'bg-white border border-ink-200 text-ink-800 shadow-xs'}`}>
        <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{sanitizeMsgBody(m.body)}</div>
        {safeFile && (
          <div className={`mt-2 pt-2 border-t ${mine ? 'border-white/25' : 'border-ink-200'}`}>
            {safeFile.startsWith('data:image/') ? (
              <a href={safeFile} target="_blank" rel="noopener noreferrer" className="block">
                <img src={safeFile} alt={m.fileName ?? 'attachment'} className="max-h-[200px] rounded-md object-cover" />
                {m.fileName && <div className={`mt-1 text-meta ${mine ? 'text-white' : 'text-ink-500'} font-mono truncate`}>{m.fileName}</div>}
              </a>
            ) : (
              <a
                href={safeFile}
                target="_blank"
                rel="noopener noreferrer"
                download={m.fileName ?? undefined}
                className={`inline-flex items-center gap-2 text-small ${mine ? 'text-white hover:text-white' : 'text-brand-700 hover:text-brand-800'} font-display font-semibold underline underline-offset-2 decoration-dotted`}
              >
                <Icon.paperclip className="w-3.5 h-3.5" />
                {m.fileName ?? 'ფაილი'}
              </a>
            )}
          </div>
        )}
        {!groupedWithNext && (
          <div className={`text-meta mt-1 font-mono tabular-nums ${mine ? 'text-white/70' : 'text-ink-400'}`}>{fmtTime(m.createdAt, tz)}</div>
        )}
      </div>
    </div>
  )
}

export function BookingChat({
  bookingId,
  withUser,
  me,
  counterparty,
  initialMessages,
  variant = 'embedded',
  header,
  emptyState,
  onActivity,
  autoFocus = false,
  className = '',
}: BookingChatProps) {
  const {
    msgs, booking, pair, preThread, loaded, draft, setDraft, attachment, setAttachment, attach,
    uploading, send, sending, requestCall, calling, error, peerReadAt,
  } = useBookingThread({ bookingId, withUser, me, initialMessages, onActivity })

  /* ⚠️ „წაკითხულია", WHICH THIS CHAT NEVER HAD (2026-08-21). Owner: „დამატე
     ნახვის ფუნქცია, რომ მომხმარებელმა ნახა მესიჯი." The column has been written
     all along — `Message.readAt`, stamped when the recipient opens the thread,
     and already spent on the inbox's unread badges — so nothing new is stored;
     what was missing was the SENDER ever being told.

     ONE LINE, UNDER THE LAST MESSAGE OF MINE THEY HAVE READ. Not a tick on
     every bubble: the receipt that matters is „read up to here", and repeating
     it down the thread turns a fact into wallpaper. Same shape as the offer
     chat's (components/RequestChat), so the two conversations on this platform
     say it the same way.

     The mark is a TIMESTAMP rather than a flag per row, because the poll is
     incremental — see the note in useBookingThread. An optimistic `tmp-` bubble
     has a client clock in `createdAt`; it can only ever be NEWER than the
     server's stamp, so it never shows a receipt it has not earned. */
  const lastReadMineId = useMemo(
    () => lastReadMessageId(msgs, me?.id, peerReadAt),
    [msgs, peerReadAt, me?.id],
  )

  // Sender avatars, resolved once from the thread's two participants — the API
  // no longer embeds an avatar on every message (that repetition made payloads
  // multi-MB). `counterparty` seeds the other party before the first poll lands.
  const avatarOf = useMemo(() => {
    const map = new Map<string, string | null | undefined>()
    if (me) map.set(me.id, me.avatarUrl)
    if (counterparty) map.set(counterparty.id, counterparty.avatarUrl)
    if (booking) { map.set(booking.student.id, booking.student.avatarUrl); map.set(booking.tutorUser.id, booking.tutorUser.avatarUrl) }
    if (pair) map.set(pair.otherUser.id, pair.otherUser.avatarUrl)
    return map
  }, [me, counterparty, booking, pair])

  const endRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  // Detect user's browser tz on mount; SSR/first paint uses Tbilisi.
  const [tz, setTz] = useState<string>(TBILISI)
  useEffect(() => { setTz(userTimezone()) }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [msgs.length])

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus()
  }, [autoFocus, bookingId, withUser])

  // Full-screen thread: the composer owns the bottom of the viewport, so lift
  // the cookie banner above it (reuse the shared `data-mobile-cta` signal that
  // globals.css already uses to raise the banner over bottom bars). Without this
  // the banner covers the composer on a first visit and blocks sending the very
  // first message. Only for the `fill` variant — `embedded` sits inside a page
  // that has its own bottom chrome.
  useEffect(() => {
    if (variant !== 'fill') return
    // „lift" (not „1") — the composer is IN FLOW, not fixed, so it needs the
    // banner lift but NOT the body bottom-reserve that „1" adds for fixed bars;
    // „1" here left a ~124px blank tail under every thread. See globals.css.
    document.body.setAttribute('data-mobile-cta', 'lift')
    return () => { document.body.removeAttribute('data-mobile-cta') }
  }, [variant])

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    void send()
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const fill = variant === 'fill'

  const defaultHeader = (
    <div className="px-5 sm:px-6 py-4 border-b border-ink-100 flex items-center justify-between">
      <div className="font-display text-body-lg font-bold tracking-tight text-ink-900">მიმოწერა კლიენტთან</div>
      {msgs.length > 0 && (
        <div className="text-meta text-ink-400 tabular-nums">{msgs.length} შეტყობინება</div>
      )}
    </div>
  )

  return (
    <div
      className={
        fill
          ? `flex flex-col min-h-0 h-full ${className}`
          : `rounded-card border border-ink-200 bg-white shadow-xs overflow-hidden ${className}`
      }
    >
      {header === undefined
        ? (fill ? null : defaultHeader)
        : typeof header === 'function' ? header(booking, pair, preThread) : header}

      <div className={`${fill ? 'flex-1 min-h-0' : 'max-h-[420px] min-h-[220px]'} overflow-y-auto p-4 sm:p-6 bg-ink-50/40`}>
        {!loaded && msgs.length === 0 ? (
          <div className="space-y-3 py-2" aria-busy="true">
            {[62, 44, 74].map((w, i) => (
              <div key={i} className={`h-9 rounded-card bg-ink-100/80 motion-safe:animate-pulse ${i % 2 ? 'ml-auto' : ''}`} style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : msgs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-8">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-brand-50 text-brand-700 mb-3">
              <Icon.chat className="w-5 h-5" />
            </span>
            <div className="font-display text-body font-semibold text-ink-800">{emptyState?.title ?? 'მიმოწერა ჯერ არ არის'}</div>
            <p className="text-small text-ink-500 mt-1 max-w-[340px] mx-auto">
              {emptyState?.body ?? 'მიესალმე ან დააზუსტე დეტალები.'}
            </p>
          </div>
        ) : (
          msgs.map((m, i) => {
            const mine = !!me?.id && m.fromId === me.id
            const d = new Date(m.createdAt)
            const prev = i > 0 ? msgs[i - 1] : null
            const next = i < msgs.length - 1 ? msgs[i + 1] : null
            // Day separator when the calendar date flips; bubbles then only
            // carry the time. Runs from the same sender within 5 minutes
            // collapse into one group: avatar first, timestamp last.
            const newDay = !prev || new Date(prev.createdAt).toDateString() !== d.toDateString()
            const GROUP_MS = 5 * 60_000
            const groupedWithPrev = !newDay && !!prev && prev.fromId === m.fromId &&
              d.getTime() - new Date(prev.createdAt).getTime() < GROUP_MS
            const groupedWithNext = !!next && next.fromId === m.fromId &&
              new Date(next.createdAt).getTime() - d.getTime() < GROUP_MS &&
              new Date(next.createdAt).toDateString() === d.toDateString()
            return (
              <div key={m.id}>
                {newDay && (
                  <div className={`flex items-center gap-3 py-1 ${i > 0 ? 'mt-4' : ''}`} aria-hidden>
                    <span className="flex-1 h-px bg-ink-200/70" />
                    <Eyebrow as="span" tone="muted">{fmtKaDate(d)}</Eyebrow>
                    <span className="flex-1 h-px bg-ink-200/70" />
                  </div>
                )}
                <MessageBubble m={m} mine={mine} tz={tz} groupedWithPrev={groupedWithPrev} groupedWithNext={groupedWithNext} avatarSrc={avatarOf.get(m.fromId)} />
                {m.id === lastReadMineId && (
                  <div className="mt-0.5 text-right text-micro text-ink-500">წაკითხულია</div>
                )}
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <div className="px-4 py-2 bg-danger-50 border-t border-danger-200 text-danger-700 text-small" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="p-3 sm:p-4 border-t border-ink-100 bg-white flex flex-col gap-2">
        <input
          ref={fileInputRef}
          type="file"
          // sr-only does NOT mean „invisible to assistive tech" — the input is
          // still reachable and was announced as an unnamed file field. The
          // visible trigger is a separate button, so the name has to be stated
          // here explicitly.
          aria-label="ფაილის მიმაგრება"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={e => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void attach(f)
          }}
          className="sr-only"
        />
        {attachment && (
          <div className="flex items-center gap-2 rounded-btn border border-ink-200 bg-ink-50/40 px-3 py-2 text-small">
            <Icon.paperclip className="w-3.5 h-3.5 text-ink-500 shrink-0" />
            <span className="flex-1 truncate font-display font-semibold text-ink-800">{attachment.name}</span>
            <span className="font-mono text-meta text-ink-500 tabular-nums shrink-0">{(attachment.size / 1024).toFixed(0)} KB</span>
            {/* `.tap-area` keeps the 32px box (it sits in a one-line file row
                next to the name and size) while giving the finger ≥40px. */}
            <button type="button" onClick={() => setAttachment(null)} aria-label="ფაილის მოხსნა" className="tap-area w-8 h-8 shrink-0 rounded-btn hover:bg-ink-100 text-ink-500 hover:text-danger-600 inline-flex items-center justify-center">
              <Icon.x className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {/* One cohesive composer surface: the ghost icon actions and the send
            button live INSIDE the input pill so nothing overflows the row and
            the whole bar reads as a single control (focus ring on the wrapper,
            not per-field). */}
        <div className="flex items-end gap-1 rounded-2xl border border-ink-200 bg-white pl-1.5 pr-1.5 py-1.5 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-400/25 transition-colors duration-fast">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-busy={uploading}
            aria-label="ფაილის მიბმა"
            // Two numbers because they genuinely differ: a photo is downscaled
            // server-side, a PDF is stored byte-for-byte and hits the API's
            // stored-URL ceiling far sooner (see MAX_STORED_URL_CHARS).
            title="ფაილის მიბმა (PDF/JPG/PNG · სურათი მაქს. 8 MB, PDF მაქს. 2 MB)"
            className="h-10 w-10 rounded-full text-ink-500 hover:text-ink-900 hover:bg-ink-100 disabled:opacity-50 inline-flex items-center justify-center transition-colors duration-fast shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            {uploading ? <span aria-hidden className="inline-block w-4 h-4 border-2 border-ink-500 border-t-transparent rounded-full motion-safe:animate-spin" /> : <Icon.paperclip className="w-4 h-4" />}
          </button>
          {/* Instant „let's meet now“ call — booking threads only, and ONLY the
              expert can start it (the student joins, never initiates). */}
          {bookingId && booking && me?.id === booking.tutorUser?.id && (
            <button
              type="button"
              onClick={requestCall}
              disabled={calling || !me}
              aria-busy={calling}
              aria-label="ვიდეოზარის დაწყება"
              title="დაიწყე ვიდეოზარი — კლიენტი შემოუერთდება"
              className="h-10 w-10 rounded-full text-brand-600 hover:text-brand-700 hover:bg-brand-50 disabled:opacity-50 inline-flex items-center justify-center transition-colors duration-fast shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              {calling ? <span aria-hidden className="inline-block w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full motion-safe:animate-spin" /> : <Icon.video className="w-4 h-4" />}
            </button>
          )}
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              // Autosize: grow with content up to ~5 lines, then scroll inside.
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 132)}px`
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            placeholder="შეტყობინება…"
            rows={1}
            maxLength={MSG_MAX_LEN}
            className="flex-1 min-w-0 min-h-[36px] max-h-[132px] resize-none bg-transparent border-0 px-2 py-1.5 text-body leading-relaxed text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-0"
          />
          {/* Icon-only send — matches the ghost actions' footprint, never
              overflows, and Enter also sends. Disabled until /api/me resolves
              (send() bails on me=null, which would swallow an early Enter). */}
          <button
            type="submit"
            disabled={!me || sending || uploading || (!draft.trim() && !attachment)}
            aria-busy={sending}
            aria-label="გაგზავნა"
            title="გაგზავნა"
            className="h-10 w-10 shrink-0 rounded-full bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 disabled:text-ink-500 text-white inline-flex items-center justify-center transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1"
          >
            {sending ? <span aria-hidden className="inline-block w-4 h-4 border-2 border-white/70 border-t-transparent rounded-full motion-safe:animate-spin" /> : <Icon.send className="w-4 h-4" />}
          </button>
        </div>
        {draft.length > MSG_MAX_LEN - 200 && (
          <div className={`text-right font-mono text-meta tabular-nums ${draft.length >= MSG_MAX_LEN ? 'text-danger-600' : 'text-ink-400'}`}>
            {draft.length} / {MSG_MAX_LEN}
          </div>
        )}
      </form>
    </div>
  )
}

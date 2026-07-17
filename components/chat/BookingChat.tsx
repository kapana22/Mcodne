'use client'
import { useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { fmtDateTime as fmtInTz, userTimezone, TBILISI } from '@/lib/tz'
import { safeHttpUrl } from '@/lib/safeUrl'
import { fmtKaDate } from '@/lib/kaDate'
import { sanitizeMsgBody, MSG_MAX_LEN } from '@/lib/msgText'
import { useBookingThread, type ChatMessage, type ChatUser, type ThreadBooking } from './useBookingThread'

export type BookingChatProps = {
  bookingId: string
  me: ChatUser | null
  /** Avatar/name fallback for the other party before the first poll lands. */
  counterparty?: ChatUser | null
  /** Seed messages (booking detail already fetched them with the booking). */
  initialMessages?: ChatMessage[]
  /** embedded = card with a capped scroll area (booking detail);
      fill = flex column that fills its parent's height (messages center). */
  variant?: 'embedded' | 'fill'
  /** Optional custom header: a node, or a render function that receives the
      booking summary from the thread GET (for context headers). The embedded
      default renders the classic "მიმოწერა კლიენტთან · N" bar; pass null to
      hide entirely. */
  header?: React.ReactNode | ((booking: ThreadBooking | null) => React.ReactNode)
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
  m, mine, tz, groupedWithPrev, groupedWithNext,
}: {
  m: ChatMessage
  mine: boolean
  tz: string
  groupedWithPrev: boolean
  groupedWithNext: boolean
}) {
  // Never render an attachment href with an unsafe scheme (guards legacy rows
  // predating the server-side scheme check).
  const safeFile = safeHttpUrl(m.fileUrl)
  return (
    <div className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'} ${groupedWithPrev ? 'mt-1' : 'mt-3'}`}>
      {!mine && (groupedWithPrev
        ? <span className="w-7 shrink-0" aria-hidden />
        : <Avatar src={m.from.avatarUrl ?? undefined} name={m.from.fullName} size={28} />)}
      <div className={`max-w-[85%] sm:max-w-[75%] rounded-card px-3 py-2 text-[13.5px] ${mine ? 'bg-brand-500 text-white' : 'bg-white border border-ink-200 text-ink-800'}`}>
        <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{sanitizeMsgBody(m.body)}</div>
        {safeFile && (
          <div className={`mt-2 pt-2 border-t ${mine ? 'border-white/25' : 'border-ink-200'}`}>
            {safeFile.startsWith('data:image/') ? (
              <a href={safeFile} target="_blank" rel="noopener noreferrer" className="block">
                <img src={safeFile} alt={m.fileName ?? 'attachment'} className="max-h-[200px] rounded-md object-cover" />
                {m.fileName && <div className={`mt-1 text-[11px] ${mine ? 'text-white/85' : 'text-ink-500'} font-mono truncate`}>{m.fileName}</div>}
              </a>
            ) : (
              <a
                href={safeFile}
                target="_blank"
                rel="noopener noreferrer"
                download={m.fileName ?? undefined}
                className={`inline-flex items-center gap-2 text-[12.5px] ${mine ? 'text-white hover:text-white' : 'text-brand-700 hover:text-brand-800'} font-display font-semibold underline underline-offset-2 decoration-dotted`}
              >
                <Icon.paperclip className="w-3.5 h-3.5" />
                {m.fileName ?? 'ფაილი'}
              </a>
            )}
          </div>
        )}
        {!groupedWithNext && (
          <div className={`text-[10.5px] mt-1 font-mono tabular-nums ${mine ? 'text-white/70' : 'text-ink-400'}`}>{fmtTime(m.createdAt, tz)}</div>
        )}
      </div>
    </div>
  )
}

export function BookingChat({
  bookingId,
  me,
  initialMessages,
  variant = 'embedded',
  header,
  onActivity,
  autoFocus = false,
  className = '',
}: BookingChatProps) {
  const {
    msgs, booking, loaded, draft, setDraft, attachment, setAttachment, attach,
    uploading, send, sending, error,
  } = useBookingThread({ bookingId, me, initialMessages, onActivity })

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
  }, [autoFocus, bookingId])

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    void send()
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const fill = variant === 'fill'

  const defaultHeader = (
    <div className="px-5 sm:px-6 py-4 border-b border-ink-100 flex items-center justify-between">
      <div className="font-display text-[15px] font-bold tracking-tight text-ink-900">მიმოწერა კლიენტთან</div>
      {msgs.length > 0 && (
        <div className="text-[11.5px] text-ink-400 tabular-nums">{msgs.length} შეტყობინება</div>
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
        : typeof header === 'function' ? header(booking) : header}

      <div className={`${fill ? 'flex-1 min-h-0' : 'max-h-[420px] min-h-[220px]'} overflow-y-auto p-4 sm:p-6 bg-ink-50/40`}>
        {!loaded && msgs.length === 0 ? (
          <div className="space-y-3 py-2" aria-busy="true">
            {[62, 44, 74].map((w, i) => (
              <div key={i} className={`h-9 rounded-card bg-ink-100/80 animate-pulse ${i % 2 ? 'ml-auto' : ''}`} style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : msgs.length === 0 ? (
          <div className="text-center py-8">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-brand-50 text-brand-700 mb-3">
              <Icon.chat className="w-5 h-5" />
            </span>
            <div className="font-display text-[13.5px] font-semibold text-ink-800">მიმოწერა ჯერ არ არის</div>
            <p className="text-[12.5px] text-ink-500 mt-1 max-w-[340px] mx-auto">
              მიესალმე კლიენტს ან დააზუსტე კონსულტაციის დეტალები — სწრაფი პასუხი ნდობას ზრდის.
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
                    <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">{fmtKaDate(d)}</span>
                    <span className="flex-1 h-px bg-ink-200/70" />
                  </div>
                )}
                <MessageBubble m={m} mine={mine} tz={tz} groupedWithPrev={groupedWithPrev} groupedWithNext={groupedWithNext} />
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <div className="px-4 py-2 bg-danger-50 border-t border-danger-200 text-danger-700 text-[12.5px]" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="p-3 sm:p-4 border-t border-ink-100 bg-white flex flex-col gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={e => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void attach(f)
          }}
          className="sr-only"
        />
        {attachment && (
          <div className="flex items-center gap-2 rounded-btn border border-ink-200 bg-ink-50/40 px-3 py-2 text-[12.5px]">
            <Icon.paperclip className="w-3.5 h-3.5 text-ink-500 shrink-0" />
            <span className="flex-1 truncate font-display font-semibold text-ink-800">{attachment.name}</span>
            <span className="font-mono text-[10.5px] text-ink-500 tabular-nums shrink-0">{(attachment.size / 1024).toFixed(0)} KB</span>
            <button type="button" onClick={() => setAttachment(null)} aria-label="ფაილის მოხსნა" className="w-6 h-6 rounded-btn hover:bg-ink-100 text-ink-500 hover:text-danger-600 inline-flex items-center justify-center">
              <Icon.x className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label="ფაილის მიბმა"
            title="ფაილის მიბმა (PDF/JPG/PNG · max 8 MB)"
            className="h-11 w-11 rounded-btn border border-ink-200 bg-white hover:border-ink-300 disabled:opacity-50 text-ink-600 hover:text-ink-900 inline-flex items-center justify-center transition-colors shrink-0"
          >
            {uploading ? <span className="inline-block w-4 h-4 border-2 border-ink-500 border-t-transparent rounded-full animate-spin" /> : <Icon.paperclip className="w-4 h-4" />}
          </button>
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
            placeholder={attachment ? 'დაწერე შეტყობინება ან უბრალოდ გააგზავნე ფაილი…' : 'დაწერე შეტყობინება…'}
            rows={1}
            maxLength={MSG_MAX_LEN}
            className="flex-1 min-h-[44px] max-h-[132px] resize-none rounded-btn border border-ink-200 px-3 py-2.5 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          {/* Also disabled until the caller's identity (/api/me) has resolved —
              send() bails on me=null, which would silently swallow an early
              Enter-press on the slow remote-DB dev setup. */}
          <Btn type="submit" variant="primary" size="md" disabled={!me || sending || uploading || (!draft.trim() && !attachment)}>
            {sending ? '…' : <><Icon.send className="w-4 h-4" /><span className="hidden sm:inline">გაგზავნა</span></>}
          </Btn>
        </div>
        {draft.length > MSG_MAX_LEN - 200 && (
          <div className={`text-right font-mono text-[10.5px] tabular-nums ${draft.length >= MSG_MAX_LEN ? 'text-danger-600' : 'text-ink-400'}`}>
            {draft.length} / {MSG_MAX_LEN}
          </div>
        )}
      </form>
    </div>
  )
}

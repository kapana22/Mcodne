'use client'
// Focused conversation view — /student/messages/[bookingId].
//
// The inbox used to deep-link into the booking-detail page, where chat sits
// below actions/receipt sections; on a phone that means scrolling past a wall
// of cards to reach the composer. This screen is the chat and nothing else:
// header (back · expert · booking link), messages, composer — full viewport.
// BottomNav hides itself on this route so the composer owns the bottom edge.
//
// Messaging mechanics mirror the booking-page chat pane deliberately:
// 15s visibility-gated poll of GET /api/messages?bookingId (which also stamps
// read receipts) and TRUE optimistic append with tmp-* reconcile on send.

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { Skeleton } from '@/components/Skeleton'
import { safeHttpUrl } from '@/lib/safeUrl'
import { sanitizeMsgBody, MSG_MAX_LEN, sendErrorText } from '@/lib/msgText'
import { fmtKaDate, fmtKaTime } from '@/lib/kaDate'

type MsgUser = { id: string; fullName: string; avatarUrl?: string | null }
type Msg = { id: string; body: string; fromId: string; createdAt: string; from: MsgUser; fileUrl?: string | null; fileName?: string | null }
type BookingLite = {
  id: string
  topic: string
  status: string
  tutor: { user: MsgUser }
  student: MsgUser
  messages: Msg[]
}

const CHAT_POLL_MS = 15_000

export default function StudentConversationPage() {
  const params = useParams<{ id: string }>()
  const bookingId = params?.id
  const [me, setMe] = useState<MsgUser | null>(null)
  const [booking, setBooking] = useState<BookingLite | null>(null)
  const [msgs, setMsgs] = useState<Msg[] | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [attachment, setAttachment] = useState<{ url: string; name: string; type: string; size: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!bookingId) return
    let cancelled = false
    ;(async () => {
      try {
        const [meRes, bRes] = await Promise.all([
          fetch('/api/me').then(r => r.json()).catch(() => null),
          fetch(`/api/bookings/${bookingId}`).then(r => (r.ok ? r.json() : null)).catch(() => null),
        ])
        if (cancelled) return
        setMe(meRes?.user ?? null)
        // GET /api/bookings/[id] returns the booking object spread at the top
        // level (not wrapped in { booking }).
        const bk: BookingLite | null = bRes?.id ? (bRes as BookingLite) : null
        if (!bk) { setLoadErr('საუბარი ვერ მოიძებნა') ; return }
        setBooking(bk)
        setMsgs(bk.messages ?? [])
      } catch {
        if (!cancelled) setLoadErr('ჩატვირთვა ვერ მოხერხდა')
      }
    })()
    return () => { cancelled = true }
  }, [bookingId])

  // Newest message stays in view.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs?.length])

  // Poll while visible; stamps read receipts server-side. Keeps in-flight
  // optimistic bubbles (tmp-*) that a poll must not wipe.
  useEffect(() => {
    if (!bookingId || !booking) return
    let cancelled = false
    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch(`/api/messages?bookingId=${bookingId}`)
        if (!res.ok || cancelled) return
        const j = await res.json().catch(() => null)
        if (!cancelled && j?.ok && Array.isArray(j.messages)) {
          setMsgs(prev => [...j.messages, ...(prev ?? []).filter(m => m.id.startsWith('tmp-'))])
        }
      } catch {}
    }
    tick()
    const t = setInterval(tick, CHAT_POLL_MS)
    return () => { cancelled = true; clearInterval(t) }
  }, [bookingId, !!booking])

  const pickFile = () => fileInputRef.current?.click()

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 8 * 1024 * 1024) { setErr('ფაილი 8 MB-ზე დიდია'); return }
    setUploading(true); setErr(null)
    try {
      const form = new FormData()
      form.append('file', f)
      form.append('kind', 'attachment')
      const res = await fetch('/api/uploads', { method: 'POST', body: form })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        setErr(j?.error === 'TOO_LARGE' ? 'ფაილი დიდია' : j?.error === 'BAD_TYPE' ? 'ფაილის ტიპი დაუშვებელია (PDF/JPG/PNG)' : 'ატვირთვა ვერ მოხერხდა')
        return
      }
      setAttachment({ url: j.url, name: j.fileName ?? f.name, type: f.type, size: f.size })
    } catch { setErr('ქსელის შეცდომა ატვირთვის დროს') }
    finally { setUploading(false) }
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!booking || (!text.trim() && !attachment) || sending) return
    setSending(true); setErr(null)
    try {
      const body: any = {
        bookingId: booking.id,
        body: text.trim() || (attachment ? `📎 ${attachment.name}` : ''),
      }
      if (attachment) { body.fileUrl = attachment.url; body.fileName = attachment.name }
      const tempId = `tmp-${Date.now()}`
      const sentText = text
      const sentAttachment = attachment
      const from = me ?? booking.student
      setMsgs(prev => [...(prev ?? []), {
        id: tempId,
        body: body.body,
        fromId: from.id,
        createdAt: new Date().toISOString(),
        from,
        fileUrl: sentAttachment?.url ?? null,
        fileName: sentAttachment?.name ?? null,
      }])
      setText(''); setAttachment(null)
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok || !j?.ok) {
        setMsgs(prev => (prev ?? []).filter(m => m.id !== tempId))
        setText(sentText); setAttachment(sentAttachment)
        setErr(sendErrorText(j?.error, j?.retryInSec))
        return
      }
      setMsgs(prev => (prev ?? []).map(m => (m.id === tempId ? j.message : m)))
    } catch { setErr('ქსელის შეცდომა — შეამოწმე კავშირი და სცადე თავიდან.') }
    finally { setSending(false) }
  }

  const meId = me?.id ?? booking?.student.id ?? null
  const peer = booking?.tutor.user

  return (
    <div className="h-[100dvh] bg-white flex flex-col font-sans text-ink-900 antialiased">
      {/* Header: back · expert identity · booking-detail link */}
      <header className="shrink-0 border-b border-ink-200 bg-white">
        <div className="max-w-[820px] mx-auto h-14 px-2 sm:px-4 flex items-center gap-1.5">
          <Link
            href="/student/messages"
            aria-label="ყველა საუბარი"
            className="w-11 h-11 shrink-0 rounded-btn inline-flex items-center justify-center text-ink-600 hover:bg-ink-50 active:bg-ink-100 transition-colors"
          >
            <Icon.chevR className="w-5 h-5 rotate-180" />
          </Link>
          {peer ? (
            <>
              <div className="w-9 h-9 shrink-0 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold text-sm overflow-hidden">
                {peer.avatarUrl
                  ? <img src={peer.avatarUrl} alt="" className="w-full h-full object-cover" />
                  : peer.fullName.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1 pl-1">
                <div className="font-display text-[14px] font-bold tracking-tight truncate">{peer.fullName}</div>
                <div className="text-[11.5px] text-ink-500 truncate">{booking?.topic}</div>
              </div>
              <Link
                href={`/student/bookings/${bookingId}`}
                className="shrink-0 h-9 px-3 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 text-ink-700 font-display font-semibold text-[12px] inline-flex items-center gap-1.5 transition-colors"
              >
                <Icon.calendar className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">ჯავშნის დეტალები</span>
                <span className="sm:hidden">ჯავშანი</span>
              </Link>
            </>
          ) : (
            <div className="flex items-center gap-2 pl-1" aria-busy="true">
              <Skeleton className="w-9 h-9" rounded="rounded-full" />
              <Skeleton.Line width={140} className="h-3.5" />
            </div>
          )}
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-[820px] mx-auto px-4 sm:px-6 py-4">
          {loadErr ? (
            <div className="py-16 text-center">
              <p className="text-[13.5px] text-ink-600">{loadErr}</p>
              <Link href="/student/messages" className="mt-3 inline-flex h-11 px-4 items-center rounded-btn border border-ink-200 bg-white hover:bg-ink-50 font-display font-semibold text-[13px] text-ink-800 transition-colors">
                ყველა საუბარი
              </Link>
            </div>
          ) : msgs === null ? (
            <div className="space-y-3 py-2" aria-busy="true">
              {['w-32', 'w-56', 'w-40'].map((w, i) => (
                <div key={i} className={`flex ${i % 2 ? 'justify-end' : ''}`}>
                  <Skeleton className={`h-12 ${w}`} rounded="rounded-card" />
                </div>
              ))}
            </div>
          ) : msgs.length === 0 ? (
            <div className="text-center py-12">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-brand-50 text-brand-700 mb-3">
                <Icon.chat className="w-5 h-5" />
              </span>
              <div className="font-display text-[13.5px] font-semibold text-ink-800">დაიწყე საუბარი {peer?.fullName}-სთან</div>
              <p className="text-[12.5px] text-ink-500 mt-1 max-w-[340px] mx-auto">
                აღუწერე შენი საკითხი ან დასვი კითხვა კონსულტაციამდე — რაც უფრო კონკრეტულია, მით უკეთ მოემზადება ექსპერტი.
              </p>
            </div>
          ) : (
            msgs.map((m, i) => {
              const mine = m.fromId === meId
              const d = new Date(m.createdAt)
              const prev = i > 0 ? msgs[i - 1] : null
              const next = i < msgs.length - 1 ? msgs[i + 1] : null
              const newDay = !prev || new Date(prev.createdAt).toDateString() !== d.toDateString()
              const GROUP_MS = 5 * 60_000
              const groupedWithPrev = !newDay && !!prev && prev.fromId === m.fromId &&
                d.getTime() - new Date(prev.createdAt).getTime() < GROUP_MS
              const groupedWithNext = !!next && next.fromId === m.fromId &&
                new Date(next.createdAt).getTime() - d.getTime() < GROUP_MS &&
                new Date(next.createdAt).toDateString() === d.toDateString()
              const safeFile = safeHttpUrl(m.fileUrl)
              return (
                <React.Fragment key={m.id}>
                  {newDay && (
                    <div className={`flex items-center gap-3 py-1 ${i > 0 ? 'mt-4' : ''}`} aria-hidden>
                      <span className="flex-1 h-px bg-ink-100" />
                      <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">{fmtKaDate(d)}</span>
                      <span className="flex-1 h-px bg-ink-100" />
                    </div>
                  )}
                  <div className={`flex gap-2.5 ${mine ? 'flex-row-reverse' : ''} ${groupedWithPrev ? 'mt-1' : 'mt-3'}`}>
                    {groupedWithPrev ? (
                      <span className="w-8 shrink-0" aria-hidden />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold text-sm shrink-0 overflow-hidden">
                        {m.from.avatarUrl
                          ? <img src={m.from.avatarUrl} alt="" className="w-full h-full object-cover" />
                          : m.from.fullName.slice(0, 1)}
                      </div>
                    )}
                    <div className={`max-w-[85%] sm:max-w-[78%] ${mine ? 'flex flex-col items-end' : ''}`}>
                      <div className={`px-3.5 py-2.5 rounded-card text-[13.5px] leading-[1.55] whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${mine ? 'bg-brand-500 text-white rounded-tr-sm' : 'bg-ink-50 border border-ink-200 rounded-tl-sm text-ink-900'}`}>
                        {sanitizeMsgBody(m.body)}
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
                                <Icon.download className="w-3.5 h-3.5" />
                                {m.fileName ?? 'ფაილი'}
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                      {!groupedWithNext && (
                        <div className="mt-1 font-mono text-[10px] tabular-nums text-ink-400">
                          {fmtKaTime(d)}
                        </div>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              )
            })
          )}
        </div>
      </div>

      {/* Composer */}
      {!loadErr && (
        <form onSubmit={send} className="shrink-0 border-t border-ink-100 bg-ink-50/40">
          <div className="max-w-[820px] mx-auto px-4 sm:px-6 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={onFileChosen}
              className="sr-only"
            />
            {attachment && (
              <div className="flex items-center gap-2 rounded-btn border border-ink-200 bg-white px-3 py-2 text-[12.5px]">
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
                onClick={pickFile}
                disabled={uploading || !booking}
                aria-label="ფაილის მიბმა"
                title="ფაილის მიბმა (PDF/JPG/PNG · max 8 MB)"
                className="h-11 w-11 rounded-btn border border-ink-200 bg-white hover:border-ink-300 disabled:opacity-50 text-ink-600 hover:text-ink-900 inline-flex items-center justify-center transition-colors shrink-0"
              >
                {uploading ? (
                  <span className="inline-block w-4 h-4 border-2 border-ink-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon.paperclip className="w-4 h-4" />
                )}
              </button>
              <textarea
                value={text}
                maxLength={MSG_MAX_LEN}
                onChange={e => {
                  setText(e.target.value)
                  const el = e.currentTarget
                  el.style.height = 'auto'
                  el.style.height = `${Math.min(el.scrollHeight, 132)}px`
                }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e as any); (e.currentTarget as HTMLTextAreaElement).style.height = 'auto' } }}
                rows={1}
                placeholder={attachment ? 'დაწერე შეტყობინება ან უბრალოდ გააგზავნე ფაილი…' : 'მიუწერე შეტყობინება…'}
                className="flex-1 min-h-[44px] max-h-[132px] px-3 py-2.5 rounded-btn border border-ink-200 bg-white text-[13.5px] resize-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
              />
              <button type="submit" aria-label="გაგზავნა" disabled={sending || uploading || !booking || (!text.trim() && !attachment)} className="h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 disabled:text-ink-400 text-white font-display font-semibold text-[12.5px] inline-flex items-center gap-1.5 transition-colors shrink-0">
                {sending ? '…' : (<><Icon.send className="w-4 h-4" /><span className="hidden sm:inline">გაგზავნა</span></>)}
              </button>
            </div>
            {text.length > MSG_MAX_LEN - 200 && (
              <div className={`text-right font-mono text-[10.5px] tabular-nums ${text.length >= MSG_MAX_LEN ? 'text-danger-600' : 'text-ink-400'}`}>
                {text.length} / {MSG_MAX_LEN}
              </div>
            )}
            {err && <div className="text-[12px] text-danger-600">{err}</div>}
          </div>
        </form>
      )}
    </div>
  )
}

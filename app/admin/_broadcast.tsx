'use client'
// Admin tab: შეტყობინება — in-app Notification fan-out.

import { useState, useEffect } from 'react'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { AdminConfirmDialog, TabHeader } from './_parts'

/* ───── Section: Broadcast (in-app Notification fan-out) ───── */
type Segment = 'all' | 'clients' | 'providers' | 'recent'

const SEGMENT_LABEL: Record<Segment, string> = {
  all: 'ყველა მომხმარებელი',
  clients: 'ყველა კლიენტი',
  providers: 'ყველა ექსპერტი',
  recent: 'ბოლო 7 დღის რეგისტრაცია',
}

export const BroadcastSection = () => {
  const [segment, setSegment] = useState<Segment>('all')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  // Send goes through the shared confirm dialog (no native confirm()).
  const [pendSend, setPendSend] = useState(false)

  // Any change to the segment invalidates a previously-fetched preview count —
  // otherwise the user sees a "will send to 240" while the segment now says
  // "tutors only" (misleading).
  useEffect(() => { setPreviewCount(null) }, [segment])

  const doPreview = async () => {
    setBusy(true); setFlash(null)
    try {
      const res = await fetch('/api/admin/broadcast/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (res.ok && data?.ok) setPreviewCount(data.count)
      else setFlash({ kind: 'error', msg: 'დათვლა ვერ მოხერხდა' })
    } catch {
      setFlash({ kind: 'error', msg: 'ქსელის შეცდომა' })
    } finally { setBusy(false) }
  }

  const askSend = () => {
    if (!subject.trim() || !body.trim()) {
      setFlash({ kind: 'error', msg: 'სათაური და ტექსტი სავალდებულოა' })
      return
    }
    setPendSend(true)
  }

  const doSend = async () => {
    setPendSend(false)
    setBusy(true); setFlash(null)
    try {
      const res = await fetch('/api/admin/broadcast/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment, subject: subject.trim(), body: body.trim() }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (res.ok && data?.ok) {
        setFlash({ kind: 'success', msg: `${data.sent} შეტყობინება გაიგზავნა.` })
        setSubject(''); setBody(''); setPreviewCount(null)
      } else {
        setFlash({ kind: 'error', msg: 'გაგზავნა ვერ მოხერხდა' })
      }
    } catch {
      setFlash({ kind: 'error', msg: 'ქსელის შეცდომა' })
    } finally { setBusy(false) }
  }

  return (
    <>
      <TabHeader
        eyebrow="მასობრივი · შიდა შეტყობინება"
        title={<>მასობრივი შეტყობინება</>}
        sub="შერჩეულ სეგმენტს ეგზავნება Notification ჩანაწერი. Email არ იგზავნება."
        actions={undefined}
      />
      <section className="px-6 lg:px-8 py-6 max-w-[720px] space-y-4">
        {flash && (
          <div role="alert" className={`rounded-btn border px-3 py-2 text-small font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
            {flash.msg}
          </div>
        )}
        <div>
          <Eyebrow as="label" tone="muted" className="block mb-1.5">სეგმენტი</Eyebrow>
          <div className="inline-flex flex-wrap items-center p-0.5 rounded-pill bg-white border border-ink-200">
            {(['all', 'clients', 'providers', 'recent'] as Segment[]).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setSegment(s)}
                className={`h-10 sm:h-9 px-3.5 rounded-pill font-display text-small font-semibold tracking-wide transition-colors duration-fast ${segment === s ? 'bg-ink-900 text-white hover:bg-ink-800' : 'text-ink-600 hover:bg-ink-100'}`}
              >{SEGMENT_LABEL[s]}</button>
            ))}
          </div>
        </div>
        <div>
          <Eyebrow as="label" tone="muted" className="block mb-1.5">სათაური</Eyebrow>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            maxLength={120}
            placeholder="მაგ. სამომხმარებლო შეთანხმების განახლება"
            className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-small focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
          />
        </div>
        <div>
          <Eyebrow as="label" tone="muted" className="block mb-1.5">ტექსტი</Eyebrow>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={6}
            maxLength={4000}
            placeholder="შეტყობინების შინაარსი…"
            className="w-full px-3 py-2 rounded-field border border-ink-200 bg-white text-small focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none resize-y"
          />
          <div className="mt-1 font-mono text-meta tabular-nums text-ink-400">{body.length}/4000</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={doPreview}
            disabled={busy}
            className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 disabled:opacity-50 text-ink-800 font-display font-semibold text-small inline-flex items-center gap-1.5"
          >
            <Icon.users className="w-3.5 h-3.5" /> მიმღების რაოდენობა
          </button>
          <button
            type="button"
            onClick={askSend}
            disabled={busy || !subject.trim() || !body.trim()}
            className="h-11 px-4 rounded-btn bg-ink-900 hover:bg-ink-800 disabled:bg-ink-100 text-white font-display font-semibold text-small inline-flex items-center gap-1.5"
          >
            გაგზავნა
          </button>
          {previewCount !== null && (
            <span className="font-mono text-meta tabular-nums text-ink-700">
              {previewCount} მიმღები
            </span>
          )}
        </div>
      </section>
      <AdminConfirmDialog
        open={pendSend}
        title="მასობრივი შეტყობინების გაგზავნა"
        body={<>სეგმენტი: <span className="font-display font-semibold">{SEGMENT_LABEL[segment]}</span>{previewCount !== null ? <> · {previewCount} მიმღები</> : null}. თითოეულს შეექმნება in-app შეტყობინება.</>}
        tone="brand"
        confirmLabel="გააგზავნე"
        busy={busy}
        onCancel={() => setPendSend(false)}
        onConfirm={doSend}
      />
    </>
  )
}


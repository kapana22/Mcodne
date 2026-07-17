'use client'
import React, { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { PublicTopBar } from '@/components/PublicTopBar'
import { Footer as SharedFooter } from '@/components/Footer'
import { frameQuestion } from '@/lib/askFraming'
import { fmtKaDate } from '@/lib/kaDate'

const Ic = {
  search: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  arrow: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M13 5l7 7-7 7" /></svg>,
  star: (p: any) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="m12 2 2.95 6.5L22 9.3l-5.2 4.9 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.3l7.05-.8L12 2Z" /></svg>,
  check: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m4 12 5 5L20 6" /></svg>,
  users: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-7 7-7s7 3 7 7M16 4a4 4 0 0 1 0 8M22 21c0-3-2-5.5-5-6.5" /></svg>,
  spark: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></svg>,
  doc: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></svg>,
}

type Expert = {
  id: string
  name: string
  cat: string
  headline: string
  rating: number
  reviews: number
  price: number
  photo: string
  nextSlotAt: string | null
}

function initialsAvatar(name: string): string {
  const initials = (name || 'ე ე').split(' ').map(s => s[0]).filter(Boolean).join('').slice(0, 2).toUpperCase()
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><rect width='120' height='120' fill='%23e8eef0'/><text x='60' y='74' font-family='sans-serif' font-size='46' fill='%235a6b70' text-anchor='middle'>${initials}</text></svg>`)}`
}

function fmtSlot(iso: string | null): string {
  if (!iso) return 'ხელმისაწვდომობა მალე'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'ხელმისაწვდომობა მალე'
  const now = new Date()
  const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const tom = new Date(now); tom.setDate(now.getDate() + 1)
  const hm = d.toLocaleTimeString('ka-GE', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (same(d, now)) return `დღეს ${hm}`
  if (same(d, tom)) return `ხვალ ${hm}`
  return fmtKaDate(d)
}

function AskInner() {
  const params = useSearchParams()
  const router = useRouter()
  const q = (params?.get('q') ?? '').trim()
  const framing = frameQuestion(q)

  const [experts, setExperts] = useState<Expert[] | null>(null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    let cancelled = false
    setExperts(null)
    // Gather the "sources": experts for the detected category. A full natural-
    // language question never substring-matches a short bio, so we match by the
    // detected category (reliable) rather than passing the whole question as `q`.
    // No category detected → surface the top experts overall.
    const url = new URLSearchParams({ limit: '6' })
    if (framing.categorySlug) url.set('category', framing.categorySlug)
    fetch(`/api/tutors?${url.toString()}`)
      .then(r => (r.ok ? r.json() : []))
      .then((rows: any[]) => {
        if (cancelled || !Array.isArray(rows)) return
        setExperts(rows.slice(0, 6).map(t => ({
          id: t.id,
          name: t?.user?.fullName ?? 'ექსპერტი',
          cat: t?.category?.name ?? t?.specialty ?? 'სფერო',
          headline: t?.headline ?? '',
          rating: typeof t?.rating === 'number' ? t.rating : 0,
          reviews: t?.reviewsCount ?? 0,
          price: t?.price ?? 60,
          photo: t?.user?.avatarUrl ?? initialsAvatar(t?.user?.fullName ?? ''),
          nextSlotAt: t?.nextSlotAt ?? null,
        })))
      })
      .catch(() => setExperts([]))
    return () => { cancelled = true }
  }, [q, framing.categorySlug])

  const goAsk = (question: string) => {
    const v = question.trim()
    if (!v) return
    router.push(`/ask?q=${encodeURIComponent(v)}`)
  }

  return (
    <div className="font-sans bg-white text-ink-900 antialiased min-h-screen flex flex-col">
      <PublicTopBar />

      <main className="flex-1 max-w-[820px] w-full mx-auto px-6 sm:px-8 py-8 lg:py-12">
        {/* Question header (the "thread" title) */}
        <div className="flex items-center gap-1.5 text-[12px] text-ink-500 mb-4">
          <Link href="/" className="hover:text-ink-800">მთავარი</Link>
          <span className="text-ink-300">/</span>
          <span className="font-display font-semibold text-ink-700">კითხვა</span>
        </div>
        <h1 className="font-display text-[26px] sm:text-[32px] font-bold text-ink-900 tracking-[-0.02em] leading-[1.12]">
          {q || 'დასვი შენი კითხვა'}
        </h1>

        {/* Curated framing (the "answer" analog — no AI, curated) */}
        <div className="mt-6 rounded-card border border-ink-200 bg-ink-50/40 p-5 sm:p-6">
          <div className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-pill bg-brand-50 text-brand-700 font-display text-[11px] font-semibold mb-3">
            <Ic.spark className="w-3 h-3" />
            {framing.categoryLabel}
          </div>
          <p className="text-[14px] text-ink-700 leading-[1.6]">{framing.intro}</p>
          <div className="mt-4 pt-4 border-t border-ink-200">
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500 mb-2.5 inline-flex items-center gap-1.5">
              <Ic.doc className="w-3.5 h-3.5" /> სესიამდე მოამზადე
            </div>
            <ul className="space-y-1.5">
              {framing.prepare.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-ink-700">
                  <span className="mt-0.5 w-4 h-4 rounded-full bg-brand-100 text-brand-700 inline-flex items-center justify-center shrink-0"><Ic.check className="w-2.5 h-2.5" /></span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Matched experts (the "sources") */}
        <section className="mt-8">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <h2 className="font-display text-[16px] font-bold text-ink-900 tracking-tight inline-flex items-center gap-2">
              <Ic.users className="w-4 h-4 text-brand-600" /> შესაფერისი ექსპერტები
            </h2>
            <Link href={framing.categorySlug ? `/tutors?category=${framing.categorySlug}` : '/tutors'} className="text-[12.5px] text-brand-700 hover:text-brand-800 font-display font-semibold">ყველა →</Link>
          </div>

          {experts === null ? (
            <div className="grid sm:grid-cols-2 gap-3">
              {[0, 1, 2, 3].map(i => <div key={i} className="h-[112px] rounded-card border border-ink-200 bg-ink-50/60 animate-pulse" />)}
            </div>
          ) : experts.length === 0 ? (
            <div className="rounded-card border border-dashed border-ink-200 bg-ink-50/40 p-8 text-center">
              <div className="font-display text-[14px] font-bold text-ink-900">ზუსტი დამთხვევა ვერ ვიპოვე</div>
              <p className="text-[12.5px] text-ink-500 mt-1">გადახედე ყველა ექსპერტს ან დასვი კითხვა სხვანაირად.</p>
              <Link href="/tutors" className="mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] transition-colors">ყველა ექსპერტი <Ic.arrow className="w-3.5 h-3.5" /></Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {experts.map(e => (
                <Link key={e.id} href={`/tutors/${e.id}`} className="group rounded-card border border-ink-200 bg-white hover:border-ink-300 hover:shadow-card p-4 flex gap-3.5 transition-all">
                  <img src={e.photo} alt={e.name} className="w-14 h-14 rounded-card object-cover shrink-0 ring-1 ring-inset ring-ink-900/[0.06]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-display text-[14px] font-bold text-ink-900 truncate">{e.name}</span>
                      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-brand-500 text-white shrink-0"><Ic.check className="w-2 h-2" /></span>
                    </div>
                    <div className="text-[12px] text-ink-600 truncate">{e.cat}{e.headline ? ` · ${e.headline}` : ''}</div>
                    <div className="mt-2 flex items-center gap-2.5 text-[11.5px] text-ink-500">
                      <span className="inline-flex items-center gap-1 text-warning-600"><Ic.star className="w-3 h-3" /><span className="font-display font-bold text-ink-900 tabular-nums">{e.rating.toFixed(1)}</span></span>
                      <span className="text-ink-300">·</span>
                      <span className="font-display font-bold text-ink-900 tabular-nums">₾{e.price}</span>
                      <span className="text-ink-300">·</span>
                      <span className={e.nextSlotAt ? 'text-success-700' : 'text-ink-400'}>{fmtSlot(e.nextSlotAt)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Related follow-up questions */}
        <section className="mt-8">
          <h2 className="font-display text-[16px] font-bold text-ink-900 tracking-tight mb-3">დაკავშირებული კითხვები</h2>
          <div className="space-y-2">
            {framing.related.map((r, i) => (
              <button key={i} type="button" onClick={() => goAsk(r)} className="w-full text-left rounded-card border border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50/30 px-4 py-3 flex items-center justify-between gap-3 group transition-colors">
                <span className="text-[13.5px] text-ink-800">{r}</span>
                <span className="w-6 h-6 rounded-full bg-ink-100 group-hover:bg-brand-500 group-hover:text-white text-ink-500 inline-flex items-center justify-center shrink-0 transition-colors"><Ic.arrow className="w-3.5 h-3.5" /></span>
              </button>
            ))}
          </div>
        </section>
      </main>

      {/* Persistent "ask follow up" bar (mirrors Perplexity) */}
      <div className="sticky bottom-0 z-30 bg-white/95 backdrop-blur border-t border-ink-200">
        <form onSubmit={e => { e.preventDefault(); goAsk(draft) }} className="max-w-[820px] mx-auto px-6 sm:px-8 py-3.5">
          <div className="rounded-pill bg-white border border-ink-200 shadow-card focus-within:border-brand-400 flex items-center gap-2 pl-4 pr-2 h-12 transition-colors">
            <Ic.search className="w-4 h-4 text-ink-400 shrink-0" />
            <input
              type="text"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="დასვი შემდეგი კითხვა…"
              className="flex-1 bg-transparent text-[14px] text-ink-900 placeholder:text-ink-400 focus:outline-none"
            />
            <button type="submit" disabled={!draft.trim()} className="h-9 w-9 rounded-full bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 text-white inline-flex items-center justify-center transition-colors shrink-0">
              <Ic.arrow className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>

      <SharedFooter />
    </div>
  )
}

export default function AskPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <AskInner />
    </Suspense>
  )
}

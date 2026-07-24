'use client'
import React, { Suspense, useEffect, useState } from 'react'
import { Container } from '@/components/Container'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { PublicTopBar } from '@/components/PublicTopBar'
import { Footer as SharedFooter } from '@/components/Footer'
import { frameQuestion } from '@/lib/askFraming'
import { fmtKaDate, fmtKaTime } from '@/lib/kaDate'
import { fmtRating } from '@/lib/fmt'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'

type Expert = {
  id: string
  name: string
  cat: string
  headline: string
  rating: number
  reviews: number
  price: number
  verified: boolean
  photo: string
  nextSlotAt: string | null
}

function initialsAvatar(_name: string): string {
  return DEFAULT_AVATAR
}

function fmtSlot(iso: string | null): string {
  if (!iso) return 'ხელმისაწვდომობა მალე'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'ხელმისაწვდომობა მალე'
  const now = new Date()
  const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const tom = new Date(now); tom.setDate(now.getDate() + 1)
  const hm = fmtKaTime(d)
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
          // Canonical missing-price fallback is 80 everywhere (was 60 here — the
          // same expert read ₾60 on /ask and ₾80 on /tutors).
          price: t?.price ?? 80,
          verified: !!t?.verified,
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

      <Container as="main" size="content" className="flex-1 w-full py-8 lg:py-12">
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
            <Icon.spark className="w-3 h-3" />
            {framing.categoryLabel}
          </div>
          <p className="text-[14px] text-ink-700 leading-[1.6]">{framing.intro}</p>
          <div className="mt-4 pt-4 border-t border-ink-200">
            <Eyebrow tone="muted" className="mb-2.5 inline-flex items-center gap-1.5">
              <Icon.doc className="w-3.5 h-3.5" /> სესიამდე მოამზადე
            </Eyebrow>
            <ul className="space-y-1.5">
              {framing.prepare.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-ink-700">
                  <span className="mt-0.5 w-4 h-4 rounded-full bg-brand-100 text-brand-700 inline-flex items-center justify-center shrink-0"><Icon.check className="w-2.5 h-2.5" /></span>
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
              <Icon.users className="w-4 h-4 text-brand-600" /> შესაფერისი ექსპერტები
            </h2>
            <Link href={framing.categorySlug ? `/tutors?category=${framing.categorySlug}` : '/tutors'} className="text-[12.5px] text-brand-700 hover:text-brand-800 font-display font-semibold">ყველა</Link>
          </div>

          {experts === null ? (
            <div className="grid sm:grid-cols-2 gap-3">
              {[0, 1, 2, 3].map(i => <div key={i} className="h-[112px] rounded-card border border-ink-200 bg-ink-50/60 animate-pulse" />)}
            </div>
          ) : experts.length === 0 ? (
            <div className="rounded-card border border-dashed border-ink-200 bg-ink-50/40 p-8 text-center">
              <div className="font-display text-[14px] font-bold text-ink-900">ზუსტი დამთხვევა ვერ ვიპოვე</div>
              <p className="text-[12.5px] text-ink-500 mt-1">გადახედე ყველა ექსპერტს ან დასვი კითხვა სხვანაირად.</p>
              <Link href="/tutors" className="mt-4 inline-flex items-center gap-1.5 h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-display font-semibold text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2">ყველა ექსპერტი</Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {experts.map(e => (
                <Link key={e.id} href={`/tutors/${e.id}`} className="group rounded-card border border-ink-200 bg-white hover:border-ink-300 hover:shadow-card p-4 flex gap-3.5 transition-all">
                  <img src={e.photo} alt={e.name} className="w-14 h-14 rounded-card object-cover shrink-0 ring-1 ring-inset ring-ink-900/[0.06]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-display text-[14px] font-bold text-ink-900 truncate">{e.name}</span>
                      {e.verified && (
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-brand-500 text-white shrink-0" title="გადამოწმებული"><Icon.check className="w-2 h-2" /></span>
                      )}
                    </div>
                    <div className="text-[12px] text-ink-600 truncate">{e.cat}{e.headline ? ` · ${e.headline}` : ''}</div>
                    <div className="mt-2 flex items-center gap-2.5 text-[11.5px] text-ink-500">
                      <span role="img" aria-label={`${fmtRating(e.rating)} 5-დან`} className="inline-flex items-center gap-1 text-warning-600"><Icon.star aria-hidden className="w-3 h-3" /><span className="font-display font-bold text-ink-900 tabular-nums">{fmtRating(e.rating)}</span></span>
                      <span className="text-ink-300">·</span>
                      <span className="font-display font-bold text-ink-900 tabular-nums">₾{e.price}</span>
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
              <button key={i} type="button" onClick={() => goAsk(r)} className="w-full text-left rounded-card border border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50/30 px-4 py-3 flex items-center gap-3 group transition-colors">
                <span className="text-[13.5px] text-ink-800">{r}</span>
              </button>
            ))}
          </div>
        </section>
      </Container>

      {/* Persistent "ask follow up" bar (mirrors Perplexity) */}
      <div className="sticky bottom-0 z-30 bg-white lg:bg-white/95 lg:backdrop-blur border-t border-ink-200">
        <Container as="form" size="content" onSubmit={(e: React.FormEvent) => { e.preventDefault(); goAsk(draft) }} className="py-3.5">
          <div className="rounded-pill bg-white border border-ink-200 shadow-card focus-within:border-brand-400 flex items-center gap-2 pl-4 pr-2 h-12 transition-colors">
            <Icon.search className="w-4 h-4 text-ink-400 shrink-0" />
            <input
              type="text"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              aria-label="დასვი შემდეგი კითხვა"
              placeholder="დასვი შემდეგი კითხვა…"
              className="flex-1 bg-transparent text-[14px] text-ink-900 placeholder:text-ink-400 focus:outline-none"
            />
            <button type="submit" disabled={!draft.trim()} aria-label="გაგზავნა" className="h-9 w-9 rounded-full bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 text-white inline-flex items-center justify-center transition-colors shrink-0">
              <Icon.send className="w-4 h-4" />
            </button>
          </div>
        </Container>
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

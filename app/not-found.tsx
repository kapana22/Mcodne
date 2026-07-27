'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'

type Role = 'STUDENT' | 'TUTOR' | 'ADMIN'
type Me = { role: Role; fullName?: string } | null

// Smart 404: recovers non-authenticated users with generic paths, and
// swaps the "მთავარი" CTA for a role-specific dashboard link if the visitor
// happens to be signed in.
export default function NotFound() {
  const [me, setMe] = useState<Me>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) setMe(d?.user ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const homeHref = me?.role === 'TUTOR' ? '/tutor'
    : me?.role === 'ADMIN' ? '/admin'
    : me?.role === 'STUDENT' ? '/student'
    : '/'
  const homeLabel = me
    ? (me.role === 'TUTOR' ? 'ჩემი სივრცე' : me.role === 'ADMIN' ? 'ადმინი' : 'ჩემი სივრცე')
    : 'მთავარი'

  return (
    <main className="relative min-h-screen flex items-center justify-center px-6 bg-ink-50 overflow-hidden">
      {/* Soft brand halo behind content — the named radial-gradient utility from
          globals.css, never `blur-3xl`: Safari renders large blur() filters as a
          hard-edged square stain. */}
      <span aria-hidden className="glow-brand absolute top-1/3 left-1/2 -translate-x-1/2 w-[560px] h-[560px] pointer-events-none" />

      <div className="relative max-w-[520px] w-full text-center">
        {/* Big 404 with brand gradient */}
        <div className="font-display font-bold tabular-nums leading-none tracking-[-0.03em] text-[120px] sm:text-[160px] bg-gradient-cta bg-clip-text text-transparent motion-safe:animate-scale-in">
          404
        </div>

        <h1 className="mt-2 font-display text-[24px] sm:text-[28px] font-bold text-ink-900 tracking-tight motion-safe:animate-rise-in" style={{ animationDelay: '80ms' }}>
          გვერდი ვერ მოიძებნა
        </h1>
        <p className="mt-3 text-[14px] text-ink-600 leading-relaxed max-w-[420px] mx-auto motion-safe:animate-rise-in" style={{ animationDelay: '140ms' }}>
          შესაძლოა ბმული შეიცვალა ან გვერდი წაიშალა. სცადე ერთ-ერთი ქვემოდან:
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2 motion-safe:animate-rise-in" style={{ animationDelay: '200ms' }}>
          <Link
            href={homeHref}
            className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13.5px] tracking-tight inline-flex items-center gap-2 shadow-brand-glow hover:shadow-[0_10px_32px_rgba(47,156,134,0.36)] transition-all duration-fast"
          >
            {homeLabel}
          </Link>
          <Link
            href="/tutors"
            className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:border-ink-300 hover:bg-ink-100 text-ink-800 font-display font-semibold text-[13.5px] tracking-tight inline-flex items-center gap-2 transition-colors duration-fast"
          >
            <Icon.search className="w-4 h-4" />
            ექსპერტების ძებნა
          </Link>
        </div>

        <div className="mt-8 text-[12.5px] text-ink-500 motion-safe:animate-fade-in" style={{ animationDelay: '280ms' }}>
          თუ ეს ბმული სადმე გინახე — {' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-display font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2">
            მოგვწერე
          </a>
        </div>
      </div>
    </main>
  )
}

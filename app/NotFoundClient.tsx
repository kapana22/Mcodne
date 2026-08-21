'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'
import { ROLE } from '@/lib/roles'

type Role = 'USER' | 'PROVIDER' | 'ADMIN'
type Me = { role: Role; fullName?: string } | null

// Smart 404: recovers non-authenticated users with generic paths, and
// swaps the "მთავარი" CTA for a role-specific dashboard link if the visitor
// happens to be signed in.
export function NotFoundClient() {
  const [me, setMe] = useState<Me>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) setMe(d?.user ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const homeHref = me?.role === ROLE.PROVIDER ? '/work'
    : me?.role === 'ADMIN' ? '/admin'
    : me?.role === ROLE.USER ? '/me'
    : '/'
  const homeLabel = me
    ? (me.role === ROLE.PROVIDER ? 'ჩემი სივრცე' : me.role === 'ADMIN' ? 'ადმინი' : 'ჩემი სივრცე')
    : 'მთავარი'

  return (
    <main className="relative min-h-screen flex items-center justify-center px-6 bg-ink-50 overflow-hidden">
      {/* Soft brand halo behind content — the named radial-gradient utility from
          globals.css, never `blur-3xl`: Safari renders large blur() filters as a
          hard-edged square stain. */}
      <span aria-hidden className="glow-brand absolute top-1/3 left-1/2 -translate-x-1/2 w-[560px] h-[560px] pointer-events-none" />

      <div className="relative max-w-[520px] w-full text-center">
        {/* Big 404 with brand gradient.
            OFF-RAMP (120/160px): a decorative gradient-clipped numeral, not
            type — sized to the 520px plate, well past the ramp's top step
            (text-hero, 64px). Deliberately outside the scale; do not "fix". */}
        <div className="font-display font-bold tabular-nums leading-none tracking-[-0.03em] text-[120px] sm:text-[160px] bg-gradient-cta bg-clip-text text-transparent motion-safe:animate-scale-in">
          404
        </div>

        <h1 className="mt-2 font-display text-h1 font-bold text-ink-900 tracking-tight motion-safe:animate-rise-in" style={{ animationDelay: '80ms' }}>
          გვერდი ვერ მოიძებნა
        </h1>
        <p className="mt-3 text-body text-ink-600 leading-relaxed max-w-[420px] mx-auto motion-safe:animate-rise-in" style={{ animationDelay: '140ms' }}>
          შესაძლოა ბმული შეიცვალა ან გვერდი წაიშალა. სცადე ერთ-ერთი ქვემოდან:
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2 motion-safe:animate-rise-in" style={{ animationDelay: '200ms' }}>
          <Link
            href={homeHref}
            className="h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-tight inline-flex items-center gap-2 shadow-brand-glow hover:shadow-[0_10px_32px_rgba(47,156,134,0.36)] transition-all duration-fast"
          >
            {homeLabel}
          </Link>
          <Link
            href="/experts"
            className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:border-ink-300 hover:bg-ink-100 text-ink-800 font-display font-semibold text-body tracking-tight inline-flex items-center gap-2 transition-colors duration-fast"
          >
            <Icon.search className="w-4 h-4" />
            ექსპერტების ძებნა
          </Link>
        </div>

        {/* Real routes out. A 404 that offers only „home" and „search" wastes
            the one moment a lost visitor is still willing to click, and it gave
            a crawler that landed here no path back into the site. */}
        <nav aria-label="სასარგებლო ბმულები" className="mt-8 pt-6 border-t border-ink-200/70 motion-safe:animate-fade-in" style={{ animationDelay: '240ms' }}>
          <div className="text-meta text-ink-500 mb-3">ან გადადი პირდაპირ:</div>
          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {[
              { href: '/experts', l: 'ექსპერტები' },
              { href: '/experts', l: 'კონსულტაციები' },
              { href: '/blog', l: 'ბლოგი' },
              { href: '/help', l: 'დახმარება' },
            ].map(x => (
              <li key={x.href}>
                <Link href={x.href} className="text-small text-ink-600 hover:text-brand-700 transition-colors duration-fast">
                  {x.l}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-8 text-small text-ink-500 motion-safe:animate-fade-in" style={{ animationDelay: '280ms' }}>
          თუ ეს ბმული სადმე გინახავს — {' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-display font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2">
            მოგვწერე
          </a>
        </div>
      </div>
    </main>
  )
}

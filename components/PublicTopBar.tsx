'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Logo } from './Logo'
import { Icon } from './Icon'
import { Avatar } from './Avatar'
import { useMe, type Me } from '@/lib/me'

// The single public header. Rendered on every guest/browse/marketing page.
//
// STATIC BY DESIGN — it must NOT visibly change on load. Two things used to make
// it "change unclearly":
//   1. the nav items swapped by role once /api/me resolved (public → student/
//      tutor nav), and
//   2. the right side popped from empty → avatar/buttons.
// Fixes: (1) the nav is now UNIFORM for everyone — logged-in users reach their
// workspace via the avatar (→ role home), the marketing nav never rearranges;
// (2) server-rendered pages pass `initialUser` so the auth state is correct on
// the FIRST paint (no flip). Client-only pages fall back to the deduped
// lib/me probe, but with the uniform nav there's no rearrange either way.

// ONE nav for everyone — the professional marketplace pattern (Airbnb/Intro).
const NAV: { label: string; href: string }[] = [
  { label: 'ექსპერტები',     href: '/tutors' },
  { label: 'კატეგორიები',    href: '/categories' },
  { label: 'გახდი ექსპერტი', href: '/apply' },
  { label: 'დახმარება',      href: '/help' },
]

export function PublicTopBar({
  activeHref,
  initialUser,
}: {
  activeHref?: string
  // `undefined` → not server-provided, use the client probe (home, ask…).
  // `null`      → server says guest. An object → server-resolved user.
  // When provided, the header is correct on first paint — no flip.
  initialUser?: Me | null
}) {
  // Shared identity source (lib/me) — no-store, deduped with AppShell + the
  // page so a public load makes ONE /api/me request instead of three.
  const { me: fetchedMe, ready: fetchedReady } = useMe()
  // Prefer the client probe once it lands (catches in-tab session changes);
  // before that, trust the server-provided initialUser so nothing flips.
  const ssr = initialUser !== undefined
  const me = fetchedReady ? fetchedMe : (ssr ? initialUser : null)
  const ready = fetchedReady || ssr
  const [mobOpen, setMobOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // Scroll-driven elevation — hairline is always present; a soft shadow lifts
  // the bar off the page once we cross ~8px, an Airbnb-style detach cue.
  // Passive listener so it never blocks scroll performance.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Lock body scroll while the mobile drawer is open; Escape closes it —
  // the drawer is a dialog and needs a keyboard exit.
  useEffect(() => {
    if (!mobOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobOpen(false) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [mobOpen])

  const nav = NAV

  // The avatar links to the user's own workspace home (not a sub-page) — the
  // single, predictable "back to my space" affordance from any public page.
  const profileHref = !me ? '/signin'
    : me.role === 'TUTOR' ? '/tutor'
    : me.role === 'ADMIN' ? '/admin'
    : '/student'

  return (
    <header
      className={`sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-ink-100 transition-shadow duration-mid ease-out-quart ${
        scrolled ? 'shadow-sm' : ''
      }`}
    >
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4 lg:gap-8">
        <div className="flex items-center gap-7 lg:gap-10 min-w-0">
          <Logo size="sm" href="/" />
          <nav className="hidden lg:flex items-center gap-1">
            {nav.map(item => {
              const active = activeHref === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative h-11 px-3.5 rounded-btn font-display text-[12px] font-semibold uppercase tracking-[0.06em] inline-flex items-center transition-colors duration-fast ease-out-quart ${
                    active ? 'text-brand-800 bg-brand-50' : 'text-ink-700 hover:text-ink-900 hover:bg-ink-100/70'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {!ready ? (
            // Reserve space so the layout doesn't jump when auth resolves.
            <div className="w-10 h-10" />
          ) : !me ? (
            <>
              <Link
                href="/signin"
                className="hidden md:inline-flex h-11 px-4 rounded-btn font-display font-semibold text-[12px] uppercase tracking-[0.06em] text-ink-800 hover:bg-ink-100 items-center transition-colors duration-fast"
              >
                შესვლა
              </Link>
              <Link
                href="/signup"
                className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-bold text-[12px] uppercase tracking-[0.06em] transition-all duration-fast ease-out-quart inline-flex items-center gap-1.5 shadow-brand-glow hover:shadow-[0_10px_32px_rgba(21,154,130,0.36)]"
              >
                დაწყება
                <Icon.arrow className="w-3.5 h-3.5" />
              </Link>
            </>
          ) : (
            <Link href={profileHref} aria-label="პროფილი" className="inline-flex rounded-full">
              <Avatar src={me.avatarUrl ?? undefined} name={me.fullName} size={40} interactive />
            </Link>
          )}
          <button
            type="button"
            onClick={() => setMobOpen(o => !o)}
            aria-label="მენიუ"
            aria-expanded={mobOpen}
            className="lg:hidden w-10 h-10 rounded-btn border border-ink-200 bg-white text-ink-900 hover:bg-ink-100 inline-flex items-center justify-center transition-colors duration-fast"
          >
            {mobOpen ? <Icon.xC className="w-5 h-5" /> : <Icon.menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobOpen && (
        <>
          <button
            type="button"
            aria-label="დახურვა"
            onClick={() => setMobOpen(false)}
            className="lg:hidden fixed inset-0 z-50 bg-ink-900/50 backdrop-blur-sm motion-safe:animate-fade-in-fast"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="მენიუ"
            className="lg:hidden fixed top-0 right-0 bottom-0 z-[51] w-[320px] max-w-[86vw] bg-white shadow-float flex flex-col"
            style={{ animation: 'slideInR 300ms cubic-bezier(0.16, 1, 0.3, 1) both', animationDirection: 'reverse' }}
          >
            <div className="h-16 sm:h-20 px-5 flex items-center justify-between border-b border-ink-100 shrink-0">
              <span className="font-display text-[10.5px] font-bold uppercase tracking-[0.22em] text-ink-500">მენიუ</span>
              <button
                type="button"
                onClick={() => setMobOpen(false)}
                aria-label="დახურვა"
                className="w-10 h-10 rounded-btn text-ink-700 hover:bg-ink-100 inline-flex items-center justify-center transition-colors"
              >
                <Icon.xC className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-3">
              <ul className="stagger space-y-0.5">
                {nav.map(item => {
                  const active = activeHref === item.href
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMobOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center h-12 px-3 rounded-btn text-[13px] font-display font-semibold uppercase tracking-[0.06em] transition-colors ${
                          active ? 'bg-brand-50 text-brand-800' : 'text-ink-800 hover:bg-ink-100'
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  )
                })}
                {!me && (
                  <li>
                    <Link
                      href="/signin"
                      onClick={() => setMobOpen(false)}
                      className="flex items-center h-12 px-3 rounded-btn text-[13px] font-display font-semibold uppercase tracking-[0.06em] text-ink-800 hover:bg-ink-100 transition-colors"
                    >
                      შესვლა
                    </Link>
                  </li>
                )}
              </ul>
            </nav>
            {!me && (
              <div className="px-5 pb-5 pt-3 border-t border-ink-100">
                <Link
                  href="/signup"
                  onClick={() => setMobOpen(false)}
                  className="w-full h-12 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-bold text-[13px] uppercase tracking-[0.06em] inline-flex items-center justify-center gap-2 shadow-brand-glow transition-all"
                >
                  დაწყება
                  <Icon.arrow className="w-4 h-4" />
                </Link>
              </div>
            )}
          </aside>
        </>
      )}
    </header>
  )
}

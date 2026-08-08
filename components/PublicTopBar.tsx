'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Logo } from './Logo'
import { Icon } from './Icon'
import { NotifBell } from './NotifBell'
import { UserMenu } from './UserMenu'
import { Container } from '@/components/Container'
import { useMe, type Me } from '@/lib/me'
import { showApplyCta } from '@/lib/roleHome'

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

  // Scroll-driven elevation — the glass bar is flat and extra-transparent
  // (`.glass-bar-quiet`) at the top of the page, then firms up its hairline and
  // lifts into its shadow once we cross ~8px, an Airbnb-style detach cue. The
  // transition lives in `.glass-bar`, so reduced-motion users get the state
  // change instantly.
  // Passive listener so it never blocks scroll performance.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const drawerRef = useRef<HTMLElement | null>(null)
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  // Lock body scroll while the mobile drawer is open; Escape closes it —
  // the drawer is a dialog and needs a keyboard exit.
  //
  // FOCUS MANAGEMENT added 2026-07-31. The drawer already declared
  // `role="dialog" aria-modal="true"` but did nothing about focus: measured with
  // a keyboard, opening it left focus on the hamburger BEHIND the overlay, so
  // the next Tab walked the page underneath — a screen-reader user was told a
  // modal had opened and then handed the content it was covering. `aria-modal`
  // is a promise the DOM has to keep.
  // Three parts, all required: move focus IN on open, keep Tab inside while it
  // is open, and return focus to the trigger on close so the reader's place in
  // the page is not lost.
  useEffect(() => {
    if (!mobOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMobOpen(false); return }
      if (e.key !== 'Tab') return
      const root = drawerRef.current
      if (!root) return
      const items = [...root.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])',
      )].filter(el => el.offsetParent !== null)
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      // Wrap at both ends — without this, Tab past the last item escapes into
      // the page the dialog is covering.
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Land on „დახურვა" rather than the first nav link: the exit is what a
    // keyboard user most often wants first, and it reads the dialog's purpose.
    closeBtnRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      // Hand focus back to the button that opened it.
      triggerRef.current?.focus()
    }
  }, [mobOpen])

  // Hide the "გახდი ექსპერტი" (→/apply) item from users who are already an
  // expert/admin. showApplyCta(null) is true, so anon + not-yet-resolved keep
  // it (no flash-in for real visitors); only a known TUTOR/ADMIN drops it.
  const nav = NAV.filter(i => i.href !== '/apply' || showApplyCta(me?.role))

  /* WHICH ITEM IS LIT IS DERIVED HERE, from the URL — it is NOT something a
     page passes in.
     Reported 2026-08-07: „the whole menu changes on the expert page." It did.
     `activeHref` was threaded by hand and exactly TWO surfaces ever passed it
     (/tutors and /apply). So „ექსპერტები" was lit on the browse list and went
     dark the moment you opened an expert; /categories, /categories/[slug],
     /help and every other marketing page lit nothing at all while you stood on
     them. The highlight moved for reasons that had nothing to do with where the
     reader was — which is exactly how a static bar stops reading as static.
     Deriving it means a new page cannot forget, and a detail route stays lit
     under its section. The prop is kept only as an override; nothing needs it. */
  const pathname = usePathname() ?? ''
  const activePath = activeHref ?? pathname
  const isActive = (href: string) => activePath === href || activePath.startsWith(href + '/')

  return (
    <header
      // The header is `sticky` WITH a z-index, so it opens its own stacking
      // context — every z-[…] inside it (scrim, drawer) is resolved against
      // sibling headers/banners at THIS value, not at the root. That's why the
      // drawer's own z-drawer alone could never beat the cookie banner: at the
      // root the whole header still counted as 40. While the drawer is open we
      // raise the header above the banner (z-impersonate) — and still below Sheet (80)
      // / ConfirmModal (90), which is where the drawer belongs.
      // FULL-BLEED GLASS BAR (2026-07-27, replaces the short-lived floating
      // island): the surface spans the viewport edge to edge and starts at y=0
      // — no top gap, no radius, no box border, just a bottom hairline. The
      // glass lives on the inner DIV (not the <header>) so the mobile drawer and
      // its scrim stay siblings OUTSIDE it and keep the viewport as their
      // containing block. The <header> itself is a bare `sticky top-0` +
      // z-index dance.
      // HEIGHT IS LOAD-BEARING: h-16 sm:h-20 = exactly 64 / 80, which every
      // sticky offset measured off this header elsewhere assumes (`top-16`,
      // `sm:top-20`, `lg:top-[80px]`, `scroll-mt-24`). Don't retune it here —
      // fix the header if it drifts, not the consumers.
      className={`sticky top-0 ${mobOpen ? 'z-drawer' : 'z-chrome'}`}
    >
      {/* The bar. Full width; `.glass-bar` owns background/hairline/shadow/blur
          — add nothing but geometry. `-quiet` = the flat scroll-top state. */}
      <div className={`glass-bar ${scrolled ? '' : 'glass-bar-quiet'}`}>
        {/* …but the nav content still lives in the site content column, so the
            logo and the account controls line up with the page beneath. */}
        <Container className="h-16 sm:h-20 flex items-center justify-between gap-4 lg:gap-8">
        <div className="flex items-center gap-7 lg:gap-10 min-w-0">
          {/* Omit href → Logo auto-routes to the viewer's role-home (a signed-in
              expert lands on /tutor, not the anonymous marketing page). */}
          <Logo size="sm" />
          <nav className="hidden lg:flex items-center gap-1">
            {nav.map(item => {
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative h-11 px-3.5 rounded-btn font-display text-meta font-semibold uppercase inline-flex items-center transition-colors duration-fast ease-out-quart ${
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
              {/* BROWSE, for a guest (2026-08-01). The header's only prominent
                  action used to be „დაწყება" — i.e. the one thing on screen
                  asked for commitment before the visitor had seen a single
                  expert, while the marketplace's actual first intent is to look
                  around. On a phone a guest reading /blog or a profile had to
                  open the drawer and tap „ექსპერტები" to get to the catalogue.
                  ADDED, not swapped: replacing „დაწყება" would have gambled the
                  signup metric for a modest gain, since /tutors and the home
                  hero both already carry a real search field — this only helps
                  on the pages that don't. Measured at 390px: logo 63 + this 40 +
                  „დაწყება" 94 + ☰ 40 = 237px of the 342px content width. Fits.
                  GUEST-ONLY on purpose: a signed-in student's header already
                  carries ♥ + bell + avatar + ☰, and a fifth control does not
                  fit at 390px. They also have the workspace nav. */}
              <Link
                href="/tutors"
                aria-label="ექსპერტების ძებნა"
                title="ექსპერტების ძებნა"
                className="w-10 h-10 rounded-btn text-ink-600 hover:text-ink-900 hover:bg-ink-100 inline-flex items-center justify-center transition-colors duration-fast"
              >
                <Icon.search className="w-[18px] h-[18px]" />
              </Link>
              <Link
                href="/signin"
                className="hidden md:inline-flex h-11 px-4 rounded-btn font-display font-semibold text-meta uppercase text-ink-800 hover:bg-ink-100 items-center transition-colors duration-fast"
              >
                შესვლა
              </Link>
              <Link
                href="/signup"
                className="tap-shrink h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-bold text-body uppercase transition-all duration-fast ease-out-quart inline-flex items-center gap-1.5 shadow-brand-glow hover:shadow-[0_10px_32px_rgba(47,156,134,0.36)]"
              >
                დაწყება
              </Link>
            </>
          ) : (
            // Signed-in: mirror the workspace bar so a logged-in visitor on a
            // public page (home/browse) keeps their real controls — saved,
            // notifications, account menu — instead of a lone avatar.
            <>
              {/* ALWAYS visible, at every width (2026-07-31). This used to carry
                  `hidden sm:inline-flex`, so on a phone — where the workspace
                  sidebar is `hidden lg:flex` AND the BottomNav's five student
                  tabs (მთავარი · ექსპერტები · ჯავშნები · მიმოწერა · პროფილი)
                  contain no „შენახული" — a logged-in student had NO route to
                  their saved experts anywhere on a public page. The feature was
                  fully built and simply unreachable from a phone, which reads as
                  „the save function was deleted".
                  Space check at 390px: gutters 48 + four 40px controls + three
                  8px gaps = 232, leaving ~110px for the logo. It fits; if a
                  fifth control is ever added here, this is the row to re-measure.
                  Still STUDENT-only on purpose: the favourites API 403s every
                  other role (saved-experts is a client feature), so showing the
                  heart to a TUTOR/ADMIN would open a page that cannot load. */}
              {me.role === 'STUDENT' && (
                <Link
                  href="/student/favorites"
                  aria-label="შენახული"
                  className="inline-flex w-10 h-10 rounded-btn text-ink-600 hover:text-ink-900 hover:bg-ink-100 items-center justify-center transition-colors duration-fast"
                >
                  <Icon.heart className="w-[18px] h-[18px]" />
                </Link>
              )}
              <NotifBell />
              <UserMenu user={{ name: me.fullName, avatar: me.avatarUrl }} role={me.role} />
            </>
          )}
          <button
            type="button"
            ref={triggerRef}
            onClick={() => setMobOpen(o => !o)}
            aria-label="მენიუ"
            aria-expanded={mobOpen}
            className="lg:hidden w-10 h-10 rounded-btn border border-ink-200 bg-white text-ink-900 hover:bg-ink-100 inline-flex items-center justify-center transition-colors duration-fast"
          >
            {mobOpen ? <Icon.xC className="w-5 h-5" /> : <Icon.menu className="w-5 h-5" />}
          </button>
        </div>
        </Container>
      </div>

      {mobOpen && (
        <>
          {/* Explicit h-[100dvh] on scrim + drawer. Historically the header's own
              backdrop-blur made it their containing block (backdrop-filter and
              transform both create one for fixed descendants), so inset-0 /
              bottom-0 sized them to the 64px bar instead of the screen. The
              glass now lives on the inner bar DIV and these two are its
              siblings, so the viewport is the containing block again — but the
              explicit height works either way, so it stays. */}
          <button
            type="button"
            aria-label="დახურვა"
            onClick={() => setMobOpen(false)}
            className="lg:hidden fixed inset-x-0 top-0 h-[100dvh] z-drawer-scrim bg-ink-900/50 backdrop-blur-sm motion-safe:animate-fade-in-fast"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="მენიუ"
            // z-drawer inside the header's own stacking context (the header is
            // raised to z-drawer while open, see above) — an open nav dialog must
            // cover the cookie banner (z-impersonate); still below Sheet (80) /
            // ConfirmModal (90).
            ref={drawerRef}
            className="lg:hidden fixed top-0 right-0 h-[100dvh] z-drawer w-[320px] max-w-[86vw] bg-white shadow-float flex flex-col motion-safe:animate-drawer-in-r"
          >
            <div className="h-16 sm:h-20 px-5 flex items-center justify-between border-b border-ink-100 shrink-0">
              <span className="font-display text-micro font-bold uppercase text-ink-500">მენიუ</span>
              <button
                type="button"
                ref={closeBtnRef}
                onClick={() => setMobOpen(false)}
                aria-label="დახურვა"
                className="w-10 h-10 rounded-btn text-ink-700 hover:bg-ink-100 inline-flex items-center justify-center transition-colors duration-fast"
              >
                <Icon.xC className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-3">
              <ul className="stagger space-y-0.5">
                {nav.map(item => {
                  const active = isActive(item.href)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMobOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center h-12 px-3 rounded-btn text-small font-display font-semibold uppercase transition-colors duration-fast ${
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
                      className="flex items-center h-12 px-3 rounded-btn text-small font-display font-semibold uppercase text-ink-800 hover:bg-ink-100 transition-colors duration-fast"
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
                  className="tap-shrink w-full h-12 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-bold text-body-lg uppercase inline-flex items-center justify-center gap-2 shadow-brand-glow transition-all duration-fast"
                >
                  დაწყება
                </Link>
              </div>
            )}
          </aside>
        </>
      )}
    </header>
  )
}

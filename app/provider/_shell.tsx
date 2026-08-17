'use client'
// The provider workspace chrome: one bar, two links.
//
// DELIBERATELY NOT `components/tutor/WorkspaceShell`. That shell carries the
// expert's booking nav — calendar, sessions, earnings, messages — and none of
// it belongs to a subsystem with no calendar. Reusing it would put the two
// products behind one rail, which is the confusion /provider exists to avoid.
//
// Two links and no sidebar, because there are two screens. The rail those
// workspaces use earns itself at eight items; at two it is furniture. If this
// grows past four, the move is WorkspaceShell's sidebar, not a third pattern.
//
// A client component only for `usePathname` — knowing which of two links is the
// current one is the entire reason.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Container } from '@/components/Container'

const LINKS = [
  { href: '/provider/requests', label: 'მოთხოვნები' },
  { href: '/provider/offers', label: 'ჩემი შეთავაზებები' },
  // LAST, and that is the order it earns: the first two are the work, this is
  // the setup you touch once. It is in the nav at all because a master whose
  // list is empty is never routed anything and has no other way to find that
  // out — see app/provider/service-profile.
  { href: '/provider/service-profile', label: 'ჩემი სერვისები' },
]

export function ProviderShell({ isProvider, openCount = 0, children }: {
  isProvider: boolean
  /** Verified requests with a place left — the queue badge. */
  openCount?: number
  children: React.ReactNode
}) {
  const pathname = usePathname() ?? ''

  return (
    <div className="min-h-screen bg-ink-50/30">
      {/* Solid, not glass. The canon allows glass on a bar pinned to a viewport
          edge, and this one is — but the ban on backdrop-blur for un-promoted
          workspace bars still stands, and the tutor/student top bars are solid
          for the same reason. Two workspace bars that differ in material would
          read as two products. */}
      <header className="sticky top-0 z-chrome h-14 lg:h-16 border-b border-ink-200 bg-white">
        <Container className="h-full flex items-center gap-1">
          <Link href="/" className="shrink-0 mr-3" aria-label="მცოდნე">
            <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain select-none" draggable={false} />
          </Link>
          <nav aria-label="სამუშაო სივრცე" className="flex items-center gap-1 min-w-0">
            {LINKS.map(l => {
              const on = pathname === l.href || pathname.startsWith(l.href + '/')
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={on ? 'page' : undefined}
                  className={`h-11 px-3 rounded-btn inline-flex items-center gap-2 font-display text-body font-semibold transition-colors duration-fast ${
                    on ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-ink-100'
                  }`}
                >
                  {l.label}
                  {/* The same badge grammar the admin rail uses: a count on a
                      nav item is a person waiting, and it renders identically
                      on and off the active state so it never reads as two
                      different signals. */}
                  {l.href === '/provider/requests' && openCount > 0 && (
                    <span className={`min-w-[20px] h-5 px-1.5 rounded-pill inline-flex items-center justify-center text-meta font-bold tabular-nums ${
                      on ? 'bg-white text-ink-900' : 'bg-brand-600 text-white'
                    }`}>{openCount}</span>
                  )}
                </Link>
              )
            })}
          </nav>
        </Container>
      </header>

      {/* An admin reading the space is told once, at the top, rather than
          discovering it on a button that does nothing. Neutral ink and not a
          warning tint: nothing is wrong, this is simply not their screen. */}
      {!isProvider && (
        <div className="border-b border-ink-200 bg-ink-100">
          <Container className="py-2.5">
            <p className="text-small text-ink-700">ხედავ როგორც ადმინი — შეთავაზების დაწერა არ შეგიძლია.</p>
          </Container>
        </div>
      )}

      {/* The workspace rhythm — the same py-8 lg:py-10 pair /student, /tutor and
          /admin pages use (lib/design/README §5). */}
      <main className="py-8 lg:py-10">
        <Container>{children}</Container>
      </main>
    </div>
  )
}

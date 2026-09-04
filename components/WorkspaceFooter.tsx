// WorkspaceFooter — compact footer for signed-in workspace pages (student /
// tutor). The full marketing Footer is for public pages; in the workspace a
// single quiet row keeps the page grounded without repeating the sitemap.

import Link from 'next/link'
import { Logo } from './Logo'
import { Container } from '@/components/Container'

// ⚠️ THE DESKTOP FLOOR IS 24px, MATCHING components/Footer (2026-09-04). These
// carried `min-h-[40px] sm:min-h-0` — the 40px thumb floor on a phone, released
// to nothing above `sm`, which left them at their 17–22px line box for a mouse.
// 40 is a thumb rule and a cursor is not a thumb, so releasing it is right;
// releasing it to zero skips WCAG 2.2 SC 2.5.8, which asks 24×24 CSS px of ANY
// pointer. The public footer's note explains it at length.
export function WorkspaceFooter() {
  return (
    <footer className="mt-16 lg:mt-20 bg-white border-t border-ink-200">
      <Container className="py-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Logo size="sm" />
          <span className="text-meta text-ink-500 tabular-nums">© {new Date().getFullYear()} მცოდნე</span>
        </div>
        {/* min-h-[40px] below sm — these three sat at 17px on eight workspace
            pages. Same treatment the public Footer got; the row keeps its
            desktop rhythm. */}
        <div className="flex items-center gap-4 sm:gap-5 text-meta text-ink-500">
          <Link href="/help" className="inline-flex items-center min-h-[40px] sm:min-h-[24px] hover:text-ink-900 transition-colors duration-fast">დახმარება</Link>
          <Link href="/terms" className="inline-flex items-center min-h-[40px] sm:min-h-[24px] hover:text-ink-900 transition-colors duration-fast">წესები</Link>
          <Link href="/privacy" className="inline-flex items-center min-h-[40px] sm:min-h-[24px] hover:text-ink-900 transition-colors duration-fast">კონფიდენციალურობა</Link>
        </div>
      </Container>
    </footer>
  )
}

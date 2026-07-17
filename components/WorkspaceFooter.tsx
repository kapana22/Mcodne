// WorkspaceFooter — compact footer for signed-in workspace pages (student /
// tutor). The full marketing Footer is for public pages; in the workspace a
// single quiet row keeps the page grounded without repeating the sitemap.

import Link from 'next/link'
import { Logo } from './Logo'

export function WorkspaceFooter() {
  return (
    <footer className="mt-16 lg:mt-20 bg-white border-t border-ink-200">
      <div className="max-w-[1280px] mx-auto px-6 sm:px-8 py-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Logo size="sm" />
          <span className="text-[12px] text-ink-500 tabular-nums">© {new Date().getFullYear()} · ყველა უფლება დაცულია.</span>
        </div>
        <div className="flex items-center gap-5 text-[12px] text-ink-500">
          <Link href="/help" className="hover:text-ink-900 transition-colors">დახმარება</Link>
          <Link href="/terms" className="hover:text-ink-900 transition-colors">წესები</Link>
          <Link href="/privacy" className="hover:text-ink-900 transition-colors">კონფიდენციალურობა</Link>
        </div>
      </div>
    </footer>
  )
}

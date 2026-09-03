'use client'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Logo } from '@/components/Logo'
import { NotifBell } from '@/components/NotifBell'
import { UserMenu } from '@/components/UserMenu'
import { Eyebrow } from '@/components/Eyebrow'
import { titleForPath } from './navConfig'

/* THE CLIENT'S TOP BAR — rebuilt 2026-08-31 from the owner's design canvas
   („Client Space"): a 72px bar carrying an uppercase crumb on the left and the
   account on the right, over cream glass.

   ⚠️ THE CRUMB CAME BACK, AND IT IS NOT THE LABEL THAT WAS REMOVED. A page
   title lived here until 2026-08-30 and went with the note „the sidebar already
   shows the active section, so a duplicate label here just took space" — which
   was true of a label reading exactly what the lit rail row read. The canvas's
   crumb is the SCREEN's name, not the row's: the rail lights „მთავარი" and the
   bar says „ჩემი მოთხოვნები" (see NavItem.crumb). And on a phone, where there
   is no rail at all, it is the only thing that names where you are.

   ⚠️ THE HEART LEFT (2026-08-31). It was here so „შენახული" would be „one
   glanceable tap on mobile, where the sidebar is hidden" — and it has not been
   the only mobile route since 2026-07-31: BottomNav's second-to-last tab IS
   /me/favorites (components/BottomNav → STUDENT_TABS), and the desktop rail
   carries the row. Three controls to one list, on the one bar the canvas draws
   with two.

   ⚠️ THE BELL AND THE MENU STAY, and the canvas simply does not depict them —
   it draws a 34px avatar where they sit. Notifications and sign-out have no
   other home in this chrome, and „port the canvas" is not „delete a feature it
   did not need to draw". The UserMenu trigger is a 32px avatar in an h-11
   button, which is the canvas's mark at the tap floor.

   `.glass-bar` is the ported pane: rgba(251,249,245,0.9) + blur + an ink-200
   hairline, i.e. the canvas's own header values, already a primitive. */
export function ClientTopBar({ user }: { user?: { name: string; avatar?: string | null } }) {
  const path = usePathname() ?? ''
  const crumb = titleForPath(path)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`sticky top-0 z-chrome ${scrolled ? 'glass-bar' : 'glass-bar glass-bar-quiet'}`}>
      <div className="px-4 sm:px-6 lg:px-8 h-16 lg:h-[72px] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {/* The logo is the mobile rail's stand-in; on lg the sidebar has it. */}
          <span className="lg:hidden shrink-0">
            <Logo size="sm" />
          </span>
          <Eyebrow as="span" tone="muted" className="truncate">{crumb}</Eyebrow>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <NotifBell />
          <UserMenu user={user} role="USER" />
        </div>
      </div>
    </header>
  )
}

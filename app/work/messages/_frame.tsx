'use client'
import { useSelectedLayoutSegment } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { ConversationList } from '@/components/chat/ConversationList'
import type { InboxRow } from '@/lib/inboxRows'

/* Two-pane messages center frame. Desktop: conversation list (360px) +
   thread pane inside one card. Mobile: list full-width; opening a thread
   (/tutor/messages/[bookingId]) swaps to a full-screen thread — the segment
   presence decides which pane shows. The list lives in the LAYOUT so it
   doesn't remount (and refetch) on every thread switch. */
export function MessagesFrame({ children, threads }: {
  children: React.ReactNode
  /** The inbox rows, read by the server layout — see there. */
  threads: InboxRow[]
}) {
  const segment = useSelectedLayoutSegment()
  const threadOpen = segment !== null

  return (
    <div>
      <PageHeader
        // `sr-only`, never `hidden`: the h1 must stay in the accessibility tree
        // so „skip to content" and every screen-reader outline have a title to
        // land on — it is only ever hidden VISUALLY.
        //   lg+ : always, because „მიმოწერა" is the exact text of the
        //         highlighted sidebar pill ~40px to its left.
        //   <lg : only with a thread open, where the list pane collapses and
        //         the phone gives the conversation the whole screen.
        className={`mb-4 lg:mb-5 ${threadOpen ? 'sr-only' : 'lg:sr-only'}`}
        title="მიმოწერა"
      />

      {/* Mobile heights: list view reserves header + BottomNav (215px total
          chrome); on an open thread BottomNav hides (focused screen) and the
          header above collapses, so only the shell remains — top bar 56 +
          main py-6 (24+24) = 104px, plus the home-indicator safe area so the
          composer never sits behind it. */}
      {/* Mobile: the LIST view keeps its card; an OPEN thread goes full-bleed
          edge-to-edge — negative margins cancel the shell's page padding so the
          conversation gets the whole phone screen. Desktop resets to the card. */}
      <div className={`bg-white overflow-hidden lg:grid lg:grid-cols-[360px_minmax(0,1fr)] min-h-[420px] ${
        threadOpen
          ? '-mx-6 sm:-mx-8 -mt-6 h-[calc(100dvh-56px-env(safe-area-inset-bottom))] lg:mx-0 lg:mt-0 lg:h-[calc(100vh-208px)] lg:rounded-card lg:border lg:border-ink-200 lg:shadow-xs'
          : 'rounded-card border border-ink-200 shadow-xs h-[calc(100dvh-215px)] lg:h-[calc(100vh-208px)]'
      }`}>
        <div className={`${threadOpen ? 'hidden lg:flex' : 'flex'} flex-col min-h-0 h-full lg:border-r lg:border-ink-100`}>
          <ConversationList
            initialThreads={threads}
            empty={{
              title: 'მიმოწერა ჯერ არ გაქვს',
              description: 'როცა კლიენტი დაგიწერს, საუბარი აქ გამოჩნდება.',
              cta: { label: 'ჩემი სამუშაოები', href: '/work/jobs' },
            }}
          />
        </div>
        <div className={`${threadOpen ? 'flex' : 'hidden lg:flex'} flex-col min-h-0 h-full`}>
          {children}
        </div>
      </div>
    </div>
  )
}

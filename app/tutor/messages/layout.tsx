'use client'
import { useSelectedLayoutSegment } from 'next/navigation'
import { PageHeader } from '@/components/tutor/PageHeader'
import { ConversationList } from '@/components/chat/ConversationList'

/* Two-pane messages center frame. Desktop: conversation list (360px) +
   thread pane inside one card. Mobile: list full-width; opening a thread
   (/tutor/messages/[bookingId]) swaps to a full-screen thread — the segment
   presence decides which pane shows. The list lives in the LAYOUT so it
   doesn't remount (and refetch) on every thread switch. */
export default function TutorMessagesLayout({ children }: { children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment()
  const threadOpen = segment !== null

  return (
    <div>
      <PageHeader
        className={`mb-4 lg:mb-5 ${threadOpen ? 'hidden lg:flex' : ''}`}
        eyebrow="შეტყობინებები"
        title="მიმოწერა კლიენტებთან"
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
            empty={{
              title: 'ჯერ არ გაქვს მიმოწერა',
              description: 'როცა კლიენტი დაგიწერს, საუბარი აქ გამოჩნდება.',
              cta: { label: 'ჩემი ჯავშნები', href: '/tutor/bookings' },
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

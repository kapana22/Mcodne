'use client'
import { useSelectedLayoutSegment } from 'next/navigation'
import { PageHeader } from '@/components/tutor/PageHeader'
import { ConversationList } from './_components/ConversationList'

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
        title="ჩატები კლიენტებთან"
      />

      {/* Mobile heights: list view reserves header + BottomNav (215px total
          chrome); on an open thread BottomNav hides (focused screen) and the
          header above collapses, so only the shell remains — top bar 56 +
          main py-6 (24+24) = 104px, plus the home-indicator safe area so the
          composer never sits behind it. */}
      <div className={`rounded-card border border-ink-200 bg-white shadow-xs overflow-hidden lg:grid lg:grid-cols-[360px_minmax(0,1fr)] ${
        threadOpen ? 'h-[calc(100dvh-104px-env(safe-area-inset-bottom))]' : 'h-[calc(100dvh-215px)]'
      } min-h-[420px] lg:h-[calc(100vh-208px)]`}>
        <div className={`${threadOpen ? 'hidden lg:flex' : 'flex'} flex-col min-h-0 h-full lg:border-r lg:border-ink-100`}>
          <ConversationList />
        </div>
        <div className={`${threadOpen ? 'flex' : 'hidden lg:flex'} flex-col min-h-0 h-full`}>
          {children}
        </div>
      </div>
    </div>
  )
}

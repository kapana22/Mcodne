'use client'
import { useSelectedLayoutSegment } from 'next/navigation'
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
      <div className={`mb-4 lg:mb-5 ${threadOpen ? 'hidden lg:block' : ''}`}>
        <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-brand-700">
          შეტყობინებები
        </div>
        <h1 className="font-display text-[22px] sm:text-[24px] font-bold text-ink-900 tracking-tight mt-0.5">
          ჩატები კლიენტებთან
        </h1>
      </div>

      <div className="rounded-card border border-ink-200 bg-white shadow-xs overflow-hidden lg:grid lg:grid-cols-[360px_minmax(0,1fr)] h-[calc(100dvh-215px)] min-h-[420px] lg:h-[calc(100vh-208px)]">
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

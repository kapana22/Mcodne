'use client'
import { useSelectedLayoutSegment } from 'next/navigation'
import { Container } from '@/components/Container'
import { PageHeader } from '@/components/PageHeader'
import { ConversationList } from '@/components/chat/ConversationList'

/* Two-pane messages center for the student side — lives inside the student
   workspace shell (sidebar + top bar), mirroring the tutor
   (app/tutor/messages/layout.tsx). Desktop: conversation list (360px) + thread
   pane inside one card. Mobile: the list IS the page; opening a thread swaps to
   a focused thread (BottomNav hides on that route, so the composer owns the
   bottom edge). The list lives in the LAYOUT so it doesn't remount on every
   thread switch. */
export default function StudentMessagesLayout({ children }: { children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment()
  const threadOpen = segment !== null

  return (
    <Container as="main" className={`w-full py-6 lg:py-8 flex-1 flex flex-col ${threadOpen ? 'max-lg:!px-0 max-lg:!py-0' : ''}`}>
      <PageHeader
        className={`mb-4 lg:mb-5 ${threadOpen ? 'hidden lg:block' : ''}`}
        eyebrow="შეტყობინებები"
        title="მიმოწერა ექსპერტებთან"
      />

      {/* Mobile heights: on the list view the BottomNav is present; on an open
          thread the BottomNav hides, so only the top bar + page padding remain,
          plus the home-indicator safe area so the composer never sits behind
          it. */}
      {/* Mobile: the LIST view keeps its card frame; an OPEN thread goes
          full-bleed edge-to-edge (no border/rounding/padding) so the phone
          gives the conversation the whole screen. Desktop always renders the
          two-pane card. */}
      <div className={`bg-white overflow-hidden lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:rounded-card lg:border lg:border-ink-200 lg:shadow-xs min-h-[420px] lg:h-[calc(100vh-208px)] ${
        threadOpen
          ? 'h-[calc(100dvh-56px-env(safe-area-inset-bottom))]'
          : 'rounded-card border border-ink-200 shadow-xs h-[calc(100dvh-215px)]'
      }`}>
        <div className={`${threadOpen ? 'hidden lg:flex' : 'flex'} flex-col min-h-0 h-full lg:border-r lg:border-ink-100`}>
          <ConversationList
            empty={{
              title: 'ჯერ არ გაქვს მიმოწერა',
              description: 'როცა ექსპერტს მისწერ, საუბარი აქ გამოჩნდება.',
              cta: { label: 'იპოვე ექსპერტი', href: '/tutors' },
            }}
          />
        </div>
        <div className={`${threadOpen ? 'flex' : 'hidden lg:flex'} flex-col min-h-0 h-full`}>
          {children}
        </div>
      </div>
    </Container>
  )
}

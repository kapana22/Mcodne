// One offer's conversation, in the master's own space.
//
// ⚠️ WHY THIS EXISTS BESIDE /work/messages/o/<id> (2026-08-19). The unified
// inbox lives under the (expert) guard, and an approved master keeps role
// CLIENT (lib/hats) — that guard sends them to their queue, so the inbox route
// is a door they can never open. Their conversations would have had nowhere to
// go the moment the chat left the offers list. Same pane, same rules, reached
// from the list they DO have; the expert reads it inside the messages centre.
import type { Metadata } from 'next'
import { Card } from '@/components/Card'
import { PageHeader } from '@/components/PageHeader'
import { OfferThreadPane } from '@/components/chat/OfferThreadPane'

export const dynamic = 'force-dynamic'

// ⚠️ THE TAB SAID „მოთხოვნები" (2026-09-01). Like its sibling one folder up,
// this page had no metadata and inherited the (provider) layout's — the
// QUEUE's title, on a screen whose own h1 is „მიმოწერა". The string below is
// app/work/messages/layout's, verbatim: the OTHER address that opens exactly
// this pane, so the two doors into one conversation name it the same thing.
export const metadata: Metadata = {
  title: 'მიმოწერა — მცოდნე',
  robots: { index: false, follow: false },
}

export default async function ProviderOfferThreadPage({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params
  return (
    <>
      <PageHeader eyebrow="შეთავაზებები" title="მიმოწერა" />
      {/* The shell is <Card> rather than the hand-spelled `rounded-card border
          border-ink-200 bg-white` it was (2026-09-01) — the exact surface the
          primitive owns, so a future radius or border change reaches this pane
          with everything else. `padding="none"`: the pane draws its own. */}
      <Card padding="none" className="mt-6 flex flex-col shadow-xs overflow-hidden min-h-[420px]">
        <OfferThreadPane offerId={offerId} backHref="/work/offers" />
      </Card>
    </>
  )
}

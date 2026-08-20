// One offer's conversation, in the master's own space.
//
// ⚠️ WHY THIS EXISTS BESIDE /work/messages/o/<id> (2026-08-19). The unified
// inbox lives under the (expert) guard, and an approved master keeps role
// CLIENT (lib/hats) — that guard sends them to their queue, so the inbox route
// is a door they can never open. Their conversations would have had nowhere to
// go the moment the chat left the offers list. Same pane, same rules, reached
// from the list they DO have; the expert reads it inside the messages centre.
import { PageHeader } from '@/components/PageHeader'
import { OfferThreadPane } from '@/components/chat/OfferThreadPane'

export const dynamic = 'force-dynamic'

export default async function ProviderOfferThreadPage({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params
  return (
    <>
      <PageHeader eyebrow="შეთავაზებები" title="მიმოწერა" />
      <div className="mt-6 flex flex-col rounded-card border border-ink-200 bg-white shadow-xs overflow-hidden min-h-[420px]">
        <OfferThreadPane offerId={offerId} backHref="/work/offers" />
      </div>
    </>
  )
}

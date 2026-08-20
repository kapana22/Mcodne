// An offer conversation, inside the ONE inbox.
//
// The third thread kind at /work/messages, beside a booking (`[bookingId]`) and
// a pre-booking pair (`u/[userId]`). It renders in the layout's right pane like
// the other two — the whole point of the change is that a provider answering a
// client never leaves the list they were reading.
//
// The pane itself is shared (components/chat/OfferThreadPane): the masking, the
// ownership `where` and the contact gate live there, once, because a WORK-only
// provider reads the same conversation in their own space.
import { OfferThreadPane } from '@/components/chat/OfferThreadPane'

export const dynamic = 'force-dynamic'

export default async function OfferThreadRoute({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params
  return <OfferThreadPane offerId={offerId} backHref="/work/messages" />
}

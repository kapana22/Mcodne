// /provider — the workspace root.
//
// It has no screen of its own: the two screens are /provider/requests and
// /provider/offers, and a landing page between them would be a page whose only
// content is two links the bar above already shows.
//
// So it redirects to the queue — the one somebody opens this space to read.
//
// ⚠️ THE GATE IS THE LAYOUT'S, and it runs first: a redirect here would
// otherwise be reachable by anyone, which would confirm the route exists to
// exactly the people the 404 is for. Next resolves the layout before the page,
// so a viewer the allowlist does not admit never reaches this line.

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function Page() {
  redirect('/provider/requests')
}

// /work/profile — „ჩემი გვერდი", the ONE page a provider's public card is
// written on.
//
// ⚠️ IT WAS TWO PAGES UNTIL 2026-08-30. „ჩემი სერვისები" (/work/services)
// answered „რას ვყიდი" and this one answered „ვინ ვარ" — a split that made sense
// while they were two database rows and stopped making sense on 2026-08-24, when
// `TutorProfile` was absorbed into `ServiceProfile` and the two became one. The
// screens did not follow, so for six days one row had two editors, two preview
// cards, two „ნახე შენი პროფილი" buttons and six save controls, and one column
// (`available`) had two switches that described it differently.
//
// Owner, 2026-08-30: „ეს ორი არის და შიგნით ერთი და იგივე ინფოს აკეთებს თითქოს
// და რატომ, თან არცერთი მხარე არაა კომფორტულად მოწყობილი."
//
// One row, one editor — see `_editor.tsx` for why that is the product's own
// shape and not a tidy. /work/services 308s here (middleware.ts), and the two
// controls that touch nothing a client reads — the password and the visibility
// switch — are /work/account.
//
// ⚠️ THE GATE IS THIS FILE'S OWN, and it is unchanged: signed in, on the
// allowlist, and holding a provider identity. 404 AND NEVER 403 — a 403 tells a
// stranger the page is real and worth coming back to (lib/requestsServer says
// it at length).

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { requestsViewer } from '@/lib/requestsServer'
import { ProfileEditor } from './_editor'

// Re-verified on every request, like the layouts beside it: this page must
// never be served from a render that outlived a session or the allowlist row
// behind it.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'ჩემი გვერდი — მცოდნე',
  robots: { index: false, follow: false },
}

export default async function Page() {
  const user = await getCurrentUser()
  if (!user) notFound()

  const viewer = await requestsViewer()
  // BOTH conditions, because they answer different questions: `providerAllowed`
  // is „may you open a provider surface at all" (the supply-side switch + the
  // allowlist) and `provider` is „is there an identity to hang a ServiceProfile
  // on" (an admin who is not on the list has no row to fill in).
  if (!viewer.providerAllowed || viewer.provider === null) notFound()

  return <ProfileEditor />
}

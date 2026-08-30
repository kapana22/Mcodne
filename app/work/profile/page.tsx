// /work/profile — „ვინ ვარ", for whoever is asking.
//
// ⚠️ WHY THIS PAGE MOVED OUT OF `(expert)` (2026-08-21). Owner, looking at the
// workspace rail: „ეს სივრცე ძველებურად არის მოწყობილი — კონსულტაციაზეა
// აგებული და ამიტომ არაკომფორტულია."
//
// It was literally true, and this route was the clearest instance of it. /work
// grew as the EXPERT's workspace and the service screens were added beside it,
// so the two halves answered the same two questions in different places:
//
//     ვინ ვარ?     expert → /work/profile      master → inside /work/services
//     რას ვყიდი?   expert → /work/services     master → /work/services
//
// The rail therefore carried „პროფილი" AND „ჩემი სერვისები" while, for a
// master, the second one was BOTH — a page titled „my services" that opened
// with a photo upload and a paragraph about themselves — and the first one did
// not exist for them at all: `(expert)` requires the EXPERT role and redirects a
// WORK-only provider out. Half the supply side had no profile page on a site
// whose whole catalogue is profiles.
//
// One question per page, the same two pages for everybody. What SELLS is
// /work/services (trades, cities, prices, consultations); who you ARE is here.
//
// ⚠️ THE GATE IS THE UNION, AND IT IS THIS FILE'S OWN — exactly like
// /work/services and /work/jobs, and for the same reason: `(expert)` requires
// the EXPERT role and `(provider)` 404s anybody the allowlist does not name, so
// neither group is right for a page BOTH must open. Signed in, and holding at
// least one capability; 404 and never 403, because a 403 tells a stranger the
// page is real.
//
// ⚠️ AND BOTH HALVES DRAW WHEN SOMEBODY HOLDS BOTH. There is no „primary"
// capability to pick a winner with — a person who sells consultations AND does
// repairs has two profiles in the database, `TutorProfile` and `ServiceProfile`,
// each with its own photo and its own sentence, each shown on a different card
// in the catalogue. Rendering one and hiding the other would leave a public
// profile that nothing on the site can edit, which is the bug this page exists
// to end rather than to move.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { requestsViewer } from '@/lib/requestsServer'
import { PageHeader } from '@/components/PageHeader'
import { ExpertProfileEditor } from './_expertClient'
import { MasterProfileEditor } from './_master'

// Re-verified on every request, like the layouts beside it: this page must
// never be served from a render that outlived a session or a capability.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'პროფილი — მცოდნე', robots: { index: false, follow: false } }

export default async function Page() {
  const user = await getCurrentUser()
  if (!user) notFound()

  const viewer = await requestsViewer()
  // BOTH conditions, the same pair /work/services asks: `providerAllowed` is
  // „may you open a provider surface at all" and `provider` is „is there an
  // identity to hang a ServiceProfile on".
  if (!viewer.providerAllowed || viewer.provider === null) notFound()

  // ⚠️ ONE EDITOR SINCE 2026-08-24, AND IT BRINGS ITS OWN HEADER. There were
  // two side by side — the expert's (headline, sphere, professions, years,
  // languages, links, credentials) and the trades provider's (photo, sentence,
  // photos of finished work) — because the two halves were two rows in two
  // tables, each with its own photo and its own paragraph, each shown on a
  // different card. One row, one editor: the professional fields are the tabs
  // below and the photo block sits under them.
  return (
    <div>
      <ExpertProfileEditor />

      {/* ⚠️ THE HEADING WAS „ფოტო და ნამუშევრები" AND IT NAMED TWO CARDS
          (2026-08-29). One of them was a second uploader for the same face the
          ავატარი block above already sets — see _master.tsx for what that cost
          — and with it gone this section holds work photos and nothing else.
          The card inside is already titled „ნამუშევრის ფოტოები", so a heading
          over it would be the word twice; what is left is the rule that a
          separate subject gets a separate band. */}
      <section className="mt-12 pt-10 border-t border-ink-100">
        <MasterProfileEditor />
      </section>
    </div>
  )
}

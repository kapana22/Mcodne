// /work — THE SHELL, and nothing else. One chrome for the whole supply side:
// the expert's items and the master's items in one rail, each group drawn only
// for the capability that owns it (stage 6, 2026-08-19).
//
// ⚠️ NOT A GUARD. The guards live one level down, in the route groups —
// app/work/(expert)/layout.tsx (requireRole → /signin) and
// app/work/(provider)/layout.tsx (requestsViewer().providerAllowed → 404) —
// and this file must never redirect, never notFound(), and must render NOTHING
// but children when there is no session: a signed-out visitor who guesses
// /work/requests has to get the same bare 404 an unknown URL gets, not a
// workspace frame around it that says „there is something here".

import { getCurrentUser } from '@/lib/auth'
import { capabilitiesOf } from '@/lib/capabilities'
import { prisma } from '@/lib/prisma'
import { providersOn } from '@/lib/requests'
import { requestsViewer } from '@/lib/requestsServer'
import { ROLE, asRole } from '@/lib/roles'
import { routingWhere } from '@/lib/serviceProfile'
import { ensureDbReady } from '@/lib/dbBoot'
import { grantEarnedTasks } from '@/lib/creditsServer'
import { WorkspaceShell } from '@/components/tutor/WorkspaceShell'

// Re-verify on every request for this segment: the shell must never be served
// from a cached render that outlived the session or a capability behind it.
export const dynamic = 'force-dynamic'

export default async function WorkLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) return <>{children}</>

  const isAdmin = user.role === ROLE.ADMIN
  const caps = await capabilitiesOf(user.id)
  // The master's group follows the same gate its screens do
  // (app/work/(provider)/layout.tsx): the WORK capability, or whoever the
  // requests allowlist admits by another door — an admin, a company member.
  // Read here only to decide what to DRAW; the pages still gate themselves.
  // Nothing at all when the supply side is switched off — the items would
  // lead to the middleware's 404.
  const viewer = providersOn() ? await requestsViewer() : null
  const groups = {
    expert: isAdmin || user.role === ROLE.PROVIDER || caps.includes('CONSULT'),
    work: viewer !== null && (caps.includes('WORK') || viewer.providerAllowed),
  }

  // ⚠️ THE GRANT RUNS ON THE SHELL, NOT ON ONE PAGE (2026-08-21). It used to sit
  // in app/work/page.tsx alone, and that is the whole reason the balance „did
  // not exist": /work was the one screen a service provider was never sent to
  // (lib/hats → HAT_HOME.MASTER pointed at the queue, and the phone's tab bar
  // had no route to the home at all). Measured on live data that day: BOTH
  // service providers had zero grants, one of them holding 85₾ of completed
  // tasks and a −5₾ balance from the single offer they had sent; 24 of 27
  // experts likewise, having never opened the home screen since the feature
  // shipped. A bonus that pays only the people who happen to walk past one door
  // is not a bonus.
  //
  // Here it pays on ANY workspace screen — the services editor, the queue, the
  // offers list — which is also where the profile is actually filled in, so the
  // credit is waiting by the time they look. Idempotent by a unique index and
  // not by a check (lib/creditsServer), so running it on every render is
  // correct rather than merely tolerable; it costs one `findMany` on an indexed
  // pair once every task is paid.
  //
  // ⚠️ CAPABILITY-GATED, because an ADMIN passes `groups.work` by role alone and
  // has no supply-side profile to score.
  if (caps.length > 0) {
    await ensureDbReady()
    await grantEarnedTasks(user.id)
  }

  // The queue badge — how many verified requests still have a place. Same
  // philosophy as the admin rail's badges: a number on a nav item means a
  // person is waiting behind it. One indexed count per page load, and only for
  // somebody who has the item.
  // ⚠️ NARROWED THE SAME WAY THE LIST IS (2026-08-18). This used to be a
  // platform-wide count while the page beside it filtered by the viewer's own
  // trades and cities — so the badge advertised work that the queue would never
  // show, and kept advertising it to a master who had switched themselves off.
  // One helper, two readers: see lib/serviceProfile → routingWhere.
  let openRequests = 0
  if (groups.work) {
    const svc = await prisma.serviceProfile.findFirst({
      where: {
        OR: [
          { userId: user.id },
          { company: { members: { some: { userId: user.id } } } },
        ],
      },
      select: { services: true, areas: true, available: true },
    })
    openRequests = await prisma.serviceRequest.count({
      where: {
        status: 'VERIFIED',
        offerCount: { lt: prisma.serviceRequest.fields.offerLimit },
        ...(routingWhere(svc) ?? {}),
      },
    })
  }

  return (
    <WorkspaceShell
      // ⚠️ THE FIELDS THE CHROME NEEDS AND NOTHING MORE. Passing the whole
      // row would put a password hash into a client component's props.
      user={{ name: user.fullName, avatar: user.avatarUrl ?? undefined }}
      role={asRole(user.role)}
      groups={groups}
      openRequests={openRequests}
      // An ADMIN passes the requests gate by role and has no provider identity
      // — they can read the master's screens to see what a master sees, and
      // the offer form refuses them (POST /api/provider/offers answers 404
      // with no identity to attach). The shell says so instead of showing a
      // control that cannot work.
      isProvider={viewer === null || viewer.provider !== null}
    >
      {children}
    </WorkspaceShell>
  )
}

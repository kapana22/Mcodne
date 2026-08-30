// /work — THE SHELL, and nothing else. One chrome for the whole supply side.
//
// ⚠️ IT USED TO DRAW TWO GROUPS OF ITEMS — the expert's and the master's, each
// gated on its own capability. There is one provider since 2026-08-24 and one
// rail; the only conditional row left is the request queue, which follows the
// allowlist rather than a capability.
//
// ⚠️ NOT A GUARD. The guards live one level down, in the route groups —
// app/work/(expert)/layout.tsx (requireRole → /signin) and
// app/work/(provider)/layout.tsx (requestsViewer().providerAllowed → 404) —
// and this file must never redirect, never notFound(), and must render NOTHING
// but children when there is no session: a signed-out visitor who guesses
// /work/requests has to get the same bare 404 an unknown URL gets, not a
// workspace frame around it that says „there is something here".

import { getCurrentUser } from '@/lib/auth'
import { isProvider } from '@/lib/capabilities'
import { providersOn } from '@/lib/requests'
import { requestsViewer, openRequestCount } from '@/lib/requestsServer'
import { asRole } from '@/lib/roles'
import { ensureDbReady } from '@/lib/dbBoot'
import { balanceOf, grantEarnedTasks } from '@/lib/creditsServer'
import { WorkspaceShell } from '@/components/tutor/WorkspaceShell'

// Re-verify on every request for this segment: the shell must never be served
// from a cached render that outlived the session or a capability behind it.
export const dynamic = 'force-dynamic'

export default async function WorkLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) return <>{children}</>

  const provider = await isProvider(user.id)
  // The master's group follows the same gate its screens do
  // (app/work/(provider)/layout.tsx): the WORK capability, or whoever the
  // requests allowlist admits by another door — an admin, a company member.
  // Read here only to decide what to DRAW; the pages still gate themselves.
  // Nothing at all when the supply side is switched off — the items would
  // lead to the middleware's 404.
  const viewer = providersOn() ? await requestsViewer() : null
  // ⚠️ ONE GROUP SINCE 2026-08-24. There were two — the consultation tools
  // (განრიგი · შემოსავალი) and the request queue — and the first was drawn from
  // `consultRoomVerdict`, a rule that existed because a service provider kept
  // meeting a booking calendar they had nothing to put in. The consultation
  // tools are gone; what is left is the queue, which still follows the
  // allowlist: the WORK capability, or whoever is admitted by another door — an
  // admin, a company member. Read here only to decide what to DRAW; the pages
  // still gate themselves.
  const groups = { work: viewer !== null && (provider || viewer.providerAllowed) }

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
  // The balance is read AFTER the grant on purpose: a provider who has just
  // finished a field must not be shown yesterday's number for one navigation.
  let balanceTetri: number | null = null
  // What finishing the profile is still worth, drawn by the rail on every
  // workspace screen. It rides back from the grant rather than costing a second
  // read of the same facts — see grantEarnedTasks.
  let unearnedTetri = 0
  if (provider) {
    await ensureDbReady()
    unearnedTetri = (await grantEarnedTasks(user.id)).unearnedTetri
    balanceTetri = await balanceOf(user.id)
  }

  // ⚠️ THE SAME HELPER THE THREE SCREENS USE (2026-08-29). This count is drawn
  // in four places — the rail badge here and the „ახალი" stage on each screen
  // of the flow — and it is exactly the number that was wrong before for want
  // of one source: the badge once counted platform-wide while the list beside
  // it filtered by the viewer's own trades. See lib/requestsServer.
  const openRequests = groups.work ? await openRequestCount(user) : 0

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
      balanceTetri={balanceTetri}
      unearnedTetri={unearnedTetri}
    >
      {children}
    </WorkspaceShell>
  )
}

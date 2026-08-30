import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { ensureDbReady } from '@/lib/dbBoot'
import { pageMetadata } from '@/lib/pageSeo'
import { ROLE } from '@/lib/roles'
import { isProvider } from '@/lib/capabilities'
import { PublicDoor } from './_door/PublicDoor'
import { JoinClient } from './JoinClient'

// Session-dependent: never statically render or cache this shell, or a guest
// could be served a signed-in render (or vice-versa).
export const dynamic = 'force-dynamic'

// ⚠️ `?can=` IS GONE (2026-08-24), AND WITH IT TWO PITCHES. The parameter named
// one of two halves — CONSULT or WORK — and picked the landing page, the
// metadata row and the wizard to open. There is one thing to register now, so
// there is one pitch and one form; `/join?can=WORK` simply lands on the door,
// which is what every navigation link on the site already pointed at.
//
// The SEO registry row `apply-master` stays in lib/pageSeoDefs as retired — a
// SiteText key is a DB row and is never deleted.

// Editable in ადმინი → ტექსტები (group „SEO — …"). See lib/pageSeo.
export const generateMetadata = async () => pageMetadata('apply', '/join')

export default async function Page() {
  const user = await getCurrentUser()

  // ⚠️ THE BARE ADDRESS IS THE DOOR (2026-08-20). It used to be a pitch, with
  // the ONE question this whole subsystem is built on (the profession) behind
  // the sign-up wall. The pitch is still what a guest reads — it is the same
  // page — but the question is on it, above the fold, and the account is asked
  // for afterwards.
  if (!user) return <PublicDoor />

  if (user.role === ROLE.ADMIN) redirect('/admin')

  await ensureDbReady()

  // Already selling → their real screen. /work carries its own gate and shows
  // the queue as a cell, and it is the ONLY screen that grants the profile
  // bonus; somebody who finishes the door and lands anywhere else never learns
  // the 100₾ exists. Same destination as lib/hats → HAT_HOME.PROVIDER.
  if (await isProvider(user.id)) redirect('/work')

  return <JoinClient me={user as any} />
}

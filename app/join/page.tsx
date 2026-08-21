// /join — the ONE onboarding door (2026-08-19). It replaced /apply (the expert
// application) and /apply/master (the ხელოსანი application), which now 308
// here from the middleware. The two wizards moved with it — ./_expert and
// ./_master — untouched inside; JoinClient decides which one opens.
//
// Session handling is the union of the two pages it replaced:
//   · guest      → the crawlable pitch (the expert one, or the master one when
//                  the URL asks for WORK alone), CTAs into /signup?redirect=/join
//   · ADMIN      → /admin, never a form that could demote them (regression §I)
//   · everybody  → the door, offered only the halves they do not have yet:
//                  an approved expert is not asked to consult again, an
//                  admitted master is not asked to work again, and the WORK
//                  half is not drawn at all while FEATURE_PROVIDERS is off.
//   · nothing left to offer → their workspace, as the old pages did.
//
// ⚠️ NOT in PROVIDER_PATH_PREFIXES on purpose. The old /apply/master 404ed
// with the supply switch; this page must stay up for the expert half, so the
// gate is `providersOn()` around the WORK half, here, and nowhere else.

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { ensureDbReady } from '@/lib/dbBoot'
import { pageMetadata } from '@/lib/pageSeo'
import { ROLE } from '@/lib/roles'
import { providersOn } from '@/lib/requests'
import { capabilitiesOf, parseCapabilities, type Capability } from '@/lib/capabilities'
import { ApplyMarketing } from './_expert/ApplyMarketing'
import { MasterApplyMarketing } from './_master/_marketing'
import { PublicDoor } from './_door/PublicDoor'
import { JoinClient } from './JoinClient'

// Session-dependent: never statically render or cache this shell, or a guest
// could be served a signed-in render (or vice-versa).
export const dynamic = 'force-dynamic'

type Search = Promise<Record<string, string | string[] | undefined>>

/** `?can=WORK` on its own means the trades pitch, and only while it exists. */
function wantsWorkOnly(can: Capability[]): boolean {
  return providersOn() && can.includes('WORK') && !can.includes('CONSULT')
}

/** `?can=CONSULT` on its own means the „გახდი ექსპერტი" pitch. */
function wantsConsultOnly(can: Capability[]): boolean {
  return can.includes('CONSULT') && !can.includes('WORK')
}

// Editable in ადმინი → ტექსტები (group „SEO — …"). See lib/pageSeo. The two
// registry rows keep their old ids — they are DB keys, never renamed.
export const generateMetadata = async ({ searchParams }: { searchParams: Search }) =>
  wantsWorkOnly(parseCapabilities((await searchParams).can))
    ? pageMetadata('apply-master', '/join?can=WORK')
    : pageMetadata('apply', '/join')

export default async function Page({ searchParams }: { searchParams: Search }) {
  const can = parseCapabilities((await searchParams).can)
  const user = await getCurrentUser()

  // ⚠️ THREE GUEST VIEWS, AND THE BARE ADDRESS IS THE DOOR (2026-08-20).
  //
  // It used to be two — the consultation pitch by default, the trades pitch on
  // `?can=WORK` — so the ONE question this whole subsystem is built on (the
  // profession, from which the capabilities are derived) sat behind the
  // sign-up wall, and the default pitch named the consultation in its first
  // sentence, which is the hierarchy upside down (CLAUDE.md rule 4).
  //
  // Now: a link that NAMES a half gets that half's pitch — both are real
  // landing pages for real search intent and both stay crawlable — and the
  // bare address, which is what every navigation link and every button on the
  // site now points at, asks the question instead of the wall.
  if (!user) {
    if (wantsWorkOnly(can)) return <MasterApplyMarketing />
    if (wantsConsultOnly(can)) return <ApplyMarketing />
    return <PublicDoor preset={can} />
  }

  if (user.role === ROLE.ADMIN) redirect('/admin')

  await ensureDbReady()
  const have = await capabilitiesOf(user.id)

  const offer: Capability[] = []
  // ⚠️ SERVICE FIRST, ALWAYS (2026-08-20). This list is the ORDER the tiles are
  // drawn in, and those tiles are the first thing anybody who wants to sell on
  // this site reads. CONSULT was pushed first, so the door opened with the
  // consultation — a statement about what this site is, made by a line of code
  // nobody thought of as copy. CLAUDE.md → THE HIERARCHY, rule 4: wherever both
  // appear, the service comes first.
  // The profile, not only the role: an approved expert always has both.
  if (providersOn() && !have.includes('WORK')) offer.push('WORK')
  if (user.role !== ROLE.PROVIDER && !have.includes('CONSULT')) offer.push('CONSULT')

  // Nothing left to apply for → their real screen.
  //
  // ⚠️ ONE DESTINATION FOR BOTH HALVES (2026-08-21). This branched, and the
  // service half landed on the provider queue (/work/requests) — a screen
  // with no balance on it, on a deployment where /work is the only screen
  // that grants the profile bonus at all. Somebody who finishes the door and
  // is shown a list of other people's jobs never learns the 100₾ exists.
  // /work opens for either capability (it carries its own gate) and shows the
  // queue as a cell, so nothing is lost by arriving one screen earlier. Same
  // change as lib/hats → HAT_HOME.MASTER; the two doors have to agree.
  if (offer.length === 0) redirect('/work')

  return (
    <JoinClient
      offer={offer}
      preset={can.filter(c => offer.includes(c))}
      me={user as any}
    />
  )
}

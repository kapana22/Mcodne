// The one inbox's guard — and the reason it is NOT in the (expert) group.
//
// ⚠️ THE INBOX WAS UNREACHABLE FOR THE PEOPLE IT WAS BUILT FOR (2026-08-19).
// Booking threads and offer threads were merged into one list, and the list was
// left inside `app/work/(expert)`, whose layout sends anybody holding only the
// WORK capability to /work/requests — an approved master keeps role CLIENT
// (lib/hats says why), so the one person with offer threads could never open
// the page carrying them.
//
// So the inbox sits outside both route groups and states its own rule: signed
// in, and offering SOMETHING. A visitor who offers nothing gets the same answer
// an unknown URL gets — the requests subsystem's 404-never-403 rule, which
// app/work/(provider)/layout.tsx explains at length.
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { capabilitiesOf } from '@/lib/capabilities'
import { ROLE } from '@/lib/roles'
import { MessagesFrame } from './_frame'

export const dynamic = 'force-dynamic'

export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const privileged = user.role === ROLE.EXPERT || user.role === ROLE.ADMIN
  if (!privileged) {
    const caps = await capabilitiesOf(user.id)
    if (caps.length === 0) notFound()
  }
  return <MessagesFrame>{children}</MessagesFrame>
}

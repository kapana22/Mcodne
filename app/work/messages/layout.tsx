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
import { isProvider } from '@/lib/capabilities'
import { ROLE } from '@/lib/roles'
import { requestAccessOf } from '@/lib/requestsServer'
import { offerInboxRows } from '@/lib/inboxRows'
import { MessagesFrame } from './_frame'

export const dynamic = 'force-dynamic'

export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const privileged = user.role === ROLE.PROVIDER || user.role === ROLE.ADMIN
  if (!privileged && !(await isProvider(user.id))) notFound()

  // ⚠️ THE LIST ARRIVES WITH THE PAGE (2026-08-30). The left pane fetched
  // /api/work/threads after mount, so a first visit to the inbox showed an
  // empty column that filled a round trip later — the same „ნახევარს ტვირთავს
  // და მერე ჩნდება" the owner reported, in the one screen where the missing
  // thing is a person waiting for an answer.
  //
  // The SAME call the route makes (lib/inboxRows → offerInboxRows, off the same
  // allowlist read), so the seeded rows and the polled rows cannot disagree —
  // and the poll stays, because a message can arrive while the page is open.
  // Returns [] for anybody the allowlist does not admit, an ADMIN included, so
  // there is no second gate to keep in step.
  const threads = await offerInboxRows(await requestAccessOf(user.id))
  return <MessagesFrame threads={threads}>{children}</MessagesFrame>
}

// /me/messages — THE CLIENT'S CONVERSATIONS, AS AN INDEX (rebuilt 2026-09-02).
//
// ⚠️ IT WAS A TWO-PANE INBOX AND IT IS A LIST NOW, and the reason is the one
// the owner gave: „10 ჯერ ერთი და იგივე რამის დახატვა და გამოტანა გადავიტანოთ
// და ერთი დიზაინ პატერნით ვიმუშაოთ." The right-hand pane drew an offer
// conversation. The request room draws the same conversation, beside the price
// it is about and the button that accepts it. One thread, two screens — and the
// weaker of the two was the one this room's own rail pointed at.
//
// So the room is where a client talks, and this is the list that says WHO
// wrote. Every row goes to `/me/r/<ref>?o=<offerId>` (through the resolver at
// ./o/[offerId], which is what keeps the reference out of the link) and the
// conversation is already open on arrival.
//
// ⚠️ THE PROVIDER'S INBOX KEEPS ITS TWO PANES, AND THAT IS NOT AN INCONSISTENCY
// (app/work/messages). The two rooms are counting different things. A
// provider's unit of work IS the conversation — they hold a dozen, each on a
// different job, and a pane beside the list is exactly right. A client's unit
// is the REQUEST: two or three of them, each holding several conversations that
// only mean anything next to each other's prices. Drawing the client's threads
// as a flat list of peers was borrowing the supply side's shape for a job that
// does not have it. `ConversationList` and `ConversationRow` are still shared,
// so the ROW is drawn one way in both rooms; only the frame differs.
//
// ⚠️ THE LAYOUT THAT USED TO SIT BESIDE THIS FILE IS GONE. It held the guard,
// the loader and `InboxFrame`; with no pane there is no second slot to fill, so
// a layout wrapping a single page was one file of indirection for nothing.
// ./o/[offerId] carries its own guard — ownership in the `where` — and never
// depended on this one.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { requestsOn } from '@/lib/requests'
import { clientInboxRows } from '@/lib/inboxRows'
import { Container } from '@/components/Container'
import { PageHeader } from '@/components/PageHeader'
import { ConversationList } from '@/components/chat/ConversationList'

// The room's own name — see app/me/layout for why the client space had none
// until 2026-08-31.
export const metadata: Metadata = { title: 'მიმოწერა — მცოდნე' }

export const dynamic = 'force-dynamic'

export default async function ClientMessagesPage() {
  const user = await requireUser()
  // 404 rather than a redirect or an empty room: with the subsystem dark this
  // address must answer exactly what an unknown URL answers.
  if (!requestsOn()) notFound()

  // ⚠️ THE LIST ARRIVES WITH THE PAGE, the lesson /work/messages learnt on
  // 2026-08-30: a pane that fetches after mount shows an empty column and fills
  // it a round trip later, on the one screen where the missing thing is a
  // person waiting for an answer. The SAME call /api/me/threads makes, so the
  // seeded rows and the polled rows cannot disagree.
  const threads = await clientInboxRows(user.id)

  return (
    /* `content` (820px), not `wide`. A list of conversations is a column of
       text; the request room next door is the wide one because it compares
       things side by side. */
    <Container as="main" size="content" className="flex-1 py-7 lg:py-8 pb-12">
      <PageHeader
        className="mb-5"
        title="მიმოწერა"
        sub={threads.length > 0 ? 'ყველა საუბარი შენს მოთხოვნებზე' : undefined}
      />

      {/* The panel `ConversationList` expects to be inside — it renders its
          search field against a top border and its rows against dividers, and
          its empty state uses the `inline` variant precisely because a card is
          already around it. */}
      <div className="flex flex-col overflow-hidden rounded-card border border-ink-100 bg-white">
        <ConversationList
          initialThreads={threads}
          endpoint="/api/me/threads"
          empty={{
            title: 'მიმოწერა ჯერ არ გაქვს',
            description: 'როცა ექსპერტი შენს მოთხოვნაზე დაგიწერს, საუბარი აქ გამოჩნდება.',
            cta: { label: 'ჩემი მოთხოვნები', href: '/me' },
          }}
        />
      </div>
    </Container>
  )
}

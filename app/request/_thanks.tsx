'use client'
import Link from 'next/link'
// The terminal state — replaces the wizard entirely, because a live form under
// a thank-you card is an invitation to send it twice.
//
// ⚠️ IT IS NO LONGER A TERMINUS (2026-08-17). It used to be a card, a code and
// „დაგირეკავთ" — and then nothing, for hours, while an admin phoned and
// providers were routed. Owner: „ეს ფორმასავით შემოდის." The screen now carries
// the two things a person actually has at that moment:
//
//   1. A CONVERSATION with us, open and live (lib/requestThread). Somewhere to
//      add the thing they forgot, ask whether it arrived, and see whether
//      anybody is at the desk.
//   2. A SECOND ROUTE. Waiting for offers is one way to be helped; the other is
//      going and picking somebody. The request is already filed under a sphere,
//      so „the experts who do this" is a link, not a search.
//
// The reference and the code stay, and stay first: they are what somebody sends
// to a spouse or reads down a phone line, and they are the only part of this
// screen that still works when the tab is closed.

import { useEffect, useState } from 'react'
import { Card } from '@/components/Card'
import { Btn } from '@/components/Btn'
import { RequestChat } from '@/components/RequestChat'
import { LiveStatus } from './_live'
import { copyToClipboard } from '@/lib/clipboard'
import { categorySlugOfTopic, topicLabel } from '@/lib/requests'
import type { Sent } from './RequestWizard'

export function ThanksCard({ sent, topic }: {
  sent: Sent
  /** The topic they chose, so „experts who do this" can be a link. Passed down
   *  rather than read from the reply: the endpoint has no reason to send back
   *  something the browser already knows. */
  topic: string
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(t)
  }, [copied])
  // The absolute address, because this is the thing people SEND — to a spouse,
  // to themselves on another device. A relative path in the clipboard is a
  // string nobody can paste anywhere.
  const link = sent.publicRef
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/request/${sent.publicRef}`
    : ''
  const categorySlug = categorySlugOfTopic(topic)

  return (
    <div className="space-y-4">
      <Card padding="section" className="border-brand-200 bg-brand-50">
        {/* ⚠️ TWO OUTCOMES, AND THE SCREEN USED TO NAME ONLY THE OTHER ONE
            (2026-08-18). It said „დაგირეკავთ მითითებულ ნომერზე" to everybody.
            That was true when an operator read every request — and it stopped
            being true the day triage started releasing clean ones on arrival.
            Most senders now have their request in front of providers within
            seconds and nobody phones them, so the last sentence they read was
            describing a step that had already been skipped.

            Owner, 2026-08-18: „ნახოს … რომ აქტიურად მიმდინარეობს ძებნა." That
            is exactly the state auto-verification puts them in, and it is worth
            saying in the heading rather than leaving to the track below.

            The `rejected` branch is gone with the budget floor — nothing sets
            it any more (see the endpoint), and a branch that cannot run is a
            sentence nobody maintains. */}
        <h1 className="font-display text-h2 font-bold text-ink-900 tracking-tight">
          {sent.autoVerified ? 'გაიგზავნა' : 'მივიღეთ'}
        </h1>
        <p className="mt-2 text-body text-ink-700">
          {sent.autoVerified
            ? 'ექსპერტებს უკვე გადაეცა — შეთავაზებებს ელოდები.'
            : 'ჯერ ჩვენ ვამოწმებთ, მერე გადავცემთ. დაგირეკავთ მითითებულ ნომერზე.'}
        </p>
        {sent.publicRef && (
          <>
            <p className="mt-5 text-small text-ink-600">შენი კოდი</p>
            {/* tabular-nums so the five characters keep their width — this code
                gets read down a phone line. */}
            <p className="font-display text-h2 font-bold text-ink-900 tabular-nums">{sent.publicRef}</p>
            <p className="mt-3 text-small text-ink-600">
              შეთავაზებებს აქ ნახავ:{' '}
              <a
                href={`/request/${sent.publicRef}`}
                className="font-semibold text-brand-700 underline underline-offset-2"
              >
                /request/{sent.publicRef}
              </a>
            </p>
            <div className="mt-4">
              {/* The label change carries the confirmation — same pattern as the
                  admin's CopyBtn, and no motion to guard. */}
              <Btn
                variant="secondary"
                size="sm"
                onClick={async () => { if (await copyToClipboard(link)) setCopied(true) }}
              >
                {copied ? 'დაკოპირდა' : 'ბმულის კოპირება'}
              </Btn>
            </div>
          </>
        )}

        {/* ── The account, reported ────────────────────────────────────────────
            Only when there is something to say. CREATED is a fact the person did
            not ask for and must not discover later; EXISTS is the one case where
            they have to do something (sign in) to reach what they just sent, and
            saying nothing would leave the request looking lost. SIGNED_IN and
            NONE are silent — nothing changed. */}
        {/* Neither line links anywhere but sign-in. The signed-in client's own
            list of requests is its own screen (stage 6); this screen has the
            reference above, which is how THIS request is reached, so the account
            copy says only what is true about the account itself. */}
        {sent.account === 'CREATED' && (
          <p className="mt-5 pt-4 border-t border-brand-200 text-small text-ink-700">
            ამ ელფოსტაზე ანგარიში შეგიქმენით. პაროლს{' '}
            <Link href="/signin" className="font-semibold text-brand-700 underline underline-offset-2">
              პაროლის აღდგენით
            </Link>{' '}
            დააყენებ.
          </p>
        )}
        {sent.account === 'EXISTS' && (
          <p className="mt-5 pt-4 border-t border-brand-200 text-small text-ink-700">
            ამ ელფოსტაზე ანგარიში უკვე გაქვს.
          </p>
        )}
      </Card>

      {/* ── Where it stands, live ───────────────────────────────────────────
          The four stations it really has, the current one pulsing, and the
          counts that are true. See _live for what this screen deliberately
          does NOT claim, and why the honest version turned out to be the
          better one. Not drawn on a REJECTED request: the card above already
          said we cannot help, and a progress track under it would be a journey
          that is not going to happen. */}
      {sent.publicRef && !sent.rejected && <LiveStatus publicRef={sent.publicRef} />}

      {/* ── The conversation ────────────────────────────────────────────────
          Open, not collapsed: it is the only thing on this screen that can be
          used, and collapsed it would be a link on a thank-you card, which is
          what this replaced. Rendered even on a REJECTED request — see
          lib/requestThread: the person we just turned away is exactly the one
          who should be able to ask „და 300₾-ზე?". */}
      {sent.publicRef && (
        <Card>
          <RequestChat
            thread={{ kind: 'PLATFORM', refCode: sent.publicRef }}
            defaultOpen
            peerName="მცოდნე"
            emptyHint="დაწერე, თუ რამე დასამატებელი გაქვს."
          />
        </Card>
      )}

      {/* ── The second route ────────────────────────────────────────────────
          Owner, 2026-08-17: „ექსპერტები არჩიოს და თავისით დაკონტაქტოს ან
          შეთავაზება გაუგზავნონ." Both, side by side, because they suit
          different people and neither is the fallback of the other: waiting
          costs nothing and brings offers to you; browsing costs a few minutes
          and you choose. Only drawn when the topic maps to a sphere — a link to
          „experts in ⌀" is a dead end dressed as a choice. */}
      {/* ⚠️ THE WHOLE CARD USED TO BE GATED ON `categorySlug`, WHICH IS NULL FOR
          EVERY SERVICE TOPIC (2026-08-18). So on the trades side the „ჩემი
          მოთხოვნა" button — the only real control back to your own request —
          vanished with the browse half it happens to sit beside, and the only
          route left was a raw path rendered as inline text („შეთავაზებებს აქ
          ნახავ: /request/MC-UQGUD").

          The gate belongs to the BROWSE button alone: „see experts in ⌀" is a
          dead end dressed as a choice, and that is a real reason to hide one
          button. It was never a reason to hide the other. */}
      {sent.publicRef && (
        <Card>
          <h2 className="font-display text-h3 font-bold text-ink-900 tracking-tight">
            სანამ პასუხს ელოდები
          </h2>
          <p className="mt-2 text-body text-ink-600">
            {categorySlug
              ? <>შეთავაზებები თავისით მოგივა. თუ გირჩევნია, თავადაც ნახე — {topicLabel(topic)}.</>
              : <>შეთავაზებები თავისით მოგივა. მოთხოვნას აქ ნახავ ნებისმიერ დროს.</>}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn href={`/request/${sent.publicRef}`} size="sm">
              ჩემი მოთხოვნა
            </Btn>
            {categorySlug && (
              <Btn href={`/experts?category=${encodeURIComponent(categorySlug)}`} variant="secondary" size="sm">
                ექსპერტების ნახვა
              </Btn>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

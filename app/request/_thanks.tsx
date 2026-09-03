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
import { Illustration } from '@/components/Illustration'
import { copyToClipboard } from '@/lib/clipboard'
import { categorySlugOfTopic, clientRequestHref } from '@/lib/requests'
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
  /* ⚠️ WHERE „MY REQUEST" GOES DEPENDS ON WHETHER THEY HAVE AN ACCOUNT
     (2026-09-02). Every control on this screen pointed at `/request/<ref>` —
     the by-reference page — including for somebody who is SIGNED IN and was
     handed one, which puts them in the intake's bare chrome, out of the room
     they were about to live in. That is the jump this day's whole pass removed
     from /me, arriving by the one door nobody had checked: the screen a client
     sees ONCE, immediately after sending.

     `sent.account` already knows (lib/requestAccount → AccountOutcome).
     SIGNED_IN and CREATED both end with a session; NONE and EXISTS do not, and
     for them the reference IS the account, which is why the code and the copy
     button below are drawn for them and only them. `clientRequestHref` is the
     one place the /me address is spelled. */
  const hasRoom = sent.account === 'SIGNED_IN' || sent.account === 'CREATED'
  const requestPath = sent.publicRef
    ? (hasRoom ? clientRequestHref(sent.publicRef) : `/request/${sent.publicRef}`)
    : null
  const link = requestPath
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}${requestPath}`
    : ''
  const categorySlug = categorySlugOfTopic(topic)

  return (
    <div className="space-y-4">
      <Card padding="section" className="border-brand-200 bg-brand-50">
        {/* The one drawing on this screen (owner's icon standard, 2026-09-03:
            „მომხმარებელს აჩვენებს, რომ მოთხოვნა სწორად გაიგზავნა"). `alt=""` —
            the heading under it says „გაიგზავნა" and a screen reader that hears
            „a clipboard with a tick" first is being told it twice. The `-ml-2`
            pulls the file's own transparent margin back to the card's edge. */}
        <Illustration name="requestSent" alt="" className="-ml-2 mb-1" />

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
        {/* ⚠️ THE CODE IS FOR SOMEBODY WHO HAS NO OTHER DOOR (2026-09-02).
            It was drawn for everybody. For a signed-in client it is three
            things at once that they do not need and one that is actively
            wrong: the request is already in their list at /me, the `MC-` code
            is their CREDENTIAL (CLAUDE.md §5) sitting in plain text on a screen
            they did not ask it to be on — and since the link above now points
            at /me/r/<ref> for them, the „ბმულის კოპირება" button copies an
            address nobody but they can open. A share button that produces a
            dead link is worse than no share button.
            `hasRoom` is the same fact that chose the link. For NONE and EXISTS
            the code stays exactly as it was: it is the only way back. */}
        {sent.publicRef && !hasRoom && (
          <>
            <p className="mt-5 text-small text-ink-600">შენი კოდი</p>
            {/* tabular-nums so the five characters keep their width — this code
                gets read down a phone line. */}
            <p className="font-display text-h2 font-bold text-ink-900 tabular-nums">{sent.publicRef}</p>
            <p className="mt-3 text-small text-ink-600">
              შეთავაზებებს აქ ნახავ:{' '}
              <a
                href={requestPath ?? '#'}
                className="font-semibold text-brand-700 underline underline-offset-2"
              >
                {requestPath}
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

      {/* ⚠️ THE FOUR-STATION TRACK WAS HERE AND IT IS GONE (2026-09-01).
          Not because it was wrong — it was honest, it polled, and its counts
          were real — but because it was the SECOND journey widget at this
          address.
          This screen and /request/<ref> are ONE URL: the wizard replaces the
          address bar on send and deliberately does not navigate (owner: „ფორმა
          გაიგზავნა → ფანჯარა ღია რჩება"), so a refresh lands on the
          server-rendered room. That was coherent while both drew the same
          thing. The owner's design canvas („Request Room v2") redrew the room
          as „ვეძებთ შენთვის ექსპერტს" — a pulsing cluster, the request, the
          brief as chips — so from that day the same link showed a station track
          to whoever had just pressed send and a different screen to whoever
          came back to it. Owner: „თითქოს ჩახლართულია და არ გადადის."
          The room is the newer decision and it is the one that survives. What
          this card keeps is only what is TRUE ONCE — the code, the link to copy,
          and the account we just made — and „ჩემი მოთხოვნა" below leads to the
          single screen that tracks the request from here on. */}

      {/* ⚠️ THE CONVERSATION WITH US WAS HERE AND IS GONE (2026-09-02) — the
          same removal as the request room's; the measurement and the reasoning
          are written out in app/request/[ref]/_room.tsx, at the top of the
          component. In one line: fifteen requests, three messages into this
          box, all three from a client, none ever answered.

          The note that stood here argued it was „the only thing on this screen
          that can be used", and that was true of a screen with nothing else on
          it. It is no longer the only thing: „ჩემი მოთხოვნა" below now opens
          the client's own room rather than the by-reference page, the bell
          carries every event on the request, and `HelpWidget` is in the corner
          of this very screen. */}

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
      {/* ⚠️ THE HEADING AND THE SENTENCE WENT; THE CONTROLS STAYED (2026-09-02,
          owner looking at this screen: „ეს მეზედმეტება თითქოს").

          What was counted on the screen they were looking at, for one request:
            · „offers are coming" — said by the card above („შეთავაზებებს
              ელოდები") and said again here („შეთავაზებები თავისით მოგივა");
            · „and here is where you will see them" — FOUR times: the link in
              the card above, the copy button beside it, this card's sentence,
              and this card's button. One destination, four controls.

          ⚠️ AND THE FIRST ATTEMPT AT THIS CUT TOO DEEP — the whole card was
          gated on `categorySlug`, which took „ჩემი მოთხოვნა" with it. On a
          SERVICE topic that slug is always null, so a client who had just filed
          a cleaning request met one sentence and eight hundred pixels of
          nothing. Owner, immediately: „მოთხოვნის გაგზავნისას ჰედერი იკარგება" —
          the header was fine; it simply had an empty page under it.

          ⚠️ THAT EXACT MISTAKE WAS MADE AND FIXED ON 2026-08-18, and the note
          recording it is twenty lines above this one: „the gate belongs to the
          BROWSE button alone… It was never a reason to hide the other." It was
          right then and it is right now. Prose that repeats the card above is
          what goes; the way out of the screen is not.

          No <Card>: with the two sentences gone this is an action row, and a
          panel drawn around two buttons is furniture. */}
      {sent.publicRef && (
        <div className="flex flex-wrap gap-2">
          <Btn href={requestPath ?? '#'} size="lg">
            ჩემი მოთხოვნა
          </Btn>
          {/* The second route — owner, 2026-08-17: „ექსპერტები არჩიოს და თავისით
              დაკონტაქტოს ან შეთავაზება გაუგზავნონ." Both suit different people
              and neither is the fallback of the other: waiting costs nothing
              and brings offers to you; browsing costs a few minutes and you
              choose. Gated, because „see experts in ⌀" is a dead end dressed as
              a choice — and that gate is this button's alone. */}
          {categorySlug && (
            <Btn href={`/experts?category=${encodeURIComponent(categorySlug)}`} variant="secondary" size="lg">
              ექსპერტების ნახვა
            </Btn>
          )}
        </div>
      )}
    </div>
  )
}
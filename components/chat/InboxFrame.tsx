'use client'
import { useEffect, useState } from 'react'
import { useSelectedLayoutSegment } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { ConversationList } from '@/components/chat/ConversationList'
import type { InboxRow } from '@/lib/inboxRows'

/**
 * Everything above and below the two panes that the viewport has to give back,
 * in px — the numbers the heights below are subtracted from `100dvh`/`100vh`.
 *
 * ⚠️ THEY USED TO BE THREE LITERALS IN THE CLASS STRING, MEASURED IN ONE ROOM
 * (2026-09-01). This frame was `app/work/messages/_frame.tsx` and its sums are
 * the PROVIDER shell's: a 56/64px top bar over a `<main>` that carries the page
 * padding. The client's shell is a different shell — `ClientTopBar` is 64px on a
 * phone and 72px from `lg`, eight taller in both — so every height on
 * /me/messages was eight pixels too tall, i.e. the composer sat eight pixels
 * under the fold on the one screen that must never scroll. A shared frame cannot
 * measure the room it is standing in; the room passes its own numbers.
 */
export type InboxChrome = {
  /** The mobile top bar — the only chrome left on an open thread. */
  bar: number
  /** Bar + page padding + this header + the BottomNav, on a phone. */
  list: number
  /** Bar + page padding + this header + the workspace footer, from `lg`. */
  desk: number
}

/** The provider's WorkspaceShell, where all three were measured. */
const PROVIDER_CHROME: InboxChrome = { bar: 56, list: 240, desk: 288 }

/* THE MESSAGES SCREEN — one frame, both rooms.
 *
 * ⚠️ PORTED FROM THE OWNER'S „Messages" ARTBOARD (2026-08-31). It was
 * app/work/messages/_frame.tsx, provider-only; the artboard draws the same
 * screen for the client, so the frame moved here and takes its words as props
 * instead of being copied. What the artboard changed:
 *
 *  · TWO CARDS ON THE CREAM GROUND, not one card split by an inner border. The
 *    palette landed the same day: `bg-ink-50` is the paper, `bg-white` is a
 *    thing lifted off it. A single card with a hairline down the middle was the
 *    only way to draw a two-pane screen while those were the same colour.
 *  · THE TITLE IS VISIBLE ON DESKTOP. It was `lg:sr-only`, and the reason
 *    written here was sound — „მიმოწერა" is the exact text of the lit rail pill
 *    ~40px to its left. The artboard restores it WITH A SUBTITLE, which is the
 *    part the pill cannot say, so the header is no longer a repetition. The
 *    `sr-only` rule survives for the one case it was really about: a phone with
 *    a thread open, where the conversation owns the screen.
 *  · The panes are `border-ink-100` — the artboard's hairline — rather than
 *    `border-ink-200`, so they read as paper rather than as outlined boxes.
 *
 * ⚠️ NOT PORTED: the artboard's „ექსპერტის ხედი / კლიენტის ხედი" segmented
 * control. That is the design tool showing both variants of one screen on one
 * artboard, not a control in the product — the room a person is in is decided
 * by who they are and which URL they are on, and a switch that blurred the two
 * is precisely what tests/spaceSeparation exists to prevent. The way between
 * the rooms is components/UserMenu, where it already is.
 *
 * MOBILE. The list is the page; opening a thread swaps to a full-screen
 * conversation — the segment's presence decides which pane shows, and the list
 * lives in the LAYOUT so it does not remount (and refetch) on every switch. */
export function InboxFrame({ children, threads, title, sub, endpoint, empty, chrome = PROVIDER_CHROME }: {
  children: React.ReactNode
  /** The inbox rows, read by the server layout — see there. */
  threads: InboxRow[]
  title: string
  /** The line the rail's pill cannot say. */
  sub: string
  /** Which room's rows the list polls — see ConversationList. */
  endpoint: string
  empty: { title: string; description: string; cta: { label: string; href: string } }
  /** The room's own chrome. See InboxChrome — the default is the provider's. */
  chrome?: InboxChrome
}) {
  const segment = useSelectedLayoutSegment()
  const threadOpen = segment !== null

  /* ⚠️ WHETHER THE TAB BAR IS ACTUALLY ON SCREEN, ASKED RATHER THAN ASSUMED
     (2026-09-01). The comment below used to state as fact that „on an OPEN
     thread the BottomNav hides (a focused screen)". It does not: that
     component's focused-screen test is `/^\/(?:me|work)\/messages\/[^/]+$/`,
     one segment — the shape of the booking threads it was written for — and a
     conversation has lived at `/…/messages/o/<offerId>`, TWO segments, since
     2026-08-19. So the bar stays up, `globals.css` adds its 64px reserve to the
     body, and the composer — the whole point of the screen — sat behind the tab
     strip on both sides. Measured 2026-09-01 at 800×600: 201px of document
     below the fold with the pane claiming the full viewport.

     The right fix is that regex, and it is filed. This reads the flag the bar
     itself publishes on <body> (the same hook globals.css has consumed for the
     cookie banner, the toast host and back-to-top since it was introduced), so
     the pane is correct whichever way that lands: the reserve appears only
     while the bar really is there and disappears by itself the day it hides.

     A MutationObserver rather than a plain read, because AppShell renders
     <BottomNav> AFTER {children} — its effect stamps the attribute after ours
     would have read it, so a one-shot read is a guaranteed first-paint miss. */
  const [tabBar, setTabBar] = useState(false)
  useEffect(() => {
    const read = () => setTabBar(document.body.getAttribute('data-bottom-nav') === '1')
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.body, { attributes: true, attributeFilter: ['data-bottom-nav'] })
    return () => mo.disconnect()
  }, [])

  // Two custom properties rather than two class strings: a height built from a
  // prop cannot be an arbitrary Tailwind value (the scanner reads source text,
  // so `h-[calc(100dvh-${n}px)]` compiles to nothing at all and the pane
  // silently loses its height). The CLASS is static and the NUMBER is inline.
  const heights = {
    '--inbox-h': threadOpen
      ? `calc(100dvh - ${chrome.bar}px${tabBar ? ' - 64px' : ''} - env(safe-area-inset-bottom))`
      : `calc(100dvh - ${chrome.list}px)`,
    '--inbox-h-lg': `calc(100vh - ${chrome.desk}px)`,
  } as React.CSSProperties

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        // `sr-only`, never `hidden`: the h1 must stay in the accessibility tree
        // so „skip to content" and every screen-reader outline have a title to
        // land on — it is only ever hidden VISUALLY, and only on a phone with a
        // thread open, where the conversation is the whole screen.
        className={threadOpen ? 'sr-only lg:not-sr-only' : ''}
        title={title}
        sub={sub}
      />

      {/* THE HEIGHTS, and every number in them is chrome this screen does not
          own — so they arrive as `chrome`, from the room. Desktop: top bar +
          the page's py-8 + the workspace footer came to 208px while the h1 was
          `sr-only` and took no space; the visible header (h1 28/1.2 + sub + the
          gap above the panes) adds ~80. Mobile list view: the same sum with the
          64px BottomNav in it. On an OPEN thread the header collapses and the
          conversation goes full-bleed — the negative margins cancel the page's
          own gutter so it gets the whole phone, which is why the client room
          had to grow one (app/me/messages/layout). */}
      <div
        style={heights}
        className={`lg:grid lg:grid-cols-[minmax(260px,320px)_minmax(360px,1fr)] lg:gap-4 min-h-[420px] lg:min-h-[520px] h-[var(--inbox-h)] lg:h-[var(--inbox-h-lg)] ${
          threadOpen ? '-mx-6 sm:-mx-8 -mt-6 lg:mx-0 lg:mt-0' : ''
        }`}
      >
        <div className={`${threadOpen ? 'hidden lg:flex' : 'flex'} flex-col min-h-0 h-full bg-white overflow-hidden rounded-card border border-ink-100`}>
          <ConversationList
            initialThreads={threads}
            endpoint={endpoint}
            empty={empty}
          />
        </div>
        <div className={`${threadOpen ? 'flex' : 'hidden lg:flex'} flex-col min-h-0 h-full bg-white overflow-hidden lg:rounded-card lg:border lg:border-ink-100`}>
          {children}
        </div>
      </div>
    </div>
  )
}

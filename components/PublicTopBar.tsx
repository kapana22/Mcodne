'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Logo } from './Logo'
import { Icon } from './Icon'
import { CreditPill } from './CreditPill'
import { NotifBell } from './NotifBell'
import { UserMenu } from './UserMenu'
import { Container } from '@/components/Container'
import { useMe, type Me } from '@/lib/me'
import { useMessagesUnread, type MessagesSpace } from '@/lib/messagesUnread'
import { JOIN_DOOR_HREF, JOIN_DOOR_LABEL, showJoinInvite } from '@/lib/capabilities'
import { requestsOn, showRequestCta } from '@/lib/requests'
import { ROLE } from '@/lib/roles'

// The single public header. Rendered on every guest/browse/marketing page.
//
// STATIC BY DESIGN — it must NOT visibly change on load. Two things used to make
// it "change unclearly":
//   1. the nav items swapped by role once /api/me resolved (public → student/
//      tutor nav), and
//   2. the right side popped from empty → avatar/buttons.
// Fixes: (1) the nav is now UNIFORM for everyone — logged-in users reach their
// workspace via the avatar (→ role home), the marketing nav never rearranges;
// (2) server-rendered pages pass `initialUser` so the auth state is correct on
// the FIRST paint (no flip). Client-only pages fall back to the deduped
// lib/me probe, but with the uniform nav there's no rearrange either way.

// ONE nav for everyone — the professional marketplace pattern (Airbnb/Intro).
//
// STAGE 10 (2026-08-19): ONE SECTION, „ექსპერტები" → /experts, plus ONE action,
// „მოთხოვნის გაგზავნა". Owner: „სერვისები საერთოდ ხო ამოსაგდებია" and
// „სათაურში ჩემი აზრით ექსპერტები უნდა დარჩეს მარტო". The second word named a
// separate trades door that no longer exists — the two catalogues and that door
// are one list at one address, so a second item would have pointed at the page
// the first item already opens. Naming one half of one list in the bar is how a
// reader concludes the site has two of them.
//
// STAGE 9 (2026-08-19, plan §9 „ერთი კითხვა, ორი კარი"): what left the bar and
// where it went:
//   · „კატეგორიები" → /experts  — a second item to the same page as the first
//                              (/categories was retired in stage 8); gone.
//   · „სერვისები" → /services   — the trades door, deleted in stage 10; the one
//                              item covers it, and the rail's type filter is
//                              where „just the jobs" is now said. The whole
//                              /services prefix went in stage 11.
//   · „მოთხოვნა"               — became the button (`cta: true` below), same
//                              href, same flag, same filter line the requests
//                              test pins.
//   · the JOIN door           — ⚠ PARTLY BACK (2026-08-19). Owner: „სათაურში
//                              ვფიქრობ საჭიროა". A marketplace's narrow side is
//                              SUPPLY, and the bar is the strongest place on the
//                              site to ask for it. It returns as a QUIET TEXT
//                              LINK on the right — never a second button: one
//                              filled action per bar, and „მოთხოვნის გაგზავნა"
//                              already owns the outlined one. Gated by
//                              showApplyCta, so an existing expert never reads
//                              an invitation to become one. Same words and same
//                              address as the footer's item — one string, one
//                              meaning. A signed-in person keeps the UserMenu
//                              item (K5); a guest reads this same link.
//                              ⚠️ THE GUEST'S „დაწყება" IS GONE (2026-08-31).
//                              Owner: „დაწყება წაშალე და შესვლაზე გადმოიტანე,
//                              ერთი და იგივეს აკეთებს." It did: JOIN_HREF is
//                              /signup and „შესვლა" is /signin, and both render
//                              the SAME component (app/signup → AuthPage, only
//                              `defaultView` differs), so the bar carried two
//                              buttons onto one screen. „შესვლა" took the
//                              filled treatment and the pair became one.
//   · „დახმარება"              — the UserMenu and the footer.
// Reading the bar left-to-right should say what the site is before it says
// what to press — so the two sections come first and the action is a button
// on the right, not a fourth word in the row.
/* ⚠️ FOUR WORDS AGAIN, FROM THE OWNER'S OWN HEADER DESIGN (2026-08-31).
   Everything above is why the bar came DOWN to one word over stages 9–10; the
   owner handed over a header design („ესეთი ჰედერი მჭირდება") that puts four
   back, sentence-case, with the browse words on the left and the account
   actions behind a divider on the right. The design is the newer decision — the
   argument above is kept because it is the record of what the one-word bar
   cost and why, not because it out-votes a later call.

   ⚠️ TWO OF THE FOUR HAD NO DESTINATION ON THIS SITE, and that is the one place
   this is not a 1:1 port. A nav word pointing at a 404 — or at the page the word
   beside it already opens — is worse than a missing word:

     · „როგორ მუშაობს" has no page. /about is the one that explains the model
       („გადამოწმებული ცოდნა", „გამჭვირვალე ფასი", the principles), so it points
       there. Honest, and one edit from a real page if the owner wants one.

     · „კატეგორიები" IS STILL OUT, pending the owner. /categories was retired in
       stage 8 and 308s to /experts (middleware.ts), so the only address behind
       the word is the page „ექსპერტები" already opens — and two items opening
       one view is exactly what stage 9 removed them for. Inventing
       „/experts?view=categories" was the other candidate and is worse: the
       catalogue reads q · category · sort · trade · city and nothing else, so
       that param would be a control that lies. The label is written and needs
       only an href the day there is one to give it. */
const NAV: { label: string; href: string; cta?: boolean }[] = [
  { label: 'ექსპერტები',   href: '/experts' },
  { label: 'როგორ მუშაობს', href: '/about' },
  { label: 'დახმარება',    href: '/help' },
  // The one ACTION. Rendered as a button (desktop: right of the nav; phone:
  // inside the drawer), never as a nav word.
  { label: 'მოთხოვნის გაგზავნა', href: '/request', cta: true },
]

export function PublicTopBar({
  activeHref,
  initialUser,
}: {
  activeHref?: string
  // `undefined` → not server-provided, use the client probe (home, ask…).
  // `null`      → server says guest. An object → server-resolved user.
  // When provided, the header is correct on first paint — no flip.
  initialUser?: Me | null
}) {
  // Shared identity source (lib/me) — no-store, deduped with AppShell + the
  // page so a public load makes ONE /api/me request instead of three.
  const { me: fetchedMe, ready: fetchedReady } = useMe()
  // Prefer the client probe once it lands (catches in-tab session changes);
  // before that, trust the server-provided initialUser so nothing flips.
  const ssr = initialUser !== undefined
  const me = fetchedReady ? fetchedMe : (ssr ? initialUser : null)
  const ready = fetchedReady || ssr
  // Which inbox this reader's badge counts. SPACE, not role: on a public page an
  // approved expert is wearing their expert hat (the Logo above routes them to
  // /tutor for the same reason), so the count must be the expert inbox and never
  // the client-side one they also own. null → guest or ADMIN: no inbox, and
  // useMessagesUnread then subscribes to nothing at all.
  const msgSpace: MessagesSpace | null =
    me?.role === ROLE.PROVIDER ? 'expert' : me?.role === ROLE.USER ? 'client' : null
  const msgUnread = useMessagesUnread(msgSpace)
  const [mobOpen, setMobOpen] = useState(false)
  /* ⚠️ THE ACCOUNT MENU LIFTS THE BAR TOO (2026-09-03), for the same reason the
     drawer does. This <header> is `sticky` with a z-index, so it owns a
     stacking context and NOTHING inside it can paint above the header's own
     layer — the dropdown asks for `z-50` and is worth `z-chrome`.
     That was harmless until a second sticky header appeared under the bar at
     the same layer: the intake's progress rail (app/request/_shell) is also
     `z-chrome` and sits LATER in the DOM, so it painted over the open menu.
     Owner, on the screenshot: „ასეთი პრობლემები არ უნდა ქონდეს საიტს."
     One boolean, one class — the mechanism the drawer already proved. */
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // Scroll-driven elevation — the glass bar is flat and extra-transparent
  // (`.glass-bar-quiet`) at the top of the page, then firms up its hairline and
  // lifts into its shadow once we cross ~8px, an Airbnb-style detach cue. The
  // transition lives in `.glass-bar`, so reduced-motion users get the state
  // change instantly.
  // Passive listener so it never blocks scroll performance.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const drawerRef = useRef<HTMLElement | null>(null)
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  // Lock body scroll while the mobile drawer is open; Escape closes it —
  // the drawer is a dialog and needs a keyboard exit.
  //
  // FOCUS MANAGEMENT added 2026-07-31. The drawer already declared
  // `role="dialog" aria-modal="true"` but did nothing about focus: measured with
  // a keyboard, opening it left focus on the hamburger BEHIND the overlay, so
  // the next Tab walked the page underneath — a screen-reader user was told a
  // modal had opened and then handed the content it was covering. `aria-modal`
  // is a promise the DOM has to keep.
  // Three parts, all required: move focus IN on open, keep Tab inside while it
  // is open, and return focus to the trigger on close so the reader's place in
  // the page is not lost.
  useEffect(() => {
    if (!mobOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMobOpen(false); return }
      if (e.key !== 'Tab') return
      const root = drawerRef.current
      if (!root) return
      const items = [...root.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])',
      )].filter(el => el.offsetParent !== null)
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      // Wrap at both ends — without this, Tab past the last item escapes into
      // the page the dialog is covering.
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Land on „დახურვა" rather than the first nav link: the exit is what a
    // keyboard user most often wants first, and it reads the dialog's purpose.
    closeBtnRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      // Hand focus back to the button that opened it.
      triggerRef.current?.focus()
    }
  }, [mobOpen])

  // (The join item and its showApplyCta gate left this list in stage 9 — see
  // the NAV note above; the gated door lives in the UserMenu now.)
  //
  // „მოთხოვნის გაგზავნა" is shown to EVERYONE the flag admits — including a visitor with
  // no account, which is most of the people it is for.
  //
  // ⚠️ IT WAS `me?.role === 'ADMIN'` UNTIL 2026-08-17, and the reason it stopped
  // being that is worth keeping, because the old reason was CORRECT when it was
  // written. It read: „an anonymous visitor shown this link would click into a
  // 404, and a link that 404s is worse than no link." True — back when one gate
  // covered the whole subsystem and only allowlisted providers and admins got
  // through it. Splitting that gate (lib/requests → canOpenRequestForm: the
  // client side asks nothing of the caller) made /request answer 200 to
  // anonymous, and the moment it did, this filter was hiding a working page
  // from the only people it exists for. Owner, holding the signed-out header:
  // „აქ ხო უნდა ჩანდეს რეალურად როცა არაა დარეგისტრირებული მაშინაც."
  //
  // Providers still do NOT reach their side from here, unchanged and for the
  // original reason: knowing who is on the allowlist needs a DB read, and
  // /api/me is the hottest endpoint on the site. They enter through /provider,
  // which the admin hands them.
  //
  // ⚠️ A nav-level hide, and a hide is not a guard — every /request route gates
  // itself (lib/requestsServer). requestsOn() works in this client component
  // only because next.config.js inlines FEATURE_REQUESTS; see the note there.
  //
  // ⚠️ NOT role-dependent any more, which also means NO FLASH: the item's
  // visibility no longer waits for /api/me to resolve, so it is in the first
  // paint rather than appearing a beat later under the cursor.
  const nav = NAV.filter(i => {
    // ⚠️ ITS OWN LINE, UNTOUCHED. Three exact regexes in tests/requests.test.ts
    // match this statement character for character; the „სერვისები" item that
    // used to be gated beside it left the bar in stage 10, this one did not.
    if (i.href === '/request') return requestsOn()
    return true
  })

  /* WHICH ITEM IS LIT IS DERIVED HERE, from the URL — it is NOT something a
     page passes in.
     Reported 2026-08-07: „the whole menu changes on the expert page." It did.
     `activeHref` was threaded by hand and exactly TWO surfaces ever passed it
     (/experts and /apply). So „ექსპერტები" was lit on the browse list and went
     dark the moment you opened an expert; /categories, /categories/[slug],
     /help and every other marketing page lit nothing at all while you stood on
     them. The highlight moved for reasons that had nothing to do with where the
     reader was — which is exactly how a static bar stops reading as static.
     Deriving it means a new page cannot forget, and a detail route stays lit
     under its section. The prop is kept only as an override; nothing needs it. */
  const pathname = usePathname() ?? ''
  const activePath = activeHref ?? pathname
  // ⚠️ THE PREFIX RULE IS THE WHOLE MECHANISM AGAIN (stage 11, 2026-08-19).
  // „ექსპერტები" is /experts, and `activePath.startsWith(h + '/')` lights it on
  // every page under it — which is now ALL FOUR: the expert profile, the
  // provider profile, the profession landing and the trade landing
  // (app/experts/[slug] resolves them in one chain). There used to be a
  // SECTION_ALIAS here mapping '/experts' → ['/services'], because the trades
  // side of the same catalogue answered under a second prefix; that prefix is
  // gone (it 308s into this one), so the alias mapped nothing and a second
  // mechanism nobody exercises is a mechanism that quietly rots. If an item
  // ever again needs to light on an address it does not name, bring it back
  // WITH the address that needs it — not before.
  const links = nav.filter(i => !i.cta)
  // THE ACTION IS THE DEMAND SIDE'S (2026-08-21). The flag decides whether the
  // item exists at all (the filter above, untouched); this decides who is still
  // invited by it — a person who has registered a service is not, because the
  // bar's one permanent action would otherwise ask them to buy on top of every
  // page where they sell. The rule and the whole argument live in
  // lib/requests → showRequestCta; both renders below read this one const,
  // so the desktop button and the drawer button cannot disagree.
  //
  // ⚠️ THE FLASH IS DELIBERATE ON THIS SIDE OF IT. Visibility now waits on
  // /api/me, so on a client-only page a provider sees the button for one beat
  // before it goes. Shown-then-hidden is the right way round: `initialUser`
  // resolves it in the FIRST paint on every server-rendered page (home, browse,
  // the profiles — where a provider actually browses), and the alternative,
  // rendering nothing until `ready`, would pop the button in late for the
  // guests and clients it is for, which is everyone else.
  const cta = showRequestCta(me?.provider) ? nav.find(i => i.cta) : undefined
  const isActive = (href: string) => activePath === href || activePath.startsWith(href + '/')

  return (
    <header
      // The header is `sticky` WITH a z-index, so it opens its own stacking
      // context — every z-[…] inside it (scrim, drawer) is resolved against
      // sibling headers/banners at THIS value, not at the root. That's why the
      // drawer's own z-drawer alone could never beat the cookie banner: at the
      // root the whole header still counted as 40. While the drawer is open we
      // raise the header above the banner (z-impersonate) — and still below Sheet (80)
      // / ConfirmModal (90), which is where the drawer belongs.
      // FULL-BLEED GLASS BAR (2026-07-27, replaces the short-lived floating
      // island): the surface spans the viewport edge to edge and starts at y=0
      // — no top gap, no radius, no box border, just a bottom hairline. The
      // glass lives on the inner DIV (not the <header>) so the mobile drawer and
      // its scrim stay siblings OUTSIDE it and keep the viewport as their
      // containing block. The <header> itself is a bare `sticky top-0` +
      // z-index dance.
      // HEIGHT IS LOAD-BEARING: h-16 sm:h-20 = exactly 64 / 80, which every
      // sticky offset measured off this header elsewhere assumes (`top-16`,
      // `sm:top-20`, `lg:top-[80px]`, `scroll-mt-24`). Don't retune it here —
      // fix the header if it drifts, not the consumers.
      className={`sticky top-0 ${mobOpen || menuOpen ? 'z-drawer' : 'z-chrome'}`}
    >
      {/* The bar. Full width; `.glass-bar` owns background/hairline/shadow/blur
          — add nothing but geometry. `-quiet` = the flat scroll-top state.

          ⚠️ ROUNDED AT THE BOTTOM ONLY (2026-08-31), from the owner's design.
          `.glass-bar` documents itself as „no radius, because a bar's
          left/right/top edges are the screen itself" — which is still true of
          three of its four edges. The fourth is not the screen: it is the seam
          against the page, and the design curves it. Radius is the one thing
          that class leaves to its host („the host only adds rounded-*"), so
          this needs no change there.

          ⚠️ AND IT SQUARES OFF ONCE YOU SCROLL. A floating card reads as a
          card; a bar that content passes UNDER should meet the page flat. The
          curve is the at-rest state the design shows, and `scrolled` already
          drives the hairline and the shadow, so it costs no new state. */}
      <div className={`glass-bar ${scrolled ? '' : 'glass-bar-quiet rounded-b-[1.75rem]'} transition-[border-radius] duration-base ease-out-quart`}>
        {/* …but the nav content still lives in the site content column, so the
            logo and the account controls line up with the page beneath. */}
        <Container className="h-16 sm:h-20 flex items-center justify-between gap-4 lg:gap-8">
        <div className="flex items-center gap-7 lg:gap-10 min-w-0">
          {/* Omit href → Logo auto-routes to the viewer's role-home (a signed-in
              expert lands on /tutor, not the anonymous marketing page). */}
          <Logo size="sm" />
          <nav className="hidden lg:flex items-center gap-1">
            {links.map(item => {
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  /* ⚠️ SENTENCE CASE SINCE 2026-08-31, from the owner's design,
                     and it is not only taste here: Georgian has no capitals, so
                     `uppercase` on ქართული is a no-op that still pays the
                     letter-spacing and the weight meant to rescue it. Four
                     words at `text-meta uppercase` read as a row of labels;
                     `text-small` sentence case reads as a menu. */
                  className={`relative h-11 px-3.5 rounded-btn font-display text-small font-semibold inline-flex items-center transition-colors duration-fast ease-out-quart ${
                    active ? 'text-brand-800 bg-brand-50' : 'text-ink-700 hover:text-ink-900 hover:bg-ink-100/70'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {/* ⚠️ THE DIVIDER IS THE DESIGN'S ONE STRUCTURAL IDEA (2026-08-31), and
              it is worth naming rather than copying. Everything left of it is
              LOOKING (the four sections, and the search that is the fifth way
              in); everything right of it is DOING something to your own account
              — register a service, sign in, start. The bar used to run one
              undifferentiated row of controls left to right, so „დაარეგისტრირე
              სერვისი" sat in the same visual breath as „დახმარება" and read as
              a fifth section. A hairline says which half you are in.
              `hidden lg:block`, because below that the nav is a drawer and there
              are no two halves left to separate. */}
          {/* ⚠️ THE SEARCH SITS ON THE BROWSING SIDE OF THE LINE (2026-08-31).
              It used to live inside the guest cluster, between the request
              button and „შესვლა" — i.e. filed with the account actions, when
              what it actually does is open the catalogue. The design puts it
              immediately left of the divider and that is the correct reading:
              it is a fifth way to LOOK, and the shortest one.
              STILL GUEST-ONLY, and the reason is unchanged: a signed-in
              client's row already carries ♥ + bell + avatar + ☰, and a fifth
              control does not fit at 390px. They also have the workspace nav. */}
          {ready && !me && (
            <Link
              href="/experts"
              aria-label="ექსპერტების ძებნა"
              title="ექსპერტების ძებნა"
              className="w-10 h-10 rounded-btn text-ink-600 hover:text-ink-900 hover:bg-ink-100 inline-flex items-center justify-center transition-colors duration-fast"
            >
              <Icon.search className="w-[18px] h-[18px]" />
            </Link>
          )}
          <span aria-hidden className="hidden lg:block w-px h-6 bg-ink-200 mx-1" />
          {/* SUPPLY, as a quiet word (2026-08-19). Text, not a button: the bar
              already carries one outlined action and one filled one, and a
              third would make the row a shelf of buttons. Gated — an existing
              provider must never be invited to become one.
              ⚠️ THE ADDRESS AND THE WORD COME FROM lib/capabilities (2026-08-20).
              This was a hard-coded „გახდი ექსპერტი" → `/join?can=CONSULT`: the
              site's most visible supply link, pre-answering the door's one
              question with the half the hierarchy says comes second. */}
          {showJoinInvite(me?.role, me?.provider) && (
            <Link
              href={JOIN_DOOR_HREF}
              /* ⚠️ THE „+" IS THE DESIGN'S (2026-08-31) AND IT DOES REAL WORK.
                 This is the one control in the bar that CREATES something, and
                 as bare text among four section words it read as a fifth one.
                 A plus is the universal „add" and it costs 14px. Sentence case
                 for the same reason as the nav — Georgian has no capitals. */
              className="hidden lg:inline-flex h-11 px-3 rounded-btn font-display font-semibold text-small text-ink-600 hover:text-ink-900 hover:bg-ink-100 items-center gap-1.5 whitespace-nowrap transition-colors duration-fast"
            >
              <Icon.plus className="w-4 h-4" aria-hidden />
              {JOIN_DOOR_LABEL}
            </Link>
          )}
          {/* THE ACTION (stage 9). Desktop only — at 390px a signed-in client's
              row is already four controls (measured below), and the drawer
              carries the same button for the phone. Secondary, not primary:
              „შესვლა" is the bar's one filled button (2026-08-31; it was
              „დაწყება" until the two merged). */}
          {cta && (
            <Link
              href={cta.href}
              className="hidden lg:inline-flex h-11 px-4 rounded-btn border border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50 text-ink-900 font-display font-semibold text-meta uppercase items-center whitespace-nowrap transition-colors duration-fast"
            >
              {cta.label}
            </Link>
          )}
          {!ready ? (
            // Reserve space so the layout doesn't jump when auth resolves.
            <div className="w-10 h-10" />
          ) : !me ? (
            <>
              {/* BROWSE, for a guest (2026-08-01). The header's only prominent
                  action used to be „დაწყება" — i.e. the one thing on screen
                  asked for commitment before the visitor had seen a single
                  expert, while the marketplace's actual first intent is to look
                  around. On a phone a guest reading /blog or a profile had to
                  open the drawer and tap „ექსპერტები" to get to the catalogue.
                  ADDED, not swapped: replacing „დაწყება" would have gambled the
                  signup metric for a modest gain. (Since stage 9 the home hero
                  has no search field — its two doors do the same job — so this
                  icon is the one-tap route to the catalogue on every page.)
                  Measured at 390px: logo 63 + this 40 +
                  „დაწყება" 94 + ☰ 40 = 237px of the 342px content width. Fits.
                  GUEST-ONLY on purpose: a signed-in student's header already
                  carries ♥ + bell + avatar + ☰, and a fifth control does not
                  fit at 390px. They also have the workspace nav. */}
              {/* ⚠️ ONE BUTTON, NOT TWO (2026-08-31). „შესვლა" (/signin) and
                  „დაწყება" (/signup) stood side by side and opened the SAME
                  screen — app/signup renders app/signin's AuthPage with a
                  different `defaultView`, and that page's own „არ გაქვს
                  ანგარიში? დარეგისტრირდი უფასოდ" switches between them. Owner:
                  „ერთი და იგივეს აკეთებს." So the pair is one control and it
                  keeps the filled treatment the green button had.

                  ⚠️ AND IT LOST `hidden md:`. „შესვლა" used to be a desktop-only
                  quiet link because the phone's filled „დაწყება" was the guest's
                  auth control; with that gone, hiding this below `md` would
                  leave a phone guest no way into an account from the bar at all.
                  It is the shorter word of the two, so the 390px row measured
                  below only got roomier.

                  ⚠️ THE SIZE STAYS `text-body`: tests/designTokens §F ties a
                  button's label to its height tier (h-11 → text-body), so
                  shrinking it to match the nav words would make the one filled
                  control in the bar quieter than the links around it.
                  `bg-brand-600`, never 500 — white on 500 measures 3.38 (CLAUDE.md). */}
              <Link
                href="/signin"
                className="tap-shrink h-11 px-6 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-bold text-body transition-all duration-fast ease-out-quart inline-flex items-center shadow-brand-glow hover:shadow-[0_10px_32px_rgba(47,156,134,0.36)]"
              >
                შესვლა
              </Link>
            </>
          ) : (
            // Signed-in: mirror the workspace bar so a logged-in visitor on a
            // public page (home/browse) keeps their real controls — saved,
            // notifications, account menu — instead of a lone avatar.
            <>
              {/* ALWAYS visible, at every width (2026-07-31). This used to carry
                  `hidden sm:inline-flex`, so on a phone — where the workspace
                  sidebar is `hidden lg:flex` AND the BottomNav's five student
                  tabs (მთავარი · ექსპერტები · ჯავშნები · მიმოწერა · პროფილი)
                  contain no „შენახული" — a logged-in student had NO route to
                  their saved experts anywhere on a public page. The feature was
                  fully built and simply unreachable from a phone, which reads as
                  „the save function was deleted".
                  Space check at 390px: gutters 48 + four 40px controls + three
                  8px gaps = 232, leaving ~110px for the logo. It fits; if a
                  fifth control is ever added here, this is the row to re-measure.
                  Still STUDENT-only on purpose: the favourites API 403s every
                  other role (saved-experts is a client feature), so showing the
                  heart to a TUTOR/ADMIN would open a page that cannot load. */}
              {/* THE BALANCE — first in the cluster, and only for somebody who
                  sells (2026-08-21). Owner, pointing at this exact row: „აქ უნდა
                  ჩანდეს ლამაზად." It had lived on /work alone, which is one
                  screen out of forty; a provider browsing the catalogue or their
                  own public page never saw the number the whole bonus exists to
                  motivate. Status first, then actions, then identity — the pill
                  is read, the icons beside it are pressed.
                  ⚠️ THE 390px BUDGET STILL HOLDS. `balanceTetri` is null for
                  everybody who sells nothing, and the heart below is USER-only —
                  so the two never appear together and the worst case on a phone
                  is still four 40px controls (pill + bell + avatar + burger),
                  which is the row measured in the note above. The word „ბალანსი"
                  inside the pill only appears from xl. */}
              <CreditPill tetri={me.balanceTetri} />
              {me.role === ROLE.USER && (
                <Link
                  href="/me/favorites"
                  aria-label="შენახული"
                  className="inline-flex w-10 h-10 rounded-btn text-ink-600 hover:text-ink-900 hover:bg-ink-100 items-center justify-center transition-colors duration-fast"
                >
                  <Icon.heart className="w-[18px] h-[18px]" />
                </Link>
              )}
              {/* MESSAGES — desktop only, and only here (2026-08-17).
                  The gap it closes is exactly one cell of the matrix:
                    · phone, any page   → BottomNav's „მიმოწერა" tab, 1 tap
                    · desktop, workspace → the sidebar item (with its badge), 1 click
                    · desktop, PUBLIC page → the avatar dropdown. TWO clicks, and
                      the first one reveals nothing about where the second goes.
                  A marketplace conversation is the thread a client returns to
                  while browsing other experts — i.e. precisely on the pages this
                  header owns. `hidden lg:` is not a guess: BottomNav is
                  `lg:hidden`, so the icon appears at the exact width its tab
                  disappears and the two can never both be on screen. It also
                  keeps the 390px row at four controls — the measurement above
                  („if a fifth control is ever added here, re-measure") stays
                  untested rather than quietly broken.
                  THE BADGE (owner's call, 2026-08-17 — I had argued for the
                  icon alone). It is NOT the bell's number: the bell counts
                  notifications, this counts unread THREADS, and the two legitimately
                  disagree — reading the MESSAGE_NEW notice does not read the
                  message, and opening the thread in another tab clears this while
                  the bell still holds a booking notice. Same source and same
                  arithmetic as the workspace sidebar pill (lib/messagesUnread →
                  /api/messages?space=…), so the two can never show different
                  numbers for one inbox; same `bg-danger-500` and 9+ cap as every
                  other count in this row.
                  The cost I flagged is paid down by the store, not ignored: one
                  refcounted 90s poll per space, visibility-gated, and it clears
                  on `mcodne:threads-refresh` rather than waiting out the interval.
                  SPACE, not just role: a dual-role expert must see their EXPERT
                  unread here, never their client-side one.
                  STUDENT/TUTOR only: those are the two roles with a messages
                  route. An admin has none, and an icon into a 404 is worse than
                  no icon. */}
              {msgSpace && (
                <Link
                  href={msgSpace === 'expert' ? '/work/messages' : '/me/messages'}
                  aria-label={msgUnread > 0 ? `მიმოწერა — ${msgUnread} წაუკითხავი` : 'მიმოწერა'}
                  title="მიმოწერა"
                  className="relative hidden lg:inline-flex w-10 h-10 rounded-btn text-ink-600 hover:text-ink-900 hover:bg-ink-100 items-center justify-center transition-colors duration-fast"
                >
                  <Icon.chat className="w-[18px] h-[18px]" />
                  {msgUnread > 0 && (
                    <span className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-danger-500 text-white font-display text-meta font-bold tabular-nums inline-flex items-center justify-center ring-2 ring-white motion-safe:animate-scale-in">
                      {msgUnread > 9 ? '9+' : msgUnread}
                    </span>
                  )}
                </Link>
              )}
              <NotifBell />
              <UserMenu user={{ name: me.fullName, avatar: me.avatarUrl }} role={me.role} onOpenChange={setMenuOpen} />
            </>
          )}
          <button
            type="button"
            ref={triggerRef}
            onClick={() => setMobOpen(o => !o)}
            aria-label="მენიუ"
            aria-expanded={mobOpen}
            className="lg:hidden w-10 h-10 rounded-btn border border-ink-200 bg-white text-ink-900 hover:bg-ink-100 inline-flex items-center justify-center transition-colors duration-fast"
          >
            {mobOpen ? <Icon.xC className="w-5 h-5" /> : <Icon.menu className="w-5 h-5" />}
          </button>
        </div>
        </Container>
      </div>

      {mobOpen && (
        <>
          {/* Explicit h-[100dvh] on scrim + drawer. Historically the header's own
              backdrop-blur made it their containing block (backdrop-filter and
              transform both create one for fixed descendants), so inset-0 /
              bottom-0 sized them to the 64px bar instead of the screen. The
              glass now lives on the inner bar DIV and these two are its
              siblings, so the viewport is the containing block again — but the
              explicit height works either way, so it stays. */}
          <button
            type="button"
            aria-label="დახურვა"
            onClick={() => setMobOpen(false)}
            className="lg:hidden fixed inset-x-0 top-0 h-[100dvh] z-drawer-scrim bg-ink-900/50 backdrop-blur-sm motion-safe:animate-fade-in-fast"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="მენიუ"
            // z-drawer inside the header's own stacking context (the header is
            // raised to z-drawer while open, see above) — an open nav dialog must
            // cover the cookie banner (z-impersonate); still below Sheet (80) /
            // ConfirmModal (90).
            ref={drawerRef}
            className="lg:hidden fixed top-0 right-0 h-[100dvh] z-drawer w-[320px] max-w-[86vw] bg-white shadow-float flex flex-col motion-safe:animate-drawer-in-r"
          >
            <div className="h-16 sm:h-20 px-5 flex items-center justify-between border-b border-ink-100 shrink-0">
              <span className="font-display text-micro font-bold uppercase text-ink-500">მენიუ</span>
              <button
                type="button"
                ref={closeBtnRef}
                onClick={() => setMobOpen(false)}
                aria-label="დახურვა"
                className="w-10 h-10 rounded-btn text-ink-700 hover:bg-ink-100 inline-flex items-center justify-center transition-colors duration-fast"
              >
                <Icon.xC className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-3">
              <ul className="stagger space-y-0.5">
                {links.map(item => {
                  const active = isActive(item.href)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMobOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center h-12 px-3 rounded-btn text-small font-display font-semibold uppercase transition-colors duration-fast ${
                          active ? 'bg-brand-50 text-brand-800' : 'text-ink-800 hover:bg-ink-100'
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  )
                })}
                {cta && (
                  <li className="pt-2">
                    <Link
                      href={cta.href}
                      onClick={() => setMobOpen(false)}
                      className="tap-shrink w-full h-12 rounded-btn border border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50 text-ink-900 font-display font-bold text-small uppercase inline-flex items-center justify-center transition-colors duration-fast"
                    >
                      {cta.label}
                    </Link>
                  </li>
                )}
                {showJoinInvite(me?.role, me?.provider) && (
                  <li>
                    <Link
                      href={JOIN_DOOR_HREF}
                      onClick={() => setMobOpen(false)}
                      className="flex items-center h-12 px-3 rounded-btn text-small font-display font-semibold uppercase text-ink-800 hover:bg-ink-100 transition-colors duration-fast"
                    >
                      {JOIN_DOOR_LABEL}
                    </Link>
                  </li>
                )}
                {/* ⚠️ THE QUIET „შესვლა" ROW LEFT WITH „დაწყება" (2026-08-31).
                    The drawer carried both — a list row into /signin and a
                    filled footer button into /signup — which is the same one
                    screen named twice, on the surface with the least room for
                    it. The footer button below is now the single door. */}
              </ul>
            </nav>
            {!me && (
              <div className="px-5 pb-5 pt-3 border-t border-ink-100">
                <Link
                  href="/signin"
                  onClick={() => setMobOpen(false)}
                  className="tap-shrink w-full h-12 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-bold text-body-lg uppercase inline-flex items-center justify-center shadow-brand-glow transition-all duration-fast"
                >
                  შესვლა
                </Link>
              </div>
            )}
          </aside>
        </>
      )}
    </header>
  )
}

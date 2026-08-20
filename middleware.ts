import { NextRequest, NextResponse } from 'next/server'
import { isRequestPath, isProviderPath, requestsOn, providersOn } from '@/lib/requests'

// Adds baseline security headers to every response. Kept conservative so it
// won't clash with the app's inline styles / Tailwind runtime, and won't
// break the Jitsi popup (which opens in a new tab and needs no framing here).
// Also mirrors the request pathname into `x-current-path` so server components
// (e.g. requireUser) can build a "return-here-after-signin" URL.
export function middleware(req: NextRequest) {
  // ── www → apex, permanently ────────────────────────────────────────────────
  // DNS already points www.mcodne.ge at the apex, but Railway held no
  // certificate for that host, so www failed at the TLS handshake — anyone who
  // typed it got a browser security error, not the site. Once www is registered
  // as a custom domain (and a cert is issued) it would serve the SAME content on
  // a second hostname, i.e. textbook duplicate content. This 308 collapses it
  // onto one canonical host before that can happen.
  //
  // 308 (not 302): permanent AND method-preserving, so a POST to a www URL
  // isn't silently downgraded to GET.
  const host = req.headers.get('host') ?? ''
  if (host.startsWith('www.')) {
    const url = req.nextUrl.clone()
    url.host = host.slice(4)
    url.protocol = 'https:'
    url.port = ''
    return NextResponse.redirect(url, 308)
  }

  // ── /ask → /experts, permanently ───────────────────────────────────────────
  // The Ask page was retired (2026-08-19); the same free-text search lives on
  // the catalogue (?q=), and the page's `?cat=` was a category slug — the
  // catalogue reads the same slug as `?category=`. Old links keep their intent.
  // ⚠️ IT NAMES THE FINAL ADDRESS. This pointed at /tutors until stage 10; now
  // that /tutors itself 308s, leaving it would make every /ask link two hops
  // (tests/redirects.test.ts executes exactly that table).
  if (req.nextUrl.pathname === '/ask' || req.nextUrl.pathname.startsWith('/ask/')) {
    const url = req.nextUrl.clone()
    url.pathname = '/experts'
    const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
    const cat = req.nextUrl.searchParams.get('cat')?.trim() ?? ''
    url.search = ''
    if (q) url.searchParams.set('q', q)
    if (cat) url.searchParams.set('category', cat)
    return NextResponse.redirect(url, 308)
  }

  // ── /apply → /join, permanently ────────────────────────────────────────────
  // The two provider applications became one door (2026-08-19): /apply was the
  // expert's, /apply/master the ხელოსანი's, and /join asks which — so the old
  // trades address carries `?can=WORK` to pre-tick its half. The query string
  // survives (a `?redirect=`-style carry-through must not be dropped), and
  // anything else under /apply lands on the door itself.
  if (req.nextUrl.pathname === '/apply' || req.nextUrl.pathname.startsWith('/apply/')) {
    const url = req.nextUrl.clone()
    const wasMaster = req.nextUrl.pathname === '/apply/master' || req.nextUrl.pathname.startsWith('/apply/master/')
    url.pathname = '/join'
    if (wasMaster && !url.searchParams.has('can')) url.searchParams.set('can', 'WORK')
    return NextResponse.redirect(url, 308)
  }

  // ── /konsultacia → /experts, permanently ───────────────────────────────────
  // The profession landing pages moved into the expert address space (stage 8,
  // 2026-08-19): the hub /konsultacia → /experts, and every /konsultacia/<x> →
  // /experts/<x> (app/experts/[slug] resolves a profession slug BEFORE an
  // expert). Segment-for-segment; the query string survives (the clone keeps
  // it). Exact match or old-prefix-plus-slash — nothing looser.
  if (req.nextUrl.pathname === '/konsultacia' || req.nextUrl.pathname.startsWith('/konsultacia/')) {
    const url = req.nextUrl.clone()
    url.pathname = '/experts' + req.nextUrl.pathname.slice('/konsultacia'.length)
    return NextResponse.redirect(url, 308)
  }

  // ── /categories → /experts, /categories/<slug> → /experts?category=<slug> ──
  // The sphere landing pages were retired (stage 8, 2026-08-19, §8.7): the
  // catalogue's own filter is the sphere page. The LAST segment is the slug —
  // an absorbed category's nested address (/categories/<sphere>/<child>) names
  // the child last, and `?category=<child>` still lists its experts through the
  // sphere that took it (lib/categoryTree → categorySlugFilter). Other query
  // parameters survive; a `?category=` already present is overwritten by the
  // path, which is the more specific claim.
  if (req.nextUrl.pathname === '/categories' || req.nextUrl.pathname.startsWith('/categories/')) {
    const url = req.nextUrl.clone()
    url.pathname = '/experts'
    const segs = req.nextUrl.pathname.split('/').filter(Boolean).slice(1)
    let slug = segs.length ? segs[segs.length - 1] : ''
    // A malformed escape must not turn a redirect into a 500 — keep it raw.
    try { slug = decodeURIComponent(slug) } catch { /* raw */ }
    if (slug) url.searchParams.set('category', slug)
    return NextResponse.redirect(url, 308)
  }

  // ── /tutors, /tutors/<segment> → /experts…, permanently ────────────────────
  // Two moves, one block.
  //
  // (1) The expert PROFILE moved to its own address space (2026-08-19, stage
  // 5B): /experts/<slug> for TutorProfile, /services/<slug> for ServiceProfile —
  // one namespace per table. In stage 11, the same day, the two became ONE
  // namespace under /experts (see the /services block below); a slug is unique
  // across both tables now, so the two still cannot shadow each other.
  //
  // (2) THE CATALOGUE FOLLOWED IT IN STAGE 10, the same day. Owner: „ტუტორები
  // რატო უნდა იყოს სახელად" — „tutors" is a banned word in this project's own
  // lexicon and may not sit in a URL. So bare `/tutors` no longer falls through:
  // it is the catalogue's old address and it 308s to the catalogue's new one.
  // Segment-for-segment, so a profile link keeps its segment and the bare
  // address keeps none. The query string survives (the clone keeps it): every
  // deep link carries its intent there (?q=, ?category=, ?intent=message).
  //
  // Middleware runs with no database, so a cuid cannot be turned into its slug
  // here: /tutors/<cuid> lands on /experts/<cuid>, and app/experts/[slug]/
  // page.tsx — which resolves id OR slug — 308s that to /experts/<slug> as
  // before. Two hops for an old id link, one for an old slug link.
  if (req.nextUrl.pathname === '/tutors' || req.nextUrl.pathname.startsWith('/tutors/')) {
    const url = req.nextUrl.clone()
    const rest = req.nextUrl.pathname.slice('/tutors'.length)
    // `/tutors/` (trailing slash, no segment) is the catalogue, not a profile.
    url.pathname = rest === '' || rest === '/' ? '/experts' : '/experts' + rest
    return NextResponse.redirect(url, 308)
  }

  // ── /masters[/…] → /experts, and /services EXACTLY → /experts ──────────────
  // Stage 10 (2026-08-19). The trades catalogue and the trades DOOR are gone:
  // one list holds both halves, and the door listed trades the rail now lists
  // as a filter. Owner: „სერვისები საერთოდ ხო ამოსაგდებია."
  //
  // /masters keeps its query — `?trade=` and `?city=` mean the same thing on
  // the merged catalogue (lib/catalogItems → parseTrades/parseCities), so every
  // filtered link ever sent still resolves. Nothing ever lived under /masters/,
  // so a deeper path lands on the list rather than inventing a segment.
  //
  // ⚠️ /services IS THE BARE DOOR AND NOTHING ELSE HERE. Its CHILDREN moved
  // segment-for-segment in the block below; sending them to the catalogue would
  // throw away the segment a crawler and a shared link both carry.
  if (req.nextUrl.pathname === '/masters' || req.nextUrl.pathname.startsWith('/masters/') || req.nextUrl.pathname === '/services') {
    const url = req.nextUrl.clone()
    url.pathname = '/experts'
    return NextResponse.redirect(url, 308)
  }

  // ── /services/<anything> → /experts/<same>, permanently ────────────────────
  // ONE NAMESPACE (stage 11, 2026-08-19). Until today a provider lived in one
  // of TWO address spaces — a TutorProfile at /experts/<slug>, a ServiceProfile
  // at /services/<slug> — and the trade landings sat beside the second while
  // the profession landings sat beside the first. Two profile spaces and two
  // landing spaces contradict CLAUDE.md → THE PRODUCT MODEL: there is ONE
  // provider, and a consultation is one KIND of service, not a second product
  // with its own URLs. app/experts/[slug] now resolves all four in one
  // documented chain, and app/services no longer exists as a route at all.
  //
  // SEGMENT-FOR-SEGMENT, and the query string survives (the clone keeps it):
  // /services/santeqnika → /experts/santeqnika (the trade landing),
  // /services/nino-a1b2?utm_source=x → /experts/nino-a1b2?utm_source=x (the
  // profile). Nothing is dropped and nothing is guessed — a slug that was
  // unique in the old namespace is unique in this one (measured before the
  // move: 26 expert slugs, 7 provider slugs, 0 collisions; lib/slugSpace keeps
  // it that way for every slug minted from now on).
  //
  // ⚠️ IT SITS BELOW THE BARE-/services BLOCK ABOVE, which must stay an exact
  // match: the door goes to the catalogue, its children keep their segment. The
  // two together are the whole prefix, so a deeper path can never fall through
  // to a 404.
  if (req.nextUrl.pathname.startsWith('/services/')) {
    const url = req.nextUrl.clone()
    url.pathname = '/experts' + req.nextUrl.pathname.slice('/services'.length)
    return NextResponse.redirect(url, 308)
  }

  // ── /work/service-profile → /work/services, permanently ───────────────────
  // ONE PAGE FOR „რას ვყიდი?" (2026-08-19). The master answered that question
  // here and the expert answered it in a tab of /work/profile — two screens,
  // two halves of one workspace, for the one question a provider has about what
  // they sell. /work/services is both halves, gated per capability, and this is
  // the master's old address landing on it.
  //
  // ⚠️ IT SITS ABOVE THE SPACE MOVES, so the CURRENT old address lands in one
  // hop. The pre-stage-6 form (/provider/service-profile) reaches it in two —
  // the block below maps it onto /work/service-profile first — and that is
  // accepted: it is an address retired twice, and naming it here would put a
  // live „/provider…" literal back into this file, which is the one thing
  // tests/spaces.test.ts §G forbids outside the space block itself.
  //
  // Prefix-plus-slash as well as the exact match: nothing ever lived under it,
  // so a deeper path is a typo and belongs on the page rather than on a 404.
  {
    const from = '/work/service-profile'
    const p = req.nextUrl.pathname
    if (p === from || p.startsWith(from + '/')) {
      const url = req.nextUrl.clone()
      url.pathname = '/work/services'
      return NextResponse.redirect(url, 308)
    }
  }

  // ── /student, /tutor, /provider → /me, /work — the two spaces, permanently ─
  // Stage 6 (2026-08-19): three workspaces became two spaces. /me is the
  // client's (was /student); /work is the supply side's, whatever you supply —
  // the expert's screens (were /tutor) and the master's three (were
  // /provider/requests|offers|service-profile, now /work/…). Every old address
  // maps segment-for-segment; a bare /provider had no screen of its own and
  // went to the queue, so it still does. The query string survives (the clone
  // keeps it) — ?tab=, ?review=1, ?reminder= all carry intent.
  //
  // ⚠️ SEGMENT BOUNDARY, ALWAYS. `/tutor` must never catch `/tutors` (which is
  // the catalogue's own retired address, handled by its own block above and
  // pointed somewhere else entirely) and none of these may catch
  // `/api/tutor/*` or `/api/student/*` (API routes keep their paths — a route
  // file is not a screen). Exact match or old-prefix-plus-slash, nothing
  // looser.
  {
    const p = req.nextUrl.pathname
    const SPACE_MOVES: [from: string, to: string][] = [
      ['/student', '/me'],
      ['/tutor', '/work'],
      ['/provider', '/work'],
    ]
    for (const [from, to] of SPACE_MOVES) {
      if (p === from || p.startsWith(from + '/')) {
        const url = req.nextUrl.clone()
        const rest = p.slice(from.length)
        url.pathname = from === '/provider' && rest === '' ? `${to}/requests` : to + rest
        return NextResponse.redirect(url, 308)
      }
    }
  }

  // ── /work/bookings → /work/jobs, permanently ───────────────────────────────
  // ONE LIST OF WORK (2026-08-19). The same provider's committed work was split
  // by which machine produced it — a Booking on /work/bookings, an ACCEPTED
  // RequestOffer buried inside /work/offers — and a consultation is just a
  // service with a time (CLAUDE.md, THE PRODUCT MODEL), so both are „work I
  // have agreed to do" and belong on one screen. The query string survives (the
  // clone keeps it) because every deep link carries its intent there:
  // ?tab=attention from the dashboard alerts, ?tab=PREPARING from old
  // notifications — app/work/jobs/_client.tsx maps both onto the new buckets.
  //
  // ⚠️ EXACT MATCH, NEVER A PREFIX. `/work/bookings/<id>` is the booking DETAIL
  // page; it did not move, it is linked from a dozen notification hrefs and
  // e-mails, and a `startsWith` here would 308 every one of them onto a list.
  // This is the second block in this file that must never grow one.
  if (req.nextUrl.pathname === '/work/bookings' || req.nextUrl.pathname === '/work/bookings/') {
    const url = req.nextUrl.clone()
    url.pathname = '/work/jobs'
    return NextResponse.redirect(url, 308)
  }

  // ── The requests subsystem, off ───────────────────────────────────────────
  // FEATURE_REQUESTS is not „on" → every path the subsystem owns answers 404,
  // for everyone, ADMINS INCLUDED. Off that an admin can still see is not off,
  // and the one person most likely to be testing would be the one person unable
  // to verify the switch works.
  //
  // ⚠️ THIS IS THE OUTER GATE, NOT THE GUARD. It cannot know the allowlist —
  // middleware runs with no database — and a matcher is one config edit away
  // from not covering a new path. So every page and every route ALSO calls
  // requestsViewer() (lib/requestsServer) for itself. Neither layer is
  // load-bearing alone; that is the design, not redundancy.
  //
  // 404 with no body rather than a redirect: a redirect to /signin tells an
  // anonymous visitor the page is real and worth returning to with an account,
  // which is the one thing the 404 exists to deny.
  //
  // ⚠️ The variable is read at BUILD time here (Next inlines process.env into
  // the middleware bundle), so flipping it in the Railway dashboard takes
  // effect on the redeploy that follows — which Railway triggers on a variable
  // change anyway. The server-side gate reads it per request, so the two can
  // only ever disagree during a deploy, and only in the safe direction: the
  // middleware still 404s while a stale build serves.
  if (!requestsOn() && isRequestPath(req.nextUrl.pathname)) {
    return new NextResponse(null, { status: 404 })
  }
  // The supply side has its own, narrower switch (lib/requests → providersOn):
  // same 404, same reasons, same outer-gate-not-guard caveat.
  if (!providersOn() && isProviderPath(req.nextUrl.pathname)) {
    return new NextResponse(null, { status: 404 })
  }

  const path = req.nextUrl.pathname + req.nextUrl.search
  const res = NextResponse.next({
    request: { headers: new Headers([...req.headers.entries(), ['x-current-path', path]]) },
  })
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  // HSTS makes sense only on HTTPS; harmless (ignored) on plain HTTP.
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  // Content Security Policy — ENFORCED. `'unsafe-inline'` / `'unsafe-eval'` on
  // script-src remain required by Next.js hydration until per-request nonces are
  // wired in, but default-src/connect-src/object-src/frame-ancestors/base-uri/
  // form-action are now actively enforced, so injected scripts can't exfiltrate
  // to third-party origins, the page can't be framed, and forms can't post
  // off-origin. Image hosts: pravatar (fallback avatars), unsplash (marketing
  // photos), Google Cloud Storage (video previews); data:/blob: cover uploaded
  // attachments rendered inline in chat.
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // script-src: 'self' + Next hydration inline/eval, plus Google Tag Manager
      // (gtag.js) for the admin-managed Google Analytics integration.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.googletagmanager.com",
      "style-src 'self' 'unsafe-inline'",
      // img-src: pravatar (fallback), unsplash (marketing photos), Google
      // Cloud Storage (video previews), YouTube's thumbnail CDN (apply/admin
      // preview cards), and GA/GTM (measurement beacons sent as image pixels).
      "img-src 'self' data: blob: https://i.pravatar.cc https://images.unsplash.com https://commondatastorage.googleapis.com https://img.youtube.com https://i.ytimg.com https://*.googleusercontent.com https://*.google-analytics.com https://*.googletagmanager.com",
      "font-src 'self' data:",
      // connect-src: 'self' + GA4 measurement endpoints (google-analytics.com,
      // regionN.google-analytics.com, analytics.google.com) it beacons to.
      // www.google.com is added because GA4 also fires a /g/collect beacon there
      // (ads/conversion linker) — without it those beacons are CSP-refused.
      "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://www.google.com",
      // frame-src: allow YouTube's nocookie embed domain so the intro-video
      // iframe on /experts/[slug] and /tutor/profile can load. `frame-ancestors`
      // stays 'none' — that governs *who can embed us*, not *what we embed*.
      "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  )
  return res
}

export const config = {
  // Skip static assets and Next internals; apply to every real page + API route.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts).*)'],
}

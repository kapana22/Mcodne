import Link from 'next/link'
import { pageMetadata } from '@/lib/pageSeo'
import { jsonLdString } from '@/lib/jsonLd'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Container } from '@/components/Container'
import { Card } from '@/components/Card'
import { Btn } from '@/components/Btn'
import { Reveal } from '@/components/Reveal'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { ApplyCtaGate } from '@/components/ApplyCtaGate'
import { SiteText } from '@/components/SiteTextProvider'
import { tileHue } from '@/app/_home/data'
import { requestsOn, REQUEST_ROUTE } from '@/lib/requests'
import {
  CONTACT_REFUND_NOTE,
} from '@/lib/credits'

// /about — „როგორ მუშაობს", ported from the owner's design canvas
// „How It Works + Help" (2026-08-31).
//
// ⚠️ WHAT THIS REPLACED, AND WHY. The header has pointed „როგორ მუშაობს" at
// /about since stage 9, and the page never answered the question: it opened on
// „ცოდნა, რომელსაც შენ ენდობი" and went straight to four principles. The canvas
// answers it first — a green card, a კლიენტს/ექსპერტს switch, numbered steps,
// two facts, one closing band — and the „ჩვენს შესახებ" material the page used
// to open with is kept BELOW it, whole. Nothing was deleted and no SiteText key
// was retired (owner: „თუ აკლია რამე დამატე, არ წაშალო"); `about.cta.title` /
// `about.cta.body` simply moved into the expert side's closing band, which is
// the sentence they already were.
//
// ⚠️ THE SIDE SWITCH IS TWO LINKS, NOT A CLIENT COMPONENT. The canvas draws a
// two-button segmented control and wires it to component state. `?for=expert`
// does the same job with no JavaScript at all, survives a share and a reload,
// and lets the SERVER pick the copy — which is what this page needs anyway,
// because the client side reads a measured count out of the database. The
// header already switches „როგორ მუშაობს" / „დახმარება"; this switch is the one
// thing on the page the nav does NOT do.
//
// ⚠️ THE COMMISSION IS NOWHERE ON THIS PAGE, DELIBERATELY. The canvas carries
// it three times — a „0% საკომისიო სამუშაოს ფასიდან" tile and a step ending
// „სამუშაოს ფასიდან საკომისიოს არ ვიღებთ". The owner has not decided the
// commission question („ჯერ არ გადავწყვიტოთ") and its standing answer is that
// it is written nowhere, so every one of those sentences is left out rather
// than replaced with a different claim about money. `lib/flags → COMMISSION_PCT`
// and the 15% wording on /help and /terms are untouched.
//
// ⚠️ TWO CANVAS NUMBERS ARE NOT ON THIS PAGE EITHER: „24 სთ" (how fast offers
// arrive) and „3" (how many arrive), plus „58₾" of profile bonus, which is not
// even the real figure. None is measured, and 🔒 rule 6 („never invent a
// number") is one of the six that protect a person. What is left in the fact
// row is measured or read from a constant, and nothing else.

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

// Editable in ადმინი → ტექსტები (group „SEO — …"). See lib/pageSeo.
// Metadata now reads the editable SEO text from the database, so this page
// must render per request. Built statically it would bake whatever the
// defaults were at BUILD time — and Railway's builder cannot reach the DB,
// so that means the code defaults forever, whatever the admin types.
export const dynamic = 'force-dynamic'

export const generateMetadata = () => pageMetadata('about', '/about')

/** The canvas's radial for the hero card, with its FIRST STOP LIFTED to
 *  brand-600 — the same substitution `app/_home/hero.tsx` documents at length:
 *  the canvas paints #2F9C86 (brand-500) and white on it measures 3.38:1, under
 *  AA. #26806E is 4.78:1 and, this early in a radial that ends at brand-900, is
 *  the same picture. CLAUDE.md rule 2, computed by tests/designTokens. */
const HERO_GRADIENT =
  'radial-gradient(130% 150% at 10% 5%, #26806E 0%, #1E6656 46%, #123A31 100%)'

/** The four steps a CLIENT walks, and they are the HOME PAGE'S OWN KEYS.
 *  `home.flow.s1…s4` were settled on 2026-08-31 and render on the home's green
 *  card; this page tells the same story to the same person. A fifth copy of the
 *  sentences under an `about.*` key would be a second thing to edit and a
 *  second thing to forget. */
const CLIENT_STEPS = [1, 2, 3, 4].map(n => ({
  titleKey: `home.flow.s${n}.title`,
  bodyKey: `home.flow.s${n}.desc`,
}))

/* ⚠️ TWO CARDS SINCE 2026-09-02, DOWN FROM FOUR, and the grid is `sm:grid-cols-2`
 * so two is one clean row rather than a gap.
 *
 * What went, and why each: „გადამოწმებული ცოდნა · ხელით ვამოწმებთ…" was the
 * verification claim, and 1 of 26 providers is verified; „ღირებული დრო · ფასი
 * წინასწარ ცნობილია…" was the price card again in other words. Both keys are
 * `retired` in lib/siteTextDefs rather than deleted, which is what that file
 * requires of a key whose surface is gone.
 *
 * Owner: „ძალიან მარტივი, მოკლე უნდა იყოს და არ უნდა იყოს ტყუილები." Two true
 * sentences are a better principles list than four with two lies in it. */
const VALUES = [
  { icon: <Icon.wallet className="w-5 h-5" />, titleKey: 'about.value2.title', bodyKey: 'about.value2.body' },
  { icon: <Icon.users className="w-5 h-5" />, titleKey: 'about.value4.title', bodyKey: 'about.value4.body' },
]

/** One numbered step card. The 56px plate takes its tint from `TILE_HUES`
 *  (app/_home/data) by POSITION — the same palette and the same rule as the
 *  home page's category tiles, so the two pages read as one system and no hue
 *  has to be retyped as an oklch string here.
 *
 *  ⚠️ `rounded-panel` AND `border-ink-100`, WHICH IS NOT THE <Card> SHELL. The
 *  canvas keeps a real radius hierarchy — 24px for a card (the fact tiles and
 *  the FAQ items below both use <Card>), 28px for a panel that HOLDS one — and
 *  a step card is a panel. `<Card className="rounded-panel">` cannot express
 *  that: two border-radius utilities on one element resolve by Tailwind's emit
 *  order, not the order they are written (the trap components/Card documents
 *  for its `edge` prop). */
const Step = ({ n, titleKey, bodyKey, body }: {
  n: number
  titleKey: string
  bodyKey?: string
  body?: string
}) => {
  const hue = tileHue(n - 1)
  return (
    <div className="rounded-panel border border-ink-100 bg-white p-6 sm:p-7 flex flex-wrap items-start gap-5 sm:gap-6">
      <span
        aria-hidden
        style={{ backgroundColor: hue.bg, borderColor: hue.border }}
        className="w-14 h-14 shrink-0 rounded-tile border font-display text-h2 font-extrabold tabular-nums text-ink-900 inline-flex items-center justify-center"
      >
        {n}
      </span>
      <div className="flex-1 min-w-[240px]">
        <h3 className="font-display text-h3 sm:text-h2 font-bold text-ink-900 tracking-tight">
          <SiteText k={titleKey} />
        </h3>
        <p className="mt-2.5 text-body-lg text-ink-700 leading-relaxed">
          {bodyKey ? <SiteText k={bodyKey} /> : body}
        </p>
      </div>
    </div>
  )
}

/* ⚠️ `Fact` — the tile component — WENT WITH THE TILES (2026-09-02). It had one
 * caller and the page no longer prints a headline number anywhere: the roster
 * count came off it that morning and the two price tiles that afternoon. A
 * component with no call site is dead weight in a file this file's own header
 * describes; the shape is two lines of JSX if a measured fact ever earns a
 * place here again. */

/* ⚠️ THIS PAGE TOOK `searchParams` UNTIL 2026-09-02, FOR ONE FLAG: `?for=expert`,
 * which chose between two halves of the page. Both halves are on the page now
 * (see the note above the sections), so it reads no query at all. An old
 * `/about?for=expert` link still resolves — the parameter is simply ignored. */
export default async function AboutPage() {

  // ⚠️ THE INTAKE IS FLAG-GATED AND THE FLAG IS READ HERE, IN THE PAGE. This is
  // a new door into /request and it is listed in tests/requests.test.ts →
  // CLIENT_ENTRY_POINTS with this file as its own gate. Off, the button goes to
  // the catalogue instead, which carries its own gated CTA one tap away — the
  // same fallback the home page's hero field uses. A button onto a 404 is worse
  // than a button one step further from the form.
  const requestHref = requestsOn() ? REQUEST_ROUTE : '/experts'

  // 🔒 MEASURED, through the same gate /experts lists — never estimated, and
  // never printed when it is zero (the tile would be reporting that the
  // marketplace is empty). A failed count drops the tile rather than the page:
  // this is a marketing surface and a decoration must never take it down.
  //
  // ⚠️ THE BOOT IS BOUNDED, for the reason app/page.tsx spells out at length:
  // with Postgres unreachable an unbounded `ensureDbReady()` waits the full
  // pool timeout and the visitor gets a gateway error instead of the page. The
  // catch below has to be able to FIRE, and four seconds is what lets it.
  /* ⚠️ THE ROSTER COUNT WAS READ HERE AND IS NOT ANY MORE (2026-09-02).
     Owner: „არასად არ ეწეროს ეგ ინფო, არასაჭიროა." It printed
     „N ექსპერტი პლატფორმაზე" in the client-side facts below — the home closing
     band's caption for the same number, which is exactly why it goes too: the
     claim was deleted from the home page and the catalogue on the same day, and
     leaving the third copy here would put the site back to describing its own
     supply in one place out of three.

     The bounded-boot machinery above it went with it — it existed to keep this
     one decoration from taking a marketing page down. */

  /* ⚠️ THE TWO PRICE TILES ARE GONE (2026-09-02) — „0₾ · გაგზავნა უფასოა" and
     „3₾ · კლიენტის კონტაქტი — 3₾ ბალანსიდან…". Owner: „ესეთი ზედმეტი ინფო არ
     უნდა ჩანდეს… მიხვდება ეტაპობრივად კლიენტი და მერე დავამატებთ. არ
     გავურთულოთ."

     They were the ledger's own sentences printed on a page whose job is to
     explain the SHAPE of the thing — what a lead costs is a question somebody
     asks after they have decided to sell here, and /work/balance answers it
     with their real balance beside it. Neither number is lost: `CONTACT_COST_NOTE`
     and `OFFER_FREE_NOTE` still render where the money actually moves. */

  // AboutPage + the Organization it describes. This page is where a search
  // engine expects to find the entity behind the site — it was the only public
  // marketing page emitting no structured data at all.
  const aboutLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: 'ჩვენს შესახებ — მცოდნე',
    url: `${SITE_URL}/about`,
    inLanguage: 'ka',
    mainEntity: {
      '@type': 'Organization',
      name: 'მცოდნე',
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
      areaServed: { '@type': 'Country', name: 'Georgia' },
      /* ⚠️ THIS IS A FOURTH COPY OF THE FOOTER LINE, TYPED (2026-09-02 audit).
         It is the Organization description Google reads, so it outlived the
         other three: „ხელით შერჩეული ექსპერტებისგან" was removed from the
         footer, /about and the help answer that morning and survived here,
         inside JSON-LD, where no screen shows it and no eye catches it. */
      description: 'ქართული სერვისების პლატფორმა — აღწერე რა გჭირდება და მიიღე შეთავაზებები ექსპერტებისგან.',
      // `sameAs` is intentionally absent until real social profiles exist —
      // a guessed or empty array is a worse signal than none.
    },
  }
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'მთავარი', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'ჩვენს შესახებ' },
    ],
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(aboutLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbLd) }} />
      <MarketingTopBar />

      <Container as="main" size="content" className="py-10 lg:py-14">
        {/* ── The green card ─────────────────────────────────────────────── */}
        <div
          style={{ backgroundImage: HERO_GRADIENT }}
          className="rounded-band px-7 py-9 text-white sm:px-10 sm:py-12 lg:px-14 lg:py-14"
        >
          <h1 className="font-display text-display lg:text-display-xl font-extrabold tracking-tight leading-[1.05] motion-safe:animate-rise-in">
            <SiteText k="about.how.title" />
          </h1>
          {/* Solid white, never `text-white/80`: tests/designTokens §C computes
              that even 90% white fails on a brand fill, so hierarchy on a green
              surface comes from size and weight. The gradient's far end is
              brand-900, but the sentence sits over the light half. */}
          <p className="mt-4 max-w-[560px] text-body-lg lg:text-h3 leading-relaxed text-white">
            <SiteText k="about.how.body" />
          </p>
        </div>

        {/* ⚠️ THE კლიენტს / ექსპერტს SWITCH IS GONE (2026-09-02), AND WITH IT
            `?for=expert`. Owner: „ეს გადამრთველიც რა საჭიროა, ვერ ვხდები."

            Three reasons it could not stay:

            · IT HID THE PAGE FROM THE PERSON THE PAGE IS FOR. Somebody on
              „როგორ მუშაობს" is usually there BECAUSE they do not yet know
              which side they are on, and the first thing the screen asked them
              was to declare it. Half the answer was one click away and the
              other half was invisible.
            · THE CLIENT HALF WAS THE HOME PAGE AGAIN. `CLIENT_STEPS` are
              `home.flow.s1…s4` — the same four keys the home page's own „როგორ
              მუშაობს" block renders. A visitor who scrolled the home page and
              then opened /about read the identical four cards twice.
            · TWO STATES, ONE SHORT PAGE. Seven steps in total. There was never
              enough content here to be worth a mode.

            Both sides are simply on the page now, in the order the marketplace
            runs — demand first, then supply — each closing on its own action.
            Anybody arriving on an old `/about?for=expert` link lands on the
            same page and can see the expert half by scrolling, so nothing 404s
            and nothing needs a redirect. */}

        {/* ── კლიენტს ────────────────────────────────────────────────────── */}
        <Reveal>
          <h2 className="mt-10 font-display text-h2 font-bold tracking-tight text-ink-900">კლიენტს</h2>
        </Reveal>
        <Reveal stagger className="mt-4 flex flex-col gap-3.5">
          {CLIENT_STEPS.map((s, i) => (
            <Step key={s.titleKey} n={i + 1} titleKey={s.titleKey} bodyKey={s.bodyKey} />
          ))}
        </Reveal>

        <Reveal>
          <div className="mt-5 rounded-panel bg-ink-900 text-white p-7 sm:p-8 flex flex-wrap items-center gap-6">
            <div className="flex-1 min-w-[260px]">
              <div className="font-display text-h2 font-extrabold tracking-tight">
                <SiteText k="about.cta.client.title" />
              </div>
              <p className="mt-2 text-body-lg text-white/75 leading-relaxed">
                <SiteText k="about.cta.client.body" />
              </p>
            </div>
            <Btn variant="primary" size="lg" href={requestHref}>
              <SiteText k="about.cta.client.button" />
            </Btn>
          </div>
        </Reveal>

        {/* ── ექსპერტს ───────────────────────────────────────────────────── */}
        <Reveal>
          <h2 className="mt-14 font-display text-h2 font-bold tracking-tight text-ink-900">ექსპერტს</h2>
        </Reveal>
        <Reveal stagger className="mt-4 flex flex-col gap-3.5">
          <Step n={1} titleKey="about.provider.s1.title" bodyKey="about.provider.s1.desc" />
          <Step n={2} titleKey="about.provider.s2.title" bodyKey="about.provider.s2.desc" />
          {/* ⚠️ THE THIRD STEP'S SENTENCE IS A CONSTANT, NOT A SiteText KEY.
              It is the refund half of the contact price, and lib/credits owns
              every string that quotes that number — „THE PRICE IS SPELLED ONCE,
              HERE, NEVER ON A SCREEN". An editable copy would freeze today's
              lari into a row and keep printing it after a re-price. Same rule
              as HELP_LOCKED_ANSWER_IDS. */}
          <Step n={3} titleKey="about.provider.s3.title" body={CONTACT_REFUND_NOTE} />
        </Reveal>

        {/* ⚠️ GATED, AND THAT IS THE RULE RATHER THAN A PREFERENCE. „ხარ
            ექსპერტი? გვინდა შენი ცოდნა" addressed to somebody who already sells
            here is exactly the role-blur ApplyCtaGate exists to stop
            (CLAUDE.md → „Who is who"). A provider reading this page sees the
            steps and the facts and no invitation, which is correct: they are
            not the audience for it. */}
        <ApplyCtaGate>
          <Reveal>
            <div className="mt-5 rounded-panel bg-ink-900 text-white p-7 sm:p-8 flex flex-wrap items-center gap-6">
              <div className="flex-1 min-w-[260px]">
                <div className="font-display text-h2 font-extrabold tracking-tight">
                  <SiteText k="about.cta.title" />
                </div>
                <p className="mt-2 text-body-lg text-white/75 leading-relaxed">
                  <SiteText k="about.cta.body" />
                </p>
              </div>
              {/* The canvas fills this button #2F9C86. `variant="primary"` is
                  brand-600 — the substitution CLAUDE.md rule 2 requires. */}
              <Btn variant="primary" size="lg" href="/join">
                <SiteText k="about.cta.expert.button" />
              </Btn>
            </div>
          </Reveal>
        </ApplyCtaGate>

        {/* ── „ჩვენს შესახებ" ────────────────────────────────────────────────
            Everything the page used to open with, kept whole and moved under
            the answer to its own headline. It is not part of the კლიენტს /
            ექსპერტს switch — it is about the company, which is the same for
            both — so it sits outside the switched region. */}
        <section className="mt-16 lg:mt-20 pt-10 border-t border-ink-200">
          <Reveal>
            <Eyebrow className="mb-3">ჩვენს შესახებ</Eyebrow>
            <h2 className="font-display text-h1 lg:text-display font-bold text-ink-900 tracking-tight leading-tight">
              <SiteText k="about.hero.title" />
            </h2>
            <p className="mt-4 max-w-[640px] text-body-lg text-ink-600 leading-relaxed">
              <SiteText k="about.hero.body" />
            </p>
          </Reveal>

          <Reveal>
            <h3 className="mt-12 font-display text-h2 font-bold text-ink-900 tracking-tight">
              <SiteText k="about.principles.title" />
            </h3>
          </Reveal>
          {/* Reveal-stagger (scroll-triggered) instead of load-time .stagger,
              which finished animating long before the user scrolled here. */}
          <Reveal stagger className="mt-5 grid sm:grid-cols-2 gap-3.5">
            {VALUES.map(v => (
              <Card key={v.titleKey} edge="hairline" padding="default" interactive>
                <div className="w-10 h-10 rounded-btn bg-brand-50 text-brand-700 flex items-center justify-center">
                  {v.icon}
                </div>
                <div className="font-display text-h3 font-bold text-ink-900 mt-4"><SiteText k={v.titleKey} /></div>
                <p className="mt-2 text-body text-ink-600 leading-relaxed"><SiteText k={v.bodyKey} /></p>
              </Card>
            ))}
          </Reveal>

          {/* ⚠️ „პირდაპირი წვდომა ცოდნაზე" CLOSED THIS PAGE AND IS DELETED
              (2026-09-02). It was the third block in a row saying one thing:
              „ცოდნა, რომელსაც შენ ენდობი" („ვერ პოულობს ექსპერტს, ვისაც
              ენდობა") six inches above it, then the principles, then this
              („კარგი კონსულტაცია ძნელი საპოვნელია — ცოდნა არსებობს, მაგრამ
              ხელმისაწვდომი არაა"). Two paragraphs of the same idea, in two
              voices, under two headings.

              It also carried the last „ხელით შერჩეულ ქართველ ექსპერტთან" on the
              page. The keys are `retired` in lib/siteTextDefs, not removed. */}
        </section>
      </Container>

      <Footer />
    </div>
  )
}

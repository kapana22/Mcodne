// The /business landing itself. Mounted by ./page.tsx, which owns the metadata
// and the canSeeB2B gate — this file assumes it is allowed to render.
//
// WHAT THIS PAGE SELLS, and why it does not look like the rest of the site.
// Everywhere else a client picks a PERSON and books their hour. Here a company
// buys a SERVICE at a fixed price — a CONSULTATION or a TRAINING, in sales or
// business or whatever else — and who delivers it is our problem, not part of
// the offer. So there are no expert cards, no availability, no calendar: the
// page is a price list plus a request form.
//
// ⚠️ DO NOT PUT THE INTERMEDIARY BACK IN THE COPY (owner, 2026-08-12). The page
// used to lead with „ექსპერტს ჩვენ შევარჩევთ", make „ექსპერტს ვარჩევთ ჩვენ" one
// of three steps, and open with a count of verified experts. All three sold the
// matchmaking rather than the service, and a company reading them has to wonder
// who is actually accountable. What is on offer is the service.
//
// ⚠️ EVERY CLAIM ON THIS PAGE IS TRUE TODAY, AND THAT IS A HARD RULE.
// components/TrustStrip.tsx states the standard for the whole site: „a trust
// strip has to state something true NOW; „soon" is a promise, and a promise in
// the reassurance slot reassures nobody." A B2B buyer is the reader most likely
// to test a claim, and the first one they catch costs the rest.
//
// So the numbers below are COUNTED FROM THE DATABASE at request time, not
// written down. Deliberately ABSENT, because nothing here can honestly support
// them yet: a response-time promise, an NDA or confidentiality guarantee, a
// refund policy, any „500+ companies trust us" line, and logos. If the owner
// wants those, they have to become true first.
//
// The COPY is placeholder and the owner replaces it. The SERVICES are not copy
// — they are rows written in ადმინი → კომპანიები → სერვისები.

import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { areaRestatesKind, groupByKind, kindLabel, servicePriceLabel } from '@/lib/b2b'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'
import { Container } from '@/components/Container'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Footer } from '@/components/Footer'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'
import { Btn } from '@/components/Btn'
import { LeadForm } from './LeadForm'

export type PublicService = {
  id: string
  /** CONSULTATION | TRAINING — see lib/b2b. */
  kind: string
  direction: string
  title: string
  description: string | null
  format: string | null
  priceGel: number
  priceOnRequest: boolean
  order: number
}

/* How it works — three lines, and that is the whole explanation.
   It was three headings plus three sentences; the owner read the page and said
   „სულ ტექსტი ტექსტი". A process nobody reads explains nothing, so each step
   is now one phrase somebody takes in at a glance. The middle one is the
   product: the company does not search or compare — we do. */
const STEPS: { icon: keyof typeof Icon; text: string }[] = [
  { icon: 'send', text: 'გვიგზავნით მოთხოვნას' },
  { icon: 'doc', text: 'ვთანხმდებით ფორმატსა და ფასზე' },
  { icon: 'check', text: 'ვატარებთ' },
]

/* The reassurance, stated once. It used to sit in its own strip between the
   price list and the form — a band of three grey lines that read as leftover
   furniture. It now sits BESIDE the form, which is where CLAUDE.md says trust
   signals belong: at the decision point, not floating in the page. */
const FACTS: { icon: keyof typeof Icon; text: string; brand?: boolean }[] = [
  { icon: 'doc', text: 'ანგარიშსწორება ინვოისით', brand: true },
  { icon: 'check', text: 'ფასი წინასწარ შეთანხმებული' },
]

export async function BusinessLanding() {
  await ensureDbReady().catch(() => {})

  // Everything the page needs, in one round-trip. Each arm has its own fallback
  // because a DB failure must not take the whole page: a company that cannot
  // see the price list can still write to us, which beats a 500.
  /* ⚠️ `imageUrl` IS NOT SELECTED, and must never be. It holds a base64 image;
     six of them in the page payload is most of a megabyte re-sent on every
     navigation and cached by nothing — the measurement behind /api/avatars.
     Prisma cannot compute a boolean, so the raw column is read in a second,
     narrow query and immediately reduced to (id → cache key) here. */
  const [services, imageRows] = await Promise.all([
    prisma.b2BService.findMany({
      where: { visible: true },
      // `id` last, and it is not decoration: with equal (kind, direction,
      // order) Postgres hands back PHYSICAL order, which changes the moment a
      // row is updated — so editing one service silently reshuffled the cards
      // around it. Seen happening in a screenshot pair, not theorised.
      orderBy: [{ kind: 'asc' }, { direction: 'asc' }, { order: 'asc' }, { id: 'asc' }],
      select: {
        id: true, kind: true, direction: true, title: true, description: true, format: true,
        priceGel: true, priceOnRequest: true, order: true,
      },
      take: 200,
    }).catch(() => [] as PublicService[]),
    prisma.$queryRawUnsafe<{ id: string; v: string }[]>(
      // length + the last bytes: enough to change whenever the image does,
      // which is what makes the route's `immutable` cache header safe.
      `SELECT "id", (length("imageUrl") || right("imageUrl", 8)) AS v
         FROM "B2BService" WHERE "visible" = true AND "imageUrl" IS NOT NULL`,
    ).catch(() => [] as { id: string; v: string }[]),
  ])
  const imageVersion = new Map(imageRows.map(r => [r.id, r.v]))

  const byKind = groupByKind(services)

  /* THE ONE NUMBER, and it counts OUR OWN CATALOGUE — not the expert roster.
     It used to read „N დადასტურებული ექსპერტი", counted off TutorProfile, which
     put the intermediary in the first line a company reads. That is not what is
     on offer here: a company buys a consultation or a training, and who
     delivers it is our problem, not their decision (owner, 2026-08-12).
     Still COUNTED, never written down — the rule the file header states.
     Each fact carries its OWN truth condition, too: they used to share one, so
     a thin expert roster silently deleted „ანგარიშსწორება ინვოისით" as well. */
  const areaCount = new Set(
    services.filter(s => !areaRestatesKind(s.kind, s.direction)).map(s => s.direction),
  ).size
  const heroFacts: { icon: keyof typeof Icon; text: string; brand?: boolean }[] = [
    ...(areaCount >= 2 ? [{ icon: 'grid' as const, text: `${areaCount} მიმართულება`, brand: true }] : []),
    { icon: 'doc' as const, text: 'ანგარიშსწორება ინვოისით' },
    { icon: 'check' as const, text: 'ფასი წინასწარ შეთანხმებული' },
  ]

  return (
    <div className="min-h-screen bg-ink-50">
      <MarketingTopBar />

      <main>
        {/* ── Hero ──────────────────────────────────────────────────────────
            A DARK BAND, full-bleed, and it is the one thing on this page that
            deliberately does not look like the rest of the site. The reader
            here is not a person picking a tutor; they arrived by a private URL
            because somebody sent it to them, and the first job of the page is
            to say „this is the company side" before a word is read. The token
            is `gradient-dark` — the same warm charcoal /about and the tutor
            dashboard already use, never an ad-hoc wash.
            Opacity tiers for the sub-copy are legitimate HERE and only here:
            CLAUDE.md permits `text-white/…` on dark neutral grounds (it
            measures 5.2+), while forbidding it on a brand fill. */}
        <section className="bg-gradient-dark text-white">
          <Container className="py-16 lg:py-24">
            <div className="max-w-[760px]">
              <Eyebrow tone="onDark" className="mb-3">ბიზნესისთვის</Eyebrow>
              <h1 className="font-display text-display lg:text-display-xl font-bold tracking-tight leading-[1.05]">
                სერვისები კომპანიებისთვის
              </h1>
              <p className="mt-6 text-body-lg text-white/70 max-w-[560px]">
                სერვისები და ტრენინგი — ბიზნესში, გაყიდვებში და სხვა მიმართულებებში.
              </p>

              {/* THE ACTION, at the top. The page's whole purpose is one form,
                  and it used to live below a full price list with nothing above
                  the fold pointing at it — a landing page whose call to action
                  is only reachable by scrolling past everything. */}
              <div className="mt-8 flex flex-wrap items-center gap-3">
                {/* <Btn href> — not a hand-rolled anchor. `size="lg"` is the h-12
                    tier and it ships the matching text-body-lg label, which is
                    the pairing CLAUDE.md pins (a control's label size follows
                    its height, and it cannot be patched through className). */}
                <Btn href="#form" size="lg">მოთხოვნის გაგზავნა</Btn>
                {byKind.length > 0 && (
                  /* The secondary is the ONE place this page departs from the
                      Btn variants: `secondary` is a white fill, which on a dark
                      band would read as a second primary. An outline in the
                      band's own light is the quiet option here. */
                  <a
                    href="#services"
                    className="h-12 px-6 rounded-btn border border-white/25 hover:border-white/45 hover:bg-white/5 text-white font-display text-body-lg font-semibold inline-flex items-center transition-colors duration-fast"
                  >
                    სერვისები და ფასები
                  </a>
                )}
              </div>

              <div className="mt-9 pt-7 border-t border-white/10 flex flex-wrap items-center gap-x-7 gap-y-2.5 text-small text-white/70">
                {heroFacts.map(f => {
                  const Glyph = Icon[f.icon]
                  return (
                    <span key={f.text} className="inline-flex items-center gap-2">
                      <Glyph className={`w-4 h-4 shrink-0 ${f.brand ? 'text-brand-400' : 'text-white/45'}`} aria-hidden="true" />
                      {f.text}
                    </span>
                  )
                })}
              </div>
            </div>
          </Container>
        </section>

      {/* Less padding at the TOP than the bottom, deliberately: the dark band
          above already ends in 64–96px of its own space, so a symmetric py-24
          put ~200px of nothing between the hero and the first thing to read. */}
      <Container className="pt-12 lg:pt-14 pb-16 lg:pb-24">
        {/* ── How it works ── */}
        <section>
          <div className="grid sm:grid-cols-3 gap-4">
            {STEPS.map((s, i) => {
              const Glyph = Icon[s.icon]
              return (
                <div key={s.text} className="flex items-center gap-3 rounded-card border border-ink-200 bg-white px-4 py-3.5">
                  <span className="w-6 h-6 shrink-0 rounded-pill bg-ink-900 text-white inline-flex items-center justify-center font-display text-micro font-bold tabular-nums">
                    {i + 1}
                  </span>
                  <Glyph className="w-4 h-4 shrink-0 text-ink-400" aria-hidden="true" />
                  <span className="font-display text-small font-semibold text-ink-900">{s.text}</span>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── The catalogue ─────────────────────────────────────────────────
            A PRICE LIST, not a card grid. It was `sm:grid-cols-2
            lg:grid-cols-3` PER DIRECTION, and the directions hold 1, 2, 2 and 1
            service — so at 1440px every group left two thirds of its row empty
            and the page read as broken rather than as a short catalogue. A grid
            only looks finished when its rows are full, which a price list can
            never guarantee: the owner adds one service to one direction and the
            shape of another changes.
            A divided list is the right instrument. Every row spans the width by
            construction, the prices stack into one scannable column on the
            right — which is how a company reads a price list — and it stays
            correct at one service or at fifty. */}
        {byKind.length > 0 && (
          <section id="services" className="mt-16 lg:mt-24 scroll-mt-24">
            <Eyebrow className="mb-2">ფასები</Eyebrow>
            <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight">სერვისები</h2>

            <div className="mt-8 space-y-8">
              {/* GROUPED BY KIND, not by area. „Consultation or training" is the
                  question a company answers first; the area is what the row is
                  ABOUT, and it rides on the row as a chip. Grouping by area put
                  „ტრენინგები" beside „იურიდიული" as if they were the same kind
                  of heading — which is exactly the confusion the `kind` column
                  now removes. */}
              {byKind.map(([kind, list]) => (
                <div key={kind}>
                  <div className="flex items-baseline gap-3">
                    <h3 className="font-display text-h3 font-bold text-ink-900 tracking-tight">{kindLabel(kind)}</h3>
                    <span className="text-meta text-ink-400 tabular-nums">{list.length}</span>
                  </div>

                  {/* CARDS, TWO PER ROW. The list this replaced was right while
                      rows carried nothing but text — but a picture needs a card,
                      and the grid now fills because the groups are KINDS: four
                      consultations make two full rows, two trainings make one.
                      (The old grid went ragged because it was three columns per
                      AREA, and areas hold one or two services.) */}
                  <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
                    {list.map(s => (
                      <article
                        key={s.id}
                        className="group flex flex-col rounded-card border border-ink-200 bg-white overflow-hidden hover:border-ink-300 transition-colors duration-fast"
                      >
                        {/* 16:9, the ratio /api/uploads hard-crops a cover to,
                            so nothing is ever letterboxed.
                            THE EMPTY STATE IS A QUIET PANEL, not a slab. The
                            first attempt filled it with `gradient-dark` and the
                            area name — at two columns that was a ~470px black
                            rectangle repeating the chip printed directly under
                            it, which read as a broken image rather than a card
                            waiting for one. A muted glyph says „picture goes
                            here" and says nothing twice. */}
                        <div className="relative aspect-[16/9] overflow-hidden bg-ink-50 border-b border-ink-100">
                          {imageVersion.has(s.id) ? (
                            <img
                              src={`/api/b2b-services/${s.id}/image?v=${encodeURIComponent(imageVersion.get(s.id)!)}`}
                              alt=""
                              loading="lazy"
                              className="w-full h-full object-cover motion-safe:transition-transform motion-safe:duration-slow ease-out-quart group-hover:scale-[1.03]"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              {s.kind === 'TRAINING'
                                ? <Icon.users className="w-8 h-8 text-ink-300" aria-hidden="true" />
                                : <Icon.briefcase className="w-8 h-8 text-ink-300" aria-hidden="true" />}
                            </div>
                          )}
                        </div>

                        <div className="p-5 flex flex-col flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                            {/* The AREA — the second axis, so it travels with
                                the card rather than being a heading of its own. */}
                            {!areaRestatesKind(s.kind, s.direction) && (
                              <span className="inline-flex items-center h-6 px-2 rounded-pill bg-ink-100 text-ink-700 text-micro font-display font-semibold uppercase">
                                {s.direction}
                              </span>
                            )}
                            {/* For a TRAINING the format is the deciding fact —
                                how long, how many people, where — and a company
                                rules a service in or out on it before reading
                                the sentence. Hairline border, no fill: canon. */}
                            {s.format && (
                              <span className="inline-flex items-center h-6 px-2 rounded-pill border border-ink-200 text-ink-600 text-micro font-display font-semibold uppercase">
                                {s.format}
                              </span>
                            )}
                          </div>

                          <h4 className="mt-2.5 font-display text-h3 font-bold text-ink-900 tracking-tight leading-snug">
                            {s.title}
                          </h4>
                          {/* flex-1 on the prose is what keeps the price rails
                              aligned across a row when one card has no
                              description — a ragged bottom edge is what makes a
                              price list look unfinished. */}
                          <p className="mt-1.5 text-small text-ink-600 leading-snug flex-1">
                            {s.description || ''}
                          </p>

                          <div className="mt-4 pt-4 border-t border-ink-100 flex items-center justify-between gap-3">
                            <span className="font-display text-h3 font-bold text-ink-900 tabular-nums">
                              {servicePriceLabel(s)}
                            </span>
                            {/* An anchor to the ONE form, which preselects this
                                service there. A form per card would be six forms
                                on a page with one purpose. */}
                            <a
                              href={`#form-${s.id}`}
                              className="h-10 sm:h-9 px-3.5 rounded-btn border border-ink-200 text-ink-900 hover:border-ink-900 hover:bg-ink-900 hover:text-white font-display text-small font-semibold inline-flex items-center whitespace-nowrap transition-colors duration-fast"
                            >
                              მოთხოვნა
                            </a>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── The form, with the reassurance BESIDE it ──────────────────────
            Two columns from lg: the form is the work, the rail is what a buyer
            checks while filling it in. Those three facts used to be their own
            full-width strip further up the page, where nobody was deciding
            anything — CLAUDE.md puts trust signals at the decision point. */}
        <section id="form" className="mt-16 lg:mt-24 scroll-mt-24">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-8 lg:gap-12 items-start">
            <div className="min-w-0">
              <Eyebrow className="mb-2">კონტაქტი</Eyebrow>
              <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight">მოთხოვნა</h2>
              <div className="mt-6">
                <LeadForm services={services} />
              </div>
            </div>

            {/* Sticky so it stays in view down a long form — it is a reference,
                not a step. `top-24` clears the 80px sticky header. */}
            <aside className="lg:sticky lg:top-24 rounded-card border border-ink-200 bg-ink-50/50 p-5">
              <ul className="space-y-3.5">
                {FACTS.map(f => {
                  const Glyph = Icon[f.icon]
                  return (
                    <li key={f.text} className="flex items-start gap-2.5">
                      <Glyph className={`w-4 h-4 mt-0.5 shrink-0 ${f.brand ? 'text-brand-600' : 'text-ink-500'}`} aria-hidden="true" />
                      <span className="text-small text-ink-700 leading-snug">{f.text}</span>
                    </li>
                  )
                })}
              </ul>
              {/* The other way to reach us, moved out from under the heading and
                  into the rail. It is an ALTERNATIVE to the form, so it belongs
                  beside it, not above it where it read as a preamble the form
                  then contradicted. */}
              <div className="mt-5 pt-5 border-t border-ink-200">
                <p className="text-small text-ink-600">ან მოგვწერეთ:</p>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="mt-1 block break-words font-display text-small font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800 transition-colors duration-fast"
                >
                  {SUPPORT_EMAIL}
                </a>
              </div>
            </aside>
          </div>
        </section>
      </Container>
      </main>

      <Footer />
    </div>
  )
}

// The /business landing itself. Mounted by ./page.tsx, which owns the metadata
// and the canSeeB2B gate — this file assumes it is allowed to render.
//
// WHAT THIS PAGE SELLS, and why it does not look like the rest of the site.
// Everywhere else a client picks a PERSON and books their hour. Here a company
// buys a SERVICE at a fixed price — „იურიდიული აუდიტი — 800₾" — and the owner
// decides who delivers it, off the platform. So there are no expert cards, no
// availability, no calendar: the page is a price list plus a request form.
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
import { BROWSABLE_CATEGORY } from '@/lib/categoryTree'
import { groupByDirection, servicePriceLabel } from '@/lib/b2b'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'
import { Container } from '@/components/Container'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Footer } from '@/components/Footer'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'
import { LeadForm } from './LeadForm'

export type PublicService = {
  id: string
  direction: string
  title: string
  description: string | null
  format: string | null
  priceGel: number
  priceOnRequest: boolean
  order: number
}

/* How it works. Three steps, and the middle one is the whole product: the
   company does not search, compare or interview — we do that part. Written as
   what HAPPENS, not as benefits. */
const STEPS: { icon: keyof typeof Icon; title: string; body: string }[] = [
  {
    icon: 'send',
    title: 'გვწერთ მოთხოვნას',
    body: 'აირჩევთ სერვისს ან უბრალოდ აღწერთ ამოცანას. ვალდებულებას არ იღებთ.',
  },
  {
    icon: 'users',
    title: 'ექსპერტს ვარჩევთ ჩვენ',
    body: 'თქვენ არავის ეძებთ და არ ადარებთ — ამოცანას შესაბამის ექსპერტს გადავცემთ.',
  },
  {
    icon: 'doc',
    title: 'ვთანხმდებით და ვიწყებთ',
    body: 'ვადასა და თანხაზე წინასწარ ვთანხმდებით. ანგარიშსწორება ინვოისით.',
  },
]

export async function BusinessLanding() {
  await ensureDbReady().catch(() => {})

  // Everything the page needs, in one round-trip. Each arm has its own fallback
  // because a DB failure must not take the whole page: a company that cannot
  // see the price list can still write to us, which beats a 500.
  const [services, expertCount, sphereCount] = await Promise.all([
    prisma.b2BService.findMany({
      where: { visible: true },
      orderBy: [{ direction: 'asc' }, { order: 'asc' }],
      select: {
        id: true, direction: true, title: true, description: true, format: true,
        priceGel: true, priceOnRequest: true, order: true,
      },
      take: 200,
    }).catch(() => [] as PublicService[]),
    // ⚠️ COUNTED, NEVER WRITTEN DOWN. A hardcoded „30+ ექსპერტი" is a claim
    // that rots silently; this one is either true or absent. The filter mirrors
    // the public visibility rule so the number matches what /tutors would show
    // — quoting a figure the catalogue contradicts is worse than no figure.
    prisma.tutorProfile.count({
      where: { available: true, verified: true, user: { is: { suspendedAt: null } } },
    }).catch(() => 0),
    prisma.category.count({ where: BROWSABLE_CATEGORY }).catch(() => 0),
  ])
  const grouped = groupByDirection(services)

  return (
    <div className="min-h-screen bg-white">
      <MarketingTopBar />

      <Container as="main" className="py-16 lg:py-24">
        {/* ── Hero ── */}
        <div className="max-w-[720px]">
          <Eyebrow className="mb-3">ბიზნესისთვის</Eyebrow>
          <h1 className="font-display text-display lg:text-display-xl font-bold text-ink-900 tracking-tight leading-[1.05]">
            სერვისები კომპანიებისთვის
          </h1>
          <p className="mt-6 text-body-lg text-ink-600">
            აღწერეთ ამოცანა — ექსპერტს ჩვენ შევარჩევთ. ფასი და ვადა წინასწარ ცნობილია.
          </p>

          {/* The one honest number, and only when there IS one. Below three
              verified experts it says nothing at all: „2 ექსპერტი" undersells a
              real catalogue and reads as a site that has not started. */}
          {expertCount >= 3 && (
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-small text-ink-600">
              <span className="inline-flex items-center gap-1.5">
                <Icon.shieldCheck className="w-4 h-4 text-brand-600" aria-hidden="true" />
                {expertCount} დადასტურებული ექსპერტი
              </span>
              {sphereCount >= 3 && (
                <span className="inline-flex items-center gap-1.5">
                  <Icon.grid className="w-4 h-4 text-ink-400" aria-hidden="true" />
                  {sphereCount} მიმართულება
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Icon.doc className="w-4 h-4 text-ink-400" aria-hidden="true" />
                ანგარიშსწორება ინვოისით
              </span>
            </div>
          )}
        </div>

        {/* ── How it works ── */}
        <section className="mt-16 lg:mt-24">
          <Eyebrow tone="muted" className="mb-2">პროცესი</Eyebrow>
          <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight">როგორ მუშაობს</h2>
          <div className="mt-7 grid sm:grid-cols-3 gap-6 lg:gap-8">
            {STEPS.map((s, i) => {
              const Glyph = Icon[s.icon]
              return (
                <div key={s.title}>
                  <div className="flex items-center gap-2.5">
                    {/* The step number carries the sequence; the glyph carries
                        recognition. No arrows between them — canon bans
                        decorative arrows, and a 3-up grid already reads L→R. */}
                    <span className="w-7 h-7 shrink-0 rounded-pill bg-ink-900 text-white inline-flex items-center justify-center font-display text-micro font-bold tabular-nums">
                      {i + 1}
                    </span>
                    <Glyph className="w-4 h-4 text-ink-400" aria-hidden="true" />
                  </div>
                  <h3 className="mt-3 font-display text-h3 font-bold text-ink-900 tracking-tight">{s.title}</h3>
                  <p className="mt-1.5 text-body text-ink-600">{s.body}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── The catalogue ── */}
        {grouped.length > 0 && (
          <section className="mt-16 lg:mt-24">
            <Eyebrow tone="muted" className="mb-2">სერვისები</Eyebrow>
            <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight">მიმართულებები და ფასები</h2>
            <p className="mt-2 text-body text-ink-600 max-w-[680px]">
              ფასი მოცემულია ერთ სერვისზე. თუ ამოცანა უფრო დიდია, მოგვწერეთ და ცალკე შევათანხმებთ.
            </p>

            <div className="mt-8 space-y-10">
              {grouped.map(([direction, list]) => (
                <div key={direction}>
                  <h3 className="font-display text-h3 font-bold text-ink-900 tracking-tight">{direction}</h3>
                  {/* `items-stretch` + `flex-col` inside: cards in a row end at
                      the same baseline even when one has no description. A
                      ragged bottom edge is what makes a price list look
                      unfinished. */}
                  <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
                    {list.map(s => (
                      <div
                        key={s.id}
                        className="rounded-card border border-ink-200 bg-white p-5 flex flex-col hover:border-ink-300 transition-colors duration-fast"
                      >
                        <h4 className="font-display text-body-lg font-bold text-ink-900 tracking-tight">{s.title}</h4>
                        {/* Format on its own line, above the prose. For a
                            TRAINING this is the deciding fact — how long, how
                            many people, where — and a company scanning a
                            direction rules services in or out on it. Buried in
                            a sentence they would have to read for it.
                            Hairline border, no fill: canon for a badge. */}
                        {s.format && (
                          <div className="mt-2 inline-flex items-center h-6 px-2 rounded-pill border border-ink-200 text-ink-600 text-micro font-display font-semibold uppercase">
                            {s.format}
                          </div>
                        )}
                        <p className="mt-2 text-small text-ink-600 flex-1">
                          {s.description || ' '}
                        </p>
                        <div className="mt-4 pt-4 border-t border-ink-100 flex items-center justify-between gap-3">
                          <span className="font-display text-body-lg font-bold text-ink-900 tabular-nums">
                            {servicePriceLabel(s)}
                          </span>
                          {/* An anchor to the ONE form, which preselects this
                              service there. A form per card would be four forms
                              on a page with one purpose. */}
                          <a
                            href={`#form-${s.id}`}
                            className="h-9 px-3.5 rounded-btn bg-ink-900 text-white hover:bg-ink-800 font-display text-small font-semibold inline-flex items-center transition-colors duration-fast"
                          >
                            მოთხოვნა
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── What a company actually gets. Three facts, each verifiable. ── */}
        <section className="mt-16 lg:mt-24 rounded-card border border-ink-200 bg-ink-50/50 p-6 sm:p-8">
          <div className="grid sm:grid-cols-3 gap-6 lg:gap-10">
            <div>
              <Icon.shieldCheck className="w-5 h-5 text-brand-600" aria-hidden="true" />
              <h3 className="mt-2.5 font-display text-body-lg font-bold text-ink-900 tracking-tight">
                ექსპერტები შემოწმებულია
              </h3>
              <p className="mt-1 text-small text-ink-600">
                პლატფორმაზე ექსპერტი განაცხადისა და დოკუმენტების შემოწმების შემდეგ ხვდება.
              </p>
            </div>
            <div>
              <Icon.doc className="w-5 h-5 text-ink-500" aria-hidden="true" />
              <h3 className="mt-2.5 font-display text-body-lg font-bold text-ink-900 tracking-tight">
                ანგარიშსწორება ინვოისით
              </h3>
              <p className="mt-1 text-small text-ink-600">
                იურიდიულ პირზე ინვოისს ვუგზავნით. საიტზე გადახდა საჭირო არ არის.
              </p>
            </div>
            <div>
              <Icon.check className="w-5 h-5 text-ink-500" aria-hidden="true" />
              <h3 className="mt-2.5 font-display text-body-lg font-bold text-ink-900 tracking-tight">
                ფასი წინასწარ
              </h3>
              <p className="mt-1 text-small text-ink-600">
                თანხასა და ვადაზე მუშაობის დაწყებამდე ვთანხმდებით.
              </p>
            </div>
          </div>
        </section>

        {/* ── The form ── */}
        <section id="form" className="mt-16 lg:mt-24 scroll-mt-24">
          <div className="max-w-[680px]">
            <Eyebrow tone="muted" className="mb-1">მოთხოვნა</Eyebrow>
            <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight">
              დაგვიტოვეთ კონტაქტი
            </h2>
            <p className="mt-2 text-body text-ink-600">
              შეავსეთ ფორმა და დაგიკავშირდებით. თუ გირჩევნიათ —{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-700 font-semibold underline underline-offset-2 hover:text-brand-800 transition-colors duration-fast">
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          </div>
          <div className="mt-6 max-w-[680px]">
            <LeadForm services={services} />
          </div>
        </section>
      </Container>

      <Footer />
    </div>
  )
}

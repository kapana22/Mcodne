// The /business landing itself. Mounted by ./page.tsx, which owns the metadata
// and the canSeeB2B gate — this file assumes it is allowed to render.
//
// WHAT THIS PAGE SELLS, and why it does not look like the rest of the site.
// Everywhere else a client picks a PERSON and books their hour. Here a company
// buys a SERVICE at a fixed price — „იურიდიული აუდიტი — 800₾" — and the owner
// decides who delivers it, off the platform. So there are no expert cards, no
// availability, no calendar: the page is a price list, and the only action on
// it is „send us a request".
//
// AUDIENCE: somebody buying on behalf of a company — an owner, an HR or finance
// lead. That decides the shape: prices are visible without asking, the
// directions are headings you can scan, and there is one form.
//
// ⚠️ THE COPY IS PLACEHOLDER AND THE OWNER REPLACES IT (CLAUDE.md: „Copy is the
// owner's, and it is PLAIN."). The SERVICES are not copy — they are rows the
// owner writes in ადმინი → კომპანიები → სერვისები, so nothing here hardcodes a
// price or a direction.

import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { groupByDirection, servicePriceLabel } from '@/lib/b2b'
import { Container } from '@/components/Container'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Footer } from '@/components/Footer'
import { Eyebrow } from '@/components/Eyebrow'
import { LeadForm } from './LeadForm'

export type PublicService = {
  id: string
  direction: string
  title: string
  description: string | null
  priceGel: number
  priceOnRequest: boolean
  order: number
}

export async function BusinessLanding() {
  await ensureDbReady().catch(() => {})

  // The catalogue. Wrapped because a DB failure must not take the whole page:
  // the enquiry form below still works, and a company that cannot see the price
  // list can still write to us — which is better than a 500.
  let services: PublicService[] = []
  try {
    services = await prisma.b2BService.findMany({
      where: { visible: true },
      orderBy: [{ direction: 'asc' }, { order: 'asc' }],
      select: {
        id: true, direction: true, title: true, description: true,
        priceGel: true, priceOnRequest: true, order: true,
      },
      take: 200,
    })
  } catch {
    services = []
  }
  const grouped = groupByDirection(services)

  return (
    <div className="min-h-screen bg-white">
      <MarketingTopBar />

      <Container as="main" className="py-16 lg:py-24">
        <div className="max-w-[680px]">
          <Eyebrow className="mb-3">ბიზნესისთვის</Eyebrow>
          <h1 className="font-display text-display lg:text-display-xl font-bold text-ink-900 tracking-tight leading-[1.05]">
            სერვისები კომპანიებისთვის
          </h1>
          <p className="mt-6 text-body-lg text-ink-600">
            აირჩიეთ მიმართულება, დაგვიტოვეთ მოთხოვნა — ექსპერტს ჩვენ შევარჩევთ.
          </p>
        </div>

        {/* The catalogue. Empty until the owner adds a service, and an empty
            price list says nothing rather than pretending: the form below is
            still the way in. */}
        {grouped.length > 0 && (
          <div className="mt-14 lg:mt-20 space-y-12">
            {grouped.map(([direction, list]) => (
              <section key={direction}>
                <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight">{direction}</h2>
                <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {list.map(s => (
                    <div key={s.id} className="rounded-card border border-ink-200 bg-white p-5 flex flex-col">
                      <h3 className="font-display text-h3 font-bold text-ink-900 tracking-tight">{s.title}</h3>
                      {s.description && (
                        <p className="mt-1.5 text-small text-ink-600 flex-1">{s.description}</p>
                      )}
                      <div className="mt-4 pt-4 border-t border-ink-100 flex items-center justify-between gap-3">
                        <span className="font-display text-body-lg font-bold text-ink-900 tabular-nums">
                          {servicePriceLabel(s)}
                        </span>
                        {/* An anchor, not a button: it jumps to the ONE form and
                            preselects this service there. A second form per card
                            would be four forms on a page with one purpose. */}
                        <a
                          href={`#form-${s.id}`}
                          className="h-9 px-3.5 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 hover:border-ink-300 text-ink-800 font-display text-small font-semibold inline-flex items-center transition-colors duration-fast"
                        >
                          მოთხოვნა
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <section id="form" className="mt-16 lg:mt-24 scroll-mt-24">
          <div className="max-w-[680px]">
            <Eyebrow tone="muted" className="mb-1">მოთხოვნა</Eyebrow>
            <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight">
              დაგვიტოვეთ კონტაქტი
            </h2>
            <p className="mt-2 text-body text-ink-600">
              შეავსეთ ფორმა და დაგიკავშირდებით.
            </p>
          </div>
          <div className="mt-6 max-w-[680px]">
            {/* The catalogue is passed in so the form can name the chosen
                service — the page has already paid for that query. */}
            <LeadForm services={services} />
          </div>
        </section>
      </Container>

      <Footer />
    </div>
  )
}

// /services — the trades vertical's public face.
//
// ⚠️ IT PROMISES A REQUEST, NOT A DIRECTORY, and the copy has to keep that
// promise. There is no browsable list of masters behind this page: `ServiceProfile`
// has no slug, no public-visibility flag and no reviews, so a page that said
// „browse plumbers" would be the „empty room with a URL" lib/requestTopics
// refuses in writing. What this page can honestly say is what the intake can
// actually do — describe the job, up to three offers, free, we phone first.
//
// ⚠️ THE EIGHT GROUPS ARE DERIVED, NEVER LISTED HERE. `SERVICE_GROUPS` filters
// TOPIC_GROUPS on `kinds: SERVICE` (lib/serviceProfile), so a trade added to the
// vocabulary appears on this page the same day. A hand-written copy would go
// stale silently — the only symptom is a service nobody can find.
//
// ⚠️ IT SURVIVES THE FEATURE FLAG BEING OFF. FEATURE_REQUESTS is a kill switch
// flipped from a dashboard at three in the morning (lib/requests), and this URL
// is in the sitemap. A submitted URL that 404s teaches the crawler to distrust
// the file; a page whose CTA is simply absent is honest. So the page renders
// either way and only the buttons are gated.

import Link from 'next/link'
import { pageMetadata } from '@/lib/pageSeo'
import { requestsOn } from '@/lib/requests'
import { SERVICE_GROUPS } from '@/lib/serviceProfile'
import { PublicTopBar } from '@/components/PublicTopBar'
import { Footer } from '@/components/Footer'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { Card } from '@/components/Card'
import { Btn } from '@/components/Btn'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export const generateMetadata = () => pageMetadata('services', '/services')

export default async function Page() {
  const user = await getCurrentUser()
  // The same four fields every other public page hands the bar — see
  // app/tutors/page.tsx. Passing the whole row would put a password hash in the
  // client payload.
  const initialUser = user
    ? { id: user.id, fullName: user.fullName, avatarUrl: user.avatarUrl, role: user.role }
    : null
  const on = requestsOn()

  return (
    <>
      <PublicTopBar initialUser={initialUser} />

      <main>
        <Container className="py-10 sm:py-14">
          <Eyebrow>სერვისები</Eyebrow>
          <h1 className="mt-2 font-display text-display font-bold text-ink-900 tracking-tight text-balance">
            ხელოსანი სახლში
          </h1>
          {/* What actually happens, in the order it happens. No adjectives:
              every clause here is something the code does. */}
          <p className="mt-3 text-body-lg text-ink-600 max-w-[52ch]">
            აღწერე რა გჭირდება — გადავამოწმებთ, ხელოსნებს გადავცემთ და ფასს
            შემოგთავაზებენ. უფასოა, და ნომერს მხოლოდ იმას ვაძლევთ, ვისაც შენ აირჩევ.
          </p>
          {on && (
            <div className="mt-6">
              <Btn href="/request" size="lg">აღწერე, რა გჭირდება</Btn>
            </div>
          )}
        </Container>

        <Container className="pb-14 sm:pb-20">
          <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight">
            რაში გვეხმარებიან
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICE_GROUPS.map(g => (
              <Card key={g.id}>
                <h3 className="font-display text-h3 font-bold text-ink-900">{g.label}</h3>
                {/* The topics themselves, not a count. „6 სერვისი" tells nobody
                    whether their job is in there; „ბოილერი" does. */}
                <p className="mt-2 text-small text-ink-600 leading-relaxed">
                  {g.topics.map(t => t.label).join(' · ')}
                </p>
                {on && (
                  <div className="mt-4">
                    {/* ⚠️ `?q=` AND NOT A TOPIC ID. The wizard deliberately
                        refuses to pick a topic from a query string — free text
                        is the person's words, and choosing for them is what the
                        search screen exists to avoid. Seeding the search with
                        the group's name puts its topics on screen and leaves the
                        choice where it belongs. */}
                    <Link
                      href={`/request?q=${encodeURIComponent(g.label)}`}
                      className="text-small font-display font-semibold text-brand-700 underline underline-offset-2"
                    >
                      მოთხოვნის გაგზავნა
                    </Link>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </Container>
      </main>

      <Footer />
    </>
  )
}

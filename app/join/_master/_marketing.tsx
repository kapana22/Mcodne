// The signed-out face of /join?can=WORK — crawlable, and honest about what it is.
//
// ⚠️ IT SELLS A QUEUE, NOT AN INCOME. We have no traffic yet, so any sentence
// shaped like „earn X a month" would be a number we invented. What is true and
// worth saying: describing a job takes a client two minutes, we hand it to the
// masters who cover that trade in that city, registration is free, and today
// there is no fee for the lead. All four are facts, and the last one has a date
// on it precisely so it cannot quietly become a promise.

import Link from 'next/link'
import { PublicTopBar } from '@/components/PublicTopBar'
import { Footer } from '@/components/Footer'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { Card } from '@/components/Card'
import { Btn } from '@/components/Btn'
import { LIVE_SERVICE_GROUPS } from '@/lib/serviceProfile'

const STEPS = [
  { t: 'შეავსე განაცხადი', d: 'რას აკეთებ, რომელ ქალაქში და როგორ დაგიკავშირდნენ. ხუთი წუთი.' },
  { t: 'გადავამოწმებთ', d: 'დაგირეკავთ და ვისაუბრებთ. დამტკიცების შემდეგ სისტემაში ხარ.' },
  { t: 'მოთხოვნები მოგდის', d: 'მხოლოდ შენი მიმართულების და შენი ქალაქის. სხვას ვერ ნახავ.' },
  { t: 'შენ წერ ფასს', d: 'პირდაპირ კლიენტს. სხვები შენს შეთავაზებას ვერ ხედავენ.' },
]

export function MasterApplyMarketing() {
  // ⚠️ THE CTAs GO TO SIGNUP, NOT BACK HERE. A guest tapping „განაცხადის
  // შევსება" on a page that renders THIS component for guests would simply
  // redraw the same page — the pitch as its own dead end. `?redirect` carries
  // them back after the account exists, and /signin reads „/join?can=WORK" as
  // the ხელოსანი branch (see _signup → masterIntent), so the role is already
  // chosen for them.
  const signup = '/signup?redirect=%2Fjoin%3Fcan%3DWORK'
  const signin = '/signin?redirect=%2Fjoin%3Fcan%3DWORK'
  return (
    <>
      <PublicTopBar />
      <main>
        <Container className="pt-10 sm:pt-14 pb-8">
          <Eyebrow>სერვისებისთვის</Eyebrow>
          <h1 className="mt-2 font-display text-h1 sm:text-display font-bold text-ink-900 tracking-tight max-w-[18ch]">
            დაარეგისტრირე შენი სერვისი
          </h1>
          <p className="mt-3 text-body-lg text-ink-600 max-w-[54ch]">
            კლიენტი წერს, რა გაფუჭდა და სად. ჩვენ ვამოწმებთ და გადმოგცემთ.
            შენ ფასს თვითონ წერ. რეგისტრაცია უფასოა.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Btn href={signup} size="lg">განაცხადის შევსება</Btn>
            <Btn href="/#how" variant="secondary" size="lg">როგორ მუშაობს</Btn>
          </div>
          {/* ⚠️ A DATE, NOT A FOREVER. „უფასოა" without one becomes a promise
              the business model contradicts the day a lead gets a price. */}
          <p className="mt-4 text-meta text-ink-500">
            ამ ეტაპზე ლიდში საკომისიო არ არის.
          </p>
        </Container>

        <Container className="pb-14 sm:pb-20">
          <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight">როგორ მიდის</h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.t}>
                <Card className="h-full">
                  {/* Numbered because it IS a sequence — nothing here happens
                      out of order, which is the only thing that earns a numeral. */}
                  <span className="text-micro uppercase text-brand-700 tabular-nums">{i + 1}</span>
                  <h3 className="mt-1 font-display text-h3 font-bold text-ink-900">{s.t}</h3>
                  <p className="mt-2 text-small text-ink-600 leading-relaxed">{s.d}</p>
                </Card>
              </li>
            ))}
          </ol>
        </Container>

        <Container className="pb-14 sm:pb-20">
          <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight">ვის ვეძებთ</h2>
          <p className="mt-2 text-body text-ink-600 max-w-[54ch]">
            ამ ეტაპზე ოთხი მიმართულება გვაქვს გახსნილი. დანარჩენს თანდათან დავამატებთ.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {LIVE_SERVICE_GROUPS.map(g => (
              <Card key={g.id}>
                <h3 className="font-display text-h3 font-bold text-ink-900">{g.label}</h3>
                <p className="mt-2 text-small text-ink-600 leading-relaxed">
                  {g.topics.map(t => t.label).join(' · ')}
                </p>
              </Card>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Btn href={signup} size="lg">განაცხადის შევსება</Btn>
            <Link href={signin} className="text-small font-display font-semibold text-brand-700 underline underline-offset-2">
              უკვე გაქვს ანგარიში?
            </Link>
          </div>
          <p className="mt-4 text-meta text-ink-500">
            ექსპერტი ხარ და კონსულტაციას ატარებ?{' '}
            <Link href="/join" className="font-display font-semibold text-brand-700 underline underline-offset-2">
              ეს სხვა ფორმაა
            </Link>
          </p>
        </Container>
      </main>
      <Footer />
    </>
  )
}

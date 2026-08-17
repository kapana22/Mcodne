'use client'
// Home — the SECOND way in: describe the job, get offers.
//
// ⚠️ WHY THIS BAND EXISTS, AND WHY IT IS A BAND RATHER THAN A THIRD LINK IN THE
// HERO (2026-08-17). The site had one shape of answer to „what do you need":
// search the catalogue and pick somebody. That is the right shape when supply
// is deep and the buyer knows what they want. It is the wrong shape when the
// job needs scoping („ხელშეკრულება", „რემონტის დაგეგმვა") or when the buyer
// cannot name the person they need — and it is the ONLY shape the site offered.
//
// Bark and Angi are the reference (owner, 2026-08-17). What they actually do —
// and Angi is the closer model — is run BOTH at once: a browsable rated
// catalogue AND a describe-it-and-get-quotes path, on one page. Owner: „რადგან
// ახლები არ გვაქვს, ლოკალურადაც გვინდა რომ ეს ყველაფერი იყოს ხილული და
// პარალელურად ეს რექვესთიც იყოს." With 26 experts spread over ten spheres,
// running only one of the two starves whichever half of the demand it does not
// fit.
//
// ⚠️ NOT IN THE HERO. The hero's search already carries one clear primary and
// one clear secondary action, and its own note says why a third link buried in
// a sentence was removed. Adding a competing button there would undo a fix
// somebody already made. A band directly beneath it is the first thing after
// the hero, which is the same prominence without the collision.
//
// ⚠️ AND IT SELLS THE THINGS BARK CANNOT. The known failure of this model is
// lead resale — the same job sold to ten pros, which is what fills Bark's and
// Angi's professional-side reviews with complaints. This platform caps offers
// at three and phones every request before anybody sees it. Those two facts ARE
// the differentiator, so they are on the band rather than buried in a FAQ. Both
// are true and enforced in code (lib/requests → offerLimit, and the admin's
// verify step), which is the only reason they may be printed here.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/Card'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'
import { Reveal } from '@/components/Reveal'

/** What the three promises are, in the order they answer the reader's
 *  questions: what do I get, what does it cost me, who sees it. */
const POINTS = [
  { label: 'მაქსიმუმ 3 შეთავაზება', hint: 'ერთი მოთხოვნა ათს არ ეგზავნება.' },
  { label: 'უფასოა', hint: 'გადაწყვეტილებამდე არაფერს იხდი.' },
  { label: 'ჯერ დაგირეკავთ', hint: 'ექსპერტები მხოლოდ ამის შემდეგ ხედავენ.' },
]

export function RequestBand() {
  const router = useRouter()
  const [q, setQ] = useState('')

  return (
    <section className="bg-ink-50/40 border-y border-ink-100">
      <Container className="py-10 sm:py-12 lg:py-14">
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-8 lg:gap-12 items-center">
          <Reveal>
            <Eyebrow className="mb-3">მოთხოვნა</Eyebrow>
            <h2 className="font-display text-h2 sm:text-display font-bold text-ink-900 tracking-[-0.02em] leading-[1.08]">
              არ იცი ვინ გჭირდება? აღწერე.
            </h2>
            <p className="mt-3 text-body-lg text-ink-700 max-w-[520px] leading-[1.6]">
              ექსპერტები თავად შემოგთავაზებენ ფასს და ვადას.
            </p>

            {/* The Bark-shaped entry: one field, one button. It hands the typed
                words to the wizard as `?q=` so the first screen opens already
                searching — retyping what you just typed is the cheapest way to
                lose somebody one step in. */}
            {/* `Card as="form"` rather than a hand-rolled shell: the three
                classes that make a card (rounded-card + border-ink-200 +
                bg-white) live in the primitive, and tests/primitiveAdoption
                ratchets the number of places that spell them out by hand
                downwards. It caught this one on the way in. */}
            <Card
              as="form"
              padding="none"
              onSubmit={(e: React.FormEvent) => {
                e.preventDefault()
                router.push(q.trim() ? `/request?q=${encodeURIComponent(q.trim())}` : '/request')
              }}
              className="mt-6 max-w-[520px] shadow-card p-2 flex flex-col sm:flex-row gap-2 focus-within:border-brand-400 focus-within:shadow-brand-glow transition-[box-shadow,border-color] duration-mid"
            >
              <div className="relative flex-1">
                <Icon.search aria-hidden className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input
                  type="text"
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  aria-label="რა გჭირდება"
                  placeholder="მაგ. ხელშეკრულება, რემონტი, ლოგო"
                  className="w-full h-12 pl-11 pr-3 bg-transparent text-body-lg text-ink-900 placeholder:text-ink-400 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="h-12 px-6 rounded-btn bg-gradient-cta hover:brightness-105 text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center justify-center shadow-brand-glow transition-all duration-fast"
              >
                შეთავაზებების მიღება
              </button>
            </Card>
          </Reveal>

          <Reveal>
            <ul className="space-y-3">
              {POINTS.map(p => (
                <li key={p.label} className="flex items-start gap-3">
                  {/* The check is the mark, not a decoration: it is what says
                      „this is a promise", and the canon's ban is on decorative
                      glyphs, not on the one carrying the meaning. */}
                  <span
                    aria-hidden
                    className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-brand-600 text-white inline-flex items-center justify-center text-micro font-bold"
                  >
                    ✓
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-body font-semibold text-ink-900">{p.label}</span>
                    <span className="block text-small text-ink-600 mt-0.5">{p.hint}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </Container>
    </section>
  )
}

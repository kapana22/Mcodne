/**
 * /join FOR A GUEST — the pitch AND the question, in that order, on one page.
 *
 * ⚠️ WHAT THIS REPLACED (2026-08-20). A signed-out visitor used to get a pure
 * marketing page whose only action was „create an account". The door's one
 * question — the profession, from which everything about a provider is derived
 * — sat on the far side of that wall. See `GuestDoor` for why the order was
 * inverted; this file is the page that inversion needed.
 *
 * ⚠️ AND IT IS THE ONLY PITCH NOW (2026-08-24). There were two beside it, each
 * speaking to one half — `_expert/ApplyMarketing` („გახდი ექსპერტი",
 * `?can=CONSULT`) and `_provider/_marketing` („დაარეგისტრირე შენი სერვისი",
 * `?can=WORK`) — because a provider could sell either of two things and a page
 * that named one lost the other. Both are gone with the split: `?can=` is
 * ignored, so those addresses rendered THIS page anyway, and the sitemap has
 * stopped submitting `/join?can=WORK` as a second entry rather than advertising
 * a duplicate of an address it already lists.
 *
 * What the bare door was FOR survives unchanged and is now simply the whole
 * design: it names no half, the applicant names their job, and the site works
 * out the rest.
 *
 * The four supporting sections live in `../_sections` — one source, so the door
 * and the signed-in form cannot answer the same question two ways.
 */

import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Container } from '@/components/Container'
import { Btn } from '@/components/Btn'
import { Illustration } from '@/components/Illustration'
import { Footer } from '@/components/Footer'
import { jsonLdString } from '@/lib/jsonLd'
import { getSiteTextMap } from '@/lib/siteText'
import { SITE_TEXT_DEFAULTS } from '@/lib/siteTextDefs'
import { JOIN_DOOR_LABEL } from '@/lib/capabilities'
import { PitchFaqLd, PitchSections } from '../_sections'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

export async function PublicDoor() {
  const map = await getSiteTextMap()
  const t = (k: string) => map[k] ?? SITE_TEXT_DEFAULTS[k] ?? ''

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'მთავარი', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: JOIN_DOOR_LABEL },
    ],
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <PitchFaqLd />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbLd) }} />
      <MarketingTopBar />

      {/* `content` (820px), not `wide` — the same measure as the two pitches.
          Cap the container OR the content, never both (see app/help). */}
      <Container as="main" size="content" className="py-12 lg:py-16">
        {/* ⚠️ THE QUESTION IS NOT ASKED HERE ANY MORE (2026-08-31). Owner, looking
            at this screen: „ეს გვერდი არ უნდა ყოფილიყო… დასაწყისში უაზროდ ყრია
            სიტყვები."

            WHAT THIS SCREEN WAS. An eyebrow, an h1, a sentence, a second bolded
            question, the profession picker, and a note — six stacked blocks
            before the visitor could do anything, and the question among them was
            the SAME one the form asks on the other side of sign-up. Measured
            before removing it: the guest's answer is never submitted anywhere —
            the application body carries no `professions` — and its only effect
            downstream was to pre-fill the search box in the form's first stage.
            So a person answered, pressed „გაგრძელება", made an account, and
            arrived at a form that appeared to ask the same thing again with
            their word typed in. That is what the owner saw twice.

            ⚠️ AND IT UNDOES A REAL ARGUMENT, ON PURPOSE. `GuestDoor` was written
            on 2026-08-20 to invert the wall — answer first, register second —
            citing Baymard on forced registration. The reasoning was sound and
            the implementation did not deliver it: nothing about the answer
            survived except a search string, so the visitor paid a screen and got
            a pre-filled box. /join is ONE page on both sides of the wall now
            (app/join/JoinClient), and the question is asked once, in the form,
            where the answer is actually stored.

            ⚠️ `GuestDoor` IS DELETED (2026-09-02), and the sentence that used to
            stand here was wrong on both halves. It said the two files were
            „untouched on disk — nothing renders them": `DoorQuestion` is in
            fact imported by app/join/JoinClient, so only ONE of them was dead —
            and CLAUDE.md's rule for that one is explicit („a control that lies
            gets deleted rather than left switched off"). The ARGUMENT is what
            was worth keeping and it is kept, here, in full: answer first and
            register second is a good idea that this implementation did not
            deliver, because nothing of the answer survived the wall except a
            search string. Rebuilding it needs the answer to carry, which is a
            different piece of code from the one that was sitting here. */}
        {/* ⚠️ THE DRAWING IS `lg:flex-row-reverse`, WHICH IS WHY IT IS FIRST IN
            THE MARKUP. On a phone it sits above the headline; from `lg` the row
            reverses and it sits to the RIGHT of the words, where it does not
            push the h1 down a screen. Reversing beats an `order` on the text
            because the DOM keeps its reading order either way: heading, then
            sentence, then button — the drawing is decorative and `alt=""`, so
            a screen reader never meets it at all.

            It is the icon the owner's standard assigns to this screen
            (MCDONE_3D_ICON_STYLE_GUIDE, 2026-09-03: „პროფილის ბარათი +
            ხარისხის ბეჯი … იდეალურად ასახავს „დაარეგისტრირე სერვისი"), and it
            is the ONLY one on the page — the pitch sections below stay text. */}
        <div className="flex flex-col items-start gap-6 lg:flex-row-reverse lg:items-center lg:justify-between lg:gap-10">
          <Illustration name="joinProvider" alt="" className="shrink-0" />

          <div className="max-w-[720px]">
            <h1 className="font-display text-display lg:text-display font-bold text-ink-900 tracking-tight leading-[1.05]">
              {JOIN_DOOR_LABEL}
            </h1>
            <p className="mt-5 text-h3 text-ink-600 leading-relaxed">
              {t('join.hero.body')}
            </p>

            {/* The one action, and it is honest about the order: you need an
                account to sell here, so that is what the button says it does.
                `redirect` brings them straight back to the form. */}
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Btn href="/signup?redirect=%2Fjoin" size="lg">{JOIN_DOOR_LABEL}</Btn>
              <p className="text-meta text-ink-500">{t('join.hero.note')}</p>
            </div>
          </div>
        </div>

        <PitchSections />
      </Container>

      <Footer />
    </div>
  )
}

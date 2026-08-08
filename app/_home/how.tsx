'use client'
// Home — „როგორ მუშაობს“: the page's one dark band, three steps.

import Link from 'next/link'
import { SiteText } from '@/components/SiteTextProvider'
import { PAYMENTS_LIVE } from '@/lib/flags'
import { Reveal } from '@/components/Reveal'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { Illustration, hasIllustration, type IllustrationName } from '@/components/Illustration'

/* ───── How it works (+ the „why" row, merged in 2026-07-27) ─────
   This used to be TWO full-height sections. „რატომ მცოდნე" restated, one
   section later, exactly what the hero's three quality anchors and step 03
   already said: hand-picked / transparent price / video session, plus a second
   copy of the payments note verbatim. Read end to end the page said the same
   three things three times and then asked you to become an expert.
   The four „why" cells first became a compact strip at the FOOT of this section
   — the detail under the steps rather than a competing heading — and were then
   removed outright 2026-08-08 (owner). The section is now the three steps and
   nothing else; see the note where the strip used to be for why its SiteText
   keys stay in the registry. */
/**
 * Do the three step drawings exist yet — ALL of them?
 *
 * All three or none, deliberately: two illustrated steps and one bare one reads
 * as a loading failure, not as a design. Module scope because the registry is a
 * build-time constant; nothing here changes at runtime.
 *
 * ⚠️ These are the ON-DARK variants. This band is `bg-ink-900` (#0F0E0A) and the
 * light-ground drawings were verified by screenshot to be nearly invisible on
 * it — thin dark-teal strokes on near-black. Do not point these at the light
 * files; they need their own art (see components/Illustration).
 */
const stepArt =
  hasIllustration('expertSearchOnDark') &&
  hasIllustration('bookingsOnDark') &&
  hasIllustration('videoSessionOnDark')

export const HowItWorks = () => (
  /* THE PAGE'S ONE DARK BAND (2026-07-31).
     Everything above and below this is white or a warm off-white — hero, cards,
     questions, the „why" strip. Read end to end the page was one uninterrupted
     sheet, which is the real reason it felt flat: no contrast, no chapters, no
     place for the eye to rest. Motion cannot fix a static picture.
     One full-bleed dark section, in the middle, does three things at once: it
     splits the page into a before and an after, it lets the brand green finally
     read as a colour instead of an accent on white, and it costs no data. */
  <section id="how" className="relative overflow-hidden bg-ink-900 deep grain grain-dark text-white scroll-mt-24">
    {/* z-10: `.grain` paints through ::after ON TOP of the section, so anything
        that must stay crisp — all of it — has to sit above that layer. */}
    <Container className="relative z-10 py-10 sm:py-12 lg:py-16">
      <div className="grid lg:grid-cols-[1fr_1.6fr] gap-10 lg:gap-12 items-start">
        <Reveal>
          {/* brand-400, not the default brand-700: on ink-900 the dark green
              measures 2.84:1 — a label nobody can read. The light step is
              7.56:1 and is the same hue. Any Eyebrow that lands on the dark
              band needs this. */}
          <Eyebrow className="mb-3 !text-brand-400"><SiteText k="home.how.eyebrow" /></Eyebrow>
          {/* `whitespace-pre-line` replaces the hardcoded <br>: the line break
              is now whatever the admin types in the textarea, and the default
              carries the exact same two lines it always had. */}
          <h2 className="font-display text-h2 sm:text-display font-bold text-white tracking-[-0.02em] leading-[1.08] whitespace-pre-line">
            <SiteText k="home.how.title" />
          </h2>
          <p className="text-body-lg text-white/70 mt-5 max-w-[400px] leading-relaxed"><SiteText k="home.how.subtitle" /></p>
          {/* The CTA now points at the primary path. „დაწყება" → /signup asked a
              first-time visitor to open an account before they had seen a single
              expert, and it was the one place on the page where the secondary
              path outranked „find an expert". Signing up still happens — it is
              the first thing the booking flow asks for, in context. */}
          <Link href="/tutors" className="mt-7 h-12 px-6 rounded-btn bg-white hover:bg-white/90 text-ink-900 font-display font-semibold text-small tracking-wide inline-flex items-center gap-2 transition-colors duration-fast">
            <SiteText k="home.how.cta" />
          </Link>
        </Reveal>
        <Reveal stagger className="space-y-3">
          {([
            { n: '01', t: 'აირჩიე ექსპერტი', d: 'გადახედე პროფილებს, შეფასებებს და ვიდეოგაცნობას.', tk: 'home.how.step1.title', dk: 'home.how.step1.desc', art: 'expertSearchOnDark' },
            { n: '02', t: 'აირჩიე სერვისი და დრო', d: 'აირჩიე სერვისი და დრო კალენდრიდან — ექსპერტი ადასტურებს.', tk: 'home.how.step2.title', dk: 'home.how.step2.desc', art: 'bookingsOnDark' },
            // Step 03 must describe something the visitor DOES. „უსაფრთხო
            // გადახდები · მალე" described a feature that doesn't exist yet — a
            // step you cannot take. Until payments are live the third step is
            // the session itself, which is the actual next thing that happens.
            //
            // Only the LIVE branch carries SiteText keys. The payments version
            // is unreachable copy today, and an admin field that edits a string
            // nobody can see is a dead control — it gets keys the day
            // PAYMENTS_LIVE flips.
            PAYMENTS_LIVE
              ? { n: '03', t: 'დაცული გადახდა', d: 'თანხა დაცულია — ექსპერტს სესიის შემდეგ გადაერიცხება.' }
              : { n: '03', t: 'შეხვდი ვიდეოზე', d: 'დანიშნულ დროს ბმულით შეხვალ — დაჯავშნა ახლა უფასოა.', tk: 'home.how.step3.title', dk: 'home.how.step3.desc', art: 'videoSessionOnDark' },
          ] as { n: string; t: string; d: string; tk?: string; dk?: string; art?: IllustrationName }[]).map((s, i) => (
            /* No card. On a dark ground a white panel is a hole, not a card —
               the steps are ruled rows instead, and the numeral does the work a
               border used to. */
            <div key={i} className="border-t border-white/15 py-5 sm:py-6 grid grid-cols-[64px_1fr] sm:grid-cols-[110px_1fr] gap-4 sm:gap-6 items-baseline">
              <div className="font-display text-display sm:text-display-xl font-bold text-brand-400 tabular-nums tracking-[-0.03em] leading-[0.85]">{s.n}</div>
              <div className={stepArt ? 'flex items-center gap-4 sm:gap-6' : undefined}>
                <div className="min-w-0">
                  <h3 className="font-display text-h3 sm:text-h2 font-bold text-white mb-1.5 tracking-tight leading-tight">{s.tk ? <SiteText k={s.tk} /> : s.t}</h3>
                  <p className="text-body text-white/65 leading-relaxed">{s.dk ? <SiteText k={s.dk} /> : s.d}</p>
                </div>
                {/* ALL THREE or none — see `stepArt` above. Below sm the row is
                    already tight against a 64px numeral, so the art is desktop
                    only rather than squeezing a phone to three columns. */}
                {stepArt && s.art && (
                  <div className="hidden sm:block shrink-0 ml-auto">
                    <Illustration name={s.art} size="step" alt="" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </Reveal>
      </div>

      {/* The three-cell „რას გთავაზობთ?" strip that used to close this section
          was REMOVED 2026-08-08 (owner). Its seven SiteText keys —
          `home.includes.eyebrow` and `home.why.card1–3.title/body` — are marked
          `retired: true` in lib/siteTextDefs rather than deleted: the keys must
          survive (production rows hold the owner's hand-written copy under those
          exact strings) but the admin fields must not, or they would edit a
          void. Render this strip again and the stored text comes back with it. */}
    </Container>
  </section>
)
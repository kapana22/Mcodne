/**
 * THE PITCH'S SUPPORTING SECTIONS — one source, two pages.
 *
 * ⚠️ WHY THEY LEFT `_expert/ApplyMarketing` (2026-08-20). „როგორ მუშაობს",
 * „ვის ვეძებთ", „რას იღებ" and the FAQ answer questions that belong to
 * ANYBODY thinking about selling here — they are not the consultation half's
 * property. When the public door started asking the profession up front
 * (`_door/PublicDoor`), it needed exactly these four blocks under it, and the
 * alternative was a second copy that would answer the same questions
 * differently within a week.
 *
 * They are still SiteText-driven and still editable in ადმინი → ტექსტები under
 * the „გახდი ექსპერტი — …" groups; the keys are DB keys and are never renamed.
 *
 * ⚠️ THE FAQ FEEDS THE JSON-LD FROM THE SAME ARRAY. Left as two lists, an
 * admin edit would change the visible answer while the structured data kept
 * serving the old one — a mismatch Google treats as a reason to drop the rich
 * result, and nothing in the app would have reported it. `getSiteTextMap` is
 * wrapped in React `cache()`, so the two exports below still cost ONE query.
 */

import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { jsonLdString } from '@/lib/jsonLd'
import { getSiteTextMap } from '@/lib/siteText'
import { SITE_TEXT_DEFAULTS } from '@/lib/siteTextDefs'

async function parts() {
  const map = await getSiteTextMap()
  const t = (k: string) => map[k] ?? SITE_TEXT_DEFAULTS[k] ?? ''
  const STEPS = [1, 2, 3].map(n => ({ n, t: t(`apply.how.step${n}.title`), d: t(`apply.how.step${n}.desc`) }))
  // One profession per line; blank lines are ignored so the list length is
  // edited with the Enter key rather than with a deploy.
  const WHO = t('apply.who.list').split('\n').map(x => x.trim()).filter(Boolean)
  const FAQ: { q: string; a: string }[] = [
    { q: t('apply.faq.q1'), a: t('apply.faq.a1') },
    { q: t('apply.faq.q2'), a: t('apply.faq.a2') },
    { q: t('apply.faq.q3'), a: t('apply.faq.a3') },
    // The money question. Its commission figure was removed 2026-08-05 (owner),
    // and with it the PAYMENTS_LIVE branch that had kept it in code. ⚠ It no
    // longer follows the flag — re-type both halves in the admin panel the day
    // paid bookings ship.
    { q: t('apply.faq.q6'), a: t('apply.faq.a6') },
    { q: t('apply.faq.q4'), a: t('apply.faq.a4') },
    { q: t('apply.faq.q5'), a: t('apply.faq.a5') },
  ]
  return { t, STEPS, WHO, FAQ }
}

/** The FAQPage structured data, built from the SAME array the page renders. */
export async function PitchFaqLd() {
  const { FAQ } = await parts()
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(faqLd) }} />
}

export async function PitchSections() {
  const { t, STEPS, WHO, FAQ } = await parts()
  return (
    <>
      <section className="mt-16 lg:mt-20">
        <Eyebrow className="mb-4">{t('apply.how.eyebrow')}</Eyebrow>
        <ol className="grid sm:grid-cols-3 gap-4">
          {STEPS.map(s => (
            <li key={s.n} className="rounded-card border border-ink-200 bg-white p-5">
              <div className="w-8 h-8 rounded-full bg-brand-600 text-white inline-flex items-center justify-center font-display text-small font-bold tabular-nums mb-3">
                {s.n}
              </div>
              <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight leading-snug">{s.t}</div>
              <p className="mt-2 text-small text-ink-600 leading-relaxed">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16">
        <Eyebrow className="mb-4">{t('apply.who.eyebrow')}</Eyebrow>
        <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2.5">
          {WHO.map(w => (
            <li key={w} className="flex items-start gap-2.5 text-body text-ink-700 leading-relaxed">
              <Icon.check className="w-4 h-4 text-brand-600 mt-1 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-small text-ink-600 leading-relaxed">
          {t('apply.who.note')}
        </p>
      </section>

      <section className="mt-16">
        <Eyebrow className="mb-4">{t('apply.get.eyebrow')}</Eyebrow>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { t: t('apply.get.card1.title'), d: t('apply.get.card1.body') },
            { t: t('apply.get.card2.title'), d: t('apply.get.card2.body') },
            { t: t('apply.get.card3.title'), d: t('apply.get.card3.body') },
            // „გადახდები — მალე" is roadmap status in a slot that promises the
            // applicant something they GET. Editable since 2026-08-05 — see
            // apply.faq.a6 for the same ⚠ about PAYMENTS_LIVE.
            { t: t('apply.get.card4.title'), d: t('apply.get.card4.body') },
          ].map(x => (
            <div key={x.t} className="rounded-card border border-ink-200 bg-white p-5">
              <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">{x.t}</div>
              <p className="mt-1.5 text-small text-ink-600 leading-relaxed">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 lg:mt-20">
        <Eyebrow className="mb-4">{t('apply.faq.eyebrow')}</Eyebrow>
        <div className="rounded-card border border-ink-200 bg-white divide-y divide-ink-200">
          {FAQ.map((f, i) => (
            <details key={i} className="group">
              <summary className="flex items-center justify-between p-5 cursor-pointer list-none gap-4">
                <span className="text-body-lg font-display font-semibold text-ink-900 leading-snug">{f.q}</span>
                <Icon.chevD className="w-4 h-4 text-ink-500 group-open:rotate-180 transition-transform duration-fast shrink-0" />
              </summary>
              {/* No `max-w-prose` inside a card that is already capped by its
                  container — see app/help. Capping both wraps the answer at
                  ~half the panel. Cap the container OR the text, never both. */}
              <div className="px-5 pb-5 text-body text-ink-600 leading-relaxed">{f.a}</div>
            </details>
          ))}
        </div>
      </section>
    </>
  )
}

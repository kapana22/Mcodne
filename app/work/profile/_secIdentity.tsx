'use client'
// „ვინ ხარ" — the identity half of the one provider editor: the face, the name,
// the sentence, the sphere, the paragraph, the years, the links, the languages.
//
// ⚠️ IT WAS TAB 0 OF /work/profile UNTIL 2026-08-30, and the fields are the
// same ones with the same notes. What changed is that they no longer sit behind
// a tab: the page they were on drew a tab bar („პროფილი / ანგარიში") that did
// NOT cover the page — the work photos stood below it, belonging to neither tab
// — and a bar that describes only part of a screen is worse than no bar.
//
// ⚠️ „სახელი და გვარი" CAME UP FROM THE ANGARISHI TAB (2026-08-30). It is the
// LARGEST TEXT on the card a client reads, and it was edited two tabs away from
// the sentence printed under it, behind its own separate „შენახვა" button. It
// belongs beside the face it labels; the password and the visibility switch —
// the only two things on the old screen that touch no public field — are what
// went to /work/account instead.
//
// PRESENTATIONAL. The parent owns the draft, the save and the dirty flag.

import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { Avatar } from '@/components/Avatar'
import { LanguagePicker } from '@/components/LanguagePicker'
import { HEADLINE_MAX } from '@/lib/headline'
import { NAME_MIN, NAME_MAX } from '@/lib/serviceProfile'
import { Field } from './_parts'
import type { Draft } from './_types'

export function IdentitySection({
  avatarUrl, avatarUploading, pickAvatar, avatarCropperUi, draft, patch,
}: {
  avatarUrl: string | null
  avatarUploading: boolean
  pickAvatar: () => void
  avatarCropperUi: React.ReactNode
  draft: Draft
  patch: (p: Partial<Draft>) => void
}) {
  return (
    <>

        {/* Avatar block — hover overlay pattern, keyboard-focusable button.
            Reuses the existing `uploadAvatar` handler and hidden file input. */}
        {/* <Card> rather than the hand-spelled shell it was (2026-09-01): the
            exact `rounded-card border-ink-200 bg-white` surface the primitive
            owns. `padding="none"` and `p-6` written out, because 24px is not
            one of Card's four tiers and two padding utilities on one element
            resolve by Tailwind's emit order, not by the order they are typed. */}
        <Card as="section" id="section-avatar" padding="none" className="scroll-mt-24 p-6">
          {/* ⚠️ `as="h2"` (2026-09-01). „ავატარი" and „საჯარო პროფილი" are the
              titles of two panels on this page and they were the only two of
              its seven that were not headings — _secServices already writes
              `<h2>` and `<Eyebrow as="h3">`, and /work/balance writes
              `<Eyebrow as="h2">`. So somebody moving through this long form by
              heading skipped straight from „ჩემი გვერდი" to „რას აკეთებ" and
              never met the face or the sentence. `Eyebrow` puts its classes on
              whatever tag it is given: nothing on screen changes. */}
          <Eyebrow as="h2" tone="muted" className="mb-4">ავატარი</Eyebrow>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={pickAvatar}
              disabled={avatarUploading}
              aria-label="ავატარის შეცვლა"
              className="group relative w-[72px] h-[72px] rounded-full overflow-hidden shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-wait"
            >
              <span className="block w-full h-full">
                <Avatar src={avatarUrl ?? undefined} name={draft.fullName} size={72} />
              </span>
              {!avatarUploading && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full inline-flex flex-col items-center justify-center gap-0.5 bg-black/45 text-white opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-visible:opacity-100 motion-safe:transition-opacity motion-safe:duration-fast"
                >
                  <Icon.camera className="w-4 h-4" />
                  <span className="font-display text-micro font-semibold uppercase">შეცვლა</span>
                </span>
              )}
              {avatarUploading && (
                <span aria-hidden="true" className="absolute inset-0 rounded-full inline-flex items-center justify-center bg-black/55 text-white">
                  <svg aria-hidden viewBox="0 0 24 24" className="w-5 h-5 motion-safe:animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" />
                  </svg>
                </span>
              )}
            </button>
            <div className="flex-1 min-w-0">
              <div className="font-display text-body-lg font-bold text-ink-900">{draft.fullName}</div>
              {/* Truthful: the server caps images at MAX_IMAGE_BYTES = 8MB
                  (the old „500KB" was never the real limit). */}
              <div className="mt-1 text-meta text-ink-500">JPG/PNG/WebP · მინ. 256×256 · მაქს. 8MB</div>
              {/* ⚠️ THE PHOTOGRAPHY ADVICE IS GONE (2026-09-02) — it was the
                  same line the join door carried under the same control, and it
                  went from there on the same day. */}
            </div>
            {avatarCropperUi}
          </div>
            {/* `h3`, not `h2`: this labels the SECOND block inside the same
                plate „ავატარი" heads, so it nests under it — the same h2/h3
                pairing _secServices already uses for its groups. */}
            <Eyebrow as="h3" className="mb-2">საჯარო პროფილი</Eyebrow>

            {/* 200 → HEADLINE_MAX (60). 200 characters is not a headline, it
                is a paragraph: the browse card gives this field ~2 lines and
                truncates the rest, so an expert who filled the old limit
                never saw the end of their own sentence anywhere on the site.
                The counter and the hint below exist because the field's
                failure mode was never length alone — the old hint („პირველი
                ფრაზა, რასაც კლიენტი ხედავს") did not say what NOT to put in
                it, so experts typed their category and their years, both of
                which the card already renders in their own slots. */}
            <Field label="სათაური">
              <input type="text" required maxLength={HEADLINE_MAX}
                     value={draft.headline} onChange={e => patch({ headline: e.target.value })}
                     className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
              <div className="mt-1.5 flex items-start justify-between gap-3">
                <p className="text-meta text-ink-500 leading-snug">
                  რას აკეთებ კონკრეტულად. კატეგორია და გამოცდილების წლები ცალკე ჩანს — აქ ნუ გაიმეორებ.
                </p>
                <span className={`shrink-0 text-meta tabular-nums ${draft.headline.length > HEADLINE_MAX - 10 ? 'text-warning-700' : 'text-ink-400'}`}>
                  {draft.headline.length}/{HEADLINE_MAX}
                </span>
              </div>
            </Field>

            {/* „სპეციალობა" was a third field describing the same thing as the
                headline and the category — and the data proved it: most rows
                stored the SAME string twice („IT"/„IT", „ბიზნეს-სტრატეგია"
                twice). It is no longer asked for, and since 2026-08-30 it is
                not sent either: `ServiceProfileInput` does not accept the
                field, and the endpoint leaves absent columns alone — so the
                stored value stands untouched and the approval flow keeps
                writing it. */}

            {/* ═══════════ „რომელ პროფესიად გეძებენ" IS GONE (2026-09-02) ══════
             *
             * It was a sphere <select> plus a wall of roughly thirty profession
             * chips („სხვა კატეგორიები (14)" under them), sitting directly above
             * „რას აკეთებ" — and the owner read the two as one question asked
             * twice, twice: „ორჯერ რატო არის სერვისის დამატება და ერთი და
             * იგივესი არ მესმის?" (2026-09-01) and again on 2026-09-02.
             *
             * The previous answer was to NAME the two apart with a sentence
             * („ამის მიხედვით მოგდის მოთხოვნები"). That is a label on a control,
             * not a reason for it, and the measurement says the control had no
             * reason. Against the roster on 2026-09-02, 27 published profiles:
             *
             *     24  had left `professions` completely empty — 89% of the
             *         people this wall was shown to never used it
             *      0  services ticked by nobody — every single provider fills
             *         the OTHER question
             *      0  extra routing topics contributed by the whole field, for
             *         anybody: `topicsForProfessions` on the three who did fill
             *         it returned nothing their services did not already cover
             *
             * So it cost every provider a wall and bought no request for anyone.
             *
             * ⚠️ THE SPHERE WENT WITH IT AND IS NOT LOST, which is the half that
             * needed work. `categoryId` decides the catalogue, the filter and
             * part of the routing, and it was DERIVED from the professions here
             * (`sphereOfProfessions`). It is derived from the SERVICES now, in
             * one place on the server — POST /api/provider/service-profile — so
             * every surface that writes a profile gets the same answer and this
             * screen does not have to ask. lib/requestTopics → `sphereOfServices`
             * carries the measurement for that derivation.
             *
             * ⚠️ AND THE PROFESSIONS ARE NOT DERIVED, deliberately. Reading them
             * back off the services was tried and rejected the same hour: a
             * provider who ticks smm/seo/ads derives to eight job titles
             * including „PR სპეციალისტი" and „კოპირაითერი" — public claims they
             * never made. CLAUDE.md rule 6 covers invented numbers; an invented
             * credential is worse. The stored column and the three people who
             * filled it are untouched: their chips still render on their public
             * page and an admin can still set one. */}

            {/* The single most consequential text on the profile — it is what
                a client reads before booking and what Google indexes — and it
                used to be a BARE textarea: no hint, no placeholder, no target
                length, while the `სათაური` field right above it carried a
                helper line. Measured 2026-08-01: 6 of 12 live experts had a
                bio under 300 characters, one at 74. That is not laziness;
                nobody told them what to write or how much.

                The counter is deliberately encouraging rather than blocking:
                a hard minimum here would just push people to pad. */}
            <Field label="ბიოგრაფია">
              <p className="mb-2 text-meta text-ink-500 leading-snug">
                ეს ტექსტი წყვეტს, აგირჩევენ თუ არა — და სწორედ ის იძებნება Google-ში. უპასუხე სამ კითხვას:
                <span className="text-ink-700"> რა გამოცდილება გაქვს</span>,
                <span className="text-ink-700"> რა კონკრეტულ პრობლემებში ეხმარები</span>,
                <span className="text-ink-700"> რა შედეგამდე მიჰყავხარ კლიენტი</span>.
              </p>
              {/* ⚠️ NO EXAMPLE (2026-09-01). Three paragraphs of an ACCOUNTANT's
                  biography stood in the box as the model answer, on an editor
                  every trade shares. The three questions printed right above it
                  („რა გამოცდილება გაქვს… რა პრობლემებში ეხმარები… რა შედეგამდე
                  მიჰყავხარ") are the instruction, and they are general; the
                  example only told a plumber to write like a bookkeeper. */}
              <textarea rows={8} maxLength={2000}
                        value={draft.about} onChange={e => patch({ about: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-field border border-ink-200 bg-white text-body text-ink-900 placeholder:text-ink-400 focus:border-brand-400 focus:outline-none resize-y" />
              {(() => {
                const n = draft.about.trim().length
                // Thresholds from what actually reads as a complete profile,
                // not from an SEO rule: ~300 is one paragraph, 600+ is the
                // three questions above genuinely answered.
                const state = n >= 600 ? { t: 'ძალიან კარგი სიგრძე', c: 'text-success-700' }
                  : n >= 300 ? { t: 'კარგია — კიდევ ერთი აბზაცი და სრულყოფილია', c: 'text-ink-600' }
                  : n > 0 ? { t: 'ჯერ მოკლეა — სცადე 300+ სიმბოლო', c: 'text-warning-700' }
                  : { t: 'ორიენტირი: 600+ სიმბოლო', c: 'text-ink-500' }
                return (
                  <div className="mt-1.5 flex items-center justify-between gap-3 text-meta">
                    <span className={state.c}>{state.t}</span>
                    <span className="text-ink-400 tabular-nums shrink-0">{n} / 2000</span>
                  </div>
                )
              })()}
            </Field>

            {/* ⚠️ TWO FIELDS USED TO SIT HERE AND BOTH ARE GONE. „სესიის ფასი"
                went with the booking product (2026-08-24) — a price belongs to a
                SERVICE now, one number per thing sold. „გამოცდილება (წლები)"
                went on 2026-08-31: it was `required` here and optional on /join,
                so the same question had two different answers, and a profile
                that skipped it printed „0 წელი" on its public page. */}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="LinkedIn ბმული">
                <input type="url" placeholder="https://linkedin.com/in/username" maxLength={500}
                       value={draft.linkedinUrl} onChange={e => patch({ linkedinUrl: e.target.value })}
                       className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
              </Field>
              <Field label="ვებგვერდი / ბლოგი">
                <input type="url" placeholder="https://example.com" maxLength={500}
                       value={draft.websiteUrl} onChange={e => patch({ websiteUrl: e.target.value })}
                       className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
              </Field>
            </div>

            <Field label="ენები">
              <LanguagePicker
                value={draft.languages}
                onChange={langs => patch({ languages: langs })}
                idPrefix="profile-lang"
              />
            </Field>
        </Card>
    </>
  )
}

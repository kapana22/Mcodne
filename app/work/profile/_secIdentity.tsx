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

import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { Avatar } from '@/components/Avatar'
import { LanguagePicker } from '@/components/LanguagePicker'
import { ProfessionPicker } from '@/components/ProfessionPicker'
import { HEADLINE_MAX } from '@/lib/headline'
import { NAME_MIN, NAME_MAX } from '@/lib/serviceProfile'
import { Field } from './_parts'
import type { Category, Draft } from './_types'

export function IdentitySection({
  avatarUrl, avatarUploading, pickAvatar, avatarCropperUi, categories, draft, patch,
}: {
  avatarUrl: string | null
  avatarUploading: boolean
  pickAvatar: () => void
  avatarCropperUi: React.ReactNode
  categories: Category[]
  draft: Draft
  patch: (p: Partial<Draft>) => void
}) {
  return (
    <>

        {/* Avatar block — hover overlay pattern, keyboard-focusable button.
            Reuses the existing `uploadAvatar` handler and hidden file input. */}
        <section id="section-avatar" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white">
          <Eyebrow tone="muted" className="mb-4">ავატარი</Eyebrow>
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
              <div className="mt-1 text-meta text-ink-500 leading-[1.5]">სუფთა ფონი, კარგი განათება, სახე ცენტრში და ნათლად ჩანდეს — პროფესიული სურათი ნდობას ზრდის.</div>
            </div>
            {avatarCropperUi}
          </div>
            <Eyebrow className="mb-2">საჯარო პროფილი</Eyebrow>

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

            {/* SPHERE + PROFESSIONS — the SAME control /apply uses
                (components/ProfessionPicker). It replaced a lone category
                <select> here, which asked half the question: an expert could
                say „მარკეტინგი და გაყიდვები" but not that they are a
                marketer AND a graphic designer. Two screens asking one question
                two different ways is how the category vocabulary drifted apart
                in the first place.
                Both values ride the existing saveProfile PATCH. */}
            <div className="mb-5">
              <ProfessionPicker
                spheres={categories.map(c => ({ slug: c.slug, name: c.name }))}
                sphere={categories.find(c => c.id === draft.categoryId)?.name ?? ''}
                onSphere={name => patch({ categoryId: categories.find(c => c.name === name)?.id ?? '' })}
                value={draft.professions}
                onChange={next => patch({ professions: next })}
              />
              {!draft.categoryId && (
                <p className="mt-2 flex items-start gap-1.5 text-meta text-warning-700 leading-snug">
                  <Icon.warn className="w-3.5 h-3.5 shrink-0 mt-px" />
                  <span>მის გარეშე ვერცერთ კატეგორიაში და ვერც ფილტრში ვერ მოგნახავენ.</span>
                </p>
              )}
            </div>

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
              <textarea rows={8} maxLength={2000}
                        placeholder={'მაგ.: 12 წელია ვმუშაობ ბუღალტრად — ძირითადად მცირე ბიზნესთან და ინდმეწარმეებთან.\n\nყველაზე ხშირად მომმართავენ, როცა დღგ-ს ზღვარს უახლოვდებიან ან დეკლარაციაში ვერ არკვევენ, რა უნდა ჩააბარონ და როდის. ვმუშაობდი…\n\nბოლოს გექნება კონკრეტული ნაბიჯები: რა ჩააბარო, რა ვადაში და რა დაგიჯდება.'}
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
        </section>
    </>
  )
}

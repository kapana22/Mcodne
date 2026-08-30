'use client'
// /tutor/profile — tab 0: photo, headline, bio, category, languages, links,
// and the intro video.

import type { Dispatch, SetStateAction } from 'react'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { Avatar } from '@/components/Avatar'
import { LanguagePicker } from '@/components/LanguagePicker'
import { PriceField } from '@/components/PriceField'
import { HEADLINE_MAX } from '@/lib/headline'
import { normalizeLangs } from '@/lib/languages'
import { Field } from './_parts'
import type { Category, Me, ProfileForm, TutorProfile } from './_types'
import { ProfessionPicker } from '@/components/ProfessionPicker'

type Props = {
  me: Me
  profile: TutorProfile
  loading: boolean
  form: ProfileForm
  setForm: Dispatch<SetStateAction<ProfileForm>>
  dirty: boolean
  savingProfile: boolean
  saveProfile: (e: React.FormEvent) => void
  avatarUploading: boolean
  pickAvatar: () => void
  avatarCropperUi: React.ReactNode
  categories: Category[]
}

export function ProfileTab({ me, profile, loading, form, setForm, dirty, savingProfile, saveProfile, avatarUploading, pickAvatar, avatarCropperUi, categories }: Props) {
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
                <Avatar src={me?.avatarUrl ?? undefined} name={me?.fullName} size={72} />
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
              <div className="font-display text-body-lg font-bold text-ink-900">{me?.fullName}</div>
              <div className="text-small text-ink-500 truncate">{me?.email}</div>
              {/* Truthful: the server caps images at MAX_IMAGE_BYTES = 8MB
                  (the old „500KB" was never the real limit). */}
              <div className="mt-1 text-meta text-ink-500">JPG/PNG/WebP · მინ. 256×256 · მაქს. 8MB</div>
              <div className="mt-1 text-meta text-ink-500 leading-[1.5]">სუფთა ფონი, კარგი განათება, სახე ცენტრში და ნათლად ჩანდეს — პროფესიული სურათი ნდობას ზრდის.</div>
            </div>
            {avatarCropperUi}
          </div>
        </section>

        {/* Public profile form */}
        {profile ? (
          <form id="section-public-profile" onSubmit={saveProfile} className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-4">
            {/* One dirty indicator only — the sticky save bar below owns it
                („შეუნახავი ცვლილებები / შენახულია ✓“). */}
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
                     value={form.headline} onChange={e => setForm({ ...form, headline: e.target.value })}
                     className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
              <div className="mt-1.5 flex items-start justify-between gap-3">
                <p className="text-meta text-ink-500 leading-snug">
                  რას აკეთებ კონკრეტულად. კატეგორია და გამოცდილების წლები ცალკე ჩანს — აქ ნუ გაიმეორებ.
                </p>
                <span className={`shrink-0 text-meta tabular-nums ${form.headline.length > HEADLINE_MAX - 10 ? 'text-warning-700' : 'text-ink-400'}`}>
                  {form.headline.length}/{HEADLINE_MAX}
                </span>
              </div>
            </Field>

            {/* „სპეციალობა" was a third field describing the same thing as the
                headline and the category — and the data proved it: most rows
                stored the SAME string twice („IT"/„IT", „ბიზნეს-სტრატეგია"
                twice). It is no longer asked for. The value is still carried
                in `form.specialty` and saved unchanged, so nothing is lost
                for existing profiles and the approval flow keeps writing it. */}

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
                sphere={categories.find(c => c.id === form.categoryId)?.name ?? ''}
                onSphere={name => setForm({ ...form, categoryId: categories.find(c => c.name === name)?.id ?? '' })}
                value={form.professions}
                onChange={next => setForm({ ...form, professions: next })}
              />
              {!form.categoryId && (
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
                        value={form.bio ?? ''} onChange={e => setForm({ ...form, bio: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-field border border-ink-200 bg-white text-body text-ink-900 placeholder:text-ink-400 focus:border-brand-400 focus:outline-none resize-y" />
              {(() => {
                const n = (form.bio ?? '').trim().length
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* ⚠️ „სესიის ფასი" SAT BESIDE THIS AND WENT WITH THE BOOKING
                  PRODUCT (2026-08-24). A price now belongs to a SERVICE — one
                  number per thing sold, on /work/services — not to the person. */}
              <Field label="გამოცდილება (წლები)">
                <input type="number" inputMode="numeric" min={0} max={80} required
                       value={form.yearsExp} onChange={e => setForm({ ...form, yearsExp: Number(e.target.value) })}
                       className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none tabular-nums" />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="LinkedIn ბმული">
                <input type="url" placeholder="https://linkedin.com/in/username" maxLength={500}
                       value={form.linkedinUrl} onChange={e => setForm({ ...form, linkedinUrl: e.target.value })}
                       className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
              </Field>
              <Field label="ვებგვერდი / ბლოგი">
                <input type="url" placeholder="https://example.com" maxLength={500}
                       value={form.websiteUrl} onChange={e => setForm({ ...form, websiteUrl: e.target.value })}
                       className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
              </Field>
            </div>

            <Field label="ენები">
              <LanguagePicker
                value={form.languages}
                onChange={langs => setForm(f => ({ ...f, languages: langs }))}
                idPrefix="profile-lang"
              />
            </Field>

            {/* Sticky save bar — stays in view while scrolling the long form;
                disabled "შენახულია ✓" doubles as saved-state confirmation. */}
            <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 rounded-b-card border-t border-ink-100 bg-white flex items-center justify-between gap-3">
              <span className={`text-meta font-display font-semibold ${dirty ? 'text-warning-700' : 'text-ink-400'}`} aria-live="polite">
                {savingProfile ? 'ინახება…' : dirty ? 'შეუნახავი ცვლილებები' : 'ყველაფერი შენახულია'}
              </span>
              <Btn variant="primary" size="md" type="submit" disabled={savingProfile || !dirty}>
                {savingProfile ? 'ინახება…' : dirty ? 'შეინახე ცვლილებები' : 'შენახულია ✓'}
              </Btn>
            </div>
          </form>
        ) : (
          <div className="p-6 rounded-card border border-warning-200 bg-warning-50 text-warning-800 text-small flex items-start gap-3">
            <Icon.warn className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              ჯერ არ გაქვს ექსპერტის პროფილი — შეავსე განაცხადი.
            </div>
          </div>
        )}

        {/* ⚠️ THE INTRO-VIDEO FIELD STOOD HERE AND NOBODY EVER USED IT
            (removed 2026-08-29). A YouTube link, an embed preview and a
            delete button — the consultation product's way of introducing
            yourself before somebody booked an hour of your time. Measured on
            the live database that day: 0 of 29 providers had one. Not a low
            number — zero. The public block it fed went with it, see
            app/experts/[slug]/_providerBlocks.tsx. */}

    </>
  )
}

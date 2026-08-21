'use client'
// /apply — the two screens themselves, plus the availability picker on
// step 2 and the live profile preview beside them.

import { useState, useEffect } from 'react'
import { langLabel, normalizeLangs } from '@/lib/languages'
import { LanguagePicker } from '@/components/LanguagePicker'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { PriceField } from '@/components/PriceField'
import { HEADLINE_MAX } from '@/lib/headline'
import { APPLY } from '@/lib/applyValidation'
import { Collapsible, FormSection, StepHeader } from './_chrome'
import { BioCounter, Field, FieldError, Input, NameScriptHint } from './_fields'
import { DAY_LABELS, FREE_INTRO, FormState, MAX_CATS, MediaState, MIN_BIO, OTHER_CAT_MAX, StepId, StepProps } from './_form'
import { CertificateUploader, PhotoUploader } from './_upload'
import { ProfessionPicker } from '@/components/ProfessionPicker'

/** A sphere plus the sub-fields folded into it, as /api/categories returns it. */
export type Sphere = { name: string; slug?: string; children: string[] }

/* „ჩემი სფერო სიაში არ არის" — the escape hatch that makes the sphere step
 * answerable by ANYONE, not only by people the taxonomy already anticipated.
 * See OTHER_CAT_MAX in ./_form for why it is back and what is wired differently.
 *
 * Closed by default and opened by a plain text button: an input sitting open
 * beside the list competes with it, which is how the deleted version collected
 * „IT" three times while the „IT" option was on screen. Opening it CLEARS the
 * chosen sphere, and choosing a sphere clears this — they are one answer, and a
 * form that appears to hold both would be lying about which one it sends.
 */
const OtherSphere = ({ form, set }: { form: FormState; set: (patch: Partial<FormState>) => void }) => {
  const [open, setOpen] = useState(!!form.otherCat.trim())
  // PICKING A SPHERE CLOSES THIS PANEL. `open` is local state, so choosing one
  // cleared `otherCat` but left the box on screen — the form then showed a
  // chosen sphere AND an empty „write your own" input at the same time, which
  // reads as two answers when submit only ever sends one (`cats[0] || otherCat`).
  useEffect(() => {
    if (form.cats.length > 0 && open) setOpen(false)
  }, [form.cats.length, open])
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); set({ cats: [] }) }}
        className="mt-2.5 tap-area inline-flex items-center gap-1.5 text-small font-medium text-ink-500 hover:text-brand-700 underline underline-offset-2 decoration-ink-300 hover:decoration-brand-300 transition-colors duration-fast"
      >
        ჩემი კატეგორია სიაში არ არის
      </button>
    )
  }
  return (
    <div className="mt-2.5 rounded-btn border border-ink-200 bg-ink-50/70 px-3 py-3">
      <Field l="დაწერე შენი კატეგორია" sub="ერთი-ორი სიტყვა — მაგ. „დიეტოლოგია“ ან „არქიტექტურა“. განაცხადს ეს სრულად ავსებს.">
        <Input
          data-field="otherCat"
          autoFocus
          value={form.otherCat}
          onChange={(e: any) => set({ otherCat: e.target.value, cats: [] })}
          placeholder="მაგ. დიეტოლოგია"
          maxLength={OTHER_CAT_MAX}
        />
      </Field>
      <button
        type="button"
        onClick={() => { setOpen(false); set({ otherCat: '' }) }}
        className="mt-2 tap-area inline-flex items-center gap-1.5 text-meta font-medium text-ink-500 hover:text-ink-900 transition-colors duration-fast"
      >
        <Icon.x className="w-3 h-3" /> სიიდან ავირჩევ
      </button>
    </div>
  )
}

/** The spheres /api/categories offers, with the fallback below until it
 *  answers. Shared with the /join door, which asks the same question one
 *  screen earlier — one fetch shape, one fallback list. */
export function useSpheres(): Sphere[] {
  const [dbCats, setDbCats] = useState<Sphere[]>([])
  useEffect(() => {
    let cancelled = false
    fetch('/api/categories')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: any[]) => {
        if (cancelled || !Array.isArray(rows)) return
        setDbCats(rows
          .filter(c => c?.name)
          .map(c => ({
            name: c.name as string,
            slug: c.slug as string | undefined,
            children: (c.children ?? []).map((k: any) => k?.name).filter(Boolean) as string[],
          })))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  // Fallback MUST mirror the deployed SPHERE names, because the approval step
  // matches the applicant's answer BY NAME — a stale fallback lets somebody
  // pick a category that then resolves to nothing.
  //
  // It went stale exactly that way and this is the repair (2026-08-11, verified
  // against all 15 production rows): „ბიზნესი და ფინანსები" and „გადასახადები"
  // were renamed by the taxonomy realignment, and „რელოკაცია" was offered here
  // while no such category has ever existed in the database — an applicant who
  // picked it during an API blip was guaranteed to be filed nowhere.
  //
  // ⚠️ IT WENT STALE AGAIN, AND THIS TIME IT WAS ON THE FIRST SCREEN A GUEST
  // SEES (2026-08-20). Three of the eight names below no longer existed —
  // „ბიზნესი და სტრატეგია", „ფინანსები და გადასახადები", „ტექნოლოგია და
  // პროდუქტი" were renamed — and ტალღა 1's two service-side spheres
  // („სწავლება", „სახლის რემონტი") were not in the list at all. Since the
  // public door renders this control BEFORE the fetch resolves, every visitor
  // saw a consulting-only list with three dead names flash and then swap.
  // Verified against all 20 production rows the same day.
  //
  // ტალღა 1 first, in `lib/launchTaxonomy`'s order — the picker sorts anyway
  // (`launchFirst`), but a fallback that opens on the launch set is one less
  // thing that can disagree. The rest follow; nothing is hidden from this
  // screen on purpose, because a sphere that cannot be picked here can never
  // get its first expert.
  const SPHERES: Sphere[] = dbCats.length ? dbCats : [
    { name: 'სწავლება', slug: 'swavleba', children: [] },
    { name: 'ბუღალტერია და გადასახადები', slug: 'tax', children: [] },
    { name: 'სამართალი', slug: 'law', children: [] },
    { name: 'ფსიქოლოგია', slug: 'psychology', children: [] },
    { name: 'ბიზნესი', slug: 'business', children: [] },
    { name: 'სახლის რემონტი', slug: 'remonti', children: [] },
    { name: 'დიზაინი', slug: 'design', children: [] },
    { name: 'კარიერა და HR', slug: 'career', children: [] },
    { name: 'მარკეტინგი და გაყიდვები', slug: 'marketing', children: [] },
    { name: 'IT და ტექნოლოგიები', slug: 'it', children: [] },
    { name: 'უძრავი ქონება', slug: 'real-estate', children: [] },
    { name: 'ჯანმრთელობა და კვება', slug: 'health', children: [] },
    { name: 'მედიცინა', slug: 'medicine', children: [] },
    { name: 'არქიტექტურა და მშენებლობა', slug: 'architecture', children: [] },
    { name: 'ტურიზმი და ღონისძიებები', slug: 'tourism', children: [] },
    { name: 'ლოგისტიკა და საბაჟო', slug: 'logistics', children: [] },
    { name: 'მედია და კონტენტი', slug: 'media', children: [] },
    { name: 'გრანტები და ტენდერები', slug: 'grants', children: [] },
    { name: 'ვიზა, მიგრაცია და რელოკაცია', slug: 'relocation', children: [] },
    { name: 'სოფლის მეურნეობა', slug: 'agriculture', children: [] },
  ]

  return SPHERES
}

/* ───── STEP 1 — Who you are + what you do (one screen) ─────
 * Merges the old "contact" step with the old expertise step, minus everything
 * that isn't needed to judge an application: phone (now optional), city,
 * languages, years, LinkedIn, website, intro video, certificates and the whole
 * per-profession block. Those are all editable in the profile after approval.
 *
 * The bio minimum dropped 150 → 40 characters. 150 is roughly a full paragraph
 * in Georgian, and it was the last hard gate before the finish line — the
 * server has only ever asked for 20. */
export const Step1 = ({ form, set, media, setMedia }: StepProps) => {
  const SPHERES = useSpheres()

  /* ONE answer — see MAX_CATS in ./_form for why the „1–3" it once asked for
     was undeliverable. The picker enforces it by shape: choosing anything
     replaces the previous answer, so there is no cap to explain and no „which
     of my three is the main one" to work out. */

  return (
    <>
      {/* The sub lists EXACTLY what validateStep(1) gates: name, email, sphere,
          the one-line pitch and the short bio. It used to omit the bio, which is
          the longest required field on the screen. */}
      <StepHeader title="ვინ ხარ და რაში ეხმარები ადამიანებს?" sub="სავალდებულოა სახელი, ელფოსტა, კატეგორია, ერთი წინადადება შენზე და მოკლე აღწერა. დანარჩენი სურვილისამებრ — მაგრამ პროფილს ავსებს." />

      <FormSection title="სახელი და კონტაქტი" required fields={['firstName', 'lastName', 'email', 'phone']}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field l="სახელი" required name="firstName"><Input data-field="firstName" autoComplete="given-name" value={form.firstName} onChange={(e: any) => set({ firstName: e.target.value })} placeholder="მაგ. ნინო" /></Field>
          <Field l="გვარი" required name="lastName"><Input data-field="lastName" autoComplete="family-name" value={form.lastName} onChange={(e: any) => set({ lastName: e.target.value })} placeholder="მაგ. ბერიძე" /></Field>
        </div>
        {/* SAID BEFORE IT BLOCKS, not at the gate. These two inputs are
            PRE-FILLED from the signed-in account, and a Georgian's Google
            account name is very often Latin — so the applicant is holding a
            value they never typed and which the API will refuse. Waiting for
            „შემდეგი" to mention it is how the 400 became invisible in the first
            place. Renders only while the name is actually unusable, and stands
            down once the red error takes over the same message. */}
        <NameScriptHint form={form} />
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          {/* READ-ONLY. The application is tied to the session and POST
              /api/applications takes no email at all — every letter goes to the
              ACCOUNT address. An editable field here let someone type a second
              address and believe the answer would arrive there; it never would.
              Show the real destination instead, and say where to change it. */}
          <Field l="ელფოსტა" sub="აქ მოგივა პასუხი. შესაცვლელად — პარამეტრები.">
            <Input
              type="email"
              data-field="email"
              readOnly
              tabIndex={-1}
              aria-readonly="true"
              value={form.email}
              className="bg-ink-50 text-ink-600 cursor-default"
            />
          </Field>
          {/* Required again since 2026-08-10 (owner). The moderator calls the
              applicant, and an application with no number is one they cannot
              act on. `name` is what lets FieldError land under this field. */}
          <Field l="ტელეფონი" required name="phone"><Input data-field="phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e: any) => set({ phone: e.target.value })} placeholder="+995 5XX XX XX XX" /></Field>
        </div>
      </FormSection>

      {/* City / years / languages. All three lived in FormState, were rendered in
          the live preview and were carried into the created profile — but NO
          input ever showed them, so every applicant shipped them empty and the
          public profile was born half-blank. Restored as ONE optional row: the
          brief was to SIMPLIFY these fields, not to delete them. */}
      <Collapsible title="ქალაქი, გამოცდილება, ენები" sub="პროფილზე ჩანს — ერთ წუთში შეავსებ." fields={['city', 'yearsExp']}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field l="ქალაქი"><Input data-field="city" autoComplete="address-level2" value={form.city} onChange={(e: any) => set({ city: e.target.value })} placeholder="თბილისი" /></Field>
          {/* `max` matches the API's ceiling (was 60 against a server 80 — a
              number the browser doesn't enforce while typing anyway, so the
              real gate is yearsError()). The anchor is what lets the error
              jump here at all. */}
          <Field l="გამოცდილება (წელი)" name="yearsExp">
            <Input data-field="yearsExp" type="number" inputMode="numeric" min={0} max={APPLY.YEARS_MAX} step={1} value={form.yearsExp} onChange={(e: any) => set({ yearsExp: e.target.value })} placeholder="5" />
          </Field>
        </div>
        <div className="mt-3">
          <Field l="ენები" sub="მონიშნე ენები, რომლებზეც კონსულტაციას ჩაატარებ.">
            {/* The shared picker speaks canonical CODES; this form has always
                stored human labels (older rows even carried „ქართული · მშობლიური").
                Convert at the boundary rather than forking the component —
                approval normalizes the same way, so the two can't drift. */}
            <LanguagePicker
              value={normalizeLangs(form.languages)}
              onChange={codes => set({ languages: codes.map(langLabel) })}
              idPrefix="apply-lang"
            />
          </Field>
        </div>
      </Collapsible>

      {/* SPHERE + PROFESSIONS — see ./_professionPicker for why both levels are
          on screen at once and why the sphere is control number one.
          The sphere is now CHOSEN rather than derived, so `cats[0]` is set
          directly: submit still sends it as `specialty` and approval still
          resolves the Category from that name. Nothing downstream changed. */}
      <FormSection title="კატეგორია და პროფესია" required fields={['cats']} sub="აირჩიე კატეგორია, მერე მონიშნე რას აკეთებ — რამდენიც გინდა.">
        {/* The `cats` anchor lives HERE, not inside the shared picker: it is
            this form's scroll target for „აირჩიე კატეგორია." and a component used
            on two screens must not carry one screen's error plumbing.
            tests/apply-error-focus.test.ts F2 reads this directory for it. */}
        <div data-field="cats">
        <ProfessionPicker
          spheres={SPHERES.map(s => ({ slug: s.slug ?? '', name: s.name }))}
          sphere={form.cats[0] ?? ''}
          onSphere={name => set({ cats: name ? [name] : [], otherCat: '' })}
          value={form.professions}
          onChange={next => set({ professions: next, otherCat: '' })}
        />
        </div>
        <FieldError name="cats" />

        {/* RESTORED 2026-08-11 — see OTHER_CAT_MAX in ./_form for the full
            reasoning, including why the 2026-08-05 deletion was right about the
            old field and wrong about the need.
            Short version: the step gate gated on `cats.length >= 1`, so anyone
            whose field is not on the list could not submit at all. Now typing
            here IS a complete answer.
            It sits behind a link on purpose. The deleted version was an open
            input beside the chip wall, which is what invited „IT" to be typed
            instead of tapped; you have to go looking for this one. */}
        <OtherSphere form={form} set={set} />
      </FormSection>

      {/* The placeholder used to read „მაგ. ბიზნეს-სტრატეგი · 12 წელი" — a worked
          example that TAUGHT applicants to put their years in this field. It was
          learned faithfully: three of the nine live profiles carry „- 7 წელი" /
          „4 წელი" / „1 წლიანი გამოცდილება" here, while the card renders the very
          same years in their own row directly below. A placeholder is the
          strongest instruction on a form; this one now demonstrates the shape we
          actually want, and the sub-line names the two things the card already
          shows so nobody spends their 60 characters repeating them.
          maxLength 80 → HEADLINE_MAX (60), matching the profile editor — the two
          forms write the SAME column and had different ceilings. */}
      {/* ⚠️ „პროფილზე", NOT „ბარათზე" (2026-08-20). The sub promised this
          sentence would appear „ზუსტად ასე … შენს ბარათზე", and the browse card
          has not printed `headline` since 2026-07-31 — it was dropped there
          because it is the one-line version of the bio that renders directly
          under it (see app/experts/_card, the CATEGORY CHIP ONLY note). The
          field is not dead: it is the lead sentence under the name on the
          PROFILE, which is where it has the room to be read. So the promise is
          corrected rather than the card changed — reinstating the headline on
          the card would print the same content twice at two lengths again. */}
      <FormSection title="ერთი წინადადება შენზე" required fields={['headline']} sub="ზუსტად ასე გამოჩნდება შენს პროფილზე, სახელის ქვეშ. კატეგორია და წლები ცალკე ჩანს — აქ ნუ გაიმეორებ.">
        <Input data-field="headline" value={form.headline} onChange={(e: any) => set({ headline: e.target.value })} placeholder="მაგ. ბრენდის სტრატეგია მცირე ბიზნესისთვის" maxLength={HEADLINE_MAX} />
        <FieldError name="headline" />
      </FormSection>

      <FormSection title="მოკლედ — ვის და რაში ეხმარები" required fields={['motivation']} sub={`2–3 წინადადება საკმარისია — მინიმუმ ${MIN_BIO} სიმბოლო. ეს ტექსტი პროფილზე გამოჩნდება.`}>
        {/* maxLength, not a validator: the API's ceiling is 2000 and a textarea
            with no cap let an applicant write 2500 characters and lose the
            submit to a generic 400 naming no field. A hard stop can't happen. */}
        <textarea
          data-field="motivation"
          value={form.motivation}
          onChange={e => set({ motivation: e.target.value })}
          placeholder="რა გამოცდილება გაქვს და რა საკითხებში ეხმარები ადამიანებს."
          rows={4}
          maxLength={APPLY.BIO_MAX}
          className="w-full p-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none resize-none"
        />
        {/* The counter appears only once it can mean something: while short it
            counts UP to the minimum, near the ceiling it counts what's left. */}
        <BioCounter value={form.motivation} />
        <FieldError name="motivation" />
      </FormSection>

      {/* REQUIRED from 2026-07-29 (was optional). It is the single biggest visual
          difference on an expert card, and a faceless profile reads as unfinished.
          Saves straight to the account avatar rather than riding in the
          application payload — and an account that already has one is seeded
          into `media.photoUrl` on load, so nobody re-uploads a photo they have. */}
      {/* PHOTO + VIDEO together (moved 2026-07-30). The video field used to sit
          on the LAST screen, inside a collapsed „გააძლიერე განაცხადი
          (არასავალდებულო)" pile, after the applicant had already decided they
          were finished. Result, measured in production: ZERO of ten live experts
          had one. It is not a nice-to-have — Preply, the only comparable site
          with public guidance, calls the intro video the single most important
          asset on a profile, and students almost always watch before booking.
          It stays OPTIONAL (a hard gate here would cost us applicants), but it
          belongs where the applicant is already thinking about how a client
          meets them: right next to their face. */}
      <FormSection title="ფოტო" required fields={['photo']} sub="ეს არის პირველი, რასაც შენზე ხედავენ — ატვირთე მკაფიო, კარგი ხარისხის სურათი, სადაც სახე ჩანს.">
        <div data-field="photo">
          <PhotoUploader value={media?.photoUrl} onChange={url => setMedia?.({ photoUrl: url })} />
        </div>
        <FieldError name="photo" />
      </FormSection>

      {/* ⚠️ THE VIDEO INTRO IS GONE (2026-08-20). It asked every applicant for
          a YouTube link and told them it was „ყველაზე ძლიერი" — the strongest
          trust signal they could give. Measured on the day it was removed:
          0 of 27 profiles had one. Not „few" — none. A field nobody fills is
          not a weak feature, it is a question that costs every applicant a
          block of the form and returns nothing, and it belongs to the
          video-consultation site this one stopped being.
          The COLUMN stays (`TutorProfile.videoUrl`) — no data is destroyed —
          and the profile still renders one if a row ever holds it. Nothing
          collects one any more. */}

      {/* MOVED HERE FROM THE DELETED THIRD STEP (2026-08-07). These are the only
          two things that step actually asked for; everything else on it was
          text. Collapsed, because a diploma uploader open on screen reads as a
          requirement — which is precisely what the 2026-07-28 cut removed and
          what one applicant, in his own account, still came away believing. */}
      <Collapsible
        title="ბმულები და დოკუმენტი"
        sub="დიპლომი, ლიცენზია, LinkedIn ან ვებგვერდი — რასაც დაურთავ, ის აძლიერებს განაცხადს."
        fields={['certificates', 'linkedin', 'website']}
      >
        <div className="space-y-4">
          <div>
            <span className="font-display text-micro font-semibold uppercase text-ink-500 block mb-1.5">დიპლომი ან სერტიფიკატი</span>
            <p className="text-meta text-ink-600 mb-2 leading-[1.5]">დიპლომს, ლიცენზიასა და სამუშაო გამოცდილებას ტექსტით ვერ გადავამოწმებთ — დოკუმენტი ერთადერთია, რისი შემოწმებაც შეგვიძლია. თუ დაურთავ, „გადამოწმებული“ ნიშანიც შეიძლება მიიღო.</p>
            <div data-field="certificates">
              <CertificateUploader items={media?.certificates ?? []} onChange={certificates => setMedia?.({ certificates })} />
            </div>
            <FieldError name="certificates" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field l="LinkedIn" name="linkedin"><Input data-field="linkedin" type="url" inputMode="url" autoCapitalize="none" spellCheck={false} maxLength={APPLY.URL_MAX} value={form.linkedin} onChange={(e: any) => set({ linkedin: e.target.value })} placeholder="linkedin.com/in/…" /></Field>
            <Field l="ვებგვერდი" name="website"><Input data-field="website" type="url" inputMode="url" autoCapitalize="none" spellCheck={false} maxLength={APPLY.URL_MAX} value={form.website} onChange={(e: any) => set({ website: e.target.value })} placeholder="example.ge" /></Field>
          </div>
        </div>
      </Collapsible>
    </>
  )
}


/* ───── STEP 2 — Pricing (single screen) ─────
   KYC (ID/selfie) + payout account (bank/IBAN) removed from onboarding: expert
   registration is just profile + one priced service. Payout details are
   collected later, in the expert's workspace, when payments integrate. */
export const Step2 = ({ form, set }: StepProps) => {
  const updateService = (i: number, patch: Partial<FormState['services'][number]>) => {
    const next = form.services.map((s, idx) => idx === i ? { ...s, ...patch } : s)
    set({ services: next })
  }
  const removeService = (i: number) => set({ services: form.services.filter((_, idx) => idx !== i) })
  const addService = () => set({ services: [...form.services, { name: '', dur: 60, price: 40, free: false, bookable: false, desc: '' }] })
  // The schedule question is only real if something on this form can be booked.
  // See AvailabilityPicker's mount below and the step-2 validation.
  const anyBookable = form.services.some(sv => sv.bookable)

  /* THE FREE INTRO IS A SWITCH, NOT A ROW (fixed 2026-08-06, reported from a
   * phone). It used to render inside the services loop, so unticking the box
   * DELETED it from `services` — and the moment it was gone the checkbox went
   * with it. There was no way back: „სერვისის დამატება" adds a PAID service,
   * and nothing in the form could reconstruct a free 15-minute one. An expert
   * who tapped it to see what it did lost the feature permanently, silently,
   * and mid-application.
   *
   * The row now lives OUTSIDE the loop and always renders. Off is a state, not
   * a deletion — which is what a checkbox promises when you draw one. */
  const freeIdx = form.services.findIndex(s => s.free)
  const hasFree = freeIdx !== -1
  const freeIntro = hasFree ? form.services[freeIdx] : FREE_INTRO
  const toggleFree = () => set({
    services: hasFree
      ? form.services.filter((_, idx) => idx !== freeIdx)
      : [...form.services, { ...FREE_INTRO }],
  })

  return (
  <>
    {/* The pricing guidance used to live in this subtitle (with a „ჩვეულებრივ
        ₾60–₾150“ line that read like market data we don't have). It now lives
        inside <PriceField>, framed as our recommendation. */}
    {/* The old sub said the expert would add further services „მოგვიანებით,
        პროფილიდან" — while a „სერვისის დამატება" button sits right below it. */}
    <StepHeader title="რას ყიდი?" sub={anyBookable
      ? 'ერთი ფასიანი შეთავაზება საკმარისია. განრიგი უკვე შევსებულია სამუშაო კვირით — შეამოწმე და გააგზავნე.'
      : 'ერთი ფასიანი სერვისი საკმარისია. დანარჩენს მოგვიანებით დაამატებ.'} />

    <FormSection title="შენი შეთავაზება" sub="სერვისი არის სამუშაო, რომელსაც ასრულებ. კონსულტაცია არის დაჯავშნილი საათი. ორივე შეგიძლია.">
      <div data-field="services" className="space-y-3">
        {form.services.map((s, i) => (
          s.free ? null : (
          <div key={i} className="p-4 rounded-card border bg-white border-ink-200">
            {/* Row 1 — what the service IS. Price used to sit here in a 120px
                column, visually equal to duration though far more consequential;
                it now gets its own block below.
                The duration column is 152px, not 120: „ხანგრძლივობა · წთ" is a
                17-character uppercase label with 0.14em tracking and wrapped to
                two lines at the narrower width, which left the field floating
                under a broken heading. */}
            {/* ⚠️ THE SHAPE IS THE FIRST QUESTION ON THE ROW (2026-08-20), and
                it changes the row under it. Same two words, same order and the
                same default as the workspace editor (app/work/services/
                _consultations) — an applicant meets this choice at the door and
                finds it unchanged the first time they edit. Service first,
                because that is what the site sells. */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              {([
                { on: false, label: 'სერვისი', hint: 'ფასი, დროის გარეშე' },
                { on: true, label: 'სერვისი დროით', hint: 'ჯავშნადი — კლიენტი დროს ირჩევს' },
              ] as const).map(o => {
                const active = s.bookable === o.on
                return (
                  <button
                    key={String(o.on)}
                    type="button"
                    aria-pressed={active}
                    onClick={() => updateService(i, { bookable: o.on, dur: o.on && s.dur < 15 ? 60 : s.dur })}
                    className={`text-left px-3 py-2 rounded-field border transition-colors duration-fast ${
                      active ? 'border-brand-400 bg-brand-50/60' : 'border-ink-200 bg-white hover:bg-ink-50'
                    }`}
                  >
                    <span className="block font-display text-small font-semibold text-ink-900">{o.label}</span>
                    <span className="block text-meta text-ink-500">{o.hint}</span>
                  </button>
                )
              })}
            </div>
            <div className={`grid gap-3 items-start ${s.bookable ? 'sm:grid-cols-[1fr_152px_auto]' : 'sm:grid-cols-[1fr_auto]'}`}>
              <div className="min-w-0">
                <Input value={s.name} onChange={(e: any) => updateService(i, { name: e.target.value })} placeholder={s.bookable ? 'მაგ. ინდივიდუალური კონსულტაცია' : 'მაგ. დეკლარაციის შევსება'} className="!h-9 !text-small font-display font-bold" />
                <textarea value={s.desc} onChange={e => updateService(i, { desc: e.target.value })} placeholder="მოკლე აღწერა" rows={2} className="mt-2 w-full p-2 rounded-field border border-ink-200 bg-white text-meta text-ink-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none resize-none" />
              </div>
              {/* A service has no clock — the column is ABSENT, not greyed out.
                  A disabled box still asks a question, and the answer to this
                  one does not exist. */}
              {s.bookable && (
                <div>
                  <span className="font-display text-micro font-semibold uppercase text-ink-500 block mb-1">ხანგრძლივობა · წთ</span>
                  <Input type="number" min={15} max={240} value={s.dur} onChange={(e: any) => updateService(i, { dur: Number(e.target.value) || 0 })} className="!h-9 !text-small tabular-nums font-display font-bold" />
                </div>
              )}
              {/* Removing the ONLY paid service leaves the form unsubmittable
                  („add at least one paid service") — so don't offer the action. */}
              {form.services.filter(x => !x.free).length > 1 ? (
                <button type="button" onClick={() => removeService(i)} aria-label="სერვისის წაშლა" className="h-9 w-9 self-end rounded-btn text-ink-500 hover:text-danger-700 hover:bg-danger-50 inline-flex items-center justify-center transition-colors duration-fast">
                  <Icon.x className="w-4 h-4" />
                </button>
              ) : <span aria-hidden />}
            </div>

            {/* Row 2 — the decision. Shared with the workspace profile editor so
                the guidance can't drift between onboarding and later edits. */}
            <PriceField
              className="mt-3 pt-3 border-t border-ink-100"
              value={s.price}
              onChange={(price) => updateService(i, { price })}
              minutes={s.dur}
              disabled={s.free}
            />
          </div>
          )
        ))}

        <button type="button" onClick={addService} className="w-full h-12 rounded-card border border-dashed border-ink-300 hover:border-brand-400 hover:bg-brand-50/30 text-ink-600 hover:text-brand-700 font-display font-semibold text-small inline-flex items-center justify-center gap-2 transition-colors duration-fast">
          <Icon.plus className="w-4 h-4" /> სერვისის დამატება
        </button>

        {/* Always here — checked or not. See `toggleFree` above for why. */}
        <label className={`flex items-start gap-3 p-4 rounded-card border cursor-pointer transition-colors duration-fast ${
          hasFree ? 'border-brand-200 bg-brand-50/30' : 'border-ink-200 bg-white hover:border-ink-300'
        }`}>
          <input
            type="checkbox"
            checked={hasFree}
            onChange={toggleFree}
            className="mt-0.5 w-5 h-5 shrink-0 accent-brand-600"
          />
          <span className="min-w-0">
            <span className="block font-display text-small font-bold text-ink-900">უფასო {freeIntro.dur}-წუთიანი გაცნობითი შეხვედრა</span>
            <span className="block text-meta text-ink-600 mt-0.5 leading-snug">
              მოკლე უფასო საუბარი, სადაც კლიენტი საკითხს დააზუსტებს — პირველი ჯავშნების მოსაზიდად ყველაზე ეფექტური გზაა.
              {hasFree ? ' თუ არ გჭირდება, მოხსენი მონიშვნა — ნებისმიერ დროს დააბრუნებ.' : ' მონიშნე, თუ გინდა, რომ შესთავაზო.'}
            </span>
          </span>
        </label>
      </div>
      <FieldError name="services" />
    </FormSection>

    {/* ⚠️ THE CALENDAR IS NOT PART OF REGISTERING (2026-08-20) unless something
        on this form can actually be booked. It used to be unconditional, and
        step 2 refused to submit without a published day — so a lawyer selling
        „ხელშეკრულების შედგენა" had to declare a working week for a job that has
        no appointment. Owner: „აქამდე ექსპერტებზე მორგებული იყო, ვინც
        კონსულტაციას ატარებს — შესაცვლელია."
        It is not deferred to „after approval" either: that was the 46% hole
        this picker was built to close. It appears the moment the applicant
        chooses a bookable offering, on the screen where they are already
        deciding when they work. */}
    {anyBookable && <AvailabilityPicker form={form} set={set} />}

    {/* Was: „დამტკიცების შემდეგ პირველი საქმე თავისუფალი დროის გამოქვეყნებაა".
        That sentence described the failure it caused — 46% of booking attempts
        died on „დრო არ არის", because publishing time was a separate job nobody
        did after approval. The calendar is now filled in here, on the screen
        where they are already deciding when they work. */}
    <div className="flex items-start gap-2.5 p-4 rounded-card bg-brand-50/50 border border-brand-200">
      <Icon.bolt className="w-4 h-4 text-brand-700 mt-0.5 shrink-0" />
      <p className="text-meta text-ink-700 leading-[1.55]">{anyBookable
        ? 'დამტკიცებისთანავე ეს დრო გამოქვეყნდება და დაჯავშნა შესაძლებელი გახდება. განრიგს ნებისმიერ დროს შეცვლი — დღეს ან საათს ერთი შეხებით ამოიღებ.'
        : 'დამტკიცებისთანავე შენი სერვისები გამოქვეყნდება და მოთხოვნები დაგიწყებს მოსვლას. ჯავშნადი კონსულტაციას ნებისმიერ დროს დაამატებ — განრიგს მაშინ შეავსებ.'}</p>
    </div>
  </>
  )
}

/* ───── Availability — FULL TIME by default (owner's call 2026-08-07) ─────
 *
 * WHY IT LIVES ON THE PRICE SCREEN, PRE-FILLED. Publishing time used to be a
 * separate job after approval, and the measurement is unambiguous: 46% of
 * booking attempts died on „this expert has no free time". An empty calendar is
 * an expert who cannot be booked, so an empty calendar is the default that must
 * be removed — not the one to ship.
 *
 * AND WHY IT IS STILL A QUESTION, not a silent default: this publishes real
 * bookable hours to real clients under this person's name. Pre-ticked answers
 * the „nobody fills it in" problem; SHOWING it answers the „a client books an
 * hour the expert never agreed to" one. Both matter, and only one of them is a
 * funnel number. */
const AvailabilityPicker = ({ form, set }: { form: FormState; set: (patch: Partial<FormState>) => void }) => {
  const a = form.avail
  const toggleDay = (i: number) => set({ avail: { ...a, days: a.days.map((v, idx) => (idx === i ? !v : v)) } })
  const dayCount = a.days.filter(Boolean).length
  const hours = Math.max(0, a.endHour - a.startHour)
  return (
    <FormSection
      title="როდის ხარ თავისუფალი?"
      required
      fields={['avail']}
      sub="უკვე შევსებულია სამუშაო კვირით — შეცვალე, თუ სხვანაირად მუშაობ. კლიენტი კონკრეტულ საათს ამ შუალედის შიგნით აირჩევს."
    >
      <div data-field="avail">
        <Eyebrow as="span" id="avail-days" tone="muted" className="block mb-2">დღეები</Eyebrow>
        {/* A 7-COLUMN GRID, not wrapping chips. Seven 44px pills plus gaps come
            to 344px against the 342px a 390px phone actually offers, so one day
            wrapped onto a line of its own — a week that doesn't look like a
            week. The grid divides whatever width there is; each cell still
            clears the 40px tap floor down to 320px. */}
        <div className="grid grid-cols-7 gap-1.5" role="group" aria-labelledby="avail-days">
          {DAY_LABELS.map((d, i) => (
            <button
              key={d}
              type="button"
              aria-pressed={a.days[i]}
              onClick={() => toggleDay(i)}
              className={`h-11 w-full rounded-pill border font-display text-small font-bold inline-flex items-center justify-center transition-colors duration-fast motion-safe:active:scale-[0.97] ${
                a.days[i] ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-ink-600 border-ink-200 hover:border-ink-400'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <Field l="დაწყება">
            <select
              value={a.startHour}
              onChange={e => {
                const h = Number(e.target.value)
                // The end follows the start — the schedule page's old picker let
                // them cross and then refused the save, which is the exact
                // friction being removed here.
                set({ avail: { ...a, startHour: h, endHour: Math.max(h + 1, a.endHour) } })
              }}
              className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 tabular-nums focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
            >
              {Array.from({ length: 23 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </Field>
          <Field l="დასრულება">
            <select
              value={a.endHour}
              onChange={e => set({ avail: { ...a, endHour: Number(e.target.value) } })}
              className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 tabular-nums focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
            >
              {Array.from({ length: 24 }, (_, i) => i + 1).filter(h => h > a.startHour).map(h => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
          </Field>
        </div>

        <p className="mt-3 text-meta text-ink-600 leading-[1.5]">
          {dayCount === 0
            ? 'აირჩიე მინიმუმ ერთი დღე — ამის გარეშე დაჯავშნა შეუძლებელია.'
            : <>კვირაში <span className="font-display font-bold text-ink-900 tabular-nums">{dayCount} დღე</span> · დღეში <span className="font-display font-bold text-ink-900 tabular-nums">{hours} საათი</span> · სულ <span className="font-display font-bold text-ink-900 tabular-nums">{dayCount * hours} საათი</span>. თბილისის დროით.</>}
        </p>
        <FieldError name="avail" />
      </div>
    </FormSection>
  )
}

/* ───── Live preview card (right side) ───── */
export const LivePreview = ({ step, form, media }: { step: StepId; form: FormState; media?: MediaState }) => {
  const displayName = `${form.firstName} ${form.lastName}`.trim() || 'შენი სახელი'
  // City and years are no longer asked for during onboarding (they moved to the
  // profile editor), so this line is normally empty. It stays because a
  // „needs revision" resubmit DOES restore both from the prior application —
  // but it must render nothing rather than the placeholders „ქალაქი · გამოცდილება",
  // which promised a card detail the applicant never entered.
  const meta = [form.city.trim(), form.yearsExp ? `${form.yearsExp} წლის გამოცდილება` : ''].filter(Boolean).join(' · ')
  const primaryCat = form.cats[0] || 'კატეგორია'
  const bio = form.motivation.trim() || form.headline.trim() || 'აქ გამოჩნდება შენი მოკლე აღწერა.'
  /* WHAT THE CARD WILL ADVERTISE — the same rule the live card runs
     (components/booking/slots → primaryPriceLabel): the FLOOR of whichever
     shape leads, and a SERVICE leads when they publish one. Resolved here from
     the form rather than imported, because these rows are not `Consultation`
     rows yet — but the RULE has to match, or this preview goes back to being
     the thing it was built to stop being.
     ⚠️ IT USED TO PRINT „₾N / სესია" UNCONDITIONALLY, off the FIRST paid row,
     and the form now defaults to a service (_form.tsx: `bookable: false`) — so
     the preview called every applicant's job an hour, and with two rows it
     quoted whichever they happened to type first. */
  const paidRows = form.services.filter(s => !s.free && s.price > 0)
  const jobs = paidRows.filter(s => !s.bookable)
  const leading = jobs.length ? jobs : paidRows.filter(s => s.bookable)
  const floor = leading.length ? leading.reduce((b, s) => (s.price < b.price ? s : b), leading[0]) : null
  const price = floor?.price ?? 0
  const priceIsFrom = leading.some(s => s.price !== price)
  const priceSuffix = floor ? (floor.bookable ? `${floor.dur} წთ` : 'სერვისი') : ''
  return (
  <aside className="hidden xl:block w-[320px] shrink-0 p-6 border-l border-ink-200 bg-white sticky top-20 self-start xl:h-[836px] overflow-y-auto">
    {/* Was an eyebrow („წინასწარი ხედი") plus a heading („ასე დაინახავენ
        კლიენტები") — two lines naming the same thing above a card that shows
        it. One line, 2026-08-05 (owner's call). */}
    <h3 className="font-display text-body-lg font-bold text-ink-900 tracking-tight mb-4">თქვენი პროფილი</h3>

    <article className="rounded-card border border-ink-200 bg-white shadow-card overflow-hidden transition-shadow duration-fast hover:shadow-float">
      <div className="h-14 bg-gradient-to-br from-brand-100 to-brand-50 border-b border-ink-100" aria-hidden />
      <div className="px-4 pb-4 -mt-8">
        {/* THE PHOTO THEY JUST UPLOADED — not an initial (2026-08-11).
            This card is captioned „თქვენი პროფილი" and sits beside the form as
            the answer to „ასე დაინახავენ კლიენტები". The photo is REQUIRED and
            is uploaded on this very screen, yet the preview always drew a
            letter on a green tile: the applicant added their face and the
            preview kept showing a monogram, which says the photo did not take.
            It is also the single most consequential thing on a real card, so
            previewing everything except it is previewing the wrong card.
            The initial stays as the empty state, where it belongs. */}
        <div className="relative inline-block">
          {media?.photoUrl ? (
            <img
              src={media.photoUrl}
              alt=""
              className="w-16 h-16 rounded-card object-cover ring-4 ring-white shadow-sm bg-ink-100"
            />
          ) : (
            <div className="w-16 h-16 rounded-card bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center ring-4 ring-white shadow-sm font-display text-h2 font-bold text-white">
              {(form.firstName[0] || 'მ').toUpperCase()}
            </div>
          )}
        </div>
        <div className="mt-2.5 min-w-0">
          <div className="flex items-center gap-1.5">
            {/* No VerifiedMark and no status dot here. This is a PREVIEW of the
                applicant's own future card — the badge is granted by a moderator
                and most profiles will not have it, so drawing it promised
                something we hadn't given (and the dot breaks the no-status-dots
                canon besides). */}
            <span className="font-display text-body-lg font-bold text-ink-900 tracking-tight truncate">{displayName}</span>
          </div>
          {meta && <div className="mt-0.5 text-meta text-ink-400 truncate">{meta}</div>}
        </div>

        <div className="mt-2.5 inline-flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 h-[22px] px-2 rounded-pill bg-brand-50 border border-brand-200 text-brand-800 font-display text-micro font-bold uppercase">
            <Icon.award className="w-3 h-3" /> {primaryCat.slice(0, 22)}
          </span>
        </div>

        <p className="mt-2.5 text-small text-ink-700 leading-[1.45] line-clamp-3">{bio}</p>

        <div className="mt-3 pt-3 border-t border-ink-100 flex items-center justify-between text-meta">
          <span className="inline-flex items-center gap-1"><Icon.star aria-hidden className="w-3 h-3 text-warning-500" /><span className="font-display font-bold tabular-nums text-ink-900">—</span><span className="text-ink-400 tabular-nums">(ახალი)</span></span>
          {/* No price yet → say so, never „₾0". The field now starts empty
              (the ₾80 pre-fill was an anchor half the roster accepted), and a
              preview advertising ₾0 would read as a free session. */}
          {price > 0
            ? <span className="font-display text-body-lg font-bold text-ink-900 tabular-nums">₾{price}{priceIsFrom ? '-დან' : ''}<span className="text-meta font-medium text-ink-500"> · {priceSuffix}</span></span>
            : <span className="font-display text-body-lg font-bold text-ink-400">ფასი — შენ ადგენ</span>}
        </div>
        <div aria-hidden className="mt-3 w-full h-9 rounded-btn bg-brand-600 text-white font-display font-semibold text-meta tracking-wide inline-flex items-center justify-center gap-1.5 select-none cursor-default shadow-xs" title="ნიმუში — ასე გამოიყურება ჯავშნის ღილაკი"><Icon.cal className="w-3.5 h-3.5" /> დაჯავშნე (ნიმუში)</div>
      </div>
    </article>

    {/* The per-step „რჩევა" box was removed 2026-08-05 (owner's call). Advice
        that sits beside the form on every step is one more thing to read on the
        screen that already loses half the applicants; what each field needs is
        said by the field itself. */}
  </aside>
  )
}
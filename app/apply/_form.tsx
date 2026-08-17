'use client'
// /apply — the form model: the two-step shape, the FormState it fills, its
// defaults, and the local checks.
//
// ONE source for every bound and every message — the API imports the same
// functions. See lib/applyValidation.ts for why that file exists.

import { Icon } from '@/components/Icon'
import { APPLY } from '@/lib/applyValidation'

/* ───── Steps ───── */
/* Onboarding was 5 steps (6 screens) asking for phone, city, languages, years,
 * LinkedIn, website, an intro video, certificates AND a per-profession block
 * (bar-licence number, licence ID, AUM, ROAS, exit count, GitHub…). Those
 * profession fields were technically optional, but a field labelled „Bar
 * ლიცენზიის ნომერი" reads as a REQUIREMENT and turned applicants away.
 *
 * It is now 2 screens: who you are + what you charge. Everything else moved to
 * the profile editor (app/tutor/profile), which the expert reaches AFTER being
 * approved — at which point they are invested and will actually fill it in.
 * Nothing was deleted from the product; it was re-sequenced.
 *
 * ONE thing came back (2026-07-29) without growing the screen count: an OPTIONAL
 * diploma/certificate attachment, on the existing review step. It is not the
 * hostile half of the old block — there is no profession-specific label and no
 * licence NUMBER to type — and it is the only material a moderator can actually
 * verify, which is what lets the review copy make any verification claim at all.
 * See MAX_CERTS / CertificateUploader below. */
/* TWO screens since 2026-08-07 (owner's call), not three.
 *
 * The third step was „გაგზავნა": a review header, an optional diploma
 * uploader, two optional link fields and an info box — then the button. None of
 * it was work the applicant had to do; it was a screen standing between them
 * and finishing, and every screen on this form loses people. What was real (the
 * attachment, the links) moved onto step 1 as COLLAPSED optional blocks, so the
 * page no longer looks like homework, and „გაგზავნა" now lives at the bottom of
 * step 2 where the last decision (price, availability) is made. */
export type StepId = 1 | 2
/* One word per step, no second line (2026-08-05, owner's call).
 *
 * Each step used to carry a description under its name — „სახელი, სფერო,
 * აღწერა" and so on. A progress rail answers one question: where am I. The
 * screen beside it already says what to fill in, and a rail that explains the
 * form is a second form to read. */
export const STEPS: { id: StepId; l: string; icon: any }[] = [
  { id: 1, l: 'პროფილი', icon: Icon.user },
  { id: 2, l: 'ფასი და დრო', icon: Icon.wallet },
]

/* ───── Where an error is SAID ─────
 *
 * A single red box at the bottom of the form (which is all this had) tells the
 * applicant that something is wrong, then makes them find it. The box stays —
 * it sits directly above „შემდეგი", which is where the eye already is — but the
 * sentence must ALSO appear under the control that refused, because that is
 * where the applicant will be after the jump.
 *
 * Context rather than props: `Field` is used ~15 times across three step
 * components, and threading an error object through every one of them is how
 * the next field gets added without one. */
export type ApplyErr = { field: string; msg: string } | null

/* ───── Upload plumbing ───── */
// Media captured during apply. Kept OUT of the localStorage draft (base64 data
// URLs would blow the ~5MB quota) — merged into the submit body directly.
export type MediaState = {
  idDocUrl?: string
  selfieUrl?: string
  photoUrl?: string
  certificates: { title: string; issuer?: string; url: string }[]
}

/* ───── Form State ───── */

export type FormState = {
  firstName: string; lastName: string; email: string; phone: string
  /** The SPHERE, as a one-element array. Derived from `professions` since
   *  2026-08-11 — see MAX_CATS. Kept an array so `cats[0]` stays the submit
   *  contract and nothing downstream had to change. */
  cats: string[]
  /** What the applicant IS — „ბუღალტერი", „მარკეტოლოგი". Several allowed
   *  (lib/professions → MAX_PROFESSIONS); the sphere is read off the first. */
  professions: string[]
  /** „ჩემი სფერო სიაში არ არის" — the applicant's own words. See OTHER_CAT_MAX. */
  otherCat: string
  headline: string; motivation: string; city: string; yearsExp: string; linkedin: string; website: string
  introVideoUrl: string
  languages: string[]
  services: { name: string; dur: number; price: number; free: boolean; desc: string }[]
  /** Weekly availability, published on approval. Mon=0 … Sun=6. */
  avail: { days: boolean[]; startHour: number; endHour: number }
  professionData: Record<string, any>
}

/** Mon=0 … Sun=6 — the same convention as the schedule grid and the bulk API. */
export const DAY_LABELS = ['ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ', 'კვი']
/** FULL TIME, pre-filled. See <AvailabilityPicker> for the reasoning. */
export const DEFAULT_AVAIL = { days: [true, true, true, true, true, false, false], startHour: 10, endHour: 18 }
/** How far ahead approval opens the calendar. */
export const AVAIL_WEEKS = 8
/* The free 15-minute intro, defined ONCE. It is a toggle on step 2 (see
 * `toggleFree`), so the form has to be able to rebuild it after it is switched
 * off — which is exactly what it could not do while this object existed only
 * as a literal inside INITIAL_FORM. */
export const FREE_INTRO: FormState['services'][number] = {
  name: 'გაცნობითი შეხვედრა',
  dur: 15,
  price: 0,
  free: true,
  desc: 'გაესაუბრე ექსპერტს მოკლედ და დარწმუნდი, რომ სწორ სპეციალისტს ირჩევ.',
}

export const INITIAL_FORM: FormState = {
  firstName: '', lastName: '', email: '', phone: '',
  cats: [], professions: [], otherCat: '', headline: '', motivation: '', city: '', yearsExp: '', linkedin: '', website: '',
  introVideoUrl: '',
  languages: ['ქართული'],
  services: [
    // ONE paid hour is the product. Three pre-filled paid services made this
    // screen read as homework and pushed the expert to price a catalogue before
    // they had a single client. The second row is a FREE 15-min intro: optional,
    // and the honest way for a new expert to earn their first booking — so it
    // ships pre-filled but free, not as another price to think about.
    // COPY PATTERN, from how Georgian service sites actually write (researched
    // 2026-07-31: ekimo.ge, tnet.ge, mindflow.ge, tbcbank.ge). Their service
    // cards are: a NOUN PHRASE that names the service, then ONE imperative
    // sentence addressed to the user carrying a concrete benefit —
    // „სატელეფონო კონსულტაცია / გაესაუბრე ექიმს დისტანციურად, სახლიდან ან
    // სამსახურიდან გაუსვლელად და დაზოგე დრო". Never the provider speaking in
    // the first person, never a dash-joke. The line this replaced („გაიგებ,
    // ერთმანეთს თუ შეეფერებით", then „შენს საკითხს ვიღებ თუ არა") did both.
    // PRICE STARTS EMPTY, not at 80 — measured 2026-08-02: 10 of 19 live
    // profiles carry exactly ₾80, the number this field used to pre-fill, and
    // 11 of the paid services do too. That is not a market forming a price, it
    // is a form being accepted. A pre-filled number is an anchor, and half the
    // roster never argued with it — which also priced the budget end of the
    // market out of existence before it could appear. Zero renders as an empty
    // input (see PriceField), so the expert has to make the decision the field
    // is asking for; validation already refuses anything under ₾10.
    { name: 'კონსულტაცია', dur: 60, price: 0, free: false, desc: 'დასვი შენი კითხვა და ერთ საათში მიიღე კონკრეტული ნაბიჯები.' },
    { ...FREE_INTRO },
  ],
  avail: { ...DEFAULT_AVAIL, days: [...DEFAULT_AVAIL.days] },
  professionData: {},
}

export type StepProps = {
  form: FormState
  set: (patch: Partial<FormState>) => void
  media?: MediaState
  setMedia?: (patch: Partial<MediaState>) => void
  // Long steps (2, 4) render in two shorter screens — `part` picks which half.
  part?: StepPart
}

/* Multi-part steps are gone with the long steps that needed them. The type and
 * `partsOf` stay so the footer/validation signatures don't have to change; both
 * are now constant-1. */
export type StepPart = 1 | 2
const STEP_PARTS: Partial<Record<StepId, number>> = {}
export const partsOf = (s: StepId) => STEP_PARTS[s] ?? 1

/* ───── Per-step validation helpers ───── */
/** API field name → this form's `data-field` anchor. The API speaks in DB
 *  columns („fullName", „hourlyRate"); the form has two name inputs and a
 *  services block, so the two vocabularies have to be mapped, not assumed. */
export const SERVER_FIELD: Record<string, string> = {
  fullName: 'firstName',
  specialty: 'cats',
  motivation: 'motivation',
  hourlyRate: 'services',
  yearsExp: 'yearsExp',
  phone: 'phone',
  city: 'city',
  linkedinUrl: 'linkedin',
  websiteUrl: 'website',
  introVideoUrl: 'introVideoUrl',
  certificates: 'certificates',
}

/* Bio floor. Was 150 — roughly a full paragraph in Georgian, and the last hard
 * gate before the finish line. The server has only ever required 20; 40 keeps
 * the public profile from reading as empty without turning the form into an
 * essay. Both validators below read this, so there is one number to change. */
/**
 * ONE sphere. Not „1–3".
 *
 * The step asked for up to three directions from the day it was written, and
 * the platform could never keep more than one — this is measured, not a
 * preference:
 *
 *   • `TutorProfile.categoryId` is a single column. There is nowhere to put a
 *     second category.
 *   • the submit body carries `specialty = form.cats[0]` and NOT the array, so
 *     the second and third answers were discarded in the browser and never
 *     reached the server at all.
 *   • the review screen printed `form.cats.join(', ')` — so the last thing an
 *     applicant read before pressing send was a confirmation of two choices
 *     that were about to be thrown away.
 *
 * A form must not ask for what it cannot keep. Asking once, and letting the
 * answer be as precise as the applicant likes (a sphere, or one of the
 * sub-fields inside it), says the same thing honestly and removes the „which of
 * my three is the main one" question with it.
 *
 * `validateStep` still checks the bound so a draft saved before 2026-08-11
 * cannot carry three past the gate; the draft loader trims those to their
 * first entry, so nobody is blocked by a form they filled in yesterday.
 */
export const MAX_CATS = 1

/**
 * „ჩემი სფერო სიაში არ არის" — RESTORED 2026-08-11, wired differently.
 *
 * THE VERSION THAT WAS DELETED (2026-08-05) DESERVED IT. It stored the typed
 * value only when NO chip was picked, so 7 of the 8 people who used it had
 * their answer thrown away in the browser; and what the one surviving entry
 * showed was somebody retyping a category that already existed. Both true.
 *
 * But removing it closed the only door a NEW field can come through. The step-1
 * gate requires `cats.length >= 1`, so today a dietician, an architect or a
 * customs consultant literally cannot submit the form: they pick the nearest
 * wrong chip, or they leave. Neither outcome reaches anyone who could act on it.
 *
 * Three things are different now, and each one answers a specific failure of
 * the old field:
 *
 *   1. IT IS ALWAYS STORED (professionData.requestedCategory), chip or no chip.
 *      That was the actual bug — not the field's existence.
 *   2. IT SATISFIES THE GATE. Typing here is a complete answer: `specialty`
 *      falls back to it and the application submits. Nobody has to lie to pass.
 *   3. IT IS BEHIND A LINK, not a second input under the chips. The old one sat
 *      open beside the wall of chips and invited „IT" to be typed instead of
 *      tapped. You have to go looking for this one, which is the right amount of
 *      friction for the rarer answer.
 *
 * The moderator sees it on the application (the approve-time category select is
 * where it turns into a real category) and the admin sees the aggregate, so the
 * taxonomy grows from what people asked for instead of from guesswork.
 */
export const OTHER_CAT_MAX = APPLY.OTHER_CAT_MAX

export const MIN_BIO = APPLY.BIO_MIN
export const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
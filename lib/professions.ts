/**
 * WHAT AN EXPERT CALLS THEMSELVES — 17 spheres, 96 professions.
 *
 * The owner's list (კატეგორიები.docx, 2026-08-11), transcribed. It is the
 * SECOND level of the taxonomy and it replaced a level made of FIELD nouns
 * („ფინანსები", „კრიპტო", „გაყიდვები") with PERSON nouns („ბუღალტერი",
 * „ადვოკატი", „მარკეტოლოგი").
 *
 * WHY THAT MATTERS. The site already speaks person-nouns to CLIENTS — every
 * /konsultacia/<profession> landing page is one („ბუღალტერი", „იურისტი",
 * „ფსიქოლოგი"), because that is how people search. Only the expert-facing side
 * asked for a field. Now both sides use the same word.
 *
 * MULTIPLE, AND THAT IS THE POINT (owner, 2026-08-11): „მარკეტოლოგმა იცის
 * დიზაინი და რეკლამირებაც". One person is several professions inside one
 * sphere, and a form that allows only one makes them under-describe themselves.
 * So `TutorProfile.professions` is an array, while `categoryId` stays single —
 * see the note on the SPHERE below.
 *
 * KEYED BY SLUG, never by name. A sphere's `name` is copy the admin owns and
 * renames („ტექნოლოგია და პროდუქტი" → „IT და ტექნოლოგიები" on the day this
 * file landed); its `slug` is the identifier and never moves. Keying on the
 * name would have broken this file on its first rename.
 *
 * THE SPHERE IS STILL SINGLE, and derived rather than asked for. `categoryId`
 * drives browse, the filter (/experts?category=), the counts and the SEO — one
 * column, one sphere. The applicant picks professions; `sphereOfProfessions`
 * reads the sphere off the first one. Nothing downstream changed.
 *
 * WHAT A PROFESSION CAN DO (stage 8, 2026-08-19): `PROFESSION_CAN` marks each
 * one CONSULT (a conversation — every profession) and, for a short obvious
 * list, WORK as well (a delivered job: a designer draws the logo, a
 * photographer shoots the wedding). ⚠️ WORK for an expert profession is DATA
 * ONLY today — nothing routes on it yet; it is what stage 9+ and /join will
 * read when the expert side learns to take PROJECT work. Default is CONSULT.
 *
 * Adding a profession: add it here. Nothing else needs to know.
 * Pinned by tests/professions.test.ts and tests/taxonomy.test.ts.
 */

/** slug → the professions that belong to that sphere, in the owner's order. */
export const PROFESSIONS: Record<string, readonly string[]> = {
  'business': [
    'ბიზნეს-კონსულტანტი',
    'სტრატეგი',
    'მეწარმე',
    'ოპერაციების მენეჯერი',
    'პროექტის მენეჯერი',
    'კარიერული კონსულტანტი',
    'HR-მენეჯერი',
    'ბიზნეს-ტრენერი',
  ],
  'tax': [
    'ბუღალტერი',
    'საგადასახადო კონსულტანტი',
    'აუდიტორი',
    'ფინანსური ანალიტიკოსი',
    'ფინანსური დირექტორი',
    'საინვესტიციო კონსულტანტი',
    'კრიპტოს კონსულტანტი',
  ],
  'law': [
    'ადვოკატი',
    'იურისტი',
    'კორპორატიული იურისტი',
    'შრომითი სამართლის სპეციალისტი',
    'საოჯახო სამართლის სპეციალისტი',
    'ინტელექტუალური საკუთრების იურისტი',
    'მედიატორი',
    'ნოტარიუსი',
  ],
  'marketing': [
    'მარკეტოლოგი',
    'SEO სპეციალისტი',
    'SMM სპეციალისტი',
    'რეკლამის სპეციალისტი',
    'ბრენდ-სტრატეგი',
    'კონტენტ-მარკეტოლოგი',
    'გაყიდვების მენეჯერი',
    'PR სპეციალისტი',
    'გრაფიკული დიზაინერი',
  ],
  'it': [
    'დეველოპერი',
    'AI ინჟინერი',
    'მონაცემთა ანალიტიკოსი',
    'პროდაქტ-მენეჯერი',
    'UX/UI დიზაინერი',
    'DevOps ინჟინერი',
    'QA ინჟინერი',
    'კიბერუსაფრთხოების სპეციალისტი',
    'სისტემური ადმინისტრატორი',
  ],
  'psychology': [
    'ფსიქოლოგი',
    'ფსიქოთერაპევტი',
    'წყვილისა და ოჯახის კონსულტანტი',
    'ბავშვისა და მოზარდის ფსიქოლოგი',
    'ორგანიზაციული ფსიქოლოგი',
  ],
  'real-estate': [
    'უძრავი ქონების ბროკერი',
    'შემფასებელი',
    'უძრავი ქონების იურისტი',
    'ინვესტიციების კონსულტანტი',
    'ქონების მართვის მენეჯერი',
  ],
  'architecture': [
    'არქიტექტორი',
    'ინტერიერის დიზაინერი',
    'სამშენებლო ინჟინერი',
    'ხარჯთაღრიცხვის სპეციალისტი',
    'ლანდშაფტის არქიტექტორი',
  ],
  'relocation': [
    'საიმიგრაციო იურისტი',
    'რელოკაციის კონსულტანტი',
    'საგადასახადო რეზიდენტობის კონსულტანტი',
    'საზღვარგარეთ სწავლის კონსულტანტი',
  ],
  'grants': [
    'გრანტების კონსულტანტი',
    'ტენდერების სპეციალისტი',
    'ბიზნესგეგმის სპეციალისტი',
    'საერთაშორისო პროგრამების კონსულტანტი',
  ],
  'logistics': [
    'ლოგისტიკის სპეციალისტი',
    'საბაჟო ბროკერი',
    'ექსპორტ-იმპორტის კონსულტანტი',
    'მიწოდების ჯაჭვის მენეჯერი',
  ],
  'media': [
    'ფოტოგრაფი',
    'ვიდეოგრაფი',
    'მონტაჟის სპეციალისტი',
    'თარჯიმანი',
    'კოპირაითერი',
    'ჟურნალისტი',
    'პოდკასტის პროდიუსერი',
  ],
  'tourism': [
    'ტურ-ოპერატორი',
    'გიდი',
    'სასტუმროს მენეჯერი',
    'ღონისძიების ორგანიზატორი',
    'რესტორნის მენეჯერი',
  ],
  'agriculture': [
    'აგრონომი',
    'ვეტერინარი',
    'მეღვინე და ენოლოგი',
    'მეცხოველეობის სპეციალისტი',
    'აგროპროგრამების კონსულტანტი',
  ],
  'health': [
    'დიეტოლოგი',
    'ნუტრიციოლოგი',
    'ფიტნეს-ტრენერი',
    'იოგისა და პილატესის ინსტრუქტორი',
  ],
  'medicine': [
    'ოჯახის ექიმი',
    'პედიატრი',
  ],
  // ⚠️ THE THIRD FORM OF THE SAME PROMISE (owner, 2026-08-20): „მცოდნე" is
  // whoever KNOWS, and knowing has three shapes — სწავლება gives you a SKILL,
  // კონსულტაცია gives you an UNDERSTANDING, სერვისი gives you a RESULT.
  // „სამივე მცოდნეა."
  //
  // Teaching sits in THIS file, and not with the trades, because of how it is
  // BOUGHT: you book an hour. That makes a teacher a TutorProfile with a
  // calendar — mechanically the same purchase as a consultation — so the sphere
  // belongs in the expert taxonomy. (`REQUEST_KINDS` has carried `LEARNING`
  // since the requests vertical; lib/requestTopics already groups it into
  // school · exams · languages · higher · digital · arts · sport. That is the
  // INTAKE vocabulary for somebody describing a need; this is the list a
  // teacher picks from when they register. The two are not duplicates.)
  //
  // ⚠️ WHY „X-ის მასწავლებელი" AND NOT „რეპეტიტორი". „რეპეტიტორი" is retired in
  // UI copy (CLAUDE.md) and 2026-08-11-open-new-spheres refused this sphere
  // partly on that ground. The word is what was banned, not the work: these are
  // profession NAMES, which the same canon explicitly allows („a profession NAME
  // like „IT სპეციალისტი" is fine"), while the ROLE word on every screen stays
  // „ექსპერტი". Nothing here calls anybody a რეპეტიტორი.
  //
  // ⚠️ AND THE FIVE ARE PERSON-NOUNS, which is this file's founding rule — it
  // exists because the level above it was made of FIELD nouns („ფინანსები") and
  // was replaced with people („ბუღალტერი"). The owner's launch list writes two
  // of them as subjects („ეროვნული გამოცდები", „ქართული ენა და ლიტერატურა");
  // written that way they would reintroduce exactly the mixture this file was
  // created to remove, so they are named for the person who does the work.
  // The SUBJECT is not lost — it is the searchable half of each name.
  'swavleba': [
    'ინგლისურის მასწავლებელი',
    'მათემატიკის მასწავლებელი',
    'ეროვნული გამოცდების მასწავლებელი',
    'ქართული ენისა და ლიტერატურის მასწავლებელი',
    'პროგრამირების მასწავლებელი',
  ],
}

/** Every profession, flat, with the sphere slug it belongs to. */
export const ALL_PROFESSIONS: readonly { job: string; slug: string }[] =
  Object.entries(PROFESSIONS).flatMap(([slug, jobs]) => jobs.map(job => ({ job, slug })))

/** The sphere slug a profession belongs to, or undefined if we do not know it. */
export function sphereOfProfession(job: string): string | undefined {
  const hit = ALL_PROFESSIONS.find(p => p.job === job)
  return hit?.slug
}

/**
 * The ONE sphere a set of professions resolves to.
 *
 * First match wins, deliberately: the applicant's first answer is the one they
 * led with, and picking across spheres is legitimate but rare (a lawyer who is
 * also an accountant). The picker says which sphere it settled on rather than
 * choosing silently, so the person can reorder if it guessed wrong.
 */
export function sphereOfProfessions(jobs: readonly string[]): string | undefined {
  for (const j of jobs) { const s = sphereOfProfession(j); if (s) return s }
  return undefined
}

/* ═══════════ what a profession can do ══════════════════════════════════ */

/** Mirrors lib/capabilities → Capability, restated here so this file stays a
 *  leaf a client component can import (capabilities.ts pulls in prisma). */
export type ProfessionCapability = 'CONSULT' | 'WORK'

/**
 * The professions that plausibly DELIVER something as well as advise. Kept
 * short and obvious on purpose — a claim that everybody does jobs is no claim.
 * ⚠️ Not routed anywhere yet (see the header): stage 9+ / join data.
 */
const ALSO_WORKS: readonly string[] = [
  'ბუღალტერი',
  'გრაფიკული დიზაინერი',
  'UX/UI დიზაინერი',
  'დეველოპერი',
  'ფოტოგრაფი',
  'ვიდეოგრაფი',
  'მონტაჟის სპეციალისტი',
  'თარჯიმანი',
  'კოპირაითერი',
  'ინტერიერის დიზაინერი',
  'არქიტექტორი',
  'SMM სპეციალისტი',
]

/** job → what it can do. Every profession is present; default `['CONSULT']`. */
export const PROFESSION_CAN: Record<string, readonly ProfessionCapability[]> = Object.fromEntries(
  ALL_PROFESSIONS.map(p => [p.job, ALSO_WORKS.includes(p.job) ? ['CONSULT', 'WORK'] : ['CONSULT']]),
)

/** What one profession can do; an unknown job can only consult. */
export function professionCan(job: string): readonly ProfessionCapability[] {
  return PROFESSION_CAN[job] ?? ['CONSULT']
}

/** Every profession that can do `cap`, in the owner's order. */
export function professionsThatCan(cap: ProfessionCapability): string[] {
  return ALL_PROFESSIONS.filter(p => professionCan(p.job).includes(cap)).map(p => p.job)
}

/** How many professions one expert may claim. Not a technical limit — a claim
 *  to twelve trades is not a claim, and the profile has room for a handful. */
export const MAX_PROFESSIONS = 5

/**
 * WHAT AN EXPERT CALLS THEMSELVES — 16 spheres, 91 professions.
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
 * drives browse, the filter, /categories/*, the counts and the SEO — one
 * column, one sphere. The applicant picks professions; `sphereOfProfessions`
 * reads the sphere off the first one. Nothing downstream changed.
 *
 * Adding a profession: add it here. Nothing else needs to know.
 * Pinned by tests/professions.test.ts.
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

/** How many professions one expert may claim. Not a technical limit — a claim
 *  to twelve trades is not a claim, and the profile has room for a handful. */
export const MAX_PROFESSIONS = 5

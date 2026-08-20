// ტალღა 1 — WHAT THE SITE OFFERS AT LAUNCH, and in whose order.
//
// ⚠️ THIS IS THE OWNER'S OWN LIST, handed over on 2026-08-20, and it is the
// first taxonomy on this site that is not a consulting directory:
//
//   „მცოდნე" = ვინც იცის. და ცოდნას სამი ფორმა აქვს —
//        სწავლება    გასწავლის    უნარს
//        კონსულტაცია გირჩევს      გაგებას
//        სერვისი     გაგიკეთებს   შედეგს
//   „სამივე მცოდნეა. სანტექნიკოსი, რომელმაც იცის რატომ ჟონავს მილი, ისეთივე
//    მცოდნეა, როგორც იურისტი. ეს არ არის სამი პროდუქტი — ეს ერთი დაპირების
//    სამი ფორმაა."
//
// ⚠️ IT IS A LAUNCH SET, NOT A DELETION. Owner: „ეტაპობრივი სია. მცირედით
// იწყება, მოთხოვნის მიხედვით იზრდება." The other fourteen spheres and their
// professions stay exactly where they are in lib/professions — twenty-six
// experts are already filed under them and nobody is being re-filed. What this
// list decides is what a NEW applicant meets FIRST, which is the thing the
// owner kept sending back: „ახლებს უნდა დავახვედროთ უკვე გამოსწორებული
// ვარიანტი."
//
// ⚠️ SEVEN SLUGS, NOT THE SIX THE LIST NAMES. The handover wrote seven and then
// struck one out — „კი მაგრამ sayofacxovrebo არ გვინდა" — leaving three service
// professions with no home and the question „როგორ მირჩევ დარჩენით უნდა
// დარჩეს" open. Cleaning and furniture are not repair, so they are not filed
// under „სახლის რემონტი"; they get `dalageba`, a name that says what they are.
//
// ⚠️ AND THE SERVICE HALF COMES FIRST IN EVERY LIST BUT THIS ONE. This array is
// in the owner's own order (teaching, then consulting, then services) because
// it is a record of what they handed over. Anywhere the two are RENDERED
// together, CLAUDE.md's rule 4 applies and the service arrives first.

/** slug → the launch category, in the order the owner listed them. */
export const LAUNCH_CATEGORIES = [
  { slug: 'swavleba',   name: 'სწავლება',                  side: 'LEARN' },
  { slug: 'tax',        name: 'ბუღალტერია და გადასახადები', side: 'CONSULT' },
  { slug: 'law',        name: 'სამართალი',                  side: 'CONSULT' },
  { slug: 'psychology', name: 'ფსიქოლოგია',                side: 'CONSULT' },
  { slug: 'business',   name: 'ბიზნესი',                    side: 'CONSULT' },
  { slug: 'remonti',    name: 'სახლის რემონტი',            side: 'WORK' },
  // ⚠️ „დალაგება და გადაზიდვა" IS DELIBERATELY ABSENT — owner, 2026-08-20,
  // asked for it by name and then removed it the same afternoon: „კი მაგრამ
  // saqofacxovrebo არ გვინდა." It is the same bucket under a tidier label, so
  // renaming it would have kept the thing that was refused.
  //
  // ⚠️ AND THE REQUESTS SIDE IS NOT TOUCHED BY THAT. `cleaning` and `moving`
  // stay in LIVE_SERVICE_GROUP_IDS (lib/requestTopics), which was set the same
  // morning with its own owner quote — „სერვისებსაც, რაც ყოველდღიურად
  // სჭირდება — დალაგება და ხელოსანი, ესეც". A LAUNCH CATEGORY and an INTAKE
  // VOCABULARY are two different surfaces: somebody may still describe a
  // cleaning job through /request; nobody is invited to REGISTER as one yet.
  // Switching those groups off is a separate decision and a separate file.
] as const

export type LaunchSide = (typeof LAUNCH_CATEGORIES)[number]['side']

/** Just the slugs — the shape most callers want. */
export const LAUNCH_SLUGS: readonly string[] = LAUNCH_CATEGORIES.map(c => c.slug)

/** Is this sphere part of ტალღა 1? Everything else is „სხვა კატეგორიები". */
export function isLaunchCategory(slug: string | null | undefined): boolean {
  return !!slug && LAUNCH_SLUGS.includes(slug)
}

/**
 * The launch set first, in the owner's order; everything else after, in its
 * own. Used by anything that OFFERS the taxonomy to somebody — the ordering is
 * the whole mechanism, so nothing is hidden and nothing needs a second list.
 */
export function launchFirst<T extends { slug: string }>(rows: readonly T[]): T[] {
  const rank = new Map(LAUNCH_SLUGS.map((s, i) => [s, i]))
  return [...rows].sort((a, b) => {
    const ra = rank.get(a.slug) ?? Number.MAX_SAFE_INTEGER
    const rb = rank.get(b.slug) ?? Number.MAX_SAFE_INTEGER
    return ra - rb
  })
}

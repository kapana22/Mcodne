// Shared profile-completeness scoring — single source of truth for the
// weighted checklist used by components/ProfileCompleteness (client) and
// /api/work/nav-badges (server, sidebar hint). Weights sum to 100.
//
// ⚠️ REWRITTEN FOR THE ONE PROFILE (2026-08-24). Three of the ten checks
// described the consultation product and are gone: „დააფიქსირე კონსულტაციის
// ფასი" (the flat session rate), „დაამატე თავისუფალი დრო" (the availability
// window — it carried the HIGHEST weight, 15, because booking was slot-gated
// and an expert with no slots was unbookable), and „მიუთითე სპეციალობა" (a
// frozen copy of the category name).
//
// What replaces them is what actually decides whether this profile can be sold
// from: the services they list, a price against at least one of them, and the
// city they work in. Those three are also exactly what routing matches on
// (lib/serviceProfile → routingWhere), so a profile that scores 100 here is a
// profile a request can reach.

export type ProfileForCompleteness = {
  headline?: string | null
  about?: string | null
  services?: string[] | null
  areas?: string[] | null
  priceList?: unknown
  languages?: string[] | null
  /** When they last saved the list — null means they never have. See the column
   *  note in prisma/schema: the migration seeded it FOR them. */
  servicesConfirmedAt?: Date | string | null
} | null

type ProfileCheck = {
  id: string
  label: string
  done: boolean
  weight: number
  anchor: string
}

/** Is there a price against at least one ticked service? The same question
 *  lib/creditsServer asks before paying the SERVICE task — one rule, so the
 *  bonus and the checklist can never disagree about what „priced" means. */
const hasPricedService = (priceList: unknown): boolean =>
  !!priceList && typeof priceList === 'object' && !Array.isArray(priceList) &&
  Object.values(priceList as Record<string, unknown>).some(v => typeof v === 'number' && v > 0)

/**
 * ⚠️ THREE ARGUMENTS LEFT THIS SIGNATURE ON 2026-08-29 — `certificates`,
 * `education` and `experience`, worth 8 points each. They scored a CV, and the
 * owner's ruling on the editor that filled it was that a CV is not what this
 * site sells: „რითი დაგიჯერებს აღარ გვჭირდება, ეს ხომ სერვისებს ყიდის."
 * Measured the same day on 29 live providers: 4 had a certificate, 8 an
 * education row, 5 a job — so the checklist was also telling four fifths of the
 * supply side they were unfinished for not having written a résumé.
 *
 * Their 24 points went to what a client actually reads on the card: the
 * paragraph (17 → 25), the headline (14 → 20) and the photo (10 → 18).
 */
export const buildProfileChecks = (
  profile: ProfileForCompleteness,
  avatarUrl?: string | null,
): ProfileCheck[] => {
  const headline = (profile?.headline ?? '').trim()
  const about = (profile?.about ?? '').trim()
  const services = Array.isArray(profile?.services) ? profile!.services! : []
  const languages = Array.isArray(profile?.languages) ? profile!.languages! : []
  const servicesConfirmed = !!profile?.servicesConfirmedAt

  // Weights sum to exactly 100:
  //   15 + 12 + 25 + 20 + 18 + 10 = 100
  // `services` carries the highest weight for the reason `availability` used
  // to: a profile with nothing listed is unreachable by routing, however
  // polished the rest of it is.
  //
  // ⚠️ „აირჩიე ქალაქი" WAS A CHECK AND IT WAS WORTH 8 (removed 2026-08-29).
  // `CITIES` holds one city, so it scored a choice nobody has: /work/services
  // stopped drawing the block and the PUT now fills it in, which would have
  // made this 8 points that arrive on their own and say nothing about whether
  // a profile is worth reading. Its weight went to the two fields a client
  // actually reads — `bio` 13 → 17 and `headline` 10 → 14 — rather than to the
  // two that were already the highest. Restore the check, at whatever it is
  // then worth, on the day a second city opens.
  return [
    // ⚠️ „HAS ONE" IS NOT THE QUESTION ANY MORE (2026-08-25). Every migrated
    // provider has four to eight, because the migration seeded their whole
    // sphere — so this check read DONE for exactly the people whose list is
    // least likely to be true. What has to be asked is whether they have ever
    // LOOKED at it; `servicesConfirmedAt` is stamped by the save on
    // /work/services and is null until then.
    { id: 'services',    label: servicesConfirmed ? 'აირჩიე სერვისი, რომელსაც ყიდი' : 'გადახედე სერვისების სიას — ჩვენ შევავსეთ',
      done: services.length >= 1 && servicesConfirmed, weight: 15, anchor: '/work/services' },
    { id: 'price',       label: 'დაწერე ფასი ერთ სერვისს მაინც',       done: hasPricedService(profile?.priceList), weight: 12, anchor: '/work/services' },
    { id: 'bio',         label: 'დაწერე აღწერა (მინ. 100 სიმბოლო)',     done: about.length >= 100,           weight: 25, anchor: '#section-public-profile' },
    { id: 'headline',    label: 'დაწერე მოკლე სათაური (მინ. 20 სიმბოლო)', done: headline.length >= 20,       weight: 20, anchor: '#section-public-profile' },
    { id: 'avatar',      label: 'ატვირთე პროფილის ფოტო',                done: !!avatarUrl,                   weight: 18, anchor: '#section-avatar' },
    { id: 'languages',   label: 'აირჩიე მინ. ერთი ენა',                 done: languages.length >= 1,         weight: 10,  anchor: '#section-public-profile' },
  ]
}

export const profilePercent = (checks: ProfileCheck[]): number => {
  const total = checks.reduce((sum, c) => sum + (c.done ? c.weight : 0), 0)
  return Math.min(100, Math.max(0, total))
}

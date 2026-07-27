// Shared profile-completeness scoring — single source of truth for the
// weighted 10-check score used by components/ProfileCompleteness (client)
// and /api/tutor/nav-badges (server, sidebar hint). Weights sum to 100.
//
// The `availability` check (published free time) carries the highest weight:
// booking is slot-gated, so an expert with zero upcoming slots is unbookable
// no matter how polished the rest of the profile is.

export type ProfileForCompleteness = {
  headline?: string | null
  bio?: string | null
  specialty?: string | null
  price?: number | null
  languages?: string[] | null
} | null

export type ProfileCheck = {
  id: string
  label: string
  done: boolean
  weight: number
  anchor: string
}

export const buildProfileChecks = (
  profile: ProfileForCompleteness,
  certificates: number,
  education: number,
  experience: number,
  avatarUrl?: string | null,
  slotCount = 0,
): ProfileCheck[] => {
  const headline = (profile?.headline ?? '').trim()
  const bio = (profile?.bio ?? '').trim()
  const specialty = (profile?.specialty ?? '').trim()
  const price = Number(profile?.price ?? 0)
  const languages = Array.isArray(profile?.languages) ? profile!.languages! : []

  // Weights sum to exactly 100:
  //   10 + 13 + 8 + 10 + 10 + 10 + 8 + 8 + 8 + 15 = 100
  // `availability` anchors to a full ROUTE (/tutor/schedule), not a #section
  // on the profile page — ProfileCompleteness routes to it instead of scrolling.
  return [
    { id: 'headline',    label: 'დაწერე მოკლე სათაური (მინ. 20 სიმბოლო)', done: headline.length >= 20, weight: 10, anchor: '#section-public-profile' },
    { id: 'bio',         label: 'დაწერე ბიოგრაფია (მინ. 100 სიმბოლო)',      done: bio.length >= 100,     weight: 13, anchor: '#section-public-profile' },
    { id: 'specialty',   label: 'მიუთითე სპეციალობა',                       done: specialty.length > 0,  weight: 8,  anchor: '#section-public-profile' },
    { id: 'price',       label: 'დააფიქსირე კონსულტაციის ფასი',              done: price > 0,             weight: 10, anchor: '#section-public-profile' },
    { id: 'languages',   label: 'აირჩიე მინ. ერთი ენა',                     done: languages.length >= 1, weight: 10, anchor: '#section-public-profile' },
    { id: 'avatar',      label: 'ატვირთე პროფილის ფოტო',                    done: !!avatarUrl,           weight: 10, anchor: '#section-avatar' },
    { id: 'certificates',label: 'დაამატე მინ. ერთი სერტიფიკატი',            done: certificates >= 1,     weight: 8,  anchor: '#section-certificates' },
    { id: 'education',   label: 'დაამატე განათლების ჩანაწერი',              done: education >= 1,        weight: 8,  anchor: '#section-education' },
    { id: 'experience',  label: 'დაამატე სამუშაო გამოცდილება',              done: experience >= 1,       weight: 8,  anchor: '#section-experience' },
    { id: 'availability',label: 'დაამატე თავისუფალი დრო',                   done: slotCount > 0,         weight: 15, anchor: '/tutor/schedule' },
  ]
}

export const profilePercent = (checks: ProfileCheck[]): number => {
  const total = checks.reduce((sum, c) => sum + (c.done ? c.weight : 0), 0)
  return Math.min(100, Math.max(0, total))
}

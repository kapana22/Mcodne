// /work/profile — the shapes the one provider editor and its three sections share.
//
// ⚠️ THERE IS ONE DRAFT SINCE 2026-08-30, and that is the whole point of the
// type. Before today this folder held `ProfileForm` (headline, bio, years,
// links, category, professions) while `app/work/services/_trades.tsx` held a
// second, separate `Profile` (services, areas, prices, the switch) — two
// objects, two dirty flags, two save buttons, two endpoints, one
// `ServiceProfile` row underneath. A provider saw two pages that seemed to do
// the same thing because in the database they did.
//
// One row, one draft, one save. Every field below is a column on that row
// except `fullName`, which is `User.fullName` and rides the same transaction —
// see the PUT in app/api/provider/service-profile.

/** What the editor holds and PUTs. Field names are the ENDPOINT's, not the
 *  UI's, so the save is `JSON.stringify(draft)` and nothing translates in
 *  between — a mapping layer is where „the bio saved but the headline did not"
 *  comes from. */
export type Draft = {
  /** `User.fullName`. The largest text on the card a client reads. */
  fullName: string
  headline: string
  /** The paragraph. Stored as `about`; the column the card and the public page
   *  both print, and what Google indexes. */
  about: string
  languages: string[]
  /** Empty string means „clear it" — the endpoint stores null for it. */
  linkedinUrl: string
  websiteUrl: string
  categoryId: string
  professions: string[]
  services: string[]
  areas: string[]
  calloutFee: number | null
  priceFrom: number | null
  /** Always an object in the draft: a stored `null` must never reach `[id]`. */
  priceList: Record<string, number>
  /** `kept:<n>` for one already stored, or a fresh data URI. Resolved by the
   *  endpoint — see `_secPhotos`. */
  workPhotos: string[]
}

/** What GET /api/provider/service-profile answers with. */
export type Topic = { id: string; label: string; alt: string[] }
export type Group = { id: string; label: string; vertical: 'SERVICE' | 'EXPERT'; topics: Topic[] }
export type City = { id: string; label: string }

export type Loaded = {
  /** The row id — the address of the public page, and of the photo route. */
  id: string | null
  /** `updatedAt`, busting the year-long cache on stored work photos. */
  stamp: string
  /** „What is still missing", computed by the endpoint so this screen and the
   *  routing agree on what „ready" means. */
  gaps: string[]
  groups: Group[]
  cities: City[]
  /** Is the profile switched on? READ-ONLY here — /work/account owns the
   *  control, and this screen only reports what it is currently true. */
  available: boolean
  /** ⚠️ THE GRANT'S OWN MEASURE, NOT lib/profileScore (2026-08-31). The status
   *  band draws a ring at this percentage above a line saying what the rest is
   *  worth, and the two would contradict each other the moment they came from
   *  different six-item lists — which is exactly what happened to the rail on
   *  2026-08-30. `lib/creditsServer → profileCompletion` answers both. */
  percent: number
  /** What finishing it is still worth, in TETRI. 0 ⇒ nothing left to earn. */
  unearnedTetri: number
}

/* ⚠️ `Category` LIVED HERE AND IS DELETED (2026-09-02). Its one consumer was
 * the sphere <select> inside the profession picker, and both left this screen
 * the same day — the sphere is derived from the services on the server now
 * (lib/requestTopics → sphereOfServices). Nothing in app/work/profile fetches
 * or renders the category vocabulary any more. */

// Password policy. ⚠️ IT MOVED TO lib/passwordPolicy ON 2026-08-31 and is
// re-exported here so /work/account keeps its import. The number was declared
// in this file AND, three days earlier, as a local `MIN_PASSWORD` in
// app/me/profile/client.tsx — two single-sources-of-truth for one rule, which
// is how the /me/profile copy came to say „6" while the endpoint said 8. The
// routes now import the same constant, so `tests/formValidation.test.ts` can
// assert the two halves agree instead of grepping for the digit.
export { PWD_MIN, PWD_MAX, PWD_MIN_MSG, passwordError } from '@/lib/passwordPolicy'

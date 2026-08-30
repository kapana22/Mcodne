// /tutor/profile — shapes shared by the page and its four tab panels.
//
// Several of these used to be inferred from a useState literal or declared
// inside the component body. They are named here so a tab can state what it
// receives; the literals in page.tsx are annotated with them, so tsc still
// checks that the defaults match.

export type Me = {
  id: string
  fullName: string
  email: string
  avatarUrl?: string | null
  phone?: string | null
} | null

/** ⚠️ IT IS THE `ServiceProfile` ROW SINCE 2026-08-24, and five fields left with
 *  the consultation product: `specialty`, `price`, `serviceType`,
 *  `consultationDurationMin` and `bufferMin`. `bio` is `about` on the row and
 *  is mapped at the two edges (the GET that fills the form, the PATCH that
 *  saves it) rather than renamed through 300 lines of form state. */
export type TutorProfile = {
  id: string
  headline: string | null
  about: string | null
  services?: string[]
  areas?: string[]
  priceList?: unknown
  yearsExp: number
  languages: string[]
  available?: boolean
  linkedinUrl?: string | null
  websiteUrl?: string | null
  responseHours?: number
  categoryId?: string | null
  professions?: string[]
  category?: { id: string; slug: string; name: string; status?: string } | null
} | null

export type Category = {
  id: string
  slug: string
  name: string
  /** Sub-fields absorbed into this sphere — offered here, never in browse. */
  children?: { id: string; slug: string; name: string }[]
}

// ⚠️ THE CV SHAPES WENT WITH THE TAB THAT EDITED THEM (2026-08-29):
// `Certificate`, `Education`, `Experience`, their three add-forms and
// `PendingDelete`, which had no kinds left once the three lists were gone.
// Owner: „რითი დაგიჯერებს აღარ გვჭირდება, ეს ხომ სერვისებს ყიდის." The three
// tables are untouched in the database; nothing on the site reads them.
//
// The consultation shapes had already gone the same way on 2026-08-19.

export type ProfileForm = {
  headline: string
  /** The paragraph. Sent as `bio` and stored as `about` — see TutorProfile. */
  bio: string
  yearsExp: number
  languages: string[]
  linkedinUrl: string
  websiteUrl: string
  categoryId: string
  /** What this expert calls themselves — several (lib/professions). */
  professions: string[]
}

// Password policy — mirrors /api/me/password (min 8). Kept in one place so the
// inline check, the input `minLength` and the copy can never drift apart again.
export const PWD_MIN = 8
export const PWD_MIN_MSG = 'პაროლი უნდა იყოს მინიმუმ 8 სიმბოლო'

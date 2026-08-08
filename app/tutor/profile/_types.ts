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

export type TutorProfile = {
  id: string
  headline: string
  bio: string | null
  specialty: string
  yearsExp: number
  price: number
  languages: string[]
  serviceType?: 'CONSULTATION' | 'RECURRING'
  consultationDurationMin?: number
  bufferMin?: number
  videoUrl?: string | null
  available?: boolean
  linkedinUrl?: string | null
  websiteUrl?: string | null
  responseHours?: number
  categoryId?: string | null
} | null

export type Category = { id: string; slug: string; name: string }

// `hasFile` replaces the scan itself in list payloads — see
// app/api/me/tutor/certificates/route.ts.
export type Certificate = { id: string; title: string; issuer?: string | null; year: number; fileUrl?: string | null; hasFile?: boolean; verified: boolean }
export type Education = { id: string; school: string; degree: string; field: string | null; startYear: number; endYear: number | null }
export type Experience = { id: string; company: string; role: string; startYear: number; endYear: number | null; description: string | null }

// The QUICK/STANDARD/DEEP tier is a backend enum — never surfaced to the
// expert. It is derived from the chosen minutes at submit time.
export type ConsultTier = 'QUICK' | 'STANDARD' | 'DEEP'
export type Consultation = { id: string; tier: ConsultTier; title: string; description: string; minutes: number; price: number }

// Unified confirm state for EVERY destructive action on this page.
export type PendingDelete =
  | { kind: 'cert';  id: string }
  | { kind: 'edu';   id: string }
  | { kind: 'exp';   id: string }
  | { kind: 'cons';  id: string }
  | { kind: 'video'; id?: string }

export type ProfileForm = {
  headline: string
  bio: string
  specialty: string
  yearsExp: number
  hourlyRate: number
  languages: string[]
  linkedinUrl: string
  websiteUrl: string
  categoryId: string
}

export type ConsForm = { title: string; description: string; minutes: number; price: number }
export type ConsEdit = { id: string; title: string; description: string; minutes: number; price: number }
export type CertForm = { title: string; issuer: string; year: number; fileUrl: string; fileName: string }
export type EduForm = { school: string; degree: string; field: string; startYear: number; endYear: string | number }
export type ExpForm = { company: string; role: string; startYear: number; endYear: string | number; description: string }

// Password policy — mirrors /api/me/password (min 8). Kept in one place so the
// inline check, the input `minLength` and the copy can never drift apart again.
export const PWD_MIN = 8
export const PWD_MIN_MSG = 'პაროლი უნდა იყოს მინიმუმ 8 სიმბოლო'

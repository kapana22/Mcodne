import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'

// tutors/[id]/page.tsx is a client component, so page-level metadata lives
// in this sibling server layout. We look up the tutor's display name +
// specialty for a rich, per-page title; if the lookup fails, we fall back
// to a generic (but still branded) title.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

type Params = { id: string }

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { id } = await params
  const canonical = `${SITE_URL}/tutors/${id}`

  try {
    const tutor = await prisma.tutorProfile.findUnique({
      where: { id },
      select: {
        specialty: true,
        headline: true,
        user: { select: { fullName: true } },
      },
    })
    if (tutor) {
      const name = tutor.user?.fullName?.trim() || 'ექსპერტი'
      const specialty = tutor.specialty?.trim()
      const title = specialty
        ? `${name} — ${specialty} · მცოდნე`
        : `${name} — მცოდნე`
      const description =
        tutor.headline?.trim() ||
        `დაჯავშნე კონსულტაცია ${name}-სთან მცოდნეზე.`
      return {
        title,
        description,
        alternates: { canonical },
        openGraph: {
          title,
          description,
          url: canonical,
          type: 'profile',
        },
      }
    }
  } catch {
    // fall through
  }

  return {
    title: 'ექსპერტი — მცოდნე',
    description: 'დაჯავშნე კონსულტაცია მცოდნის ექსპერტთან.',
    alternates: { canonical },
    openGraph: {
      title: 'ექსპერტი — მცოდნე',
      description: 'დაჯავშნე კონსულტაცია მცოდნის ექსპერტთან.',
      url: canonical,
    },
  }
}

export default function TutorDetailLayout({ children }: { children: React.ReactNode }) {
  return children
}

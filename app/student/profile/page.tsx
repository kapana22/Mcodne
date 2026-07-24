import { requireUser } from '@/lib/auth'
import { ProfileClient } from './client'
import { Container } from '@/components/Container'
import { PageHeader } from '@/components/PageHeader'

export const dynamic = 'force-dynamic'

export default async function StudentProfilePage() {
  const user = await requireUser()
  return (
    <Container as="main" size="content" className="w-full py-8 lg:py-10 flex-1">
        <PageHeader
          className="mb-8"
          eyebrow="პროფილი"
          title="ჩემი პროფილი"
          sub="შეცვალე შენი ინფორმაცია, ავატარი და პაროლი."
        />

        <ProfileClient
          initialName={user.fullName}
          initialEmail={user.email}
          initialPhone={user.phone ?? ''}
          initialBio={(user as any).bio ?? ''}
          initialAvatar={user.avatarUrl}
          role={user.role}
        />
    </Container>
  )
}

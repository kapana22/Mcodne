'use client'
// /join — THE ONE ONBOARDING DOOR, AND IT ASKS ONE QUESTION.
//
// ⚠️ THERE IS NO „კონსულტაცია / სერვისი" CHOICE HERE, and there must not be one
// again. Owner, looking at the two tiles it once had: „აქ არჩევანი საერთოდ არ
// უნდა იყოს და გაერთიანებული უნდა იყოს — უბრალოდ შიგნით უნდა იყოს ჩაშენებული."
//
// ⚠️ AND SINCE 2026-08-24 THERE IS ONE WIZARD BEHIND IT. There were two — the
// consultation form and the service form — with a `wizardFor` rule deciding
// which opened, a hand-off from each one's success screen to the other, and a
// `filed` list so somebody who did both was not invited to do the first again.
// The consultation product was removed; every applicant fills in the same form,
// so all three of those mechanisms are gone rather than switched off.
//
// ⚠️ THE QUESTION ITSELF DOES NOT LIVE HERE — it is `./_door/DoorQuestion`,
// which this file and the PUBLIC door both import. The reason is the order, not
// tidiness: it used to sit behind the sign-in wall, so the one thing worth
// knowing about a provider was asked AFTER we made them register. A guest now
// answers it on the pitch, the answer travels through signup in the draft, and
// this container picks it up on the other side instead of asking twice.

import { useEffect, useMemo, useState } from 'react'
import { Container } from '@/components/Container'
import { PublicTopBar } from '@/components/PublicTopBar'
import { Footer } from '@/components/Footer'
import type { Me } from '@/lib/me'
import { JOIN_DOOR_LABEL } from '@/lib/capabilities'
import { ProviderApplyClient } from './_provider/client'
import { DoorQuestion, clearAsked, readJoin, type DoorAnswer } from './_door/DoorQuestion'

export function JoinClient({ me }: { me: Me }) {
  const [stage, setStage] = useState<'door' | 'form'>('door')
  /** The door's answer — set by the question, or restored from the public side
   *  of the wall. `null` while it is still being asked. */
  const [answer, setAnswer] = useState<DoorAnswer | null>(null)

  /** ⚠️ THE ANSWER SURVIVES THE WALL (2026-08-20). Somebody who answered the
   *  question on the public door, made an account and came back has already told
   *  us what they do. Asking again on this side would make the first ask look
   *  like a trick — the classic „it did not save my answer" reading — so the
   *  form opens straight away. `asked` is cleared on arrival, so the NEXT visit
   *  to /join is an ordinary door with their answer pre-ticked. */
  useEffect(() => {
    const d = readJoin()
    if (!d?.asked) return
    clearAsked()
    if (d.professions.length === 0 && !d.sphere) return
    openForm({ sphere: d.sphere, sphereSlug: d.sphereSlug, professions: d.professions })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openForm(a: DoorAnswer) {
    setAnswer(a)
    setStage('form')
  }

  const seed = useMemo(
    () => ({ cats: answer?.sphere ? [answer.sphere] : [], professions: answer?.professions ?? [] }),
    [answer],
  )

  if (stage === 'form') {
    return (
      <ProviderApplyClient
        email={me?.email ?? ''}
        name={me?.fullName ?? ''}
        phone={me?.phone ?? ''}
        me={me}
        seed={seed}
      />
    )
  }

  return (
    <div className="font-sans bg-ink-50/30 text-ink-900 antialiased min-h-screen flex flex-col">
      <PublicTopBar activeHref="/join" initialUser={me} />
      <Container as="main" size="narrow" className="flex-1 py-10 sm:py-14">
        {/* The h1 is the word the header, the user menu and the footer's action
            all use — one source, so the click is confirmed by the heading. */}
        <h1 className="font-display text-h1 font-bold tracking-tight">{JOIN_DOOR_LABEL}</h1>

        <p className="mt-2 text-body text-ink-600">აირჩიე, რას აკეთებ.</p>

        <DoorQuestion onContinue={openForm} />
      </Container>
      <Footer />
    </div>
  )
}

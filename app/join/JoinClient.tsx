'use client'
// /join — THE ONE ONBOARDING DOOR, AND IT ASKS ONE QUESTION (2026-08-20).
//
// ⚠️ THERE IS NO „კონსულტაცია / სერვისი" CHOICE HERE ANY MORE, and there must
// not be one again. Owner, looking at the two tiles: „აქ არჩევანი საერთოდ არ
// უნდა იყოს და გაერთიანებული უნდა იყოს — უბრალოდ შიგნით უნდა იყოს ჩაშენებული."
//
// ⚠️ AND THE QUESTION ITSELF NO LONGER LIVES HERE — it moved to
// `./_door/DoorQuestion`, which this file and the PUBLIC door both import.
// The reason is the order, not tidiness: the question used to sit behind the
// sign-in wall, so the one thing worth knowing about a provider was asked
// AFTER we made them register. A guest now answers it on the pitch, the answer
// travels through signup in the draft, and this container picks it up on the
// other side (see `resumed` below) instead of asking it twice.
//
// What stays here is what only a signed-in door can do: which wizard opens,
// and the hand-off between the two halves.

import { useEffect, useMemo, useState } from 'react'
import { Container } from '@/components/Container'
import { PublicTopBar } from '@/components/PublicTopBar'
import { Footer } from '@/components/Footer'
import type { Me } from '@/lib/me'
import { JOIN_DOOR_LABEL, type Capability } from '@/lib/capabilities'
import TutorApply from './_expert/ApplyClient'
import { MasterApplyClient } from './_master/client'
import { DoorQuestion, clearAsked, deriveCapabilities, readJoin, type DoorAnswer } from './_door/DoorQuestion'

export function JoinClient({ offer, preset, me }: {
  /** The halves this person can still apply for — the page decides (an expert
   *  is not offered CONSULT again; WORK is absent while providers are off). */
  offer: Capability[]
  /** `?can=` from the URL, already narrowed to `offer`. Seeds the derivation
   *  while there is no answer of their own; it never overrides one. */
  preset: Capability[]
  me: Me
}) {
  const [stage, setStage] = useState<'door' | 'expert' | 'master'>('door')
  /** The door's answer — set by the question, or restored from the public
   *  side of the wall. `null` while it is still being asked. */
  const [answer, setAnswer] = useState<DoorAnswer | null>(null)
  // Which half is already filed. Without it the two hand-offs point at each
  // other and somebody who did both is invited to do the first one again.
  const [filed, setFiled] = useState<Capability[]>([])

  /** ⚠️ THE ANSWER SURVIVES THE WALL (2026-08-20). Somebody who answered the
   *  question on the public door, made an account and came back has already
   *  told us what they do. Asking again on this side would make the first ask
   *  look like a trick — the classic „it did not save my answer" reading — so
   *  the wizard opens straight away. `asked` is cleared on arrival, so the
   *  NEXT visit to /join is an ordinary door with their answer pre-ticked. */
  useEffect(() => {
    const d = readJoin()
    if (!d?.asked) return
    const can = deriveCapabilities(d.professions, d.sphere, offer, preset, d.sphereSlug)
    clearAsked()
    if (can.length === 0) return
    openWizard({ can, sphere: d.sphere, sphereSlug: d.sphereSlug, professions: d.professions })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openWizard(a: DoorAnswer) {
    const work = a.can.includes('WORK')
    setAnswer(a)
    // ⚠️ THE SERVICE FORM FIRST WHEN THEY CAN DO BOTH — CLAUDE.md rule 4. This
    // read `consult ? 'expert' : 'master'`, which sent a ბუღალტერი (CONSULT +
    // WORK) into the consultation wizard and made the service an afterthought
    // on its success screen. Reversed: the consultation half is the one
    // offered afterwards.
    setStage(work ? 'master' : 'expert')
  }

  const consult = answer?.can.includes('CONSULT') ?? false
  const work = answer?.can.includes('WORK') ?? false
  const seed = useMemo(
    () => ({ cats: answer?.sphere ? [answer.sphere] : [], professions: answer?.professions ?? [] }),
    [answer],
  )

  if (stage === 'expert') {
    return (
      <TutorApply
        initialUser={me}
        seed={seed}
        onContinueMaster={work && !filed.includes('WORK')
          ? () => { setFiled(f => [...f, 'CONSULT']); setStage('master') }
          : undefined}
      />
    )
  }
  if (stage === 'master') {
    return (
      <MasterApplyClient
        email={me?.email ?? ''}
        name={me?.fullName ?? ''}
        phone={me?.phone ?? ''}
        me={me}
        seed={seed}
        onContinueExpert={consult && !filed.includes('CONSULT')
          ? () => { setFiled(f => [...f, 'WORK']); setStage('expert') }
          : undefined}
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

        <DoorQuestion offer={offer} preset={preset} onContinue={openWizard} />
      </Container>
      <Footer />
    </div>
  )
}

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

export function JoinClient({ me, initialStatus = null }: { me: Me; initialStatus?: string | null }) {
  /** What they told the PUBLIC door, if anything — restored from the far side
   *  of the sign-up wall. `null` means they arrived here directly. */
  const [answer, setAnswer] = useState<DoorAnswer | null>(null)

  /** ⚠️ THE ANSWER SURVIVES THE WALL (2026-08-20). Somebody who answered on the
   *  public door, made an account and came back has already told us what they
   *  do; asking again would read as „it did not save my answer". `asked` is
   *  cleared on arrival so it is used once. Since 2026-08-31 there is no door
   *  on THIS side to pre-tick — the word goes straight into the form's search. */
  useEffect(() => {
    const d = readJoin()
    if (!d?.asked) return
    clearAsked()
    if (d.professions.length === 0 && !d.sphere) return
    setAnswer({ sphere: d.sphere, sphereSlug: d.sphereSlug, professions: d.professions })
  }, [])

  const seed = useMemo(
    () => ({ cats: answer?.sphere ? [answer.sphere] : [], professions: answer?.professions ?? [] }),
    [answer],
  )

  /* ⚠️ ONE PAGE (2026-08-31). /join used to be TWO screens: a „door" that asked
   * „აირჩიე, რას აკეთებ." with the profession picker and a continue button,
   * and only then the form. Owner: „ერთ გვერდზე იყოს ყველაფერი… დასაწყისში
   * უაზროდ ყრია სიტყვები."
   *
   * ⚠️ AND THE DOOR WAS COSTING A WHOLE SCREEN FOR A PRE-FILLED SEARCH BOX.
   * Measured before removing it: its answer is never submitted — the form's
   * body carries no `professions` — and the ONLY thing it does downstream is
   * seed the search query in stage 1 („Their own word into the search"). So a
   * person answered a question, pressed a button, and arrived at a form that
   * asked what looked like the same question again with their word typed in.
   * That is the „twice" the owner saw.
   *
   * The seed READ stays: somebody who answered on the PUBLIC door (the
   * signed-out `_door/GuestDoor`, a different surface behind the sign-up wall)
   * still gets their word carried in. `_door/DoorQuestion` is untouched on
   * disk — nothing renders it, and it is one line from returning if the door
   * is ever wanted back.
   */
  return (
    <ProviderApplyClient
      email={me?.email ?? ''}
      name={me?.fullName ?? ''}
      phone={me?.phone ?? ''}
      me={me}
      seed={seed}
      initialStatus={initialStatus}
    />
  )
}

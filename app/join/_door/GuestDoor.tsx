'use client'
/**
 * THE QUESTION, ASKED BEFORE THE WALL — the signed-out half of the door.
 *
 * ⚠️ WHY IT EXISTS (2026-08-20). /join gated its one question behind sign-up:
 * a guest saw a pitch, was sent to /signup, and only then met „რას აკეთებ?".
 * Two costs, both real. Forced registration before any commitment is one of
 * the best-measured causes of abandonment there is (Baymard puts ~24% of
 * checkout abandonment on exactly this shape), and it is worse here than in a
 * checkout: somebody who leaves at the wall leaves NOTHING behind, and
 * somebody who leaves just after it leaves an email address that routes to
 * nobody — we do not know their trade, their city, or which half they sell.
 *
 * So the order is inverted. They answer first — two taps, no typing — and the
 * account is asked for afterwards, when there is something to lose by walking
 * away. The answer rides through signup in the SAME draft the signed-in door
 * reads (`_door/DoorQuestion` → `mcodne:join`, `asked: true`), so nobody is
 * asked twice and the wizard opens on the other side.
 *
 * ⚠️ IT IS NOT A SECOND DOOR. Everything below the button — the derivation,
 * the persistence, the „what that means" line — is the leaf both sides import.
 * This file owns exactly one decision: where „გაგრძელება" goes.
 */

import { DoorQuestion } from './DoorQuestion'
import type { Capability } from '@/lib/capabilities'

export function GuestDoor({ offer, preset }: { offer: Capability[]; preset: Capability[] }) {
  return (
    <DoorQuestion
      offer={offer}
      preset={preset}
      onContinue={() => {
        // A full navigation, not `router.push`: signup is a different shell and
        // the draft has just been written to localStorage — nothing to carry.
        window.location.href = '/signup?redirect=%2Fjoin'
      }}
    />
  )
}

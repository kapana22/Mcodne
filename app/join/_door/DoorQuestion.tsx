'use client'
/**
 * THE QUESTION — one control, one derivation, two containers.
 *
 * ⚠️ WHY IT IS A LEAF (2026-08-20). The door asks ONE question — „რას აკეთებ?"
 * — and everything else about a provider follows from the answer. That
 * question used to live inside `JoinClient`, i.e. behind the sign-in wall,
 * because the container that owned it also owned the wizards. So the single
 * most valuable thing we can learn about somebody was asked AFTER we made them
 * register, and the public pitch had no way to ask it at all.
 *
 * Now the question is a leaf and BOTH containers import it:
 *   · `_door/GuestDoor`  — a signed-out visitor answers it before the wall,
 *                          and the answer travels through signup in the draft.
 *   · `JoinClient`       — a signed-in one answers it and a wizard opens.
 *
 * The leaf rule (CLAUDE.md): this file imports no sibling; both containers
 * import it. The derivation, the draft and the localStorage key have exactly
 * one definition, so the guest half and the signed-in half cannot drift.
 *
 * ⚠️ THERE IS NOTHING TO DERIVE ANY MORE (2026-08-24). This file used to turn
 * the answer into CAPABILITIES — CONSULT, WORK, or both — reading
 * `PROFESSION_CAN`, because which of the two wizards opened depended on it. The
 * consultation product was removed; everybody sells services, there is one
 * wizard, and the profession is now carried through as itself rather than as a
 * classification of itself.
 */

import { useEffect, useState } from 'react'
import { Btn } from '@/components/Btn'
import { ProfessionPicker } from '@/components/ProfessionPicker'
import { useSpheres } from '../_shared/useSpheres'

/* ═══════════ the draft ═════════════════════════════════════════════════ */

export const JOIN_KEY = 'mcodne:join'

/** What the door knows about somebody. `asked` = they have already pressed
 *  „გაგრძელება" once, on the public side, and must not be asked again after
 *  the round trip through signup. */
export type JoinDraft = {
  sphere: string
  /** The category's slug. Carried because the resume on the other side of the
   *  sign-up wall re-derives the capabilities and the NAME alone cannot reach
   *  `PROFESSIONS`. */
  sphereSlug: string
  professions: string[]
  asked: boolean
  savedAt: number
}

export type DoorAnswer = Pick<JoinDraft, 'sphere' | 'sphereSlug' | 'professions'>

export function readJoin(): JoinDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(JOIN_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Partial<JoinDraft>
    if (!d || typeof d !== 'object') return null
    return {
      sphere: typeof d.sphere === 'string' ? d.sphere : '',
      sphereSlug: typeof d.sphereSlug === 'string' ? d.sphereSlug : '',
      professions: Array.isArray(d.professions) ? d.professions.map(String) : [],
      asked: d.asked === true,
      savedAt: typeof d.savedAt === 'number' ? d.savedAt : 0,
    }
  } catch { return null }
}

export function writeJoin(d: Omit<JoinDraft, 'savedAt'>) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(JOIN_KEY, JSON.stringify({ ...d, savedAt: Date.now() })) } catch {}
}

/** Forget only that they pressed continue — the ANSWER stays, so a person who
 *  comes back to the door later still finds their profession ticked. */
export function clearAsked() {
  const d = readJoin()
  if (d?.asked) writeJoin({ ...d, asked: false })
}

/* ═══════════ what the answer means ═════════════════════════════════════ */

/** Said back in one line rather than asked as a question.
 *
 * ⚠️ IT USED TO HAVE TWO BRANCHES, and the second named a second product:
 * „სერვისებს გაყიდი — და თუ რომელიმეს დრო სჭირდება, ჯავშნადსაც გახდი." There is
 * no second thing to become since 2026-08-24, so there is one sentence. */
export function consequenceLine(): string {
  return 'სერვისებს გაყიდი.'
}

/* ═══════════ the control ═══════════════════════════════════════════════ */

export function DoorQuestion({ cta = 'გაგრძელება', onContinue }: {
  cta?: string
  /** Called with the derived answer. The draft is already written. */
  onContinue: (answer: DoorAnswer) => void
}) {
  const [sphere, setSphere] = useState('')
  const [professions, setProfessions] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const spheres = useSpheres()

  // Restore. Only the two ANSWERS are restored — `can` is re-derived below
  // against today's taxonomy rather than trusted from a week-old draft.
  useEffect(() => {
    const d = readJoin()
    if (d) {
      setSphere(d.sphere)
      setProfessions(d.professions)
    }
    setLoaded(true)
  }, [])

  const sphereSlug = spheres.find(s => s.name === sphere)?.slug ?? ''
  /** They have said enough to open the form: a profession, or at least the
   *  sphere they work in. */
  const answered = professions.length > 0 || !!sphere

  // Persist AFTER the derivation: the draft records the outcome, and `asked`
  // is not set here — pressing the button is what sets it.
  useEffect(() => {
    if (!loaded) return
    const prev = readJoin()
    writeJoin({ sphere, sphereSlug, professions, asked: prev?.asked === true })
  }, [loaded, sphere, sphereSlug, professions])

  return (
    <>
      {/* ⚠️ ONE QUESTION AND NO TILES (2026-08-20). The category and the
          profession ARE the answer; what they can sell follows from it.

          ⚠️ AND NO CARD AROUND IT (2026-08-21). It sat in one, and the result
          was three concentric hairline rectangles — Card, then step ①'s
          container, then step ②'s — with NO tonal difference between any of
          them, because `ink-50` is `#FFFFFF` (see INK_SCALE) and the two inner
          boxes were `bg-ink-50/40`, i.e. white on white on white. The card was
          contributing a second frame and nothing else, and a frame that groups
          nothing is what makes a form read as boxes-in-boxes. The two steps are
          the fields; each carries its own `bg-ink-75` container, which is a
          real tint, so the grouping is now done by TONE and the page keeps one
          level of containment instead of three. */}
      <div className="mt-6">
        <ProfessionPicker
          spheres={spheres.map(s => ({ slug: s.slug ?? '', name: s.name }))}
          sphere={sphere}
          onSphere={setSphere}
          value={professions}
          onChange={setProfessions}
        />
      </div>

      {answered && (
        <p className="mt-3 text-small text-ink-600">{consequenceLine()}</p>
      )}

      <div className="mt-6">
        <Btn
          size="lg"
          disabled={!answered}
          onClick={() => {
            const answer: DoorAnswer = { sphere, sphereSlug, professions }
            writeJoin({ ...answer, asked: true })
            onContinue(answer)
          }}
        >
          {cta}
        </Btn>
      </div>
    </>
  )
}

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
 * ⚠️ THE CAPABILITIES ARE DERIVED FROM THE PROFESSION, NEVER ASKED.
 * `PROFESSION_CAN` (lib/professions) already says what each job can sell — a
 * სანტექნიკოსი a job (and a short call about it), a ფსიქოლოგი a conversation,
 * a ბუღალტერი both — and it is the same table the request router reads.
 * Asking the applicant to classify themselves on top of it would put the
 * retired „კონსულტაცია / სერვისი" axis on the first screen a provider sees.
 */

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/Card'
import { Btn } from '@/components/Btn'
import { ProfessionPicker } from '@/components/ProfessionPicker'
import { CAPABILITIES, type Capability } from '@/lib/capabilities'
import { PROFESSIONS, professionCan } from '@/lib/professions'
import { useSpheres } from '../_expert/_steps'

/* ═══════════ the draft ═════════════════════════════════════════════════ */

export const JOIN_KEY = 'mcodne:join'

/** What the door knows about somebody. `asked` = they have already pressed
 *  „გაგრძელება" once, on the public side, and must not be asked again after
 *  the round trip through signup. */
export type JoinDraft = {
  can: Capability[]
  sphere: string
  /** The category's slug. Carried because the resume on the other side of the
   *  sign-up wall re-derives the capabilities and the NAME alone cannot reach
   *  `PROFESSIONS`. */
  sphereSlug: string
  professions: string[]
  asked: boolean
  savedAt: number
}

export type DoorAnswer = Pick<JoinDraft, 'can' | 'sphere' | 'sphereSlug' | 'professions'>

export function readJoin(): JoinDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(JOIN_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Partial<JoinDraft>
    if (!d || typeof d !== 'object') return null
    return {
      can: Array.isArray(d.can) ? d.can.filter((c): c is Capability => (CAPABILITIES as readonly string[]).includes(String(c))) : [],
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

/* ═══════════ the derivation ════════════════════════════════════════════ */

/**
 * What this person can sell, from what they say they do.
 *
 * `offer` narrows it: the page decides which halves are open at all (an
 * approved expert is not offered CONSULT twice; WORK is absent while
 * FEATURE_PROVIDERS is off), and a derived capability the site is not offering
 * is dropped rather than honoured.
 *
 * ⚠️ `preset` (`?can=` in the URL) SEEDS, IT DOES NOT OVERRIDE — changed
 * 2026-08-20, and this is the whole bug. It used to short-circuit the whole
 * function, so a link that named a half beat the profession the applicant had
 * just picked in the control directly above the button. The site's own header
 * and footer carried `?can=CONSULT`, which meant the derivation — the reason
 * the door exists — was dead for anybody who arrived by clicking rather than
 * by typing the address. A preset is now the answer only while there is no
 * answer of their own.
 */
export function deriveCapabilities(
  professions: readonly string[],
  sphere: string,
  offer: readonly Capability[],
  preset: readonly Capability[] = [],
  /** The chosen category's SLUG. Only the container knows it — the picker
   *  speaks in names — and without it the fallback below cannot be honest. */
  sphereSlug = '',
): Capability[] {
  const derived = new Set<Capability>()
  for (const job of professions) for (const c of professionCan(job)) derived.add(c as Capability)
  /**
   * ⚠️ A CATEGORY ALONE IS STILL AN ANSWER — BUT NOT ALWAYS „კონსულტაცია"
   * (2026-08-20). This line used to read `derived.add('CONSULT')`, which is the
   * same mistake `?can=CONSULT` was making one level up: somebody who picked
   * „სახლის რემონტი" and pressed continue without ticking a trade was declared
   * a consultant and dropped into the consultation wizard. The category knows
   * better — `PROFESSIONS[slug]` lists who works in it and `PROFESSION_CAN`
   * says what each of them sells — so the fallback is the UNION of what that
   * category's professions can do. „კონსულტაცია" remains the answer for a
   * category of consultants, because that is what its professions say.
   */
  if (derived.size === 0 && sphere) {
    for (const job of PROFESSIONS[sphereSlug] ?? []) for (const c of professionCan(job)) derived.add(c as Capability)
    // An admin-added category with no professions listed yet: the sphere is a
    // complete answer on its own and a consultation is the safe reading.
    if (derived.size === 0) derived.add('CONSULT')
  }
  // Nothing of their own yet: the link they followed may speak for them.
  if (derived.size === 0) for (const c of preset) derived.add(c)
  return CAPABILITIES.filter(c => derived.has(c) && offer.includes(c))
}

/** What their answer MEANS, said back in one line rather than asked as a
 *  question. Never „კონსულტაცია / სერვისი" as a CHOICE — this is a
 *  consequence, and the service half always arrives first (CLAUDE.md rule 4). */
export function consequenceLine(can: readonly Capability[]): string {
  const work = can.includes('WORK')
  const consult = can.includes('CONSULT')
  // ⚠️ ONE PRODUCT, TWO WAYS OF BUYING IT (2026-08-20). These three lines used
  // to name „კონსულტაცია" as a second thing the person would do. There is no
  // second thing: everybody sells SERVICES, and some services are bought by
  // picking a time. Saying it as a second product is what made a plumber read
  // „შენს პროფესიაზე კონსულტაციებს ჩაატარებ" on the first screen of a form he
  // opened to sell repairs.
  if (work && consult) return 'სერვისებს გაყიდი — და თუ რომელიმეს დრო სჭირდება, ჯავშნადსაც გახდი.'
  return 'სერვისებს გაყიდი.'
}

/* ═══════════ the control ═══════════════════════════════════════════════ */

export function DoorQuestion({ offer, preset, cta = 'გაგრძელება', onContinue }: {
  /** The halves this door will honour — the page decides. */
  offer: Capability[]
  /** `?can=` from the URL, already narrowed to `offer`. Seeds only. */
  preset: Capability[]
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
  const picked = useMemo<Capability[]>(
    () => deriveCapabilities(professions, sphere, offer, preset, sphereSlug),
    [professions, sphere, offer, preset, sphereSlug],
  )

  // Persist AFTER the derivation: the draft records the outcome, and `asked`
  // is not set here — pressing the button is what sets it.
  useEffect(() => {
    if (!loaded) return
    const prev = readJoin()
    writeJoin({ can: picked, sphere, sphereSlug, professions, asked: prev?.asked === true })
  }, [loaded, picked, sphere, sphereSlug, professions])

  /** They answered, but the half their profession implies is not open today.
   *  Without this the button is simply dead and nothing says why. */
  const answeredButClosed =
    picked.length === 0 &&
    (professions.length > 0 || !!sphere) &&
    deriveCapabilities(professions, sphere, CAPABILITIES, [], sphereSlug).length > 0

  return (
    <>
      {/* ⚠️ ONE QUESTION AND NO TILES (2026-08-20). The category and the
          profession ARE the answer; what they can sell follows from it. */}
      <Card className="mt-6">
        <ProfessionPicker
          spheres={spheres.map(s => ({ slug: s.slug ?? '', name: s.name }))}
          sphere={sphere}
          onSphere={setSphere}
          value={professions}
          onChange={setProfessions}
        />
      </Card>

      {picked.length > 0 && (
        <p className="mt-3 text-small text-ink-600">{consequenceLine(picked)}</p>
      )}
      {answeredButClosed && (
        <p className="mt-3 text-small text-ink-600">ამ მიმართულებაზე რეგისტრაცია ჯერ დახურულია.</p>
      )}

      <div className="mt-6">
        <Btn
          size="lg"
          disabled={picked.length === 0}
          onClick={() => {
            const answer: DoorAnswer = { can: picked, sphere, sphereSlug, professions }
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

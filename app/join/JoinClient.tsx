'use client'
// /join — THE ONE ONBOARDING DOOR, AND IT ASKS ONE QUESTION (2026-08-20).
//
// ⚠️ THERE IS NO „კონსულტაცია / სერვისი" CHOICE HERE ANY MORE, and there must
// not be one again. Owner, looking at the two tiles: „აქ არჩევანი საერთოდ არ
// უნდა იყოს და გაერთიანებული უნდა იყოს — უბრალოდ შიგნით უნდა იყოს ჩაშენებული."
//
// The tiles asked a person to classify THEMSELVES before the site had told
// them anything — and it was the same axis CLAUDE.md says must never be
// primary („A „კონსულტაცია / სერვისი" primary axis… a switcher, a nav item,
// the first filter section"). It was also a question with a knowable answer:
// a სანტექნიკოსი sells a job, a ფსიქოლოგი sells a conversation, a ბუღალტერი
// sells both, and lib/professions → PROFESSION_CAN has said so since stage 8.
// Asking the applicant to repeat what the taxonomy already knows is how the
// door ended up with two mechanisms for one fact.
//
// SO: they name what they do, and the capabilities are DERIVED. The wizard
// that opens is decided the same way — WORK-capable goes to the service form
// first, because the service always arrives first (CLAUDE.md rule 4); the
// consultation half is offered from its success screen.
//
// The choice survives a reload in localStorage (`mcodne:join`), so a person
// who comes back lands on the door with their answer in place, and the
// category + professions picked here are seeded into the wizard's own draft.

import { useEffect, useMemo, useState } from 'react'
import { Container } from '@/components/Container'
import { PublicTopBar } from '@/components/PublicTopBar'
import { Footer } from '@/components/Footer'
import { Card } from '@/components/Card'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { ProfessionPicker } from '@/components/ProfessionPicker'
import type { Me } from '@/lib/me'
import { CAPABILITIES, type Capability } from '@/lib/capabilities'
import { professionCan } from '@/lib/professions'
import TutorApply from './_expert/ApplyClient'
import { useSpheres } from './_expert/_steps'
import { MasterApplyClient } from './_master/client'

const JOIN_KEY = 'mcodne:join'
type JoinDraft = { can: Capability[]; sphere: string; professions: string[]; savedAt: number }

function readJoin(): JoinDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(JOIN_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Partial<JoinDraft>
    if (!d || typeof d !== 'object') return null
    return {
      can: Array.isArray(d.can) ? d.can.filter((c): c is Capability => (CAPABILITIES as readonly string[]).includes(String(c))) : [],
      sphere: typeof d.sphere === 'string' ? d.sphere : '',
      professions: Array.isArray(d.professions) ? d.professions.map(String) : [],
      savedAt: typeof d.savedAt === 'number' ? d.savedAt : 0,
    }
  } catch { return null }
}

function writeJoin(d: Omit<JoinDraft, 'savedAt'>) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(JOIN_KEY, JSON.stringify({ ...d, savedAt: Date.now() })) } catch {}
}

export function JoinClient({ offer, preset, me }: {
  /** The halves this person can still apply for — the page decides (an expert
   *  is not offered CONSULT again; WORK is absent while providers are off). */
  offer: Capability[]
  /** `?can=` from the URL, already narrowed to `offer`. Pre-ticks the tiles. */
  preset: Capability[]
  me: Me
}) {
  const [stage, setStage] = useState<'door' | 'expert' | 'master'>('door')
  const [sphere, setSphere] = useState('')
  const [professions, setProfessions] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const spheres = useSpheres()

  // Restore. The URL wins over the stored ticks when it says anything at all —
  // arriving from a link that names a half is a fresher instruction than last
  // week's choice.
  useEffect(() => {
    const d = readJoin()
    if (d) {
      setSphere(d.sphere)
      setProfessions(d.professions)
    }
    setLoaded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * ⚠️ THE CAPABILITIES ARE DERIVED FROM THE PROFESSION, NEVER ASKED.
   *
   * `PROFESSION_CAN` (lib/professions) already says what each job can sell —
   * a სანტექნიკოსი a job, a ფსიქოლოგი a conversation, a ბუღალტერი both — and
   * it is the same table the request router reads. Asking the applicant to
   * classify themselves on top of it was a second answer to a question that
   * already had one, and it put the retired „კონსულტაცია / სერვისი" axis on
   * the first screen a provider ever sees.
   *
   * `offer` still narrows it: the page decides which halves are open at all
   * (an expert is not offered CONSULT twice; WORK is absent while providers
   * are off), and a derived capability the site is not offering is dropped
   * rather than honoured. `preset` (?can= in the URL) is the one deliberate
   * override — a link that names a half wins over the derivation, because
   * somebody followed it on purpose.
   */
  const picked = useMemo<Capability[]>(() => {
    if (preset.length > 0) return preset
    const derived = new Set<Capability>()
    for (const job of professions) for (const c of professionCan(job)) derived.add(c as Capability)
    // A category with no profession ticked is still an answer — they consult in
    // it until they say otherwise. Empty stays empty so the button stays off.
    if (derived.size === 0 && sphere) derived.add('CONSULT')
    return CAPABILITIES.filter(c => derived.has(c) && offer.includes(c))
  }, [professions, sphere, preset, offer])

  // Persist AFTER the derivation, not before it — `picked` is computed from
  // the two fields above and the draft records the outcome, so a return visit
  // restores the same answer without re-deriving it against a taxonomy that
  // may have moved on.
  useEffect(() => {
    if (!loaded) return
    writeJoin({ can: picked, sphere, professions })
  }, [loaded, picked, sphere, professions])

  const consult = picked.includes('CONSULT')
  const work = picked.includes('WORK')
  const seed = useMemo(() => ({ cats: sphere ? [sphere] : [], professions }), [sphere, professions])

  if (stage === 'expert') {
    return (
      <TutorApply
        initialUser={me}
        seed={seed}
        onContinueMaster={work ? () => setStage('master') : undefined}
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
      />
    )
  }

  return (
    <div className="font-sans bg-ink-50/30 text-ink-900 antialiased min-h-screen flex flex-col">
      <PublicTopBar activeHref="/join" initialUser={me} />
      <Container as="main" size="narrow" className="flex-1 py-10 sm:py-14">
        <h1 className="font-display text-h1 font-bold tracking-tight">შემოგვიერთდი</h1>

        <p className="mt-2 text-body text-ink-600">დაასახელე, რას აკეთებ — დანარჩენს ჩვენ მოვაწყობთ.</p>

        {/* ⚠️ ONE QUESTION AND NO TILES (2026-08-20). The category and the
            profession ARE the answer; what they can sell follows from it (see
            `picked` above). The block is no longer conditional on a tick and
            no longer carries a number — it is the screen. */}
        <Card className="mt-6">
          <ProfessionPicker
            spheres={spheres.map(s => ({ slug: s.slug ?? '', name: s.name }))}
            sphere={sphere}
            onSphere={setSphere}
            value={professions}
            onChange={setProfessions}
          />
        </Card>

        {/* What that answer means, said back to them in one line rather than
            asked as a question. Never „კონსულტაცია / სერვისი" as a CHOICE —
            this is a consequence, and it only appears once there is one. */}
        {picked.length > 0 && (
          <p className="mt-3 text-small text-ink-600">
            {work && consult
              ? 'შენს პროფესიაზე შეგიძლია სერვისიც შეასრულო და კონსულტაციაც ჩაატარო.'
              : work
                ? 'შენს პროფესიაზე სერვისებს შეასრულებ.'
                : 'შენს პროფესიაზე კონსულტაციებს ჩაატარებ.'}
          </p>
        )}

        <div className="mt-6">
          <Btn
            size="lg"
            disabled={picked.length === 0}
            // ⚠️ THE SERVICE FORM FIRST WHEN THEY CAN DO BOTH — CLAUDE.md
            // rule 4. This read `consult ? 'expert' : 'master'`, which sent a
            // ბუღალტერი (CONSULT + WORK) into the consultation wizard and made
            // the service an afterthought on its success screen. Reversed: the
            // consultation half is the one offered afterwards.
            onClick={() => setStage(work ? 'master' : 'expert')}
          >
            გაგრძელება
          </Btn>
        </div>
      </Container>
      <Footer />
    </div>
  )
}

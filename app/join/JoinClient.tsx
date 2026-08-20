'use client'
// /join — the ONE onboarding door (2026-08-19). It asks two things and then
// re-homes the person into the wizard that already exists: „ვარ ექსპერტი" →
// the expert application (./_expert), „ვარ ხელოსანი" → the master form
// (./_master), both → expert first, then the master form from its success
// screen. Neither wizard was rewritten; this file only decides which one opens
// and hands it what the door already learned.
//
// The choice survives a reload in localStorage (`mcodne:join`), so a person
// who comes back lands on the door with their ticks in place, and the sphere
// + professions picked here are seeded into the expert wizard's own draft.

import { useEffect, useMemo, useState } from 'react'
import { Container } from '@/components/Container'
import { PublicTopBar } from '@/components/PublicTopBar'
import { Footer } from '@/components/Footer'
import { Card } from '@/components/Card'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { ProfessionPicker } from '@/components/ProfessionPicker'
import type { Me } from '@/lib/me'
import { CAPABILITIES, CAPABILITY_LABEL, type Capability } from '@/lib/capabilities'
import TutorApply from './_expert/ApplyClient'
import { useSpheres } from './_expert/_steps'
import { MasterApplyClient } from './_master/client'

/** The signup tiles' own words (app/signin/_signup.tsx), one per capability. */
const TILE: Record<Capability, { t: string; s: string }> = {
  CONSULT: { t: 'ვარ ექსპერტი', s: CAPABILITY_LABEL.CONSULT },
  WORK: { t: 'ვთავაზობ სერვისს', s: CAPABILITY_LABEL.WORK },
}

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
  const [picked, setPicked] = useState<Capability[]>(preset)
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
      if (preset.length === 0) setPicked(d.can.filter(c => offer.includes(c)))
      setSphere(d.sphere)
      setProfessions(d.professions)
    }
    setLoaded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!loaded) return
    writeJoin({ can: picked, sphere, professions })
  }, [loaded, picked, sphere, professions])

  const toggle = (c: Capability) =>
    setPicked(p => (p.includes(c) ? p.filter(x => x !== c) : CAPABILITIES.filter(x => x === c || p.includes(x))))

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

        {/* Two tiles, any number ticked. Square ticks — „any of", the same
            convention ProfessionPicker uses for its professions. */}
        <div role="group" aria-label="შემოგვიერთდი" className="mt-6 grid gap-3">
          {offer.map(c => {
            const on = picked.includes(c)
            return (
              <Card
                key={c}
                as="button"
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(c)}
                padding="compact"
                className={`text-left flex items-center gap-3 transition-colors duration-fast ${on ? 'border-brand-500 bg-brand-50' : 'hover:border-ink-300'}`}
              >
                <span className={`w-[18px] h-[18px] shrink-0 rounded-[4px] border-[1.5px] inline-flex items-center justify-center ${
                  on ? 'bg-brand-600 border-brand-600 text-white' : 'border-ink-300 bg-white'
                }`}>
                  {on && <Icon.check className="w-3 h-3" />}
                </span>
                <span className="min-w-0">
                  <span className={`block font-display text-body font-bold ${on ? 'text-brand-800' : 'text-ink-900'}`}>{TILE[c].t}</span>
                  <span className="block text-meta text-ink-500 mt-0.5">{TILE[c].s}</span>
                </span>
              </Card>
            )
          })}
        </div>

        {/* The expert taxonomy, so it belongs to the expert half: shown once
            that tile is on. Optional here — the wizard asks again if skipped. */}
        {consult && (
          <Card className="mt-4">
            <h2 className="font-display text-h3 font-bold text-ink-900 mb-4">კატეგორია და პროფესია</h2>
            <ProfessionPicker
              spheres={spheres.map(s => ({ slug: s.slug ?? '', name: s.name }))}
              sphere={sphere}
              onSphere={setSphere}
              value={professions}
              onChange={setProfessions}
            />
          </Card>
        )}

        <div className="mt-6">
          <Btn
            size="lg"
            disabled={picked.length === 0}
            onClick={() => setStage(consult ? 'expert' : 'master')}
          >
            გაგრძელება
          </Btn>
        </div>
      </Container>
      <Footer />
    </div>
  )
}

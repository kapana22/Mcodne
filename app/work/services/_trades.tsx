'use client'
// „რას აკეთებ და სად" — the master's own form.
//
// ⚠️ IT MOVED, IT DID NOT CHANGE (2026-08-19). This was
// app/work/(provider)/service-profile/_form.tsx, the whole of a page that asked
// „რას ვყიდი?" one floor away from the expert's tab asking the same question.
// One page answers it now — /work/services — and this file is the quote-based
// half of it, byte-for-byte what it was: same endpoint, same vocabulary, same
// gaps line, same uploader, same switch. The gate that stood in the old route's
// layout stands in that page instead (`requestsViewer().providerAllowed`), so
// nothing here decides who may see it.
//
// ⚠️ THE VOCABULARY COMES FROM THE SERVER, not from an import. The endpoint
// sends the groups and the cities alongside the saved row, so the list this
// draws and the list the schema validates against are the same object. A
// hard-coded copy here is how a trade gets added to requestTopics and stays
// invisible to every provider on the site.
//
// ⚠️ AND THE „ready / not ready" LINE IS THE SERVER'S ANSWER TOO (`gaps`).
// Whether a profile will actually be routed to is a routing question, and a
// second opinion computed in the browser is the one that would be wrong.

import { useCallback, useEffect, useState } from 'react'
import { PhotoUploader } from '@/app/join/_expert/_upload'
import { Btn } from '@/components/Btn'
import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { MAX_SERVICES } from '@/lib/serviceProfile'

type Group = { id: string; label: string; topics: { id: string; label: string }[] }
type City = { id: string; label: string }
type Profile = {
  services: string[]
  areas: string[]
  calloutFee: number | null
  priceFrom: number | null
  available: boolean
  /** ⚠️ THESE TWO WERE UNEDITABLE UNTIL 2026-08-18, and they are the two a
   *  client actually looks at. Their only writer was the approval transaction,
   *  and the application is sealed once approved — so a master's face and their
   *  one sentence were frozen at application day, permanently. */
  about: string | null
  photoUrl?: string | null
}

type Loaded = {
  profile: Profile
  gaps: string[]
  groups: Group[]
  cities: City[]
  /** The photo is COUNTED, not sent — see the endpoint. Sending a base64 image
   *  back to say „you have one" would ship it twice. */
  hasPhoto: boolean
}

/** A number field that distinguishes „empty" from „zero". `null` is „ask me",
 *  and it has to survive the round trip — see lib/serviceProfile. */
function num(raw: string): number | null {
  const t = raw.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

const FIELD =
  'w-full h-11 px-3.5 rounded-field border border-ink-200 bg-white text-body text-ink-900 ' +
  'placeholder-ink-400 focus:border-brand-500 outline-none transition-colors duration-fast'

export function ServiceProfileForm() {
  const [data, setData] = useState<Loaded | null>(null)
  const [draft, setDraft] = useState<Profile | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/provider/service-profile', { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) { setError('ვერ ჩაიტვირთა.'); return }
      setData({ profile: j.profile, gaps: j.gaps, groups: j.groups, cities: j.cities, hasPhoto: !!j.hasPhoto })
      setDraft(j.profile)
    } catch {
      setError('ვერ ჩაიტვირთა.')
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (error && !draft) return <p className="text-body text-danger-700">{error}</p>
  if (!data || !draft) return <p className="text-body text-ink-500">იტვირთება…</p>

  const patch = (p: Partial<Profile>) => {
    setDraft(d => (d ? { ...d, ...p } : d))
    // A saved badge that survives the next edit is a badge that lies.
    if (status === 'saved') setStatus('idle')
    setError(null)
  }

  // ⚠️ THE STORED PHOTO IS SHOWN THROUGH ITS OWN URL, NOT ITS BYTES. The GET
  // returns a boolean rather than the base64 (see the endpoint); the existing
  // face is drawn by pointing at the same route the public card uses, and
  // `updatedAt` busts its year-long cache the moment a new one is saved. Only a
  // photo picked in THIS session is a data URI in `draft`.
  const profileId = (data.profile as { id?: string | null }).id ?? null
  const stamp = (data.profile as { updatedAt?: string | null }).updatedAt ?? ''

  const atCap = draft.services.length >= MAX_SERVICES

  // ⚠️ 39 CHIPS IN 8 GROUPS, ALL EXPANDED, WAS THE WHOLE SCREEN (2026-08-21).
  // Measured: eight `h-11` rows deep, roughly 1 400px of scrolling before the
  // cities card came into view — and the cap is 12, so a plumber ticks four of
  // the five under სანტექნიკა and scrolls past the other thirty-four. Owner:
  // „ამდენი სივრცე სჭირდება? … მარტო ტექსტები და ღილაკებია დაყრილი და
  // არაპროფესიონალურია."
  //
  // One group open at a time. Nothing is hidden — every chip is one click away,
  // and the header carries its own count, so what you already chose is legible
  // while it is closed. That is the whole trade: eight words to scan instead of
  // thirty-nine buttons to wade through.
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  const toggleService = (id: string) => {
    const on = draft.services.includes(id)
    if (!on && atCap) return
    patch({ services: on ? draft.services.filter(s => s !== id) : [...draft.services, id] })
  }

  const toggleArea = (id: string) => {
    const on = draft.areas.includes(id)
    patch({ areas: on ? draft.areas.filter(a => a !== id) : [...draft.areas, id] })
  }

  const save = async () => {
    setStatus('saving'); setError(null)
    try {
      const r = await fetch('/api/provider/service-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) {
        // The endpoint's own message when it has one — these are written to be
        // read by the person who filled the form in.
        setError(j?.detail ?? 'ვერ შეინახა.')
        setStatus('idle')
        return
      }
      setData(d => (d ? { ...d, profile: j.profile, gaps: j.gaps } : d))
      setStatus('saved')
    } catch {
      setError('ვერ შეინახა.')
      setStatus('idle')
    }
  }

  return (
    <div className="flex flex-col gap-5">

      {/* ── Is this profile actually going to receive anything ──────────────
          The first thing on the screen, because a master whose list is empty is
          waiting for work that is never routed to them and nothing else on the
          page would say so. */}
      {/* ⚠️ ONE LINE, NOT A BULLETED BOX (2026-08-21). It listed „აირჩიე ერთი
          სერვისი მაინც" and „აირჩიე ქალაქი" as bullets directly above the two
          cards that ASK for exactly those two things — the warning restated the
          form it was sitting on top of. The state („ჯერ არ ხარ სიაში") is worth
          saying because nothing else on the page would; the instructions are
          not, because the next two headings are the instructions. */}
      {data.gaps.length > 0 ? (
        <div className="rounded-card border border-warning-200 bg-warning-50 px-4 py-3">
          <p className="text-body text-ink-900">
            ჯერ არ ხარ სიაში — {data.gaps.join(', ')}.
          </p>
        </div>
      ) : (
        <div className="rounded-card border border-ink-200 bg-ink-50 px-4 py-3">
          <p className="text-body text-ink-900">
            {draft.available
              ? 'მოთხოვნები მოგდის არჩეულ სერვისებზე და ქალაქებზე.'
              : 'დროებით გამორთულია — მოთხოვნები არ მოგდის.'}
          </p>
        </div>
      )}

      {/* ── The trades ──────────────────────────────────────────────────── */}
      <Card>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="font-display text-h3 font-bold text-ink-900">რას აკეთებ</h2>
          <span className="text-meta text-ink-500 tabular-nums">
            {draft.services.length} / {MAX_SERVICES}
          </span>
        </div>
        {atCap && (
          <p className="mt-1 text-small text-ink-500">
            მაქსიმუმია. ერთი მოხსენი, თუ სხვის დამატება გინდა.
          </p>
        )}
        <div className="mt-4 flex flex-col gap-1">
          {data.groups.map(g => {
            const chosen = g.topics.filter(t => draft.services.includes(t.id)).length
            // A group that already holds a choice opens on its own the first
            // time the list is drawn — otherwise a returning provider has to
            // hunt for their own answers.
            const open = openGroup === null ? chosen > 0 : openGroup === g.id
            return (
            <div key={g.id} className="border-b border-ink-100 last:border-b-0">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenGroup(open ? '' : g.id)}
                className="w-full min-h-11 py-2 flex items-center justify-between gap-3 text-left rounded-btn hover:bg-ink-50 transition-colors duration-fast"
              >
                <span className="font-display text-body font-semibold text-ink-900">{g.label}</span>
                <span className="flex items-center gap-2 shrink-0">
                  {chosen > 0 && (
                    <span className="h-6 min-w-6 px-2 inline-flex items-center justify-center rounded-pill bg-brand-600 text-white text-meta font-display font-semibold tabular-nums">
                      {chosen}
                    </span>
                  )}
                  <Icon.chevD className={`w-4 h-4 text-ink-500 transition-transform duration-fast ${open ? 'rotate-180' : ''}`} />
                </span>
              </button>
              {open && (
              <div className="pb-3 flex flex-wrap gap-2">
                {g.topics.map(t => {
                  const on = draft.services.includes(t.id)
                  // Disabled only when it would be a no-op — a ticked chip at the
                  // cap must stay pressable, or the cap becomes a trap.
                  const blocked = !on && atCap
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={on}
                      disabled={blocked}
                      onClick={() => toggleService(t.id)}
                      className={`h-11 px-4 rounded-pill border text-body font-display font-semibold transition-[background-color,border-color,transform] duration-fast motion-safe:active:scale-[0.97] ${
                        on
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : blocked
                            ? 'border-ink-100 text-ink-300 cursor-not-allowed'
                            : 'border-ink-200 text-ink-800 hover:border-ink-300 hover:bg-ink-50'
                      }`}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>
              )}
            </div>
            )
          })}
        </div>
      </Card>

      {/* ── Where ───────────────────────────────────────────────────────── */}
      <Card>
        <h2 className="font-display text-h3 font-bold text-ink-900">რომელ ქალაქებში მუშაობ</h2>
        <p className="mt-1 text-small text-ink-500">
          მოთხოვნა მხოლოდ არჩეული ქალაქებიდან მოგდის.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {data.cities.map(c => {
            const on = draft.areas.includes(c.id)
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleArea(c.id)}
                className={`h-11 px-4 rounded-pill border text-body font-display font-semibold transition-[background-color,border-color,transform] duration-fast motion-safe:active:scale-[0.97] ${
                  on
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-ink-200 text-ink-800 hover:border-ink-300 hover:bg-ink-50'
                }`}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      </Card>

      {/* ── The indicative price ────────────────────────────────────────── */}
      <Card>
        <h2 className="font-display text-h3 font-bold text-ink-900">ფასი</h2>
        <p className="mt-1 text-small text-ink-500">
          სავალდებულო არ არის. ცარიელი ნიშნავს, რომ ფასს ყოველ ჯერზე ამბობ.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">
              გამოძახება, ₾
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={draft.calloutFee ?? ''}
              onChange={e => patch({ calloutFee: num(e.target.value) })}
              className={FIELD}
              placeholder="30"
            />
          </label>
          <label className="block">
            <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">
              სამუშაო, ₾-დან
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={draft.priceFrom ?? ''}
              onChange={e => patch({ priceFrom: num(e.target.value) })}
              className={FIELD}
              placeholder="50"
            />
          </label>
        </div>
      </Card>

      {/* ── The face and the sentence ───────────────────────────────────
          ⚠️ ADDED 2026-08-18. Everything above this card — trades, cities,
          prices — was editable from day one, and the two fields a client reads
          FIRST were not. `photoUrl` is what draws the plate on every card in
          the catalogue; `about` is most of what distinguishes two plumbers.
          Both were written once by the approval and then unreachable. */}
      <Card>
        <h2 className="font-display text-h3 font-bold text-ink-900">ფოტო და აღწერა</h2>
        <p className="mt-1 text-small text-ink-600">ეს ჩანს კლიენტთან, სიაში.</p>

        <div className="mt-4">
          {/* Reuses the application's own uploader — same crop, same limits,
              same `kind=avatar` path. A second uploader for the same picture is
              a second set of rules to keep in step. */}
          <PhotoUploader
            value={draft.photoUrl ?? (data.hasPhoto && profileId ? `/api/masters/${profileId}/photo?v=${stamp}` : undefined)}
            onChange={url => patch({ photoUrl: url ?? null })}
          />
        </div>

        <label className="block mt-5">
          <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">
            შენ შესახებ
          </span>
          <textarea
            rows={4}
            maxLength={1500}
            value={draft.about ?? ''}
            onChange={e => patch({ about: e.target.value })}
            className="w-full px-3.5 py-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 placeholder-ink-400 focus:border-brand-500 outline-none resize-y transition-colors duration-fast"
            placeholder="რამდენ ხანს მუშაობ, რაში ხარ ძლიერი."
          />
        </label>
      </Card>

      {/* ── The master's own switch ─────────────────────────────────────── */}
      <Card>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.available}
            onChange={e => patch({ available: e.target.checked })}
            className="mt-1 w-5 h-5 accent-brand-600 shrink-0"
          />
          <span>
            <span className="block text-body font-display font-semibold text-ink-900">
              ახალი მოთხოვნები მომდის
            </span>
            <span className="block text-small text-ink-500 mt-0.5">
              მოხსენი, თუ დროებით ვერ იღებ სამუშაოს. სია შენარჩუნდება.
            </span>
          </span>
        </label>
      </Card>

      {error && (
        <div role="alert" className="rounded-field border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-body text-danger-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Btn onClick={save} disabled={status === 'saving'} aria-busy={status === 'saving'}>
          {status === 'saving' ? 'ინახება…' : 'შენახვა'}
        </Btn>
        {status === 'saved' && <span className="text-small text-ink-600">შენახულია.</span>}
      </div>
    </div>
  )
}

'use client'
// THE FORM — one screen, seven blocks, four of them optional.
//
// ⚠️ THE ORDER IS THE ARGUMENT. Cheap and identifying first (who, phone), then
// the two facts routing actually needs (trade, city), then the sentence, and
// only then the things that cost effort — photo, work photos, prices. Somebody
// who abandons at block 5 has still told us everything required to be routed
// work; somebody who abandons at block 2 has told us nothing. Putting the photo
// first would invert exactly that.
//
// ⚠️ EVERY BOUND COMES FROM lib/masterApplication. Nothing on this screen
// invents a limit — see that file's header for why, and lib/applyValidation's
// for the production failure that taught it.

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Container } from '@/components/Container'
import { PublicTopBar } from '@/components/PublicTopBar'
import { Footer } from '@/components/Footer'
import { Card } from '@/components/Card'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { PhotoUploader } from '../_expert/_upload'
import { MASTER, MASTER_KINDS, MASTER_KIND_LABEL, MASTER_STATUS_TEXT, type MasterKind } from '@/lib/masterApplication'
import { WorkPhotos } from './_workPhotos'

type Group = { id: string; label: string; topics: { id: string; label: string; alt?: string[] }[] }
type City = { id: string; label: string }

const FIELD =
  'w-full h-11 px-3.5 rounded-field border border-ink-200 bg-white text-body text-ink-900 ' +
  'placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none ' +
  'transition-colors duration-fast'

/** One block of the form. The heading carries the number so the page reads as a
 *  short list rather than an unbounded scroll — a form whose end you can see is
 *  a form people finish. */
/**
 * ⚠️ THE NUMBER IS COUNTED, NOT TYPED (2026-08-20).
 *
 * Every block used to carry a hard-coded `n={3}`. The moment one of them
 * stopped rendering — „სად მუშაობ" did, the day the site went Tbilisi-only —
 * the form counted „1 2 4 5 6 7" on screen. A numbered list that skips a
 * number tells the person something is missing and that they should look for
 * it, which is the opposite of what a hidden block is for.
 *
 * The counter is a plain local declared in the component body and incremented
 * at each call site (`n={++blockNo}`). JSX children evaluate top-to-bottom in
 * one pass, so a block inside a `&&` that is false never takes a number. A
 * context holding a mutable counter was tried first and rejected: mutating a
 * value returned from `useContext` is exactly what the React compiler forbids,
 * and it was reaching for machinery a local variable already does.
 */
function Block({ n, title, hint, field, children }: {
  n: number; title: string; hint?: string
  /** Makes the whole block a jump target for the „დარჩა" list — see jumpTo. */
  field?: string
  children: React.ReactNode
}) {
  return (
    <Card className="mt-4" data-field={field}>
      <div className="flex items-baseline gap-2">
        <span className="text-micro uppercase text-brand-700 tabular-nums">{n}</span>
        <h2 className="font-display text-h3 font-bold text-ink-900">{title}</h2>
      </div>
      {hint && <p className="mt-1 text-small text-ink-600 leading-relaxed">{hint}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  )
}

/** A selectable option (kind, topic, city) — `aria-pressed`, brand fill when
 *  on. NOT the catalogue filter chip; it only shares the pill shape. */
function PickChip({ on, onClick, children, disabled }: {
  on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`h-11 px-4 rounded-pill border font-display text-body font-semibold transition-[background-color,border-color,transform] duration-fast motion-safe:active:scale-[0.97] disabled:opacity-40 ${
        on ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-ink-200 text-ink-700 hover:border-ink-300 hover:bg-ink-50'
      }`}
    >
      {children}
    </button>
  )
}

export function MasterApplyClient({ email, name, phone: accountPhone = '', me }: {
  email: string; name: string; phone?: string; me: any
}) {
  const router = useRouter()

  const [groups, setGroups] = useState<Group[]>([])
  const [cities, setCities] = useState<City[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const [kind, setKind] = useState<MasterKind>('INDIVIDUAL')
  const [fullName, setFullName] = useState(name)
  // Seeded from the account — see page.tsx for why it was not.
  const [phone, setPhone] = useState(accountPhone)
  const [companyName, setCompanyName] = useState('')
  const [taxId, setTaxId] = useState('')
  const [services, setServices] = useState<string[]>([])
  const [areas, setAreas] = useState<string[]>([])
  /** Which service group is open. `null` = „nobody has chosen yet", which lets
   *  a group that already holds a tick open itself; `''` = deliberately closed. */
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  /** What they typed into the service search. Two characters before it filters —
   *  one letter matches half the catalogue and reads as broken. */
  const [query, setQuery] = useState('')
  /** Numbers the blocks in render order — see Block. Reset on every render. */
  let blockNo = 0
  /** `{ topicId: „60" }` — the raw input strings, cleaned at submit. Keyed by
   *  the ticks in `services`, so nothing here has to be named twice. */
  const [priceList, setPriceList] = useState<Record<string, string>>({})

  /**
   * What the typed query reaches.
   *
   * ⚠️ IT SEARCHES `alt` TOO, and that is most of its value. The catalogue's
   * topics carry the words people actually type — „დამლაგებელი" for
   * „ბინის დალაგება", „სანტექნიკოსი" for the plumbing rows (lib/requestTopics
   * → Topic.alt). A search that only matched the printed label would fail the
   * exact person it is for: the one who describes their trade in their own
   * words rather than ours.
   */
  const hits = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return groups
      .flatMap(g => g.topics)
      .filter(t => t.label.toLowerCase().includes(q) || (t.alt ?? []).some((a: string) => a.toLowerCase().includes(q)))
      .slice(0, 24)
  }, [query, groups])
  const [about, setAbout] = useState('')
  const [yearsExp, setYearsExp] = useState('')
  const [calloutFee, setCalloutFee] = useState('')
  const [priceFrom, setPriceFrom] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | undefined>()
  const [workPhotos, setWorkPhotos] = useState<string[]>([])

  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  /* ═══════════ THE DRAFT ═══════════════════════════════════════════════
   *
   * ⚠️ THIS FORM LOST EVERYTHING TO A PHONE CALL (fixed 2026-08-20). The
   * expert door has saved its draft to localStorage since it was written; this
   * one saved nothing. Six blocks, a photo upload, and an incoming call —
   * which on a phone is not an edge case, it is Tuesday — and the applicant
   * starts again from „ვინ ხარ". Whoever measured the funnel would have seen
   * abandonment and never the cause.
   *
   * Photos are deliberately NOT stored: they are base64 data URIs, megabytes
   * each, and localStorage is a ~5MB budget shared with everything else on the
   * origin. Losing an upload is annoying; a quota error that silently drops the
   * WHOLE draft is the bug this is meant to prevent.
   */
  const DRAFT_KEY = 'mcodne:join:work'

  // Restore once, before the server answers — a draft is the applicant's own
  // work and outranks an empty form, but never a submitted application (the
  // fetch below overwrites it, which is correct: that is the server's copy).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const d = JSON.parse(raw) as Record<string, unknown>
      if (typeof d.kind === 'string') setKind(d.kind as MasterKind)
      if (typeof d.fullName === 'string') setFullName(d.fullName)
      if (typeof d.phone === 'string') setPhone(d.phone)
      if (typeof d.companyName === 'string') setCompanyName(d.companyName)
      if (typeof d.taxId === 'string') setTaxId(d.taxId)
      if (Array.isArray(d.services)) setServices(d.services as string[])
      if (typeof d.about === 'string') setAbout(d.about)
      if (typeof d.yearsExp === 'string') setYearsExp(d.yearsExp)
      if (typeof d.calloutFee === 'string') setCalloutFee(d.calloutFee)
      if (d.priceList && typeof d.priceList === 'object') setPriceList(d.priceList as Record<string, string>)
    } catch { /* a corrupt draft is not worth a broken form */ }
  }, [])

  // Save on every change. Quota is the one failure that matters and it is
  // swallowed: a form that throws while you type is worse than a lost draft.
  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({
        kind, fullName, phone, companyName, taxId, services, about, yearsExp, calloutFee, priceList,
      }))
    } catch { /* full or blocked — carry on */ }
  }, [kind, fullName, phone, companyName, taxId, services, about, yearsExp, calloutFee, priceList])

  useEffect(() => {
    let live = true
    fetch('/api/master-applications')
      .then(r => r.json())
      .then(d => {
        // ⚠️ `setLoaded(true)` BEFORE THE BAIL, NOT AFTER IT (2026-08-18). The
        // early return skipped it, so on any non-ok response `loaded` stayed
        // false — which is the flag the „სია ვერ ჩაიტვირთა" message is gated
        // on. The fallback for a failed fetch was unreachable on exactly the
        // failure it was written for, and the applicant got two empty required
        // blocks plus a hint naming controls that were not on screen.
        if (!live) return
        if (!d?.ok) { setLoaded(true); return }
        setGroups(d.groups ?? [])
        const cs = d.cities ?? []
        setCities(cs)
        // ⚠️ ONE CITY IS ANSWERED FOR THEM, not left blank. The block above is
        // hidden while `cities.length === 1`, and `areas` is required by the
        // submit — so without this the form would be unsubmittable and the
        // reason would be a control nobody can see. Seeding it here keeps the
        // row identical to what the visible chip used to write.
        if (cs.length === 1) setAreas([cs[0].id])
        const a = d.application
        if (a) {
          // Re-seeding after NEEDS_REVISION. The photos are NOT sent back (see
          // the route) — the applicant re-uploads if they changed, and the
          // server keeps what is there otherwise.
          setStatus(a.status); setNote(a.moderatorNote ?? null)
          setKind(a.kind); setFullName(a.fullName); setPhone(a.phone)
          setCompanyName(a.companyName ?? ''); setTaxId(a.taxId ?? '')
          setServices(a.services ?? []); setAreas(a.areas ?? [])
          setAbout(a.about ?? '')
          setYearsExp(a.yearsExp == null ? '' : String(a.yearsExp))
          setCalloutFee(a.calloutFee == null ? '' : String(a.calloutFee))
          setPriceFrom(a.priceFrom == null ? '' : String(a.priceFrom))
          // The map comes back as `{ topicId: lari }`; the inputs hold strings.
          setPriceList(Object.fromEntries(
            Object.entries((a.priceList ?? {}) as Record<string, unknown>)
              .filter(([, v]) => Number.isFinite(Number(v)))
              .map(([k, v]) => [k, String(v)]),
          ))
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
    return () => { live = false }
  }, [])

  const toggle = (list: string[], set: (v: string[]) => void, id: string, max: number) => {
    set(list.includes(id) ? list.filter(x => x !== id) : list.length >= max ? list : [...list, id])
  }

  const num = (v: string) => {
    const n = parseInt(v, 10)
    return v.trim() === '' || Number.isNaN(n) ? null : n
  }

  // The same three the endpoint requires, said before the button is pressed.
  // Everything else on this form is optional and the button must not imply
  // otherwise.
  /* ⚠️ EACH MISSING ANSWER CARRIES ITS FIELD (2026-08-20). This was a list of
   * words — „დარჩა: ტელეფონი, სერვისი, შენ შესახებ" — under a disabled button,
   * on a form that is ~2600px tall. Naming what is missing is better than
   * greying the button out silently, but it still leaves the applicant to
   * scroll and hunt for a control they cannot see from where they are standing.
   * Each entry is now a button that scrolls to its own block and focuses it. */
  const missing: { label: string; field: string }[] = []
  const need = (ok: boolean, label: string, field: string) => { if (!ok) missing.push({ label, field }) }
  need(fullName.trim().length >= MASTER.NAME_MIN, 'სახელი', 'fullName')
  need(phone.trim().length >= 9, 'ტელეფონი', 'phone')
  need(kind !== 'COMPANY' || !!companyName.trim(), 'კომპანიის სახელი', 'companyName')
  need(services.length > 0, 'სერვისი', 'services')
  need(areas.length > 0, 'ქალაქი', 'areas')
  need(about.trim().length >= MASTER.ABOUT_MIN, 'შენ შესახებ', 'about')

  /** Scrolls to the block that owns a missing answer and puts the cursor in it.
   *  `data-field` is already on these containers — the same hook the expert
   *  form's error jump uses, so the two doors behave the same way. */
  const jumpTo = (field: string) => {
    const el = document.querySelector<HTMLElement>(`[data-field="${field}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const input = el.matches('input,textarea') ? el : el.querySelector<HTMLElement>('input,textarea,button')
    input?.focus({ preventScroll: true })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (missing.length > 0 || sending) return
    setSending(true); setErr(null)
    try {
      const res = await fetch('/api/master-applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind, fullName: fullName.trim(), phone: phone.trim(),
          companyName: kind === 'COMPANY' ? companyName.trim() : null,
          taxId: kind === 'COMPANY' ? (taxId.trim() || null) : null,
          services, areas, about: about.trim(),
          yearsExp: num(yearsExp), calloutFee: num(calloutFee), priceFrom: num(priceFrom),
          // ⚠️ CLEANED HERE AND VALIDATED AGAIN ON THE SERVER. Only keys the
          // provider actually ticked, only positive numbers — a blank input is
          // „ask" and must not travel as 0, which would print „0₾" on a card.
          priceList: Object.fromEntries(
            services
              .map(id => [id, num(priceList[id] ?? '')] as const)
              .filter((e): e is readonly [string, number] => typeof e[1] === 'number' && e[1] > 0),
          ),
          photoUrl: photoUrl ?? null,
          workPhotos,
        }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok || !d?.ok) {
        setErr(d?.message || 'ვერ გაიგზავნა — სცადე თავიდან.')
        setSending(false)
        return
      }
      // The server has it now, so the draft is no longer the applicant's only
      // copy — and leaving it behind would re-fill the form the next time they
      // open the page, over the top of what was submitted.
      try { window.localStorage.removeItem(DRAFT_KEY) } catch { /* fine */ }
      setDone(true)
      router.refresh()
    } catch {
      setErr('ვერ გაიგზავნა — სცადე თავიდან.')
      setSending(false)
    }
  }

  // ⚠️ THE PUBLIC CHROME, not the provider shell. Somebody filling this in is
  // not a provider yet — dropping them into /provider's bar would show a
  // workspace they cannot use and hide the way back to the site.
  const chrome = (body: React.ReactNode) => (
    <>
      <PublicTopBar activeHref="/join" initialUser={me} />
      <main>{body}</main>
      <Footer />
    </>
  )

  if (done) {
    return chrome(
      <Container size="narrow" className="py-14">
        <Card>
          <h1 className="font-display text-h2 font-bold text-ink-900">განაცხადი გამოგზავნილია</h1>
          <p className="mt-2 text-body text-ink-600 leading-relaxed">
            გადავამოწმებთ და დაგიკავშირდებით ამ ნომერზე: {phone}
          </p>
          {!photoUrl && (
            // The soft gate, said at the one moment it is actionable — they are
            // finished, nothing is blocked, and adding it now costs a minute.
            // See lib/masterApplication → approvalBlockers.
            <p className="mt-3 text-small text-ink-600 leading-relaxed">
              ფოტო არ ატვირთე. დამტკიცებამდე დაგჭირდება — შეგიძლია ახლავე დაამატო.
            </p>
          )}
          {/* ⚠️ THE SENTENCE ABOVE OFFERED AN ACTION AND THE SCREEN HAD NO
              CONTROL FOR IT (2026-08-18). „შეგიძლია ახლავე დაამატო" sat over a
              single „სერვისები" button leading to the CLIENT page — so the one
              thing standing between this person and approval was named, and
              then the only way to do it was to retype the URL.

              The photo button is FIRST and primary when it is missing, because
              it is the only blocker left; when the photo is there it is not
              drawn at all and „სერვისები" is the whole footer. */}
          <div className="mt-5 flex flex-wrap gap-3">
            {!photoUrl && (
              <Btn href="/join?can=WORK">ფოტოს დამატება</Btn>
            )}
            <Btn href="/experts" variant="secondary">ექსპერტები</Btn>
          </div>
        </Card>
      </Container>,
    )
  }

  return chrome(
    <Container size="content" className="py-8 sm:py-12">
      <h1 className="font-display text-h1 font-bold text-ink-900 tracking-tight">დაარეგისტრირე შენი სერვისი</h1>
      <p className="mt-2 text-body text-ink-600 max-w-[52ch]">
        შეავსე ერთხელ. მოთხოვნები მხოლოდ შენი მიმართულების და შენი ქალაქის მოგდის.
      </p>

      {/* ⚠️ THE `&& note` GUARD IS GONE (2026-08-18). The endpoint refuses a
          revision without a note, so it cannot be empty today — but the guard
          meant that the day it could, the applicant would get a bare pre-filled
          form and no explanation at all. A status is worth saying with or
          without a reason attached. */}
      {status === 'NEEDS_REVISION' && (
        <Card className="mt-5 border-warning-600">
          <p className="font-display text-body font-semibold text-ink-900">{MASTER_STATUS_TEXT.NEEDS_REVISION}</p>
          {note && <p className="mt-1 text-body text-ink-700">{note}</p>}
        </Card>
      )}
      {/* ⚠️ REJECTED WAS A SILENT DEAD END, AND IT LOOPED (2026-08-18). Neither
          branch matched it, so somebody whose application was refused saw a
          pre-filled form with „ხელახლა გამოგზავნა" on the button, no reason,
          and an endpoint that cheerfully flipped them back to SUBMITTED. They
          could do that forever and never learn anything.

          `MASTER_STATUS_TEXT.REJECTED` existed the whole time and was rendered
          nowhere. Re-submission stays possible — a refusal is usually about
          something fixable and a locked form gives them nothing to do — but the
          reason is now on screen, which is the difference between a second
          attempt and a loop. */}
      {status === 'REJECTED' && (
        <Card className="mt-5 border-danger-200">
          <p className="font-display text-body font-semibold text-ink-900">{MASTER_STATUS_TEXT.REJECTED}</p>
          {note && <p className="mt-1 text-body text-ink-700">{note}</p>}
        </Card>
      )}
      {status === 'SUBMITTED' && (
        <Card className="mt-5">
          <p className="text-body text-ink-700">{MASTER_STATUS_TEXT.SUBMITTED}</p>
          <p className="mt-1 text-small text-ink-500">შეგიძლია შეცვალო და ხელახლა გამოგზავნო.</p>
        </Card>
      )}

      <form onSubmit={submit} noValidate>
        <Block n={++blockNo} title="ვინ ხარ">
          <div className="flex flex-wrap gap-2">
            {MASTER_KINDS.map(k => (
              <PickChip key={k} on={kind === k} onClick={() => setKind(k)}>{MASTER_KIND_LABEL[k]}</PickChip>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">
                {kind === 'COMPANY' ? 'საკონტაქტო პირი' : 'სახელი და გვარი'}
              </span>
              <input data-field="fullName" className={FIELD} value={fullName} onChange={e => setFullName(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">ტელეფონი</span>
              <input data-field="phone" className={FIELD} value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="5XX XX XX XX" />
            </label>
            {kind === 'COMPANY' && (
              <>
                <label className="block">
                  <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">კომპანიის სახელი</span>
                  <input data-field="companyName" className={FIELD} value={companyName} onChange={e => setCompanyName(e.target.value)} />
                </label>
                <label className="block">
                  <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">
                    საიდენტიფიკაციო კოდი <span className="font-normal text-ink-400">არასავალდებულო</span>
                  </span>
                  <input className={FIELD} value={taxId} onChange={e => setTaxId(e.target.value)} inputMode="numeric" />
                </label>
              </>
            )}
          </div>
          <p className="mt-3 text-meta text-ink-500">ანგარიში: {email}</p>
        </Block>

        {/* `data-field` is the jump target for the „დარჩა" list — see jumpTo. */}
        <Block n={++blockNo} title="რას აკეთებ" field="services"
          hint={`აირჩიე მხოლოდ ის, რასაც მართლა აკეთებ — მოთხოვნებიც მხოლოდ ეს მოგდის. მაქსიმუმ ${MASTER.MAX_SERVICES}.`}
        >
          {/* ⚠️ TYPE, DON'T SCROLL (2026-08-20). This block rendered all
              thirty-nine chips at once, in eight groups, expanded — a wall on a
              390px screen, and a wall the applicant has to READ before finding
              the two rows that are theirs. A plumber does not need
              „ბალახის თიბვა" on screen at all.

              The field is first because it is the fastest path for somebody who
              already knows what they do: „ონკ" reaches „ონკანი და მილი" in
              three keystrokes. The groups stay underneath for somebody who
              wants to browse, closed, one open at a time. Same shape the client
              side already uses on the intake's first step — one product, one
              way of picking from a long list.

              What is CHOSEN is always on screen, above the search, because on a
              form this long the answer scrolls away from the question. */}
          {services.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-3 mb-3 border-b border-ink-100">
              {services.map(id => {
                const t = groups.flatMap(g => g.topics).find(x => x.id === id)
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggle(services, setServices, id, MASTER.MAX_SERVICES)}
                    aria-label={`მოხსენი ${t?.label ?? id}`}
                    className="inline-flex items-center gap-1.5 h-9 pl-3 pr-2 rounded-pill border border-brand-300 bg-brand-50 text-brand-800 font-display text-small font-semibold transition-colors duration-fast hover:bg-brand-100"
                  >
                    {t?.label ?? id}
                    <Icon.x aria-hidden className="w-3.5 h-3.5" />
                  </button>
                )
              })}
            </div>
          )}

          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="მოძებნე — ონკანი, კონდიციონერი, დალაგება…"
            className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-500 outline-none transition-colors duration-fast"
          />

          {query.trim().length >= 2 ? (
            // The hits, flat and ungrouped: somebody who typed knows what they
            // want, and a group heading over one chip is furniture.
            <div className="mt-3 flex flex-wrap gap-2">
              {hits.length === 0
                ? <p className="text-small text-ink-500">ვერაფერი მოიძებნა — სცადე სხვა სიტყვა ან გახსენი სია ქვემოთ.</p>
                : hits.map(t => (
                  <PickChip
                    key={t.id}
                    on={services.includes(t.id)}
                    disabled={!services.includes(t.id) && services.length >= MASTER.MAX_SERVICES}
                    onClick={() => toggle(services, setServices, t.id, MASTER.MAX_SERVICES)}
                  >
                    {t.label}
                  </PickChip>
                ))}
            </div>
          ) : (
            <div className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
              {groups.map(g => {
                const picked = g.topics.filter(t => services.includes(t.id)).length
                const open = openGroup === g.id
                return (
                  <div key={g.id}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenGroup(open ? '' : g.id)}
                      className="w-full min-h-[48px] py-3 flex items-center justify-between gap-3 text-left"
                    >
                      <span className="font-display text-small font-semibold text-ink-900">{g.label}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        {/* A closed group has to say whether the answer is
                            inside it, or closing one hides work already done. */}
                        {picked > 0 && (
                          <span className="inline-flex items-center h-6 px-2 rounded-pill border border-brand-200 text-brand-700 font-display text-meta font-semibold tabular-nums">
                            {picked}
                          </span>
                        )}
                        <Icon.chevD aria-hidden className={`w-4 h-4 text-ink-400 transition-transform duration-fast ${open ? 'rotate-180' : ''}`} />
                      </span>
                    </button>
                    {open && (
                      <div className="pb-4 flex flex-wrap gap-2">
                        {g.topics.map(t => (
                          <PickChip
                            key={t.id}
                            on={services.includes(t.id)}
                            disabled={!services.includes(t.id) && services.length >= MASTER.MAX_SERVICES}
                            onClick={() => toggle(services, setServices, t.id, MASTER.MAX_SERVICES)}
                          >
                            {t.label}
                          </PickChip>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {loaded && groups.length === 0 && (
            <p className="text-small text-ink-500">სია ვერ ჩაიტვირთა — გადატვირთე გვერდი.</p>
          )}
        </Block>

        {/* ⚠️ NOT ASKED WHILE THERE IS ONE CITY (2026-08-20). The same rule the
            intake already applies: a block whose list holds a single chip is
            the form performing a choice nobody has, and it was the third of
            seven — read as work before the questions that matter. The value is
            still SENT (see the effect that seeds `areas`), so the row is
            written exactly as it was. Serve a second city and it returns by
            itself — CITIES in lib/requestTopics. */}
        {cities.length > 1 && (
          <Block n={++blockNo} title="სად მუშაობ" hint="სადაც გამოძახებაზე წახვალ.">
            <div className="flex flex-wrap gap-2">
              {cities.map(c => (
                <PickChip key={c.id} on={areas.includes(c.id)} onClick={() => toggle(areas, setAreas, c.id, cities.length)}>
                  {c.label}
                </PickChip>
              ))}
            </div>
          </Block>
        )}

        <Block n={++blockNo} title="შენ შესახებ" hint="რამდენ ხანს მუშაობ, რაში ხარ ძლიერი. ეს კლიენტს ჩვენებია.">
          <textarea
            rows={5}
            maxLength={MASTER.ABOUT_MAX}
            data-field="about"
            value={about}
            onChange={e => setAbout(e.target.value)}
            className="w-full px-3.5 py-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none resize-y transition-colors duration-fast"
            placeholder="12 წელია ვმუშაობ სანტექნიკაზე. ბოილერი, კანალიზაცია, გათბობა. ჩემი ინსტრუმენტით მოვდივარ."
          />
          {about.trim().length > 0 && about.trim().length < MASTER.ABOUT_MIN && (
            <p className="mt-1 text-meta text-danger-700">დაწერე ცოტა უფრო ვრცლად</p>
          )}
          {/* `flex-wrap` — measured at 390px the four children ran to 372px
              inside a 366px card. Four items on one line is fine at any width
              that fits them and must wrap at the one that does not. */}
          <label className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-small text-ink-600">გამოცდილება</span>
            <input
              type="number" min={0} max={70} inputMode="numeric"
              value={yearsExp} onChange={e => setYearsExp(e.target.value)}
              aria-label="გამოცდილება წლებში"
              className="w-20 h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 tabular-nums focus:border-brand-500 outline-none transition-colors duration-fast"
            />
            <span className="text-small text-ink-600">წელი</span>
            <span className="text-meta text-ink-400">არასავალდებულო</span>
          </label>
        </Block>

        <Block n={++blockNo} title={kind === 'COMPANY' ? 'ლოგო ან ფოტო' : 'შენი ფოტო'}
          hint={
            kind === 'COMPANY'
              ? 'კომპანიის ლოგო. დამტკიცებამდე დაგჭირდება.'
              : 'კლიენტთან სახლში მიდიხარ — სახე ნდობის ნახევარია. დამტკიცებამდე დაგჭირდება.'
          }
        >
          <PhotoUploader value={photoUrl} onChange={setPhotoUrl} />
        </Block>

        <Block n={++blockNo} title="სამუშაოს ფოტოები"
          hint={`თუ გაქვს. მაქსიმუმ ${MASTER.MAX_WORK_PHOTOS}. არასავალდებულოა.`}
        >
          <WorkPhotos value={workPhotos} onChange={setWorkPhotos} max={MASTER.MAX_WORK_PHOTOS} />
        </Block>

        <Block n={++blockNo} title="ფასი" hint="მიუთითე იმ სერვისებზე, რომლებზეც წინასწარ იცი. დანარჩენს ყოველ მოთხოვნაზე თვითონ წერ.">
          {/* ⚠️ NOTHING IS NAMED TWICE (2026-08-20). This block used to ask for
              two numbers about the whole person — „გამოძახება 30₾" and
              „სამუშაო 50₾-დან" — which say what a VISIT costs and nothing about
              what a JOB costs. The catalogue sells services, so the card wants
              „ბინის დალაგება — 60₾", and neither number could produce it.

              The obvious fix — „add a service, type its name, type its price" —
              would ask the provider to name the very rows they ticked two
              blocks up. So the list IS those rows: no typing, no second
              vocabulary, and nothing that can drift out of sync with the ticks.
              Blank stays blank: „ask" is an honest answer for a trade where the
              price depends on what is behind the wall, and the card says
              „ფასს შემოგთავაზებს" for it. */}
          {services.length === 0 ? (
            <p className="text-small text-ink-500">ჯერ აირჩიე სერვისები — ფასს მერე მიუთითებ.</p>
          ) : (
            <div className="divide-y divide-ink-100 border-t border-ink-100">
              {services.map(id => {
                const t = groups.flatMap(g => g.topics).find(x => x.id === id)
                return (
                  <label key={id} className="flex items-center justify-between gap-4 py-3">
                    <span className="min-w-0 font-display text-small font-semibold text-ink-900 truncate">{t?.label ?? id}</span>
                    <span className="inline-flex items-center gap-2 shrink-0">
                      <input
                        type="number" min={1} max={1000000} inputMode="numeric"
                        value={priceList[id] ?? ''}
                        onChange={e => setPriceList({ ...priceList, [id]: e.target.value })}
                        aria-label={`${t?.label ?? id} — ფასი`}
                        placeholder="—"
                        className="w-24 h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 tabular-nums text-right focus:border-brand-500 outline-none transition-colors duration-fast"
                      />
                      <span className="text-small text-ink-600">₾</span>
                    </span>
                  </label>
                )
              })}
            </div>
          )}

          {/* The call-out fee survives, because it is a real and separate thing:
              what it costs to come and look, before anybody knows what the job
              is. It is not a price for a service and never was, which is why it
              sits under a rule rather than beside the list. */}
          <label className="mt-4 pt-4 border-t border-ink-100 flex items-center justify-between gap-4">
            <span className="min-w-0">
              <span className="block font-display text-small font-semibold text-ink-900">გამოძახება</span>
              <span className="block text-meta text-ink-500">მისვლის ფასი, სამუშაოს გარეშე. არასავალდებულო.</span>
            </span>
            <span className="inline-flex items-center gap-2 shrink-0">
              <input
                type="number" min={1} max={100000} inputMode="numeric"
                value={calloutFee} onChange={e => setCalloutFee(e.target.value)}
                aria-label="გამოძახების ფასი"
                placeholder="—"
                className="w-24 h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 tabular-nums text-right focus:border-brand-500 outline-none transition-colors duration-fast"
              />
              <span className="text-small text-ink-600">₾</span>
            </span>
          </label>
        </Block>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Btn type="submit" size="lg" disabled={missing.length > 0 || sending}>
            {sending ? 'იგზავნება…' : status ? 'ხელახლა გამოგზავნა' : 'გამოგზავნა'}
          </Btn>
          {/* Names what is missing rather than just greying the button out — a
              disabled control with no reason is a dead end on a long form. */}
          {missing.length > 0 && (
            <span className="text-small text-ink-500 inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
              დარჩა:
              {missing.map(m => (
                <button
                  key={m.field}
                  type="button"
                  onClick={() => jumpTo(m.field)}
                  className="font-display font-semibold text-brand-700 underline underline-offset-2 decoration-brand-300 hover:text-brand-800 transition-colors duration-fast"
                >
                  {m.label}
                </button>
              ))}
            </span>
          )}
        </div>
        {err && (
          <p className="mt-3 text-small text-danger-700 inline-flex items-center gap-1.5">
            <Icon.warn className="w-4 h-4 shrink-0" /> {err}
          </p>
        )}
      </form>
    </Container>,
  )
}

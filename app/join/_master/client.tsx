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

import { useEffect, useState } from 'react'
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

type Group = { id: string; label: string; topics: { id: string; label: string }[] }
type City = { id: string; label: string }

const FIELD =
  'w-full h-11 px-3.5 rounded-field border border-ink-200 bg-white text-body text-ink-900 ' +
  'placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none ' +
  'transition-colors duration-fast'

/** One block of the form. The heading carries the number so the page reads as a
 *  short list rather than an unbounded scroll — a form whose end you can see is
 *  a form people finish. */
function Block({ n, title, hint, children }: {
  n: number; title: string; hint?: string; children: React.ReactNode
}) {
  return (
    <Card className="mt-4">
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
  const [about, setAbout] = useState('')
  const [yearsExp, setYearsExp] = useState('')
  const [calloutFee, setCalloutFee] = useState('')
  const [priceFrom, setPriceFrom] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | undefined>()
  const [workPhotos, setWorkPhotos] = useState<string[]>([])

  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

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
        setCities(d.cities ?? [])
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
  const missing: string[] = []
  if (fullName.trim().length < MASTER.NAME_MIN) missing.push('სახელი')
  if (phone.trim().length < 9) missing.push('ტელეფონი')
  if (kind === 'COMPANY' && !companyName.trim()) missing.push('კომპანიის სახელი')
  if (services.length === 0) missing.push('სერვისი')
  if (areas.length === 0) missing.push('ქალაქი')
  if (about.trim().length < MASTER.ABOUT_MIN) missing.push('შენ შესახებ')

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
        <Block n={1} title="ვინ ხარ">
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
              <input className={FIELD} value={fullName} onChange={e => setFullName(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">ტელეფონი</span>
              <input className={FIELD} value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="5XX XX XX XX" />
            </label>
            {kind === 'COMPANY' && (
              <>
                <label className="block">
                  <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">კომპანიის სახელი</span>
                  <input className={FIELD} value={companyName} onChange={e => setCompanyName(e.target.value)} />
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

        <Block
          n={2}
          title="რას აკეთებ"
          hint={`აირჩიე მხოლოდ ის, რასაც მართლა აკეთებ — მოთხოვნებიც მხოლოდ ეს მოგდის. მაქსიმუმ ${MASTER.MAX_SERVICES}.`}
        >
          {groups.map(g => (
            <div key={g.id} className="mt-4 first:mt-0">
              <p className="text-small font-display font-semibold text-ink-800">{g.label}</p>
              <div className="mt-2 flex flex-wrap gap-2">
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
            </div>
          ))}
          {loaded && groups.length === 0 && (
            <p className="text-small text-ink-500">სია ვერ ჩაიტვირთა — გადატვირთე გვერდი.</p>
          )}
        </Block>

        <Block n={3} title="სად მუშაობ" hint="სადაც გამოძახებაზე წახვალ.">
          <div className="flex flex-wrap gap-2">
            {cities.map(c => (
              <PickChip key={c.id} on={areas.includes(c.id)} onClick={() => toggle(areas, setAreas, c.id, cities.length)}>
                {c.label}
              </PickChip>
            ))}
          </div>
        </Block>

        <Block n={4} title="შენ შესახებ" hint="რამდენ ხანს მუშაობ, რაში ხარ ძლიერი. ეს კლიენტს ჩვენებია.">
          <textarea
            rows={5}
            maxLength={MASTER.ABOUT_MAX}
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

        <Block
          n={5}
          title={kind === 'COMPANY' ? 'ლოგო ან ფოტო' : 'შენი ფოტო'}
          hint={
            kind === 'COMPANY'
              ? 'კომპანიის ლოგო. დამტკიცებამდე დაგჭირდება.'
              : 'კლიენტთან სახლში მიდიხარ — სახე ნდობის ნახევარია. დამტკიცებამდე დაგჭირდება.'
          }
        >
          <PhotoUploader value={photoUrl} onChange={setPhotoUrl} />
        </Block>

        <Block
          n={6}
          title="სამუშაოს ფოტოები"
          hint={`თუ გაქვს. მაქსიმუმ ${MASTER.MAX_WORK_PHOTOS}. არასავალდებულოა.`}
        >
          <WorkPhotos value={workPhotos} onChange={setWorkPhotos} max={MASTER.MAX_WORK_PHOTOS} />
        </Block>

        <Block n={7} title="ფასი" hint="სავარაუდო. კონკრეტულ ფასს ყოველ მოთხოვნაზე თვითონ წერ. არასავალდებულოა.">
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2">
              <span className="text-small text-ink-600">გამოძახება</span>
              <input
                type="number" min={1} max={100000} inputMode="numeric"
                value={calloutFee} onChange={e => setCalloutFee(e.target.value)}
                aria-label="გამოძახების ფასი"
                className="w-24 h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 tabular-nums focus:border-brand-500 outline-none transition-colors duration-fast"
              />
              <span className="text-small text-ink-600">₾</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <span className="text-small text-ink-600">სამუშაო</span>
              <input
                type="number" min={1} max={1000000} inputMode="numeric"
                value={priceFrom} onChange={e => setPriceFrom(e.target.value)}
                aria-label="სამუშაოს ფასი, დან"
                className="w-24 h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 tabular-nums focus:border-brand-500 outline-none transition-colors duration-fast"
              />
              <span className="text-small text-ink-600">₾-დან</span>
            </label>
          </div>
        </Block>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Btn type="submit" size="lg" disabled={missing.length > 0 || sending}>
            {sending ? 'იგზავნება…' : status ? 'ხელახლა გამოგზავნა' : 'გამოგზავნა'}
          </Btn>
          {/* Names what is missing rather than just greying the button out — a
              disabled control with no reason is a dead end on a long form. */}
          {missing.length > 0 && (
            <span className="text-small text-ink-500">
              დარჩა: {missing.join(', ')}
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

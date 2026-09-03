'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PublicTopBar } from '@/components/PublicTopBar'
import type { Me } from '@/lib/me'
import { Container } from '@/components/Container'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { useMe } from '@/lib/me'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'
import { showJoinInvite } from '@/lib/capabilities'
// Resolve the help widget's topic IDS back into their questions — one source,
// so a reworded question reads correctly here too.
import { ALL_TOPICS } from '@/lib/helpTopics'
import { Illustration } from '@/components/Illustration'
import { FIELD_ERROR_BORDER, useFault } from '@/components/FieldError'
import { emailFormatError } from '@/lib/emailRule'
import { validationIssueMessage } from '@/lib/validationMessages'
import { actionError } from '@/lib/actionErrors'

/* ⚠️ THE FORM MARKED A FIELD AND NEVER SAID WHY (fixed 2026-08-31). It had
 * `aria-invalid` and it focused the offending box — more than most screens on
 * this site — but the SENTENCE was a strip at the bottom of the card, wired to
 * nothing. A screen reader announced „invalid" on an unnamed problem, and a
 * sighted reader got a red border in one place and an explanation in another.
 * The message is on the field now, and `aria-describedby` ties the two.
 *
 * ⚠️ AND THE RULES WERE THE BROWSER'S. `required` + `minLength` meant Chrome
 * refused the submit with its own bubble, in ITS language, before this file's
 * handler ran — on a Georgian site. The same three rules the route parses with
 * (`name` min 2, a real `email`, `message` min 10) are asked here now, in
 * Georgian, from lib/validationMessages — so nothing is lost by `noValidate`. */
type Topic = 'general' | 'expert' | 'billing' | 'press' | 'other'
type Status = 'idle' | 'sending' | 'ok' | 'error'

// Map server error codes to user-facing Georgian copy — never surface raw codes.
// RATE_LIMITED and INVALID are shared (lib/actionErrors); this form keeps its
// OWN default, which is older and softer than „ვერ შესრულდა" — a contact form
// that fails has not failed to do anything the writer can retry differently.
const contactErrorText = (code?: string) =>
  actionError(code, {}, 'დაფიქსირდა შეცდომა — სცადე თავიდან.')

const TOPICS: { v: Topic; l: string }[] = [
  { v: 'general', l: 'ზოგადი კითხვა' },
  { v: 'expert', l: 'ექსპერტთა შერჩევა' },
  { v: 'billing', l: 'გადახდა / ინვოისი' },
  { v: 'press', l: 'პრესა / პარტნიორობა' },
  { v: 'other', l: 'სხვა' },
]

const CHANNELS = [
  {
    icon: <Icon.mail className="w-5 h-5" />,
    label: 'ელფოსტა',
    value: SUPPORT_EMAIL,
    href: `mailto:${SUPPORT_EMAIL}`,
    hint: 'პასუხი 24 საათში',
  },
  // Display values describe the actual destination (internal pages) — no
  // fake subdomains/emails dressed up as links.
  {
    icon: <Icon.chat className="w-5 h-5" />,
    label: 'დახმარება',
    value: 'დახმარების ცენტრი',
    href: '/help',
    hint: 'FAQ და სახელმძღვანელო',
  },
  {
    icon: <Icon.user className="w-5 h-5" />,
    label: 'ექსპერტთა გაწევრიანება',
    value: 'განაცხადის ფორმა',
    href: '/join',
    hint: 'პასუხი 24–48 საათში',
  },
]

export default function ContactPage({ initialUser }: { initialUser?: Me | null }) {
  const { me } = useMe()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [topic, setTopic] = useState<Topic>('general')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorText, setErrorText] = useState<string | null>(null)
  const { fault, fail, props, bad, clearField, reset: clearFault, error } = useFault('contact')
  /** One place for „they are fixing it now": drop the fault on this field and
   *  the stale form-level line with it. */
  const touch = (field: string) => {
    clearField(field)
    if (status === 'error') { setStatus('idle'); setErrorText(null) }
  }

  /* Context from the help widget's „ვერ ვიპოვე პასუხი“ (`?from=` / `?asked=`).
   *
   * The link carried these before and nothing read them, so every unresolved
   * help session arrived as a blank form — „someone wrote in“, when the widget
   * already knew which page failed them and which answers they had just read.
   *
   * It is prefilled as an EDITABLE first line rather than a hidden field: the
   * person sees exactly what is being sent and can delete it. Read from
   * window.location instead of useSearchParams so this statically-rendered page
   * needs no Suspense boundary. Prefills only while the textarea is untouched.
   */
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const from = sp.get('from')
    if (!from || !from.startsWith('/')) return
    const asked = (sp.get('asked') || '')
      .split(',')
      .map(id => ALL_TOPICS.find(t => t.id === id)?.q)
      .filter(Boolean)
    // `ask` is the question the help widget could not answer. Prefilled as the
    // FIRST line and unquoted, because it is the actual message — the person
    // already typed it once and should not have to type it again.
    const ask = (sp.get('ask') || '').slice(0, 120).trim()
    const lines: string[] = []
    if (ask) lines.push(ask, '')
    lines.push(`(გვერდი: ${from.slice(0, 120)})`)
    if (asked.length) lines.push(`(დახმარებაში წავიკითხე: ${asked.join(' · ')})`)
    setMessage(prev => (prev ? prev : lines.join('\n') + '\n\n'))
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (status === 'sending') return
    setErrorText(null); clearFault()
    // POST /api/contact parses `{ name: min(2).max(120), email: .email(),
    // message: min(10).max(4000) }`. Asked here first, in the product's own
    // words — `validationIssueMessage` is what the ROUTE answers with too, so
    // the two halves cannot say the same refusal two different ways.
    if (name.trim().length < 2) { fail('name', validationIssueMessage({ code: 'too_small', path: ['name'] })); return }
    { const m = emailFormatError(email); if (m) { fail('email', m); return } }
    if (message.trim().length < 10) { fail('message', validationIssueMessage({ code: 'too_small', path: ['message'] })); return }
    setStatus('sending')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, topic, message }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) {
        // The route answers with the schema's own path AND its Georgian
        // sentence — so a refusal only the server could reach still lands on
        // the box, without this file guessing which one.
        const field = typeof j?.field === 'string' ? j.field : null
        if (field && j?.message) { fail(field, j.message); return }
        setStatus('error')
        setErrorText(j?.message ?? contactErrorText(j?.error))
        return
      }
      setStatus('ok')
      setName('')
      setEmail('')
      setMessage('')
      setTopic('general')
    } catch {
      setStatus('error')
      setErrorText('დაფიქსირდა შეცდომა — სცადე თავიდან.')
    }
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <PublicTopBar initialUser={initialUser} />

      <Container as="main" size="wide" className="py-16 lg:py-24">
        <div className="max-w-[680px]">
          <Eyebrow className="mb-3">
            დაგვიკავშირდი
          </Eyebrow>
          <h1 className="font-display text-display lg:text-display-xl font-bold text-ink-900 tracking-tight leading-[1.05]">
            გაქვს კითხვა? მოგვწერე
          </h1>
          <p className="mt-6 text-h3 text-ink-600 leading-relaxed">
            პასუხს ჩვეულებრივ 24 საათში იღებ. თუ საკითხი გადაუდებელია, დაწერე პირდაპირ ელფოსტაზე —
            ჩვენი გუნდი უფრო სწრაფად ხედავს.
          </p>
        </div>

        <div className="mt-14 grid lg:grid-cols-[1.4fr_1fr] gap-10 lg:gap-16">
          {/* Form */}
          <form onSubmit={submit} noValidate className="rounded-card border border-ink-200 bg-white p-6 lg:p-8">
            <Eyebrow tone="muted" className="mb-1">
              შეტყობინება
            </Eyebrow>
            <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight">გამოგვიგზავნე დეტალები</h2>

            <div className="mt-6 grid sm:grid-cols-2 gap-4">
              {/* ⚠️ THE ERROR LIVES OUTSIDE THE NAME (2026-08-31). Each field
                  here was a <label> wrapping its own error message, and an
                  implicit label names its control with everything inside it —
                  so the moment „შეიყვანე სახელი" appeared, the box was CALLED
                  that, and `aria-describedby` then read the same words again. */}
              <div className="block">
                <label htmlFor="contact-name" className="block text-small font-display font-semibold text-ink-800 mb-1.5">სახელი</label>
                <input
                  id="contact-name"
                  type="text"
                  required
                  minLength={2}
                  value={name}
                  onChange={e => { setName(e.target.value); touch('name') }}
                  {...props('name')}
                  className={`w-full h-11 px-3.5 rounded-field border bg-white text-body text-ink-900 placeholder-ink-400 focus:ring-2 outline-none transition-colors duration-fast ${bad('name') ? FIELD_ERROR_BORDER : 'border-ink-200 focus:border-brand-500 focus:ring-brand-100'}`}
                  placeholder="შენი სახელი"
                />
                {error('name')}
              </div>
              <div className="block">
                <label htmlFor="contact-email" className="block text-small font-display font-semibold text-ink-800 mb-1.5">ელფოსტა</label>
                <input
                  id="contact-email"
                  type="email" autoComplete="email"
                  required
                  value={email}
                  onChange={e => { setEmail(e.target.value); touch('email') }}
                  {...props('email')}
                  className={`w-full h-11 px-3.5 rounded-field border bg-white text-body text-ink-900 placeholder-ink-400 focus:ring-2 outline-none transition-colors duration-fast ${bad('email') ? FIELD_ERROR_BORDER : 'border-ink-200 focus:border-brand-500 focus:ring-brand-100'}`}
                  placeholder="you@example.com"
                />
                {error('email')}
              </div>
            </div>

            {/* ⚠️ NOT A <label> (2026-08-31): there is no control here to label,
                only a row of buttons, and a <label> that names nothing is a
                click target that does nothing. It is a GROUP, and the word
                „თემა" is its name — said once, by `aria-labelledby`, so a
                screen reader announces the set before reading the chips. */}
            <div className="block mt-4">
              <span id="contact-topic-label" className="block text-small font-display font-semibold text-ink-800 mb-1.5">თემა</span>
              <div role="group" aria-labelledby="contact-topic-label" className="flex flex-wrap gap-1.5">
                {TOPICS.map(t => (
                  <button
                    key={t.v}
                    type="button"
                    aria-pressed={topic === t.v}
                    onClick={() => setTopic(t.v)}
                    className={`h-10 sm:h-9 px-3.5 sm:px-3 rounded-pill text-small font-display font-semibold transition-colors duration-fast border ${
                      topic === t.v
                        ? 'bg-brand-600 text-white border-brand-500'
                        : 'bg-white text-ink-700 border-ink-200 hover:border-ink-300 hover:bg-ink-50'
                    }`}
                  >
                    {t.l}
                  </button>
                ))}
              </div>
            </div>

            {/* ⚠️ The counter below changes on EVERY KEYSTROKE, and while it sat
                inside the label the box's own name changed with it. */}
            <div className="block mt-4">
              <label htmlFor="contact-message" className="block text-small font-display font-semibold text-ink-800 mb-1.5">შეტყობინება</label>
              <textarea
                id="contact-message"
                required
                minLength={10}
                maxLength={4000}
                rows={6}
                value={message}
                onChange={e => { setMessage(e.target.value); touch('message') }}
                {...props('message')}
                className={`w-full px-3.5 py-3 rounded-field border bg-white text-body text-ink-900 placeholder-ink-400 focus:ring-2 outline-none resize-y transition-colors duration-fast leading-relaxed ${bad('message') ? FIELD_ERROR_BORDER : 'border-ink-200 focus:border-brand-500 focus:ring-brand-100'}`}
                placeholder="მოგვწერე, რაშიც შეგვიძლია დაგეხმაროთ…"
              />
              {error('message')}
              <div className={`mt-1 text-meta tabular-nums text-right ${message.length > 3800 ? 'text-warning-700 font-semibold' : 'text-ink-400'}`}>
                {message.length} / 4000
              </div>
            </div>

            {/* SUCCESS gets the illustration; the error branch below keeps its
                compact tinted strip. An error is something to act on and wants
                to be read fast — art there would slow down the one message the
                reader actually needs. No plate behind the drawing: the tinted
                success box stays a sibling of the text, not a frame for the
                image. */}
            {status === 'ok' && (
              <div className="mt-5 flex flex-col items-center text-center gap-1">
                <Illustration name="contactSent" alt="გაგზავნილი წერილი" />
                <div className="mt-2 font-display text-body-lg font-bold text-ink-900 tracking-tight">
                  წერილი გავიგეთ
                </div>
                <p className="text-small text-ink-500 max-w-[420px] leading-relaxed">
                  გიპასუხებთ ჩვეულებრივ 24 საათში.
                </p>
              </div>
            )}
            {status === 'error' && !fault && (
              <div role="alert" className="mt-5 rounded-btn bg-danger-50 border border-danger-200 p-3.5 flex items-start gap-2.5">
                <Icon.warn className="w-4 h-4 text-danger-700 mt-0.5 shrink-0" />
                <div className="text-small text-danger-800 leading-relaxed break-words min-w-0">
                  {errorText || 'შეცდომა. სცადე ხელახლა ან მოგვწერე ელფოსტაზე.'}
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-4">
              <div className="text-meta text-ink-500 leading-relaxed">
                გაგზავნით ეთანხმები{' '}
                <Link href="/privacy" className="tap-area text-brand-700 hover:text-brand-800 font-semibold">
                  კონფიდენციალურობის პოლიტიკას
                </Link>
                .
              </div>
              <button
                type="submit"
                disabled={status === 'sending'}
                className="h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-300 disabled:cursor-not-allowed text-white font-display font-semibold text-body inline-flex items-center gap-2 transition-colors duration-fast"
              >
                {status === 'sending' ? 'იგზავნება…' : 'გაგზავნა'}
              </button>
            </div>
          </form>

          {/* Channels */}
          <aside>
            <Eyebrow tone="muted" className="mb-4">
              პირდაპირი არხები
            </Eyebrow>
            <div className="space-y-3">
              {CHANNELS.filter(c => c.href !== '/join' || showJoinInvite(me?.role, me?.provider)).map(c => (
                <a
                  key={c.label}
                  href={c.href}
                  className="group flex items-start gap-4 p-4 rounded-card border border-ink-200 bg-white hover:border-ink-300 hover:shadow-card transition-all duration-fast"
                >
                  <div className="w-10 h-10 rounded-btn bg-brand-50 text-brand-700 flex items-center justify-center shrink-0 group-hover:bg-brand-600 group-hover:text-white transition-colors duration-fast">
                    {c.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-body font-bold text-ink-900">{c.label}</div>
                    <div className="text-small text-brand-700 mt-0.5 truncate">{c.value}</div>
                    <div className="text-meta text-ink-500 mt-1">{c.hint}</div>
                  </div>
                </a>
              ))}
            </div>

            <div className="mt-8 p-5 rounded-card bg-ink-50 border border-ink-200">
              <div className="font-display text-meta font-semibold uppercase text-ink-600 mb-2">
                სამუშაო საათები
              </div>
              <div className="text-small text-ink-800 leading-relaxed">
                ორშ – პარ · 10:00 – 19:00
                <br />
                შაბ – კვ · მხოლოდ ელფოსტა
              </div>
            </div>
          </aside>
        </div>
      </Container>

      <Footer />
    </div>
  )
}

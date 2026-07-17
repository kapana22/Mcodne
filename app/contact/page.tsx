'use client'
import { useState } from 'react'
import Link from 'next/link'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'

type Topic = 'general' | 'expert' | 'billing' | 'press' | 'other'
type Status = 'idle' | 'sending' | 'ok' | 'error'

// Map server error codes to user-facing Georgian copy — never surface raw codes.
function contactErrorText(code?: string): string {
  switch (code) {
    case 'RATE_LIMITED': return 'ძალიან ბევრი მოთხოვნა — სცადე ცოტა ხანში.'
    case 'INVALID': return 'შეავსე ველები სწორად.'
    default: return 'დაფიქსირდა შეცდომა — სცადე თავიდან.'
  }
}

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
    value: 'hi@mcodne.ge',
    href: 'mailto:hi@mcodne.ge',
    hint: 'პასუხი 24 საათში',
  },
  {
    icon: <Icon.chat className="w-5 h-5" />,
    label: 'დახმარება',
    value: 'help.mcodne.ge',
    href: '/help',
    hint: 'FAQ და სახელმძღვანელო',
  },
  {
    icon: <Icon.user className="w-5 h-5" />,
    label: 'ექსპერტთა გაწევრიანება',
    value: 'apply@mcodne.ge',
    href: '/apply',
    hint: 'გახდი ექსპერტი 3 დღეში',
  },
]

export default function ContactPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [topic, setTopic] = useState<Topic>('general')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorText, setErrorText] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (status === 'sending') return
    setStatus('sending')
    setErrorText(null)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, topic, message }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) {
        setStatus('error')
        setErrorText(contactErrorText(j?.error))
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
    <div className="min-h-screen bg-white">
      <MarketingTopBar />

      <main className="max-w-[1080px] mx-auto px-6 sm:px-8 py-16 lg:py-24">
        <div className="max-w-[680px]">
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-3">
            დაგვიკავშირდი
          </div>
          <h1 className="font-display text-4xl lg:text-5xl font-bold text-ink-900 tracking-tight leading-[1.05]">
            გაქვს კითხვა? მოგვწერე
          </h1>
          <p className="mt-6 text-[17px] text-ink-600 leading-relaxed">
            ვცდილობთ ყოველ შეტყობინებას ვუპასუხოთ 24 საათში. თუ საკითხი გადაუდებელია, დაწერე პირდაპირ ელფოსტაზე —
            ჩვენი გუნდი უფრო სწრაფად ხედავს.
          </p>
        </div>

        <div className="mt-14 grid lg:grid-cols-[1.4fr_1fr] gap-10 lg:gap-16">
          {/* Form */}
          <form onSubmit={submit} className="rounded-card border border-ink-200 bg-white p-6 lg:p-8">
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-500 mb-1">
              შეტყობინება
            </div>
            <h2 className="font-display text-xl font-bold text-ink-900 tracking-tight">გამოგვიგზავნე დეტალები</h2>

            <div className="mt-6 grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-[12.5px] font-display font-semibold text-ink-800 mb-1.5">სახელი</span>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={name}
                  onChange={e => { setName(e.target.value); if (status === 'error') { setStatus('idle'); setErrorText(null) } }}
                  className="w-full h-11 px-3.5 rounded-field border border-ink-200 bg-white text-[14px] text-ink-900 placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition-colors"
                  placeholder="შენი სახელი"
                />
              </label>
              <label className="block">
                <span className="block text-[12.5px] font-display font-semibold text-ink-800 mb-1.5">ელფოსტა</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => { setEmail(e.target.value); if (status === 'error') { setStatus('idle'); setErrorText(null) } }}
                  className="w-full h-11 px-3.5 rounded-field border border-ink-200 bg-white text-[14px] text-ink-900 placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition-colors"
                  placeholder="you@example.com"
                />
              </label>
            </div>

            <label className="block mt-4">
              <span className="block text-[12.5px] font-display font-semibold text-ink-800 mb-1.5">თემა</span>
              <div className="flex flex-wrap gap-1.5">
                {TOPICS.map(t => (
                  <button
                    key={t.v}
                    type="button"
                    aria-pressed={topic === t.v}
                    onClick={() => setTopic(t.v)}
                    className={`h-9 px-3 rounded-pill text-[12.5px] font-display font-semibold transition-colors border ${
                      topic === t.v
                        ? 'bg-brand-500 text-white border-brand-500'
                        : 'bg-white text-ink-700 border-ink-200 hover:border-ink-300 hover:bg-ink-50'
                    }`}
                  >
                    {t.l}
                  </button>
                ))}
              </div>
            </label>

            <label className="block mt-4">
              <span className="block text-[12.5px] font-display font-semibold text-ink-800 mb-1.5">შეტყობინება</span>
              <textarea
                required
                minLength={10}
                maxLength={4000}
                rows={6}
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="w-full px-3.5 py-3 rounded-field border border-ink-200 bg-white text-[14px] text-ink-900 placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none resize-y transition-colors leading-relaxed"
                placeholder="მითხარი, რაშიც შეგვიძლია დაგეხმაროთ..."
              />
              <div className={`mt-1 text-[11px] tabular-nums text-right ${message.length > 3800 ? 'text-warning-700 font-semibold' : 'text-ink-400'}`}>
                {message.length} / 4000
              </div>
            </label>

            {status === 'ok' && (
              <div className="mt-5 rounded-btn bg-success-50 border border-success-200 p-3.5 flex items-start gap-2.5">
                <Icon.check className="w-4 h-4 text-success-700 mt-0.5 shrink-0" />
                <div className="text-[13px] text-success-800 leading-relaxed">
                  მადლობა — შეტყობინება მივიღეთ. გიპასუხებთ 24 საათში.
                </div>
              </div>
            )}
            {status === 'error' && (
              <div role="alert" className="mt-5 rounded-btn bg-danger-50 border border-danger-200 p-3.5 flex items-start gap-2.5">
                <Icon.warn className="w-4 h-4 text-danger-700 mt-0.5 shrink-0" />
                <div className="text-[13px] text-danger-800 leading-relaxed break-words min-w-0">
                  {errorText || 'შეცდომა. სცადე ხელახლა ან მოგვწერე ელფოსტაზე.'}
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-4">
              <div className="text-[11.5px] text-ink-500 leading-relaxed">
                გაგზავნით ეთანხმები{' '}
                <Link href="/privacy" className="text-brand-700 hover:text-brand-800 font-semibold">
                  პრივატულობის პოლიტიკას
                </Link>
                .
              </div>
              <button
                type="submit"
                disabled={status === 'sending'}
                className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-300 disabled:cursor-not-allowed text-white font-display font-semibold text-[13.5px] inline-flex items-center gap-2 transition-colors"
              >
                {status === 'sending' ? 'იგზავნება...' : 'გაგზავნა'}
                {status !== 'sending' && <Icon.arrow className="w-4 h-4" />}
              </button>
            </div>
          </form>

          {/* Channels */}
          <aside>
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-500 mb-4">
              პირდაპირი არხები
            </div>
            <div className="space-y-3">
              {CHANNELS.map(c => (
                <a
                  key={c.label}
                  href={c.href}
                  className="group flex items-start gap-4 p-4 rounded-card border border-ink-200 bg-white hover:border-ink-300 hover:shadow-card transition-all"
                >
                  <div className="w-10 h-10 rounded-btn bg-brand-50 text-brand-700 flex items-center justify-center shrink-0 group-hover:bg-brand-500 group-hover:text-white transition-colors">
                    {c.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-[13.5px] font-bold text-ink-900">{c.label}</div>
                    <div className="text-[13px] text-brand-700 mt-0.5 truncate">{c.value}</div>
                    <div className="text-[11.5px] text-ink-500 mt-1">{c.hint}</div>
                  </div>
                </a>
              ))}
            </div>

            <div className="mt-8 p-5 rounded-card bg-ink-50 border border-ink-200">
              <div className="font-display text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-600 mb-2">
                სამუშაო საათები
              </div>
              <div className="text-[13px] text-ink-800 leading-relaxed">
                ორშ – პარ · 10:00 – 19:00
                <br />
                შაბ – კვ · მხოლოდ ელფოსტა
              </div>
            </div>
          </aside>
        </div>

        <Footer />
      </main>
    </div>
  )
}

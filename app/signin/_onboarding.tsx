'use client'
// /signin — the post-signup onboarding view.

import { useState, useEffect } from 'react'
import { Icon } from '@/components/Icon'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { inputCls } from './_fields'
import { View } from './_model'

/* ═══════════════════════════════════════════════════════════════════ */
/* ONBOARDING VIEW (post-signup wizard)                                 */
/* ═══════════════════════════════════════════════════════════════════ */

const ONB_STEPS = [
  { id: 1, l: 'კატეგორიები',    s: 'რას ეძებ' },
  { id: 2, l: 'შენი ფონი',   s: 'რომელ ეტაპზე ხარ' },
  { id: 3, l: 'ხელმისაწვდომი', s: 'როდის ხარ თავისუფალი' },
  { id: 4, l: 'პირველი შერჩევა', s: 'შერჩეული ექსპერტი' },
] as const

const AREAS = [
  { id: 'business', l: 'ბიზნეს-სტრატეგია' },
  { id: 'product',  l: 'პროდუქტი / UX' },
  { id: 'finance',  l: 'ფინანსები / გადასახადი' },
  { id: 'career',   l: 'კარიერა / FAANG' },
  { id: 'marketing',l: 'მარკეტინგი / Growth' },
  { id: 'law',      l: 'IT სამართალი' },
  { id: 'fundraise',l: 'Fundraising / VC' },
  { id: 'design',   l: 'დიზაინი / Brand' },
]

const LEVELS = [
  { id: 'pre',    l: 'წინასწარ',  sub: 'იდეა მაქვს, ბიზნესი ჯერ არა' },
  { id: 'early',  l: 'ადრეული',   sub: '1—2 წელი, MVP ან მცირე შემოსავალი' },
  { id: 'growth', l: 'მზარდი',    sub: 'გუნდი 5—25, შემოსავალი, ვეძებთ ფონდს' },
  { id: 'scale',  l: 'მასშტაბი',   sub: 'Series A+, 30+ ადამიანი, საერთაშორისო' },
]

export const OnboardingView = ({ setView }: { setView: (v: View) => void }) => {
  const [step, setStep] = useState(1)
  // Comfortable step transitions: scroll back to the top on every step change
  // (next OR back) so the user always lands at the start of the new step instead
  // of mid-page — matches the booking flow + /apply wizard behaviour.
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }) }, [step])
  const [areas, setAreas] = useState<string[]>([])
  const [level, setLevel] = useState('early')
  const [role, setRole] = useState('')
  const [avail, setAvail] = useState<string[]>([])
  const [budget, setBudget] = useState(80)

  const toggleArea = (id: string) => setAreas(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 4 ? [...prev, id] : prev)
  const toggleAvail = (d: string) => setAvail(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])

  const finish = () => {
    try {
      if (typeof window !== 'undefined') {
        const primary = areas[0]
        const primarySlug = AREAS.find(a => a.id === primary)?.l ?? ''
        const prefs = { areas, level, role, avail, budget, ts: Date.now() }
        localStorage.setItem('mtsodne:onboarding', JSON.stringify(prefs))
        const params = new URLSearchParams()
        if (primarySlug) params.set('q', primarySlug)
        if (budget) params.set('maxPrice', String(budget))
        window.location.href = `/experts${params.toString() ? `?${params}` : ''}`
        return
      }
    } catch {}
    setView('signin')
  }

  return (
    <Container as="main" id="main" className="relative pt-10 lg:pt-14 pb-20">
      <div className="grid lg:grid-cols-[260px_1fr] gap-10 lg:gap-14">
        {/* Sidebar */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Eyebrow tone="muted" className="mb-2">ნაბიჯი {step} / 4</Eyebrow>
          <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight leading-tight mb-1">მოკლე გაცნობა</h2>
          <p className="text-small text-ink-600 mb-6">შენს პასუხებზე მოვარგებთ ექსპერტებს.</p>

          <ol className="relative space-y-1">
            <span className="absolute left-[18px] top-3 bottom-3 w-px bg-ink-200" aria-hidden />
            {ONB_STEPS.map(s => {
              const isDone = step > s.id
              const isActive = step === s.id
              return (
                <li key={s.id}>
                  <div className={`group relative w-full flex items-start gap-3 p-2.5 -ml-2 rounded-card ${isActive ? 'bg-brand-50/60' : ''}`}>
                    <span className={`relative z-10 w-9 h-9 shrink-0 rounded-full inline-flex items-center justify-center font-display font-bold text-meta tabular-nums transition-colors duration-fast ${
                      isDone ? 'bg-success-500 text-white' :
                      isActive ? 'bg-brand-600 text-white ring-4 ring-brand-500/15' :
                      'bg-white border-2 border-ink-200 text-ink-400'
                    }`}>
                      {isDone ? <Icon.check className="w-4 h-4" /> : s.id}
                    </span>
                    <div className="min-w-0 pt-1.5">
                      <div className={`font-display text-small font-bold tracking-tight ${isActive ? 'text-ink-900' : isDone ? 'text-ink-500' : 'text-ink-800'}`}>{s.l}</div>
                      <div className="text-meta text-ink-500 mt-0.5 leading-snug">{s.s}</div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>

          <button type="button" onClick={() => setView('signin')} className="mt-7 inline-flex items-center gap-1.5 text-meta text-ink-500 hover:text-ink-800 transition-colors duration-fast">
            გამოტოვება
          </button>
        </aside>

        {/* Content */}
        <div className="min-w-0">
          {/* Mobile progress */}
          <div className="lg:hidden mb-6 flex items-center gap-1.5">
            {ONB_STEPS.map(s => (
              <span key={s.id} className={`flex-1 h-1 rounded-full ${step > s.id ? 'bg-success-500' : step === s.id ? 'bg-brand-500' : 'bg-ink-200'}`} />
            ))}
            <span className="ml-2 font-mono text-meta tabular-nums text-ink-500">{step}/4</span>
          </div>

          {step === 1 && (
            <div className="max-w-[720px]">
              <Eyebrow className="mb-2">№ 01 — კატეგორიები</Eyebrow>
              <h1 className="font-display text-display lg:text-display-lg font-bold text-ink-900 tracking-[-0.02em] leading-[1.05]">
                რაში გჭირდება ცოდნა?
              </h1>
              <p className="mt-3 text-body-lg text-ink-600 leading-[1.55] max-w-[520px]">
                აირჩიე 1—4 კატეგორია. <span className="font-display font-semibold text-ink-900">{areas.length}/4</span> არჩეული.
              </p>

              <div className="mt-7 grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {AREAS.map(a => {
                  const on = areas.includes(a.id)
                  const disabled = !on && areas.length >= 4
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => !disabled && toggleArea(a.id)}
                      disabled={disabled}
                      className={`relative p-4 rounded-card border text-left transition-all duration-fast ${
                        on ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/15' :
                        disabled ? 'border-ink-200 bg-ink-50/40 opacity-50 cursor-not-allowed' :
                        'border-ink-200 bg-white hover:border-ink-300 hover:-translate-y-0.5'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center transition-colors duration-fast ${
                          on ? 'bg-brand-600 text-white' : 'bg-white border-2 border-ink-300'
                        }`}>
                          {on && <Icon.check className="w-3 h-3" />}
                        </span>
                      </div>
                      <div className="font-display text-body font-bold text-ink-900 tracking-tight">{a.l}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="max-w-[720px]">
              <Eyebrow className="mb-2">№ 02 — შენი ფონი</Eyebrow>
              <h1 className="font-display text-display lg:text-display-lg font-bold text-ink-900 tracking-[-0.02em] leading-[1.05]">
                რომელ ეტაპზე ხარ?
              </h1>
              <p className="mt-3 text-body-lg text-ink-600 leading-[1.55] max-w-[520px]">
                ექსპერტი წინასწარ ხედავს კონტექსტს — დრო არ დაიხარჯება.
              </p>

              <div className="mt-7 space-y-2">
                {LEVELS.map(l => {
                  const on = level === l.id
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setLevel(l.id)}
                      className={`w-full p-4 rounded-card border text-left flex items-center gap-4 transition-all duration-fast ${
                        on ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/15' : 'border-ink-200 bg-white hover:border-ink-300'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">{l.l}</div>
                        <div className="text-small text-ink-600 mt-0.5 leading-snug">{l.sub}</div>
                      </div>
                      <span className={`shrink-0 w-5 h-5 rounded-full inline-flex items-center justify-center transition-colors duration-fast ${
                        on ? 'bg-brand-600 text-white' : 'bg-white border-2 border-ink-300'
                      }`}>
                        {on && <Icon.check className="w-3 h-3" />}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="mt-8">
                <label className="block font-display text-micro font-semibold uppercase text-ink-700 mb-2">შენი როლი <span className="text-micro text-ink-400 normal-case font-normal tracking-normal">სურვილისამებრ</span></label>
                <input type="text" value={role} onChange={e => setRole(e.target.value)} placeholder="Founder, Product Designer, Marketing Lead…" className={inputCls} />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="max-w-[720px]">
              <Eyebrow className="mb-2">№ 03 — ხელმისაწვდომი</Eyebrow>
              <h1 className="font-display text-display lg:text-display-lg font-bold text-ink-900 tracking-[-0.02em] leading-[1.05]">
                როდის გელოდები ექსპერტს?
              </h1>
              <p className="mt-3 text-body-lg text-ink-600 leading-[1.55] max-w-[520px]">
                მოვარგებთ შენს განრიგს.
              </p>

              <div className="mt-7">
                <Eyebrow tone="muted" className="mb-2.5">დღეები</Eyebrow>
                <div className="grid grid-cols-7 gap-1.5">
                  {['ორშ', 'სამშ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ', 'კვ'].map(d => {
                    const on = avail.includes(d)
                    return (
                      <button key={d} type="button" onClick={() => toggleAvail(d)} className={`p-3 rounded-card text-center border transition-all duration-fast ${
                        on ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/15' : 'border-ink-200 bg-white hover:border-ink-300'
                      }`}>
                        <div className={`font-display text-micro font-semibold uppercase ${on ? 'text-brand-700' : 'text-ink-500'}`}>{d}</div>
                        <div className={`mt-1.5 w-5 h-5 mx-auto rounded-full inline-flex items-center justify-center ${
                          on ? 'bg-brand-600 text-white' : 'bg-ink-100'
                        }`}>
                          {on && <Icon.check className="w-3 h-3" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="mt-7">
                <Eyebrow tone="muted" className="mb-2.5">სასურველი დრო</Eyebrow>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { l: 'დილით', sub: '08—12' },
                    { l: 'შუადღე', sub: '12—17' },
                    { l: 'საღამოს', sub: '17—22' },
                  ].map(t => (
                    <button key={t.l} type="button" onClick={() => toggleAvail(t.l)} className={`p-3.5 rounded-card border text-left transition-all duration-fast ${
                      avail.includes(t.l) ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/15' : 'border-ink-200 bg-white hover:border-ink-300'
                    }`}>
                      <div className="font-display text-body font-bold text-ink-900 tracking-tight">{t.l}</div>
                      <div className="font-mono text-meta tabular-nums text-ink-500">{t.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-7">
                <div className="flex items-baseline justify-between mb-2.5">
                  <Eyebrow tone="muted">სასურველი ფასი</Eyebrow>
                  <div className="font-display text-body-lg font-bold text-ink-900 tabular-nums">₾{budget}<span className="text-meta font-medium text-ink-500"> / სამუშაო</span></div>
                </div>
                <input type="range" min={30} max={200} step={10} value={budget} onChange={e => setBudget(Number(e.target.value))} className="w-full accent-brand-500" />
                <div className="flex justify-between font-mono text-meta tabular-nums text-ink-400 mt-1">
                  <span>₾30</span><span>₾80</span><span>₾130</span><span>₾200+</span>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="max-w-[720px]">
              <Eyebrow className="mb-2">№ 04 — მზად ხარ</Eyebrow>
              <h1 className="font-display text-display lg:text-display-lg font-bold text-ink-900 tracking-[-0.02em] leading-[1.05]">
                მზად ხარ
              </h1>
              <p className="mt-3 text-body-lg text-ink-600 leading-[1.55] max-w-[540px]">
                შენს პასუხებზე მორგებულ ექსპერტებს გაჩვენებთ. ფასი წინასწარ, დაცული გადახდით.
              </p>

              <div className="mt-7 rounded-card border border-ink-200 bg-white p-5 sm:p-6">
                <Eyebrow tone="muted" className="mb-4">შენი არჩევანი</Eyebrow>
                <div className="space-y-4">
                  <div>
                    <div className="font-mono text-micro uppercase text-ink-500 mb-1.5">კატეგორიები</div>
                    <div className="flex flex-wrap gap-1.5">
                      {areas.length ? areas.map(id => (
                        <span key={id} className="inline-flex items-center h-7 px-3 rounded-pill bg-ink-50 border border-ink-200 font-display text-meta font-semibold text-ink-800">
                          {AREAS.find(a => a.id === id)?.l ?? id}
                        </span>
                      )) : (
                        // Dead-end text made live: „ჯერ არ არჩეული" stated the
                        // problem without offering the fix. The summary is on
                        // step 4 and the fix lives on step 1 — take them there.
                        <button
                          type="button"
                          onClick={() => setStep(1)}
                          className="inline-flex items-center min-h-[40px] font-display text-small font-semibold text-brand-700 hover:text-brand-800 transition-colors duration-fast"
                        >
                          აირჩიე კატეგორია
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div>
                      <div className="font-mono text-micro uppercase text-ink-500 mb-1">ეტაპი</div>
                      <div className="font-display text-body font-semibold text-ink-900">{LEVELS.find(l => l.id === level)?.l ?? '—'}</div>
                    </div>
                    <div>
                      <div className="font-mono text-micro uppercase text-ink-500 mb-1">მაქს. ბიუჯეტი</div>
                      <div className="font-display text-body font-semibold text-ink-900 tabular-nums">₾{budget} / სამუშაო</div>
                    </div>
                  </div>
                </div>
                <p className="mt-5 pt-4 border-t border-ink-100 text-meta text-ink-500 leading-snug">
                  „დასრულება“ გადაგიყვანს შენზე მორგებულ ექსპერტებთან.
                </p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-10 pt-6 border-t border-ink-100 flex items-center justify-between gap-3">
            <button type="button" onClick={() => step > 1 && setStep(step - 1)} disabled={step === 1} className="h-11 px-3 rounded-btn text-ink-600 hover:text-ink-900 hover:bg-ink-50 disabled:text-ink-300 disabled:hover:bg-transparent font-display font-semibold text-small inline-flex items-center gap-1.5 transition-colors duration-fast">
              <Icon.back className="w-3.5 h-3.5" /> უკან
            </button>
            {step < 4 ? (
              <button type="button" onClick={() => setStep(step + 1)} disabled={step === 1 && areas.length === 0} className="h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 disabled:text-ink-500 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-2 transition-colors duration-fast">
                შემდეგი
              </button>
            ) : (
              <button type="button" onClick={finish} disabled={areas.length === 0} className="h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 disabled:text-ink-500 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-2 transition-colors duration-fast">
                <Icon.spark className="w-3.5 h-3.5" /> დასრულება
              </button>
            )}
          </div>
          {areas.length === 0 && (
            <p className="mt-3 text-right text-meta text-ink-500">გასაგრძელებლად აირჩიე მინიმუმ ერთი ქალაქი.</p>
          )}
        </div>
      </div>
    </Container>
  )
}

'use client'
// Payment step — moved verbatim from app/experts/[slug]/client.tsx. Rendered ONLY
// when PAYMENTS_LIVE flips true (lib/flags); until then the flow ends at the
// intake step and no charge is implied anywhere.
import React from 'react'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'

export type PaymentMethod = 'tbc' | 'bog' | 'solo' | 'card'

const METHODS: { id: PaymentMethod; l: string; sub: string; tone: 'ink' | 'brand' | 'accent' }[] = [
  { id: 'tbc',  l: 'TBC Pay',     sub: 'Open Banking',   tone: 'accent' },
  { id: 'bog',  l: 'BOG Pay',     sub: 'Open Banking',   tone: 'brand'  },
  { id: 'solo', l: 'SOLO',        sub: 'TBC-ის სოლო',    tone: 'ink'    },
  { id: 'card', l: 'ბარათი',      sub: 'Visa · MC · Amex', tone: 'ink'  },
]

export type PaymentState = { method: PaymentMethod; cardName: string; cardNum: string; cardExp: string; cardCvv: string; save: boolean }

export const INITIAL_PAYMENT: PaymentState = { method: 'tbc', cardName: '', cardNum: '', cardExp: '', cardCvv: '', save: true }

// Gate for the pay CTA: card method requires complete, well-formed details.
// Redirect methods (TBC/BOG/SOLO) carry their own hosted flow.
export const isPaymentValid = (payment: PaymentState): boolean =>
  payment.method !== 'card' ||
  (payment.cardName.trim().length > 1 &&
    payment.cardNum.replace(/\s/g, '').length === 16 &&
    /^(0[1-9]|1[0-2])\/\d{2}$/.test(payment.cardExp) &&
    /^\d{3,4}$/.test(payment.cardCvv))

export const PaymentStep = ({ value, onChange, summary }: { value: PaymentState; onChange: (v: PaymentState) => void; summary: React.ReactNode }) => (
  <div className="grid lg:grid-cols-[1fr_280px] gap-6 sm:gap-7 lg:gap-10 p-4 sm:p-7 lg:p-10">
    <div className="space-y-7">
      <div>
        <label className="block font-display text-micro font-semibold uppercase text-ink-700 mb-3">გადახდის მეთოდი</label>
        <div className="grid grid-cols-2 gap-2">
          {METHODS.map(m => {
            const on = value.method === m.id
            const toneCls = m.tone === 'brand' ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-700'
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onChange({ ...value, method: m.id })}
                className={`relative text-left p-3.5 rounded-card border transition-all duration-fast ${on ? 'border-brand-500 bg-brand-50/40 ring-2 ring-brand-200' : 'border-ink-200 bg-white hover:border-ink-400'}`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`w-9 h-9 rounded-card font-display font-bold text-meta tracking-wider inline-flex items-center justify-center ${toneCls}`}>
                    {m.id === 'card' ? <Icon.money className="w-4 h-4" /> : m.l.split(' ')[0].slice(0, 3).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="font-display text-small font-bold text-ink-900 truncate">{m.l}</div>
                    <div className="text-meta text-ink-500 truncate">{m.sub}</div>
                  </div>
                </div>
                {on && (
                  <span className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-brand-500 inline-flex items-center justify-center">
                    <Icon.check className="w-2.5 h-2.5 text-white" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {value.method === 'card' && (
        <div className="rounded-card border border-ink-200 bg-white p-5 space-y-4">
          <Eyebrow tone="muted">ბარათის მონაცემები</Eyebrow>
          <div>
            <label className="block font-display text-micro font-semibold uppercase text-ink-700 mb-2">მფლობელის სახელი</label>
            <input
              type="text"
              value={value.cardName}
              onChange={e => onChange({ ...value, cardName: e.target.value })}
              placeholder="GIORGI MELADZE"
              className="w-full h-12 px-3.5 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-body-lg text-ink-900 placeholder:text-ink-400 transition-colors duration-fast uppercase"
            />
          </div>
          <div>
            <label className="block font-display text-micro font-semibold uppercase text-ink-700 mb-2">ბარათის ნომერი</label>
            <input
              type="text"
              value={value.cardNum}
              onChange={e => {
                const raw = e.target.value.replace(/\D/g, '').slice(0, 16)
                const formatted = raw.match(/.{1,4}/g)?.join(' ') ?? ''
                onChange({ ...value, cardNum: formatted })
              }}
              placeholder="0000 0000 0000 0000"
              inputMode="numeric"
              className="w-full h-12 px-3.5 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-body-lg text-ink-900 placeholder:text-ink-400 transition-colors duration-fast tabular-nums tracking-wider"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-display text-micro font-semibold uppercase text-ink-700 mb-2">ვადა · MM/YY</label>
              <input
                type="text"
                value={value.cardExp}
                onChange={e => {
                  const raw = e.target.value.replace(/\D/g, '').slice(0, 4)
                  const formatted = raw.length > 2 ? `${raw.slice(0, 2)}/${raw.slice(2)}` : raw
                  onChange({ ...value, cardExp: formatted })
                }}
                placeholder="12/28"
                inputMode="numeric"
                className="w-full h-12 px-3.5 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-body-lg text-ink-900 placeholder:text-ink-400 transition-colors duration-fast tabular-nums"
              />
            </div>
            <div>
              <label className="block font-display text-micro font-semibold uppercase text-ink-700 mb-2">CVV</label>
              <input
                type="text"
                value={value.cardCvv}
                onChange={e => onChange({ ...value, cardCvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                placeholder="•••"
                inputMode="numeric"
                className="w-full h-12 px-3.5 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-body-lg text-ink-900 placeholder:text-ink-400 transition-colors duration-fast tabular-nums"
              />
            </div>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
            <span className={`w-4 h-4 rounded border-[1.5px] inline-flex items-center justify-center transition-colors duration-fast ${value.save ? 'bg-brand-500 border-brand-500' : 'border-ink-300 bg-white'}`}>
              {value.save && <Icon.check className="w-3 h-3 text-white" />}
            </span>
            <input type="checkbox" checked={value.save} onChange={e => onChange({ ...value, save: e.target.checked })} className="sr-only" />
            <span className="text-small text-ink-700">დაიმახსოვრე ბარათი — შემდეგ ერთი დაწკაპუნებაა</span>
          </label>
        </div>
      )}

      {value.method !== 'card' && (
        <div className="rounded-card border border-ink-200 bg-ink-50/40 p-5 grid grid-cols-[auto_1fr] gap-3 items-start">
          <Icon.shieldCheck className="w-4 h-4 mt-0.5 text-brand-700 shrink-0" />
          <div>
            <div className="font-display text-small font-bold text-ink-900">გადახდა ბანკის გვერდზე</div>
            <p className="text-small text-ink-600 mt-1">
              „გადახდა“-ზე გადახვალ {METHODS.find(m => m.id === value.method)?.l}-ის უსაფრთხო გვერდზე და დაბრუნდები აქ.
            </p>
          </div>
        </div>
      )}

    </div>

    <div className="lg:sticky lg:top-0">
      {summary}
    </div>
  </div>
)

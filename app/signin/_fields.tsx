'use client'
// /signin — the shared inputs: labelled field, password box with its
// strength meter, the one-time-code boxes, and the Google mark.

import React, { useState, useRef } from 'react'
import { Icon } from '@/components/Icon'

export const GoogleMark = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4">
    <path fill="#4285F4" d="M22.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h5.9a5.03 5.03 0 0 1-2.18 3.3v2.74h3.53c2.06-1.9 3.25-4.72 3.25-8.23Z" />
    <path fill="#34A853" d="M12 23c2.94 0 5.4-.98 7.2-2.65l-3.52-2.74c-.98.66-2.23 1.05-3.68 1.05a6.45 6.45 0 0 1-6.05-4.45H2.31v2.83A10.92 10.92 0 0 0 12 23Z" />
    <path fill="#FBBC05" d="M5.95 14.21A6.6 6.6 0 0 1 5.6 12c0-.77.13-1.51.35-2.21V6.96H2.31A11 11 0 0 0 1.08 12c0 1.78.43 3.46 1.23 4.99l3.64-2.78Z" />
    <path fill="#EA4335" d="M12 5.36c1.6 0 3.04.55 4.17 1.63l3.12-3.12C17.4 2.1 14.94 1 12 1A10.92 10.92 0 0 0 2.31 6.96l3.64 2.83C6.82 7.32 9.21 5.36 12 5.36Z" />
  </svg>
)

export const inputCls = 'w-full h-12 px-3.5 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-body-lg text-ink-900 placeholder:text-ink-400 transition-colors duration-fast'

// The whole Field is a <label> wrapping its input, so the label is
// programmatically associated (screen readers announce the real label, not the
// placeholder) without threading ids through every call site.
export const Field = ({ label, hint, optional, required, children }: { label: string; hint?: string; optional?: boolean; required?: boolean; children: React.ReactNode }) => (
  <label className="block">
    <span className="flex items-baseline gap-2 mb-2">
      <span className="font-display text-micro font-semibold uppercase text-ink-700">{label}{required && <span className="text-danger-500 ml-0.5" aria-hidden>*</span>}</span>
      {optional && <span className="text-meta text-ink-400">სურვილისამებრ</span>}
    </span>
    {children}
    {hint && <p className="mt-1.5 text-meta text-ink-500">{hint}</p>}
  </label>
)

export const PwInput = ({ value, onChange, placeholder = 'მინ. 8 სიმბოლო', autoComplete = 'new-password' }: { value: string; onChange: (v: string) => void; placeholder?: string; autoComplete?: string }) => {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} aria-label="პაროლი" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} className="w-full h-12 pl-3.5 pr-11 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-body-lg text-ink-900 placeholder:text-ink-400 transition-colors duration-fast" />
      <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'დამალე' : 'აჩვენე'} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 inline-flex items-center justify-center rounded-btn text-ink-500 hover:text-ink-800 hover:bg-ink-100 transition-colors duration-fast">
        {show ? <Icon.eyeOff className="w-4 h-4" /> : <Icon.eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

function strength(pw: string) {
  let s = 0
  if (pw.length >= 8) s++
  if (/[A-Z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return s
}

export const StrengthBar = ({ pw }: { pw: string }) => {
  const s = strength(pw)
  const labels = ['', 'სუსტი', 'საშუალო', 'კარგი', 'ძლიერი']
  const barCls = (i: number) => {
    if (i > s) return 'bg-ink-200'
    if (s === 1) return 'bg-danger-500'
    if (s === 2) return 'bg-warning-500'
    if (s === 3) return 'bg-brand-500'
    return 'bg-success-500'
  }
  const txt = s === 0 ? 'text-ink-500' : s === 1 ? 'text-danger-700' : s === 2 ? 'text-warning-700' : s === 3 ? 'text-brand-700' : 'text-success-700'
  if (!pw) return <p className="mt-1.5 text-meta text-ink-500">მინ. 8 სიმბოლო · ერთი ციფრი · ერთი დიდი ასო.</p>
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className={`flex-1 h-1.5 rounded-full transition-colors duration-mid ease-out-quart ${barCls(i)}`}
            style={{ transitionDelay: `${(i - 1) * 60}ms` }}
          />
        ))}
      </div>
      <p className="mt-1.5 text-meta">
        <span className={`font-display font-semibold uppercase text-micro ${txt}`}>{labels[s]}</span>
        <span className="text-ink-500 ml-2">{s < 4 ? 'დაამატე სიმბოლო ან ციფრი' : 'პაროლი ძლიერია'}</span>
      </p>
    </div>
  )
}

export const CodeInput = ({ value, onChange, length = 6 }: { value: string; onChange: (v: string) => void; length?: number }) => {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length }, (_, i) => value[i] ?? '')
  const apply = (next: string[]) => onChange(next.join('').slice(0, length))
  const setOne = (i: number, raw: string) => {
    const d = raw.replace(/\D/g, '')
    if (!d) { const next = digits.slice(); next[i] = ''; apply(next); return }
    if (d.length > 1) {
      const sub = d.slice(0, length - i)
      const next = digits.slice()
      for (let k = 0; k < sub.length; k++) next[i + k] = sub[k]
      apply(next)
      refs.current[Math.min(i + sub.length, length - 1)]?.focus()
      return
    }
    const next = digits.slice(); next[i] = d[0]; apply(next)
    if (i < length - 1) refs.current[i + 1]?.focus()
  }
  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus()
  }
  return (
    <div className="flex gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={e => setOne(i, e.target.value)}
          onKeyDown={e => onKey(i, e)}
          aria-label={`ციფრი ${i + 1}`}
          className={`w-11 h-12 sm:w-[52px] sm:h-14 rounded-card border-2 bg-white text-center font-display text-h2 font-bold text-ink-900 tabular-nums focus:ring-2 focus:ring-brand-100 focus:outline-none transition-colors duration-fast ${d ? 'border-brand-500' : 'border-ink-200 focus:border-brand-500'}`}
        />
      ))}
    </div>
  )
}
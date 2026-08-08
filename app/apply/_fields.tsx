'use client'
// /apply — the field layer: the error context a field reads, the labelled
// wrapper, the input, and the two live hints (bio counter, name script).

import React from 'react'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { APPLY, nameError } from '@/lib/applyValidation'
import { ApplyErr, FormState } from './_form'

export const ApplyErrCtx = React.createContext<ApplyErr>(null)

/** The message under the offending control. Renders nothing for every other field. */
export const FieldError = ({ name }: { name: string }) => {
  const err = React.useContext(ApplyErrCtx)
  if (!err || err.field !== name) return null
  return (
    <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-meta font-medium text-danger-700 leading-[1.45]">
      <Icon.warn aria-hidden className="w-3.5 h-3.5 shrink-0 mt-px" />
      <span>{err.msg}</span>
    </p>
  )
}

/** True while `name` is the field the last validation failure named. */
const useFieldInvalid = (name?: string) => {
  const err = React.useContext(ApplyErrCtx)
  return !!name && err?.field === name
}

export const Field = ({ l, sub, required, name, children }: { l: string; sub?: string; required?: boolean; name?: string; children: React.ReactNode }) => {
  const invalid = useFieldInvalid(name)
  return (
    <label className="block">
      <Eyebrow as="span" tone="muted" className="block mb-1.5">{l}{required && <span className="text-danger-500 ml-0.5" aria-hidden>*</span>}</Eyebrow>
      {/* The border is repainted from the wrapper so the invalid state costs
          nothing at ~15 call sites (and `Input` keeps its single className). */}
      <span className={invalid ? 'block [&_input]:border-danger-400 [&_textarea]:border-danger-400' : 'block'}>{children}</span>
      {/* The hint yields to the error: two lines under one input, one saying
          „fill this in like so" and one saying „this is wrong", is noise. */}
      {sub && !invalid && <span className="block mt-1.5 text-meta text-ink-500 leading-[1.4]">{sub}</span>}
      {name && <FieldError name={name} />}
    </label>
  )
}

export const Input = (p: any) => <input {...p} className={`w-full h-11 px-3.5 rounded-field border border-ink-200 bg-white text-body text-ink-900 placeholder:text-ink-400 hover:border-ink-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-[border-color,box-shadow] duration-fast ${p.className || ''}`} />

/** Bio length feedback. Silent in the middle, where there is nothing to say. */
export const BioCounter = ({ value }: { value: string }) => {
  const n = value.trim().length
  const short = n > 0 && n < APPLY.BIO_MIN
  const near = n > APPLY.BIO_MAX - 200
  if (!short && !near) return null
  return (
    <p className={`mt-1.5 text-meta tabular-nums ${near ? 'text-warning-800' : 'text-ink-500'}`}>
      {near ? `დარჩა ${APPLY.BIO_MAX - n} სიმბოლო` : `კიდევ ${APPLY.BIO_MIN - n} სიმბოლო`}
    </p>
  )
}

/** Live „your name has to be Georgian" note — see its call site in Step1. */
export const NameScriptHint = ({ form }: { form: FormState }) => {
  const err = React.useContext(ApplyErrCtx)
  const full = `${form.firstName.trim()} ${form.lastName.trim()}`.trim()
  // Nothing typed yet → not a problem yet. And when the gate has already
  // flagged the field, that red line is saying this; don't say it twice.
  if (!full || !nameError(full) || err?.field === 'firstName' || err?.field === 'lastName') return null
  return (
    <p className="mt-2 flex items-start gap-1.5 text-meta text-warning-800 leading-[1.45]">
      <Icon.warn aria-hidden className="w-3.5 h-3.5 shrink-0 mt-px text-warning-600" />
      <span>{nameError(full)}</span>
    </p>
  )
}
'use client'
// /join — the field layer: the error context a field reads, the labelled
// wrapper, and the input.
//
// ⚠️ NOTHING IMPORTS THIS FILE (measured 2026-08-31: zero references to
// `_shared/_fields`, `ApplyErr` or `ApplyErrCtx` anywhere outside it). It went
// dead with the consultation wizard on 2026-08-24 — `_upload` and
// `useCategories` beside it are still live, which is why the folder is not.
//
// ⚠️ AND IT EXPORTS A SECOND `FieldError`. The live one is
// **components/FieldError.tsx** — same idea, one form-scoped id so
// `aria-describedby` can point at the message, and `useFault` to move the
// cursor. An auto-import can reach either name; reach for the one in
// components/. This file is a deletion candidate, left in place only because
// the owner is working in app/join/ today.
// ⚠️ TWO HINTS LEFT THIS FILE ON 2026-08-24 — `BioCounter` and
// `NameScriptHint` — with the consultation wizard that was their only caller.
// `ApplyErr` came from that wizard's `_form.tsx` too; it is three fields wide
// and is declared here now, beside the context that carries it.

import React from 'react'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'

/** Which control refused, and why. One at a time: the form scrolls to it. */
export type ApplyErr = { field: string; msg: string } | null

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

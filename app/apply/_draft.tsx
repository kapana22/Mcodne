'use client'
// /apply — the localStorage draft: a half-filled application survives a
// reload, and expires rather than haunting the form forever.

import { FormState, INITIAL_FORM } from './_form'

/* ───── Draft persistence ─────
 *
 * localStorage-backed draft — restores the form on mount (only if <7 days
 * old), saves after every field change, and clears on successful submit or
 * once the flow reaches step 5.
 */
const APPLY_DRAFT_KEY = 'mcodne:apply-draft'
const APPLY_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

type ApplyDraftEnvelope = { form: FormState; savedAt: number }

export function readApplyDraft(): FormState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(APPLY_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ApplyDraftEnvelope>
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.savedAt !== 'number') return null
    if (Date.now() - parsed.savedAt > APPLY_DRAFT_TTL_MS) return null
    if (!parsed.form || typeof parsed.form !== 'object') return null
    // Shape guard: merge over INITIAL_FORM so missing fields fall back to defaults.
    return { ...INITIAL_FORM, ...parsed.form } as FormState
  } catch {
    return null
  }
}

export function writeApplyDraft(form: FormState) {
  if (typeof window === 'undefined') return
  try {
    const env: ApplyDraftEnvelope = { form, savedAt: Date.now() }
    window.localStorage.setItem(APPLY_DRAFT_KEY, JSON.stringify(env))
  } catch {
    // Storage full/disabled — silent no-op.
  }
}

export function clearApplyDraft() {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(APPLY_DRAFT_KEY) } catch {}
}
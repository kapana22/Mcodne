'use client'
// Route-level error boundary for THE WORKSPACE (Next.js contract: must be a
// client component receiving { error, reset }).
//
// ⚠️ WHY IT WAS ADDED (2026-09-01). /me has had one since it was /student; the
// supply side had none, so a render-time throw anywhere under /work — the
// editor, the balance ledger, the jobs list — fell through to app/error.tsx,
// the site-wide 500 page. That page is a full-bleed plate with a „500" numeral
// on it, and its two actions are „თავიდან ცდა" and „მთავარი" → `/`. So a
// provider whose one screen failed lost the whole workspace: no rail, no
// balance, no tab bar, and the only door offered led OUT of their room and onto
// the marketing home. Every other door they had was on the chrome that the root
// boundary had just replaced.
//
// This boundary sits INSIDE app/work/layout.tsx, so WorkspaceShell is still
// drawn around it and every one of those doors is still on screen — which is
// why one action is enough here, exactly as on app/me/error.tsx.
//
// The copy, the shape and the primitives are that file's, deliberately and
// verbatim: two rooms of one product answering the same failure with two
// different sentences is the drift the shared components exist to stop.

import { useEffect } from 'react'
import { reportClientError } from '@/lib/reportError'
import { Btn } from '@/components/Btn'
import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reportClientError('render', error.message, error.stack, error.digest)
  }, [error])
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-16">
      {/* `padding="none"` and the pair spelled here — see app/me/error.tsx. */}
      <Card padding="none" className="w-full max-w-[420px] py-12 px-6 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-ink-100 text-ink-500 mb-4">
          <Icon.warn className="w-6 h-6" />
        </div>
        <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">რაღაც აირია</div>
        <p className="text-small text-ink-500 mt-1.5">გვერდი ვერ ჩაიტვირთა.</p>
        <Btn type="button" onClick={() => reset()} className="mt-5">
          სცადე თავიდან
        </Btn>
      </Card>
    </div>
  )
}

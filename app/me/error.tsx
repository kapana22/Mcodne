'use client'
// Route-level error boundary for THE CLIENT ROOM (Next.js contract: must be a
// client component receiving { error, reset }). Without it, a render-time throw
// in any /me page took down the whole tree with the default unstyled crash
// screen. Compact per canon: icon + one line + one action.
//
// ⚠️ IT SAID „the student area" UNTIL 2026-09-01. The space was /student until
// stage 6 (2026-08-19) and the old address 308s here from middleware.ts; the
// comment simply outlived the rename.
//
// ⚠️ IT DREW ITS OWN SVG, ITS OWN CARD AND ITS OWN BUTTON (same date). The
// triangle was byte-for-byte `Icon.warn`, the plate was the exact shell <Card>
// owns and the action was the exact fill+hover pair <Btn variant="primary">
// owns — three hand-built copies of primitives that exist so a fix lands
// everywhere at once (tests/primitiveAdoption is the standing argument). The
// rendered screen is unchanged.
//
// ⚠️ THERE IS EXACTLY ONE ACTION, AND THAT IS ENOUGH HERE. This boundary sits
// INSIDE app/me/layout.tsx, so ClientShell — the rail, the top bar, the phone's
// tab bar — is still drawn around it: every other door out of this screen is
// already on screen. The root boundary (app/error.tsx) is the one that has to
// carry „მთავარი", because it replaces the chrome as well as the page.

import { useEffect } from 'react'
import { reportClientError } from '@/lib/reportError'
import { Btn } from '@/components/Btn'
import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'

export default function ClientRoomError({
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
      {/* `padding="none"` and the pair spelled here: the plate's 48/24 is not
          one of the four canon tiers, and two padding utilities on one element
          resolve by Tailwind's emit order rather than the order they are
          written — see the header of components/Card. */}
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

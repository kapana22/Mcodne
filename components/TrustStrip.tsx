import { Icon } from './Icon'
import { PAYMENTS_LIVE } from '@/lib/flags'

// Honest by flag: until the payment integration is live, never claim
// "გადახდა დაცულია" — the canon keeps "coming soon" notes until it's real.
export function TrustStrip() {
  return (
    <div className="flex items-center gap-2 text-meta text-ink-500">
      <Icon.lock className="w-3.5 h-3.5 text-ink-400" />
      {PAYMENTS_LIVE ? (
        <>
          <span>გადახდა დაცულია</span>
          <span className="font-semibold text-ink-700">TBC</span>
          <span className="text-ink-300">·</span>
          <span className="font-semibold text-ink-700">BOG</span>
        </>
      ) : (
        // Was „უსაფრთხო გადახდები · მალე" — the last roadmap line left on the
        // site. A trust strip has to state something true NOW; „soon" is a
        // promise, and a promise in the reassurance slot reassures nobody.
        <span>დაჯავშნა <span className="font-semibold text-ink-700">უფასოა</span></span>
      )}
    </div>
  )
}

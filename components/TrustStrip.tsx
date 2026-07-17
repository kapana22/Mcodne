import { Icon } from './Icon'
import { PAYMENTS_LIVE } from '@/lib/flags'

// Honest by flag: until the payment integration is live, never claim
// "გადახდა დაცულია" — the canon keeps "coming soon" notes until it's real.
export function TrustStrip() {
  return (
    <div className="flex items-center gap-2 text-[12px] text-ink-500">
      <Icon.lock className="w-3.5 h-3.5 text-ink-400" />
      {PAYMENTS_LIVE ? (
        <>
          <span>გადახდა დაცულია</span>
          <span className="font-semibold text-ink-700">TBC</span>
          <span className="text-ink-300">·</span>
          <span className="font-semibold text-ink-700">BOG</span>
        </>
      ) : (
        <span>უსაფრთხო გადახდები · <span className="font-semibold text-ink-700">მალე</span></span>
      )}
    </div>
  )
}

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
        // Was „უსაფრთხო გადახდები · მალე" — a roadmap line, and „soon" in the
        // reassurance slot reassures nobody. It then read „დაჯავშნა უფასოა",
        // which was true and still wrong: owner, 2026-08-21 — „უფასო და ესეთი
        // რამები, რაც არაპროფესიონალურია და საიტს ნდობას უკარგავს, არ
        // გამოიყენო." Every professional marketplace puts verification or a
        // count in this slot, never the price of nothing.
        // ⚠️ THE FACT SURVIVES THE WORD. Payments are genuinely not live, so
        // nothing is charged and no card is asked for — said as the state it
        // is rather than as an offer. Drop it entirely and somebody arrives at
        // a booking screen expecting to pay.
        <span>ბარათი <span className="font-semibold text-ink-700">არ გჭირდება</span></span>
      )}
    </div>
  )
}

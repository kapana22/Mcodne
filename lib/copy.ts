// Canonical UI copy strings shared across surfaces.
//
// RISK_REVERSAL_LINE — the ONE risk-reversal sentence rendered under every
// booking CTA (QuickBook confirm step, profile booking rail, mobile booking
// bar). The cancellation window reads from lib/flags.CANCEL_CUTOFF_HOURS so
// copy can never drift from the server's refund rule. Canon styling at the
// call sites: text-[11.5px] text-ink-500.

import { CANCEL_CUTOFF_HOURS } from '@/lib/flags'

export const RISK_REVERSAL_LINE = `გაუქმება უფასოა სესიამდე ${CANCEL_CUTOFF_HOURS} სთ-ით ადრე · გამოუცხადებლობის შემთხვევაში ჩანაცვლება უფასოა`

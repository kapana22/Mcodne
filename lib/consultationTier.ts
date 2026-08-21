// The tier, derived — the ONE place it is computed.
//
// ⚠️ IT IS A DERIVED COLUMN NOTHING READS, and it stays for one reason:
// `Consultation.tier` is NOT NULL, and CLAUDE.md's database rule is additive
// only — an enum is never dropped and never renamed. So every write must still
// put a legal value in the column, and this is what decides it.
//
// Until 2026-08-21 this ladder existed TWICE — once in the browser
// (app/work/services/_consultations → `tierFromMinutes`, posted with every save)
// and once in the application approver (app/api/applications/[id] →
// `tierForMinutes`). Two copies of an arithmetic whose result no surface renders
// and no branch tests: components/booking/slots states it outright — „the only
// two columns tier RESOLUTION actually reads" are minutes and price — and a grep
// for the three values outside these derivations finds nothing.
//
// A client can no longer state it, so a client can no longer disagree with it.

export type ConsultationTier = 'QUICK' | 'STANDARD' | 'DEEP'

/** From the one number that defines it. A service (`minutes: 0`) reads QUICK,
 *  which is meaningless and legal — the column is never consulted either way. */
export function tierOf(minutes: number): ConsultationTier {
  if (minutes <= 20) return 'QUICK'
  if (minutes <= 45) return 'STANDARD'
  return 'DEEP'
}

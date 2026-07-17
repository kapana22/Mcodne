// Single source of truth for progressive-disclosure feature flags.
// Flipping one of these here is the ONLY change required to (dis)enable
// the corresponding UI surface across the app. Do NOT sprinkle equivalent
// booleans elsewhere — always import from this file.

// Wallet / cards-on-file / invoices / subscription UI. The audit found no
// working backend for any of these — hidden by default. Set to `true` only
// when the payments V2 stack (Stripe/BOG/TBC checkout, wallet ledger, cards
// vault, invoice generator) actually ships.
export const FEATURE_PAYMENTS_V2 = false

// Whether the payment gateway (escrow, TBC/BOG/SOLO checkout, tutor payouts)
// is live. When false, all payment-facing copy renders in a "coming soon"
// tone: no specific bank names, no payout dates, no charge implication. The
// booking flow still creates Bookings and marks them PREPARING; nothing is
// actually charged until this flag is flipped on and the integration ships.
export const PAYMENTS_LIVE = false

// The single canonical commission percentage the platform takes from a paid
// booking. Every copy string that mentions commission must read from here so
// the "15% here / 10% there" mismatch can never regress.
export const COMMISSION_PCT = 15

// Tutor's share of a paid booking (used in earnings displays).
export const TUTOR_PAYOUT_PCT = 100 - COMMISSION_PCT

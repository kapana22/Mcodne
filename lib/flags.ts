// The only place a progressive-disclosure flag is defined. Flipping one here is
// the whole change; never write an equivalent boolean anywhere else.
//
// A flag with no reader is a control that lies — four have been deleted from
// this file for that reason rather than left switched off. Git holds their
// reasoning; if one comes back, it comes back with the code it gates.

// Whether the payment gateway (escrow, checkout, provider payouts) is live.
// False makes every payment-facing string read as „coming soon": no bank names,
// no payout dates, no charge implication. Nothing is charged until this flips.
export const PAYMENTS_LIVE = false

// The one commission number. Every string that mentions commission reads from
// here, so „15% here / 10% there" cannot regress.
export const COMMISSION_PCT = 15

// ⚠️ `FEATURE_ABROAD` AND `ABROAD_EUR_PER_GEL` WENT ON 2026-09-03, WITH /abroad
// AND lib/abroad.ts. The vertical had been dark since 2026-08-04 and the owner
// ruled it out („ააღარ გვინდა ეგ ორი გვერდი"). The `diaspora` Category the whole
// thing keyed off had never been created — `Category` held no such row — so the
// switch guarded a page whose data did not exist. Git holds the landing, the FX
// helper and the four curated cards; if the diaspora comes back it comes back
// with a category row and a decision, not a flag somebody forgot to flip.

// ⚠️ `B2B_VISIBILITY` AND `B2BVisibility` WENT ON 2026-09-03. They gated the
// B2B vertical — /business, the fixed-price service catalogue we sold to
// companies, the enquiry queue and a prepaid company balance — through three
// states ('off' | 'admin' | 'public') so it could be walked into production a
// step at a time. It never was: the flag read 'off' from 2026-08-11 to the day
// the owner removed the vertical („ააღარ გვინდა ეგ ორი გვერდი"), and every
// table behind it held test rows only.
//
// A company can still SELL here — /join offers „კომპანია" beside „ფიზიკური
// პირი", and `Company` + `CompanyMember` are what that registration hangs on.
// That is supply, not a sales channel, and nothing hides it behind a flag.

// Single source for every support address the site advertises. Pages, the
// contact form and lib/mailer all read from here — never re-type a literal.
//
// ⚠️ An address here only WORKS if the domain can RECEIVE mail (MX / Cloudflare
// Email Routing). See the note at the top of lib/mailer.ts. Never add a new
// address before a routing rule exists for it — an unrouted @mcodne.ge address
// drops every message sent to it, silently and without a bounce.
//
// Deliberately dependency-free so `'use client'` pages can import it: importing
// lib/mailer would drag nodemailer (fs/net/tls) into the browser bundle.

// ⏳ TEMPORARY (2026-07-27): all three point at a Gmail inbox, not @mcodne.ge.
// The @mcodne.ge addresses were advertised site-wide while the domain could not
// receive mail — every message written to them was dropped. A Gmail address is
// ugly on a branded site but it is REACHABLE, and reachable beats pretty.
// Swap all three back to hi@/privacy@/legal@mcodne.ge the moment MX exists —
// this file is the only place to edit, every surface reads from here.
const TEMP_INBOX = 'mcodne.ge@gmail.com'

export const SUPPORT_EMAIL = TEMP_INBOX
export const PRIVACY_EMAIL = TEMP_INBOX
export const LEGAL_EMAIL = TEMP_INBOX

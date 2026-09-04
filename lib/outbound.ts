// EVERY MESSAGE THIS SITE CAN SEND, IN ONE LIST.
//
// Owner, 2026-09-02: „მინდა ვმართოთ მეილზე გაგზავნის ტელეფონზე გაგზავნა სად
// მიდის როდის მიდის და ასეთი დეტალები რომ კარგად იყოს მოწესრიგებული და არ
// გაგვეპაროს შეცდომები."
//
// Before this file the answer to „what does the site send" was 27 `sendMail`
// calls in 18 files, and the answer to „what did it send" was a console line in
// a Railway log that scrolls away. Neither question could be asked in the admin.
//
// ⚠️ THE KEY IS REQUIRED BY THE COMPILER, and that is the whole design. Both
// senders (lib/mailer → sendMail, lib/sms → sendSms) take an `OutboundKey`, so
// a new message cannot be added without appearing here — `tsc` refuses it. A
// registry that anything can bypass is a list of the messages somebody
// remembered to list, which is exactly the drift being fixed.
//
// `channels` says what a message is ALLOWED to use, not what it did. The log
// (MessageLog, written by both senders) says what actually happened.

export type Channel = 'mail' | 'sms'

/** Who is at the other end. The admin groups by this, because „did the provider
 *  hear about the job" and „did the client hear about the offer" are two
 *  different worries and they are answered on different days. */
export type Audience =
  | 'client'    // somebody buying — /me
  | 'provider'  // somebody selling — /work
  | 'admin'     // us, as moderators
  | 'inbox'     // us, as a support address (CONTACT_INBOX / SUPPORT_EMAIL)
  | 'anyone'    // account-level, before either identity exists

export type OutboundDef = {
  key: string
  /** The admin table's row label. Georgian, like every operator-facing string. */
  label: string
  /** What fires it — in words, so the tab does not need the code beside it. */
  when: string
  audience: Audience
  /**
   * ⚠️ CHANNELS THAT ARE ACTUALLY WIRED — not channels somebody would like.
   *
   * The admin tab draws a switch per channel listed here, and CLAUDE.md's own
   * rule applies one screen further out: a flag with no reader is a control
   * that lies. Listing `sms` on a message whose trigger never calls `sendSms`
   * would put a switch in front of an operator that does nothing when they
   * flip it. Wire the send first, then add the channel here.
   */
  channels: Channel[]
  /** SMS is live for this message the moment it is wired, with no admin
   *  switch first. Only the hand tool carries it: a text costs money per part,
   *  so every product message starts OFF and somebody turns it on deliberately
   *  (lib/outboundSettings → defaultState). */
  smsByDefault?: true
  /** ⚠️ A code the recipient is WAITING FOR. Two things follow: it is never
   *  held by a cutoff (see lib/mailer → MAIL_ONLY_AFTER) in the operator's
   *  reading of the tab, and its text must never be logged. */
  credential?: true
}

export const OUTBOUND = [
  /* ── the account ─────────────────────────────────────────────────────── */
  { key: 'auth.welcome',            label: 'მოგესალმებით',                when: 'რეგისტრაციისთანავე', audience: 'anyone', channels: ['mail'] },
  { key: 'auth.googleLinked',       label: 'Google მიება ანგარიშს',       when: 'Google-ით პირველი შესვლისას არსებულ ანგარიშზე', audience: 'anyone', channels: ['mail'] },
  { key: 'auth.otpVerify',          label: 'ელფოსტის დადასტურების კოდი',  when: 'როცა მომხმარებელი კოდს ითხოვს', audience: 'anyone', channels: ['mail'], credential: true },
  /* ⚠️ `smsByDefault` — THE ONE PRODUCT MESSAGE THAT STARTS ON, and the rule it
     breaks is worth naming. Every other SMS defaults to off because a part is
     billed and nobody should be charged for a channel they did not turn on
     (lib/outboundSettings → defaultState). This one is not a notification about
     the product, it IS the front door: phone registration is passwordless, so a
     person whose code never arrives cannot register and cannot sign in. Shipping
     it off would ship a door that is locked. The owner can still switch it off
     in /admin — and /api/auth/phone/start reports the hold to the screen rather
     than pretending the code went, so it fails loudly instead of silently. */
  { key: 'auth.phoneCode',          label: 'ნომრით შესვლის კოდი',         when: 'როცა მომხმარებელი ნომერს წერს /signin-ზე', audience: 'anyone', channels: ['sms'], smsByDefault: true, credential: true },
  { key: 'auth.otpReset',           label: 'პაროლის აღდგენის კოდი',       when: 'როცა მომხმარებელი კოდს ითხოვს', audience: 'anyone', channels: ['mail'], credential: true },
  { key: 'auth.passwordReset',      label: 'პაროლის აღდგენის ბმული',      when: '/signin → პაროლი დამავიწყდა', audience: 'anyone', channels: ['mail'], credential: true },

  /* ── the client's side of a request ──────────────────────────────────── */
  /* ⚠️ THESE TWO GAINED AN SMS CHANNEL ON 2026-09-03, and the reason is that
     the intake stopped asking for an email. A client with no account now has a
     phone number and nothing else, so „we got it, here is your page" and
     „somebody answered" are the two things that must still reach them. The
     other four client events stay mail-only: they matter to somebody who
     registered, and that person has an address.
     ⚠️ SMS still defaults to OFF per message (lib/outboundSettings) — a letter
     is free and a text is not. Turning these on is a decision with a bill, and
     it is the owner's to make in /admin. */
  { key: 'request.received.client',      label: 'განაცხადი მიღებულია',      when: 'განაცხადის შევსებისთანავე', audience: 'client', channels: ['mail', 'sms'] },
  { key: 'request.offerArrived.client',  label: 'შემოვიდა შეთავაზება',      when: 'პროვაიდერი წერს შეთავაზებას', audience: 'client', channels: ['mail', 'sms'] },
  { key: 'request.offerDigest.client',   label: 'შეთავაზებების შეხსენება',  when: 'ღამის cron — უპასუხო შეთავაზებები', audience: 'client', channels: ['mail'] },
  { key: 'request.closedNoOffers.client', label: 'განაცხადი დაიხურა უპასუხოდ', when: 'ღამის cron — ვადა გავიდა, შეთავაზება არ იყო', audience: 'client', channels: ['mail'] },
  /* ⚠️ SMS JOINED THIS ROW ON 2026-09-04, and it is now the channel that
     actually fires. The client's email field left the intake on 2026-09-03, so
     a request filed since has no address and the mail branch sent nothing —
     the provider marked the job finished and the client was never told, which
     is also why they were never asked for the review this product is built
     around. Same reasoning, same shape as `request.offerArrived.client` above. */
  { key: 'request.done.client',          label: 'სამუშაო დასრულდა',         when: 'პროვაიდერი აღნიშნავს დასრულებულად', audience: 'client', channels: ['mail', 'sms'] },
  { key: 'request.doneReminder.client',  label: 'დაადასტურე დასრულება',     when: 'ღამის cron — დაუდასტურებელი დასრულება', audience: 'client', channels: ['mail'] },

  /* ── the provider's side ─────────────────────────────────────────────── */
  // ⚠️ THE ONE THE MARKETPLACE TURNS ON. 17 requests have produced 6 offers
  // (measured 2026-09-02); the gap is providers not seeing a request in time.
  /* ⚠️ `smsByDefault` ADDED 2026-09-04 ON THE OWNER'S INSTRUCTION: „როდესაც
     ექსპერტი დარეგისტრირდება და კატეგორიას აირჩევს შეტყობინებები და
     შეთავაზებები მიდიოდეს ამ ნომერზე."

     It was wired on 2026-09-02 and left switched off under the general rule
     that a billed channel starts off. The owner has now made that call for this
     one message — the only one that carries actual paid work to somebody who
     can do it, and the reason a provider comes back to the site at all. Every
     kill switch above it is untouched: `SMS_MODE`, the /admin toggle and
     `SMS_ONLY_AFTER` all still stop it. */
  { key: 'request.verified.provider',    label: 'ახალი განაცხადი შენს კატეგორიაში', when: 'ადმინი ადასტურებს განაცხადს', audience: 'provider', channels: ['mail', 'sms'], smsByDefault: true },
  { key: 'request.offerAccepted.provider', label: 'შენი შეთავაზება მიიღეს',   when: 'კლიენტი იღებს შეთავაზებას', audience: 'provider', channels: ['mail'] },
  { key: 'request.done.provider',        label: 'სამუშაო დასრულებულად აღინიშნა', when: 'დასრულების აღნიშვნისას', audience: 'provider', channels: ['mail'] },
  { key: 'request.contactRefunded.provider', label: 'კონტაქტის თანხა დაბრუნდა', when: 'განაცხადი უპასუხოდ დაიხურა — ავტომატური დაბრუნება', audience: 'provider', channels: ['mail'] },

  /* ── the conversation ────────────────────────────────────────────────── */
  { key: 'thread.message',  label: 'ახალი წერილი მიმოწერაში',   when: 'მეორე მხარე წერს განაცხადის თემაში', audience: 'anyone', channels: ['mail'] },
  { key: 'chat.message',    label: 'ახალი წერილი მიმოწერაში',   when: 'მეორე მხარე წერს შეთავაზების მიმოწერაში', audience: 'anyone', channels: ['mail'] },

  /* ── becoming a provider ─────────────────────────────────────────────── */
  { key: 'application.new.admin',  label: 'ახალი განაცხადი პროვაიდერობაზე', when: '/join-ის შევსებისთანავე', audience: 'admin', channels: ['mail'] },
  { key: 'application.approved',   label: 'განაცხადი დამტკიცდა',            when: 'ადმინი ამტკიცებს', audience: 'provider', channels: ['mail'] },
  { key: 'application.revision',   label: 'განაცხადს სჭირდება შესწორება',   when: 'ადმინი აბრუნებს შესასწორებლად', audience: 'provider', channels: ['mail'] },
  { key: 'application.rejected',   label: 'განაცხადი უარყოფილია',           when: 'ადმინი უარყოფს', audience: 'provider', channels: ['mail'] },

  /* ── us, writing out ─────────────────────────────────────────────────── */
  { key: 'admin.directMessage', label: 'ადმინის პირადი წერილი', when: '/admin → მომხმარებლები → მიწერა', audience: 'anyone', channels: ['mail'] },
  { key: 'admin.broadcast',     label: 'მასობრივი შეტყობინება', when: '/admin → შეტყობინების გაგზავნა', audience: 'anyone', channels: ['mail'] },

  /* ── us, receiving ───────────────────────────────────────────────────── */
  { key: 'inbox.contact',      label: 'საკონტაქტო ფორმა',          when: '/contact-ის შევსებისას', audience: 'inbox', channels: ['mail'] },
  { key: 'inbox.help',         label: 'დახმარების კითხვა',         when: 'ვიზიტორი წერს დახმარების მიმოწერაში', audience: 'inbox', channels: ['mail'] },
  { key: 'inbox.newRequest',   label: 'ახალი განაცხადი — ჩვენი ასლი', when: 'განაცხადის შევსებისთანავე, თუ არ იყო უარყოფილი', audience: 'inbox', channels: ['mail'] },
  { key: 'inbox.threadCopy',   label: 'მიმოწერის ასლი',            when: 'როცა მიმოწერაში მისამართი ჩვენია', audience: 'inbox', channels: ['mail'] },

  /* ── the tools ───────────────────────────────────────────────────────── */
  { key: 'test.manual', label: 'ხელით გაშვებული ტესტი', when: 'scripts/sms-test.ts', audience: 'admin', channels: ['mail', 'sms'], smsByDefault: true },
] as const satisfies readonly OutboundDef[]

export type OutboundKey = (typeof OUTBOUND)[number]['key']

const BY_KEY = new Map(OUTBOUND.map(d => [d.key as string, d as OutboundDef]))

/** The definition, or null for a key that is not registered. Null is only
 *  reachable from a log row written before a key was renamed — the compiler
 *  covers every live call site. */
export const outboundDef = (key: string): OutboundDef | null => BY_KEY.get(key) ?? null

/** The admin's row label, falling back to the raw key so a historical row still
 *  says something rather than rendering blank. */
export const outboundLabel = (key: string): string => BY_KEY.get(key)?.label ?? key

export const AUDIENCE_LABEL: Record<Audience, string> = {
  client: 'კლიენტი',
  provider: 'პროვაიდერი',
  admin: 'ადმინი',
  inbox: 'ჩვენი ინბოქსი',
  anyone: 'ნებისმიერი',
}

export const CHANNEL_LABEL: Record<Channel, string> = { mail: 'ელფოსტა', sms: 'SMS' }

/* ── what may be switched off at all ──────────────────────────────────────── */
//
// Pure policy, kept beside the registry rather than beside the database: the
// admin tab is a client component and has to ask the same question the server
// enforces. Two answers that could drift are two answers that will.

/**
 * Whether an operator is allowed to turn this channel off for this message.
 *
 * Two refusals, and both are somebody's actual problem rather than tidiness:
 *
 *   • A CREDENTIAL. A password-reset code with an off switch is a person
 *     locked out of their own account by a checkbox they will never see. This
 *     is the rule Shopify applies to its own required receipts — the row is
 *     listed, with no toggle beside it.
 *   • OUR OWN INBOX. `inbox.*` is us RECEIVING — the contact form, the help
 *     chat, a B2B lead. Switching one off does not spare anybody a message; it
 *     drops a stranger's question on the floor with nobody told.
 *
 * SMS is refusable everywhere, always: it costs money per part and nobody is
 * owed one.
 */
export function canToggle(key: string, channel: Channel): boolean {
  const d = outboundDef(key)
  if (!d) return false
  if (channel === 'sms') return d.channels.includes('sms')
  if ('credential' in d) return false
  if (d.audience === 'inbox') return false
  return true
}


/**
 * Is this a code or a link the recipient is AT THAT MOMENT WAITING FOR?
 *
 * ⚠️ IT DECIDES WHETHER THE „DO NOT CONTACT PRE-EXISTING PEOPLE" CUTOFF APPLIES
 * (2026-09-04). `MAIL_ONLY_AFTER` / `SMS_ONLY_AFTER` exist so a pre-launch site
 * does not INITIATE contact with rows that were here before it — owner: „ვინც
 * user არის ახლანდელი, იმათ არ გაუგზავნო." Somebody who has just typed their
 * number into the sign-in form and is watching the code field is not being
 * contacted by us. They asked. Holding that message protects nobody and locks
 * them out of their own account, silently, with `ok: true` in the log.
 *
 * The flag was already on the three `auth.*` codes; it had simply never been
 * read by a sender. Phone registration is what made it urgent — those accounts
 * are passwordless, so the code is the ONLY door they have.
 */
export function isCredential(key: string): boolean {
  const d = outboundDef(key)
  return !!d && 'credential' in d
}

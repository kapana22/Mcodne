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
  { key: 'auth.otpReset',           label: 'პაროლის აღდგენის კოდი',       when: 'როცა მომხმარებელი კოდს ითხოვს', audience: 'anyone', channels: ['mail'], credential: true },
  { key: 'auth.passwordReset',      label: 'პაროლის აღდგენის ბმული',      when: '/signin → პაროლი დამავიწყდა', audience: 'anyone', channels: ['mail'], credential: true },

  /* ── the client's side of a request ──────────────────────────────────── */
  { key: 'request.received.client',      label: 'განაცხადი მიღებულია',      when: 'განაცხადის შევსებისთანავე', audience: 'client', channels: ['mail'] },
  { key: 'request.offerArrived.client',  label: 'შემოვიდა შეთავაზება',      when: 'პროვაიდერი წერს შეთავაზებას', audience: 'client', channels: ['mail'] },
  { key: 'request.offerDigest.client',   label: 'შეთავაზებების შეხსენება',  when: 'ღამის cron — უპასუხო შეთავაზებები', audience: 'client', channels: ['mail'] },
  { key: 'request.closedNoOffers.client', label: 'განაცხადი დაიხურა უპასუხოდ', when: 'ღამის cron — ვადა გავიდა, შეთავაზება არ იყო', audience: 'client', channels: ['mail'] },
  { key: 'request.done.client',          label: 'სამუშაო დასრულდა',         when: 'პროვაიდერი აღნიშნავს დასრულებულად', audience: 'client', channels: ['mail'] },
  { key: 'request.doneReminder.client',  label: 'დაადასტურე დასრულება',     when: 'ღამის cron — დაუდასტურებელი დასრულება', audience: 'client', channels: ['mail'] },

  /* ── the provider's side ─────────────────────────────────────────────── */
  // ⚠️ THE ONE THE MARKETPLACE TURNS ON. 17 requests have produced 6 offers
  // (measured 2026-09-02); the gap is providers not seeing a request in time.
  { key: 'request.verified.provider',    label: 'ახალი განაცხადი შენს კატეგორიაში', when: 'ადმინი ადასტურებს განაცხადს', audience: 'provider', channels: ['mail', 'sms'] },
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
  { key: 'inbox.businessLead', label: 'B2B განაცხადი',             when: '/business-ის ფორმის შევსებისას', audience: 'inbox', channels: ['mail'] },
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


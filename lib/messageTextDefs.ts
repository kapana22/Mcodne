// EVERY WORD IN A LETTER OR A TEXT, AS EDITABLE COPY.
//
// Owner, 2026-09-02, having gone looking for it in /admin and not found it:
// „სადა ტექსტები ვერ ვნახე ადმინშში" → „კი, გადაიყვანე".
//
// ⚠️ PURE DATA — no prisma, no react, no import of the templates themselves.
// The same discipline lib/pageSeoDefs keeps, and for the same reason: this
// table is expanded into SITE_TEXTS by lib/siteTextDefs, which has to stay
// importable from a client component. The templates read it back through
// lib/messageText at send time.
//
// ⚠️ THE `default` IS THE STRING THAT SHIPPED, CHARACTER FOR CHARACTER. That is
// what makes the DB row an OVERRIDE rather than a rewrite: a key nobody has
// touched sends exactly what it sent before this file existed. When you change
// a template, change the default here too — the admin editor shows the default
// beside the row, and a stale one is a lie about what the site would send if
// the row were deleted.
//
// ⚠️ PLACEHOLDERS ARE `{name}` AND THEY ARE OPTIONAL. lib/messageText fills
// them; a text that drops one simply loses that value rather than printing
// „{ref}" or throwing. An owner is allowed to write a subject with no reference
// in it — that is an editorial choice, not a bug — so nothing here validates
// that a placeholder survived an edit.

export type MessageTextDef = {
  /** Suffix under the message's key: `msg.<outboundKey>.<part>`. */
  part: string
  label: string
  default: string
  multiline?: true
  /** Placeholders this string may use, for the hint under the field. */
  vars?: string[]
}

export type MessageTextGroup = {
  /** The OutboundKey this copy belongs to (lib/outbound). */
  key: string
  /** The group heading in the admin editor. */
  label: string
  /**
   * The message this copy belonged to is no longer sent, but the KEY must
   * survive: `msg.<key>.<part>` is a SiteText key, a production row may hold
   * copy typed under it, and tests/siteTexts.test.ts § „NO KEY MAY EVER BE
   * RENAMED OR REMOVED" is the ledger that says so. Retiring hides the field
   * from the editor and drops the group out of lib/outbound — the registry of
   * what the site CAN send — while the string stays known.
   */
  retired?: true
  texts: MessageTextDef[]
}

const SUBJ = 'სათაური (Subject)'
const GREET = 'მისალმება — {name} სახელია მძიმით, ან ცარიელი'
const ROW = (n: string) => `ცხრილის იარლიყი — ${n}`
const HEAD = 'შიგნით — სათაური'
const CTA = 'ღილაკის წარწერა'
const BODY = 'ტექსტი'
const BODY2 = 'ტექსტი — მეორე აბზაცი'

export const MESSAGE_TEXTS: MessageTextGroup[] = [
  {
    key: 'auth.otpVerify', label: 'ელფოსტის დადასტურების კოდი',
    texts: [
      { part: 'subject', label: SUBJ, default: 'დაადასტურე ელფოსტა — მცოდნე' },
      { part: 'body1', label: BODY, multiline: true, vars: ['code'], default: 'შენი კოდი: <b>{code}</b>' },
      { part: 'body2', label: 'ტექსტი — ვადა', default: 'ვადა: 10 წუთი' },
    ],
  },
  {
    key: 'auth.otpReset', label: 'პაროლის აღდგენის კოდი',
    texts: [
      { part: 'subject', label: SUBJ, default: 'პაროლის აღდგენა — მცოდნე' },
      { part: 'body1', label: BODY, multiline: true, vars: ['code'], default: 'შენი კოდი: <b>{code}</b>' },
      { part: 'body2', label: 'ტექსტი — ვადა', default: 'ვადა: 10 წუთი' },
    ],
  },
  {
    key: 'auth.passwordReset', label: 'პაროლის აღდგენის ბმული',
    texts: [
      { part: 'subject', label: SUBJ, default: 'პაროლის აღდგენა — მცოდნე' },
      { part: 'body1', label: BODY, multiline: true, default: 'დააჭირე ბმულს ახალი პაროლის დასაყენებლად:' },
      { part: 'body2', label: 'ტექსტი — ვადა', default: 'ვადა: 1 საათი.' },
    ],
  },
  {
    key: 'inbox.contact', label: 'საკონტაქტო ფორმა (ჩვენს ინბოქსში)',
    texts: [
      { part: 'subject', label: SUBJ, vars: ['topic', 'name'], default: '[მცოდნე] {topic} — {name}' },
    ],
  },
  {
    key: 'inbox.help', label: 'დახმარების ჩატის კითხვა (ჩვენს ინბოქსში)',
    texts: [
      { part: 'subject', label: SUBJ, vars: ['name'], default: '[მცოდნე] დახმარების მიმოწერა — {name}' },
      { part: 'anon', label: 'უსახელო მომწერი', default: 'ანონიმური' },
    ],
  },
  {
    // ⚠️ RETIRED 2026-09-03 with the B2B vertical. /business and its lead form
    // are gone, so nothing can produce this letter; the key stays because a
    // SiteText row may hold a subject line somebody typed.
    key: 'inbox.businessLead', label: 'B2B განაცხადი (ჩვენს ინბოქსში)', retired: true,
    texts: [
      { part: 'subject', label: SUBJ, vars: ['company'], default: '[მცოდნე] B2B — {company}' },
    ],
  },
  {
    // The frame every letter is drawn in — one edit changes all twenty.
    key: 'shell', label: 'ყველა წერილი (ჩარჩო)',
    texts: [
      { part: 'footer', label: 'ქვედა კოლონტიტული', default: 'ავტომატური შეტყობინება' },
    ],
  },
  {
    key: 'admin.directMessage', label: 'ადმინის პირადი წერილი',
    texts: [
      { part: 'subject', label: SUBJ, default: 'შეტყობინება მცოდნესგან' },
      { part: 'heading', label: GREET, vars: ['name'], default: '{name}გამარჯობა' },
      { part: 'replyNote', label: 'ტექსტი — პასუხის შესახებ', multiline: true, default: 'უპასუხე პირდაპირ ამ წერილს — ჩვენს ფოსტაზე მოვა და ცოცხალი ადამიანი წაიკითხავს.' },
      { part: 'signature', label: 'ხელმოწერა', default: 'მცოდნეს გუნდი' },
      { part: 'ctaExpert', label: 'ღილაკი — ექსპერტად რეგისტრაცია', default: 'ექსპერტად რეგისტრაცია' },
      { part: 'ctaAccount', label: 'ღილაკი — ანგარიში', default: 'ანგარიშის გახსნა' },
      { part: 'ctaMessage', label: 'ღილაკი — შეტყობინება', default: 'შეტყობინების ნახვა' },
    ],
  },
  {
    key: 'auth.welcome', label: 'მოგესალმებით',
    texts: [
      { part: 'heading', label: GREET, vars: ['name'], default: '{name}კეთილი იყოს შენი მობრძანება!' },
      { part: 'subject', label: SUBJ, default: 'კეთილი იყოს მობრძანება 👋' },
      { part: 'body1', label: BODY, multiline: true, default: 'დარეგისტრირდი <b>მცოდნეზე</b> — აქ შენს საკითხზე პირდაპირ ექსპერტს ესაუბრები.' },
      { part: 'body2', label: BODY2, multiline: true, default: 'აღწერე რა გჭირდება — ექსპერტები შეთავაზებას ფასთან ერთად თავად გამოგიგზავნიან.' },
      { part: 'cta', label: CTA, default: 'იპოვე ექსპერტი' },
    ],
  },
  {
    key: 'auth.googleLinked', label: 'Google მიება ანგარიშს',
    texts: [
      { part: 'heading', label: GREET, vars: ['name'], default: '{name}ანგარიშში Google-ით შეხვედი' },
      { part: 'body3', label: 'ტექსტი — მესამე აბზაცი', multiline: true, vars: ['support'], default: 'თუ ეს შენ არ ყოფილხარ, მაშინვე მოგვწერე: <a href="mailto:{support}">{support}</a>' },
      { part: 'subject', label: SUBJ, default: 'უსაფრთხოება — ანგარიშში Google-ით შეხვედი' },
      { part: 'body1', label: BODY, multiline: true, default: 'შენი ელფოსტა აქამდე დადასტურებული არ იყო, ამიტომ უსაფრთხოებისთვის <b>ძველი პაროლი გავაუქმეთ</b> და ყველა გახსნილი სესია დავხურეთ.' },
      { part: 'body2', label: BODY2, multiline: true, default: 'ამიერიდან ანგარიშში Google-ით შედი. თუ პაროლითაც გინდა შესვლა, დააყენე ახალი — ეს ერთი წუთის საქმეა.' },
      { part: 'cta', label: CTA, default: 'ახალი პაროლის დაყენება' },
    ],
  },
  {
    key: 'application.new.admin', label: 'ახალი განაცხადი პროვაიდერობაზე',
    texts: [
      { part: 'subject', label: SUBJ, vars: ['name'], default: 'ახალი განაცხადი — სერვისი — {name}' },
      { part: 'rowKind', label: ROW('ტიპი'), default: 'ტიპი' },
      { part: 'rowServices', label: ROW('სერვისები'), default: 'სერვისები' },
      { part: 'rowCity', label: ROW('ქალაქი'), default: 'ქალაქი' },
      { part: 'rowPhone', label: ROW('ტელეფონი'), default: 'ტელეფონი' },
      { part: 'rowEmail', label: ROW('ელფოსტა'), default: 'ელფოსტა' },
      { part: 'footer', label: 'ქვედა კოლონტიტული', default: 'ადმინის შეტყობინება' },
      { part: 'heading', label: HEAD, default: 'ახალი განაცხადი მოდერაციაში' },
      { part: 'body1', label: BODY, multiline: true, vars: ['name'], default: '<b>{name}</b> გამოგზავნა განაცხადი სერვისზე.' },
      { part: 'cta', label: CTA, default: 'გახსენი მოდერაცია' },
    ],
  },
  {
    key: 'application.approved', label: 'განაცხადი დამტკიცდა',
    texts: [
      { part: 'heading', label: GREET, vars: ['name'], default: '{name}დამტკიცდი' },
      { part: 'noteLabel', label: 'კომენტარის იარლიყი', default: 'კომენტარი:' },
      { part: 'subject', label: SUBJ, default: 'დამტკიცდი — მოთხოვნები უკვე მოგდის' },
      { part: 'body1', label: BODY, multiline: true, default: 'შენი მიმართულების და შენს ქალაქში გამოგზავნილი მოთხოვნები ახლა შენთან მოდის.' },
      { part: 'body2', label: BODY2, multiline: true, default: 'გახსენი სია, წაიკითხე და ფასი თვითონ დაწერე. სხვები შენს შეთავაზებას ვერ ხედავენ.' },
      { part: 'cta', label: CTA, default: 'გახსენი მოთხოვნები' },
    ],
  },
  {
    key: 'application.revision', label: 'განაცხადს სჭირდება შესწორება',
    texts: [
      { part: 'heading', label: GREET, vars: ['name'], default: '{name}ერთი რამ აკლია' },
      { part: 'noteLabel', label: 'კომენტარის იარლიყი', default: 'კომენტარი:' },
      { part: 'subject', label: SUBJ, default: 'განაცხადს ერთი რამ აკლია' },
      { part: 'body1', label: BODY, multiline: true, default: 'შეავსე და ხელახლა გამოგზავნე — თავიდან ყველაფრის შევსება არ დაგჭირდება.' },
      { part: 'cta', label: CTA, default: 'გახსენი განაცხადი' },
    ],
  },
  {
    key: 'application.rejected', label: 'განაცხადი უარყოფილია',
    texts: [
      { part: 'heading', label: GREET, vars: ['name'], default: '{name}განაცხადი არ დამტკიცდა' },
      { part: 'noteLabel', label: 'კომენტარის იარლიყი', default: 'კომენტარი:' },
      { part: 'body1', label: 'ქვედა კოლონტიტული', multiline: true, default: 'თუ რამე შეიცვალა, ხელახლა გამოგზავნა შეგიძლია.' },
      { part: 'subject', label: SUBJ, default: 'განაცხადი არ დამტკიცდა' },
    ],
  },
  {
    key: 'request.verified.provider', label: 'ახალი განაცხადი შენს კატეგორიაში',
    texts: [
      { part: 'rowWhat', label: ROW('რა'), default: 'რა' },
      { part: 'rowKind', label: ROW('ტიპი'), default: 'ტიპი' },
      { part: 'rowBudget', label: ROW('ბიუჯეტი'), default: 'ბიუჯეტი' },
      { part: 'rowTiming', label: ROW('ვადა'), default: 'ვადა' },
      { part: 'subject', label: SUBJ, vars: ['topic'], default: 'ახალი მოთხოვნა — {topic}' },
      { part: 'heading', label: HEAD, default: 'ახალი მოთხოვნა' },
      { part: 'body1', label: BODY, multiline: true, // ⚠️ „— პირველი შეთავაზებები იგებენ" REMOVED 2026-09-03. The first half is a
      // fact: `offerLimit` caps how many offers a request takes. The second was
      // an invented incentive — nothing makes an early offer win, the client
      // picks on price, profile and the conversation, and the platform measures
      // no such thing. CLAUDE.md rule 6: if it was not measured it does not go
      // on the page.
      default: 'ადგილები შეზღუდულია.' },
      { part: 'cta', label: CTA, default: 'ნახე და შესთავაზე' },
      // ⚠️ ONE SMS PART IS 70 GEORGIAN CHARACTERS (lib/sms → smsParts) and each
      // part is billed. The hint says so in the editor; nothing refuses a longer
      // one, because „this costs two parts" is the owner's call to make.
      { part: 'sms', label: 'SMS — ტექსტი (70 სიმბოლომდე = 1 ნაწილი)', vars: ['topic'], default: 'მცოდნე: ახალი განაცხადი — {topic}. mcodne.ge/work' },
    ],
  },
  {
    key: 'request.offerArrived.client', label: 'შემოვიდა შეთავაზება',
    texts: [
      { part: 'rowRequest', label: ROW('მოთხოვნა'), default: 'მოთხოვნა' },
      { part: 'rowFrom', label: ROW('ვისგან'), default: 'ვისგან' },
      { part: 'rowPrice', label: ROW('ფასი'), default: 'ფასი' },
      { part: 'rowIncludes', label: ROW('რას მოიცავს'), default: 'რას მოიცავს' },
      { part: 'bodyMany', label: 'ტექსტი — როცა რამდენიმე შეთავაზებაა', multiline: true, vars: ['count'], default: 'სულ {count} შეთავაზება გაქვს — შეადარე და აირჩიე.' },
      { part: 'bodyOne', label: 'ტექსტი — როცა ერთია', multiline: true, default: 'ნახე დეტალები და თუ მოგეწონება, აირჩიე.' },
      { part: 'subject', label: SUBJ, vars: ['ref'], default: 'ახალი შეთავაზება — {ref}' },
      { part: 'heading', label: HEAD, default: 'ახალი შეთავაზება მოგივიდა' },
      { part: 'cta', label: CTA, default: 'შეთავაზებების ნახვა' },
      /* ⚠️ THE SMS EXISTS BECAUSE THE EMAIL FIELD WENT (2026-09-03). Owner:
         „კონტაქტის ველიდან ამოვიღოთ მელი." Without an address this is the only
         way a client who has no account learns that somebody answered — and
         „somebody answered" is the whole product. The words are the letter's
         own heading, moved rather than written. */
      { part: 'sms', label: 'SMS — ტექსტი (70 სიმბოლომდე = 1 ნაწილი)', vars: ['ref'], default: 'მცოდნე: ახალი შეთავაზება. mcodne.ge/request/{ref}' },
    ],
  },
  {
    key: 'request.received.client', label: 'განაცხადი მიღებულია',
    texts: [
      { part: 'rowWhat', label: ROW('რა'), default: 'რა' },
      { part: 'rowCode', label: ROW('კოდი'), default: 'კოდი' },
      { part: 'subject', label: SUBJ, vars: ['ref'], default: 'მოთხოვნა მივიღეთ — {ref}' },
      { part: 'heading', label: HEAD, default: 'მოთხოვნა მივიღეთ' },
      { part: 'body1', label: BODY, multiline: true, // ⚠️ „შევამოწმებთ და" REMOVED 2026-09-03 — see app/request/_stepContact for
      // the measurement. A clean request is auto-verified and reaches experts
      // with nobody having read it; this letter was promising a check that does
      // not happen before the hand-off. Nothing else in the sentence changed.
      default: 'ექსპერტებს გადავცემთ. შეთავაზებები ამ ელფოსტაზე მოგივა.' },
      { part: 'body2', label: BODY2, multiline: true, default: 'ეს ბმული შენი მოთხოვნის გვერდია — შეინახე, აქ ნახავ შეთავაზებებს და მოგვწერ, თუ რამე დასამატებელი გაქვს.' },
      { part: 'cta', label: CTA, default: 'ჩემი მოთხოვნა' },
      /* ⚠️ THIS ONE CARRIES THE CODE, AND IT HAS TO. With no email field the
         `MC-` reference exists in exactly one place — the thank-you screen —
         and closing that tab used to mean losing the request for ever. The
         letter has always carried it (see `rowCode` above); the text now does
         the same job for the same person. */
      { part: 'sms', label: 'SMS — ტექსტი (70 სიმბოლომდე = 1 ნაწილი)', vars: ['ref'], default: 'მცოდნე: მოთხოვნა მივიღეთ. შენი გვერდი: mcodne.ge/request/{ref}' },
    ],
  },
  {
    key: 'request.closedNoOffers.client', label: 'განაცხადი დაიხურა უპასუხოდ',
    texts: [
      { part: 'rowRequest', label: ROW('მოთხოვნა'), default: 'მოთხოვნა' },
      { part: 'subject', label: SUBJ, vars: ['ref'], default: 'შეთავაზება არ მოვიდა — {ref}' },
      { part: 'heading', label: HEAD, default: 'ამ მოთხოვნაზე შეთავაზება არ მოვიდა' },
      { part: 'body1', label: BODY, multiline: true, default: 'ვცადეთ, მაგრამ ამ მიმართულებით თავისუფალი ექსპერტი ვერ მოვძებნეთ. მოთხოვნა დავხურეთ.' },
      { part: 'body2', label: BODY2, multiline: true, default: 'თუ პირობები შეიცვალა — ბიუჯეტი, ვადა ან ფორმატი — გამოგვიგზავნე ახალი მოთხოვნა და თავიდან ვცდით.' },
      { part: 'cta', label: CTA, default: 'ახალი მოთხოვნა' },
    ],
  },
  {
    key: 'request.contactRefunded.provider', label: 'კონტაქტის თანხა დაბრუნდა',
    texts: [
      { part: 'rowRequest', label: ROW('მოთხოვნა'), default: 'მოთხოვნა' },
      { part: 'rowAmount', label: ROW('დაბრუნდა'), default: 'დაბრუნდა' },
      { part: 'body1', label: BODY, multiline: true, default: 'ამ მოთხოვნაზე კონტაქტი გახსენი, კლიენტი კი აღარ გამოხმაურებია — არავის შეთავაზება არ მიუღია. ასეთ დროს ფული თავისით ბრუნდება ბალანსზე.' },
      { part: 'subject', label: SUBJ, vars: ['amount'], default: 'დაგიბრუნეთ {amount} — კლიენტი არ გამოეხმაურა' },
      { part: 'heading', label: HEAD, vars: ['amount'], default: '{amount} დაგიბრუნდა' },
      { part: 'body2', label: BODY2, multiline: true, default: 'არაფრის გაკეთება არ გჭირდება — თანხა უკვე ბალანსზეა.' },
      { part: 'cta', label: CTA, default: 'ბალანსი' },
    ],
  },
  {
    key: 'request.offerAccepted.provider', label: 'შენი შეთავაზება მიიღეს',
    texts: [
      { part: 'body1', label: BODY, multiline: true, vars: ['topic'], default: 'კლიენტმა აირჩია შენი შეთავაზება — <b>{topic}</b>.' },
      { part: 'subject', label: SUBJ, default: 'შენი შეთავაზება აირჩიეს 🎉' },
      { part: 'heading', label: HEAD, default: 'შენი შეთავაზება აირჩიეს' },
      { part: 'body2', label: BODY2, multiline: true, default: 'კლიენტის კონტაქტი უკვე შენს გვერდზეა. დაუკავშირდი მალე — ის ამას ელოდება.' },
      { part: 'cta', label: CTA, default: 'კონტაქტის ნახვა' },
    ],
  },
  {
    key: 'thread.message', label: 'ახალი წერილი მიმოწერაში',
    texts: [
      { part: 'subjectStaff', label: 'სათაური — ჩვენს ინბოქსში', vars: ['ref'], default: '[მცოდნე] შეტყობინება მოთხოვნაზე {ref}' },
      { part: 'subject', label: SUBJ, vars: ['ref'], default: 'პასუხი — {ref}' },
      { part: 'headingStaff', label: 'შიგნით სათაური — ჩვენს ინბოქსში', default: 'კლიენტი წერს' },
      { part: 'heading', label: HEAD, default: 'გიპასუხეთ' },
      { part: 'bodyStaff', label: 'ტექსტი — ჩვენს ინბოქსში', multiline: true, vars: ['ref'], default: 'მოთხოვნა {ref} — კლიენტმა მიმოწერაში დაწერა.' },
      { part: 'body1', label: BODY, multiline: true, default: 'შენს მოთხოვნაზე გიპასუხეთ.' },
      { part: 'cta', label: CTA, default: 'პასუხის გაცემა' },
    ],
  },
  {
    key: 'chat.message', label: 'ახალი წერილი მიმოწერაში',
    texts: [
      { part: 'subjectProvider', label: 'სათაური — პროვაიდერს', vars: ['topic'], default: 'ახალი შეტყობინება — {topic}' },
      { part: 'subject', label: SUBJ, vars: ['ref'], default: 'ახალი შეტყობინება — {ref}' },
      { part: 'bodyProvider', label: 'ტექსტი — პროვაიდერს', multiline: true, default: 'კლიენტმა მოგწერა შენს შეთავაზებაზე.' },
      { part: 'body1', label: BODY, multiline: true, default: 'ექსპერტმა გიპასუხა.' },
      { part: 'heading', label: HEAD, default: 'ახალი შეტყობინება' },
      { part: 'cta', label: CTA, default: 'პასუხის გაცემა' },
    ],
  },
  {
    key: 'request.done.client', label: 'სამუშაო დასრულდა',
    texts: [
      { part: 'rowRequest', label: ROW('მოთხოვნა'), default: 'მოთხოვნა' },
      { part: 'subject', label: SUBJ, vars: ['ref'], default: 'სამუშაო დასრულდა — {ref}' },
      { part: 'heading', label: HEAD, default: 'სამუშაო დასრულდა' },
      { part: 'body1', label: BODY, multiline: true, default: 'ექსპერტმა მონიშნა, რომ სამუშაო დასრულდა. შეაფასე შენს გვერდზე.' },
      { part: 'cta', label: CTA, default: 'შეფასება' },
    ],
  },
  {
    key: 'request.done.provider', label: 'სამუშაო დასრულებულად აღინიშნა',
    texts: [
      { part: 'body1', label: BODY, multiline: true, vars: ['topic'], default: 'კლიენტმა მონიშნა, რომ სამუშაო დასრულდა — <b>{topic}</b>.' },
      { part: 'subject', label: SUBJ, default: 'კლიენტმა სამუშაო დასრულებულად მონიშნა' },
      { part: 'heading', label: HEAD, default: 'სამუშაო დასრულდა' },
      { part: 'cta', label: CTA, default: 'ჩემი შეთავაზებები' },
    ],
  },
  {
    key: 'request.doneReminder.client', label: 'დაადასტურე დასრულება',
    texts: [
      { part: 'rowRequest', label: ROW('მოთხოვნა'), default: 'მოთხოვნა' },
      { part: 'subject', label: SUBJ, vars: ['ref'], default: 'დასრულდა სამუშაო? — {ref}' },
      { part: 'heading', label: HEAD, default: 'დასრულდა სამუშაო?' },
      { part: 'body1', label: BODY, multiline: true, default: 'თუ სამუშაო დასრულდა, მონიშნე შენს გვერდზე და შეაფასე.' },
      { part: 'cta', label: CTA, default: 'გახსნა' },
    ],
  },
]

/** `msg.<outboundKey>.<part>` — the SiteText key. Permanent, like every key in
 *  that registry: a production row may hold copy typed under it. */
export const messageTextKey = (outboundKey: string, part: string) => `msg.${outboundKey}.${part}`

/** Every default, flat. The fallback whenever no row exists. */
export const MESSAGE_TEXT_DEFAULTS: Record<string, string> = Object.fromEntries(
  MESSAGE_TEXTS.flatMap(g => g.texts.map(t => [messageTextKey(g.key, t.part), t.default])),
)

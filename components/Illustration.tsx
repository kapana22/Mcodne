import Image from 'next/image'

// THE illustration system. One component, one registry — every rule from the
// brief lives here so a call site can only ever pass a name and a caption.
//
// WHAT THESE ARE FOR (and the boundary that keeps them useful):
//   · empty states · success confirmations · short explanatory blocks
// and nowhere else. No hero art, no decorative filler, and never INSIDE a
// button, dropdown, filter or clickable card — an image inside a control reads
// as part of the control, and the user stops knowing what they are clicking.
//
// The art is transparent PNG. It therefore gets NO background, NO shadow and NO
// frame: the moment you put a tinted plate behind a transparent illustration it
// stops being art on the page and becomes a sticker on a box. Air around it is
// the whole treatment — the callers give it margin, nothing else.
//
// `object-contain` is not optional: these are 1:1 drawings and any crop cuts the
// subject. Next/Image serves a correctly-sized webp from the 512px master, so
// the 50KB PNG is never what a phone downloads.

/**
 * The registry. Semantic name → file, so a call site never types a path and a
 * re-export or rename happens in one place.
 *
 * ⚠️ `null` = the art does not exist yet. The component then renders NOTHING
 * rather than a broken image, and the surrounding empty state (which always has
 * a heading and a next step of its own) still reads correctly. Drop the PNG
 * into public/illustrations and swap the null for its filename — that one edit
 * lights up every call site using that name.
 */
const ART: Record<string, string | null> = {
  // ── For LIGHT grounds (white / ink-50 / ink-75) ────────────────────────────
  // ⚠️ THE 2026-09-03 SET IS NAMED AFTER THE SCREEN IT DRAWS, not „compact-".
  // The owner shipped it with a written standard — MCDONE_3D_ICON_STYLE_GUIDE
  // — that names the surface for each icon, so the file name says the same
  // thing the guide does and a missing one is findable by grep. The three
  // `compact-*` files below are what is left of the older set; they are still
  // in service and still correct, and nothing here renames a file that works.
  expertSearch:      'experts-empty-search-512.png',
  categoryComingSoon: null, // NOT SUPPLIED — the coming-soon profession page
  // ⚠️ THE NAME IS LEGACY AND THE USE IS LIVE. „bookings" was the retired
  // product's word; the drawing it points at is the empty state of
  // /work/jobs — „ხელში მაქვს" — which is a provider's accepted work and not a
  // booking. Renaming the key is a rename of the only call site plus this
  // line; it has not been done because the file name would still be the old
  // word and a half-rename reads worse than a legacy one.
  bookings:          'compact-bookings-512.png',
  bookingsOnDark:      null, // compact-bookings-ondark-512.png
  // ⚠️ `videoSession` AND `askExpert` WERE HERE (removed 2026-08-29). No call
  // site named either, and none could: the video room went with the
  // consultation product on 2026-08-24 and /ask has been a 308 to the
  // catalogue since 2026-08-19. Their two PNGs — 112KB — were uploaded on
  // every deploy to draw screens that cannot be reached. `videoSessionOnDark`
  // went with them.
  messages:          'messages-empty-inbox-512.png',
  favourites:        'favorites-empty-state-512.png',
  registration:      'compact-registration-512.png',
  // ⚠️ `expertApplication` WAS HERE (removed 2026-08-30): no call site named it
  // and none could — the application screen it drew had become `/join`, which
  // carried no illustration. Its 36KB PNG was uploaded on every deploy to draw
  // nothing. /join HAS one again since 2026-09-03 (`joinProvider`, below), and
  // that is not an argument for keeping dead art around: the new key was wired
  // to a call site in the same commit that named it.
  support:           'help-support-512.png',
  contactSent:       'compact-contact-sent-512.png',

  // ── The 2026-09-03 additions: four surfaces that had an icon medallion ─────
  // Each is the icon the owner's style guide assigns to that screen, and each
  // replaces a 24px glyph in a tinted disc — not a blank space. `EmptyState`
  // swaps one for the other on its own (`hasIllustration`), so the wiring is a
  // single prop at the call site.
  requestSent:       'request-success-confirmation-512.png',   // app/request/_thanks
  joinProvider:      'join-provider-registration-512.png',     // app/join/_door/PublicDoor
  workRequests:      'work-requests-empty-state-512.png',      // /work/requests, empty queue
  workOffers:        'work-offers-empty-state-512.png',        // /work/offers, nothing sent

  // ── For the DARK ground (`#how` on the home page, bg-ink-900 #0F0E0A) ──────
  // SEPARATE FILES, not replacements. The three light-ground drawings above are
  // already in use on white surfaces, so recolouring them in place would break
  // those; a drawing's stroke has to match the ground it sits on, which means
  // one file per ground. Only the home „how it works" row needs the dark set.
  //
  // Measured on #0F0E0A (a graphic needs ≥3:1): brand-300 #7FC7B4 = 9.87,
  // brand-200 #ADDBCF = 12.7, white = 19.3. Even brand-500 passes at 5.72, but
  // the CURRENT art reads as a smudge there — it was verified by screenshot —
  // so aim for the lighter end of that range.
  expertSearchOnDark:  null, // compact-expert-search-ondark-512.png

  // ── The home page's four-step row, ON THE HERO CARD (2026-08-31) ──────────
  // ⚠️ THE ART WAS REPLACED ON 2026-09-03 AND THE FRAMING IS THE WHOLE STORY.
  // What shipped first was ONE 1998×689 strip — laptop → phone → cards →
  // handshake, with dotted arrows drawn between them — cut into four through a
  // single crop window. The owner then sent the same four subjects as separate
  // high-resolution renders, which is the newer decision, and sent a second,
  // cleaner set an hour later („ეს ფოტოები უკეთესია ჩანაცვლე"). These are that
  // second set, untouched apart from scale.
  //
  // Each drawing is FITTED INTO THE BOX ITS PREDECESSOR OCCUPIED on the 512
  // canvas, centred on that box's centre — describe 447×326, offers 318×354,
  // compare 380×301, start 420×246. That is why the row's rhythm, the negative
  // margins in app/_home/how.tsx and the owner's ruling that the whole card
  // must end on one screen all survived an art swap with nothing re-tuned.
  // FITTED, not stretched: each keeps its own aspect, so a drawing can end
  // narrower than the box it was given (the laptop lands 373 wide inside a 447
  // box, the handshake fills its 420 exactly), and the transparent air the
  // negative margins pull back is still in the file.
  //
  // ⚠️ CHECK THE ALPHA OF ANYTHING THAT ARRIVES NEXT. One render in the first
  // set came with NO alpha channel at all — a chequerboard baked into the
  // pixels where transparency should have been, which on the green card draws
  // a grey chequered square rather than nothing. It was keyed out and then
  // superseded, so no shipped file carries it; the hazard is invisible in a
  // preview and obvious on the page.
  //
  // The arrows remain CSS in app/_home/how.tsx, so they still disappear when
  // the row stacks.
  flowDescribe:      'flow-describe-512.png',
  flowOffers:        'flow-offers-512.png',
  flowCompare:       'flow-compare-512.png',
  flowStart:         'flow-start-512.png',
}

export type IllustrationName =
  | 'expertSearch' | 'categoryComingSoon' | 'bookings'
  | 'messages' | 'favourites' | 'registration' | 'support'
  | 'contactSent'
  | 'requestSent' | 'joinProvider' | 'workRequests' | 'workOffers'
  | 'expertSearchOnDark' | 'bookingsOnDark'
  | 'flowDescribe' | 'flowOffers' | 'flowCompare' | 'flowStart'

/**
 * Is the art for this name actually shipped?
 *
 * Call sites use it to keep their EXISTING treatment (an icon medallion, a
 * three-up row) intact while a drawing is missing, instead of degrading to a
 * blank space. Wiring a name before its PNG exists is therefore safe and
 * self-completing: drop the file in, and the call site switches over with no
 * further edit.
 */
export function hasIllustration(name: IllustrationName): boolean {
  return ART[name] !== null
}

/**
 * Four display sizes, all inside the brief's band (128–160 mobile / 160–220
 * desktop). Width only — the art is square, so height follows and nothing can
 * distort.
 *
 *   step    120 → 150   a three-up explanatory row on a light plate
 *   flow    112 → 216   the home hero card's four-step row (see below)
 *   state   128 → 200   the default: empty states and success screens
 *   support 140 → 180   the help page's „didn't find an answer?" block
 */
const SIZE = {
  step:    'w-[120px] sm:w-[136px] lg:w-[150px]',
  // The hero card's four-step row, and the widest tier here: the art is on a
  // 512 canvas whose subject fills only ~70% of it (see the flow* entries
  // above), so 216px of box draws ~150px of drawing — the box is not the
  // picture.
  //
  // ⚠️ 128 / 192 / 216 SINCE 2026-09-03, UP FROM 108 / 168 / 184, and it is the
  // owner's call on the new art: „ოდნავ გაზარდე თითქოს პატარა". The drawings
  // that replaced the strip fill a little less of their canvas than it did, so
  // the row read smaller the day it shipped without a single number changing.
  // This bump answers that and puts the tier inside the brief's 160–220 desktop
  // band for the first time.
  //
  // ⚠️ THE CEILING IS THE OWNER'S 2026-08-31 RULE, NOT THE BAND: „დიდი გამოვიდა
  // ისე შეამცირე … რომ დაეტიოს სრულიად და არ მოიჭრას" — the whole green card
  // has to end on a laptop screen. Measured at 1280×800 with Playwright on
  // 2026-09-03: the card ends at 767px of 800. That is 33px of headroom and it
  // is what caps this tier — anything that grows the row (a bigger box, a
  // fifth step, a taller heading) has to be measured there again.
  //
  // The ~30% of transparent canvas is also why the call site pulls this back
  // with negative margins: the file already carries the air. And the base tier
  // is a COLUMN measurement, not a phone-sized guess — the four steps are two
  // up on a phone (app/_home/how), so the box lives in a 139px column at
  // 390px, where 128 leaves the drawing itself ~92–107px wide and clear of the
  // sentence beside it.
  flow:    'w-[112px] sm:w-[192px] lg:w-[216px]',
  state:   'w-[128px] sm:w-[168px] lg:w-[200px]',
  support: 'w-[140px] sm:w-[160px] lg:w-[180px]',
} as const

/** `sizes` must mirror SIZE or Next ships a needlessly large webp. */
const SIZES_ATTR: Record<keyof typeof SIZE, string> = {
  step:    '(min-width: 1024px) 150px, (min-width: 640px) 136px, 120px',
  flow:    '(min-width: 1024px) 216px, (min-width: 640px) 192px, 112px',
  state:   '(min-width: 1024px) 200px, (min-width: 640px) 168px, 128px',
  support: '(min-width: 1024px) 180px, (min-width: 640px) 160px, 140px',
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* BANDS — a different animal, deliberately not a fourth SIZE tier             */
/* ═══════════════════════════════════════════════════════════════════════════ */

/* ⚠️ `IllustrationBand`, `BAND_ART` AND THE 84KB BAND ITSELF WERE HERE AND WENT
   (2026-08-29). The drawing was „questions and half-written notes resolving
   into a booked video consultation", sat above the home page's „როგორ მუშაობს",
   and its subject is a product this site removed on 2026-08-24. It had already
   lost its call site earlier than that — app/_home/cta.tsx says so in its own
   words („nothing on the home page renders it") — when the owner's design
   canvas replaced the home page on 2026-08-21.

   So what stood here was ~70 lines of component and 84KB of webp uploaded on
   every deploy, drawing a booking flow, reachable from nothing.

   ⚠️ IF A BAND EVER RETURNS, THE ONE FACT WORTH KEEPING IS THE PAPER RULE: a
   band's ground and its host section's background must be the SAME colour, or
   the art's left edge draws a vertical line down the page. The deleted file had
   been colour-shifted at export (`sharp().linear([1,1,1],[-4,-4,-2])`) so its
   paper measured 248/246/242 — `ink-75` exactly. A mask feathers a seam; it
   cannot hide a mismatched tone across 700px of paper. */


export function Illustration({
  name,
  alt,
  size = 'state',
  className = '',
  priority = false,
}: {
  name: IllustrationName
  /**
   * Describes the DRAWING, not the screen it sits on — the heading beside it
   * already says that, and a screen reader hearing both reads it twice.
   * Pass "" only when the neighbouring text makes the image genuinely
   * decorative; the img is then marked aria-hidden.
   */
  alt: string
  size?: keyof typeof SIZE
  className?: string
  priority?: boolean
}) {
  const file = ART[name]
  if (!file) return null

  return (
    <Image
      src={`/illustrations/${file}`}
      alt={alt}
      width={512}
      height={512}
      sizes={SIZES_ATTR[size]}
      priority={priority}
      aria-hidden={alt === '' || undefined}
      className={`${SIZE[size]} h-auto max-w-full object-contain select-none pointer-events-none ${className}`}
    />
  )
}

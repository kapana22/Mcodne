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
  expertSearch:      null, // compact-expert-search-512.png — NOT SUPPLIED
  categoryComingSoon: null, // compact-category-coming-soon-512.png — NOT SUPPLIED
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
  messages:          'compact-messages-512.png',
  favourites:        'compact-favourites-512.png',
  registration:      'compact-registration-512.png',
  // ⚠️ `expertApplication` WAS HERE (removed 2026-08-30), for the same reason
  // `videoSession` and `askExpert` went above it: no call site named it and
  // none could — the application screen it drew became `/join`, which uses no
  // illustration. Its 36KB PNG was uploaded on every deploy to draw nothing.
  support:           'compact-support-512.png',
  contactSent:       'compact-contact-sent-512.png',

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
}

export type IllustrationName =
  | 'expertSearch' | 'categoryComingSoon' | 'bookings'
  | 'messages' | 'favourites' | 'registration' | 'support'
  | 'contactSent'
  | 'expertSearchOnDark' | 'bookingsOnDark'

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
 * Three display sizes, all inside the brief's band (128–160 mobile / 160–220
 * desktop). Width only — the art is square, so height follows and nothing can
 * distort.
 *
 *   step    120 → 150   the „how it works" row, where three sit side by side
 *   state   128 → 200   the default: empty states and success screens
 *   support 140 → 180   the help page's „didn't find an answer?" block
 */
const SIZE = {
  step:    'w-[120px] sm:w-[136px] lg:w-[150px]',
  state:   'w-[128px] sm:w-[168px] lg:w-[200px]',
  support: 'w-[140px] sm:w-[160px] lg:w-[180px]',
} as const

/** `sizes` must mirror SIZE or Next ships a needlessly large webp. */
const SIZES_ATTR: Record<keyof typeof SIZE, string> = {
  step:    '(min-width: 1024px) 150px, (min-width: 640px) 136px, 120px',
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

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
  bookings:          'compact-bookings-512.png',
  videoSession:      'compact-video-session-512.png',
  askExpert:         'compact-ask-expert-512.png',
  messages:          'compact-messages-512.png',
  favourites:        'compact-favourites-512.png',
  registration:      'compact-registration-512.png',
  expertApplication: 'compact-expert-application-512.png',
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
  bookingsOnDark:      null, // compact-bookings-ondark-512.png
  videoSessionOnDark:  null, // compact-video-session-ondark-512.png
}

export type IllustrationName =
  | 'expertSearch' | 'categoryComingSoon' | 'bookings' | 'videoSession' | 'askExpert'
  | 'messages' | 'favourites' | 'registration' | 'expertApplication' | 'support'
  | 'contactSent'
  | 'expertSearchOnDark' | 'bookingsOnDark' | 'videoSessionOnDark'

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

/**
 * A BAND is a wide (~2.3:1) drawing that spans the viewport and acts as the
 * transition between two sections. Everything the square system asserts is
 * wrong here, which is why it gets its own registry and its own component
 * rather than another entry in SIZE:
 *
 *   · not square, so „width only, height follows" cannot hold it
 *   · not transparent — the art carries its own painted paper ground, so unlike
 *     the compact PNGs it cannot ignore what is behind it (see PAPER below)
 *   · far outside the 128–220px band the brief set for the compact art
 *
 * The rules that DO carry over: no frame, no shadow, no crop, decorative only.
 *
 * ⚠️ PAPER: a band's ground and its host section's background must be the SAME
 * colour, or the art's left edge draws a vertical line down the page. The
 * shipped file was colour-shifted at export (`sharp().linear([1,1,1],[-4,-4,-2])`
 * on the original) so its paper measures 248/246/242 — `ink-75` exactly. A new
 * band, or a re-export of this one, has to repeat that step against whatever
 * background its call site uses; the mask below only feathers the seam, it
 * cannot hide a mismatched tone across 700px of paper.
 *
 * Intrinsic size travels with the file — a band's aspect is the one number the
 * layout depends on, and reading it off the registry beats retyping it at a
 * call site that has no way to check.
 */
const BAND_ART = {
  /** Left→right: questions and half-written notes resolving into a booked
   *  video consultation. Sits directly above the home page's „როგორ მუშაობს". */
  consultationJourney: { file: 'band-consultation-journey-1915.webp', w: 1915, h: 821 },
} as const

export type IllustrationBandName = keyof typeof BAND_ART

/**
 * Height is fixed and the art is RIGHT-ALIGNED at its natural aspect — never
 * `object-cover`. A 2.3:1 drawing inside a 4.8:1 full-bleed box would lose half
 * its vertical extent to the crop (the speech bubble at the top, the desk at the
 * bottom), and those are the two ends of the picture's story.
 *
 * Right-aligned because the drawing's own left third is empty paper: on a wide
 * screen the section's background simply continues that emptiness leftward, so
 * the band reads as one uninterrupted sheet rather than a placed image. The mask
 * feathers the art's left edge into the host background, so the small tonal step
 * between the paper and `bg-ink-75` can never draw a vertical line down the
 * band. Below ~640px the art is wider than the viewport and the overflow clips
 * off that same empty left edge — nothing of the subject is ever lost.
 */
export function IllustrationBand({
  name,
  className = '',
}: {
  name: IllustrationBandName
  className?: string
}) {
  const art = BAND_ART[name]

  return (
    <div className={`relative flex justify-end overflow-hidden h-[168px] sm:h-[240px] lg:h-[300px] 2xl:h-[360px] ${className}`}>
      <Image
        src={`/illustrations/${art.file}`}
        alt=""
        aria-hidden
        width={art.w}
        height={art.h}
        /* Mirrors the four heights above × the 2.33 aspect. */
        sizes="(min-width: 1536px) 840px, (min-width: 1024px) 700px, (min-width: 640px) 560px, 400px"
        className="h-full w-auto max-w-none select-none pointer-events-none [mask-image:linear-gradient(to_right,transparent,#000_8%)] [-webkit-mask-image:linear-gradient(to_right,transparent,#000_8%)]"
      />
    </div>
  )
}

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

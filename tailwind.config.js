/** @type {import('tailwindcss').Config} */

/* ─────────────────────────────────────────────────────────────────────────────
 * NAMED CONSTANTS (2026-08-01) — the single sources for every value that used
 * to repeat as a copy-pasted literal inside this config. This file is plain
 * Node, so these are free at build time; change ONE line here and every token
 * built from it follows. Never import these into app code — app code speaks
 * only in class names (`bg-brand-600`, `duration-fast`, `shadow-card`).
 * ───────────────────────────────────────────────────────────────────────────*/

// ── The two curves + three durations of the motion scale ────────────────────
// MIRRORED in globals.css as --ease-out / --ease-entrance and --dur-fast/mid/
// slow. If you touch one side, touch the other — the CSS layer and the utility
// layer must not drift (that drift is the defect the scale was built to kill).
const EASE_OUT_QUART = 'cubic-bezier(0.25, 1, 0.5, 1)' // THE default — settles to rest
const EASE_OUT_EXPO  = 'cubic-bezier(0.16, 1, 0.3, 1)' // entrances ONLY
const EASE_EXIT      = 'cubic-bezier(0.5, 0, 0.75, 0)' // exits accelerate away (ease-IN)
const DUR_FAST = '140ms'
const DUR_MID  = '220ms'
const DUR_SLOW = '360ms'

// ── Shadow tint RGBs ────────────────────────────────────────────────────────
// Every elevation shadow on the site is tinted with ink-700's RGB (46/42/33)
// so depth reads warm, never blue-grey; glows use brand-500's RGB. One knob
// each — a palette shift retints every shadow at once.
const SHADOW_RGB = '46, 42, 33'   // = ink-700 #2E2A21
const BRAND_RGB  = '47, 156, 134' // = brand-500 #2F9C86

// ── The brand ramp — ONE definition, three tokens ───────────────────────────
// `brand`, `success` and the legacy `flame` alias are DELIBERATELY the same
// scale (canon: every positive/trust signal reads as one green). Before this
// const they were three hand-synced copies of eleven hexes.
const BRAND_SCALE = {
  50:  '#ECF7F3',
  100: '#D3ECE4',
  200: '#ADDBCF',
  300: '#7FC7B4',
  400: '#52B29E',
  500: '#2F9C86', // the wordmark green
  600: '#26806E', // white text passes AA on this (4.78:1) — CTA fills start here
  700: '#1E6656',
  800: '#184F43',
  900: '#123A31',
  950: '#0A2420',
}

// ── The neutral (ink) ramp — ONE definition, reused by the `accent` alias ───
const INK_SCALE = {
  // ⚠️ THE GROUND IS CREAM AGAIN (2026-08-31), from the owner's design canvas
  // („mcodne.ge პროფილის რედიზაინი" → Home). It was #FFFFFF, and globals.css
  // still carried the note „cream removed per product decision" from the
  // reversal before that. The canvas is the newer decision, so both sides moved
  // together — this token AND the `html, body` rule, which is what actually
  // paints the page.
  //
  // ⚠️ ink-50 IS THE GROUND, `bg-white` IS A CARD. That distinction did not
  // matter while the two were the same colour and now it is the whole system:
  // every white surface on the site (a card, a sheet, the search pill) reads as
  // something LIFTED off the paper. 17 page-root elements that said `bg-white`
  // were saying „the ground" and now say `bg-ink-50`.
  50:  '#FBF9F5', // page background — warm paper
  75:  '#F8F6F2', // very light warm-neutral (elevated card interior)
  100: '#EFECE5', // hairline / subtle divider
  200: '#DFD8CB', // border
  300: '#C6BCA9', // strong border, faded text
  // WCAG. #9C9488 measured 3.00:1 on white — it FAILS the 4.5:1 body-text
  // requirement, and it is the token behind every timestamp, counter,
  // helper line and „N / 500" on the site (198 call sites; 193 failing
  // text nodes across 17 pages). #7A7265 is 4.75:1 and still sits
  // clearly lighter than ink-500 (5.60:1), so the muted → secondary →
  // body hierarchy is unchanged. Non-text uses (icons, borders) only
  // ever needed 3:1 and are unaffected by going darker.
  400: '#7A7265', // muted text — 4.75:1 on white
  500: '#6E6759', // secondary text
  600: '#4A4437', // body text
  700: '#2E2A21', // headings — the "dark black"
  800: '#1D1B15', // deeper
  900: '#0F0E0A', // deepest — hero backgrounds
  950: '#050503',
}

module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    // ── MOTION: LOCKED, not extended ────────────────────────────────────
    //  These two keys sit OUTSIDE `theme.extend` on purpose, which REPLACES
    //  Tailwind's stock ramps instead of adding to them. The type ramp could
    //  safely `extend` (a stray `text-xs` is legible, just off-ramp); motion
    //  could not — the whole defect being fixed here is that `duration-300`,
    //  `duration-200`, `duration-150` and a bare `ease-out` drifted in beside
    //  the tokens and nothing stopped them. With the scale locked, those class
    //  names no longer exist: the utility is not emitted and the element falls
    //  back to DEFAULT (140ms / out-quart) — the system's answer, not an
    //  undocumented one. `transitionDelay` is deliberately left alone: a delay
    //  is a choreography offset, not a speed, and the stagger steps legitimately
    //  need arbitrary values.
    // ── THE MOTION SCALE (established 2026-07-29) ────────────────────────
    //  THREE durations, ONE default curve. Derived from what the codebase
    //  actually did: 443 `transition-*` utilities silently inherited
    //  Tailwind's 150ms default, 57 used fast/mid/slow, and 11 had drifted
    //  to ad-hoc 300/200/150 — two parallel systems plus a leak.
    //
    //  Each token names a JOB, not a number. Pick by what the motion is FOR:
    //    fast (140ms) — INSTANT FEEDBACK. The user did something and the UI
    //        acknowledges it inside one frame-batch: hover colour, border
    //        warm-up, focus ring, press, icon swap, opacity toggles. This is
    //        the default tier and where ~95% of transitions belong; it is
    //        also `DEFAULT` below, so a bare `transition-*` can no longer
    //        fall into an undocumented 150ms.
    //    mid  (220ms) — VISIBLE STATE CHANGE. Something actually moves or
    //        resizes and the user is meant to watch it get there: transform
    //        reveals, shadow/elevation ramps, progress width, accordion.
    //    slow (360ms) — DELIBERATE ENTRANCE. Content arriving or a surface
    //        committing: scroll reveals, drawers, full-surface swaps. Long
    //        enough to read as an event, short enough not to be waited on.
    //  Nothing between, nothing above. No fourth tier: a duration the user
    //  has to wait through is a bug, not a flourish.
    transitionDuration: {
      DEFAULT: DUR_FAST, // safety net == fast. NOT a licence to omit the token.
      fast: DUR_FAST,
      mid:  DUR_MID,
      slow: DUR_SLOW,
    },
    //  ONE default curve: `out-quart`. Everything that settles TO REST — every
    //  `transition-*` at fast/mid — uses it, so state changes across the whole
    //  product decelerate identically.
    //  ONE documented alternative: `out-expo`, reserved for ENTRANCES — the
    //  `animate-*` keyframes below and the scroll `.reveal`. An entrance starts
    //  from a state the user has never seen, so expo's harder front-load makes
    //  it legible in the first third and the tail is a settle, not a wait; a
    //  transition starts from a state the user is already looking at, where the
    //  same front-load reads as a snap. There is no third curve — the checkbox
    //  tick's overshoot (0.34, 1.56, …) was removed 2026-07-29 (canon: never
    //  bouncy), as was `in-out-quart` (zero usages, and an ease-IN start is
    //  wrong for anything the user triggered).
    //  DEFAULT is set to out-quart on purpose: Tailwind's stock default is
    //  `cubic-bezier(0.4, 0, 0.2, 1)` — an ease-IN-out, i.e. a curve that
    //  starts slowly. Every bare `transition-*` in the codebase was quietly
    //  using it, so "one curve" could never be true from the call sites
    //  alone. Overriding DEFAULT makes the rule true by construction; the
    //  explicit `ease-out-quart` at a call site is then a restatement, never
    //  a correction.
    transitionTimingFunction: {
      DEFAULT: EASE_OUT_QUART,
      'out-quart': EASE_OUT_QUART,
      'out-expo':  EASE_OUT_EXPO,
    },


    extend: {
      colors: {
        // ─────────────────────────────────────────────────────────────────────
        //   THE 3-COLOR PALETTE
        //   Nothing else is decorative. Semantic (success/warning/danger) is
        //   used ONLY at the point of meaning (an error, a warning) — never
        //   as visual accents.
        // ─────────────────────────────────────────────────────────────────────

        // ── Brand · teal-green (PRIMARY, #2F9C86) ───────────────────────────
        // The primary color. Used with restraint (premium): CTAs, key accents,
        // brand moments — not everywhere. Blue (`info`) is the secondary accent.
        // Defined ONCE in BRAND_SCALE (top of file) — `success` and `flame`
        // reuse the same object so the three can never drift apart again.
        brand: BRAND_SCALE,

        // ── Ink · neutral ramp (WHITE canvas → near-black) ──────────────────
        // ink-50 is the WHITE canvas (cream removed per design decision).
        // ink-700+ is DARK for text. Intermediate shades stay slightly warm-
        // tinted so borders/hairlines don't feel cold.
        // Defined ONCE in INK_SCALE (top of file — the per-step comments,
        // including the WCAG ink-400 story, live there).
        ink: INK_SCALE,

        // ── Accent · aliased to ink for backwards compatibility. Legacy
        //     `bg-accent-900` etc. now maps to the same deep near-black used
        //     in hero surfaces. Do NOT reach for accent in new code.
        // Built FROM INK_SCALE (accent-50 = ink-75, then 1:1) so it can never
        // drift from ink — before this it was a hand-synced copy.
        accent: {
          50:  INK_SCALE[75],
          100: INK_SCALE[100],
          200: INK_SCALE[200],
          300: INK_SCALE[300],
          400: INK_SCALE[400],
          500: INK_SCALE[500],
          600: INK_SCALE[600],
          700: INK_SCALE[700],
          800: INK_SCALE[800],
          900: INK_SCALE[900],
          950: INK_SCALE[950],
        },

        // ── Semantic states — MUTED, meaning-only. Never decorative. ────────
        // Success = the same brand green (#2F9C86) so every positive/trust
        // signal — verified, live, escrow, success states — reads as ONE
        // consistent green rather than two competing tones.
        success: BRAND_SCALE,
        warning: {
          50: '#FBF6EC', 100: '#F4E7C8', 200: '#E9CE8E', 300: '#D9B055',
          400: '#C5972F', 500: '#A87F1E', 600: '#866314', 700: '#684D10',
          800: '#4E390C', 900: '#352708', 950: '#1F1604',
        },
        danger: {
          50: '#F9EDEE', 100: '#F2D2D5', 200: '#E4A4AA', 300: '#D17078',
          400: '#B94850', 500: '#9B2932', 600: '#7D1F27', 700: '#621820',
          800: '#4A121A', 900: '#330C12', 950: '#1E060A',
        },

        // ── Legacy aliases — kept so old classes still resolve, but they
        //     all resolve to ink so nothing decorates with an off-palette hue.
        // Blue — the SECONDARY accent (informational, secondary actions, some
        // badges). Reach for `info-*` when you want blue, not brand.
        info:  { 50: '#EEF4FF', 100: '#DAE6FF', 200: '#BDD2FF', 300: '#90B4FF', 400: '#5B8DFB', 500: '#2563EB', 600: '#1D4FD8', 700: '#1B43B5', 800: '#1B3A8F', 900: '#1C3472', 950: '#131F45' },
        iris:  { 50: '#EEE9E0', 100: '#DFD8CB', 200: '#C6BCA9', 300: '#9C9488', 400: '#6E6759', 500: '#4A4437', 600: '#2E2A21', 700: '#1D1B15', 800: '#0F0E0A', 900: '#050503', 950: '#050503' },
        flame: BRAND_SCALE,
      },

      // ── THE STACKING ORDER ────────────────────────────────────────────────
      // Established 2026-08-06. Until then z-index was the ONLY axis of the
      // design system with no token: 14 distinct arbitrary values (`z-[45]`,
      // `z-[46]`, `z-[55]`, `z-[65]`, `z-[69]`, `z-[95]`, …) with the ordering
      // rationale living only in prose comments spread across six components,
      // each explaining itself in terms of its neighbours. Nothing held the
      // whole order, so answering "what does this sit above?" meant reading six
      // files — and a stacking bug is among the hardest defects to see.
      //
      // These are ADDITIVE: Tailwind's stock `z-0…z-50` still resolve, and
      // ordinary in-flow elevation (a badge over a photo, a gradient over an
      // image) should keep using `z-10` / `z-20` — it is not part of this
      // conversation. Reach for a name only when the element takes part in the
      // OVERLAY stack below.
      //
      // Read top to bottom = front to back. Numbers are kept as they shipped so
      // this is a pure rename, not a re-layering.
      zIndex: {
        // The one thing that must never be covered: a keyboard user's first
        // control on the page.
        'skip':      '100',
        // Feedback about an action outlives the surface that triggered it —
        // a toast fired from inside a modal must not be trapped behind it.
        'toast':      '95',
        // Destructive-confirm. Above Sheet on purpose: a Sheet can raise one.
        'confirm':    '90',
        // Bottom sheets / page modals.
        'sheet':      '80',
        // The mobile nav drawer, and the public header while it is open (the
        // header owns the drawer's stacking context, so they move together).
        'drawer':     '70',
        // The drawer's own scrim — one below the drawer, above everything else.
        'drawer-scrim': '69',
        // Sticky in-page affordances that must clear the cookie banner.
        'overlay':    '65',
        // „You are impersonating" — must stay reachable to be exitable.
        'impersonate': '60',
        // The expert profile's section-nav pill.
        'pill':       '55',
        // Cookie consent: above page chrome, below every full-screen overlay.
        // It was briefly 60 and painted over the profile pill — see
        // components/CookieConsent.tsx.
        'consent':    '50',
        // The two floating round buttons, bottom-right. Help sits one above
        // BackToTop so they never trade places when both are visible.
        'help':       '46',
        'to-top':     '45',
        // Sticky headers, workspace top bars, BottomNav. The floor of the
        // overlay conversation: everything above is temporary, this is not.
        'chrome':     '40',
      },

      // ── RADIUS — RE-CUT 2026-08-31 from the owner's design canvas ─────────
      //  („mcodne.ge პროფილის რედიზაინი"). Every surface in that canvas is
      //  rounder than what shipped, and consistently so: 14px controls, 24px
      //  cards, 28px panels, 36px full-width bands. Changing the four tokens
      //  moves ~900 call sites at once, which is the whole reason they are
      //  tokens — the alternative was a redesign that only reached the screens
      //  somebody remembered to touch.
      //
      //  ⚠️ `btn` GOES BACK TO 14px, WHICH REVERSES A 2026-07-19 DECISION
      //  („crisper, to echo the logo's geometric character"). The canvas is the
      //  newer call and it is not a small one: at 10px against a 24px card the
      //  button read as a different material from the thing it sat on.
      borderRadius: {
        field: '14px',
        btn:   '14px',
        card:  '24px',
        // A SECTION PLATE — the white „როგორ მუშაობს" sheet, the profile's
        // panels. Bigger than a card because it holds cards.
        panel: '28px',
        // A FULL-WIDTH BAND — the hero, the closing supply band. The largest
        // radius on the site and the only one above `panel`; anything rounder
        // stops reading as a rectangle.
        band:  '36px',
        // A THUMBNAIL inside a panel — work photos, tile plates.
        tile:  '18px',
        pill:  '9999px',
      },

      // ── Shadows — warm-tinted (SHADOW_RGB = ink-700), soft, never shouty. ──
      //  The elevation LADDER, lowest to highest: xs → sm → card → pop →
      //  card-hover → float. Pick a rung, never an arbitrary shadow-[…].
      boxShadow: {
        xs:           `0 1px 2px rgba(${SHADOW_RGB}, 0.04)`,
        sm:           `0 1px 3px rgba(${SHADOW_RGB}, 0.05), 0 1px 2px rgba(${SHADOW_RGB}, 0.03)`,
        card:         `0 2px 6px rgba(${SHADOW_RGB}, 0.05), 0 1px 2px rgba(${SHADOW_RGB}, 0.04)`,
        'card-hover': `0 10px 24px rgba(${SHADOW_RGB}, 0.08), 0 3px 6px rgba(${SHADOW_RGB}, 0.04)`,
        pop:          `0 6px 16px rgba(${SHADOW_RGB}, 0.08), 0 2px 4px rgba(${SHADOW_RGB}, 0.04)`,
        float:        `0 16px 40px rgba(${SHADOW_RGB}, 0.10), 0 4px 12px rgba(${SHADOW_RGB}, 0.05)`,
        'brand-glow': `0 8px 28px rgba(${BRAND_RGB}, 0.26)`,
        // The CTA *hover* glow. Existed only as a hand-written
        // `hover:shadow-[0_10px_32px_rgba(47,156,134,0.36)]` at 12 call sites
        // (Btn's hero/cta variants among them) — now a named rung: write
        // `hover:shadow-brand-glow-lg`. Migrate the literals opportunistically.
        'brand-glow-lg': `0 10px 32px rgba(${BRAND_RGB}, 0.36)`,
        'inset-hairline': 'inset 0 1px 0 rgba(255, 255, 255, 0.5)',
      },

      // ── Gradients — the ONLY four allowed. Never compose ad-hoc from-/to-
      //    utilities in page code; reach for these named tokens so the
      //    palette stays disciplined (premium restraint, same rule as colors).
      //    All stops are existing palette values — no new hues.
      backgroundImage: {
        // Section/hero wash — white canvas melting into brand-50. Barely
        // visible by design; use on hero and section backgrounds only.
        'gradient-wash': `linear-gradient(180deg, ${INK_SCALE[50]} 0%, ${BRAND_SCALE[50]} 100%)`,
        // Deep surface — warm charcoal (heavy green undertone removed
        // 2026-07-19; the old #04241E teal read too harsh). Barely-there warmth
        // instead of green. For dark hero blocks and the next-session card.
        'gradient-dark': 'linear-gradient(155deg, #17150F 0%, #0B0A07 100%)',
        // Primary CTA — brand-500 → brand-600, vertical. Pair with
        // shadow-brand-glow. Primary actions only; secondary buttons stay flat.
        // 600 → 700, NOT 500 → 600 (2026-07-31). White text on brand-500
        // (#2F9C86) measures 3.38:1 — it fails WCAG AA (4.5:1) for the 12–16px
        // labels every CTA on this site uses, and this token was the fill behind
        // the loudest of them. brand-600 (#26806E) is 4.78:1 and brand-700
        // (#1E6656) is 6.79:1, so the whole sweep now passes with room to spare.
        // brand-500 is untouched everywhere it is NOT behind white text — the
        // logo, verified marks, focus rings, accent hairlines and light tints all
        // keep the exact wordmark green.
        'gradient-cta': `linear-gradient(180deg, ${BRAND_SCALE[600]} 0%, ${BRAND_SCALE[700]} 100%)`,
        // Signature text accent — brand-600 → ink-700 (green melting into
        // near-black). Blue removed from the palette (2026-07-19). Use with
        // bg-clip-text in AT MOST one place per page.
        'gradient-signature': `linear-gradient(90deg, ${BRAND_SCALE[600]} 0%, ${INK_SCALE[700]} 100%)`,
      },

      // ── THE TYPE SCALE (2026-07-27) ──────────────────────────────────────
      //  ONE ramp. NEVER hand-write `text-[Npx]` in app/ or components/ code —
      //  reach for a token below. Derived from the 41 ad-hoc sizes that had
      //  accumulated (incl. half-pixel steps like 12.5/13.5) by clustering them
      //  and rounding every value UP; the user's complaint was that text was
      //  too small, so nothing in the migration was allowed to shrink.
      //
      //  FLOOR — two-part, and both parts are hard rules:
      //    • Reading text (anything sentence-case that carries information:
      //      body, meta, helper, table cells, button labels, timestamps)
      //      NEVER goes below `meta` = 12px.
      //    • `micro` = 11px is the absolute floor of the whole system and is
      //      permitted ONLY for uppercase + tracked + semibold/bold micro
      //      labels (eyebrows, pill/badge captions) and numeric counters,
      //      where cap-height and letter-spacing buy back the legibility.
      //      Georgian mkhedruli needs more height than Latin at equal px —
      //      its rounded, connected letterforms turn to mush under ~12px —
      //      but mtavruli (the `case` feature, which every `uppercase` label
      //      renders in) sits on a flat cap-height and survives 11px.
      //    Nothing anywhere may go below 11px. Ever.
      //
      //  Tokens carry font-size + LINE-HEIGHT only — deliberately NO
      //  fontWeight and NO letterSpacing. globals.css gives h1–h3 and buttons
      //  `letter-spacing: .02em` for Georgian mtavruli; a letterSpacing baked
      //  into the token would be a utility class and would silently out-rank
      //  that element rule, un-tracking every heading. Weight is likewise
      //  always stated explicitly at the call site today, and a token default
      //  would change every element that omits `font-*`.
      //  Any explicit `leading-*` / `tracking-*` / `font-*` at the call site
      //  still wins: Tailwind emits fontSize utilities BEFORE lineHeight,
      //  letterSpacing and fontWeight utilities, so the call site overrides
      //  the token default (verified against this Tailwind build, not assumed).
      fontSize: {
        // ── Reading ramp — 8 steps, where ~93% of all text lives ───────────
        // 11px · uppercase/tracked micro labels + numeric counters ONLY.
        'micro':      ['11px', { lineHeight: '1.3'  }],
        // 12px · dense metadata, timestamps, audit/table cells, helper text,
        //        counter badges. THE FLOOR for anything sentence-case.
        'meta':       ['12px', { lineHeight: '1.45' }],
        // 13px · secondary copy, chip + small-button labels, captions.
        'small':      ['13px', { lineHeight: '1.5'  }],
        // 14px · DEFAULT body / UI text, inputs, standard button labels.
        'body':       ['14px', { lineHeight: '1.55' }],
        // 16px · lead paragraphs, hero sub-copy, prominent body.
        'body-lg':    ['16px', { lineHeight: '1.6'  }],
        // 18px · card titles, sub-section headings.
        'h3':         ['18px', { lineHeight: '1.4'  }],
        // 22px · section headings, in-card h2, big inline numerals.
        'h2':         ['22px', { lineHeight: '1.3'  }],
        // 28px · page titles (PageHeader), mobile hero h1.
        'h1':         ['28px', { lineHeight: '1.2'  }],

        // ── Display tier — 4 steps. Hero type only. ────────────────────────
        // Four steps rather than two because the codebase's hero/numeral type
        // legitimately spans 30→64px across breakpoints and the never-shrink
        // rule forbids compressing that range further.
        'display':    ['36px', { lineHeight: '1.12' }], // marketing section h2, tablet hero
        'display-lg': ['44px', { lineHeight: '1.08' }], // desktop hero h1, countdown digits
        'display-xl': ['52px', { lineHeight: '1.04' }], // wide-desktop hero h1
        'hero':       ['64px', { lineHeight: '1'    }], // the single biggest moment on a page
      },

      // ⚠️ DEAD TOKENS (audited 2026-08-01: zero call sites). The section
      // rhythm the site ACTUALLY uses is utility pairs — canon in
      // lib/design/README.md: marketing bands `py-16 lg:py-24`, standard
      // sections `py-12 lg:py-16`, workspace pages `py-8 lg:py-10`. Keep these
      // two only if a future sweep converges the pairs onto tokens; do not
      // reach for them ad hoc (a lone `py-section` would be a third system).
      spacing: {
        section:      '5rem',
        'section-sm': '3rem',
      },

      // ── Animation library — ALWAYS used with `motion-safe:animate-*` ───────
      //  `motion-safe:` is MANDATORY on every one of these. Not style — an
      //  accessibility contract: for users with vestibular disorders or
      //  migraine, unrequested movement causes nausea and pain. The blanket
      //  `prefers-reduced-motion: reduce` rule in globals.css is a net, not the
      //  fix — it can only crush a duration to 0.001ms, which leaves a spinner
      //  frozen mid-arc and a filling entrance stuck at its FROM state. The
      //  variant removes the animation entirely, which is the correct outcome.
      animation: {
        // fade-in deliberately has NO fill mode: AppShell applies it to the
        // wrapper around EVERY route, and a filling opacity animation keeps
        // that wrapper a stacking context forever — which traps every fixed
        // modal/sheet inside the page below the z-40 BottomNav (nav painted
        // over ConfirmModal). End state == natural state, so no fill needed.
        //  Durations snapped to the SAME three-step scale 2026-07-29 (they had
        //  drifted to six values — 160/200/260/280/320 — which made "one scale"
        //  false the moment you looked at an entrance). Curve is `out-expo`
        //  everywhere except fade-in-fast: at 140ms expo reads as a snap, and
        //  fade-in-fast exists precisely to get a menu/popover out of the way.
        'fade-in':      `fadeIn ${DUR_MID} ${EASE_OUT_EXPO}`,
        'fade-in-fast': `fadeIn ${DUR_FAST} ${EASE_OUT_QUART} both`,
        'rise-in':      `riseIn ${DUR_SLOW} ${EASE_OUT_EXPO} both`,
        'slide-in-r':   `slideInR ${DUR_MID} ${EASE_OUT_EXPO} both`,
        'slide-in-b':   `slideInB ${DUR_MID} ${EASE_OUT_EXPO} both`,
        'scale-in':     `scaleIn ${DUR_MID} ${EASE_OUT_EXPO} both`,
        //  The mobile nav drawer. NOT a new animation — `drawerInR` has run on
        //  the site since the drawer shipped; it was simply never registered
        //  here, so PublicTopBar had to hand-write it as an inline
        //  `style={{ animation: 'drawerInR 300ms cubic-bezier(…) both' }}`.
        //  That off-scale 300ms and the literal copy of --ease-entrance are
        //  gone now, and — the actual reason this is worth a token — an inline
        //  style cannot carry the `motion-safe:` variant, so the one entrance
        //  a keyboard/vestibular user meets first was the one entrance the
        //  contract did not cover. It is NOT `slide-in-r`: that comes from the
        //  LEFT by 8px, while a right-edge drawer must travel 28px from the
        //  right. Same DUR_MID / out-expo / both as every sibling entrance.
        'drawer-in-r':  `drawerInR ${DUR_MID} ${EASE_OUT_EXPO} both`,
        //  Typographic entrance: the line is UNCOVERED, not flown in. Longer
        //  than the 220ms UI entrances on purpose — a headline being set should
        //  read as deliberate, and it plays once, on load, with nothing waiting
        //  on it. Same out-expo curve as the rest of the scale. The 620ms is a
        //  documented off-scale duration (typography, not UI feedback).
        'line-rise':    `lineRise 620ms ${EASE_OUT_EXPO} both`,
        //  EXITS (added 2026-08-01, user-approved): mirrors of the entrances
        //  above, for surfaces that leave — sheets, menus, toasts. EASE_EXIT
        //  is ease-IN (a departure accelerates away; an ease-out exit lingers,
        //  which reads as reluctance). `both` holds the final frame so the
        //  element never flashes back before unmount.
        'fade-out-fast': `fadeOut ${DUR_FAST} ${EASE_EXIT} both`,
        'slide-out-b':   `slideOutB ${DUR_MID} ${EASE_EXIT} both`,
        'slide-out-r':   `slideOutR ${DUR_MID} ${EASE_EXIT} both`,
        'scale-out':     `scaleOut ${DUR_FAST} ${EASE_EXIT} both`,
        //  Ambient infinite loops — off-scale by nature (no start, no end).
        'pulse-soft':   'pulseSoft 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer':      'shimmer 1.6s linear infinite',
      },
      keyframes: {
        // OPACITY-ONLY on purpose. fadeIn is applied by AppShell to the page
        // wrapper around EVERY route; a transform here (even the identity end
        // state, kept by fill-mode "both") turns that wrapper into the
        // containing block for ALL position:fixed descendants — booking modal,
        // drawers, mobile bars then size against the full page height instead
        // of the viewport (2600px+ "blank" modal with its buttons off-screen).
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        riseIn: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideInR: {
          from: { opacity: '0', transform: 'translateX(-8px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        // Mirrors the `drawerInR` already in app/globals.css — the canon's
        // „keyframes live in BOTH files" rule (lib/design/README §3).
        drawerInR: {
          from: { opacity: '0', transform: 'translateX(28px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        fadeOut: { from: { opacity: '1' }, to: { opacity: '0' } },
        slideOutB: { from: { opacity: '1', transform: 'translateY(0)' }, to: { opacity: '0', transform: 'translateY(16px)' } },
        slideOutR: { from: { opacity: '1', transform: 'translateX(0)' }, to: { opacity: '0', transform: 'translateX(24px)' } },
        scaleOut: { from: { opacity: '1', transform: 'scale(1)' }, to: { opacity: '0', transform: 'scale(0.97)' } },
        slideInB: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        // 108%, not 100%: Georgian mkhedruli has descenders (ჰ, ე, ც), and at
        // exactly 100% their tails stay visible below the mask on the first
        // frame — the line looks like it is peeling rather than emerging.
        lineRise: {
          from: { transform: 'translateY(108%)' },
          to:   { transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.55' },
        },
        shimmer: {
          from: { backgroundPosition: '-200% 0' },
          to:   { backgroundPosition: '200% 0' },
        },
      },

      fontFamily: {
        sans:    ['FiraGO', 'Noto Sans Georgian', 'Fira Sans', 'system-ui', 'sans-serif'],
        display: ['FiraGO', 'Noto Sans Georgian', 'Fira Sans', 'system-ui', 'sans-serif'],
        body:    ['FiraGO', 'Noto Sans Georgian', 'Fira Sans', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  // No safelist: zero dynamically-constructed classnames exist (verified 2026-07 —
  // no `bg-${…}`-style interpolation anywhere in app/, components/, lib/). All color
  // classes appear literally in source, so the content scanner picks them up. If you
  // ever build a classname at runtime, write the full class strings out explicitly
  // (in a map) instead of re-adding a pattern safelist.
  plugins: [],
}

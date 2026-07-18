/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ─────────────────────────────────────────────────────────────────────
        //   THE 3-COLOR PALETTE
        //   Nothing else is decorative. Semantic (success/warning/danger) is
        //   used ONLY at the point of meaning (an error, a warning) — never
        //   as visual accents.
        // ─────────────────────────────────────────────────────────────────────

        // ── Brand · teal-green (PRIMARY, #159A82) ───────────────────────────
        // The primary color. Used with restraint (premium): CTAs, key accents,
        // brand moments — not everywhere. Blue (`info`) is the secondary accent.
        brand: {
          50:  '#EAF7F3',
          100: '#CCEEE2',
          200: '#9BDCC5',
          300: '#65C9A6',
          400: '#33B48A',
          500: '#159A82',
          600: '#0F8069',
          700: '#0C6553',
          800: '#0A4E41',
          900: '#083A30',
          950: '#04241E',
        },

        // ── Ink · neutral ramp (WHITE canvas → near-black) ──────────────────
        // ink-50 is the WHITE canvas (cream removed per design decision).
        // ink-700+ is DARK for text. Intermediate shades stay slightly warm-
        // tinted so borders/hairlines don't feel cold.
        ink: {
          50:  '#FFFFFF', // page background — pure white
          75:  '#F8F6F2', // very light warm-neutral (elevated card interior)
          100: '#EFECE5', // hairline / subtle divider
          200: '#DFD8CB', // border
          300: '#C6BCA9', // strong border, faded text
          400: '#9C9488', // muted text
          500: '#6E6759', // secondary text
          600: '#4A4437', // body text
          700: '#2E2A21', // headings — the "dark black"
          800: '#1D1B15', // deeper
          900: '#0F0E0A', // deepest — hero backgrounds
          950: '#050503',
        },

        // ── Accent · aliased to ink for backwards compatibility. Legacy
        //     `bg-accent-900` etc. now maps to the same deep near-black used
        //     in hero surfaces. Do NOT reach for accent in new code.
        accent: {
          50:  '#F8F6F2',
          100: '#EFECE5',
          200: '#DFD8CB',
          300: '#C6BCA9',
          400: '#9C9488',
          500: '#6E6759',
          600: '#4A4437',
          700: '#2E2A21',
          800: '#1D1B15',
          900: '#0F0E0A',
          950: '#050503',
        },

        // ── Semantic states — MUTED, meaning-only. Never decorative. ────────
        // Success = the same brand green (#159A82) so every positive/trust
        // signal — verified, live, escrow, success states — reads as ONE
        // consistent green rather than two competing tones.
        success: {
          50: '#EAF7F3', 100: '#CCEEE2', 200: '#9BDCC5', 300: '#65C9A6',
          400: '#33B48A', 500: '#159A82', 600: '#0F8069', 700: '#0C6553',
          800: '#0A4E41', 900: '#083A30', 950: '#04241E',
        },
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
        flame: { 50: '#EAF7F3', 100: '#CCEEE2', 200: '#9BDCC5', 300: '#65C9A6', 400: '#33B48A', 500: '#159A82', 600: '#0F8069', 700: '#0C6553', 800: '#0A4E41', 900: '#083A30', 950: '#04241E' },
      },

      borderRadius: {
        field: '12px',
        btn:   '14px',
        card:  '20px',
        pill:  '9999px',
      },

      // ── Shadows — warm-tinted (RGB 46/42/33), soft, never shouty. ─────────
      boxShadow: {
        xs:           '0 1px 2px rgba(46, 42, 33, 0.04)',
        sm:           '0 1px 3px rgba(46, 42, 33, 0.05), 0 1px 2px rgba(46, 42, 33, 0.03)',
        card:         '0 2px 6px rgba(46, 42, 33, 0.05), 0 1px 2px rgba(46, 42, 33, 0.04)',
        'card-hover': '0 10px 24px rgba(46, 42, 33, 0.08), 0 3px 6px rgba(46, 42, 33, 0.04)',
        pop:          '0 6px 16px rgba(46, 42, 33, 0.08), 0 2px 4px rgba(46, 42, 33, 0.04)',
        float:        '0 16px 40px rgba(46, 42, 33, 0.10), 0 4px 12px rgba(46, 42, 33, 0.05)',
        'brand-glow': '0 8px 28px rgba(21, 154, 130, 0.26)',
        'inset-hairline': 'inset 0 1px 0 rgba(255, 255, 255, 0.5)',
      },

      // ── Gradients — the ONLY four allowed. Never compose ad-hoc from-/to-
      //    utilities in page code; reach for these named tokens so the
      //    palette stays disciplined (premium restraint, same rule as colors).
      //    All stops are existing palette values — no new hues.
      backgroundImage: {
        // Section/hero wash — white canvas melting into brand-50. Barely
        // visible by design; use on hero and section backgrounds only.
        'gradient-wash': 'linear-gradient(180deg, #FFFFFF 0%, #EAF7F3 100%)',
        // Deep surface — ink-900 with a dark brand-green undertone. For
        // dark hero blocks and the next-session card; richer than flat black.
        'gradient-dark': 'linear-gradient(160deg, #0F0E0A 0%, #04241E 100%)',
        // Primary CTA — brand-500 → brand-600, vertical. Pair with
        // shadow-brand-glow. Primary actions only; secondary buttons stay flat.
        'gradient-cta': 'linear-gradient(180deg, #159A82 0%, #0F8069 100%)',
        // Signature text accent — brand-600 → info-500 (the one green→blue
        // moment). Use with bg-clip-text in AT MOST one place per page.
        'gradient-signature': 'linear-gradient(90deg, #0F8069 0%, #2563EB 100%)',
      },

      fontSize: {
        'display-lg': ['2.75rem', { lineHeight: '1.08', letterSpacing: '-0.022em', fontWeight: '700' }],
        'display':    ['2rem',    { lineHeight: '1.12', letterSpacing: '-0.02em',  fontWeight: '700' }],
        'h1':         ['1.625rem',{ lineHeight: '1.2',  letterSpacing: '-0.018em', fontWeight: '700' }],
        'h2':         ['1.25rem', { lineHeight: '1.3',  letterSpacing: '-0.012em', fontWeight: '600' }],
        'h3':         ['1.0625rem', { lineHeight: '1.4', letterSpacing: '-0.008em', fontWeight: '600' }],
        'body-lg':    ['1rem',    { lineHeight: '1.55', fontWeight: '400' }],
        'body':       ['0.875rem', { lineHeight: '1.55', fontWeight: '400' }],
        'small':      ['0.8125rem', { lineHeight: '1.5', fontWeight: '400' }],
        'caption':    ['0.75rem', { lineHeight: '1.4', fontWeight: '500' }],
        'eyebrow':    ['0.65625rem', { lineHeight: '1.3', letterSpacing: '0.14em', fontWeight: '600' }],
      },

      spacing: {
        section:      '5rem',
        'section-sm': '3rem',
      },

      // ── Motion tokens ────────────────────────────────────────────────────
      transitionDuration: {
        fast: '140ms',
        mid:  '220ms',
        slow: '360ms',
        180:  '180ms',
        220:  '220ms',
      },
      transitionTimingFunction: {
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
        'out-expo':  'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out-quart': 'cubic-bezier(0.76, 0, 0.24, 1)',
      },

      // ── Animation library — used with `motion-safe:animate-*` ──────────────
      animation: {
        // fade-in deliberately has NO fill mode: AppShell applies it to the
        // wrapper around EVERY route, and a filling opacity animation keeps
        // that wrapper a stacking context forever — which traps every fixed
        // modal/sheet inside the page below the z-40 BottomNav (nav painted
        // over ConfirmModal). End state == natural state, so no fill needed.
        'fade-in':      'fadeIn 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in-fast': 'fadeIn 160ms cubic-bezier(0.25, 1, 0.5, 1) both',
        'rise-in':      'riseIn 320ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-in-r':   'slideInR 260ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-in-b':   'slideInB 280ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-in':     'scaleIn 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
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
        slideInB: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to:   { opacity: '1', transform: 'scale(1)' },
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

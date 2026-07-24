# mcodne.ge — Design System Canon

Georgian expert-consultation marketplace (Next.js 15 + Tailwind + Prisma). UI is Georgian.
**Every new/edited surface must follow this canon — public, auth, student, tutor, admin alike.**

## Color (strict 2-color system — blue removed 2026-07-19)
- **PRIMARY green `brand` (#2F9C86)** — the logo teal (aligned to the wordmark 2026-07-19; was #159A82). Used with restraint: primary CTAs, verified, live, escrow, key accents. Never decorative washes on cards/forms.
- **NO BLUE.** The `info` token still exists for backwards-compat but must NOT be used as an accent — pedigree/credential/notification chips are neutral `bg-ink-75 text-ink-700 border-ink-200`.
- **NEUTRAL `ink` ramp** — dominant: text, borders (`border-ink-200`), hairlines (`border-ink-100`), backgrounds.
- Semantic `success`(=brand green)/`warning`(gold — ratings + genuine cautions ONLY, not decorative)/`danger` only at the point of meaning. No other hues, no ad-hoc hex in pages.
- **No status dots and no decorative button arrows** anywhere (2026-07-19). Badges = hairline border + colored text, no pastel fill (SUPER = `bg-ink-900 text-white`).
- Gradients: ONLY the four named tokens in tailwind config (`gradient-wash/dark/cta/signature`); `gradient-dark` is warm charcoal (not teal); never ad-hoc `from-/to-` in page code.
- Buttons: `rounded-btn` = 10px (crisp/geometric, echoes logo). Comfortable date/time picking via `components/booking/DateTimePicker.tsx`.

## Type
- FiraGO self-hosted (`public/fonts/firago-*.woff2`); never add font CDNs.
- Georgian TT (mtavruli) on h1–h3 + buttons comes from `font-feature-settings:"case"` in globals.css (NOT text-transform). Opt out with `.no-caps`.
- Section header pattern: mono/eyebrow label (`text-[10.5–11px] uppercase tracking-[0.18em] text-brand-700`) + heading + optional one-line muted sub (`text-ink-500`).

## Sizing canon (normalized 2026-07)
- **Containers**: page shell `max-w-[1280px] mx-auto px-6 sm:px-8`. Narrow content (forms/prose): 520–820px contextual.
- **Buttons**: default **h-11**; small **h-9**; large/hero **h-12**. Icon-buttons 40×40 (`w-10 h-10`) or 36×36. Radius `rounded-btn`. Prefer `<Btn>` (components/Btn.tsx) — variants primary/hero/secondary/ghost/danger, default `type="button"`, tactile press built in.
- **Inputs/selects**: **h-11** standard; hero-search and auth fields may use **h-12** (the deliberate "prominent" tier — nothing between or above). Radius `rounded-field`, textarea `py-3`. Global focus glow exists in globals.css — don't add per-field rings.
- **Cards**: radius `rounded-card`, border `border-ink-200`, padding `p-5 sm:p-6` (compact lists `p-4`; hero/section cards may use `p-8+`). Elevation: hairline border + `shadow-xs/card`; hover = `.hover-lift` or border warm-up — never shadow bloom.
- **Chips/pills**: h-6/7/8 `rounded-pill`; plus an **h-5 micro-chip tier** for inline badges (SUPER, unread counts, "შეფასება ელოდება"). Badges: verified = green circle+check; SUPER = warning-50 gold; pedigree = `bg-info-50 text-info-700`.
- **Icons**: inline 16–18px, standalone 20–24px, plus a **12px (`w-3 h-3`) meta/inline-dense tier** for metadata rows and micro-chips (floor: 12px — never `w-2.5`). One stroke family (1.6–2.2), line-only. Single source: `components/Icon.tsx` — never define page-local icon sets.

## Layout & states
- Sticky rails: `position: sticky` works because `html,body` use `overflow-x: clip` (NOT `hidden` — hidden kills sticky site-wide). Don't reintroduce `overflow-x: hidden` on body.
- Mobile bottom CTAs set `data-mobile-cta` on body so the cookie banner lifts above (globals.css).
- Empty/error states: compact — icon + one line + one action; never hero-sized. Use components/EmptyState where possible.
- Dates: NEVER `toLocaleDateString('ka-GE', {month/weekday})` — runtime ICU falls back to English. Use `lib/kaDate.ts` (`fmtKaDate/fmtKaTime/fmtKaDateTime`).

## Product rules
- Terminology: always „ექსპერტი" (never ტუტორი/რეპეტიტორი in UI). Support email: hi@mcodne.ge.
- Lexicon (Georgian-first, UI copy only — never rename code identifiers/API fields): „ჩემი სივრცე" (not „dashboard/დაშბორდი"), „დრო/თავისუფალი დრო" (not „სლოტი"), „დაცული გადახდა/დაცული თანხა" (not „escrow"), „და" (not „&") inside Georgian strings.
- Paid-only model: NO free-trial promises in copy (removed 2026-07). Free things that exist: registration, cancellation ≥24h before, no-show replacement.
- Escrow/payments not yet live — bookings currently free; keep the honest "payments coming soon" notes until integration.
- Trust signals live at decision points: verified/escrow/ID row on profiles, escrow line at checkout, reassurance under booking CTAs.

## Verification habit
- Typecheck: `npx tsc --noEmit -p tsconfig.json` must stay clean.
- Dev server `.next` cache corrupts under heavy editing: if pages render empty with working APIs → `pkill -f "next dev"; rm -rf .next; npm run dev`.
- Verify visually with Playwright (`node_modules/.bin/playwright`, chromium installed) at 1440px and 390px before deploying.
- Deploy: `railway up --detach` (project Tutor → service mcodne → https://mcodne.ge); verify live after.

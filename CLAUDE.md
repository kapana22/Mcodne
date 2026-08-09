# mcodne.ge — Design System Canon

Georgian expert-consultation marketplace (Next.js 15 + Tailwind + Prisma). UI is Georgian.
**Every new/edited surface must follow this canon — public, auth, student, tutor, admin alike.**

## Where things live (map added 2026-08-08)
**Every big screen is a container plus `_*.tsx` siblings in its own folder. Open the part, not the page** — the container holds only state, fetch and layout.

| screen | container | its parts |
| --- | --- | --- |
| `/` home | `app/HomeClient.tsx` (50L) | `app/_home/` — `data` `hero` `categories` `experts` `how` `cta` |
| `/tutors` browse | `app/tutors/client.tsx` | `_data` `_filters` `_hero` `_card` `_results` |
| `/tutors/[id]` profile | `app/tutors/[id]/client.tsx` | `_bits` `_data` `_hero` `_reviews` `_booking` `_similar` `_sections` |
| `/apply` | `app/apply/ApplyClient.tsx` | `_form` `_fields` `_chrome` `_upload` `_steps` `_draft` |
| `/signin` + `/signup` | `app/signin/auth-client.tsx` (79L) | `_model` `_fields` `_signin` `_signup` `_verify` `_reset` `_onboarding` |
| `/student` | `app/student/page.tsx` | `_model` `_welcome` `_next` `_saved` `_discover` `_sessions` |
| `/student/bookings/[id]` | `.../page.tsx` | `_model` `_hero` `_modals` `_review` `_body` `_mobile` |
| `/tutor/bookings/[id]` | `.../page.tsx` | `_model` `_review` `_timeline` |
| `/admin` | `app/admin/page.tsx` (115L) | one `_<tab>.tsx` per tab + shared `_parts.tsx` |
| `/settings` | `app/settings/page.tsx` | `_types` `_profile` `_password` `_account` `_prefs` |
| `/tutor/profile` | `app/tutor/profile/page.tsx` | `_types` `_parts` `_tabProfile` `_tabServices` `_tabCredentials` `_tabAccount` |
| `/tutor/schedule` | `app/tutor/schedule/page.tsx` | `_shared` `_sheetSlot` `_sheetTemplate` `_sheetBlock` |

⚠️ **The last four differ: state stayed in the page, only JSX moved.** Those
sections take explicit props (ProfileSection 16, CredentialsTab 24) because the
coupling was already there — the prop list makes it visible, it did not create
it. Do not "tidy" that by moving the useState calls into the children: the page
seeds them from its fetch, so moving them turns seeding into an effect.

**`components/booking/BookingFlow.tsx` (1,136L) is deliberately NOT split.**
Measured, not assumed: every block worth extracting needs ~40 props (the time
step 45, the day/time grid 40). At that ratio the interface is as much to hold
in your head as the code, and this is the booking path — it is also a lazy
chunk, so it cannot be checked by grep. If it is ever restructured, the move is
a `useSlotSelection` hook, not a prop-threaded child, and it needs a browser.

Three rules this shape depends on:
- **The model is a leaf.** Each folder's `_model` / `_data` / `_form` imports no sibling; everything else imports it. A cycle always means a piece of the model was left in a UI file — move it to the leaf, don't add an import.
- **Never split a component to shrink a file.** These were pure MOVES, verified line-for-line. `tutor/profile` (1695L), `tutor/schedule` (1505L), `BookingFlow` (1136L) and `settings` (916L) are still big because each is ONE component — shrinking them is a rewrite and needs its own decision.
- **Tests read these screens as SOURCE TEXT.** ~10 of them. They must read the whole route DIRECTORY, never one filename. Watch for the reverse failure too: a negative assertion („X no longer appears here") pointed at a container passes vacuously — `category-marks` C6 was defanged exactly this way and is now directory-wide.

## Design levers (2026-08-01)
**The full map of "change it once, it changes everywhere" lives in `lib/design/README.md` (Georgian, with file:line pointers) — read it before touching any visual value.** Short version: colors = `BRAND_SCALE`/`INK_SCALE` consts at the top of `tailwind.config.js` (brand/success/flame share ONE object, accent aliases ink); type = the `fontSize` ramp; motion = `DUR_*`/`EASE_*` consts mirrored as `--dur-*`/`--ease-*` in globals.css (utility name `ease-out-quart` ↔ CSS var `--ease-out` — `var(--ease-out-quart)` does not exist); shadows/radii/gradients = named tokens only (CTA hover glow = `shadow-brand-glow-lg`, never the rgba literal); glass = `.glass`/`.glass-bar`; uppercase tracking = the ONE globals.css rule (see Type below); section rhythm + primitive components (`Btn`/`Card`/`Eyebrow`/`PageHeader`/`Container`/`EmptyState`/`Sheet`) = README §5–6. New surface checklist = README §7; the backlog of call-site duplication still to sweep = README §8.

## Color (strict 2-color system — blue removed 2026-07-19)
- **PRIMARY green `brand` (#2F9C86)** — the logo teal (aligned to the wordmark 2026-07-19; was #159A82). Used with restraint: primary CTAs, verified, live, escrow, key accents. Never decorative washes on cards/forms.
- **NO BLUE.** The `info` token still exists for backwards-compat but must NOT be used as an accent — pedigree/credential/notification chips are neutral `bg-ink-75 text-ink-700 border-ink-200`.
- **NEUTRAL `ink` ramp** — dominant: text, borders (`border-ink-200`), hairlines (`border-ink-100`), backgrounds.
- Semantic `success`(=brand green)/`warning`(gold — ratings + genuine cautions ONLY, not decorative)/`danger` only at the point of meaning. No other hues, no ad-hoc hex in pages.
- **No status dots and no decorative button arrows** anywhere (2026-07-19). Badges = hairline border + colored text, no pastel fill (SUPER = `bg-ink-900 text-white`).
- Gradients: ONLY the four named tokens in tailwind config (`gradient-wash/dark/cta/signature`); `gradient-dark` is warm charcoal (not teal); never ad-hoc `from-/to-` in page code.
- Buttons: `rounded-btn` = 10px (crisp/geometric, echoes logo). Date/time picking: booking flow uses `components/booking/Calendar.tsx` + `DayTimeline.tsx` (real slots via `slots.ts`); reschedule uses `components/booking/RescheduleTimePicker.tsx` (real availability only).

## Type
- FiraGO self-hosted (`public/fonts/firago-*.woff2`); never add font CDNs.
- Georgian TT (mtavruli) on h1–h3 + buttons comes from `font-feature-settings:"case"` in globals.css (NOT text-transform). Opt out with `.no-caps`.
- Section header pattern: `<Eyebrow>` (= `text-micro uppercase text-brand-700`) + heading + optional one-line muted sub (`text-ink-500`). Eyebrow/label tracking has ONE source: globals.css `[class*="uppercase"] { letter-spacing: 0.14em }` — that rule out-cascades every `tracking-*` utility on an uppercase element, so any per-site `tracking-[…]` next to `uppercase` is dead code (174 such sites existed; delete them opportunistically, never add new ones). Retune tracking in that one rule only.

## THE TYPE SCALE (established 2026-07-27 — this section's absence is why 41 ad-hoc sizes accumulated)
**NEVER hand-write `text-[Npx]`.** The ramp lives in `tailwind.config.js → theme.extend.fontSize`; write the token. Same for `leading-*`: every step ships a line-height, so `text-body` is already correctly leaded — only add `leading-*` when you deliberately want something other than the step default.

| token | px / line-height | use it for |
| --- | --- | --- |
| `text-micro` | 11 / 1.3 | uppercase+tracked micro labels (eyebrows, pill & badge captions) and numeric counters — **nothing else** |
| `text-meta` | 12 / 1.45 | dense metadata, timestamps, table + audit cells, helper/hint text, counter badges |
| `text-small` | 13 / 1.5 | secondary copy, chip and small-button labels, captions |
| `text-body` | 14 / 1.55 | **default** body & UI text, inputs, standard button labels |
| `text-body-lg` | 16 / 1.6 | lead paragraphs, hero sub-copy, prominent body |
| `text-h3` | 18 / 1.4 | card titles, sub-section headings |
| `text-h2` | 22 / 1.3 | section headings, in-card h2, big inline numerals |
| `text-h1` | 28 / 1.2 | page titles (`<PageHeader>`), mobile hero h1 |
| `text-display` | 36 / 1.12 | marketing section h2, tablet hero |
| `text-display-lg` | 44 / 1.08 | desktop hero h1, countdown digits |
| `text-display-xl` | 52 / 1.04 | wide-desktop hero h1 |
| `text-hero` | 64 / 1 | the single biggest moment on a page |

- **FLOOR (two parts, both hard):** reading text — anything sentence-case that carries information — **never below `text-meta` (12px)**. `text-micro` (11px) is the absolute floor of the system and is allowed **only** on uppercase + tracked + semibold/bold labels and numeric counters, where cap-height and letter-spacing buy the legibility back. Georgian mkhedruli's rounded connected letterforms turn to mush under ~12px; mtavruli (what every `uppercase` label renders in, via the `case` feature) sits on a flat cap-height and survives 11px. **Nothing goes below 11px, ever.**
- **Rounding rule when you're between steps: round UP.** The scale was derived by rounding every legacy size up; a change that makes existing text smaller is a regression, not a refinement. The one exception is a heading that would otherwise land ≥ its own page's h1 (see next bullet).
- **Check the hierarchy before you pick a step.** Two nearby legacy sizes often collapse onto one token — verify a card title still outranks its meta line, and that **no `h2` ends up ≥ its page's `h1`** (that bug existed on the home page: hero 27px vs section h2 24px, one step apart). Deliberate demotions already applied: home + expert-profile + student section h2s sit at `text-h2`, and `about` section h2s at `text-h1`, precisely to keep clear of their pages' h1.
- Tokens carry **size + line-height only** — no `fontWeight`, no `letterSpacing`, on purpose. globals.css gives h1–h3/buttons `letter-spacing: .02em` for mtavruli; a letterSpacing baked into a token is a utility class and would silently out-rank that element rule and un-track every heading. Explicit `font-*` / `leading-*` / `tracking-*` at the call site always wins (Tailwind emits fontSize utilities before those three).
- **Off-ramps** exist and are legitimate, but each one carries a one-line comment saying why. The only four today: the 404/500 numerals (`text-[120px] sm:text-[160px]`, decorative not type), the student next-session countdown (`text-[56px]`, geometry-locked to the card at 390px), the home hero's mobile step (`text-[25px]` — was 27px until the 2026-08-01 cross-browser pass; `text-h1`/28px re-wraps the authored two-line headline, and FF/WebKit render real mtavruli casing ~4–6% wider than Chrome, so 27 wrapped to four lines there too), and globals.css's `font-size: 16px !important` iOS input-zoom guard.

## THE MOTION SCALE (established 2026-07-29 — this section's absence is why 42 animations shipped unguarded and 443 transitions ran on an undocumented 150ms)
**Three durations, two curves, one mandatory guard.** Tokens live in `tailwind.config.js → theme.transitionDuration / theme.transitionTimingFunction` — **outside `extend`, deliberately**, so Tailwind's stock ramp is REPLACED and `duration-300` / `ease-out` are no longer valid class names at all (unlike the type ramp, which can safely extend). They are mirrored as `--dur-*` / `--ease-*` custom properties in globals.css so the CSS layer and the utility layer cannot drift. **Never hand-write `duration-[Nms]`, `duration-300`, or a raw `cubic-bezier()`** — write the intent.

| token | ms | use it for |
| --- | --- | --- |
| `duration-fast` | 140 | **default.** Instant feedback: hover colour, border warm-up, focus ring, press, icon swap, opacity toggle. ~97% of transitions. |
| `duration-mid` | 220 | Visible state change: transform reveals, elevation/shadow ramps, progress width, accordions — something moves and the user watches it arrive. |
| `duration-slow` | 360 | Deliberate entrance: scroll reveals (`.reveal`), drawers, `.stagger`, a whole surface committing. |

- **Every `transition-*` must carry a duration token.** `transition-colors` alone is not a decision — it silently inherited Tailwind's 150ms, which is how two parallel systems formed. `transitionDuration.DEFAULT` is now pinned to 140ms as a *net* so a missed site can't regress, but a bare `transition-*` still reads as "nobody chose"; state the token.
- **Curves: `ease-out-quart` is THE default and is wired to `transitionTimingFunction.DEFAULT`**, so even a bare `transition-*` decelerates like everything else (Tailwind's stock default is an ease-*in*-out and was quietly in use on 443 sites). `ease-out-expo` is the ONE alternative and belongs to **entrances only** — the `animate-*` keyframes and `.reveal`. Reason, so nobody "simplifies" it away: an entrance starts from a state the user has never seen, so expo's front-load makes it legible in the first third and the tail is a settle; a transition starts from a state the user is already looking at, where the same front-load reads as a snap. There is no third curve — the checkbox tick's overshoot `cubic-bezier(0.34, 1.56, …)` was removed 2026-07-29 (canon: never bouncy).
- **`motion-safe:` is MANDATORY on every `animate-*`. No exceptions, and it is not noise.** For users with vestibular disorders or migraine, unrequested movement causes nausea and pain — this is an accessibility contract, not a preference. The blanket `prefers-reduced-motion: reduce` rule at the bottom of globals.css is a **net, not the fix**: it can only crush a duration to 0.001ms, which leaves a spinner frozen mid-arc and a fill-mode entrance stuck at its FROM state. The variant removes the animation outright, which is the correct outcome.
- **Functional motion still has to work with the motion removed.** A skeleton is fine frozen — a grey block is still a placeholder. A **spinner is not**: a frozen arc is a lie about "working". Every spinner therefore pairs the ring (`aria-hidden`) with something non-moving that carries the state — a visible „იტვირთება…"/„ვამოწმებთ…" label, or `aria-busy` + the disabled control on icon-only buttons.
- **Ambient infinite loops are off-scale by nature** and exempt: `shimmer` 1.6s, `pulse-soft` 2.4s, the hero `aurora-a` 26s drift. They have no start and no end, so "how long until it's done" is meaningless — and the curve rule is exempt too (`aurora` uses `ease-in-out`: a symmetric breathing cycle has nothing to rest at). They are still `motion-safe:`-gated.
- **The `animate-*` tokens run on the same three durations** (`fade-in-fast` 140 · `fade-in`/`slide-in-r`/`slide-in-b`/`scale-in` 220 · `rise-in` 360) — they had drifted to six values. You pick an entrance **by name**, never by number, exactly as you pick a type step.
- **2026-08-01 animation pass (user-approved) — what was added and the NEW ceiling.** Three additions, each reusing existing tokens rather than minting keyframes: (1) **View Transitions** — next-view-transitions wires document.startViewTransition around navigations; the expert photo carries `vt-photo-<id>` on cards AND the profile, so it morphs between pages. Card hrefs MUST use the expert's `slug` when present — a cuid href 308s to the slug and the redirect downgrades to a full load, silently killing the morph. CSS + reduced-motion guard at the bottom of globals.css. (2) **WordReveal** (home hero) — word-level LineReveal, same `line-rise` keyframe; the gradient line stays a single mask (background-clip:text does not survive word-splitting). (3) **Booking step entrances** — each step panel's root mounts with `slide-in-b`; the footer „არჩეული" line remounts with `fade-in-fast` keyed on the selection.
- **Do not add new animation.** The library is closed at 8 tokens (`fade-in`, `fade-in-fast`, `rise-in`, `slide-in-r`, `slide-in-b`, `scale-in`, `pulse-soft`, `shimmer`) plus Tailwind's `pulse`/`spin`; 28 `rise-in` + 26 `scale-in` entrances are already plenty. Prefer removing motion to adding it. **Never** animate a layout property (`margin`/`gap`/`width` on a live element), never move content out from under the cursor, and never let an entrance delay a control becoming usable.
- **`fade-in` keeps NO fill-mode — permanently.** Documented past bug: AppShell applies it to the wrapper around every route, and a filling opacity animation keeps that wrapper a stacking context forever, trapping every fixed modal below the BottomNav. End state == natural state, so no fill is needed. Same reason `fadeIn` stays opacity-only (no transform) — pinned by `tests/regression-invariants.test.ts`.
- Removed 2026-07-29 as dead or decorative-hostile, don't reintroduce: `.btn-sheen` (a 640ms light sweep across primary CTAs — 1.8× the slowest tier, pure decoration on a control), the home avatar-stack hover fan-out (animated `margin`, moved content under the cursor), the category-icon `-rotate-3` wiggle, `.link-slide` / `.card-interactive` / `.page-in` / `.aurora-b` (zero usages; `.hover-lift` and `animate-fade-in` are the live equivalents), and the `in-out-quart` token.

## THE STACKING ORDER (established 2026-08-06 — this section's absence is why 14 arbitrary z-values accumulated)
**Never hand-write `z-[N]` above 40.** The scale lives in `tailwind.config.js → theme.extend.zIndex` and is the single source for what covers what: `z-chrome` 40 (sticky headers, workspace bars, BottomNav) · `z-to-top` 45 · `z-help` 46 · `z-consent` 50 · `z-pill` 55 · `z-impersonate` 60 · `z-overlay` 65 · `z-drawer-scrim` 69 · `z-drawer` 70 · `z-sheet` 80 · `z-confirm` 90 · `z-toast` 95 · `z-skip` 100. Additive, not a replacement — ordinary in-flow elevation (`z-10`/`z-20`: a badge over a photo) is not part of this conversation and stays as it is. Before the token the ordering rationale lived only in prose across six components, each explaining itself in terms of its neighbours, and the admin drawer had quietly invented a private 50/51 pair that put its scrim level with the cookie banner. Pinned by `tests/designTokens.test.ts` §D/§E, which asserts the relationships (a scrim is exactly one below its drawer; the skip link is above everything) rather than the numbers.

## A control's LABEL SIZE follows its HEIGHT (2026-08-06)
`h-9 → text-small` · `h-11 → text-body` · `h-12 → text-body-lg` — the pairing `<Btn>`'s size tiers already ship, because height is how a control announces its importance and the label has to agree. 78 hand-built primary buttons had drifted off it; 55 sat at `h-11` with a 13px label, i.e. the page's main action set at filter-chip size. **This cannot be patched through `className`** — two fontSize utilities on one element resolve by Tailwind's emit order, not by the order you wrote them, so the pairing has to be right at the source. Pinned by `tests/designTokens.test.ts` §F.

## Contrast is arithmetic, not judgement (2026-08-06)
- **A FILLED brand surface is `brand-600`** (white on brand-500 = 3.38, fails AA; brand-600 = 4.78). Same for semantic fills: `warning-600` (5.51), never `warning-500` (3.67). `danger-500` is fine (7.62).
- **Never translucent white text on a coloured fill.** On `brand-600` even `text-white/90` measures 4.19 — every opacity step fails, so the fill cannot carry a second white tier at all; hierarchy there comes from size and weight. Opacity IS legitimate on dark neutral grounds (`ink-800/900`, `gradient-dark`), where `text-white/50` still measures 5.2+.
- Both rules are enforced arithmetically by `tests/designTokens.test.ts` — the ratios are computed from the palette, so re-tuning a step re-runs the real check instead of trusting a pasted number.

## Control heights (clarified 2026-07-27)
- **Canon tiers: `h-9` (small) · `h-11` (default) · `h-12` (large/hero).** Nothing between or above. `h-10` and `h-14` are **off-canon for controls** — `h-10` interactive elements become `h-11`, `h-14` ones become `h-12` (both stay ≥40px). The one blessed `h-10` is the **40×40 icon-button** (`w-10 h-10`); 36×36 (`w-9 h-9`) is the compact icon tier.
- `h-14` is still fine as pure **layout** (workspace top bars `h-14 lg:h-16`) and as an **avatar/icon plate** (`w-14 h-14`) — it's only banned as a control height.
- **Chips/badges keep h-5/6/7/8** — that tier is canon and must stay for non-interactive pills. But **anything TAPPABLE must be ≥40px**: if a chip gains an `onClick`/`href`, it moves to `h-11` (or keeps its visual size and gains padding/`::before` hit area). ~50 legacy interactive `h-7`/`h-8` chips predate this rule and were deliberately NOT swept in the 2026-07-27 pass — fix them opportunistically, in the file you're already touching, never in bulk.

## Sizing canon (normalized 2026-07)
- **Containers**: page shell `max-w-[1280px] mx-auto px-6 sm:px-8`. Narrow content (forms/prose): 520–820px contextual.
- **Buttons**: see "Control heights" above (h-9 / h-11 / h-12; icon-buttons 40×40 or 36×36). Radius `rounded-btn`. Prefer `<Btn>` (components/Btn.tsx) — variants primary/hero/secondary/ghost/danger, default `type="button"`, tactile press built in.
- **Inputs/selects**: **h-11** standard; hero-search and auth fields may use **h-12** (the deliberate "prominent" tier — nothing between or above). Radius `rounded-field`, textarea `py-3`. Global focus glow exists in globals.css — don't add per-field rings.
- **Cards**: radius `rounded-card`, border `border-ink-200`, padding `p-5 sm:p-6` (compact lists `p-4`; hero/section cards may use `p-8+`). Elevation: hairline border + `shadow-xs/card`; hover = `.hover-lift` or border warm-up — never shadow bloom.
- **Chips/pills**: h-6/7/8 `rounded-pill`; plus an **h-5 micro-chip tier** for inline badges (SUPER, unread counts, "შეფასება ელოდება"). Badges: verified = green circle+check; SUPER = warning-50 gold; pedigree = `bg-info-50 text-info-700`.
- **Icons**: inline 16–18px, standalone 20–24px, plus a **12px (`w-3 h-3`) meta/inline-dense tier** for metadata rows and micro-chips (floor: 12px — never `w-2.5`). One stroke family (1.6–2.2), line-only. Single source: `components/Icon.tsx` — never define page-local icon sets.

## Layout & states
- Sticky rails: `position: sticky` works because `html,body` use `overflow-x: clip` (NOT `hidden` — hidden kills sticky site-wide). Don't reintroduce `overflow-x: hidden` on body.
- Mobile bottom CTAs set `data-mobile-cta` on body so the cookie banner lifts above (globals.css).
- ⚠️ **Glass is for surfaces you look PAST, never for surfaces you must READ (2026-08-02).** Dropdown menus (UserMenu, NotifBell) and toasts were briefly made `.glass` and went straight back to solid `bg-white border-ink-200`: they land over dense body copy and carry text the user gets one chance to read. Opacities were also raised — `.glass` 0.55 → **0.86**, `.glass-bar` 0.72 → **0.9**, `.glass-bar-quiet` 0.55 → **0.8** — because the cross-engine audit found the section-nav pill's labels colliding with the copy behind it, and because the `@supports not (backdrop-filter)` fallback can never fire on engines that *claim* support but don't paint the blur (GPU blocklist, low-power mode, macOS „Reduce transparency"). What may stay glass: the public header bar, the profile section-nav pill, BackToTop.
- **Glass surfaces: `.glass` / `.glass-bar` (+ their `-quiet` states) in globals.css are the ONLY translucent surfaces.** Two edges of one material, each owning background + blur + hairline + shadow in a single class — the host adds only geometry. **`.glass` = floating surfaces inside the page** (pills, popovers, floating toolbars — the profile section-nav pill): white 55% + `blur(16px) saturate(180%)`, border all round, host supplies `rounded-*`. **`.glass-bar` = full-width bars pinned to a viewport edge** (the public header): white 72% + a hotter `blur(20px) saturate(190%)` because a bar covers far more content, **no radius, no box border — a bottom hairline only** (drawn as `inset 0 -1px 0`, so a host `border-*` can't fight it); `.glass-bar-quiet` = the scroll-top state (55% white, faint hairline, no lift), `.glass-quiet` drops the pill's shadow. Never for in-flow cards (`bg-white` + `border-ink-200`), never re-invent `bg-white/xx backdrop-blur-*` in page code, and don't stack `bg-*`/`border-*`/`shadow-*` on them — the rules are unlayered CSS and outrank Tailwind utilities. Blur is layer-promoted (`translateZ(0)` + `will-change` + `backface-visibility`), which is what supersedes the 2026-07-22 "no backdrop-blur on mobile bars" ban **for promoted glass only** — the ban still stands for any un-promoted sticky/fixed bar (BottomNav, workspace top bars stay solid). One-line revert if a device strobes: delete the two `backdrop-filter` lines in `.glass` / `.glass-bar`; the shared `@supports` fallback (0.95 white) takes over. Note both make their element a containing block for `position: fixed` descendants (NotifBell's <640px dropdown anchors to the bar, which is why `top-16` lands flush under it).
- Public header = a **full-bleed glass bar** (2026-07-27, replacing the short-lived floating island): `<header sticky top-0>` → a full-width `glass-bar` div → `<Container className="h-16 sm:h-20 …">` for the nav content. The glass spans edge to edge from y=0; only the content sits in the 1280px column. Height is **exactly 64 / 80** — every sticky offset elsewhere (`top-16`, `sm:top-20`, `lg:top-[80px]`, `scroll-mt-24`) measures off it, so if it drifts, fix the header, not the consumers. The mobile drawer + scrim must stay siblings OUTSIDE the glass div (else the glass becomes their containing block and `h-[100dvh]`/`inset-0` collapse to the bar).
- Empty/error states: compact — icon + one line + one action; never hero-sized. Use components/EmptyState where possible.
- Dates: NEVER `toLocaleDateString('ka-GE', {month/weekday})` — runtime ICU falls back to English. Use `lib/kaDate.ts` (`fmtKaDate/fmtKaTime/fmtKaDateTime`).
- **Server-side, NEVER `getHours()` / `getDay()` / `getMinutes()`** — they read whichever zone the process was started with. Production sets `TZ=Asia/Tbilisi` and local dev sets nothing, so the two disagree and neither throws. Compare wall-clock with `lib/tz → tbilisiParts()`; format with `fmtDateTime(iso, opts, TBILISI)` or `components/workspace/sessionTime`. `lib/kaDate` is machine-zone by design and is for CLIENT rendering only. Shipped bug (2026-08-06): the weekly-package scheduler matched „ორშ 18:00" against the server clock, so on any host without the env var it answered „თავისუფალი დრო არ არის" for a free calendar — and answered a diaspora client about a different hour than the one they tapped. Pinned by `tests/packages.test.ts` §P.
- **A status check you read before the write is not a guard.** Claim the row instead: `updateMany({ where: { id, status: <expected> } })` + `count !== 1 → 409`, the pattern in `app/api/bookings/[id]/cancel`. A read-then-write loses to a second tab, and on `enrollment.markPaid` that meant a re-stamped expiry plus two audit rows for one payment (2026-08-06).

## Product rules
- **Copy is the owner's, and it is PLAIN.** Never author or reword existing site text. When a new surface genuinely needs a string, write the plainest one that works — what any other site would say: „ნომერი არასწორია", not a sentence teaching the format; „ტელეფონის ნომერი", not a headline. No eyebrows on dialogs, no reassurance paragraphs, no explaining the product inside a control. Owner, 2026-08-09: „რთულად და გამოგონილი არ დაწერო."
- Terminology: always „ექსპერტი" (never ტუტორი/რეპეტიტორი in UI). Support email: read `SUPPORT_EMAIL` from `lib/supportEmails.ts` — never type a literal. Temporarily `mcodne.ge@gmail.com` (2026-07-27): the domain still has no MX, so every @mcodne.ge address dropped incoming mail silently. Revert to hi@/privacy@/legal@ once receiving works.
- Lexicon (Georgian-first, UI copy only — never rename code identifiers/API fields): „ჩემი სივრცე" (not „dashboard/დაშბორდი"), „დრო/თავისუფალი დრო" (not „სლოტი"), „დაცული გადახდა/დაცული თანხა" (not „escrow"), „ვიდეოგაცნობა" (not „ვიდეოშესავალი/ვიდეო-ინტრო"), „და" (not „&") inside Georgian strings.
- **Georgian compounds: a borrowed indeclinable prefix takes NO hyphen.** ვიდეოოთახი / ვიდეოკონსულტაცია / ვებგვერდი / ონლაინკურსი — never ვიდეო-ოთახი. There is **no double-vowel-clash exception**: the სასკოლო ორთოგრაფიული ლექსიკონი (nplg.gov.ge/saskolo) carries **ფოტოობიექტივი** solid — ო+ო, the exact shape of ვიდეოოთახი — alongside ვიდეოთამაში/ვიდეორგოლი/ვიდეოკლიპი, ფოტოასლი, მიკროავტობუსი. 18 call sites were hyphenated on a rule that does not exist. The hyphen belongs only to compounds whose first member is a **truncated stem** — ბიზნეს-გეგმა, ბიზნეს-სტრატეგია, ექსპერტ-კონსულტაცია, ქუქი-ფაილი, პროდაქტ-მენეჯერი (the სახლ-მუზეუმი pattern); leave those alone. Enforced by `tests/georgianOrthography.test.ts`, which also pins the terminology above and the `„…“` closer — it lints our own copy, while `tests/georgianText.test.ts` guards what users type in.
- Paid-only model: NO free-trial promises in copy (removed 2026-07). Free things that exist: registration, cancellation ≥24h before, no-show replacement.
- Escrow/payments not yet live — bookings currently free; keep the honest "payments coming soon" notes until integration.
- Trust signals live at decision points: verified/escrow/ID row on profiles, escrow line at checkout, reassurance under booking CTAs.

## Verification habit
- Typecheck: `npx tsc --noEmit -p tsconfig.json` must stay clean.
- Dev server `.next` cache corrupts under heavy editing: if pages render empty with working APIs → `pkill -f "next dev"; rm -rf .next; npm run dev`.
- ⚠️ **Node 26 is not supported by Next 15.5** — `next dev` fails outright and `next build` fails intermittently at "Collecting page data", after types and compilation pass, so it reads as a code error and isn't. **RESOLVED locally 2026-08-01:** node@22 is installed and `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"` is in `~/.zshrc`; `node -v` must read v22.x before `npm run dev`. `npm rebuild sharp bcryptjs` after any Node switch — the native builds are per-version. Railway builds on Node 22 too (`.nvmrc`), so local and prod now match.
- Verify visually with Playwright (`node_modules/.bin/playwright`, chromium installed) at 1440px and 390px before deploying.
- Deploy: `railway up --detach` (project Tutor → service mcodne → https://mcodne.ge); verify live after.

## Pre-deploy gate (added 2026-07-31)
- **`npm run check` before every `railway up`.** Runs `tsc --noEmit` → the 31 `tests/*.test.ts` → `next build`, in ascending cost, ~45s total. `npm test` = the same without the build.
- There is **no CI and no git remote** — production deploys from the WORKING TREE. This script is the only thing that runs the tests; without it they are comments. Two shipped features were already silently broken by a zod ceiling sized for a URL (certificates `max(500)`, blog covers `max(2000)`), both now pinned by tests that only matter if something runs them.
- The 37 `.mjs` files in `tests/` are live-site Playwright harnesses — deliberately NOT in the gate; they need a deployment and a browser.
- Node is pinned in `.nvmrc` (22) and `package.json` `engines` (`>=20 <24`): Next 15.5 fails on Node 26.

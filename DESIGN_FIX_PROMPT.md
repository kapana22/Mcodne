# mcodne.ge — UX/UI Fix Prompt (consultation-marketplace upgrade)

> **როგორ გამოვიყენო:** ეს ფაილი დევს პროექტის root-ში. Claude Code-ს უთხარი:
> „წაიკითხე DESIGN_FIX_PROMPT.md და შეასრულე Phase 0". როცა დაასრულებს და გადაამოწმებ,
> გააგრძელე „შეასრულე Phase 1" და ა.შ. თითო ფაზა ცალკე სესიად/კომიტად ჯობია.
> ყველა ფაზის ბოლოს სავალდებულოა Verification სექციის შესრულება.

---

## CONTEXT (read first)

You are working on mcodne.ge — a Georgian **expert-consultation marketplace** (Next.js 15 App Router + Tailwind + Prisma). This is NOT language tutoring: users buy one-off paid video consultations with vetted experts (ბიზნესი/ფინანსები/კარიერა/მარკეტინგი/სამართალი/ფსიქოლოგია). The correct benchmarks are **Intro.co, Clarity.fm, MentorCruise, Topmate** — not Preply. Read `CLAUDE.md` (the design canon) before touching anything.

What defines consultation-marketplace UX (vs tutoring):
- **Accomplishment headlines, not job titles** — cards lead with compressed proof ("Founder of X, exit $2M", "ex-McKinsey · 30+ საინვესტიციო გარიგება"), pedigree chips secondary.
- **Per-session pricing with explicit duration** ("₾150 · სესია · 30 წთ"), session types as *named products* ("CV Review — 30 წთ"), never bare hourly rates.
- **"N ჩატარებული სესია" + review count + response-time chip** as the demand-proof stats — never "active students".
- **Money-back / replacement guarantee glued to the CTA** — the consultation equivalent of a trial lesson.
- **Mandatory pre-call intake** ("რისი განხილვა გინდა?") as part of booking — helps the expert prepare, sets expectations, doubles as dispute evidence.
- **Escrow narrated in the UI** at the point of payment ("თანხა დაცულია სესიის ჩატარებამდე") — Clarity's authorize-then-settle pattern.
- **Availability surfaced early** ("უახლოესი დრო: დღეს 18:00" / "ნახე დროები") and no dead-end profiles.
- **Outcome-story reviews** (role-attributed, quantified results) over star math — nearly everyone shows 5.0, so liveness and outcomes differentiate.

An audit found the codebase already has an excellent honesty architecture (`PAYMENTS_LIVE` gating, real-data-only stats, bookability truth-chain shared between card/profile/`computeNextFreeStart`, FiraGO + `case`-feature mtavruli, `lib/kaDate`, skeleton-first states, auth-at-point-of-intent with `?rebook=1`). **These are load-bearing. Do not regress any of them.**

**Global rules for every phase:**
- Never fabricate data. If a metric isn't real, don't render it.
- Follow the sizing/color/type canon in CLAUDE.md; when this document conflicts with ad-hoc code, the canon wins.
- Keep all UI copy Georgian, terminology „ექსპერტი".
- After each phase: `npx tsc --noEmit -p tsconfig.json` must be clean; verify visually with Playwright at 1440px and 390px (landing, /tutors, one profile, booking modal open); do not deploy until verified.

---

## PHASE 0 — Broken & dishonest things (benchmark-independent; highest impact, smallest diffs)

### 0.1 Desktop filters are dead — fix reachability of ALL filters at ≥1024px
In `app/tutors/page.tsx`: the „ფილტრები" button in `ResultsBar` renders on all breakpoints, but `FiltersDrawer`'s root is `lg:hidden` — on desktop the button does nothing. Additionally, the min-rating control (4.0/4.5/4.8/4.9) and the full price slider exist ONLY inside the drawer, so desktop users can never filter by rating.
**Fix:** remove `lg:hidden` from the drawer (make it work at every width as a right-side sheet), OR add rating + price-range controls to the desktop `FilterBox` row. Either way: every filter must be reachable at every breakpoint, and the „ფილტრები" button must always open something. Show an active-filter count badge on the button (e.g. „ფილტრები · 3").

### 0.2 Delete every fabricated stat
- `app/tutors/page.tsx` Quick-Book rail hardcodes „პასუხი < 2 სთ" and „დასრულება 98%" for every tutor. Replace with the expert's real `responseHours` / real completion metric; if the real value is missing, render nothing.
- Same file: `FILTER_LANGS` ships fake language counts (`{l:'ქართული', c:142}` …) rendered as real counts in the drawer. Compute counts from the actual result set or drop the numbers.
- `app/page.tsx` testimonials section: invented people with `i.pravatar.cc` stock faces and fabricated outcomes. Remove the section entirely OR replace with real reviews pulled from the existing Reviews system (only if enough real ones exist). No stock-face testimonials, no external avatar CDN. (When real outcome-stories accumulate, this section returns as role-attributed quantified quotes — the Intro.co pattern.)

### 0.3 Stop claiming a pending request is „confirmed"
`QuickBookPopup` step 4 says „დაჯავშნა დადასტურდა" while the booking is actually a request awaiting expert confirmation (the same view says „ექსპერტი დაგიდასტურებს მოთხოვნას").
**Fix:** success state must say the truth — headline „მოთხოვნა გაგზავნილია", sub „ექსპერტი მალე დაადასტურებს — შეტყობინებას მიიღებ". Align the status chip, the booking-detail page copy („ელოდება დადასტურებას") and any toast to this one wording. One state = one truth everywhere. (Intro.co's request-a-booking says it plainly: you're charged only when the expert confirms — that honesty *is* the trust product.)

### 0.4 Fix the timezone lie in QuickBook
`QuickBookPopup` computes slot times with local `Date#getHours()` (viewer's browser tz) but the UI claims „დრო თბილისის ზონაში (GMT+4)" and „დროები თბილისის ცხრილშია" — false for any non-Tbilisi viewer. The profile's `BookingModal` already does it correctly (`TbilisiHint`/`CalendarTzLabel`: „შენს დროზე / შენი ({tz})").
**Fix:** make QuickBook use the exact same tz logic and copy as `BookingModal` (import from `lib/tz.ts`, don't re-implement). Also rewrite the incomprehensible „slot-ი იჯავშნება 5 წუთის შემდეგ" line into plain Georgian stating the actual rule.

### 0.5 Make the expert card's face and name link to the profile
In `TutorCard`: the `<h3>` name is plain text and the desktop photo's only target is the video overlay. The highest-frequency action on a listing — clicking the person — is dead.
**Fix:** wrap photo and name in `<Link href={/tutors/${id}}>`. Keep the video overlay as a separate stopPropagation target on its play icon only. On mobile, make the whole card tappable to the profile except explicit buttons.

### 0.6 Per-expert SEO metadata + SSR for the discovery funnel
`/`, `/tutors`, `/tutors/[id]` are fully `'use client'` with empty SSR seed — crawlers and link unfurls see skeletons, and every shared profile link shows the generic site title. `/categories` already does it right (server component, real `generateMetadata`).
**Fix:**
- `app/tutors/[id]/page.tsx`: split into a server `page.tsx` that fetches the expert via Prisma, exports `generateMetadata` (title: `{name} — {category} | მცოდნე`, description from bio, OG image from avatar) and renders the existing client component with initial data as props.
- `app/tutors/page.tsx`: server-fetch the first page of experts as SSR seed + `generateMetadata`; keep client filtering on top.
- Add `application/ld+json` Person/Service structured data on profiles.
Shared expert profiles are the marketplace's main organic-growth asset.

**Phase 0 verification:** tsc clean; Playwright at 1440/390: (a) desktop „ფილტრები" opens and rating filter works, (b) card name click navigates, (c) QuickBook shows viewer-tz copy, (d) success screen shows „მოთხოვნა გაგზავნილია", (e) `curl -s localhost:3000/tutors/<id> | grep '<title>'` shows the expert's name.

---

## PHASE 1 — Consultation-marketplace UX upgrades (structure & conversion)

### 1.1 One booking flow, not two
`QuickBookPopup` (~680 lines in tutors/page.tsx) and `BookingModal`+`Calendar`+`DayTimeline` (~1100 lines in [id]/page.tsx) are two diverging implementations — they already disagree on tz, calendar shape, and critically **QuickBook ignores `consultations` tiers entirely**, so an expert's multi-tier offerings are only bookable from the profile.
**Fix:** extract ONE shared booking component to `components/booking/`, based on the profile's implementation (the honest one). The listing opens it with the expert preloaded. Delete QuickBookPopup. All „MUST stay in sync" comments become imports.

### 1.2 Session types as named products — the core conversion module
The `consultations` tier system already exists in the data model. Make it the centerpiece, Topmate/MentorCruise-style:
- Profile: a „სერვისები" section where each tier is a card — **название + duration + price** („პირველადი კონსულტაცია · 30 წთ · ₾90", „CV განხილვა · 45 წთ · ₾150"), one-line „რას მიიღებ" description, „პოპულარული" tag on the most-booked real tier. This section (or its summary) belongs in the sticky rail; booking starts from a chosen tier.
- Booking step 1 = choose session type, step 2 = slot, step 3 = intake + confirm.
- Encourage experts (via profile-edit hints, not fake data) to name tiers as outcomes, not durations.

### 1.3 Mandatory intake in booking
Add/upgrade the „რისი განხილვა გინდა?" step: required textarea (with the existing topic chips as starters), framed as „ეს ეხმარება ექსპერტს მოემზადოს". Show the intake text to the expert in the request card and in the booking detail. This is Clarity.fm's core pattern — it raises session quality, sets expectations, and is dispute evidence. Placeholder examples must span all 6 categories, not just startup topics.

### 1.4 Expert card anatomy — credibility-first scanning
Restructure `TutorCard` (desktop) for the consultation scan pattern:
- Top-right stat block: **price large & bold** („₾90" + small muted „სესია · 30 წთ" — from the cheapest/default real tier) with **rating + review count** under it.
- Under the name: verified/SUPER badges (existing) + **pedigree chips** (existing `info` chips — keep, they're the right pattern) — and give the expert-written headline visual priority: it should read as an accomplishment line, not a job title.
- Real-data stats line: „N ჩატარებული სესია · პასუხი ~N სთ" — only render items that are real. Never "active students"-style metrics.
- **Availability on desktop too**: mobile already shows „უახლოესი დღეს 14:00"; desktop shows only an unexplained green dot. Show the same computed next-slot line on desktop (reuse `computeNextFreeStart`).
- CTA row: primary „დაჯავშნა", secondary „მიწერე" (1.5), heart-save (exists). The „პროფილი" button becomes unnecessary once name/photo link (0.5).
- Unify rating precision: ONE formatter (`fmtRating`, `toFixed(1)`) used by card, profile, rail, modal, /ask — currently 4.87 and 4.9 render for the same expert on different surfaces.

### 1.5 Pre-booking contact path
Messaging is currently per-booking only — a prospect cannot ask a question before paying for a ₾100+ session. Clarity/MentorCruise/Topmate all allow pre-purchase contact; for high-stakes one-offs it's the main objection-handler.
**Fix:** add „მიწერე ექსპერტს" on the profile rail and card (auth-gated via the existing AuthPromptSheet at point of intent). Implement as a conversation thread keyed by (student, expert) pair — and migrate chat threading from per-booking to per-pair so multiple bookings with the same expert share one history (bookings reference the thread). If the migration is too large for this phase, ship pre-booking messages with `bookingId: null` and note unification as follow-up. Consider rate-limiting/screening to protect experts.

### 1.6 Availability visible before commitment
The profile has NO visible calendar — availability lives only inside the modal, so users must click „დაჯავშნა" blind. Intro.co's card-level „See Times" and slot-first booking is the reference.
**Fix:** render the shared booking component's week/slots view inline in a „განრიგი" section on the profile (viewer's local tz, honest copy from `lib/tz.ts`); clicking a slot opens the booking sheet with that slot preselected. Add an in-page anchor nav for the long profile (მიმოხილვა · სერვისები · განრიგი · შეფასებები · გამოცდილება) sticking under the top bar. When a calendar is empty: never dead-end — show „მოითხოვე დრო" (request-a-booking: propose times, expert confirms) or at minimum „მიწერე ექსპერტს" + similar experts.

### 1.7 Guarantee glued to the CTA
mcodne's real de-riskers (free cancellation ≥24h, no-show replacement) exist but partially live in FAQ-land. Intro.co states its guarantee in one warm sentence under the button.
**Fix:** under every booking CTA (card sheet, profile rail, mobile bar, confirm step) one consistent line — e.g. „გაუქმება უფასოა სესიამდე 24 სთ-ით ადრე · თუ ექსპერტი არ გამოცხადდა, სესია უფასოდ ჩანაცვლდება" (align exact wording with canon copy; ONE string constant imported everywhere). When `PAYMENTS_LIVE` flips on, the escrow line joins it at the pay step: „თანხა დაცულია სესიის ჩატარებამდე".

### 1.8 Landing hero: fix the label/destination mismatch
`HomeHero` submits to `/ask?q=…` while the button says „ექსპერტის ძიება". Problem-first entry is actually RIGHT for consultation (JustAnswer/ADPList pattern) — but the label and destination must agree, and /ask's canned framing can't carry primary intent yet.
**Fix (pick one, deliberately):** (a) hero routes to `/tutors?q=…`, button stays „ექსპერტის ძიება", and /ask remains a secondary „დასვი კითხვა" entry; or (b) keep /ask as destination but relabel the CTA („მიიღე პასუხი") and make /ask genuinely dynamic (real expert matching, not the hardcoded FEED). Recommend (a) now, (b) later when /ask has real content. Also diversify the hero quick-topics beyond startup jargon so ფსიქოლოგია/სამართალი/ფინანსები visitors recognize themselves — keep the McKinsey/FAANG pedigree line, it's on-positioning, but pair it with non-startup examples.

### 1.9 Result count as the page heading + honest urgency
On `/tutors`, make the live result count the H1 pattern („{N} ექსპერტი შენთვის" / „{N} ექსპერტი · {category}"), updating with filters. Where REAL data supports it, add calendar/booking-derived urgency: „დაჯავშნეს N-ჯერ ბოლო კვირაში", „დარჩა N თავისუფალი დრო ამ კვირას" — derived from completed/real bookings only, hidden otherwise (extend the existing derived-not-fabricated pattern; never fake).

### 1.10 Filters — right-sized for consultation
1. Price becomes a **dual-handle range** (currently floor-only labeled „ფასი / სესია" which reads as a range but isn't).
2. Sort labels without ASCII arrows („რეიტინგი ↓" → „რეიტინგით, კლებადი"), default sort named „ჩვენი რჩევით".
3. Mobile sheet footer: sticky „ნახე {N} ექსპერტი" with live count + „გასუფთავება".
4. CompareModal: let the user pick which experts to compare (checkbox on cards → compare bar), instead of auto-top-3.
5. Availability filter: „თავისუფალია დღეს/ხვალ/ამ კვირას" quick-chips against real schedules (a full day×daypart matrix is tutoring-grade overkill for one-off sessions).

### 1.11 Mobile bottom-layer stacking
On `/tutors/[id]` for a signed-in student, `MobileBookingBar` (z-65) covers `BottomNav` (z-40) while the body still pads 64px for the hidden nav. Add the profile route to BottomNav's focused-screen exclusions (or hide BottomNav whenever `data-mobile-cta` is set) and drop the padding. One bottom layer at a time, ever.

**Phase 1 verification:** tsc clean; Playwright 1440/390 on: card anatomy (price·duration/rating top-right, next-slot line), services section + inline slots on profile, intake step required in booking, pre-booking message flow (auth-gated), hero label/destination agree, dual-range price filter, empty-calendar profile shows request/message fallback, mobile: only one bottom bar on profile. Booking end-to-end through the ONE shared component from both entry points, including a multi-tier expert.

---

## PHASE 2 — Design-system consolidation & polish (debt that keeps causing Phase-0-style bugs)

### 2.1 Adopt the typographic scale (it exists, unused)
`tailwind.config.js` defines `display-lg/display/h1/h2/h3/body/small/caption/eyebrow` — used 0 times, while pages contain 1,018 `text-[Npx]` across 39 distinct sizes. Migrate: map each arbitrary size to the nearest token (extend the scale with at most 2–3 missing tiers if truly needed), file by file, starting with tutors/page.tsx, [id]/page.tsx, page.tsx. Same for `tracking-[…]` (9 ad-hoc values → tokens). Update CLAUDE.md's section-header spec to reference tokens, not raw px. No visual redesign — 1:1 consolidation; screenshot-diff before/after.

### 2.2 One icon system, one footer, one logo
6 files each re-declare a local `Icon = {…}` set (~25–30 inline SVGs, stroke widths drifting 1.6→2.4); 5 files re-implement Logo/VerifiedMark/Footer, and the listing's local footer has already drifted (dead links: ბლოგი/კარიერა/პრესა → /help, კატეგორიები → /tutors instead of /categories, inert language toggle). Consolidate to `components/Icon.tsx`, `components/Footer.tsx`, `components/Logo.tsx`, `components/Avatar.tsx (VerifiedMark)`; fix the dead links; normalize stroke to one family per canon (1.6–2.2).

### 2.3 Decompose the monoliths
tutors/page.tsx (2,285 lines), [id]/page.tsx (2,687), page.tsx (1,060), auth-client.tsx (1,815), student/page.tsx (1,228). Follow the pattern already proven in `app/tutor/_components/`: extract TutorCard, FilterBar, FiltersDrawer, booking components, profile sections, auth views into `app/tutors/_components/`, `app/tutors/[id]/_components/`, `components/booking/`, `app/signin/_components/`. Pure moves — no behavior changes mixed into this step.

### 2.4 Lexicon pass (Georgian-first)
Replace Latin tech jargon in UI copy: „ჩემი dashboard" → „ჩემი სივრცე", „slot" (75 uses) → „დრო/თავისუფალი დრო", user-facing „escrow" → „დაცული გადახდა", „შესვლა & ჯავშანი" → „შესვლა და ჯავშანი". Add the agreed lexicon to CLAUDE.md. (Positioning copy balance is handled in 1.8 — don't strip pedigree language, diversify it.)

### 2.5 Reviews as outcome stories
Upgrade the review prompt to invite outcomes: after a completed session ask „რა შედეგი მიიღე?" alongside stars; display reviewer role/context when available („სტარტაპის დამფუძნებელი"). On profiles, surface 1–2 outcome-rich reviews above the distribution chart. Keep the existing honest distribution caption. Never seed or edit reviews.

### 2.6 Accessibility at decision points
- Every rating render: `aria-label="{X} 5-დან"` on the Stars wrapper; rating-distribution bars get sr-only text.
- Price range input(s): `aria-label`; FilterBox popovers: `aria-expanded`, `aria-haspopup`, focus into popover on open, return focus on close.
- Focus traps in VideoPreview and CompareModal (copy BookingModal's existing trap).
- Decorative inline SVGs get `aria-hidden` (currently 34 of ~200).
- Result count region: `aria-live="polite"`.

### 2.7 CSS & perf hygiene
- Delete the tailwind safelist block (9 palettes × 12 shades × props × variants) — thousands of unused classes shipped to every visitor; replace with the handful of genuinely dynamic classes, written out explicitly.
- Normalize off-canon control sizes: `h-[52px]`/`h-[50px]` search row and the stray `h-10` tier → canon h-11/h-12 ladder (or amend the canon deliberately — pick one).
- `ask/page.tsx`: replace `toLocaleTimeString('ka-GE')` with `lib/kaDate`; delete the 5+ re-declared Georgian month arrays, import from `lib/kaDate`.

**Phase 2 verification:** tsc clean; Playwright screenshot-diff of landing, /tutors, profile at 1440/390 vs pre-phase screenshots — visually identical except intended lexicon changes; `.next` CSS size before/after safelist removal (expect a meaningful drop); axe-core (or Playwright a11y snapshot) on /tutors and profile — zero critical violations.

---

## Out of scope (do NOT attempt without explicit ask)
Payments/escrow go-live, realtime chat transport (15s polling stays), redesigning /ask beyond the routing fix, admin surfaces, changing the brand palette or FiraGO type system, license-verification flows for regulated categories (სამართალი/ფსიქოლოგია — flag as roadmap item only).

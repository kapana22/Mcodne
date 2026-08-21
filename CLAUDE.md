# mcodne.ge — the canon

Georgian expert marketplace (Next.js 15 + Tailwind + Prisma). UI is Georgian.
**Every surface follows this file — public, auth, client, provider, admin alike.**

> ## How to read this file
>
> **Two kinds of statement live here and they do NOT carry the same weight.**
> Before 2026-08-20 they were written in one voice, and the effect was that a
> decision taken on a Tuesday read like a law — which is how a canon stops
> informing and starts caging. Owner: „არ შემზღუდოს რამეში, როგორც დიზაინში
> ასევე ყველაფერში."
>
> **🔒 ABSOLUTE** — do not re-litigate. Accessibility contracts, contrast
> arithmetic, correctness patterns, privacy, „never invent a number". These are
> not taste and a new idea does not get to override them.
>
> **📌 CURRENT** — true today, decided for a reason, and **open**. Bring a better
> idea and the owner decides. If you change one, change the line here too.
> Everything not marked 🔒 is 📌.
>
> ⚠️ **A MEASUREMENT IS A DATE, NOT A FACT.** Every number below was true when it
> was written. Three were stale within a fortnight („4 service groups" had become
> 8; „6 masters" 2; „84 tests" 97). **Re-measure before you reason from one** —
> `npm run map`, a `count()`, `ls`. Never quote a number from this file into new
> work without checking it.
>
> ⚠️ **THIS FILE IS LOADED INTO EVERY TURN.** On 2026-08-20 it was 65 KB ≈ 20 800
> tokens spent before reading a single line of the actual task. Nothing was
> deleted — the RULES stayed here and the REASONING moved next to them:
> **`docs/product-model.md`** (the model's history, owner quotes, the full screen
> map) and **`docs/design-system.md`** (the full design canon).
> Keep it that way: a rule that is broken by accident belongs here; the story of
> why it exists belongs in `docs/`. The pre-split backup was deleted on
> 2026-08-21 — a third copy of the same text can only drift.
>
> ⚠️ **NOTHING IN `docs/archive/` IS CURRENT.** Finished audits, kept for their
> reasoning. Never quote a number out of one.

---

## 1. THE PRODUCT MODEL — READ BEFORE ANYTHING ELSE

Owner, 2026-08-20, after catching the same mistake five times in one afternoon:
„მინდა რომ კონსულტაციამ უკანა პლანზე გადაიწიოს და სერვისი გავუყიდოთ ექსპერტებს."

1. **The site sells SERVICES.** That is the product. Full stop.
2. **A consultation is a PRE-STEP to buying one** — offered small, on the card,
   over the chat or the video call that already exists. Not a second product,
   not a headline, not a button of its own.
3. **The pitch to a provider is CLIENTS FOR THEIR SERVICE**, never „share your
   knowledge". They set the price.
4. **WHEREVER BOTH APPEAR, THE SERVICE COMES FIRST** — sentence, filter, rail,
   list, example, meta description. This is the rule broken by accident, not by
   decision: read your own sentence back and check which half arrives first.
5. **One catalogue, one card, one namespace.** The type belongs to what is
   OFFERED, never to what kind of person somebody is.
6. **Retired words:** „ხელოსანი" · „მასწავლებელი" as a label · „სფერო" ·
   „ტუტორი" · „მასტერი" · „სპეციალისტი" as a role word · „რეპეტიტორი" ·
   „სტუდენტი" (→ კლიენტი) · „ვერიფიცირებული" (→ გადამოწმებული) ·
   „ღირებულება" (→ ფასი) · „დამკვეთი" (→ კლიენტი). A profession NAME
   („IT სპეციალისტი", „ინგლისურის მასწავლებელი") is fine — the ban is on the
   ROLE word. Pinned by `tests/lexicon.test.ts`.
7. **Tbilisi only, for now** — `CITIES` in `lib/requestTopics`.

**Three things that must not come back:** a „კონსულტაცია/სერვისი" primary axis
(switcher, nav item, first filter, badge on a name); two catalogues; the word
„ხელოსანი".

**An addressed request goes to ONE person (2026-08-20).** `?to=<slug>` writes an
INVITED offer AND `offerLimit: 1`; the queue shows „anything with room, plus what
was addressed to me"; only the client's own button raises it back to 3. Nothing
automatic ever widens it.

**Two leftovers to watch:**
- 📌 **The taxonomy still leans consulting** — re-measured 2026-08-20:
  **8 service groups / 40 topics** against **16 consultation / 77** (it was
  4/21 vs 23/132 a fortnight ago, so this is moving). The rail sorts by count.
  Copy cannot fix it; growing `lib/requestTopics` can.
- **The product-defining copy lives in the `SiteText` DB table** and overrides
  `lib/siteTextDefs`, so no test can see it. Change the default AND the row, and
  scan the live values.

→ Full model, every owner quote, the schema reality: **`docs/product-model.md`**

---

## 2. WHERE THINGS LIVE

**Every big screen is a container plus `_*.tsx` siblings in its own folder.
Open the part, not the page** — the container holds only state, fetch and layout.

| screen | where |
| --- | --- |
| `/` home | `app/HomeClient.tsx` + `app/_home/` |
| public header / footer | `components/PublicTopBar.tsx`, `components/Footer.tsx` |
| **the catalogue** — ONE list, ONE address | `app/experts/client.tsx` + `_card` `_masterCard` `_data` `_masterData` `_filters` `_results` + `lib/catalogItems.ts` |
| **`/experts/[slug]`** — the ONE namespace, 4 pages share it | `app/experts/[slug]/page.tsx` resolves: profession landing → trade landing → expert profile → provider profile → 404 |
| `/join` — one door, one question | `app/join/page.tsx` + `JoinClient` + `_door/` + `_expert/` + `_master/` |
| `/signin` + `/signup` | `app/signin/auth-client.tsx` + `_*` |
| the two spaces | `app/me/` = the client's · `app/work/` = the supply side's |
| `/work` — the shared home | `app/work/page.tsx` (outside both route groups, own gate) |
| the intake | `app/request/` (`_model` is the leaf) |
| the provider workspace | `app/work/(provider)/` — requests · offers · service-profile |
| `/admin` | `app/admin/page.tsx` + one `_<tab>.tsx` per tab + `_parts.tsx` |
| retired URLs | `/tutors` `/masters` `/services` `/categories` `/apply` `/konsultacia` `/student` `/tutor` `/provider` → 308, all pinned in `tests/redirects.test.ts` |

**Three rules this shape depends on:**
- **The model is a leaf.** Each folder's `_model`/`_data`/`_form` imports no
  sibling. A cycle means model code was left in a UI file — move it, don't add
  an import.
- **Never split a component to shrink a file.** `BookingFlow` (1 172L) and the
  big workspace pages are ONE component each; splitting needs ~40 props.
- **Tests read screens as SOURCE TEXT** (~10 of them) — they must read the whole
  route DIRECTORY, never one filename, or a negative assertion passes vacuously.

**Seven page archetypes, and an eighth is forbidden:** marketing landing ·
catalogue · profile · intake wizard · workspace · form/detail · admin tab.
Pinned by `tests/archetypes.test.ts`.

→ Per-screen notes and why each folder looks that way: **`docs/product-model.md`**

---

## 3. DESIGN

🔒 marks the four that are arithmetic or an accessibility contract — those are
closed. The rest are 📌: they are the system as it stands, and a better idea is
welcome; change the token, not the call site, and say so here.

Each line is the rule. The measurements and the history are in
**`docs/design-system.md`**; `lib/design/README.md` maps every "change it once"
lever with file:line pointers.

- **Two colours only.** Brand green `#2F9C86` used with restraint + the neutral
  `ink` ramp. **No blue.** Semantic warning/danger only at the point of meaning.
  No status dots, no decorative arrows, no ad-hoc hex.
- 🔒 **A filled brand surface is `brand-600`**, never `brand-500` (white on 500 =
  3.38, fails AA). **Never translucent white text on a coloured fill.**
- **Never hand-write `text-[Npx]`** — write the token from the ramp in
  `tailwind.config.js`. Reading text never below `text-meta` (12px); `text-micro`
  (11px) only on uppercase+tracked labels. Between steps, round UP.
- **Never hand-write `duration-[Nms]` or a raw `cubic-bezier()`.** Three
  durations: `duration-fast` 140 (default) · `duration-mid` 220 ·
  `duration-slow` 360. Two curves; `ease-out-expo` is entrances only.
  🔒 **`motion-safe:` is MANDATORY on every `animate-*`** — an accessibility
  contract, not a preference. The animation library is CLOSED at 8 tokens.
- **Never hand-write `z-[N]` above 40** — the scale is in `tailwind.config.js`.
- **A control's label size follows its height:** `h-9→text-small` ·
  `h-11→text-body` · `h-12→text-body-lg`. Fix at the source, never via
  `className` (two fontSize utilities resolve by emit order).
- **Control heights are `h-9` / `h-11` / `h-12`.** Nothing between or above.
  Anything TAPPABLE is ≥40px. Icon buttons 40×40 or 36×36.
- **Prefer the primitives**: `Btn` `Card` `Eyebrow` `PageHeader` `Container`
  `EmptyState` `Sheet` `Icon`. Never a page-local icon set.
- **Glass is for surfaces you look PAST, never READ** — `.glass` / `.glass-bar`
  in globals.css are the only translucent surfaces; never re-invent
  `bg-white/xx backdrop-blur-*`.
- Empty/error states are compact — icon + one line + one action.
- 🔒 **Dates: never `toLocaleDateString('ka-GE', …)`** (runtime ICU falls back to
  English) — use `lib/kaDate`. **Server-side never `getHours()`/`getDay()`** —
  use `lib/tz → tbilisiParts()`.
- **Copy is the owner's and it is PLAIN.** Never author or reword site text.
  A borrowed indeclinable prefix takes NO hyphen (ვიდეოოთახი, ვებგვერდი);
  only a truncated stem does (ბიზნეს-გეგმა). Pinned by
  `tests/georgianOrthography.test.ts`.
- 🔒 **A status check you read before the write is not a guard.** Claim the row:
  `updateMany({ where: { id, status: <expected> } })` + `count !== 1 → 409`.

---

## 4. FINDING THINGS — LOOK HERE FIRST

**`docs/MAP.md` is a generated index. One grep answers both questions that
otherwise cost a round trip of guessing:**

```
grep '| `primaryPriceLabel` |' docs/MAP.md     → components/booking/slots.ts
grep '^\*\*RequestOffer\*\*'   docs/MAP.md     → its real column names
```

- **1 515 exported symbols → their file.** `lib/` is 126 files flat and the
  request family alone is 13 whose names differ by a suffix — `requestsViewer`
  is in `requestsServer.ts`, not `requests.ts`, and that is not guessable.
- **37 Prisma models → their real fields.** The UI word is not the column: a
  Booking's price is `price`, a RequestOffer's is `priceGel`; `ServiceProfile`
  has no `visible` and `Category` has no `hidden`. Four queries failed on
  guesses in one session before this existed.

**Regenerate after adding or moving an export: `npm run map`.** It is DERIVED —
never hand-edit it. A stale hand-written map is worse than none, because it is
believed.

---

## 5. HOW TO WORK HERE

- **Node 22.** `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"` — Next 15.5
  fails on Node 26 in ways that read as code errors. `npm rebuild sharp bcryptjs`
  after any Node switch.
- **`npx tsc --noEmit` must stay clean.** During work run that, or one test file
  (`npx tsx tests/<file>.test.ts`) — not the whole gate after every edit.
- ⚠️ **`npm run check` and `npm run dev` share `.next`.** Running the gate while
  a dev server is up corrupts that server: pages render unstyled, manifests go
  missing, routes 500. It reads as a product bug and is not one. Stop dev first.
- ⚠️ **Keep the project OFF an iCloud-synced folder.** It lived in `~/Desktop`
  until 2026-08-20; iCloud raced the build over `.next`'s thousands of files and
  produced `ENOENT: rename '.next/export/500.html'` after a clean compile, plus a
  day of phantom 500s.
- **Verify visually with Playwright at 1440 and 390** before deploying. The
  admin panel selects its tab from the **hash** (`/admin#requests`), never `?tab=`.
- **Pre-deploy gate: `npm run check` before every `railway up`** — types → all
  `tests/*.test.ts` → `next build`. There is no CI, and although a remote exists
  (`origin` → github.com/kapana22/Mcodne — the line here said otherwise until
  2026-08-21) **nothing deploys from it**: `railway up` uploads the WORKING
  TREE, so this script is the only thing that ever runs the tests, and a commit
  is a record rather than a release.
- **Deploy:** `railway up --detach` (project Tutor → service mcodne →
  https://mcodne.ge). Verify live after.
- **DB changes are hand-written SQL** in `prisma/manual-migrations/<date>-<name>/`
  with an `up.sql`, a `down.sql` and guards that fail loudly. Additive DDL only;
  an enum is never renamed.

## 6. WHAT A TEST MAY PIN — 📌 (added 2026-08-21)

**Measured that day: 1 506 of 3 169 assertions were a regex over SOURCE TEXT,
not over behaviour.** They are why an ordinary refactor fails the gate while
nothing a user can see has changed, and owner: „ძალიან მკაცრად არის კოდი
დაწერილი."

**The test:** *if this assertion fails, has a person been harmed?* If a rename,
a reformat or a restyle can break it while the screen is identical, it is
pinning the wrong thing.

- **Pin behaviour.** Call the function, render the tree, execute the redirect
  table. `tests/redirects.test.ts` and `tests/designTokens.test.ts` are the
  models: one runs the table, the other computes the contrast.
- **Pin an architectural fact** — that a screen imports the shared shell, that a
  dark feature is still dark, that a leaf imports no sibling. These are real and
  invisible to types.
- **NEVER pin a Tailwind VALUE.** `w-10 h-10` vs `size-10` are the same 40px
  floor; write the contract (`/(w-10 h-10|size-10)/`), never one spelling. The
  colour, type, motion and z rules are already arithmetic in `designTokens`.
- **NEVER pin a whole source statement verbatim.** 233 of them exist and are now
  whitespace-tolerant (`\s+`), which survives a reformat and NOT a rename —
  they are debt, not a pattern to copy. Replacing one with a behavioural
  assertion is always an improvement; adding another is not.
- **Georgian copy:** pin it only where the WORD is the rule (`lexicon`,
  `georgianOrthography`). Everywhere else the owner edits copy in `SiteText` and
  a pinned string makes the test wrong, not the page.

# mcodne.ge

Georgian services marketplace. Next.js 15 · React 19 · Tailwind · Prisma · Postgres.
UI is Georgian. Rewritten 2026-08-21; the product section rewritten 2026-08-24,
when consultations were removed.

> ### Why this file was rewritten
>
> Owner: „რატომ უნდა იყოს ისეთი წესები, რაც მიშლის მუშაობაში" — and before that,
> „წესები წაშალე და ახლიდან დაწერე, მასშტაბურად იცვლება საიტი."
>
> The previous version had grown into a body of law. It was accurate and it was
> in the way: in a single session it was quoted back at the owner as the reason
> NOT to do something they had asked for — most plainly „Additive DDL only" as
> grounds for keeping a dead column they wanted gone.
>
> **A rule that blocks the owner's work is a bug in the rule.** So this file no
> longer legislates. Nearly all of it is DESCRIPTION — how the thing works today,
> written down so nobody has to rediscover it. Change any of it; change the line
> too.
>
> The list under **Things that protect a person** is different, and it is short
> on purpose: each one exists because breaking it hurts somebody — a reader who
> cannot see the text, a client whose phone number leaks, two providers promised
> the same job. Those are not taste. Everything else is.
>
> Numbers here were measured on 2026-08-21 and they rot. `npm run map`, a
> `count()`, an `ls` — re-measure before reasoning from one.

---

## The product

**The site sells SERVICES. There is nothing else.** Owner, 2026-08-24: „მინდა რომ
მცოდნეზე კონსულტაციები საერთოდ ამოვიღოთ და მოვარგოთ სერვისებზე რაც ჩანაფიქრში
იყო." A consultation used to be a second product with its own table, catalogue,
booking calendar, video room and chat; it is gone, and „შეხვედრა" is now simply
one KIND of request somebody can file.

**Nothing is bought by clicking a price.** A client describes what they need,
providers write offers, one is accepted, the work is marked done. That is the
whole commerce model — `ServiceRequest → RequestOffer → RequestMessage`, with a
credits ledger behind it. There is no booking, no slot, no calendar, no session.

**One provider, one catalogue, one card, one namespace.** A provider is somebody
with a `ServiceProfile` AND an active `RequestAccess` row — ask
`lib/identity → identityOf`, which answers in one read. The old CONSULT/WORK
capability pair is gone with the second product it distinguished.

**The four request kinds** — `LEARNING`, `MEETING`, `PROJECT`, `SERVICE`
(`lib/requestTopics`). „შეხვედრა" is what „კონსულტაცია" became, and it kept its
own kind rather than folding into PROJECT because PROJECT carries a 500₾ floor
that would refuse every professional request.

**Words that were retired**, pinned by `tests/lexicon.test.ts`: ხელოსანი ·
მასწავლებელი *as a label* · სფერო · ტუტორი · მასტერი · სპეციალისტი *as a role
word* · რეპეტიტორი · სტუდენტი (→ კლიენტი) · ვერიფიცირებული (→ გადამოწმებული) ·
ღირებულება (→ ფასი) · დამკვეთი (→ კლიენტი). A profession NAME („IT
სპეციალისტი") is fine — the ban is on the role word.

**Tbilisi only, for now** — `CITIES` in `lib/requestTopics`.

**The word „კონსულტაცია" is NOT banned, and this is a real distinction.** As a
PRODUCT MECHANIC it is gone — no screen offers one, no column stores one. As a
thing a person searches for („იურიდიული კონსულტაცია"), it is what Georgians
actually type, and it is still all over `lib/categorySeo` and
`lib/professionSeo` on purpose. That copy is the owner's; do not tidy it.

### Who is who — two registrations, and they must not blur

Owner, 2026-08-21: „ორი რეგისტრაცია მაგიტომ არსებობს, რომ ერთი არის ვინც სერვისს
ამატებს, ერთი არის კლიენტი, უბრალო მომხმარებელი, და არ უნდა აირიოს. და მკაცრად
უნდა იყოს გაწერილი ვინ ვინ არის."

**A PROVIDER sells.** They registered through `/join`, they have a
`ServiceProfile` and an active `RequestAccess` row, and `/work` is their room.

**A CLIENT buys.** They registered through `/signup`, they sell nothing, and
`/me` is their room.

**`Role` finally answers the question** — `USER` · `PROVIDER` · `ADMIN`, since
2026-08-24. It used to be `STUDENT` / `TUTOR` / `ADMIN` with no provider value,
so somebody selling services was stored under the same word as somebody who had
only ever bought, and no guard could tell them apart. Both dead values are gone
from the enum, not merely unused.

**Still ask `identityOf`, not `role`, for „what does this person sell".** A role
is a permission; a profile plus an allowlist row is the fact.
`lib/identity → identityOf(userId)` returns `{ role, hats, provider }` from one
query, and `provider` is the boolean every supply-side surface gates on. A role
alone cannot tell you whether a granted PROVIDER has finished registering.

**A provider's menu is about selling.** The client room is offered only when they
have actually been a client — bought, saved or asked for something (`clientRoom`
on `/api/me`). 27 of 29 providers had an entirely empty one, and a door into an
empty room beside a real workspace is what mixed the two identities on screen.
Pinned by `tests/spaceSeparation.test.ts`.

**The copy is the owner's.** Don't author or reword site text. Much of it lives
in the `SiteText` table and overrides `lib/siteTextDefs`, so no test can see it:
change the default AND the row. A key whose surface was deleted is marked
`retired: true`, never removed — a production row may hold copy typed under it.

→ history, owner quotes, the full screen map: **`docs/product-model.md`**

---

## Things that protect a person

Six. Each breaks something for somebody real; none is a preference.

1. **`motion-safe:` on every `animate-*`.** Vestibular disorders. The browser
   already knows the answer and we only have to ask.
2. **A filled brand surface is `brand-600`, never `brand-500`.** White on 500
   measures 3.38 and fails AA. `tests/designTokens.test.ts` computes that rather
   than trusting this sentence.
3. **Anything tappable is ≥40px** — however it is spelled: `w-10 h-10`,
   `size-10`, padding around a glyph.
4. **Claim the row, don't check it.**
   `updateMany({ where: { id, status: <expected> } })` then `count !== 1 → 409`.
   A status read before the write is not a guard: two tabs both read VERIFIED and
   the client promises one job to two people, each of whom now has their phone
   number.
5. **The public reference is a credential.** `MC-` + 5 characters is 25 bits and
   it opens a page carrying a phone number. Never print it into a provider's mail
   or notification; `lib/refGuard` counts wrong guesses.
6. **Never invent a number.** No made-up ratings, counts, response times, no
   „500+ experts". If it was not measured it does not go on the page.

Dates need `lib/kaDate` (runtime ICU falls back to English) and server-side time
needs `lib/tz → tbilisiParts()`. Not moral — just wrong otherwise.

---

## Where things live

424 files, ~71 500 lines across `app/`, `components/`, `lib/` (re-measured
2026-08-30; it was 446/~72 000 on 2026-08-25, after the consultation removal
took roughly a third of it). Big screens are a container plus `_*.tsx` siblings
in their own folder — **open the part, not the page**.

| | |
| --- | --- |
| home | `app/HomeClient.tsx` + `app/_home/` |
| the catalogue — one list, one address | `app/experts/` + `lib/catalogItems.ts` |
| `/experts/[slug]` — one namespace: profession → trade → provider | `app/experts/[slug]/page.tsx` |
| the door — one question, one form | `app/join/` — `_door/` `_master/` `_shared/` |
| the two spaces | `app/me/` (client) · `app/work/` (supply) |
| what a provider sells | `app/work/services/` |
| the intake | `app/request/` |
| admin | `app/admin/` — one `_<tab>.tsx` per tab |
| retired URLs → 308 | `middleware.ts`, executed by `tests/redirects.test.ts` |

**`docs/MAP.md` is generated — grep it, never read it whole.** 1 043 exported
symbols → their file; 30 Prisma models → their real columns. `lib/` is 103 files
flat and the request family alone is 13 whose names differ by a suffix —
`requestsViewer` lives in `requestsServer.ts`, which is not guessable. The UI word
is rarely the column: a RequestOffer's price is `priceGel`, a ServiceProfile's
floor is `priceFrom`. Regenerate with `npm run map` after adding or moving an
export.

```
grep '| `identityOf` |'      docs/MAP.md
grep '^\*\*RequestOffer\*\*' docs/MAP.md
```

---

## How to work here

**Node 22.** `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`. Next 15.5 fails
on Node 26 in ways that read as code errors.

**While working:** `npx tsc --noEmit` (~2s), or one test file
(`npx tsx tests/<file>.test.ts`). Not the whole gate after every edit.

**Before deploying:** `npm run check` — types → schema → 79 tests → `next build`.
There is no CI, and `railway up` uploads the WORKING TREE, so this script is the
only thing that ever runs the tests and a commit is a record rather than a
release.

**Deploy:** `railway up --detach` (project Tutor → service mcodne → mcodne.ge),
then verify live.

**Three things that cost an afternoon if you don't know them:**
- `npm run check` and `npm run dev` share `.next`, and two `next build`s fight
  over it. The symptoms read as product bugs — unstyled pages, missing
  manifests, `PageNotFoundError` on an API route. Stop the other one,
  `rm -rf .next`, retry.
- Keep the project off an iCloud-synced folder.
- ⚠️ **`tsc` DOES NOT CATCH A STALE PRISMA SELECT.** It looks like it must —
  the generated client types every field — and measured on 2026-08-26 it does
  not: a select carrying ONE unknown key stops the rest of that literal being
  checked and the whole call passes. Two queries had been throwing in
  production for two days with a green gate: `/api/admin/categories` (a column
  the services-only migration dropped) and `routableProviders()` in
  `lib/requestJobs` (a relation to a dropped table) — the second one is the
  query that decides who is mailed about a new request, so nobody was.
  `tests/schemaDrift.test.ts` reads the migrations and the schema and checks
  the selects; run the query if you want certainty.

**The database.** Schema deltas are hand-written SQL in
`prisma/manual-migrations/<date>-<name>/` with an `up.sql`, a `down.sql` and
guards that fail loudly. `lib/dbBoot` applies them at first request and stamps
the set with a hash of its own source, so a warm boot costs two round trips
instead of one per statement — edit that file and the next boot legitimately
re-runs once.

⚠️ **`lib/dbBoot` throws the whole boot on one failed statement**, so it holds no
DDL that names a dropped table. The 2026-08-24 services-only migration sits LAST
in `runMigrations()` and everything above it assumes the old tables still exist
on a database that has never been migrated; insert before it and the next boot
dies on „relation TutorProfile does not exist".

Prefer additive DDL, and **that is advice, not a prohibition.** Dropping a
`NOT NULL` column just has an order: drop the constraint, deploy the code that
stops writing it, then drop the column. The hazard is the sequence and it has a
known answer — it was never a reason to keep dead columns.

**Testing.** 79 files, no runner, each exits non-zero on failure. Pin
BEHAVIOUR: call the function, render the tree, execute the redirect table. A
regex over source text is a last resort, and ~1 500 of them exist — debt, not a
pattern to copy. If an assertion can break on a rename, a reformat or a restyle
while the screen is identical, it is pinning the wrong thing. Deleting one that
outlived its reason is fine; say so in the commit.

**Design.** Two colours — brand green `#2F9C86` and the neutral `ink` ramp, no
blue. Tokens live in `tailwind.config.js`: the type ramp, three durations, two
curves, the z-scale, control heights `h-9`/`h-11`/`h-12`. Reach for the
primitives (`Btn` `Card` `Eyebrow` `PageHeader` `Container` `EmptyState` `Sheet`
`Icon`) before writing a new one, and change the token rather than the call site.
When the owner ships a design canvas, that is the newer decision — port it and
update whatever test pinned the older one.
→ the full canon and its measurements: **`docs/design-system.md`**

**Dark features.** `PAYMENTS_LIVE` · `FEATURE_ABROAD` · `B2B_VISIBILITY` are off
in `lib/flags.ts`. (`FEATURE_PAYMENTS_V2` and `FEATURE_REQUEST_BOOKING` were on
this list until 2026-08-26 and neither had a single importer — the first had no
wallet behind it and the second described a booking. A dark feature is one whose
code is reachable; a switch with no reader is the thing the paragraph below
warns about, and this file was naming two of them as examples of the opposite.) Their code and copy stay reachable so
the flag can simply be turned on. A dark feature is not a deleted one — and the
converse matters too: `PACKAGES_VISIBILITY` was removed on 2026-08-24 rather
than left switched off, because a spent lesson WAS a booking and there is
nothing behind the switch any more. A flag with no reader is a control that
lies.

**`docs/archive/` is history.** Nothing in it is current; never quote a number
out of it.

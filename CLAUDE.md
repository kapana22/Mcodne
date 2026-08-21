# mcodne.ge

Georgian services marketplace. Next.js 15 · React 19 · Tailwind · Prisma · Postgres.
UI is Georgian. Rewritten 2026-08-21.

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

**The site sells SERVICES.** A consultation is one KIND of service — the one with
a fixed price and a bookable time. It is a step somebody takes before buying the
bigger thing, offered small: on the card, in the thread, over the video room that
already exists. Not a second product, not a headline, not its own button.

**Where both appear, the service comes first** — sentence, list, filter, rail,
example. This gets broken by writing naturally rather than by deciding wrongly,
so read your own sentence back and check which half arrives first.

**One provider, one catalogue, one card, one namespace.** `lib/capabilities`
holds CONSULT and WORK; a person switches the second on from the same account.
The type belongs to what is OFFERED, never to what kind of person somebody is.

**Words that were retired**, pinned by `tests/lexicon.test.ts`: ხელოსანი ·
მასწავლებელი *as a label* · სფერო · ტუტორი · მასტერი · სპეციალისტი *as a role
word* · რეპეტიტორი · სტუდენტი (→ კლიენტი) · ვერიფიცირებული (→ გადამოწმებული) ·
ღირებულება (→ ფასი) · დამკვეთი (→ კლიენტი). A profession NAME („IT
სპეციალისტი") is fine — the ban is on the role word.

**Tbilisi only, for now** — `CITIES` in `lib/requestTopics`.

**The copy is the owner's.** Don't author or reword site text. Much of it lives
in the `SiteText` table and overrides `lib/siteTextDefs`, so no test can see it:
change the default AND the row.

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

585 files, ~105 000 lines across `app/`, `components/`, `lib/`. Big screens are a
container plus `_*.tsx` siblings in their own folder — **open the part, not the
page**.

| | |
| --- | --- |
| home | `app/HomeClient.tsx` + `app/_home/` |
| the catalogue — one list, one address | `app/experts/` + `lib/catalogItems.ts` |
| `/experts/[slug]` — one namespace, four pages resolve through it | `app/experts/[slug]/page.tsx` |
| the door | `app/join/` — `_door/` `_expert/` `_master/` |
| the two spaces | `app/me/` (client) · `app/work/` (supply) |
| what a provider sells | `app/work/services/` |
| the intake | `app/request/` |
| admin | `app/admin/` — one `_<tab>.tsx` per tab |
| retired URLs → 308 | `middleware.ts`, executed by `tests/redirects.test.ts` |

**`docs/MAP.md` is generated — grep it, never read it whole.** 1 528 exported
symbols → their file; 40 Prisma models → their real columns. `lib/` is 129 files
flat and the request family alone is 13 whose names differ by a suffix —
`requestsViewer` lives in `requestsServer.ts`, which is not guessable. The UI word
is rarely the column: a Booking's price is `price`, a RequestOffer's is
`priceGel`. Regenerate with `npm run map` after adding or moving an export.

```
grep '| `primaryPriceLabel` |' docs/MAP.md
grep '^\*\*RequestOffer\*\*'   docs/MAP.md
```

---

## How to work here

**Node 22.** `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`. Next 15.5 fails
on Node 26 in ways that read as code errors.

**While working:** `npx tsc --noEmit` (~2s), or one test file
(`npx tsx tests/<file>.test.ts`). Not the whole gate after every edit.

**Before deploying:** `npm run check` — types → schema → 101 tests → `next build`.
There is no CI, and `railway up` uploads the WORKING TREE, so this script is the
only thing that ever runs the tests and a commit is a record rather than a
release.

**Deploy:** `railway up --detach` (project Tutor → service mcodne → mcodne.ge),
then verify live.

**Two things that cost an afternoon if you don't know them:**
- `npm run check` and `npm run dev` share `.next`, and two `next build`s fight
  over it. The symptoms read as product bugs — unstyled pages, missing
  manifests, `PageNotFoundError` on an API route. Stop the other one,
  `rm -rf .next`, retry.
- Keep the project off an iCloud-synced folder.

**The database.** Schema deltas are hand-written SQL in
`prisma/manual-migrations/<date>-<name>/` with an `up.sql`, a `down.sql` and
guards that fail loudly. `lib/dbBoot` applies them at first request and stamps
the set with a hash of its own source, so a warm boot costs two round trips
instead of 166 — edit that file and the next boot legitimately re-runs once.

Prefer additive DDL, and **that is advice, not a prohibition.** Dropping a
`NOT NULL` column just has an order: drop the constraint, deploy the code that
stops writing it, then drop the column. The hazard is the sequence and it has a
known answer — it was never a reason to keep dead columns.

**Testing.** 101 files, no runner, each exits non-zero on failure. Pin
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

**Dark features.** `FEATURE_PAYMENTS_V2` · `PAYMENTS_LIVE` ·
`FEATURE_REQUEST_BOOKING` · `FEATURE_ABROAD` · `PACKAGES_VISIBILITY` ·
`B2B_VISIBILITY` are off in `lib/flags.ts`. Their code and copy stay reachable so
the flag can simply be turned on. A dark feature is not a deleted one.

**`docs/archive/` is history.** Nothing in it is current; never quote a number
out of it.

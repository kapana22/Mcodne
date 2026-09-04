# mcodne.ge

Georgian services marketplace. Next.js 15 · React 19 · Tailwind · Prisma · Postgres.
UI is Georgian.

> **This file describes; it does not legislate.** Owner: „რატომ უნდა იყოს ისეთი
> წესები, რაც მიშლის მუშაობაში" — **a rule that blocks the owner's work is a bug
> in the rule.** Change any of it; change the line too.
>
> The one exception is **Things that protect a person**: each item there breaks
> something for somebody real. Everything else is taste.
>
> Every number here rots. `npm run map`, a `count()`, an `ls` — re-measure before
> reasoning from one.

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
`lib/identity → identityOf`, which answers in one read.

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

**`Role` is `USER` · `PROVIDER` · `ADMIN`** since 2026-08-24. The old
`STUDENT` / `TUTOR` values are gone from the enum, not merely unused.

**A THIRD DOOR: a number and an SMS code, with no password (2026-09-04).** Owner:
„მე მინდა დავამატოთ მობილურით რეგისტრაცია." `/signup` and `/signin` both carry
it beside Google; three steps — the number, the code, and the name only if no
account came back. Registration and sign-in are ONE flow on purpose: a form that
answered „this number already has an account" would hand a stranger a fact about
somebody else for the price of nine digits.

⚠️ **So `User.email` and `User.passwordHash` are NULLABLE, and neither is ever
faked.** A synthetic address is a row the mailer then tries to deliver to. Every
read handles null — `tsc` finds them — and a passwordless account sets its first
password without typing a current one (`/api/me/password`).

⚠️ **`User.phone` is now a CREDENTIAL, stored canonical.** One spelling —
`lib/phone → canonicalPhone`, „+995555123456" — because the same number used to
be storable three ways, which is what `lib/sms → phoneVariants` exists to paper
over and what no unique index can see through. The uniqueness is PARTIAL, on
`phoneVerified = true` only: a number typed into a profile field is contact
information two people may honestly share (two production pairs do), and a
number somebody answered a code on is an identity that they cannot. Editing the
phone on `/api/me` clears `phoneVerified`. The whole lifecycle is
`lib/phoneAuth`; the code is stored hashed and five wrong guesses burn the row.

**A provider's card is visible only when it is finished (2026-09-04).** Owner:
„სანამ სრულად არ შევსებს, ფოტოს არ დადებს, იქამდე არ გამოჩნდეს პროფილზე."
`ServiceProfile.published` is now DERIVED, not typed in: `lib/profileCompleteness
→ profileBlockers` is the rule (face · აღწერა · სერვისი · ქალაქი · კატეგორია)
and `lib/profilePublish → syncPublished` is its only writer, called from every
write path. Every existing reader still asks `published && available` and none
of them changed. Backfill: `npx tsx scripts/republish-profiles.ts --write`.

⚠️ **„HAS A PHOTO" MEANS `photoUrl` OR `User.avatarUrl`, and getting that wrong
empties the site.** 25 of 28 profiles have `photoUrl = null` and 24 of those draw
a perfectly good face from the account avatar (`app/experts/_providers`). Read
as the column alone the rule hides 28 of 28; read as „is there a face", it hides
5. Ask the database for the BOOLEAN — selecting the column ships a ~32KB base64
blob, which `tests/apiPayloadHygiene` refuses.

⚠️ **Hiding the card does NOT stop the request SMS, and that is the design.**
Routing is gated on `RequestAccess`, not on `published`, so an incomplete
provider still hears about work — silence is what makes a new provider leave.
What is refused is SENDING an offer (`/api/provider/offers` → 409
`PROFILE_INCOMPLETE`), and `/work` says so in the first position on the page
(`NotVisibleNote`) rather than ambushing them at the moment they bid.

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

436 files, ~81 600 lines across `app/`, `components/`, `lib/` (2026-09-03). Big
screens are a container plus `_*.tsx` siblings in their own folder — **open the
part, not the page**.

| | |
| --- | --- |
| home | `app/HomeClient.tsx` + `app/_home/` |
| the catalogue — one list, one address | `app/experts/` + `lib/catalogItems.ts` |
| `/experts/[slug]` — one namespace: profession → trade → provider | `app/experts/[slug]/page.tsx` |
| the door — one question, one form | `app/join/` — `_door/` `_master/` `_shared/` |
| the two spaces | `app/me/` (client) · `app/work/` (supply) |
| a provider's whole public card — ONE editor, one save | `app/work/profile/` (`_editor` + `_sec*`) |
| the password and the pause switch (`available`) | `app/work/account/` |
| whether the card may be SEEN (`published`) — derived, never typed | `lib/profileCompleteness` + `lib/profilePublish` |
| the phone door — one flow for both registration and sign-in | `app/signin/_phone.tsx` + `app/api/auth/phone/` + `lib/phoneAuth` |
| the intake | `app/request/` |
| admin | `app/admin/` — one `_<tab>.tsx` per tab |
| retired URLs → 308 | `middleware.ts`, executed by `tests/redirects.test.ts` |

**`docs/MAP.md` is generated — grep it, never read it whole.** 1 151 exported
symbols → their file; 30 Prisma models → their real columns. `lib/` is 106 files
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

**Node 22 — and you no longer have to arrange it (2026-09-03).** `node` on this
machine is v26.5.0, and Next 15.5 fails under 26 in ways that read as code
errors. Every session used to open with
`export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`; measured across the last 50
transcripts that prefix rode **2 808 of 9 365 bash calls — 29%**, and was
missing from the other 71%, where the failure looks like a bug in whatever you
just touched. `npm run dev|build|start|check` now correct their own interpreter
(`scripts/node22.mjs`, `scripts/withNode22.mjs`), so the shell can be anything.
Railway is unaffected: nixpacks pins nodejs_22 and both shims no-op there.

⚠️ Anything you run OUTSIDE those scripts still gets the shell's node — `npx
next …` by hand is the one that bites. Use the npm script.

**The Bash tool keeps its working directory between calls.** `cd` into `mcodne/`
once; prefixing every command with it is 30% of the bash calls in those same
transcripts, and a `cd` inside a compound command can trigger a permission
prompt that the bare command would not.

**While working:** `npx tsc --noEmit` (~2s), or one test file
(`npx tsx tests/<file>.test.ts`). Not the whole gate after every edit. Both are
on the project allowlist (`.claude/settings.json`) and ask nothing.

**Editing by script?** `node scripts/patch.mjs <file>` with `[{old,new}]` on
stdin. It is the same exact-text replace a hand-rolled `assert old in s` does,
except that a missed anchor prints the nearest lines in the file with their
numbers instead of a bare AssertionError — measured 2026-09-03, that failure was
the largest identified cause of wasted tool calls (201 of them across 50
sessions, one round trip each). It writes nothing unless every edit matched.

⚠️ **It used `String.replace` until 2026-09-04**, which treats the REPLACEMENT
as a template: an edit whose new text merely CONTAINED `$'` — a SQL regex anchor
followed by a quote — was silently truncated there and a second copy of the rest
of the file appended. It corrupted `lib/dbBoot.ts` and read as 80 parse errors
200 lines from the edit. It joins a split now; the tool whose job is to make a
failed edit LOUD may not fail quietly.

**Before deploying:** `npm run check` — types → schema → 84 tests → `next build`.
There is no CI, and `railway up` uploads the WORKING TREE, so this script is the
only thing that ever runs the tests and a commit is a record rather than a
release.

**Deploy:** `railway up --detach` (project Tutor → service mcodne → mcodne.ge),
then verify live.

**The gate no longer fights `next dev` (2026-09-01).** It used to: both built
into `.next`, and two `next build`s over one directory leave half-written
manifests whose symptoms read as product bugs — unstyled pages, missing
manifests, `PageNotFoundError` on an API route — so the afternoon went on the
change under test, which was innocent. `next.config.js` now honours
`NEXT_DIST_DIR` and `scripts/check.mjs` sets it to `.next-check`, so the gate
builds beside the dev server. Railway sets nothing and still builds into
`.next`. If a manifest error ever comes back it is NOT this — check the Node
version first.

**Two things that cost an afternoon if you don't know them:**
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

⚠️ **The stamp ledger holds a ROW PER FINGERPRINT, and that is not a detail
(2026-09-01).** `lib/dbBoot` is transpiled by TWO compilers — esbuild under
`tsx` (the gate's schema stage and every test) and SWC under `next build`,
`next dev` and production — and SWC minifies, so the same DDL hashes
differently under each. The ledger used to be one row that every boot
overwrote, so the two engines cleared each other's stamp for ever and nothing
was warm twice running: `npm run check` paid the full ~112s replay every time,
and so did the first request after a deploy whenever a local run had written
last. Keyed by fingerprint they simply hold a row each. **`npm run check` is
~53s warm** — 7s types, 3s schema, 18s tests, 24s build, measured 2026-09-03.
Cold (no `.next-check`) the build alone is 135s, so do not delete it to „start
clean" — the gate is the thing that gets slower.

⚠️ **`lib/dbBoot` throws the whole boot on one failed statement**, so it holds no
DDL that names a dropped table. The 2026-08-24 services-only migration sits LAST
in `runMigrations()` and everything above it assumes the old tables still exist
on a database that has never been migrated; insert before it and the next boot
dies on „relation TutorProfile does not exist".

Prefer additive DDL, and **that is advice, not a prohibition.** Dropping a
`NOT NULL` column just has an order: drop the constraint, deploy the code that
stops writing it, then drop the column. The hazard is the sequence and it has a
known answer — it was never a reason to keep dead columns.

**Testing.** 84 files, no runner, each exits non-zero on failure. Pin
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

**Messages.** ⚠️ **A CODE THE PERSON IS WAITING FOR IS NEVER HELD BY THE
CUTOFF (2026-09-04).** `MAIL_ONLY_AFTER` / `SMS_ONLY_AFTER` exist so the site
does not INITIATE contact with people who were here before launch. Somebody
staring at the code field asked for it — and for a passwordless account it is
the only door there is, so holding it locks them out with `ok: true` in the log.
`lib/outbound → isCredential` is the exemption; it was already true of the
password-reset code and had simply never been exercised. `auth.phoneCode` is
also the one product SMS that ships switched ON, because a door that is off is a
door that is locked — and `request.verified.provider` was switched on the same
day on the owner's instruction („შეტყობინებები და შეთავაზებები მიდიოდეს ამ
ნომერზე").

**Dark features.** `PAYMENTS_LIVE` is off in `lib/flags.ts`, and its code and
copy stay reachable so the flag can simply be turned on. A dark feature is not a
deleted one — but the converse holds too: a flag whose code nobody imports is a
control that lies, and it gets deleted rather than left switched off.

⚠️ **The other two dark features were DELETED on 2026-09-03, not flipped.**
Owner: „ააღარ გვინდა ეგ ორი გვერდი". `FEATURE_ABROAD` had held /abroad dark
since 2026-08-04 and the `diaspora` Category it keyed off had never been created
at all; `B2B_VISIBILITY` had held the whole B2B vertical — /business, the
fixed-price catalogue we sold to companies, its enquiry queue and a prepaid
company balance — at `'off'` since 2026-08-11, and every table behind it held
test rows only. Gone with them: `lib/abroad.ts`, `lib/b2b.ts`, the models
`B2BService` · `BusinessLead` · `CompanyTransaction`, `Company.balance`, and
`tests/abroad.test.ts` · `tests/b2b.test.ts` (1 075 lines of pins).

**A company can still SELL here, and that is a different thing.** `/join` asks
„ფიზიკური პირი თუ კომპანია"; answer „კომპანია" and the ServiceProfile hangs off
a `Company` row whose `CompanyMember`s act in its name. That is supply, it is
not behind any flag, and the /admin „კომპანიები" tab exists to create the row and
its members. The tables stay in the database — dropping one is the migration
that cannot be re-run — so `lib/dbBoot` simply stops naming them.

**`docs/archive/` is history.** Nothing in it is current; never quote a number
out of it.

<!-- Split out of CLAUDE.md on 2026-08-20. CLAUDE.md is injected into every
     Claude Code turn; at 65 KB it cost ~20 800 tokens BEFORE a single line of
     the actual task. This file is the same text, unedited, read on demand.
     Nothing was deleted — the canon is not shorter, it is addressed. -->

# The product model + the screen map — the full text

> ## ⚠️ READ THIS BEFORE THE REST OF THE FILE — 2026-08-24
>
> **Consultations were removed from the site entirely.** Owner: „მინდა რომ
> მცოდნეზე კონსულტაციები საერთოდ ამოვიღოთ და მოვარგოთ სერვისებზე რაც ჩანაფიქრში
> იყო", then, when asked how far: „ერთბაშად სრული ამოღება.“
>
> Ten tables went (`TutorProfile`, `Consultation`, `Booking`, `AvailabilitySlot`,
> `Package`, `Enrollment`, `Message`, `Dispute`, `TutorApplication`,
> `LegacyRescheduleRequest`) and eight enum types with them. The 27 consultation
> experts were MIGRATED into `ServiceProfile` carrying their ids and their slugs,
> so every `/experts/<slug>` still answers what it answered the day before.
>
> **What that does to this document.** The screen map below has been corrected —
> it describes the site as it is. Everything from „THE PRODUCT MODEL“ downwards
> is left EXACTLY as written and is now HISTORY: the hierarchy argument, the
> „a consultation is a pre-step“ framing, the CONSULT/WORK capability pair, the
> quotes about which half comes first in a sentence. None of it describes a
> screen any more.
>
> It is kept rather than deleted because it is the record of how the product got
> here, and because the owner spent a month arriving at „the site sells services“
> the long way round. Read it as an account of a decision, never as a spec — and
> never quote a mechanic out of it.
>
> The one line that survived intact, and is now the whole product:
> **the site sells SERVICES.**


`CLAUDE.md` carries the seven rules and a one-line-per-screen index. This file is
the long form: every owner quote, every measurement, and the per-screen notes that
explain WHY a folder looks the way it does.

## Where things live — the full map
**Every big screen is a container plus `_*.tsx` siblings in its own folder. Open the part, not the page** — the container holds only state, fetch and layout.

| screen | container | its parts |
| --- | --- | --- |
| `/` home | `app/HomeClient.tsx` (68L) | `app/_home/` — `data` `hero` `categories` `experts` `how` `cta`. **Stage 9 (2026-08-19): the hero has NO search field** — the one question (SiteText `home.hero.*`) and two doors, `Btn` „ექსპერტები" → `/experts` and „სერვისები" → `/experts?type=WORK` (**stage 10**: both doors open the ONE catalogue, the second pre-filtered to the job half); the rest of the six sections + `RequestBand` unchanged. |
| **public header + footer** (stage 10, 2026-08-19) | `components/PublicTopBar.tsx`, `components/Footer.tsx` | The bar is exactly ONE section, `ექსპერტები` → `/experts` (owner: „სათაურში ჩემი აზრით ექსპერტები უნდა დარჩეს მარტო"), plus the button „მოთხოვნის გაგზავნა" → `/request` (`cta: true` in `NAV`, gated by the same `if (i.href === '/request') return requestsOn()` line `tests/requests.test.ts` pins; desktop right of the nav, phone inside the drawer) + guest „შესვლა/დაწყება" (→ `JOIN_HREF`) or the avatar/`UserMenu`. „კატეგორიები/სერვისები/მოთხოვნა/შემოგვიერთდი/დახმარება" all left the bar: „სერვისები" because its page was deleted in stage 10 and the remaining item already opens it; join + help live in `UserMenu` (gated there) and the footer. **The lit item is derived by PREFIX and nothing else** (`activePath === href || activePath.startsWith(href + '/')`) — since stage 11 all four pages that answer under `/experts/` are covered by it, so the `SECTION_ALIAS = { '/experts': ['/services'] }` that used to reach the trades side was deleted with the prefix it aliased. Footer col 1 is two words: „ექსპერტების ძებნა" → `/experts`, „სერვისები" → `/experts?type=WORK`, plus the two join links and „როგორ მუშაობს". **Every retired URL is executed against the real middleware in `tests/redirects.test.ts`** (one table: `/apply*`, `/ask`, `/tutors[/…]`, `/masters[/…]`, `/services` EXACTLY **and `/services/<x>` segment-for-segment (stage 11)**, `/student*`, `/tutor*`, `/provider*`, `/konsultacia*`, `/categories*` → 308 exact target; live neighbours untouched; sitemap names no retired prefix). |
| **the catalogue** — `/experts`, ONE list, ONE address | `app/experts/client.tsx` (`CatalogClient`) | `_providers.ts` (the one query) `_providerCard` `_filters` `_results` `_hero` `_cats` + `lib/catalogItems.ts`. **Three pages became one on 2026-08-19, and then the second roster became the only roster on 2026-08-24.** It used to merge TWO queries by user id — consultation experts out of `TutorProfile`, trades providers out of `ServiceProfile` — into one `CatalogItem` carrying `kinds: ('CONSULT'|'WORK')[]`, so one person was one card however many things they sold. With one table there is one query, one row type (`ProviderRow`) and one card; `lib/catalogItems` shrank to the URL parsing it always also did, and the `?type=` rail section went with the distinction it drew. `?trade=` and `?city=` keep their meanings and the whole roster is server-seeded — the browser filters, it does not fetch. `/tutors[/…]`, `/masters[/…]` and `/services` EXACTLY are 308 here. ⚠️ The photo columns are base64 and are NEVER selected: the query probes them and the card points at `/api/masters/[id]/photo`, and the account-avatar fallback goes through `lib/avatarSrc → avatarRouteSrc` for exactly the same reason. Pinned by `tests/catalog.test.ts`, `tests/entityCard.test.ts`. |
| **`/experts/[slug]` — THE ONE NAMESPACE** (stage 11, 2026-08-19) | `app/experts/[slug]/page.tsx` (the resolver) | **THREE pages share this segment and `page.tsx` decides which, in ONE documented order:** **1.** profession landing (`lib/professionSeo` → `_profession.tsx`) → **2.** trade landing (`lib/serviceProfile → resolveTrade` → `_tradeLanding.tsx`) → **3.** provider profile (`ServiceProfile` → `_providerData` `_providerHero` `_providerBlocks` `_providerCta`) → **4.** `notFound()`. **It was FOUR until 2026-08-24** — the expert profile sat at step 3 with its own client component, hero, reviews, booking panel and similar-experts rail, and it went with `TutorProfile`. The two CODE-OWNED lists still win because they are fixed lists in source while a profile slug is generated from a name, and `lib/slugSpace → RESERVED_SLUGS` reserves every id in both. **The slug space no longer needs to be shared:** `slugTaken` checked TWO tables so that at most one could answer; there is one table now, and the 27 migrated profiles kept their old slugs precisely so no address changed. `export const dynamic = 'force-dynamic'`. Pinned by `tests/oneNamespace.test.ts`, `tests/masterProfile.test.ts`, `tests/expertsRoute.test.ts`. |
| `/services/*` — RETIRED (stage 11, 2026-08-19) | — | **`app/services/` is deleted; `/services` is not a route prefix at all.** `/services` EXACTLY → `/experts` (stage 10, the door); `/services/<anything>` → `/experts/<same>`, segment-for-segment, 308, query preserved (`middleware.ts`, the block under `/masters`). Two profile spaces and two landing spaces contradict THE PRODUCT MODEL — one provider, and a consultation is one KIND of service — so the master profile and the trade landing moved into `app/experts/[slug]` (row above) rather than being deleted. Nothing in `app/`, `components/` or `lib/` quotes the prefix any more (`tests/oneNamespace.test.ts` §C2 scans the tree with comments stripped); the sitemap and `robots.ts` name only `/experts`. `seo.services.*` stays a `retired` registry row — never delete a key. |
| `/categories/*` — RETIRED (stage 8, 2026-08-19, §8.7) | — | 308 in `middleware.ts`: `/categories` → `/experts`, `/categories/<a>/<b>` → `/experts?category=<last segment>`. `lib/categoryRoutes → categoryPath()` now returns `/experts?category=<slug>` for every status; `lib/categorySeo.ts` stays as DATA (the profession landing prints the sphere keyword). `seo.categories.*` and `categories.*` SiteText keys are `retired` (never deleted). The header „კატეგორიები" item went in stage 9 (see the header row below). |
| **`/join` — ONE DOOR, ONE QUESTION, ONE FORM** (2026-08-24) | `app/join/page.tsx` + `JoinClient.tsx` + `_door/` | **The door used to ask which of two things you sold.** `DoorQuestion` derived CONSULT/WORK from the profession picked (`PROFESSION_CAN`) and routed to one of two wizards; `?can=CONSULT` seeded the consultation pitch. There is one thing to sell, so the question is now only „რას აკეთებ“ — it seeds the professions and the sphere, and everybody lands in the same form (`_master/client.tsx`, with `_shared/` holding the upload, the fields and the sphere hook the deleted expert wizard used to duplicate). `JoinClient` is a two-stage `'door' | 'form'`; a signed-out visitor gets `_door/PublicDoor`, an existing provider is redirected to `/work` before anything is drawn, and an ADMIN to `/admin` (the old approval wrote `role = 'TUTOR'` and could demote the only admin — the surviving approval writes no role at all). The pitch sections below the fold are shared: `_sections.tsx` (HOW/WHO/GET/FAQ + the FAQ JSON-LD). `/apply*` 308 → `/join`; its hero and closing-CTA SiteText keys are `retired`, never deleted. Pinned by `tests/join.test.ts`, `tests/joinDoor.test.ts`. |
| `/signin` + `/signup` | `app/signin/auth-client.tsx` (78L) | `_model` `_fields` `_signin` `_signup` `_verify` `_reset` `_onboarding` |
| **The two spaces** (stage 6, 2026-08-19) | `app/me/` = the client's (was `/student`), `app/work/` = the supply side's | `app/work/layout.tsx` is the SHELL ONLY and renders bare children with no session. **There were TWO route groups and there is one:** `(expert)` held the calendar, the bookings and the session dashboard and went on 2026-08-24, so `/work`, `/work/services`, `/work/profile` and `/work/jobs` now sit directly under the prefix and each gates ITSELF on `requestsViewer()`. `app/work/(provider)/layout.tsx` still guards the request queue and answers a stranger with `notFound()`, NEVER a redirect. Old addresses 308 in `middleware.ts` (`SPACE_MOVES`, segment-bounded). Pinned by `tests/spaces.test.ts`, `tests/auth-routing.test.ts` §C. |
| `/me` | `app/me/page.tsx` | `_model` `_welcome` `_next` `_saved` `_discover` `_pattern` `_requests` (the client's own service requests; full list at `/me/requests`, helper `lib/myRequests.ts`, `/api/me/requests`). `_sessions` and `_packages` went with the booking on 2026-08-24. |
| `/admin` | `app/admin/page.tsx` (145L) | one `_<tab>.tsx` per tab + shared `_parts.tsx` (27 `_*.tsx` siblings tonight) |
| `/settings` | `app/settings/page.tsx` | `_types` `_profile` `_password` `_account` `_prefs` |
| **`/work` — THE HOME** (2026-08-20) | `app/work/page.tsx` | `_components/CreditStrip` `_components/DayBoard`. Signed in + a provider identity, else `notFound()`. `CreditStrip` (balance → „N შეთავაზება“, the ONE most valuable unearned task, „შევსება“ → `/work/profile`), then `DayBoard` (ახალი მოთხოვნები · პასუხს ველოდები · ხელში მაქვს · წაუკითხავი), narrowed by the SAME `queueWhere(providerQueueScope(user))` the queue page and the nav badge use, so the number here and the list there cannot disagree. **`SessionDashboard` went on 2026-08-24** — it measured the half that was not happening (0 active bookings against 6 050 published slots), which is also the measurement that ended the consultation product. `grantEarnedTasks(user.id)` runs here, idempotent by the unique index. Pinned by `tests/spaces.test.ts` §B/§C, `tests/credits.test.ts` §F. |
| `/work/profile` | `app/work/profile/page.tsx` | The professional half and the trades half stacked in one editor — `ExpertProfileEditor` (headline, professions, languages, links, credentials) above `MasterProfileEditor` (photo, sentence, areas, prices). Two editors on one screen, because after the migration one person has both kinds of field and there is no second profile to put them on. |

⚠️ **Three rows left this table on 2026-08-24** — `/me/bookings/[id]`,
`/work/bookings/[id]` and `/work/schedule`. A booking, its two detail panes, the
chat inside them and the calendar that produced the slots are all gone. The
`/services/*` and `/categories/*` retirement rows above still stand, and their
redirects are still executed by `tests/redirects.test.ts`.

---

## ⚠️ HISTORY FROM HERE DOWN — see the notice at the top of this file

Everything below describes the two-product site and was true until 2026-08-24.
It is the record of a decision, not a spec.

## THE PRODUCT MODEL — READ THIS BEFORE ANYTHING ELSE (settled 2026-08-19, hierarchy pinned 2026-08-20)

### THE HIERARCHY, AND IT IS AN ORDER — NOT A LIST OF EQUALS

Owner, 2026-08-20, after catching the same mistake five times in one afternoon:
„მე ეჭვი მაქვს რომ ისევ კონსულტაციაზე გაამახვილე ყურადღება… მინდა რომ
კონსულტაციამ უკანა პლანზე გადაიწიოს და სერვისი გავუყიდოთ ექსპერტებს."

1. **The site sells SERVICES.** That is the product. Full stop.
2. **A consultation is a PRE-STEP to buying one** — „გაიარე კონსულტაცია, სანამ
   სერვისს აიღებ" — offered small, on the card, over the chat or the video call
   that is already built. It is not a second product, not a headline, not a
   button of its own.
3. **The pitch to a provider is CLIENTS FOR THEIR SERVICE**, never „share your
   knowledge". They set the price.
4. **WHEREVER BOTH APPEAR, THE SERVICE COMES FIRST.** In a sentence, a filter, a
   category rail, a list, an example, a meta description. Always. This is the
   rule that is easiest to break by accident and the one that gives the whole
   site away — on 2026-08-20 every new sentence written that day put the
   consultation first („ბუღალტერი, იურისტი, სანტექნიკოსი…", „კონსულტანტები და
   სერვისები"), and none of it was deliberate. When in doubt, read your own
   sentence back and check which half arrives first.
5. **One catalogue, one card, one namespace.** The type belongs to what is
   OFFERED, never to what kind of person somebody is.
6. **Retired words:** „ხელოსანი" · „მასწავლებელი" as a label · „სფერო" ·
   „ტუტორი" · „მასტერი" · „სპეციალისტი" as a role word.
7. **Tbilisi only, for now** — `CITIES` in lib/requestTopics, one line to widen.

### THE LEFTOVER TO WATCH: THE TAXONOMY IS STILL THE OLD SITE

⚠️ RE-MEASURED 2026-08-20 (evening): **8 service groups / 40 topics vs 16
consultation groups / 77.** The figure below — 4/21 vs 23/132 — was true that
MORNING and was already wrong by the same night. It is left here as the record
of how fast this moves, and as the reason never to quote a number out of a
document without re-running the count.

Measured 2026-08-20 (morning): **4 service groups / 21 topics vs 23 consultation
groups / 132 topics.** No amount of copy makes a site read as a services marketplace
while its own category list is 86% consulting — the rail sorts by count, so the
services fall to the bottom with zeros beside them. Growing the SERVICE side of
`lib/requestTopics` is the work; the copy alone cannot do it.

### WHERE THE OLD IDEOLOGY HIDES: THE COPY IS IN THE DATABASE

`SiteText` rows override `lib/siteTextDefs`, so the words that DEFINE the
product are editable content, and no test can see them. `tests/lexicon` scans
SOURCE only. On 2026-08-20 the live home page still read „ვიდეოსესია
მცოდნესთან" and „შეარჩიე შენი სფეროს მცოდნე" — the retired word included —
weeks after the source stopped saying either. **When you change a default, write
the DB row too, and scan the live values, not the file.**


**The site sells SERVICES.** A consultation is not a second product; it is one
KIND of service — the one with a fixed price and a bookable time. An accountant
sells „დეკლარაციის შევსება" (a price is agreed) and „კონსულტაცია 60წთ — 80₾"
(booked outright). Both are services.

**One provider, not two kinds of people.** What somebody offers is a set of
CAPABILITIES they switch on (`lib/capabilities.ts` — `CONSULT`, `WORK`), not an
identity they pick at the door. Two application forms still exist; the second is
turned on later from the same account (`/join` serves exactly the missing half,
and `missingCapability` puts that switch in the user menu).

⚠️ **THREE THINGS THAT MUST NOT COME BACK.** Each was built, shipped and removed
in one day because it contradicts the model:
1. **A „კონსულტაცია / სერვისი" primary axis** — a switcher, a nav item, the
   first filter section, or a badge next to somebody's name. If a distinction is
   ever needed it is about HOW YOU BUY (a known price and a time, versus a
   quote), never about what kind of person somebody is.
2. **Two catalogues.** There is ONE list at `/experts`, and one card; a person
   who holds both capabilities is ONE row carrying both.
3. **The word „ხელოსანი"** (and „ტუტორი", „მასტერი", „სპეციალისტი" as a role).
   „სერვისი" is what is sold; „ექსპერტი" is who sells it.

Owner, verbatim: „ექსპერტს აქვს სერვისი რეალურად და პარალელურად აკეთებს
კონსულტაციასაც — მთელი პრინციპი ეს იყო", and „კონსულტაციამ მეორე პლანზე
გადაინაცვლა, მთელი იდეა სერვისებზე წამოვიდა."

**Still true in the schema, and deliberately:** a consultation is a
`Consultation` row on `TutorProfile`; a service is an id in
`ServiceProfile.services[]`. Two tables. Merging them into one list of offerings
is the eventual migration — the trigger is the first provider who turns their
second capability on, because until then it buys nothing (measured 2026-08-19:
26 experts, 6 masters, 0 holding both — re-measured 2026-08-20: 26 and 2, still 0).

### Where the two halves live today (added 2026-08-18, rewritten 2026-08-19)

| what | where | the one thing to know |
| --- | --- | --- |
| **the two switches** | `lib/requests.ts` | `requestsOn()` = `FEATURE_REQUESTS` (the whole subsystem, exact „on"). `providersOn()` = `FEATURE_PROVIDERS` (supply side only: the master's three `/work/…` screens, the WORK half of `/join` — gated INSIDE `app/join/page.tsx`, not via the prefix list — master-applications API, admin „ხელოსნები" tab, the signup tile). **Unset follows the first; it can only narrow, never widen.** Both inlined in `next.config.js → env` for client components. Middleware walks `REQUEST_PATH_PREFIXES` AND `PROVIDER_PATH_PREFIXES`. |
| **the vocabulary** | `lib/requestTopics.ts` | `LIVE_SERVICE_GROUP_IDS` = the open trades (4 at first, 8 since 2026-08-20). `VERTICALS` / `browseGroupsFor` / `VERTICAL_COPY` = the two doors. `groupIsService` splits them. **Everything derives from `kinds`; never hand-list groups.** Stage 8: CONSULTATION/PROJECT topics may carry `professions?: string[]` (job labels from `lib/professions`; `professionsOfTopic()`), NEVER a LEARNING/SERVICE topic — the second and last place the two vocabularies touch (`categorySlug` is the first). |
| **the taxonomy's capabilities** | `lib/professions.ts` | `PROFESSION_CAN[job]` = `['CONSULT']` (default) or `['CONSULT','WORK']` (12 obvious job-doers); `professionCan()`, `professionsThatCan()`. ⚠️ WORK on an expert profession is DATA only — nothing routes on it yet (stage 9+/join). |
| **routing** | `lib/requestRouting.ts → routeRequest` | trades match first (topic + city); then the EXPERT audience = sphere match ∪ profession match (`TutorProfile.professions` ∩ `Topic.professions`, case-insensitive trim, whole label — never substring); neither → EVERYONE (unchanged fallback). Caller `lib/requestJobs → routableProviders` selects `tutor.professions`. Pinned by `tests/taxonomy.test.ts`. |
| **what a provider SEES** | `lib/requestRouting.ts -> queueScope` / `queueWhere` | The QUEUE narrowing, resolved against the database by `lib/requestsServer -> providerQueueScope` and spread by the nav badge, the /work board and the queue list. The same facts as the mail (ticked trades + cities; the sphere column; the professions), plus one the mail does not need: a sphere the owner's launch list marks `side: 'LEARN'` means LEARNING, because the sphere table holds no school subject and a chemistry request could otherwise reach nobody. The mail's EVERYONE fallback is deliberately NOT copied - a request nobody is TOLD about dies, but a queue full of work you cannot do is the lead-mill; nothing becomes unreachable because the mail links to the detail page, which is not narrowed. `mode` names the silence: PAUSED / UNLISTED / FILTERED / ALL (admin, as a fallback and never an override). Pinned by `tests/requestQueue.test.ts`. |
| **the rules** | `lib/serviceProfile.ts` | `LIVE_SERVICE_GROUPS` and `covers()`. The queue narrowing moved to `lib/requestRouting -> queueScope`/`queueWhere` on 2026-08-21: a ServiceProfile is only ONE half of what a person offers, and reading its absence as "no filter" showed the whole platform to every expert, company member and admin. |
| **the intake rules** | `lib/masterApplication.ts` | `MasterApplicationInput`, `approvalBlockers()`. The photo is a SOFT gate: apply without, cannot be approved without. |
| **the trades row** | `lib/serviceMarks.ts` | Pure `.ts` (icon KEYS, not elements) so the test can import it. Marks live in `components/Icon → CatIcon`. |
| **who somebody is** | `lib/hats.ts` | `Role` has no value for „master". `hatsOf()` is the answer; `/api/me` exposes `hats`. |
| **client landing** — DELETED (stage 10, 2026-08-19) | — | `app/services/page.tsx` was the vertical's door (`LIVE_SERVICE_GROUPS` + a 6-master strip). Owner: „სერვისები საერთოდ ხო ამოსაგდებია." `/services` EXACTLY 308s to `/experts`; `components/VerticalSwitch.tsx` and `app/services/_masters.tsx` went with it. ⚠️ `/services/<slug>` and `/services/<trade>` survived the door for ONE DAY and then moved too — stage 11 collapsed the whole prefix into `/experts` (see the `/services/*` row above). `seo.services.*` is a `retired` registry row. |
| **the job half's model + card** (stage 10, 2026-08-19) | `app/experts/_masterData.ts`, `app/experts/_masterCard.tsx` | They were `app/masters/_data.ts` / `_card.tsx`; `app/masters/` is GONE (its `page` folded into `app/experts/page.tsx`, its `_hero` `_filters` `_results` into the shared container back in the evening merge). `_masterData` keeps the query, the VISIBLE rule, `MastersFilter`, `mastersHref`, `filterCounts` and `REQUEST_HREF`; its THREE readers are the catalogue, `/experts/<trade>` and `/experts/<slug>` (all one namespace since stage 11); `_masterCard → masterHref` builds `/experts/<slug>`, the same prefix the expert card builds. It LOST `parseFilters` / `toggleHref` / `filterIsActive` with the server-resolved rail — the same vocabulary is validated in `lib/catalogItems → parseTrades/parseCities` and applied in the browser. `MasterRow` carries `userId` / `companyId` (the merge key), `serviceIds` / `areaIds` (ids, never labels, are what a filter may match), `priceValue` and `createdAt` (the two sort keys). `_masterCard` is the PORTRAIT card — one card, two pages. |
| **the intake** | `app/request/` | `_model` holds `STAGES` + `Draft.vertical` + `Draft.topicPinned`. The DOOR decides the catalogue (`?for=service`); the wizard never asks again. **`?to=<slug>` DECIDES WHO IT GOES TO (2026-08-19)** — the client's two verbs are „დაჯავშნე" and „აღწერე", and until this the second could not be aimed: a visitor standing on somebody's profile had to post a request into the void and invite from the room. Carried by `app/experts/[slug]/_providerCta` (`requestHrefFor` in `_providerData` — `for=service` + the slug) and by the expert rail's SECONDARY action (`app/experts/[slug]/page.tsx` builds the href behind ONE `requestsOn()` and hands it down as `requestHref`; booking stays PRIMARY and there is no third button). `lib/requestTarget → resolveRequestTarget` resolves it server-side against the catalogue's OWN rules — `app/experts/_masterData → PUBLIC` and `lib/tutorsQuery → PUBLIC_TUTOR`, both IMPORTED, never re-typed — and an unknown/hidden/malformed value is IGNORED, never a 404. On submit the endpoint re-resolves the SLUG (the browser carries an address, not a decision) and opens the INVITED thread through **`lib/requestInvite → inviteProviderToRequest`: ONE definition, two callers** (this and `POST /api/requests/[ref]/invite`) — no price, no place against `offerLimit`, not acceptable, **contact still masked**. `lib/requestTopics → topicsForProvider` (pure) turns the master's `services` / the expert's professions ∪ sphere into topic ids: exactly ONE unambiguous topic drops the „რა გჭირდება" SCREEN and its STAGE (`stagesFor`); one ambiguous topic sets the topic and keeps the screen for the kind question; several only pre-filter that screen's catalogue; none behaves exactly as before. `topicPinned` is cleared on every revived draft — the URL open NOW decides. Pinned by `tests/hireDirect.test.ts` (12). **Step one is ONE FIELD (2026-08-19):** `_stepWhat` no longer prints the 31-row accordion under the search box — the catalogue lives in a panel (`#what-panel`) that opens on the TAP (never on focus: the `pointer: fine` autofocus would otherwise re-print it for every desktop visitor), on the first character typed, on ArrowDown, or from the one quiet line „ან აირჩიე კატეგორიებიდან". Open with <2 chars = the folded groups; typing = the hits; no match = their sentence. The panel is capped (`PANEL_SCROLL`) and scrolls INSIDE itself, so the field never moves under the thumb. **The budget is a BAND and nothing else (2026-08-19):** the „ან ჩაწერე ზუსტი თანხა" number field, `Draft.budgetAmount`, the `budgetAmount` wire key, `amountIsBelowFloor` and `budgetFloorFor` were removed together — a typed figure wrote `budgetMin = budgetMax`, i.e. a ceiling that costs the client offers, and it was a second answering gesture on a one-tap screen. If an exact high budget ever needs saying, the move is to let the TOP band ask for a number. Pinned by `tests/requests.test.ts` („the budget is a band…"), which also scans `app/request` for a number input. |
| **become a master** | `app/join/_master/` (via `/join?can=WORK`) | `client` `_marketing` `_workPhotos`. One screen, 7 blocks, 4 optional. The page is `app/join/page.tsx`. |
| **the master's workspace** | `app/work/(provider)/` (`/work/requests`, `/work/offers`, `/work/service-profile` — was `/provider`, 308 since stage 6) | The chrome is the shared `/work` shell; its rail draws `components/tutor/navConfig → PROVIDER_NAV` for WORK holders / the allowlist. `lib/requests → PROVIDER_WORKSPACE_PATHS` names the THREE paths (never `/work` — that would 404 the expert workspace when the subsystem is off); `isProviderWorkspacePath` is the space test `BottomNav → PROVIDER_TABS`, `AppShell` and `UserMenu` read (never a role) — the only requests paths that keep site furniture. |
| **the queue** | `app/admin/_masters.tsx` | Tab „ხელოსნები". Blockers are shown BEFORE the button. |
| **approval** | `app/api/master-applications/[id]` | One transaction: `RequestAccess` + `ServiceProfile`. Grants both or neither. |
| **photos** | `app/api/masters/[id]/photo` | ⚠️ Images are base64 COLUMNS (no object storage). **Never select one into a list** — count it, and point the card at this route. SVG is refused here. |

**Bookings, not this vertical, but found the same day:** a package lesson's credit is returned by `lib/bookingCredit → releaseBookingCredit(tx, enrollmentId, …)` from EVERY exit (client cancel, expert decline, cleanup auto-cancel) — never write a local `lessonsUsed: { decrement }`. Approval seed steps in `app/api/applications/[id]` run under `seedOnce()` (profile row lock) — a bare `count()`+`createMany` is the duplicate factory again.

**Four traps this vertical sets, all of which caught somebody already:**
1. **A base64 column in a list query** = megabytes in one page. Count it instead.
2. **`available: true` in a `where`** makes a paused master look like somebody with NO profile — which widens the queue instead of emptying it. Select it, branch on it.
3. **A trades request has no `categoryId`** (that table is the expert taxonomy). Anything matching on it falls through to „everyone" — the SELF-mode count, `/experts` links. (Routing itself no longer does: since stage 8 it also matches on the topic's professions — but a topic with neither sphere nor professions still reaches everyone, by design.)
4. **`tests/requests.test.ts` scans the whole tree** for links to `/request` and the master's three `/work/…` screens. A new entry point needs an allowlist entry AND a mechanism assertion, not just the entry.

⚠️ **The last four differ: state stayed in the page, only JSX moved.** Those
sections take explicit props (ProfileSection 16, CredentialsTab 24) because the
coupling was already there — the prop list makes it visible, it did not create
it. Do not "tidy" that by moving the useState calls into the children: the page
seeds them from its fetch, so moving them turns seeding into an effect.

**`components/booking/BookingFlow.tsx` (1,136L when measured 2026-08-08; 1,172L tonight) is deliberately NOT split.**
Measured, not assumed: every block worth extracting needs ~40 props (the time
step 45, the day/time grid 40). At that ratio the interface is as much to hold
in your head as the code, and this is the booking path — it is also a lazy
chunk, so it cannot be checked by grep. If it is ever restructured, the move is
a `useSlotSelection` hook, not a prop-threaded child, and it needs a browser.

Three rules this shape depends on:
- **The model is a leaf.** Each folder's `_model` / `_data` / `_form` imports no sibling; everything else imports it. A cycle always means a piece of the model was left in a UI file — move it to the leaf, don't add an import.
- **Never split a component to shrink a file.** These were pure MOVES, verified line-for-line. `work/(expert)/profile` (was `tutor/profile`; 1695L then, the folder is 2620L tonight), `work/(expert)/schedule` (was `tutor/schedule`; 1505L → 1651L), `BookingFlow` (1136L → 1172L) and `settings` (916L → 1096L) are still big because each is ONE component — shrinking them is a rewrite and needs its own decision.
- **Tests read these screens as SOURCE TEXT.** ~10 of them. They must read the whole route DIRECTORY, never one filename. Watch for the reverse failure too: a negative assertion („X no longer appears here") pointed at a container passes vacuously — `category-marks` C6 was defanged exactly this way and is now directory-wide.

---

## ⚠️ CURRENT AGAIN FROM HERE DOWN

The archetypes survived the removal — they are about page SHAPE, not about what
is sold. Two details inside §2 are history and are marked in place.

## THE PAGE ARCHETYPES (established 2026-08-18, restructuring v2 §8)
**Every screen is one of seven. Inventing an eighth is forbidden.** Pinned by `tests/archetypes.test.ts`.
1. **Marketing landing** — `Container` wide (1280); section rhythm `py-12 sm:py-16`.
2. **Catalogue** — wide; **breadcrumb mandatory**; ONE screen, ONE LIST and — since stage 10, 2026-08-19 — ONE ADDRESS, `/experts` (owner: „ესეიგი ხო მოვიფიქროთ რომ იდენტურია უბრალოდ და ფილტრაციასავით უნდა იყოს", then „სერვისები საერთოდ ხო ამოსაგდებია … ექსპერტებზე გადაიტანე"). `/tutors`, `/masters` and `/services` 308 there — and since stage 11 so does every `/services/<x>`, onto `/experts/<x>`. Pinned by `tests/catalog.test.ts`: breadcrumb → h1 + one line → `lg:grid-cols-[240px_1fr]` with **`min-w-0` on BOTH tracks** → rail | (results header + cards). The rail is `components/catalog/FilterPanel`, 240px and `lg:sticky lg:top-24`, folded below `lg` by `components/catalog/MobileCollapse`; **⚠️ THE „რა გჭირდება" SECTION WENT ON 2026-08-24** — it ticked კონსულტაცია / სამუშაო, and with one product there is no type to narrow by. The rail's sections are now the sphere, the trade, the city, the languages, the rating and the price. **`components/VerticalSwitch` was DELETED** — a control over a result list reads as „narrow these", so the thing that narrows is the filter, and with one catalogue there is no second page to navigate to. `FilterRow` still takes EITHER an `href` OR an `onClick`; the merged rail uses `onClick` throughout and the container writes the whole selection back into the URL (`?type=` `?cats=` `?trade=` `?city=` …), so every view is still an address and Back still walks through them. **A drawer or a dropdown bar is no longer a second form**; search and sort are not filters and live in the results header, with the count („ნაჩვენებია N", no noun — the list may hold either half). The reader picks the layout there too: `components/catalog/ViewToggle` + `useCatalogView` (one `localStorage` key, `mcodne:catalog-view`; `VIEW_CLASS` writes the two containers once and the same `view` goes to the card). **⚠️ ONE CARD SINCE 2026-08-24.** There were TWO in one list, one per PERSON — `_card` for anybody offering consultations and `_masterCard` otherwise, both through `components/EntityCard`, with `EntityKinds` labels when the list was mixed. One roster, one card: `app/experts/_providerCard`, still through the shared shell and still `layout="portrait"`, which is what stops the two halves of the catalogue drifting back into two products. Empty states: nothing listed, and „ამ ფილტრით არავინ არის — მოხსენი ფილტრი“. The third was the cross-half contradiction and went with the halves.
3. **Profile** — breadcrumb, hero, blocks, reviews, CTA.
4. **Intake wizard** — `Container size="narrow"` (560); **never a hand-written `max-w-[Npx]`**; one `components/StepIndicator`. Chrome: choosing → full `PublicTopBar`+`Footer`; mid-transaction → the minimal bar.
5. **Workspace** — ≥4 items → sidebar, fewer → link bar; **always a bottom nav on mobile**; every page opens with `<PageHeader>`; rhythm `py-8 lg:py-10`.
6. **Form / detail** — `<PageHeader>` + `Card` blocks.
7. **Admin tab** — 19/19 use `app/admin/_parts.tsx`; the model to copy.

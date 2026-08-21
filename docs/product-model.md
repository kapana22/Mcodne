<!-- Split out of CLAUDE.md on 2026-08-20. CLAUDE.md is injected into every
     Claude Code turn; at 65 KB it cost ~20 800 tokens BEFORE a single line of
     the actual task. This file is the same text, unedited, read on demand.
     Nothing was deleted — the canon is not shorter, it is addressed. -->

# The product model + the screen map — the full text

`CLAUDE.md` carries the seven rules and a one-line-per-screen index. This file is
the long form: every owner quote, every measurement, and the per-screen notes that
explain WHY a folder looks the way it does.

## Where things live — the full map
**Every big screen is a container plus `_*.tsx` siblings in its own folder. Open the part, not the page** — the container holds only state, fetch and layout.

| screen | container | its parts |
| --- | --- | --- |
| `/` home | `app/HomeClient.tsx` (68L) | `app/_home/` — `data` `hero` `categories` `experts` `how` `cta`. **Stage 9 (2026-08-19): the hero has NO search field** — the one question (SiteText `home.hero.*`) and two doors, `Btn` „ექსპერტები" → `/experts` and „სერვისები" → `/experts?type=WORK` (**stage 10**: both doors open the ONE catalogue, the second pre-filtered to the job half); the rest of the six sections + `RequestBand` unchanged. |
| **public header + footer** (stage 10, 2026-08-19) | `components/PublicTopBar.tsx`, `components/Footer.tsx` | The bar is exactly ONE section, `ექსპერტები` → `/experts` (owner: „სათაურში ჩემი აზრით ექსპერტები უნდა დარჩეს მარტო"), plus the button „მოთხოვნის გაგზავნა" → `/request` (`cta: true` in `NAV`, gated by the same `if (i.href === '/request') return requestsOn()` line `tests/requests.test.ts` pins; desktop right of the nav, phone inside the drawer) + guest „შესვლა/დაწყება" (→ `JOIN_HREF`) or the avatar/`UserMenu`. „კატეგორიები/სერვისები/მოთხოვნა/შემოგვიერთდი/დახმარება" all left the bar: „სერვისები" because its page was deleted in stage 10 and the remaining item already opens it; join + help live in `UserMenu` (gated there) and the footer. **The lit item is derived by PREFIX and nothing else** (`activePath === href || activePath.startsWith(href + '/')`) — since stage 11 all four pages that answer under `/experts/` are covered by it, so the `SECTION_ALIAS = { '/experts': ['/services'] }` that used to reach the trades side was deleted with the prefix it aliased. Footer col 1 is two words: „ექსპერტების ძებნა" → `/experts`, „სერვისები" → `/experts?type=WORK`, plus the two join links and „როგორ მუშაობს". **Every retired URL is executed against the real middleware in `tests/redirects.test.ts`** (one table: `/apply*`, `/ask`, `/tutors[/…]`, `/masters[/…]`, `/services` EXACTLY **and `/services/<x>` segment-for-segment (stage 11)**, `/student*`, `/tutor*`, `/provider*`, `/konsultacia*`, `/categories*` → 308 exact target; live neighbours untouched; sitemap names no retired prefix). |
| **the catalogue** — `/experts`, ONE list, ONE address (stage 10, 2026-08-19) | `app/experts/client.tsx` (`CatalogClient`) | `_data` `_filters` `_hero` `_card` `_results` `_masterCard` `_masterData` + `lib/catalogItems.ts`. **Three pages became one.** Owner, four times in one day: „სერვისები და ექსპერტები უნდა გაერთიანდეს", „მოვიფიქროთ რომ იდენტურია უბრალოდ და ფილტრაციასავით უნდა იყოს", „ექსპერტები და სერვისები ხო ერთია — ექსპერტს აქვს სერვისი რეალურად და პარალელურად აკეთებს კონსულტაციასაც", then „სერვისები საერთოდ ხო ამოსაგდებია … ექსპერტებზე გადაიტანე" („ტუტორები რატო უნდა იყოს სახელად" — the word is banned, so it may not sit in a URL). `/tutors[/…]`, `/masters[/…]` and `/services` EXACTLY now 308 here. The kind is a property of what somebody OFFERS, and `lib/catalogItems → toCatalogItems` groups BOTH rosters **by user id**: one person is ONE `CatalogItem` carrying `kinds: ('CONSULT'\|'WORK')[]`, `consult` (the Tutor row) and `work` (the MasterRow) — the day somebody enables their second capability they are one card with both labels, never two. The one server page loads both halves (`queryTutors` + `queryMasters` UNFILTERED — its VISIBLE rule untouched) plus `filterCounts()`, reads `requestsOn()` ONCE for the CTA, and hands them to the client, which filters/sorts/paginates in the browser. **There is no `preset` and no `basePath`**: the page opens on EVERYBODY, `?type=CONSULT\|WORK` narrows it (silent when both are on — that is what the bare address means), and `?trade=` / `?city=` keep their /masters meanings. `CATALOG_PATH = '/experts'` is the one address every filter change is written back into. **The pill switch (`components/VerticalSwitch`) was deleted** with the /services door — with one catalogue there is nowhere to navigate BETWEEN; the type is a rail `FilterGroup` („რა გჭირდება" → კონსულტაცია / სამუშაო, LAST section, unticking the last one turns BOTH on). Pinned by `tests/catalog.test.ts` (19). |
| **`/experts/[slug]` — THE ONE NAMESPACE** (stage 11, 2026-08-19; was `/tutors/[id]`, 308 since the same day) | `app/experts/[slug]/page.tsx` (the resolver) | **FOUR pages share this segment and `page.tsx` decides which, in ONE documented order:** **1.** profession landing (`lib/professionSeo` → `_profession.tsx`, was `app/konsultacia/[slug]`) → **2.** trade landing (`lib/serviceProfile → resolveTrade` → `_tradeLanding.tsx`, was `app/services/[slug]/_trade`) → **3.** expert profile (`TutorProfile` → `client.tsx` + `_bits` `_data` `_hero` `_reviews` `_booking` `_similar` `_sections`) → **4.** provider profile (`ServiceProfile` → `_providerData` `_providerHero` `_providerBlocks` `_providerCta`, was `app/services/[slug]/{_data,_hero,_blocks,_cta}`) → **5.** `notFound()`. **The two CODE-OWNED lists win** because they are fixed lists in source while both profile slugs are generated from names — and `lib/slugSpace → RESERVED_SLUGS` reserves every id in both, which is what makes the precedence safe rather than merely documented. **The two profiles are ordered by nothing but history, and that is safe since stage 11:** `lib/slugSpace → slugTaken` checks BOTH tables, so at most one can answer (measured before the move: 26 expert slugs, 7 provider slugs, 0 collisions — nothing was renamed). `export const dynamic = 'force-dynamic'`; both id→slug 308s carry the query string (`queryOf`). Provider photos via `/api/masters/[id]/photo?n=` — the model COUNTS and PROBES the base64 columns, never selects them. **The HUB is gone (stage 10):** `app/experts/page.tsx` is the CATALOGUE — a hub of professions is a pre-filtered catalogue. `seo.konsultacia.*` + `konsultacia.*` SiteText are `retired` (never deleted). `/konsultacia*` and `/services*` 308 → `/experts*` in `middleware.ts`. Pinned by `tests/oneNamespace.test.ts` (8), `tests/masterProfile.test.ts`, `tests/expertsRoute.test.ts`, `tests/taxonomy.test.ts`. |
| `/services/*` — RETIRED (stage 11, 2026-08-19) | — | **`app/services/` is deleted; `/services` is not a route prefix at all.** `/services` EXACTLY → `/experts` (stage 10, the door); `/services/<anything>` → `/experts/<same>`, segment-for-segment, 308, query preserved (`middleware.ts`, the block under `/masters`). Two profile spaces and two landing spaces contradict THE PRODUCT MODEL — one provider, and a consultation is one KIND of service — so the master profile and the trade landing moved into `app/experts/[slug]` (row above) rather than being deleted. Nothing in `app/`, `components/` or `lib/` quotes the prefix any more (`tests/oneNamespace.test.ts` §C2 scans the tree with comments stripped); the sitemap and `robots.ts` name only `/experts`. `seo.services.*` stays a `retired` registry row — never delete a key. |
| `/categories/*` — RETIRED (stage 8, 2026-08-19, §8.7) | — | 308 in `middleware.ts`: `/categories` → `/experts`, `/categories/<a>/<b>` → `/experts?category=<last segment>`. `lib/categoryRoutes → categoryPath()` now returns `/experts?category=<slug>` for every status; `lib/categorySeo.ts` stays as DATA (the profession landing prints the sphere keyword). `seo.categories.*` and `categories.*` SiteText keys are `retired` (never deleted). The header „კატეგორიები" item went in stage 9 (see the header row below). |
| **`/join` — ONE DOOR, ONE QUESTION, ASKED BEFORE THE WALL** (2026-08-20) | `app/join/page.tsx` + `JoinClient.tsx` + `_door/` | **The question is a LEAF and both sides import it:** `_door/DoorQuestion` owns the `ProfessionPicker`, the derivation (`deriveCapabilities` — `PROFESSION_CAN`, never a tile) and the draft (`mcodne:join`). `_door/GuestDoor` + `_door/PublicDoor` are the SIGNED-OUT half: a guest answers „რას აკეთებ" on the pitch, `asked: true` goes into the draft, `/signup?redirect=%2Fjoin` follows, and `JoinClient` picks the answer up and opens the wizard instead of asking twice. **Three guest views:** bare `/join` = the door (every human-facing link on the site points here), `?can=CONSULT` = the „გახდი ექსპერტი" pitch, `?can=WORK` = „დაარეგისტრირე შენი სერვისი" (its own canonical and its own sitemap row). **`?can=` SEEDS, IT NEVER OVERRIDES** a picked profession — it used to short-circuit the derivation while the header and the footer both carried `?can=CONSULT`, so a სანტექნიკოსი arriving from the site's own navigation was told „კონსულტაციებს ჩაატარებ" and routed into the consultation wizard. **One address, one label:** `lib/capabilities → JOIN_DOOR_HREF` / `JOIN_DOOR_LABEL`, used by `PublicTopBar`, `Footer`, `UserMenu` and both doors' h1 (six labels and three destinations before). Then `_expert/ApplyClient.tsx` (`_form` `_fields` `_chrome` `_upload` `_steps` `_draft`) or `_master/client.tsx` (`_marketing` `_workPhotos`), the second offered from the first's success screen. The pitch sections are shared — `app/join/_sections.tsx` (HOW/WHO/GET/FAQ + the FAQ JSON-LD, one array). `/apply*` 308 → `/join`. Pinned by `tests/join.test.ts` (11), `tests/joinDoor.test.ts` (14). |
| `/signin` + `/signup` | `app/signin/auth-client.tsx` (78L) | `_model` `_fields` `_signin` `_signup` `_verify` `_reset` `_onboarding` |
| **The two spaces** (stage 6, 2026-08-19) | `app/me/` = the client's (was `/student`), `app/work/` = the supply side's (was `/tutor` + `/provider`) | `app/work/layout.tsx` is the SHELL ONLY (`components/tutor/WorkspaceShell`, groups from `capabilitiesOf`, renders bare children with no session); the GUARDS are the route groups: `app/work/(expert)/layout.tsx` (`requireRole` → /signin; sends a WORK-only account to **`/work`** — the shared home since 2026-08-20, not the queue) and `app/work/(provider)/layout.tsx` (`requestsViewer().providerAllowed` → `notFound()`, NEVER a redirect). Old addresses 308 in `middleware.ts` (`SPACE_MOVES`, segment-bounded — `/api/tutor/*` untouched; `/tutors` has its own 308 block above them since stage 10). Pinned by `tests/spaces.test.ts`. |
| `/me` | `app/me/page.tsx` | `_model` `_welcome` `_next` `_saved` `_discover` `_sessions` `_packages` `_pattern` `_requests` (D7: the client's own service requests; full list at `/me/requests`, helper `lib/myRequests.ts`, `/api/me/requests`) |
| `/me/bookings/[id]` | `.../page.tsx` | `_model` `_hero` `_modals` `_review` `_body` `_mobile` |
| `/work/bookings/[id]` | `app/work/(expert)/bookings/[id]/page.tsx` | `_model` `_review` `_timeline` |
| `/admin` | `app/admin/page.tsx` (145L) | one `_<tab>.tsx` per tab + shared `_parts.tsx` (27 `_*.tsx` siblings tonight) |
| `/settings` | `app/settings/page.tsx` | `_types` `_profile` `_password` `_account` `_prefs` |
| **`/work` — THE SHARED HOME** (2026-08-20) | `app/work/page.tsx` | `_components/CreditStrip` `_components/DayBoard` `_components/SessionDashboard`. **Outside BOTH route groups with its own gate** (signed in + at least one capability, else `notFound()`) — the `/work/services` precedent. It was `app/work/(expert)/page.tsx`, an expert-only SESSION dashboard, so a WORK-only provider had no home at all and was dropped into the queue; it also measured the half that is not happening (0 active bookings against 6050 published slots). Now: `CreditStrip` (balance → „N შეთავაზება", the ONE most valuable unearned task, „შევსება" → `/work/profile` for CONSULT and `/work/services` for WORK — the expert editor sits inside the group and would bounce a provider straight back out), `DayBoard` (ახალი მოთხოვნები · პასუხს ველოდები · ხელში მაქვს · წაუკითხავი, narrowed by the SAME `routingWhere(svc)` the queue page uses, so the number here and the list there cannot disagree), then `SessionDashboard` for a CONSULT holder only. `grantEarnedTasks(user.id)` runs here — idempotent by the unique index, so a credit is waiting rather than claimed. Pinned by `tests/spaces.test.ts` §B/§C, `tests/credits.test.ts` §F. |
| `/work/profile` | `app/work/(expert)/profile/page.tsx` | `_types` `_parts` `_tabProfile` `_tabServices` `_tabCredentials` `_tabAccount` `_packages` `_students` |
| `/work/schedule` | `app/work/(expert)/schedule/page.tsx` | `_shared` `_sheetSlot` `_sheetTemplate` `_sheetBlock` |

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
| **the rules** | `lib/serviceProfile.ts` | `LIVE_SERVICE_GROUPS`, `covers()`, and `routingWhere()` — the ONE narrowing the queue page and the nav badge both read. |
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

## THE PAGE ARCHETYPES (established 2026-08-18, restructuring v2 §8)
**Every screen is one of seven. Inventing an eighth is forbidden.** Pinned by `tests/archetypes.test.ts`.
1. **Marketing landing** — `Container` wide (1280); section rhythm `py-12 sm:py-16`.
2. **Catalogue** — wide; **breadcrumb mandatory**; ONE screen, ONE LIST and — since stage 10, 2026-08-19 — ONE ADDRESS, `/experts` (owner: „ესეიგი ხო მოვიფიქროთ რომ იდენტურია უბრალოდ და ფილტრაციასავით უნდა იყოს", then „სერვისები საერთოდ ხო ამოსაგდებია … ექსპერტებზე გადაიტანე"). `/tutors`, `/masters` and `/services` 308 there — and since stage 11 so does every `/services/<x>`, onto `/experts/<x>`. Pinned by `tests/catalog.test.ts`: breadcrumb → h1 + one line → `lg:grid-cols-[240px_1fr]` with **`min-w-0` on BOTH tracks** → rail | (results header + cards). The rail is `components/catalog/FilterPanel`, 240px and `lg:sticky lg:top-24`, folded below `lg` by `components/catalog/MobileCollapse`; **the TYPE is a section of it** („რა გჭირდება" → კონსულტაცია / სამუშაო, both tickable, roster-wide counts, never zero selected), drawn LAST because it is the nuance and not the axis. **`components/VerticalSwitch` was DELETED** — a control over a result list reads as „narrow these", so the thing that narrows is the filter, and with one catalogue there is no second page to navigate to. `FilterRow` still takes EITHER an `href` OR an `onClick`; the merged rail uses `onClick` throughout and the container writes the whole selection back into the URL (`?type=` `?cats=` `?trade=` `?city=` …), so every view is still an address and Back still walks through them. **A drawer or a dropdown bar is no longer a second form**; search and sort are not filters and live in the results header, with the count („ნაჩვენებია N", no noun — the list may hold either half). The reader picks the layout there too: `components/catalog/ViewToggle` + `useCatalogView` (one `localStorage` key, `mcodne:catalog-view`; `VIEW_CLASS` writes the two containers once and the same `view` goes to the card). TWO cards in one list, one per PERSON: `app/experts/_card` for anybody offering consultations, `app/experts/_masterCard` otherwise, both through `components/EntityCard`, each keeping its own footer and CTA, plus `EntityKinds` labels when the list is mixed. Three empty states (nothing listed / this filter matched nobody / the cross-half contradiction, „ამ ფილტრით არავინ არის — მოხსენი ფილტრი").
3. **Profile** — breadcrumb, hero, blocks, reviews, CTA.
4. **Intake wizard** — `Container size="narrow"` (560); **never a hand-written `max-w-[Npx]`**; one `components/StepIndicator`. Chrome: choosing → full `PublicTopBar`+`Footer`; mid-transaction → the minimal bar.
5. **Workspace** — ≥4 items → sidebar, fewer → link bar; **always a bottom nav on mobile**; every page opens with `<PageHeader>`; rhythm `py-8 lg:py-10`.
6. **Form / detail** — `<PageHeader>` + `Card` blocks.
7. **Admin tab** — 19/19 use `app/admin/_parts.tsx`; the model to copy.

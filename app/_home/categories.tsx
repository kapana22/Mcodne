'use client'
// Home — „რაში ეხმარებიან ხშირად": the spheres as coloured tiles.
//
// ⚠️ REBUILT 2026-08-31 FROM THE OWNER'S DESIGN CANVAS („mcodne.ge პროფილის
// რედიზაინი" → Home). What it replaces was six grey rows with an icon, a name
// and a numeral — correct, and completely flat: eight doors you had to READ to
// tell apart. The canvas gives each one a coloured plate, and the colours are
// the point (see `TILE_HUES` in ./data for why that is a widening of the
// palette canon rather than a breach of it).
//
// ⚠️ THE PLATE IS THE CANVAS'S `<image-slot>`, FILLED (2026-08-31). The canvas
// drew a photograph behind every tile; the first pass shipped the hue alone
// because a Category has a name, a slug, a status and a parent — no picture,
// and no admin screen that uploads one. It still has no such column. The
// photograph is a PROPERTY OF THE SPHERE, not of the row: one file per slug in
// `public/categories/`, named beside the mark in lib/categoryMarks, so the
// tile, and anything else that ever wants a sphere's picture, reads one map.
//
// ⚠️ THE HUE DID NOT LEAVE — it moved on top. A flat wash of the tile's own
// colour over the photo, plus a fade into the card body at the bottom, is what
// keeps eight stock photographs reading as one family instead of a collage:
// same trick as TILE_HUES' fixed chroma, one layer up. Without it the plate is
// eight strangers' exposures side by side, and the seam where the picture stops
// is a hard line the canvas never drew.
//
// ⚠️ A SPHERE WITH NO PHOTOGRAPH STILL WORKS. `categoryPhoto` answers null for
// a slug we have no picture for and the plate falls back to exactly what it was
// — hue, corner light, mark. A tile is never blank and never borrows somebody
// else's picture.
//
// ⚠️ POPULATED CATEGORIES ONLY, and that rule is now doing the whole job. A
// tile that leads to „ვერ ვიპოვეთ" is a dead end the visitor built for us, and
// the filter — which applies the catalogue's own visibility rule, so a tile and
// the page it opens can never disagree — is what prevents it. It lives in
// app/page.tsx with the query.
//
// ⚠️ THE COUNT BESIDE THE NAME IS GONE (2026-09-02). „7 ექსპერტი · 40₾-დან" was
// justified as that same promise made checkable before the click; the filter had
// already made it, and what the number added was a supply figure that is at its
// smallest exactly where a visitor is deciding whether to bother — business 1,
// IT 2. Owner: „არასად არ ეწეროს ეგ ინფო, არასაჭიროა." The price floor stays;
// it is the fact a person choosing a sphere can actually use.

import Link from 'next/link'
import Image from 'next/image'
import { ReactNode } from 'react'
import { SiteText } from '@/components/SiteTextProvider'
import { Reveal } from '@/components/Reveal'
import { Container } from '@/components/Container'
import { Icon } from '@/components/Icon'
import { ALL_CATEGORIES_PHOTO, REQUEST_TILE_PHOTO, categoryIcon, categoryPhoto } from '@/lib/categoryMarks'
import { HomeCat, TileHue, tileHue } from './data'

/**
 * ⚠️ SIX SPHERES PLUS TWO DOORS — and the number is GEOMETRY, not taste.
 *
 * The grid is 4-up on `lg`, so a full block is a multiple of four. It was seven
 * spheres plus the catalogue door, which is eight only while seven spheres are
 * populated; measured 2026-08-31 exactly SIX are (marketing 7 · tax 6 · law 5 ·
 * psychology 3 · it 2 · business 1), every other category holds nobody and is
 * HIDDEN — so the row ended one tile short and the owner saw the hole.
 *
 * The hole could NOT be closed with a seventh sphere. „POPULATED ONLY" above is
 * the rule that stops a tile opening „ვერ ვიპოვეთ", and printing „0 ექსპერტი"
 * to fill a grid is the invented number CLAUDE.md forbids. Two fixed doors
 * instead: the whole catalogue, and the site's own action — the visitor who
 * does not find their sphere among six should be describing what they need.
 *
 * At six it stays eight whichever way the roster moves: a seventh sphere going
 * live no longer pushes the grid to nine and one hole in the SECOND row.
 */
const SPHERE_TILES = 6

/**
 * The tile's picture band — ONE of them, drawn for both the seven spheres and
 * the „ყველა სერვისი" door, which differ only in their picture and their mark.
 *
 * `sizes` is measured, not guessed: the grid is 2-up until `lg` and 4-up above
 * it inside Container `wide` (1280 − 64 gutter − 48 gap) ÷ 4 = 292px. Getting
 * it wrong is not a layout bug — it is next/image fetching a 1280px file for a
 * 292px slot on every visit to the busiest page on the site.
 */
const Plate = ({ hue, photo, mark }: { hue: TileHue; photo: string | null; mark: ReactNode }) => (
  <span className="relative block h-[110px] overflow-hidden bg-white/40 sm:h-[150px]">
    {photo ? (
      <>
        {/* Decorative: the label underneath names the sphere, and a screen
            reader that heard both would hear it twice. */}
        <Image
          src={photo}
          alt=""
          aria-hidden
          fill
          sizes="(min-width: 1024px) 292px, 50vw"
          className="object-cover transition-transform duration-slow ease-out-quart motion-safe:group-hover:scale-[1.06]"
        />
        {/* ⚠️ THE FADE INTO THE CARD IS GONE (2026-09-02). Owner, holding a
            screenshot of the eight tiles: „გრადიენტები მოაშორე."

            It was `linear-gradient(to bottom, transparent 42%, hue 100%)` — the
            photograph dissolving into the tile's colour over its bottom half —
            and its stated job was to stop eight stock photographs reading as a
            collage. The flat wash below does that job on its own: one hue at
            one opacity over every picture is what makes them a family. The
            gradient added the DISSOLVE, and the dissolve is the thing that read
            as dated.

            What replaces it is an edge: the picture ends where it ends, and the
            card's colour begins. That is a decision about taste and it is the
            owner's — this note exists so the next reader knows the collage
            argument was answered rather than forgotten. */}
        <span aria-hidden style={{ backgroundColor: hue.bg }} className="absolute inset-0 opacity-[0.22]" />
      </>
    ) : (
      /* The plate's own light, in the tile's hue — what stops a flat rectangle
         reading as a missing image on a sphere we have no photograph for.
         (It used to say „the same gesture as the hero's two circles"; those
         went on 2026-08-31 at the owner's request. This one is not decoration
         — it is the stand-in for a photograph, which is why it stayed.) */
      <span
        aria-hidden
        style={{ backgroundColor: hue.border }}
        className="absolute -right-6 -top-8 h-[120px] w-[120px] rounded-full opacity-60"
      />
    )}
    {/* 40px white chip — the canvas's, and the reason the mark stays legible
        whatever the photograph underneath is doing. */}
    <span
      aria-hidden
      style={{ color: hue.ink }}
      className="absolute left-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-field bg-white/[0.92] shadow-xs"
    >
      {mark}
    </span>
  </span>
)

export const Categories = ({
  categories,
  requestHref = null,
}: {
  categories: HomeCat[]
  /**
   * ⚠️ THE EIGHTH TILE'S ADDRESS, OR NULL (2026-08-31). It was written here as
   * a literal, and a literal is wrong twice over. FEATURE_REQUESTS is a kill
   * switch an operator can flip from a dashboard, and a `'use client'` section
   * cannot read an environment variable — so the hardcoded version was a door
   * onto a 404 on the busiest page on the site the moment the flag went off.
   * And the intake is CLOSED to somebody who sells here (owner, 2026-08-31:
   * „ვისაც სერვისი აქვს იმას არ შეძლოს სერვისის დაკვეთა"), so a permanent tile
   * would invite a provider to buy, three rows under their own catalogue.
   *
   * app/page.tsx answers both questions ONCE, on the server, from an
   * `initialUser` it has already resolved — `requestsOn() && !provider`. The
   * hero reads the same value for the same reason, so the two surfaces on this
   * page can never disagree about whether the subsystem exists. null draws no
   * tile; the sphere cap below closes the row instead.
   *
   * ⚠️ AND NO STRING LITERAL, HERE OR IN A COMMENT. tests/requests.test.ts
   * greps every file outside the subsystem for a quoted intake address and
   * fails on it — the scan is what keeps the door count knowable, and the
   * exemption list is only for surfaces that cannot take the address as a prop.
   */
  requestHref?: string | null
}) => {
  // ⚠️ SEVEN WHEN THERE IS NO EIGHTH DOOR. The cap exists to keep the grid a
  // whole number of rows (see SPHERE_TILES), and „how many spheres fit" depends
  // on how many fixed doors follow them: with the intake tile it is 6 + 2, and
  // for a provider — or a deployment with the flag off — it is 7 + 1. Fixing it
  // at six would leave exactly the hole this change was made to close, for the
  // one audience that never sees the tile.
  const tiles = categories.slice(0, requestHref ? SPHERE_TILES : SPHERE_TILES + 1)
  // Nothing populated yet: draw nothing rather than a heading over an empty
  // grid. Same rule as the roster below it.
  if (tiles.length === 0) return null

  return (
    <section className="pt-14 sm:pt-16 lg:pt-[4.5rem]">
      <Container size="wide">
        <Reveal className="mb-6 flex flex-wrap items-end justify-between gap-6">
          <h2 className="font-display text-h2 font-extrabold tracking-[-0.02em] text-ink-900 sm:text-h1">
            <SiteText k="home.tiles.title" />
          </h2>
          <Link
            href="/experts"
            className="inline-flex h-11 items-center rounded-field border border-ink-200 bg-white px-[18px] font-display text-body font-semibold text-ink-900
                       transition-colors duration-fast ease-out-quart hover:border-ink-300 hover:bg-ink-75
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            <SiteText k="home.tiles.allCta" />
          </Link>
        </Reveal>

        <Reveal
          stagger
          className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        >
          {tiles.map((c, i) => {
            const hue = tileHue(i)
            return (
              /* → /experts?category=<slug>: /categories/* was retired in stage
                 8 and 308s to exactly this — the catalogue's own filter is the
                 sphere page now. */
              <Link
                key={c.slug}
                href={`/experts?category=${c.slug}`}
                style={{ backgroundColor: hue.bg, borderColor: hue.border }}
                className="group flex flex-col overflow-hidden rounded-card border text-ink-900
                           transition-[transform,box-shadow] duration-mid ease-out-quart
                           hover:shadow-card-hover motion-safe:hover:-translate-y-1
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
              >
                <Plate hue={hue} photo={categoryPhoto(c.slug)} mark={categoryIcon(c.slug, 'w-5 h-5')} />

                <span className="block px-[18px] pb-[18px] pt-4">
                  <span className="block font-display text-body-lg font-bold tracking-[-0.01em]">
                    {c.name}
                  </span>
                  {/* ⚠️ THE PER-SPHERE COUNT IS GONE (2026-09-02), AND THE JOB
                      IT WAS DOING IS STILL DONE. The argument for it was that a
                      tile must not open „ვერ ვიპოვეთ" — but „POPULATED
                      CATEGORIES ONLY" above is what prevents that, and it does
                      so before this span is ever rendered. What the number added
                      on top of the filter was reassurance, and measured
                      2026-09-02 it was doing the opposite for half the grid:
                      marketing 6 · tax 6 · law 5 · psychology 3 · IT 2 ·
                      business 1. „ბიზნესი · 1 ექსპერტი" does not tell a client
                      the tile works; it tells them nobody is there.

                      🔒 ONLY WHAT WAS MEASURED still holds — the floor appears
                      only when somebody in that sphere actually named a price,
                      and it is the fact a person choosing a sphere can use. */}
                  {typeof c.priceFrom === 'number' && c.priceFrom > 0 && (
                    <span className="mt-1 block text-meta tabular-nums text-ink-500">
                      {c.priceFrom}₾-დან
                    </span>
                  )}
                </span>
              </Link>
            )
          })}

          {/* THE EIGHTH DOOR — the whole catalogue, in the neutral hue the
              palette keeps for it. It is a tile rather than a text row because
              the canvas made it one, and because „everything else" is a real
              destination on a page that shows seven of twenty-odd spheres. */}
          <Link
            href="/experts"
            style={{ backgroundColor: tileHue(7).bg, borderColor: tileHue(7).border }}
            className="group flex flex-col overflow-hidden rounded-card border text-ink-900
                       transition-[transform,box-shadow] duration-mid ease-out-quart
                       hover:shadow-card-hover motion-safe:hover:-translate-y-1
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            <Plate
              hue={tileHue(7)}
              photo={ALL_CATEGORIES_PHOTO}
              mark={<span className="text-h3 font-bold leading-none">+</span>}
            />
            <span className="block px-[18px] pb-[18px] pt-4">
              <span className="block font-display text-body-lg font-bold tracking-[-0.01em]">
                <SiteText k="home.tiles.allTile" />
              </span>
              {/* ⚠️ THE ROSTER SIZE IS NOT PRINTED HERE ANY MORE (2026-09-02).
                  Owner: „არასად არ ეწეროს ეგ ინფო, არასაჭიროა."
                  It was also WRONG in a way nothing caught: this tile said
                  „25 ექსპერტი" while /experts, one click away, headed itself
                  „23 ექსპერტი" — two counts of one roster, from two queries
                  with two visibility rules, disagreeing on the same journey.
                  Deleting the claim settles it; there is now one place the
                  roster is described, and that is the roster itself. */}
            </span>
          </Link>

          {/* THE EIGHTH DOOR — /request. It is the only tile that is not a
              place to BROWSE, and that is the reason it is here rather than a
              seventh sphere: six spheres cover 24 of the 25 people on the site,
              and somebody whose need is outside them is served by describing it,
              not by opening a filter with nobody behind it. It carries no count
              because there is nothing to count — the line under it says what the
              tile does, in the same slot the others give to their statistic. */}
          {requestHref && (
          <Link
            href={requestHref}
            style={{ backgroundColor: tileHue(6).bg, borderColor: tileHue(6).border }}
            className="group flex flex-col overflow-hidden rounded-card border text-ink-900
                       transition-[transform,box-shadow] duration-mid ease-out-quart
                       hover:shadow-card-hover motion-safe:hover:-translate-y-1
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            <Plate
              hue={tileHue(6)}
              photo={REQUEST_TILE_PHOTO}
              mark={<Icon.chat className="w-5 h-5" />}
            />
            <span className="block px-[18px] pb-[18px] pt-4">
              <span className="block font-display text-body-lg font-bold tracking-[-0.01em]">
                <SiteText k="home.tiles.askTile" />
              </span>
              <span className="mt-1 block text-meta text-ink-500">
                <SiteText k="home.tiles.askMeta" />
              </span>
            </span>
          </Link>
          )}
        </Reveal>
      </Container>
    </section>
  )
}

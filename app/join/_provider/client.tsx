'use client'
// THE FORM — THREE SCREENS: რას აკეთებ · ვინ ხარ · სამუშაოს ფოტოები.
//
// ⚠️ IT WAS ONE SCROLL UNTIL 2026-09-02. Owner: „ვფიქრობ 3 ეკრანზე რომ იყოს
// კარგი იქნება და კომფორტული, ლოგიკურად დალაგებული… ანუ რეგისტრაციას 3 და
// რედაქტირებისას ერთი მთლიანი."
//
// The three stages existed already — the STAGES table below has driven the
// panels, the refusal map and the „დარჩა" list since 2026-08-31 — but all three
// rendered at once, 2 900px of them, so „three stages" was a description of the
// source rather than of anything the applicant experienced. What changed is
// only WHICH ONE IS ON SCREEN; not one question moved, and the table is still
// the single source the panels, the rail and the refusals all read.
//
// The split is measured against how the marketplaces this form competes with do
// it (Mobbin, 2026-09-02): Airbnb's service listing is six screens, one question
// each, with a step counter and „Save and exit"; Airtasker's is seven, named in
// a left rail. Neither puts two questions on one screen. Dribbble, asked for at
// most three categories out of a large taxonomy, never draws the taxonomy at
// all — a closed combobox with a grouped typeahead. That last one is the
// unfinished business here: see the note on the browse panel in stage 1, which
// measures what this form still shows.
//
// ⚠️ EDITING IS THE OPPOSITE, AND ON PURPOSE — „რედაქტირებისას ერთი მთლიანი".
// /work/profile is ONE page with one draft and one save (its own header says
// why). A wizard is right the first time, when the applicant does not know what
// is coming and each answer should be the only thing on screen; it is wrong on
// the twentieth visit, when they came to change one number and a wizard would
// make them walk past everything else to reach it.
//
// ⚠️ IT WAS SEVEN BLOCKS UNTIL 2026-08-31, and the owner's canvas
// („mcodne.ge პროფილის რედიზაინი" → `Join.dc.html`) draws three. The canvas is
// the newer decision, so the questions were not deleted — they were FILED under
// the three names it uses. „რომელ კატეგორიაშია შენი საქმე" and the prices are
// part of what you do; „შენ შესახებ" and your face are part of who you are.
//
//   THE RULE THAT LOST. „Cheap and identifying first (who, phone), then the
//   facts routing needs (trade, city), then the sentence, then the things that
//   cost effort." It was written to protect the applicant who abandons halfway:
//   leave after block 2 and we can at least call you. The canvas inverts it and
//   asks what you SELL first — which is what the door already asked one screen
//   earlier („რას აკეთებ", ProfessionPicker) and what this form types into its
//   own search from that answer. Asking it second made the applicant answer the
//   same question twice with a page of contact details in between. The
//   abandonment argument survives in the draft (localStorage, below), which is
//   the thing that actually protects a half-finished form.
//
// ⚠️ THE RAIL AT THE TOP IS THE SAME THREE THINGS AS THE PANELS. The canvas
// draws a three-segment progress rail, and this file previously refused to
// build it, arguing that „a rail that says 3 over a form with six is a promise
// the scroll breaks". That was true of six blocks and it is the reason the
// blocks became three: one STAGES table (below) is the rail AND the panels AND
// the map from a refused field to the card that turns red, so the three cannot
// disagree about how many steps there are.
//
// ⚠️ EVERY BOUND COMES FROM lib/providerApplication, and since 2026-08-31 so
// does the BODY: `providerApplicationBody` builds it and `ProviderApplicationInput`
// judges it, here and on the server. Nothing on this screen invents a limit or
// a rule — see that file's header for the production break that taught it.

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Container } from '@/components/Container'
import { PublicTopBar } from '@/components/PublicTopBar'
import { Footer } from '@/components/Footer'
import { Card } from '@/components/Card'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { FIELD_ERROR_BORDER, useFault } from '@/components/FieldError'
import { PhotoUploader } from '../_shared/_upload'
import { JOIN_DOOR_LABEL } from '@/lib/capabilities'
import { VERTICAL_LABEL, topicById } from '@/lib/requestTopics'
import { tileHue } from '@/app/_home/data'
import {
  MASTER, MASTER_KINDS, PROVIDER_KIND_LABEL, PROVIDER_STATUS_TEXT,
  ProviderApplicationInput, providerApplicationBody, missingPhotoMessage,
  type ProviderApplicationDraft, type ProviderKind,
} from '@/lib/providerApplication'
import { validationIssueMessage } from '@/lib/validationMessages'
import { phoneFormatError } from '@/lib/phone'
import { WorkPhotos } from './_workPhotos'
import { SEND_FAILED } from '@/lib/actionErrors'
import { PRICE_ON_REQUEST } from '@/lib/requests'
import { topicGroupMark } from '@/lib/topicMarks'

type Vertical = 'SERVICE' | 'EXPERT'
type Group = { id: string; label: string; vertical?: Vertical; topics: { id: string; label: string; alt?: string[] }[] }

/* ⚠️ THE TWO WORLDS, IN THE ONE PAIR OF WORDS THE SITE OWNS. The names are
   lib/requestTopics → VERTICAL_LABEL, which is also what the catalogue's switch
   reads (app/experts/_filters → VerticalSwitch) and what the client filters by
   — so a provider picking here and a client filtering there are not merely
   „reading the same two names", they cannot read different ones. This card said
   „სერვისი სახლში" until 2026-09-01, which was one of FOUR names two surfaces
   had for these two things. */
// ⚠️ NO `hint` ANY MORE (2026-09-01). Each row carried an example list —
// „დალაგება, სანტექნიკა, ელექტრიკა…" and „ბუღალტერია, სამართალი, IT…" — printed
// under the label in the largest block on the page. Same too-concrete pattern
// already taken out of every search field on the site, and here it did real
// damage: five household nouns under the first option told a lawyer the site
// was not for them, before they had read the second. The two labels name the
// two halves; the list below names everything else.
const WORLD: { id: Vertical; label: string }[] = [
  { id: 'SERVICE', label: `${VERTICAL_LABEL.SERVICE} სერვისები` },
  { id: 'EXPERT', label: `${VERTICAL_LABEL.EXPERT} სერვისები` },
]
type City = { id: string; label: string }

const FIELD =
  'w-full h-11 px-3.5 rounded-field border border-ink-200 bg-white text-body text-ink-900 ' +
  'placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none ' +
  'transition-colors duration-fast'

/* ═══════════ THE THREE STAGES ══════════════════════════════════════════════
 *
 * ⚠️ ONE TABLE, FOUR JOBS — and that is the point of it existing at all. It is
 * the rail at the top, the numbered panels below it, the map from a refused
 * FIELD to the panel that turns red, and the count in the line under the
 * heading. Four surfaces that used to be able to disagree about how many steps
 * this form has now cannot: change a row here and all four follow.
 *
 * `fields` are the schema's own key names (lib/providerApplication), because
 * that is what a refusal arrives as — from our own parse or from the endpoint.
 * A key missing from every row would leave a refusal with no card to colour, so
 * every key the schema can name is listed, including the ones no control can
 * get wrong.
 */
type StageId = 'what' | 'who' | 'photos'
const STAGES: {
  id: StageId
  /** The panel heading. */
  label: string
  /** The rail label — the canvas abbreviates the third one. */
  rail: string
  hint?: string
  /** The canvas's dashed plate: a stage somebody may skip. */
  optional?: boolean
  fields: string[]
}[] = [
  {
    id: 'what', label: 'რას აკეთებ', rail: 'რას აკეთებ',
    hint: 'დაწერე შენი სიტყვებით.',
    fields: ['services', 'areas', 'priceFrom', 'calloutFee'],
  },
  {
    id: 'who', label: 'ვინ ხარ', rail: 'ვინ ხარ',
    hint: 'ამით დაგიკავშირდება კლიენტი.',
    fields: ['kind', 'fullName', 'phone', 'companyName', 'taxId', 'about', 'photoUrl'],
  },
  {
    // ⚠️ „სამუშაოს ფოტო", NOT „ფოტო" (2026-09-01, owner — looking at the rail).
    // Two different things were both called „ფოტო": the provider's own face,
    // asked for in „ვინ ხარ" and REQUIRED since this morning, and this stage,
    // which is the portfolio and genuinely optional. The rail drew the optional
    // one, greyed, under the word „ფოტო" — so somebody reading „3 ფოტო ·
    // არასავალდებულო" concluded that no photo was needed at all, and then hit a
    // refusal on a field they had been told to skip.
    // The name is the one this project already uses for the column (FIELD_WORD
    // below): `workPhotos` is „სამუშაოს ფოტოები". Nothing invented — the rail
    // simply stopped borrowing the other field's word.
    id: 'photos', label: 'სამუშაოს ფოტოები', rail: 'სამუშაოს ფოტო',
    optional: true,
    fields: ['workPhotos'],
  },
]

const stageOfField = (field: string): StageId | null =>
  STAGES.find(s => s.fields.includes(field))?.id ?? null

/** The three rows again, by id — so a PANEL takes its heading, its hint and its
 *  dashed plate from the same row the rail drew its segment from. Two surfaces
 *  reading one row is the whole reason the table exists. */
const STAGE = Object.fromEntries(STAGES.map(s => [s.id, s])) as Record<StageId, (typeof STAGES)[number]>

/** ⚠️ COUNTED, NOT TYPED — the same discipline as the block numbers below. The
 *  canvas's line is „ორი ნაბიჯი" and it is only true while exactly two stages
 *  are required; a third required stage must change the sentence, not lie in
 *  it. Georgian has no numeral formatter to ask, so the three words this can
 *  ever need are spelled and anything else falls back to the digit. */

/** Reading order down the page — what „დარჩა" lists first, and where a failed
 *  submit sends you. NOT the schema's key order: since the canvas put the
 *  services first, the two orders differ, and the applicant's is the page's. */
const FIELD_ORDER = [
  'services', 'areas', 'priceFrom', 'calloutFee',
  'kind', 'fullName', 'phone', 'companyName', 'taxId', 'about', 'photoUrl',
  'workPhotos',
]

/** The word beside the box, for the „დარჩა" links. ⚠️ NOT NEW COPY: every one
 *  is a heading or a label already printed on this screen — a link that does
 *  not name what you land on costs the click twice. */
const FIELD_WORD: Record<string, string> = {
  services: 'სერვისი', areas: 'ქალაქი', priceFrom: 'ფასი', calloutFee: 'გამოძახება',
  kind: 'ტიპი', fullName: 'სახელი', phone: 'ტელეფონი', companyName: 'კომპანიის სახელი',
  taxId: 'საიდენტიფიკაციო კოდი', about: 'შენ შესახებ',
  photoUrl: 'ფოტო', workPhotos: 'სამუშაოს ფოტოები',
}


/** One block of the form. The heading carries the number so the page reads as a
 *  short list rather than an unbounded scroll — a form whose end you can see is
 *  a form people finish. */
/**
 * ⚠️ THE NUMBER IS COUNTED, NOT TYPED (2026-08-20).
 *
 * Every block used to carry a hard-coded `n={3}`. The moment one of them
 * stopped rendering — „სად მუშაობ" did, the day the site went Tbilisi-only —
 * the form counted „1 2 4 5 6 7" on screen. A numbered list that skips a
 * number tells the person something is missing and that they should look for
 * it, which is the opposite of what a hidden block is for.
 *
 * The counter is a plain local declared in the component body and incremented
 * at each call site (`n={++blockNo}`). JSX children evaluate top-to-bottom in
 * one pass, so a block inside a `&&` that is false never takes a number. A
 * context holding a mutable counter was tried first and rejected: mutating a
 * value returned from `useContext` is exactly what the React compiler forbids,
 * and it was reaching for machinery a local variable already does.
 *
 * ⚠️ AND SINCE 2026-08-31 IT COUNTS TO THREE, BECAUSE THE PANELS ARE THE
 * STAGES. Every one of them renders unconditionally — a question somebody may
 * not be asked („სად მუშაობ" with one city, the two company boxes) is a `Sub`
 * INSIDE a stage now, not a panel of its own — so `++blockNo` and the rail's
 * own `i + 1` walk the same three rows in the same order and cannot come apart.
 * The counter is what makes that a fact rather than a promise: the day a fourth
 * stage arrives, or a stage becomes conditional, the numbers on screen stay
 * right without anybody remembering to renumber them.
 */
/**
 * ONE SECTION OF THE DOOR.
 *
 * ⚠️ REBUILT 2026-08-31 FROM THE OWNER'S DESIGN CANVAS („mcodne.ge პროფილის
 * რედიზაინი" → Join). The numeral was 11px uppercase text sitting to the left
 * of the heading, at the same weight as a label; the canvas makes it a filled
 * 26px disc. On a form this tall the numbers ARE the progress indicator — they
 * are what tells somebody how far in they are — and they could not do that job
 * set smaller than the heading beside them.
 *
 * ⚠️ THE CANVAS'S RAIL IS HERE NOW (2026-08-31) and this comment used to argue
 * that it could not be. „This form has more sections than three (who · what ·
 * where · about · photos · prices), and a rail that says 3 over a form with six
 * is a promise the scroll breaks." The premise was right and the conclusion was
 * backwards: the fix is not to drop the rail, it is to stop having six. See
 * STAGES — the panels and the rail are now the same three rows.
 *
 * `optional` is the canvas's dashed plate: a section somebody may skip should
 * not look like one they cannot.
 *
 * ⚠️ `invalid` PAINTS THE WHOLE PANEL (2026-08-31). Owner: „ვალიდაციები რომ
 * აისქროლოს ზევით და გაწითლდეს თუ შეცდომა … და ქარდი მთლიანად გაწითლდეს."
 * A red 1px outline on one input, 2 600px down a form, is a mark you have to
 * already be looking at to see; the card is what you see when the scroll lands.
 * It is driven by the SAME fault that draws the message beside the field and
 * the same list the sticky bar reads, so the three cannot point at different
 * things. Decoration only — the fact is carried by `aria-invalid` and
 * `role="alert"` on the control (components/FieldError).
 */
function Block({ n, title, hint, field, optional, badge, invalid, children }: {
  n: number; title: string; hint?: string
  /** Makes the whole block a jump target for the „დარჩა" list — see jumpTo. */
  field?: string
  optional?: boolean
  /** A chip beside the heading — used for the credit a section earns. */
  badge?: React.ReactNode
  /** This stage owns the answer a submit stopped on. */
  invalid?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      data-field={field}
      /* `mt-5` (20px) is the canvas's 22px gap rounded onto the spacing scale —
         at `mt-4` two 28px-radius panels read as one stack rather than as two
         steps, which is the thing the numbers are trying to say. */
      className={`mt-5 rounded-panel p-6 sm:p-7 transition-colors duration-mid ${
        invalid ? 'border-2 border-danger-500 bg-danger-50'
          : optional ? 'border border-dashed border-ink-300 bg-white'
          : 'border border-ink-100 bg-white'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span className={`inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full font-display text-micro font-extrabold tabular-nums ${
          invalid ? 'bg-danger-600 text-white'
            : optional ? 'border border-ink-300 bg-white text-ink-600'
            : 'bg-brand-700 text-white'
        }`}>
          {n}
        </span>
        {/* `text-h2` (22px), not `text-h3` — the canvas sets a panel heading at
            21px, and at 18px it sat below the 26px numeral beside it, which made
            the number look like the heading and the heading like a label. */}
        <h2 className="font-display text-h2 font-extrabold tracking-[-0.02em] text-ink-900">{title}</h2>
        {optional && (
          <span className="inline-flex h-[26px] items-center rounded-pill border border-ink-200 bg-ink-75 px-2.5 font-display text-meta font-semibold text-ink-600">
            არასავალდებულო
          </span>
        )}
        {badge}
      </div>
      {hint && <p className="mt-2 text-small leading-relaxed text-ink-600">{hint}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

/**
 * ONE QUESTION INSIDE A STAGE.
 *
 * ⚠️ THIS IS WHERE `data-field` MOVED TO (2026-08-31). It was on the Block, and
 * a Block was one question then — „სად მუშაობ", „შენ შესახებ". A Block is a
 * whole STAGE now, and a stage is too big a target: scrolling somebody to the
 * top of „ვინ ხარ" when what is missing is the sentence at the bottom of it is
 * the same „go and find it" the jump links were built to end. The Block keeps
 * the prop for the one case where the panel really is the answer (the photos).
 */
function Sub({ title, hint, field, children }: {
  title: string; hint?: string
  /** The schema key this question answers — the jump target. See jumpTo. */
  field?: string
  children: React.ReactNode
}) {
  return (
    <div data-field={field} className="mt-6">
      <h3 className="font-display text-body font-bold text-ink-900">{title}</h3>
      {hint && <p className="mt-1 text-small leading-relaxed text-ink-600">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  )
}

/** A selectable option (topic, city) — `aria-pressed`, brand fill when on. NOT
 *  the catalogue filter chip; it only shares the pill shape.
 *
 * ⚠️ THE SAME CHIP AS THE DOOR'S (2026-08-31). `components/ProfessionPicker`
 * ported this exact control from the owner's canvas one screen earlier — 44px
 * floor, brand-700 fill, a tick when it is on, and a label that WRAPS rather
 * than truncating („სამზარეულოს ტექნიკის შეკეთება" is not a choice when it is
 * cut to „…შეკე…"). The door and the form ask the same kind of question with
 * the same gesture; they had drifted to two fills and two heights.
 * `h-11` became `min-h-11` for the wrap, which keeps the 40px floor. */
/**
 * A CATEGORY, not an answer — the row that narrows the service chips below it.
 *
 * ⚠️ IT IS NOT `PickChip` AND THE DIFFERENCE IS THE POINT. PickChip's „on" is a
 * brand-700 flood with a tick, and that means „this is one of the twelve things
 * I sell". Opening „სამართალი" sells nothing; it changes what is on screen.
 * Same distinction the two world plates make one question up (KindChoice): a
 * control that RESHAPES the page says so with a tint, a control that RECORDS an
 * answer says so with a fill.
 */
function GroupChip({ on, count, onClick, groupId, children }: {
  on: boolean; count: number; onClick: () => void
  /** So the effect that opens a category can bring THIS chip into the strip's
   *  view — see the note on that effect. */
  groupId: string
  children: React.ReactNode
}) {
  /* ⚠️ THE SAME MARK THE INTAKE DRAWS (2026-09-02, owner: „კიდევ შეიძლება
     დამატება სადმე, რომ უფრო ლამაზი და მხიარული იყოს"). One taxonomy, one icon
     per family, read from lib/topicMarks — so „სამართალი" is the same scales
     wherever a person meets it: filing a request, registering, or editing what
     they sell. White on the open chip because that one is a filled brand
     surface; `brand-600` on the rest. `null` where a group has no honest mark,
     and the chip is simply text. */
  const mark = topicGroupMark(groupId, 'w-4 h-4 shrink-0')
  return (
    <button
      type="button"
      aria-pressed={on}
      data-group={groupId}
      onClick={onClick}
      /* ⚠️ `shrink-0` AND A FILL, BOTH BECAUSE THE ROW SCROLLS NOW (2026-09-02).
         In a wrapping block a chip could be a tint among twenty; in a strip
         where two are visible at a time, the one that is open has to be
         findable at a glance when you scroll back to it. Owner: „მთავარი
         სხვანაირი ღილაკი იყოს."
         Filled `brand-700`, not `brand-600`: white on a brand surface, and the
         canon starts fills at 600 (CLAUDE.md rule 2) — 700 is the token this
         project's other filled controls already use. */
      className={`inline-flex min-h-10 shrink-0 snap-start items-center gap-1.5 rounded-field border px-3.5 py-1.5 text-left font-display text-small font-semibold transition-[background-color,border-color] duration-fast ${
        on ? 'border-brand-700 bg-brand-700 text-white'
          : 'border-ink-200 bg-white text-ink-800 hover:border-ink-300 hover:bg-ink-75'
      }`}
    >
      {/* ⚠️ NOT `truncate` ANY MORE. In a wrapping block a long Georgian
          category had to be cut to keep the row sane; in a strip the row has no
          width to run out of, and a category whose name is clipped („ვიზა,
          მიგრაცია და…") is the one thing this control may not do — the names
          ARE the vocabulary somebody browsing came to read. */}
      {mark && <span className={on ? 'text-white' : 'text-brand-600'}>{mark}</span>}
      <span className="whitespace-nowrap leading-snug">{children}</span>
      {/* How many of this category's services are already ticked — so a
          category holding an answer is legible without opening it. Zero is not
          drawn: a badge that is always there stops being a signal. */}
      {count > 0 && (
        <span className={`inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-pill border px-1 font-display text-meta font-bold tabular-nums ${
          on ? 'border-white/40 text-white' : 'border-brand-200 text-brand-700'
        }`}>
          {count}
        </span>
      )}
      {/* ⚠️ THE TINT ALONE WAS NOT ENOUGH (2026-09-02, owner: „როცა აჭერ ვერ
          ხვდები რომ დაჭერილი გაქვს და ქვევით სერვისებია").
          Among twenty-eight white chips a brand-50 fill is a difference you
          have to go looking for, and — the half that actually bit — it says
          „chosen" without saying WHERE what you chose went. The chevron says
          both: it marks the one that is open and it points at the answer.
          It is this project's own idiom for exactly this, not a new one:
          app/work/profile/_secServices draws `Icon.chevD` with `rotate-180`
          on the control that opens a service group, and this is that control
          on the other side of the same question. `motion-safe:` is unnecessary
          — `duration-fast` on a transform is not vestibular motion — but the
          rotation is still a transition rather than a swap, so the two states
          read as one control moving. */}
      {/* ⚠️ ON THE OPEN ONE ONLY (2026-09-02). Twenty chevrons pointing at
          nothing added ~20px to every chip and were what turned this block into
          eleven wrapped rows in the owner's screenshot. The chevron is not
          decoration and not an affordance hint — it is the mark that says „this
          is the one whose services are below", which is a thing exactly one
          chip can be true of. */}
      {on && <Icon.chevD aria-hidden className="h-3.5 w-3.5 shrink-0 rotate-180 text-white" />}
    </button>
  )
}

function PickChip({ on, onClick, children, disabled }: {
  on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-10 max-w-full items-center gap-2 rounded-pill border px-3.5 py-1.5 text-left font-display text-small font-semibold transition-[background-color,border-color,transform] duration-fast motion-safe:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 ${
        on ? 'border-brand-700 bg-brand-700 text-white'
          : 'border-ink-200 bg-white text-ink-900 hover:border-ink-300 hover:bg-ink-75'
      }`}
    >
      {on && <Icon.check aria-hidden className="h-3.5 w-3.5 shrink-0" />}
      <span className="min-w-0 leading-snug">{children}</span>
    </button>
  )
}

/**
 * ONE OF TWO ANSWERS TO „ვინ ხარ" — ფიზიკური პირი or კომპანია.
 *
 * ⚠️ IT WAS A `PickChip` UNTIL 2026-08-31, i.e. the same 44px pill as „ბინის
 * დალაგება" three questions above it. The canvas draws two 52px plates
 * side by side, and the difference is not decoration: this is the ONE question
 * on the form that changes what the form asks next (a company gains two more
 * boxes), and a control that reshapes the page cannot look like a chip in a
 * list of thirty. Selected is the canvas's brand border over a brand-50 fill —
 * a tint, not a flood, because both options stay readable answers.
 */
function KindChoice({ on, onClick, multi = false, children }: {
  on: boolean; onClick: () => void
  /**
   * ⚠️ „ANY OF", NOT „ONE OF" — and the difference has to be VISIBLE
   * (2026-09-02, owner: „აქ ერთ მიმართულებას ირჩევ მარტო, ორივეს ვერ
   * აირჩევ").
   *
   * The behaviour was already right: `toggleWorld` adds and removes, and both
   * worlds can be on at once — verified in the browser the day this was
   * reported. What was wrong is that NOTHING SAID SO. Two identical plates side
   * by side is the universal radio idiom; a reader tries one, sees it light up,
   * and stops. The copy above them („აირჩიე ერთი ან ორივე") was being
   * contradicted by the control under it, and the control wins.
   *
   * This is the half I dropped on 2026-09-02 when these two moved off
   * `PickChip` — the owner asked for a rectangle rather than a pill and I
   * argued, correctly, that a control which RESHAPES the page marks itself with
   * a tint rather than a flood. The tick is not about tint-versus-fill. It is
   * about one-of versus any-of, and it belongs on any-of whatever the shape.
   *
   * `false` for the kind question two screens along („ინდივიდუალური /
   * კომპანია"), which is genuinely exclusive and where a tick would promise the
   * opposite lie.
   */
  multi?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      // `aria-pressed` on a toggle is already „any of" to a screen reader; the
      // tick is what says it to everybody else.
      aria-pressed={on}
      onClick={onClick}
      /* ⚠️ `min-h`, NOT `h` (2026-09-02). It was a fixed 52px, which is right
         for „ინდივიდუალური" and „კომპანია" and was the only thing this plate
         ever had to hold. The two WORLD labels („ყოველდღიური სერვისები") are
         three times as long and, on a phone, wrap — against a fixed height that
         is text spilling out of a button. The short labels still measure 52px,
         so nothing about the kind question changes. */
      className={`inline-flex min-h-[52px] min-w-[160px] flex-1 items-center justify-center gap-2 rounded-field border px-4 py-2 font-display text-body font-bold leading-tight transition-[background-color,border-color] duration-fast ${
        on ? 'border-brand-700 bg-brand-50 text-brand-900'
          : 'border-ink-200 bg-white text-ink-900 hover:border-ink-300 hover:bg-ink-75'
      }`}
    >
      {/* Only on the multi-choice, and only when it is on: an empty box drawn
          beside every option would be a checkbox list, which is a heavier
          control than two plates and is not what the canvas draws. */}
      {multi && on && <Icon.check aria-hidden className="h-4 w-4 shrink-0 text-brand-700" />}
      <span className="min-w-0">{children}</span>
    </button>
  )
}

export function ProviderApplyClient({ email, name, phone: accountPhone = '', me, seed, initialStatus = null }: {
  email: string; name: string; phone?: string; me: any
  /** What the SERVER already knows about this person's application, so the
   *  first paint is not a registration form shown to somebody who registered.
   *  See app/join/page.tsx. */
  initialStatus?: string | null
  /**
   * ⚠️ THE DOOR'S ANSWER, CARRIED IN (2026-08-20). The applicant has already
   * named their job — „სანტექნიკოსი" — and this form then asked them to find
   * it again in a 31-row catalogue of SERVICE topics, in our words. The two
   * vocabularies do not map (a SERVICE topic deliberately carries no
   * `professions`; see lib/requestTopics), so nothing can be TICKED for them.
   * What can be done is the search: the topics carry `alt`, the words people
   * actually type, and „სანტექნიკოსი" is one of them. So their own word is
   * typed into the search box for them — and only when it actually finds
   * something, because a pre-filled query that answers „ვერაფერი მოიძებნა" is
   * worse than an empty one.
   */
  seed?: { cats?: string[]; professions?: string[] }
}) {
  const router = useRouter()

  const [groups, setGroups] = useState<Group[]>([])
  /* ⚠️ ASKED ONCE, AND IT NARROWS EVERYTHING BELOW IT (2026-08-30). Owner:
     „როდესაც დამლაგებლად დაამატა სერვისი, იმას ხომ არ ექნება სურვილი
     ბუღალტრის სერვისი ჰქონდეს… ზედმეტ რაღაცებს აღარ უნდა თავაზობდეს."

     Measured the same day on the 28 live providers with services: every one
     is inside ONE vertical and 26 of 28 inside one GROUP — 1.1 groups each.
     The browse list was 28 groups deep for people who use one.

     Null until they answer, because the honest default is „we do not know
     yet" — not „professional", which would put a cleaner in front of a law
     column on their first screen. */
  /**
   * ⚠️ BOTH MAY BE TRUE (2026-09-01, owner: „ან ორივე ისერჩებოდეს და მერე მაგ
   * ორი კატეგორიის მიხედვით ყალიბდებოდეს").
   *
   * This was a single `Vertical | null` — one of „სერვისი სახლში" or
   * „პროფესიული სერვისები", never both. A designer who also does small repairs,
   * or an accountant who also cleans, had to pick the half they cared about
   * less and then hunt the rest through search. The site's own model does not
   * force that choice: `world` is a BROWSE FILTER and nothing else — it is not
   * in `providerApplicationBody`, so it never reaches the application. It was
   * narrowing the list, and it can narrow to two as easily as to one.
   *
   * Empty means everything, which is also what it meant before a choice was
   * made. Nobody is now required to answer a question to see the list.
   */
  const [worlds, setWorlds] = useState<Vertical[]>([])
  const toggleWorld = (id: Vertical) =>
    setWorlds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  // ⚠️ A HIDDEN BOX MUST NOT KEEP POSTING. The call-out fee is only asked of the
  // SERVICE world (see the field below); somebody who typed one and then moved
  // to EXPERT would otherwise have gone on sending it from a control they can no
  // longer see — the shape of bug that is invisible until a lawyer's card shows
  // a call-out price.
  useEffect(() => {
    if (worlds.length > 0 && !worlds.includes('SERVICE')) setCalloutFee('')
  }, [worlds])
  const [cities, setCities] = useState<City[]>([])
  const [status, setStatus] = useState<string | null>(initialStatus)
  const [note, setNote] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const [kind, setKind] = useState<ProviderKind>('INDIVIDUAL')
  const [fullName, setFullName] = useState(name)
  // Seeded from the account — see page.tsx for why it was not.
  const [phone, setPhone] = useState(accountPhone)
  const [companyName, setCompanyName] = useState('')
  const [taxId, setTaxId] = useState('')
  const [services, setServices] = useState<string[]>([])
  const [areas, setAreas] = useState<string[]>([])
  /** Which service group is open. `null` = „nobody has chosen yet", which lets
   *  a group that already holds a tick open itself; `''` = deliberately closed. */
  /** What they typed into the service search. Two characters before it filters —
   *  one letter matches half the catalogue and reads as broken. */
  const [query, setQuery] = useState('')
  /* ⚠️ THREE SCREENS SINCE 2026-09-02, AND THE COUNTER WENT WITH THE SCROLL.
     Owner: „ვფიქრობ 3 ეკრანზე რომ იყოს კარგი იქნება და კომფორტული, ლოგიკურად
     დალაგებული… ანუ რეგისტრაციას 3 და რედაქტირებისას ერთი მთლიანი."

     What this replaces: `let blockNo = 0`, incremented at each `<Block>` so the
     panels numbered themselves in RENDER order. That was the right answer while
     all three were on one page and one of them could vanish. With one panel on
     screen at a time a render-order counter would print „1" on every step — the
     number is now the step's POSITION, which `STAGES` already holds and which
     cannot drift from the rail because the rail reads the same array.

     ⚠️ AND THE RAIL IS BACK, WHICH IS NOT A REVERSAL. It was deleted on
     2026-09-01 with the owner's own instruction attached: „ან ფუნქცია მიეცი რომ
     გადავიდეს გადმოვიდეს ან საერთოდ წაშალე." Both halves of that sentence were
     offered and the second was taken, because the form was one page and the
     rail indexed nothing. This is the first half. */
  /** Which category's services are on screen. `null` = none opened yet, so the
   *  panel is the row of categories alone — see the browse panel in stage 1. */
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [step, setStep] = useState<StageId>('what')
  const stepIndex = STAGES.findIndex(s => s.id === step)
  /** `{ topicId: „60" }` — the raw input strings, cleaned at submit. Keyed by
   *  the ticks in `services`, so nothing here has to be named twice. */
  /** „ფასი შეთანხმებით" — the OTHER half of the one price question. It is not
   *  stored: `priceFrom === null` is what the column says and what the card
   *  reads. See lib/providerApplication for why it still travels in the body. */
  const [priceOnAsk, setPriceOnAsk] = useState(false)

  /**
   * What the typed query reaches.
   *
   * ⚠️ IT SEARCHES `alt` TOO, and that is most of its value. The catalogue's
   * topics carry the words people actually type — „დამლაგებელი" for
   * „ბინის დალაგება", „სანტექნიკოსი" for the plumbing rows (lib/requestTopics
   * → Topic.alt). A search that only matched the printed label would fail the
   * exact person it is for: the one who describes their trade in their own
   * words rather than ours.
   */
  const hits = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return groups
      .flatMap(g => g.topics)
      .filter(t => t.label.toLowerCase().includes(q) || (t.alt ?? []).some((a: string) => a.toLowerCase().includes(q)))
      .slice(0, 24)
  }, [query, groups])
  const [about, setAbout] = useState('')
  const [calloutFee, setCalloutFee] = useState('')
  const [priceFrom, setPriceFrom] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | undefined>()
  const [workPhotos, setWorkPhotos] = useState<string[]>([])

  const [sending, setSending] = useState(false)
  /** ONLY what has no field to land on — a dropped network, a status code this
   *  screen did not predict. Anything the schema can name goes to `fault`. */
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  /** ⚠️ SUBMITTED IS A SCREEN, NOT A NOTE ON A FORM (2026-09-01). Measured on
   *  the day it was reported: a person whose application was already SUBMITTED
   *  got `<h1>დაარეგისტრირე სერვისი</h1>` and 3 324px of pre-filled, fully
   *  editable form, with „განაცხადი გამოგზავნილია" as ONE line inside it. There
   *  is no reading of that screen in which the application looks sent.
   *  The form is one tap away and nothing was taken from anybody — but the
   *  DEFAULT is now the answer to the question they actually have.
   *  NEEDS_REVISION and REJECTED deliberately keep opening on the form: those
   *  two states exist to be acted on, and their reason is drawn above it. */
  const [editing, setEditing] = useState(false)
  const sent = (done || status === 'SUBMITTED') && !editing

  /* ⚠️ THE CONFIRMATION WAS RENDERED OFF-SCREEN, AND THIS IS THE WHOLE OF THE
   * „თითქოს არ გაიგზავნა" (2026-09-01). Measured with a probe carrying this
   * page's real heights — topbar 64px, footer 821px, form 2 858px, viewport
   * 832px:
   *
   *   press „დასრულება" at scrollY 2 260 → the document shrinks 3 509px → 1 247px
   *   → the browser CLAMPS scrollY to its new maximum, 415
   *   → the confirmation card: 0 pixels on screen (its top is at −295)
   *   → the footer: 821 of the 832 visible pixels.
   *
   * So the applicant pressed the button and was left looking at the site's
   * footer — the same footer every page ends with, at the same URL. Nothing on
   * screen had changed in any way they could read, which is exactly what they
   * reported. The card was rendering the whole time, above the fold line.
   *
   * ⚠️ INSTANT, NOT SMOOTH — and this is the one place in the file where that
   * is the right answer. `jumpTo` scrolls smoothly because it MOVES WITHIN a
   * page the reader is already holding in their head. Here the page underneath
   * has just been replaced: a 2 000px animated glide would play through 800px
   * of footer that appeared in the same frame, which is motion with no
   * information in it. A navigation does not animate either. Instant also
   * means there is no `prefers-reduced-motion` question left to ask. */
  useEffect(() => {
    if (!sent) return
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [sent])

  /* ⚠️ THE SHARED MECHANISM SINCE 2026-08-31 (`components/FieldError` →
   * `useFault`), and this form was the LAST hand-rolled copy of it — it kept
   * its own `err` + `invalidField` pair and built the aria attributes inline.
   * Nineteen other forms ask the hook, so a refusal on the door now behaves
   * exactly like a refusal on signin: `aria-invalid` on the control,
   * `aria-describedby` pointing at a `role="alert"` message under it, one fault
   * at a time, and the fault cleared the moment they start fixing THAT box.
   *
   * ⚠️ `fail(..., { focus: false })` EVERYWHERE, and `jumpTo` does the moving.
   * Two reasons the hook's own focus cannot be used here: half the answers on
   * this form are not focusable controls (a row of chips, an uploader), and its
   * scroll is unconditionally `smooth` — see jumpTo for why that is not
   * something this screen may do to everybody. */
  const { fault, fail, props: faultProps, bad, clearField, reset: clearFault, error: fieldErr } = useFault('join')
  const fieldClass = (field: string) => bad(field) ? `${FIELD} ${FIELD_ERROR_BORDER}` : FIELD

  /* ═══════════ THE DRAFT ═══════════════════════════════════════════════
   *
   * ⚠️ THIS FORM LOST EVERYTHING TO A PHONE CALL (fixed 2026-08-20). The
   * expert door has saved its draft to localStorage since it was written; this
   * one saved nothing. Six blocks, a photo upload, and an incoming call —
   * which on a phone is not an edge case, it is Tuesday — and the applicant
   * starts again from „ვინ ხარ". Whoever measured the funnel would have seen
   * abandonment and never the cause.
   *
   * Photos are deliberately NOT stored: they are base64 data URIs, megabytes
   * each, and localStorage is a ~5MB budget shared with everything else on the
   * origin. Losing an upload is annoying; a quota error that silently drops the
   * WHOLE draft is the bug this is meant to prevent.
   */
  /* 🔒 KEYED BY THE ACCOUNT, AND IT WAS NOT (2026-09-02). It was the bare
     string `'mcodne:join:work'` — ONE key for the whole origin — and
     localStorage outlives a session. Found by registering two fresh accounts
     back to back in one browser, which is what the owner asked for: the SECOND
     person's brand-new form opened with the first person's service already
     ticked. Their name, their phone number, their prices and the paragraph they
     wrote about themselves are all in the same object.

     That is somebody else's contact details shown to a stranger — a shared
     laptop, an internet café, a phone handed to a friend to sign up on — and it
     also quietly produces applications that are half one person and half
     another. The submit path cleared the key; ABANDONING never did, and neither
     did signing out.

     `me.id` is the account this form is being filled by, so a draft can only
     ever be restored to the person who wrote it. The old unkeyed entry is
     deleted on the way past, once, so nobody keeps carrying it around. */
  const DRAFT_KEY = `mcodne:join:work:${me?.id ?? email}`
  const LEGACY_DRAFT_KEY = 'mcodne:join:work'

  // Restore once, before the server answers — a draft is the applicant's own
  // work and outranks an empty form, but never a submitted application (the
  // fetch below overwrites it, which is correct: that is the server's copy).
  useEffect(() => {
    try {
      // Whoever it belonged to, it is not addressed to anybody now.
      window.localStorage.removeItem(LEGACY_DRAFT_KEY)
      const raw = window.localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const d = JSON.parse(raw) as Record<string, unknown>
      if (typeof d.kind === 'string') setKind(d.kind as ProviderKind)
      if (typeof d.fullName === 'string') setFullName(d.fullName)
      if (typeof d.phone === 'string') setPhone(d.phone)
      if (typeof d.companyName === 'string') setCompanyName(d.companyName)
      if (typeof d.taxId === 'string') setTaxId(d.taxId)
      if (Array.isArray(d.services)) setServices(d.services as string[])
      if (typeof d.about === 'string') setAbout(d.about)
      if (typeof d.calloutFee === 'string') setCalloutFee(d.calloutFee)
      if (typeof d.priceFrom === 'string') setPriceFrom(d.priceFrom)
      if (typeof d.priceOnAsk === 'boolean') setPriceOnAsk(d.priceOnAsk)
    } catch { /* a corrupt draft is not worth a broken form */ }
  }, [])

  // Save on every change. Quota is the one failure that matters and it is
  // swallowed: a form that throws while you type is worse than a lost draft.
  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({
        kind, fullName, phone, companyName, taxId, services, about, calloutFee, priceFrom, priceOnAsk,
      }))
    } catch { /* full or blocked — carry on */ }
  }, [kind, fullName, phone, companyName, taxId, services, about, calloutFee, priceFrom, priceOnAsk])

  useEffect(() => {
    let live = true
    fetch('/api/provider-applications')
      .then(r => r.json())
      .then(d => {
        // ⚠️ `setLoaded(true)` BEFORE THE BAIL, NOT AFTER IT (2026-08-18). The
        // early return skipped it, so on any non-ok response `loaded` stayed
        // false — which is the flag the „სია ვერ ჩაიტვირთა" message is gated
        // on. The fallback for a failed fetch was unreachable on exactly the
        // failure it was written for, and the applicant got two empty required
        // blocks plus a hint naming controls that were not on screen.
        if (!live) return
        if (!d?.ok) { setLoaded(true); return }
        setGroups(d.groups ?? [])
        // Their own word into the search — see `seed` above. Only if it hits,
        // and never over something they have already typed.
        const job = (seed?.professions ?? [])[0]?.trim()
        if (job) {
          const q = job.toLowerCase()
          const hit = (d.groups ?? []).some((g: Group) => g.topics.some(t =>
            t.label.toLowerCase().includes(q) || (t.alt ?? []).some((a: string) => a.toLowerCase().includes(q))))
          if (hit) setQuery(cur => (cur.trim() ? cur : job))
        }
        const cs = d.cities ?? []
        setCities(cs)
        // ⚠️ ONE CITY IS ANSWERED FOR THEM, not left blank. The block above is
        // hidden while `cities.length === 1`, and `areas` is required by the
        // submit — so without this the form would be unsubmittable and the
        // reason would be a control nobody can see. Seeding it here keeps the
        // row identical to what the visible chip used to write.
        if (cs.length === 1) setAreas([cs[0].id])
        const a = d.application
        if (a) {
          // Re-seeding after NEEDS_REVISION. The photos are NOT sent back (see
          // the route) — the applicant re-uploads if they changed, and the
          // server keeps what is there otherwise.
          setStatus(a.status); setNote(a.moderatorNote ?? null)
          setKind(a.kind); setFullName(a.fullName); setPhone(a.phone)
          setCompanyName(a.companyName ?? ''); setTaxId(a.taxId ?? '')
          setServices(a.services ?? []); setAreas(a.areas ?? [])
          setAbout(a.about ?? '')
          setCalloutFee(a.calloutFee == null ? '' : String(a.calloutFee))
          setPriceFrom(a.priceFrom == null ? '' : String(a.priceFrom))
          // ⚠️ A SAVED ROW HAS ALWAYS ANSWERED, so a null here is „შეთანხმებით"
          // and not „not yet" — the pair rule in lib/providerApplication is
          // what makes that read safe. A BLANK form must not pre-tick it, which
          // is why this line lives inside `if (a)` and the initial state is
          // `false`: the question is unanswered until somebody answers it.
          setPriceOnAsk(a.priceFrom == null)
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
    return () => { live = false }
  }, [])

  const toggle = (list: string[], set: (v: string[]) => void, id: string, max: number) => {
    set(list.includes(id) ? list.filter(x => x !== id) : list.length >= max ? list : [...list, id])
  }

  /** What the controls hold, in the shape lib/providerApplication cleans. */
  const draft: ProviderApplicationDraft = {
    kind, fullName, phone, companyName, taxId, services, areas, about,
    calloutFee, priceFrom, priceOnAsk,
  }

  /**
   * WHAT IS STILL MISSING — from the endpoint's own schema, not from a copy.
   *
   * ⚠️ THIS USED TO BE SIX HAND-WRITTEN `need(...)` LINES (replaced 2026-08-31).
   * They were a MIRROR of ProviderApplicationInput, and a mirror drifts: the
   * phone one read `length >= 9` until 2026-08-31, so „123456789" passed the
   * list, greened the button and was refused by the server. Every rule this
   * form enforces is now the rule the route enforces, because it is the same
   * `safeParse` — and the messages come with it, in the schema's own Georgian.
   *
   * ⚠️ THE PHOTOS ARE LEFT OUT OF THIS PASS ON PURPOSE. They are data URIs of
   * a few hundred KB each and the schema trims them; doing that on every
   * keystroke would copy megabytes per character typed. Neither can be got
   * wrong from the interface (the uploader caps the count) and the SUBMIT
   * parses the real body with them in, so nothing unrefusable is ever sent.
   */
  const blockersOf = (body: unknown) => {
    const parsed = ProviderApplicationInput.safeParse(body)
    if (parsed.success) return []
    const seen = new Set<string>()
    const out: { field: string; label: string; message: string }[] = []
    for (const issue of parsed.error.issues) {
      const field = typeof issue.path[0] === 'string' ? issue.path[0] : ''
      if (!field || seen.has(field)) continue
      seen.add(field)
      out.push({
        field,
        label: FIELD_WORD[field] ?? field,
        // ⚠️ THE PHONE'S OWN SENTENCE WINS. The schema can only say „ნომერი
        // არასწორია" from inside a `.refine`, and `phoneFormatError` — the one
        // rule signup, the intake and the editor all ask — distinguishes an
        // empty box from a wrong number. Same rule, sharper wording.
        /* ⚠️ AND THE PHOTO'S, FOR THE SAME REASON (2026-09-02). `photoUrl` is
           a required `z.string()`, so an applicant who chose none fails on an
           `invalid_type` against `null` — an issue with no Georgian message,
           which lib/validationMessages can only render as „ფოტო არასწორია.":
           a verdict on a photo that does not exist. `missingPhotoMessage` is
           the sentence the ADMIN's blocker list has always used for this exact
           fact, so the two now read the same words. */
        message: field === 'phone'
          ? (phoneFormatError(phone, { required: true }) ?? validationIssueMessage(issue))
          : field === 'photoUrl' && !photoUrl
            ? missingPhotoMessage(kind)
            : validationIssueMessage(issue),
      })
    }
    return out.sort((a, b) => FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field))
  }
  const missing = blockersOf(providerApplicationBody(draft))

  /* ⚠️ THE ANSWER COMES TO THE READER (2026-09-02, owner: „როცა აჭერ ვერ ხვდები
     რომ დაჭერილი გაქვს და ქვევით სერვისებია… ჩამოსქროლვა ხომ არ დავამატოთ?").
     The services render after the WHOLE category row — with both worlds chosen
     that is 28 chips over seven wrapped lines — so somebody who tapped a
     category near the top got their services below the fold and a screen that
     looked like it had done nothing.

     ⚠️ AN EFFECT, NOT THE `onClick` — and the first attempt was the onClick,
     with a `requestAnimationFrame` inside it. It failed SILENTLY, which is this
     screen's recurring failure mode: at that moment React has not committed the
     new panel, `getElementById` answers null, and the handler's own guard
     returns. Measured in the browser: the category opened, the seven chips
     existed, and `topicsVisible` was false. An effect on `openGroup` runs after
     the commit, so the element it looks for is always there.

     Scrolled rather than re-ordered: lifting the open category's chips up among
     the others would make the list jump under the finger that just pressed it,
     and hiding the rest is the thing this panel exists not to do. `nearest`
     moves the minimum — if the block is already on screen nothing happens at
     all.

     `prefers-reduced-motion` is asked the same way `jumpTo` asks it: the browser
     does not apply the setting to `scrollIntoView` on its own, and
     full-viewport motion nobody asked for is nausea for some people rather than
     polish. */
  useEffect(() => {
    if (!openGroup) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const how = { behavior: still ? ('auto' as const) : ('smooth' as const) }

    /* ⚠️ THE CHIP, SIDEWAYS — AND THIS WAS MISSING FOR ONE COMPILE (2026-09-02).
       Screenshotted immediately after the strip landed: „სამართალი" was tapped,
       its seven services drew correctly underneath, and the chip itself had
       scrolled off the right-hand edge. So the reader saw an answer with
       nothing on screen saying what the question had been — the owner's „ვერ
       ხვდები რომ დაჭერილი გაქვს", arriving again by the route the strip opened.
       A horizontal list that moves the selection out of view is worse than the
       block it replaced.
       `inline: 'center'` puts it in the middle of the strip, so what is on
       either side of it is visible too — which is how somebody corrects a
       mis-tap. `block: 'nearest'` or the page would ALSO jump vertically to
       centre a chip that is already perfectly visible. */
    // The services first, vertically. `nearest` does nothing when they are
    // already on screen, which after the strip they usually are.
    document.getElementById('join-topics')?.scrollIntoView({ ...how, block: 'nearest' })

    /* ⚠️ INSTANT, AND LAST — MEASURED (2026-09-02). Both scrolls were `smooth`
       and fired chip-first; the strip did not move at all (`scrollLeft` stayed
       0 while the same call typed by hand moved it to 880). A second
       `scrollIntoView` issued in the same tick supersedes the smooth one still
       in flight, so the chip's scroll was being cancelled by the services'.
       Ordering fixes the cancellation; `auto` makes the strip immune to it
       whatever is added to this effect later — and a 44px snap container
       landing on its chosen chip instantly is what a snap container does on a
       swipe anyway. The scroll a person actually FEELS is the vertical one, and
       that one is still smooth. */
    document.querySelector(`[data-group="${openGroup}"]`)
      ?.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' })
  }, [openGroup])

  /** The categories this applicant may browse — narrowed by the world(s) they
   *  chose, which is what the copy on that question promises. A group with no
   *  `vertical` belongs to both. */
  const shownGroups = groups.filter(g => !g.vertical || worlds.includes(g.vertical))
  /** …and the one whose services are on screen, or null. Resolved against the
   *  narrowed list, so a category that leaves the world also leaves the panel
   *  rather than staying open under a heading nobody can see. */
  const openedGroup = shownGroups.find(g => g.id === openGroup) ?? null

  /**
   * THE „STILL NEEDED" AMBER, IN ONE PLACE.
   *
   * ⚠️ THE COLOUR IS `tileHue(1)`, NOT THE CANVAS'S TWO OKLCH LITERALS. The
   * artboard tints the phone box `oklch(0.94 0.045 75)` over
   * `oklch(0.88 0.055 75)` — which is, exactly, the second plate of the home
   * page's tile palette (app/_home/data → TILE_HUES). Retyping the numbers here
   * would have been a fourth copy of a colour that already has a name, and the
   * day the palette moves this screen would be the one that did not.
   *
   * It marks a field that is REQUIRED AND STILL EMPTY — the same list the
   * „დარჩა" bar reads, so a tinted box and a named link can never disagree.
   * ⚠️ RED WINS: `bad(field)` is „you answered and it is wrong", which is a
   * sharper, newer fact than „you have not answered yet", and two colours on
   * one box is a box saying two things.
   */
  const stillNeeded = (field: string) =>
    missing.some(m => m.field === field) && !bad(field)
      ? { backgroundColor: tileHue(1).bg, borderColor: tileHue(1).border }
      : undefined
  const phoneTint = stillNeeded('phone')

  /** The stage that owns the answer a submit stopped on — the panel that goes
   *  red. One fault, one card, and it is the same fault the message under the
   *  control is drawn from. */
  const faultStage = fault ? stageOfField(fault.field) : null


  /**
   * Scrolls to whatever owns an answer and puts the cursor in it. `data-field`
   * is on the sub-sections and on the photo panel — the same hook the „დარჩა"
   * links have used since 2026-08-20.
   *
   * ⚠️ SMOOTH ONLY IF THEY CAN TAKE IT (2026-08-31). A programmatic smooth
   * scroll is full-viewport motion nobody asked for, and `prefers-reduced-
   * motion` exists because for some people that is nausea rather than polish.
   * The browser does not apply the setting to `scrollIntoView` on its own — a
   * `motion-safe:` class cannot reach this either — so it is asked here.
   */
  const jumpTo = (field: string) => {
    const el = document.querySelector<HTMLElement>(`[data-field="${field}"]`)
    if (!el) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' })
    const input = el.matches('input,textarea') ? el : el.querySelector<HTMLElement>('input,textarea,button')
    input?.focus({ preventScroll: true })
  }

  /**
   * THE SAME GESTURE, ACROSS SCREENS (2026-09-02).
   *
   * ⚠️ `jumpTo` ALONE STOPPED WORKING THE DAY THE FORM BECAME THREE SCREENS,
   * and it would have failed SILENTLY: `document.querySelector` finds nothing
   * when the panel that owns the field is not rendered, and the function's
   * first line is `if (!el) return`. So „დარჩა: ფოტო" pressed from step 1, and
   * every refusal landing on a field from another step, would have done
   * literally nothing — the exact „pressing დასრულება did nothing at all"
   * defect recorded twenty lines below this one, arriving by a new route.
   *
   * Switch first, then jump — in a `requestAnimationFrame`, because the panel
   * has to be in the document before it can be found and focused.
   */
  const goToField = (field: string) => {
    const owner = stageOfField(field)
    if (owner && owner !== step) {
      setStep(owner)
      requestAnimationFrame(() => jumpTo(field))
      return
    }
    jumpTo(field)
  }

  /** Mark it, say why, and take them there — one gesture, used by a client
   *  refusal and a server refusal alike so the two feel like one form. */
  const stopOn = (field: string, message: string) => {
    fail(field, message, { focus: false })
    // Let React paint the message before moving the viewport to it — and, since
    // 2026-09-02, before the panel that owns it exists at all. See goToField.
    requestAnimationFrame(() => goToField(field))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (sending) return
    /* ⚠️ THE BUTTON IS PRESSABLE EVEN WHEN THE FORM IS NOT DONE, and the press
     * is what reports. A `disabled` submit under a 2 600px form is a dead grey
     * control with no explanation — the applicant's only feedback is that
     * nothing happened. Owner: „ვალიდაციები რომ აისქროლოს ზევით და გაწითლდეს
     * თუ შეცდომა." */
    const body = providerApplicationBody({ ...draft, photoUrl, workPhotos })
    const blockers = blockersOf(body)
    if (blockers.length > 0) {
      stopOn(blockers[0].field, blockers[0].message)
      return
    }
    setSending(true); setErr(null); clearFault()
    try {
      const res = await fetch('/api/provider-applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok || !d?.ok) {
        const field = typeof d?.field === 'string' ? d.field : null
        const message = d?.message || 'შეამოწმე შევსებული ველები.'
        /* ⚠️ A FIELD THIS SCREEN CANNOT DRAW FALLS BACK TO THE FOOT OF THE FORM
         * (2026-08-31). The refusal used to be stored against whatever `field`
         * the route named, and the bottom message was hidden whenever one was
         * named — so a refusal on a key with no error slot („yearsExp", which
         * is exactly what production was answering) marked nothing, printed
         * nothing, and scrolled nowhere. Pressing „დასრულება" did nothing at
         * all. Now a name the stages do not know is treated as having no name. */
        if (field && stageOfField(field)) stopOn(field, message)
        else setErr(message)
        setSending(false)
        return
      }
      // The server has it now, so the draft is no longer the applicant's only
      // copy — and leaving it behind would re-fill the form the next time they
      // open the page, over the top of what was submitted.
      try { window.localStorage.removeItem(DRAFT_KEY) } catch { /* fine */ }
      // ⚠️ `editing` MUST BE CLEARED HERE. `sent` is `(done || SUBMITTED) &&
      // !editing`, so re-submitting from the „შესწორება" view would have set
      // `done` and then been cancelled by the flag that opened the form — the
      // second submit would have left them staring at the form again, which is
      // the exact defect this screen was added to fix.
      setEditing(false)
      setDone(true)
      router.refresh()
    } catch {
      setErr(SEND_FAILED)
      setSending(false)
    }
  }

  // ⚠️ THE PUBLIC CHROME, not the provider shell. Somebody filling this in is
  // not a provider yet — dropping them into /provider's bar would show a
  // workspace they cannot use and hide the way back to the site.
  const chrome = (body: React.ReactNode) => (
    <>
      <PublicTopBar activeHref="/join" initialUser={me} />
      <main>{body}</main>
      <Footer />
    </>
  )

  if (sent) {
    return chrome(
      <Container size="narrow" className="py-14">
        <Card>
          <h1 className="font-display text-h2 font-bold text-ink-900">განაცხადი გამოგზავნილია</h1>
          <p className="mt-2 text-body text-ink-600 leading-relaxed">
            გადავამოწმებთ და დაგიკავშირდებით ამ ნომერზე: {phone}
          </p>
          {/* ⚠️ NOTHING IS ASKED FOR HERE ANY MORE (2026-09-01, owner: „აღარ
              უნდა ამატებდეს მერე რამეს და არეული არ უნდა იყოს მომხმარებელი და
              გაურკვევლობაში").
              Two sentences used to sit under the heading — „ფოტო არ ატვირთე…"
              and „აღწერა არ დაგიწერია…" — each naming something still to do.
              Read together with „განაცხადი გამოგზავნილია" directly above them,
              the screen said sent and not-sent in the same breath, and left the
              person unable to tell which they were.
              Both are asked in the FORM now (lib/providerApplication: `photoUrl`
              and `about` are required at submit), so by the time anybody reaches
              this screen there is nothing outstanding. A confirmation that
              confirms. */}
          {/* ⚠️ THE SENTENCE ABOVE OFFERED AN ACTION AND THE SCREEN HAD NO
              CONTROL FOR IT (2026-08-18). „შეგიძლია ახლავე დაამატო" sat over a
              single „სერვისები" button leading to the CLIENT page — so the one
              thing standing between this person and approval was named, and
              then the only way to do it was to retype the URL.

              The photo button is FIRST and primary when it is missing, because
              it is the only blocker left; when the photo is there it is not
              drawn at all and „სერვისები" is the whole footer. */}
          {/* ⚠️ „ჯავშნადი სერვისის დამატება" WAS HERE AND IS GONE (2026-08-24).
              It offered the consultation half — a service bought by picking an
              hour — from this success screen, which was the right PLACE for it
              (after the service is filed, never as a question before it). The
              product went; an offer with nothing behind it is worse than none. */}
          {/* ⚠️ ONE DOOR, NOT TWO (2026-09-01). „ფოტოს დამატება" stood here as
              the primary action whenever the photo was missing — a button that
              only existed because the form had let somebody leave without it.
              The photo is asked for in the form now, so the case is gone and so
              is the button. What is left is the one thing there is to do after
              applying, which is nothing: look around while we call. */}
          {/* ⚠️ THE WAY BACK IN (2026-09-01). Making SUBMITTED a screen must
              not make the application unreachable — somebody who spots a wrong
              phone number an hour later has to be able to fix it, and the
              endpoint has always accepted a re-submission. The difference is
              only which one is the default: the answer first, the form on a
              tap. */}
          <div className="mt-5 flex flex-wrap gap-3">
            <Btn href="/experts" variant="secondary">ექსპერტები</Btn>
            <Btn onClick={() => setEditing(true)} variant="ghost">განაცხადის შესწორება</Btn>
          </div>
        </Card>
      </Container>,
    )
  }

  return chrome(
    <Container size="content" className="py-8 sm:py-12">
      {/* ⚠️ CENTRED, AND ON THE CANVAS'S COLUMN (2026-08-31). The door is the
          one screen on the site with nothing beside it — no rail, no results,
          no card grid — and a left-aligned title on an 820px column left the
          form hanging off one edge of it. */}
      <div className="text-center">
        <h1 className="font-display text-display font-extrabold leading-[1.06] tracking-[-0.03em] text-ink-900">
          {JOIN_DOOR_LABEL}
        </h1>
        <p className="mx-auto mt-3 max-w-[46ch] text-body-lg text-ink-500">
          შეავსე ერთხელ. მოთხოვნები მხოლოდ შენი მიმართულების და შენი ქალაქის მოგდის.
        </p>
      </div>

      {/* ⚠️ THE RAIL, AND THIS TIME IT MOVES (2026-09-02).
          It was deleted on 2026-09-01 and the note left here recorded exactly
          why, in the owner's words: „ან ფუნქცია მიეცი რომ გადავიდეს გადმოვიდეს
          ან საერთოდ წაშალე … სულ წაშალე ეს. არ გვჭირდება." Two options were
          offered that day and the second was taken, on a sound reading: „a
          progress indicator earns its place when the thing it indexes is
          somewhere ELSE; here every section was already on screen." The form
          was one page, so the rail indexed nothing and looked like navigation
          it was not.

          The premise changed today, not the reasoning. The sections ARE
          somewhere else now — one panel at a time — so the rail is the only
          thing that says how far in you are and the only way to move without
          answering. This is the FIRST half of that same sentence, finally
          taken.

          ⚠️ EVERY SEGMENT IS PRESSABLE, INCLUDING ONES AHEAD. A rail that
          refuses to move until the current step validates is the „disabled
          submit with no explanation" this file already argues against, one
          level up: it would trap somebody on the services question because
          they wanted to check what the form asks before answering it. Nothing
          is submitted by moving, the draft is in localStorage, and the real
          refusal still happens once, at „დასრულება", where it names a field
          and now switches screens to reach it (see goToField).

          The tick is `missing` — the same list the „დარჩა" bar names and the
          same one that tints a field amber. Three surfaces, one source, so a
          rail can never call a step finished while the bar still asks for
          something inside it. */}
      <nav aria-label="რეგისტრაციის ნაბიჯები" className="mt-7 flex items-stretch gap-2">
        {STAGES.map((st, i) => {
          const current = st.id === step
          const done = !missing.some(m => st.fields.includes(m.field))
          const bad = faultStage === st.id
          return (
            <button
              key={st.id}
              type="button"
              onClick={() => setStep(st.id)}
              aria-current={current ? 'step' : undefined}
              /* 🔒 `min-h-12` — a rail row is a tap target, and this one is the
                 primary navigation of the screen. */
              /* ⚠️ `flex-1` ONLY WHERE THERE IS SOMETHING TO READ. With every
                 segment an equal third, the current step's label was truncated
                 to make room for two discs. `grow`/`shrink-0` gives the word
                 the space and leaves the other two at their content width —
                 above `sm`, where all three carry a label, they even out
                 again. */
              className={`flex min-h-12 items-center gap-2 rounded-btn border px-3 py-2 text-left transition-colors duration-fast sm:flex-1 ${
                current ? 'grow' : 'shrink-0 sm:grow'
              } ${
                bad ? 'border-danger-500 bg-danger-50'
                  : current ? 'border-brand-600 bg-brand-50'
                  : 'border-ink-200 bg-white hover:border-ink-300'
              }`}
            >
              <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-display text-micro font-extrabold tabular-nums ${
                bad ? 'bg-danger-600 text-white'
                  : current ? 'bg-brand-700 text-white'
                  : done ? 'bg-brand-100 text-brand-800'
                  : 'border border-ink-300 bg-white text-ink-500'
              }`}>
                {/* The tick replaces the numeral only where the step is BOTH
                    finished and not the one being read — on the current step
                    the number is what says „you are here". */}
                {done && !current ? <Icon.check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              {/* The label is the rail's own word — `rail`, not `label`: the
                  third stage abbreviates („სამუშაოს ფოტო" for „სამუშაოს
                  ფოტოები"), which is why that column exists.

                  ⚠️ THE CURRENT STEP ALWAYS KEEPS ITS WORD (2026-09-02). This
                  was `hidden sm:block` on all three, on the reasoning that
                  three labels cannot sit side by side on a phone — true, and
                  the consequence was measured in the browser at a 558px
                  viewport: the rail read „1  2  ✓" and nothing else. Three
                  numerals name nothing. A person cannot be told they are on
                  step one of something without being told of WHAT.

                  So the two a reader is not on collapse to their numeral —
                  they are a destination, and the numeral plus the tick is
                  enough to say „done" and „not yet" — while the one they are
                  standing on says its name at every width. Above `sm` all
                  three fit and all three speak. */}
              <span className={`truncate font-display text-small font-semibold ${
                current ? 'block text-brand-900' : 'hidden text-ink-600 sm:block'
              }`}>
                {st.rail}
              </span>
            </button>
          )
        })}
      </nav>

      {/* ⚠️ THE `&& note` GUARD IS GONE (2026-08-18). The endpoint refuses a
          revision without a note, so it cannot be empty today — but the guard
          meant that the day it could, the applicant would get a bare pre-filled
          form and no explanation at all. A status is worth saying with or
          without a reason attached. */}
      {status === 'NEEDS_REVISION' && (
        <Card className="mt-5 border-warning-600">
          <p className="font-display text-body font-semibold text-ink-900">{PROVIDER_STATUS_TEXT.NEEDS_REVISION}</p>
          {note && <p className="mt-1 text-body text-ink-700">{note}</p>}
        </Card>
      )}
      {/* ⚠️ REJECTED WAS A SILENT DEAD END, AND IT LOOPED (2026-08-18). Neither
          branch matched it, so somebody whose application was refused saw a
          pre-filled form with „ხელახლა გამოგზავნა" on the button, no reason,
          and an endpoint that cheerfully flipped them back to SUBMITTED. They
          could do that forever and never learn anything.

          `PROVIDER_STATUS_TEXT.REJECTED` existed the whole time and was rendered
          nowhere. Re-submission stays possible — a refusal is usually about
          something fixable and a locked form gives them nothing to do — but the
          reason is now on screen, which is the difference between a second
          attempt and a loop. */}
      {status === 'REJECTED' && (
        <Card className="mt-5 border-danger-200">
          <p className="font-display text-body font-semibold text-ink-900">{PROVIDER_STATUS_TEXT.REJECTED}</p>
          {note && <p className="mt-1 text-body text-ink-700">{note}</p>}
        </Card>
      )}
      {status === 'SUBMITTED' && (
        <Card className="mt-5">
          {/* One line. „შეგიძლია შეცვალო და ხელახლა გამოგზავნო." used to sit
              under it — true, but it is what the form underneath already IS,
              and saying it made a two-sentence card out of a status. */}
          <p className="text-body text-ink-700">{PROVIDER_STATUS_TEXT.SUBMITTED}</p>
        </Card>
      )}

      <form onSubmit={submit} noValidate>
        {/* ═══════════ 1 · რას აკეთებ ═══════════════════════════════════════
            The canvas's first panel, in its order: the pill, the chips it
            finds, and the price for each thing that was ticked. It is FIRST
            because the door has just asked the same question and this form
            types the answer into its own search — see `seed`. */}
        {/* ⚠️ ONE PANEL AT A TIME (2026-09-02). Rendered CONDITIONALLY, not
            hidden with a class: a `hidden` panel keeps its inputs in the
            document, so a browser's own "required" focus, a password manager
            and `document.querySelector('[data-field=…]')` all still reach a
            box nobody can see — and the last of those is how „დარჩა" and every
            refusal find their target. `goToField` switches the step first for
            exactly that reason. */}
        {step === 'what' && (
        <Block n={STAGES.findIndex(s => s.id === 'what') + 1} title={STAGE.what.label} hint={STAGE.what.hint} invalid={faultStage === 'what'}>
          <div data-field="services">
            {/* ⚠️ TYPE, DON'T SCROLL (2026-08-20). This question rendered all
                thirty-nine chips at once, in eight groups, expanded — a wall on
                a 390px screen, and a wall the applicant has to READ before
                finding the two rows that are theirs. A plumber does not need
                „ბალახის თიბვა" on screen at all.

                The field is first because it is the fastest path for somebody
                who already knows what they do: „ონკ" reaches „ონკანი და მილი"
                in three keystrokes. The groups stay underneath for somebody who
                wants to browse, closed, one open at a time. Same shape the
                client side already uses on the intake's first step — one
                product, one way of picking from a long list. */}
            {/* ⚠️ THE CHOICE COMES FIRST, THEN THE SEARCH (2026-09-01, owner:
                jer khom ar jobia eg zevit iyos da mere serchi).
                It was the other way round, and the reasoning below — that the
                field is the fastest path for somebody who already knows their
                trade — is still true, but it answered the wrong question.
                Three things put the choice above it:
                  · the heading over it ASKS one, and an answer belongs under
                    its question rather than over it;
                  · the search is a tool for the LIST, and the list is below —
                    so the field belongs between them, touching what it filters;
                  · broad before narrow. Somebody who does not know our word for
                    their service picks a side and browses; somebody who does,
                    types.
                The search still crosses BOTH worlds whatever is chosen here
                (see `hits`), so putting the choice first narrows browsing and
                nothing else. */}
                {/* ⚠️ ASKED WHERE IT IS USED, NOT AS ITS OWN NUMBERED STEP
                    (2026-08-31). This was block 2 of seven — a full panel, ahead
                    of the question it exists to serve. All it does is SHORTEN
                    the list underneath it (`groups.filter`), so it is asked at
                    the top of that list and nowhere else. Somebody who types
                    never meets it, which is correct: the search deliberately
                    crosses both worlds and does not need narrowing.
                    The question and its sentence are the owner's, unchanged. */}
                <Sub
                  title="რომელ კატეგორიაშია შენი საქმე"
                  hint="აირჩიე ერთი ან ორივე — სია მათ მიხედვით შედგება. შემდეგაც შეგიძლია შეცვალო."
                >
                  {/* ⚠️ TWO CHIPS, NOT TWO CARDS (2026-09-01, owner: „ეს
                      მოგწონს?" — no).
                      Measured before the change: each card was 76px tall with a
                      24px radius, and the search pill under them is 9999px, and
                      the service list under THAT is pills again. Three different
                      roundnesses down one column, which is exactly the „ზოგი
                      მრგვალია ზოგი მეტად" complaint. The pill is what the rest
                      of this screen speaks, so the question speaks it too.
                      They also carried an example list each — „დალაგება,
                      სანტექნიკა, ელექტრიკა…" and „ბუღალტერია, სამართალი, IT…" —
                      the same too-concrete pattern already removed from every
                      search field on the site, left standing in the largest
                      block on the page. A lawyer read the first card and
                      concluded the site was for tradespeople. The two labels say
                      which half is which; the list underneath says the rest.
                      Cost before: ~230px of screen before one real choice
                      appeared. On a phone that is half the viewport.
                      `min-h-10` keeps the 40px floor (CLAUDE.md), and the chips
                      wrap rather than stretch — two words do not need a row. */}
                  {/* ⚠️ `KindChoice`, NOT `PickChip` (2026-09-02, owner, from a
                      phone screenshot of this exact crop): „მრგვალი რომ არ
                      იყოს ეგ ღილაკები ჯობია — როგორც სხვაგანაა, მოთხკუთხედო
                      ოდნავ… და დაფიქსირებული იყოს."

                      What the picture showed: two `rounded-pill` chips, one
                      flooded brand-700 with a tick, stacked one under the other
                      at unequal widths because a chip sizes itself to its text.
                      Two problems in one control — the shape is the roundest
                      thing the site owns, and the pair moves as you answer it.

                      `KindChoice` is the plate this SAME FORM already asks its
                      other two-way question with, two screens along
                      („ინდივიდუალური / კომპანია"): `rounded-field` — the site's
                      ordinary corner, the one every input and button uses —
                      52px tall, `min-w-[160px] flex-1`, so the two are equal
                      and side by side and stay where they are whichever is
                      pressed. „როგორც სხვაგანაა" is literally true: it is the
                      same component.

                      ⚠️ AND THE TICK GOES WITH THE FLOOD. `KindChoice` says
                      „chosen" with a brand border over a brand-50 tint rather
                      than by filling — which is right for a choice that stays
                      readable after it is made, and is why the plate was built
                      that way for the kind question. The chip's own note argued
                      the opposite on 2026-09-01, that a world is „a selectable
                      option (topic, city)" like the service chips below. It is
                      not: those are a list of thirty you tick through, this is
                      one question with two answers that reshapes the list under
                      it — the same job the kind question does. The note was
                      right about the inconsistency and wrong about which of the
                      two controls to converge on.

                      `flex-wrap` so a narrow phone stacks them rather than
                      squeezing two long Georgian labels into one row. */}
                  <div className="flex flex-wrap gap-3">
                    {WORLD.map(w => (
                      <KindChoice
                        key={w.id}
                        on={worlds.includes(w.id)}
                        multi
                        onClick={() => toggleWorld(w.id)}
                      >
                        {w.label}
                      </KindChoice>
                    ))}
                  </div>
                </Sub>

            {/* ⚠️ THE PILL IS THE OWNER'S OWN (2026-08-31, `Join.clean.html`),
                and it is the SAME pill the door asks its question with
                (components/ProfessionPicker). It was a 44px `rounded-field`
                box; the canvas draws a 58px pill with a magnifier and a brand
                ring, and the two screens ask their one big question in the same
                voice now. */}
            {/* ⚠️ `mt-6` — IT WAS TOUCHING THE CHIPS (2026-09-01, measured:
                chip bottom 118px, field top 118px, a 0px gap). `Sub` carries
                its own `mt-6` at the TOP and nothing at the bottom, so when the
                question moved above the search on 2026-09-01 the field landed
                flush against the answer and the two read as one welded control
                — a tab strip fused to a search box. 24px is the same step `Sub`
                puts between any two questions, which is what these are. */}
            <label className="relative mt-6 block">
              <Icon.search aria-hidden className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
                {/* ⚠️ `rounded-field`, NOT A PILL (2026-09-02, owner, after the
                    two world buttons stopped being round: „და რაც მომწერე ეგეც
                    მოაგვარე").

                    It WAS `rounded-field` until 2026-08-31, when the canvas
                    („Join.clean.html") made it a 58px pill and the note here
                    recorded why: the door's search and this one should „ask
                    their one big question in the same voice". That reasoning
                    holds and is why components/ProfessionPicker changed on the
                    same day — and today it is what makes the pair move
                    together, not what keeps them round.

                    The column reads top to bottom: a QUESTION (two plates), the
                    FIELD that filters its list, then the ANSWERS (chips). A
                    field that is rounder than every other field on the site —
                    and rounder than the plates directly above it — was the last
                    of the three roundnesses in the owner's own „ზოგი მრგვალია
                    ზოგი მეტად". The chips stay pills: a chip is a chip
                    site-wide (the catalogue's filters, the intake's topics),
                    and it is the one shape here that is not a form control. */}
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label="მოძებნე სერვისი"
                /* ⚠️ NO EXAMPLES HERE (2026-09-01, owner: „ძალიან კონკრეტულია
                   და არაპროფესიონალური"). It read „მოძებნე — ონკანი,
                   კონდიციონერი, დალაგება…", and three household nouns cannot
                   stand for a catalogue that also holds law, accounting and IT
                   — the field quietly told a lawyer the list was not for them.
                   An example earns its place where somebody must invent the
                   words; here they are picking their own trade off a list they
                   already know, so it teaches nothing and narrows a lot. What
                   is left is the general half that was always there, and it
                   now matches the field's own aria-label above. */
                placeholder="მოძებნე სერვისი"
                className="h-14 w-full rounded-field border border-ink-200 bg-white pl-[52px] pr-5 text-body-lg text-ink-900 outline-none transition-[border-color,box-shadow] duration-fast placeholder:text-ink-400 focus:border-brand-700 focus:shadow-[0_0_0_4px_theme(colors.brand.50)]"
              />
            </label>
            {/* ⚠️ THE OLD BLOCK HINT, KEPT AND MOVED DOWN ONE LINE. The panel's
                own hint is the canvas's („დაწერე შენი სიტყვებით."), and this
                sentence is the routing rule — what you tick is what you are
                mailed about. It belongs next to the control it is a rule for,
                not over the heading. */}
            <p className="mt-2 text-meta leading-relaxed text-ink-500">
              აირჩიე მხოლოდ ის, რასაც მართლა აკეთებ — მოთხოვნებიც მხოლოდ ეს მოგდის. მაქსიმუმ {MASTER.MAX_SERVICES}.
            </p>

            {query.trim().length >= 2 ? (
              // The hits, flat and ungrouped: somebody who typed knows what they
              // want, and a group heading over one chip is furniture.
              <div className="mt-3 flex flex-wrap gap-2">
                {hits.length === 0
                  ? <p className="text-small text-ink-500">ვერაფერი მოიძებნა — სცადე სხვა სიტყვა ან გახსენი სია ქვემოთ.</p>
                  : hits.map(t => (
                    <PickChip
                      key={t.id}
                      on={services.includes(t.id)}
                      disabled={!services.includes(t.id) && services.length >= MASTER.MAX_SERVICES}
                      onClick={() => toggle(services, setServices, t.id, MASTER.MAX_SERVICES)}
                    >
                      {t.label}
                    </PickChip>
                  ))}
              </div>
            ) : (
              <>
                {/* ⚠️ WHAT IS TICKED IS ON SCREEN WHILE YOU BROWSE, and only
                    then (2026-08-31). The row exists because a tick can hide
                    inside a CLOSED group — you would lose work you had already
                    done. In the search state it was showing the same chips
                    twice: the hit list already draws a ticked chip filled, and
                    the price plate below now names every ticked row anyway.
                    That plate is what took over this row's other job — „on a
                    form this long the answer scrolls away from the question" —
                    because it is on screen in every state and lists exactly the
                    services that were picked. */}
                {services.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 border-b border-ink-100 pb-3">
                    {services.map(id => {
                      /* ⚠️ `topicById` FIRST, `groups` ONLY AS A FALLBACK
                         (2026-09-01). `groups` arrives over the network, so for
                         the first frame of every load it is `[]` and this row —
                         and the price plate below, same lookup — printed the
                         raw English id: „contract", „declaration", „logo",
                         inside a Georgian form. `topicById` is the local table
                         and answers synchronously. The `groups` arm stays
                         because that list is the LIVE four (LIVE_OFFER_GROUPS)
                         and can legitimately carry a row the local table has
                         not got. */
                      const t = topicById(id) ?? groups.flatMap(g => g.topics).find(x => x.id === id)
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggle(services, setServices, id, MASTER.MAX_SERVICES)}
                          aria-label={`მოხსენი ${t?.label ?? id}`}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-pill border border-brand-300 bg-brand-50 pl-3 pr-2 font-display text-small font-semibold text-brand-800 transition-colors duration-fast hover:bg-brand-100"
                        >
                          {t?.label ?? id}
                          <Icon.x aria-hidden className="h-3.5 w-3.5" />
                        </button>
                      )
                    })}
                  </div>
                )}


                {/* ⚠️ CAPPED, NOT SHORTENED (2026-09-01, owner: „ძალიან დიდ
                    სივრცეს იკავებს"). Measured on this screen: eight collapsed
                    group rows ran 736px inside an 836px viewport, so the list
                    filled the window by itself and „დასრულება" — with the
                    „აირჩიე ერთი სერვისი მაინც" that appears under it — sat
                    below the fold. That is why pressing submit on an empty form
                    looked like nothing happened: the answer was off-screen.
                    The ROWS are 48px and are not the problem. Shrinking them
                    would push a tap target under the 40px floor and trade a
                    layout complaint for a thumb that misses.
                    The cap is not a new idea either — it is the class the
                    CLIENT's own intake already uses on the same shape of list
                    (app/request/_stepWhat → PANEL_SCROLL), where a long
                    category list with expandable children hit this first.
                    `overscroll-contain` keeps a flick inside the panel instead
                    of dragging the page behind it. */}
                {/* ⚠️ NO WORLD, NO BROWSE LIST (2026-09-02). This panel used
                    to render `worlds.length === 0 || …`, i.e. EVERYTHING when
                    nothing was chosen — and nothing is what is chosen when the
                    form opens, and when somebody reopens a submitted
                    application to correct it. Measured in the browser that day,
                    in exactly that state: the panel is capped at 384px and its
                    content was 4 634px — 28 group headings and 148 chips — to
                    pick at most 12.

                    ⚠️ THE ACCORDION IS NOT COMING BACK, and this is not that
                    argument reopened. The note below it settles the question
                    for a list of the size it measured: „This vertical has 39
                    services across 8 groups (measured) — comfortably inside
                    that range", against eight comparable screens where the
                    largest fits 25. That reasoning is sound and it is about ONE
                    vertical. Both at once is 148, which is four times the
                    largest reference — the decision was right and was being
                    applied to a list four times the size it was measured on.

                    So the fix is upstream of the layout: answer the question
                    the copy already asks. The hint on the world cards above
                    reads „აირჩიე ერთი ან ორივე — სია მათ მიხედვით შედგება", and
                    until today the list was NOT built according to them when
                    they were empty. It is now, and no new sentence was needed
                    to say so.

                    ⚠️ THE SEARCH IS UNAFFECTED, deliberately — it is rendered
                    in the branch above this one, it crosses both worlds
                    whatever is picked here, and it is therefore the way to a
                    service in a world you did not tick. Anything already
                    ticked stays on screen in the row above. Nothing becomes
                    unreachable; only the wall goes. */}
                {worlds.length > 0 && (
                <div className="mt-4 border-t border-ink-100 pt-4">
                  {/* ⚠️ TWO LEVELS SINCE 2026-09-02, AND MEASURED INTO EXISTENCE.
                      Counted in the browser that day, with one world chosen:
                      ყოველდღიური = 8 groups / 39 chips / 1 343px of content in a
                      384px panel; პროფესიული = 20 groups / **109 chips** /
                      3 290px. The note this block used to carry defended „all
                      chips visible, always" against eight comparable screens on
                      Mobbin whose largest fits 25 — and it measured 39 to do it.
                      109 is four times the largest reference it cited. The
                      decision was right and was being applied to a list four
                      times the size it was taken on.

                      ⚠️ AND IT IS STILL NOT AN ACCORDION. Owner, 2026-09-01,
                      refusing one: „რაღაც არაპროფესიონალურად არის" — eight
                      48px rows spending the full page width to print one word,
                      revealing nothing until tapped, „the list cost 736px to
                      show no choices at all". Every word of that stands. The
                      categories here are NOT hidden and NOT rows: they are a
                      wrapping line of chips, all of them on screen at once,
                      ~200px for twenty — and they are themselves the vocabulary
                      somebody browsing came to read. Nothing is behind a
                      disclosure; one question is answered and the next appears
                      under it.

                      Which is what the references actually do at this size.
                      Airbnb asks „Which service will you provide?" as its own
                      question; Airtasker makes Category a named step ahead of
                      the description; Dribbble, capped at three out of a large
                      taxonomy, never draws the taxonomy at all and answers with
                      a grouped typeahead — the search directly above this panel,
                      which crosses both worlds and is still the fast path for
                      anybody who knows their own trade.

                      The panel no longer needs a scroll cap: categories plus one
                      category's services is ~300px in the worst case, so the
                      `max-h` and its `overflow-y-auto` are gone rather than left
                      as furniture that can never fire. */}
                  {/* ⚠️ ONE ROW THAT SCROLLS, NOT A BLOCK THAT WRAPS (2026-09-02,
                      owner: „ერთ ხაზე რომ იყოს… და როცა ჩამოსასქროლი რომ იყოს,
                      მთავარი სხვანაირი ღილაკი იყოს და იმის ქვევით იშლებოდეს
                      ქვეკატეგორიები").

                      Measured from their screenshot: wrapped, the twenty
                      categories took ELEVEN rows — Georgian category names run
                      to „ფინანსები და გადასახადები" and „ვიზა, მიგრაცია და
                      რელოკაცია", so two fit per line and the block was ~600px.
                      That is most of the height the 109-chip wall cost, arrived
                      at from the other direction. A strip is 44px, fixed,
                      whatever the taxonomy grows to.

                      ⚠️ AND THE COST IS REAL, WHICH IS WHY IT IS ONLY SAFE HERE.
                      Horizontal scrolling hides what is off the edge, and „find
                      my trade among twenty" is a SCAN task — the kind wrapping
                      is better at. It is acceptable on this screen for one
                      reason: the search field directly above is the find path,
                      it crosses both worlds whatever is chosen, and it reaches
                      any service in three keystrokes. The strip is for BROWSING,
                      which is a swipe, and browsing has a fallback. On a screen
                      without that search this would be the wrong control.

                      `scroll-px` + `snap-x` so a swipe lands on a chip rather
                      than between two; `[scrollbar-width:none]` because a
                      horizontal scrollbar under a 44px row is taller than the
                      hint it gives; the right-edge fade is what says there is
                      more, since the scrollbar no longer does. */}
                  <div className="relative">
                    <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-px-1 px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {shownGroups.map(g => (
                      <GroupChip
                        key={g.id}
                        groupId={g.id}
                        on={g.id === openGroup}
                        count={g.topics.filter(t => services.includes(t.id)).length}
                        onClick={() => setOpenGroup(g.id === openGroup ? null : g.id)}
                      >
                        {g.label}
                      </GroupChip>
                    ))}
                    </div>
                    {/* The edge fade — `to-ink-50` is the page's own ground, so
                        the strip appears to run under the panel rather than to
                        stop at a line. `pointer-events-none` or it would eat the
                        swipe it exists to advertise. */}
                    <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent" />
                  </div>

                  {openedGroup && (
                    <div id="join-topics" className="mt-3 flex flex-wrap gap-2 border-t border-ink-100 pt-3">
                      {openedGroup.topics.map(t => (
                        <PickChip
                          key={t.id}
                          on={services.includes(t.id)}
                          disabled={!services.includes(t.id) && services.length >= MASTER.MAX_SERVICES}
                          onClick={() => toggle(services, setServices, t.id, MASTER.MAX_SERVICES)}
                        >
                          {t.label}
                        </PickChip>
                      ))}
                    </div>
                  )}
                </div>
                )}
              </>
            )}
            {loaded && groups.length === 0 && (
              <p className="mt-3 text-small text-ink-500">სია ვერ ჩაიტვირთა — გადატვირთე გვერდი.</p>
            )}
            {fieldErr('services')}
          </div>

          {/* ═══════ THE PRICES, INSIDE THE QUESTION THEY BELONG TO ═════════
              ⚠️ IT WAS THE LAST NUMBERED BLOCK ON THE FORM UNTIL 2026-08-31 —
              „ფასი", roughly 2 000px below the chips it is a list OF. The
              canvas puts it directly under them as a tinted inner plate, and
              that is the newer decision AND the better one: the rows in here
              ARE the ticks above, so the two have to be readable at once or the
              list reads as a second, mysterious question. Moving it also took
              the form from seven numbered blocks to three, which is what let
              the rail at the top exist at all.

              ⚠️ NOTHING IS NAMED TWICE (2026-08-20). This block used to ask for
              two numbers about the whole person — „გამოძახება 30₾" and
              „სამუშაო 50₾-დან" — which say what a VISIT costs and nothing about
              what a JOB costs. The catalogue sells services, so the card wants
              „ბინის დალაგება — 60₾", and neither number could produce it.

              The obvious fix — „add a service, type its name, type its price" —
              would ask the provider to name the very rows they ticked just
              above. So the list IS those rows: no typing, no second vocabulary,
              and nothing that can drift out of sync with the ticks.
              Blank stays blank: „ask" is an honest answer for a trade where the
              price depends on what is behind the wall, and the card says
              „ფასს შემოგთავაზებს" for it. */}
          {/* `bg-ink-50` on white is the canvas's own pairing — the page's cream
              ground, brought back INSIDE the card so this reads as a plate laid
              on the panel rather than a second card. `rounded-tile` (18px) is
              the token nearest its 20px; a plate inside a 28px panel must be
              rounder than a control and flatter than the panel. */}
          <div data-field="priceFrom" className="mt-5 rounded-tile border border-ink-100 bg-ink-50 p-4 sm:p-5">
            {/* ⚠️ „(არასავალდებულო)" IS GONE FROM THIS HEADING (2026-09-01) —
                one of the two answers below is now compulsory, and a heading
                that says otherwise is the form contradicting its own refusal. */}
            <p className="font-display text-small font-bold text-ink-900">ფასი</p>

            {/* ⚠️ ONE NUMBER, NOT ONE PER SERVICE (2026-09-01, owner: „ერთი
                ფასი და „შეთანხმებით"").
                This plate drew a price box for EVERY ticked row — five services,
                five boxes — and the measurement that ended it is blunt: of the
                25 published providers, 25 had answered the single „₾-დან"
                question and 1 had ever filled the per-service map. Two had
                opened it and saved `{}`. The form was asking a question in a
                shape almost nobody answers, and the shape was the reason.
                The column and its readers stay (lib/serviceProfile →
                pricedServices, and the one provider who has real per-service
                prices keeps printing them); what stops is asking for it here.

                ⚠️ AND THE EMPTY BOX IS NO LONGER AN ANSWER BY ITSELF. Blank
                meant „not yet" and „ask me" at the same time and the card
                prints „ფასს შემოგთავაზებს" for both, so most providers reached
                that state without ever choosing it. Now they choose it. */}
            <label className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="min-w-[120px] flex-1 font-display text-small font-semibold text-ink-900">ფასი იწყება</span>
              <span
                style={stillNeeded('priceFrom')}
                className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-field border bg-white px-3.5 transition-colors duration-fast focus-within:border-brand-600 ${bad('priceFrom') ? FIELD_ERROR_BORDER : 'border-ink-200'}`}
              >
                <input
                  type="number" min={1} max={1000000} inputMode="numeric"
                  value={priceFrom}
                  /* ⚠️ TYPING UNTICKS, rather than the box going `disabled`
                     while „შეთანხმებით" is on. A disabled money box under a
                     ticked chip is a dead control somebody has to work out how
                     to revive; a live one revives itself on the first digit,
                     and the two states stay exclusive either way (the body
                     builder posts null whenever the chip is on). */
                  onChange={e => { setPriceFrom(e.target.value); if (e.target.value.trim()) setPriceOnAsk(false); clearField('priceFrom') }}
                  aria-label="ფასი, ₾-დან"
                  placeholder="ფასი"
                  className="w-20 min-w-0 border-0 bg-transparent p-0 text-body font-bold tabular-nums text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-400"
                />
                {/* ⚠️ THE ₾ IS INSIDE THE BOX (the canvas's). It sat
                    outside the border, where it reads as a word next to
                    a number rather than as the unit the box is in. */}
                <span className="text-small text-ink-600">₾</span>
              </span>
            </label>

            {/* The other answer, in the page's own chip. Not a checkbox: every
                other „this one, not that one" on this form is a PickChip, and a
                second widget for the same gesture is the drift the world chips
                above were just pulled out of. */}
            <div className="mt-3 border-t border-ink-100 pt-3">
              <PickChip
                on={priceOnAsk}
                onClick={() => {
                  const next = !priceOnAsk
                  setPriceOnAsk(next)
                  // The number goes with it — see the body builder's note on
                  // why „ask me, and it is 80₾" must never be posted.
                  if (next) setPriceFrom('')
                  clearField('priceFrom')
                }}
              >
                ფასი შეთანხმებით
              </PickChip>
              {/* NOT NEW COPY: „ფასს შემოგთავაზებს" is what the catalogue card
                  already prints for a provider with no number
                  (app/experts/_providerCard.tsx). The line says what the tick
                  DOES rather than describing it. */}
              <p className="mt-2 text-meta text-ink-500">ბარათზე დაიწერება „{PRICE_ON_REQUEST}“.</p>
            </div>
            {fieldErr('priceFrom')}

            {/* The call-out fee survives, because it is a real and separate thing:
                what it costs to come and look, before anybody knows what the job
                is. It is not a price for a service and never was, which is why it
                sits under a rule rather than beside the list — and that rule is
                why it stayed on this plate when the plate moved: it is still a
                price, still the same conversation, still not one of the rows. */}
            {/* ⚠️ ONLY WHERE A CALL-OUT EXISTS (2026-09-01, owner). „გამოძახება"
                — what it costs to come and look before anybody knows what the
                job is — is a TRADES idea. A lawyer, an accountant and a
                designer were all being asked for one, and a question that does
                not apply reads as a form written for somebody else.
                The rule is already this file's own, one block below: the city
                question hides itself while there is a single city, because „a
                question whose list holds a single chip is the form performing a
                choice nobody has". Same rule, different question.
                The value is CLEARED when the world changes (see the effect
                beside `world`), so a hidden box can never post a stale fee. */}
            {worlds.includes('SERVICE') && (
            <label className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
              <span className="min-w-[120px] flex-1">
                <span className="block font-display text-small font-semibold text-ink-900">გამოძახება</span>
                <span className="block text-meta text-ink-500">მისვლის ფასი, სამუშაოს გარეშე. არასავალდებულო.</span>
              </span>
              <span className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-field border border-ink-200 bg-white px-3.5 transition-colors duration-fast focus-within:border-brand-600">
                <input
                  type="number" min={1} max={100000} inputMode="numeric"
                  value={calloutFee} onChange={e => setCalloutFee(e.target.value)}
                  aria-label="გამოძახების ფასი"
                  placeholder="ფასი"
                  className="w-20 min-w-0 border-0 bg-transparent p-0 text-body font-bold tabular-nums text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-400"
                />
                <span className="text-small text-ink-600">₾</span>
              </span>
            </label>
            )}
          </div>

          {/* ⚠️ NOT ASKED WHILE THERE IS ONE CITY (2026-08-20). The same rule the
              intake already applies: a question whose list holds a single chip is
              the form performing a choice nobody has, and it was the third of
              seven BLOCKS — read as work before the questions that matter. The
              value is still SENT (see the effect that seeds `areas`), so the row
              is written exactly as it was. Serve a second city and it returns by
              itself — CITIES in lib/requestTopics. */}
          {cities.length > 1 && (
            <Sub title="სად მუშაობ" hint="სადაც გამოძახებაზე წახვალ." field="areas">
              <div className="flex flex-wrap gap-2">
                {cities.map(c => (
                  <PickChip key={c.id} on={areas.includes(c.id)} onClick={() => toggle(areas, setAreas, c.id, cities.length)}>
                    {c.label}
                  </PickChip>
                ))}
              </div>
              {fieldErr('areas')}
            </Sub>
          )}
        </Block>
        )}

        {/* ═══════════ 2 · ვინ ხარ ══════════════════════════════════════════
            Who to call, and the two things a client reads before deciding to:
            the sentence and the face. Both used to be numbered blocks of their
            own („შენ შესახებ", „შენი ფოტო") — they are the same stage. */}
        {step === 'who' && (
        <Block n={STAGES.findIndex(s => s.id === 'who') + 1} title={STAGE.who.label} hint={STAGE.who.hint} invalid={faultStage === 'who'}>
          <div className="flex flex-wrap gap-2.5">
            {MASTER_KINDS.map(k => (
              <KindChoice key={k} on={kind === k} onClick={() => setKind(k)}>{PROVIDER_KIND_LABEL[k]}</KindChoice>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">
                {kind === 'COMPANY' ? 'საკონტაქტო პირი' : 'სახელი და გვარი'}
              </span>
              <input data-field="fullName" {...faultProps('fullName')} className={fieldClass('fullName')} value={fullName} onChange={e => { setFullName(e.target.value); clearField('fullName') }} />
              {fieldErr('fullName')}
            </label>
            <label className="block">
              <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">ტელეფონი</span>
              {/* ⚠️ THE ONE BOX THAT IS TINTED WHILE IT IS EMPTY (the canvas's,
                  2026-08-31), and the tint is `tileHue(1)` — the SAME amber as
                  the blocked segment of the rail at the top and the word in the
                  „დარჩა" bar at the foot. Three marks, one colour, one meaning.
                  It is here and on no other box because the phone is what the
                  whole application is FOR: an approved provider we cannot ring
                  is a row nobody can use.
                  🔒 RED WINS. An amber „still needed" and a red „this is wrong"
                  are different facts and the second is the one being answered
                  right now, so the tint stands down the moment this field is
                  the fault (`bad`) — see FIELD_ERROR_BORDER on the class. */}
              <input
                data-field="phone"
                {...faultProps('phone')}
                style={phoneTint}
                className={fieldClass('phone')}
                value={phone}
                onChange={e => { setPhone(e.target.value); clearField('phone') }}
                inputMode="tel"
                placeholder="5XX XX XX XX"
              />
              {fieldErr('phone')}
            </label>
            {kind === 'COMPANY' && (
              <>
                <label className="block">
                  <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">კომპანიის სახელი</span>
                  <input data-field="companyName" {...faultProps('companyName')} className={fieldClass('companyName')} value={companyName} onChange={e => { setCompanyName(e.target.value); clearField('companyName') }} />
                  {fieldErr('companyName')}
                </label>
                <label className="block">
                  <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">
                    საიდენტიფიკაციო კოდი <span className="font-normal text-ink-400">არასავალდებულო</span>
                  </span>
                  <input className={FIELD} value={taxId} onChange={e => setTaxId(e.target.value)} inputMode="numeric" />
                </label>
              </>
            )}
          </div>
          <p className="mt-3 text-meta text-ink-500">ანგარიში: {email}</p>

          <Sub title="შენ შესახებ" hint="რამდენ ხანს მუშაობ, რაში ხარ ძლიერი. ეს კლიენტს ჩვენებია." field="about">
            <textarea
              rows={5}
              maxLength={MASTER.ABOUT_MAX}
              data-field="about"
              value={about}
              onChange={e => { setAbout(e.target.value); clearField('about') }}
              {...faultProps('about')}
              className={`w-full px-3.5 py-3 rounded-field border bg-white text-body text-ink-900 placeholder-ink-400 focus:ring-2 outline-none resize-y transition-colors duration-fast ${bad('about') ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-100' : 'border-ink-200 focus:border-brand-500 focus:ring-brand-100'}`}
              /* ⚠️ NO EXAMPLE (2026-09-01, owner: „ტექსტებიც ზოგადი უნდა
                 იყოს… ქართულ საიტებზე ასე არ იყენებენ"). It modelled the answer
                 with a plumber's biography — „12 წელია ვმუშაობ სანტექნიკაზე.
                 ბოილერი, კანალიზაცია, გათბობა…" — on a form a lawyer and an
                 accountant fill in too. The `Sub` above already says the general
                 thing („რამდენ ხანს მუშაობ, რაში ხარ ძლიერი"), so the example
                 added no instruction and narrowed the voice to one trade. */
            />
            {fieldErr('about')}
            {about.trim().length > 0 && about.trim().length < MASTER.ABOUT_MIN && (
              <p role="status" className="mt-1 text-meta text-danger-700">დაწერე ცოტა უფრო ვრცლად</p>
            )}
            {/* ⚠️ „გამოცდილება — N წელი" WAS ASKED HERE AND IS NOT ANY MORE
                (2026-08-31). Owner: „გამოცდილება 0 წელი … წაშალე, ყველგან არაა
                საჭირო." It was optional on this form and `required` in the
                provider's own editor, so one question had two different answers;
                and a profile that skipped it printed „0 წელი" on its public page,
                which is a measured-looking number that measured nothing. Rule 6:
                never invent a number. The four surfaces that read it are gone with
                it — the profile rail, both admin lists, and the editor. */}
          </Sub>

          <Sub
            title={kind === 'COMPANY' ? 'ლოგო ან ფოტო' : 'შენი ფოტო'}
            /* ⚠️ „დამტკიცებამდე დაგჭირდება" IS GONE (2026-09-01). It was true
               while the photo was a soft gate — apply without, be approved with
               — and it stopped being true the moment the owner moved the
               question into the form. A field that is required NOW but says it
               will be needed LATER is the same confusion the confirmation
               screen was making, one step earlier: the person reads it as
               optional, skips it, and is refused. What the sentence keeps is
               the part that was never about timing — WHY a face is asked for. */
            hint={
              /* ⚠️ THE PERSON'S HINT WAS A SENTENCE ABOUT TRUST („კლიენტთან
                 სახლში მიდიხარ — სახე ნდობის ნახევარია.") AND IS NOW A LABEL,
                 like the company's beside it (2026-09-02). Both halves of this
                 ternary now say WHAT the box wants; neither argues for it. */
              kind === 'COMPANY'
                ? 'კომპანიის ლოგო.'
                : 'შენი ფოტო.'
            }
            /* 🔒 THE ONE REQUIRED ANSWER ON THIS FORM THAT COULD BE REFUSED IN
               SILENCE (2026-09-02). `photoUrl` has been in the „ვინ ხარ"
               stage's `fields` since the stages were written, so a refusal on
               it painted this whole panel red — and then said NOTHING, because
               there was no `data-field` for `jumpTo` to find and no error slot
               for the message to print in. Walked it as a brand-new applicant:
               press „დასრულება" with everything filled but the photo, land on a
               red card, and no sentence anywhere names the photo.

               It survived this long behind the „დარჩა: ფოტო" link at the foot,
               which named the field the panel would not — and that bar was
               removed today at the owner's request, which is what exposed it.
               Two lines: the marker the jump needs, and the slot the message
               needs. Every other required field on this form has had both since
               it was written. */
            field="photoUrl"
          >
            <PhotoUploader value={photoUrl} onChange={setPhotoUrl} />
            {fieldErr('photoUrl')}
          </Sub>
        </Block>
        )}

        {/* ═══════════ 3 · სამუშაოს ფოტოები ═════════════════════════════════
            ⚠️ THE „+20₾" CHIP IS GONE (2026-09-01, owner: „ეს 20ლ რაში წერია,
            ანუ რას ამბობს… მიგდებული ესე არაფერს ამბობს").
            The number was real — `CREDIT_TASKS → PROFILE_CERTIFICATE`, read off
            the constant so the door and the balance could never disagree. What
            it lacked was the only thing that makes a number mean something: a
            reader who knows what it buys. This is somebody's FIRST screen as a
            provider. They have no balance, no contacts bought, and no reason to
            know that credits pay for a client's phone number at 1₾ a time. So
            „+20₾" beside „არასავალდებულო" reads as a price, a discount, or
            something they owe — three wrong answers and no right one.
            The reward still exists and still pays out; it belongs where it can
            be understood — on the balance, next to what it is spent on. */}
        {step === 'photos' && (
        <Block n={STAGES.findIndex(s => s.id === 'photos') + 1} title={STAGE.photos.label} field="workPhotos"
          optional={STAGE.photos.optional}
          hint={`თუ გაქვს — მაქსიმუმ ${MASTER.MAX_WORK_PHOTOS}.`}
        >
          <WorkPhotos value={workPhotos} onChange={setWorkPhotos} max={MASTER.MAX_WORK_PHOTOS} />
        </Block>
        )}

        {/* ⚠️ IT STICKS TO THE BOTTOM NOW (2026-08-31, the canvas's placement),
            AND THAT IS THE FIX THE „დარჩა" LIST HAS BEEN WAITING FOR. Naming
            what is missing (2026-08-20) was the right idea on a ~2600px form,
            and it was written at the very end of that form — so the one control
            that could tell you what to do next was the one thing you had to
            reach the bottom to read. Sticky, it is in view from the first
            section, and the jump links reach back up into the form from it.
            The gradient is what stops the bar cutting a card in half: the page
            fades into it rather than being clipped by it. */}
        {/* ⚠️ „უკან" LEFT, FORWARD RIGHT (2026-09-02). The bar used to hold the
            „დარჩა" links on the left and the one button after them, and the
            `order-*` classes on the controls existed to arrange THAT. With the
            links gone (owner's call, see the note below) a lone „შემდეგი"
            inherited the left edge — a primary action sitting where a label
            had been.
            `justify-between` with back declared first is the arrangement every
            multi-step form the owner was shown uses (Airbnb's listing flow,
            Airtasker's), and it survives the step with no back button: the
            forward control keeps the right edge because it is the only child.
            No `order-*` any more — DOM order IS reading order now, which is
            also what a keyboard walks. */}
        <div className="sticky bottom-0 z-chrome mt-6 flex flex-wrap items-center justify-between gap-4 bg-gradient-to-b from-transparent to-ink-50 to-40% py-3">
          {/* ⚠️ „დასრულება" ONLY ON THE LAST STEP (2026-09-02). It used to sit
              under the whole scroll, which was right when the whole form was
              the scroll. With three screens a submit on screen one would send
              an application whose second and third screens the applicant has
              not read — and the refusal that came back would bounce them
              forward into questions they were never shown.

              ⚠️ THE FORWARD BUTTON DOES NOT VALIDATE, deliberately. Every other
              control on this form follows the rule stated at `submit` — „the
              button is pressable even when the form is not done, and the press
              is what reports" — and a „შემდეგი" that refuses to move is the
              disabled-control-with-no-explanation that rule exists to prevent.
              Moving costs nothing: nothing is sent, the draft is in
              localStorage, the rail already ticks what is finished, and the
              „დარჩა" line beside this button names every gap on every screen.

              ⚠️ AND IT IS `type="button"`. Inside a <form>, a bare <button> is
              a SUBMIT button — „შემდეგი" would have posted the application from
              step one. */}
          {/* „უკან" is the product's own word for this — app/settings' bar and
              the client intake's wizard both already use it. Ghost, so the one
              filled control on the bar stays the one that moves forward. */}
          {stepIndex > 0 ? (
            <Btn
              type="button"
              size="lg"
              variant="ghost"
              onClick={() => setStep(STAGES[stepIndex - 1].id)}
            >
              უკან
            </Btn>
          ) : <span />}

          {stepIndex < STAGES.length - 1 ? (
            <Btn type="button" size="lg" onClick={() => setStep(STAGES[stepIndex + 1].id)}>
              შემდეგი
            </Btn>
          ) : (
            <Btn type="submit" size="lg" disabled={sending}>
              {sending ? 'იგზავნება…' : status ? 'ხელახლა გამოგზავნა' : 'დასრულება'}
            </Btn>
          )}
          {/* ⚠️ THE „დარჩა:" JUMP LINKS ARE GONE (2026-09-02, owner: „მინდა რომ
              ეს წაშალო — სწრაფი ლინკები").

              They were written on 2026-08-20 for a ~2 600px single-page form,
              where naming what was missing and jumping to it was the only way
              to find a box you had scrolled past, and made sticky on 2026-08-31
              so they were readable from the first section. Both of those
              reasons were about ONE LONG PAGE.

              The form is three screens now, and the RAIL above says the same
              thing better: it reads the same `missing` list, ticks a step the
              moment nothing in it is outstanding, and — unlike the links — is
              on screen while you answer rather than in a bar under your thumb.
              A row of three underlined words beside the one button that moves
              you forward was competing with it.

              ⚠️ NOTHING IS LOST WHEN THE FORM IS REFUSED. Pressing „დასრულება"
              still stops on the first outstanding field, paints its panel, says
              why beside the box and switches to the screen that owns it — see
              `stopOn` and `goToField`, both untouched. `missing` is still
              computed and still does its two other jobs: the rail's tick, and
              the amber tint on a field that is required and still empty
              (`stillNeeded`). */}
        </div>
        {/* Only what has NO field left to land on — a dropped network, an
            endpoint code this screen did not predict. A refusal that names a
            box is drawn AT the box now, and printing it twice on a form this
            tall reads as two different problems. */}
        {err && !fault && (
          <p role="alert" className="mt-3 text-small text-danger-700 inline-flex items-center gap-1.5">
            <Icon.warn className="w-4 h-4 shrink-0" /> {err}
          </p>
        )}
      </form>
    </Container>,
  )
}

'use client'
// /apply — the application form container. Owns the form state, the funnel
// events, validation wiring and submit; every part lives in a `_*.tsx` beside it.
//
// Chrome: the bespoke local TopBar (logo + „დახურვა“ ✕) is gone — /apply now
// mounts the SHARED <PublicTopBar activeHref="/join" initialUser={initialUser} /> + <Footer />, so the
// header doesn't swap out and the footer doesn't vanish when a visitor taps
// „გახდი ექსპერტი“. The ✕ escape hatch isn't missed: the shared header carries
// the full site nav (and the logo → home). PublicTopBar is h-16 sm:h-20 — the
// sticky rails below use `top-20`, since both only render at lg+/xl+.

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Container } from '@/components/Container'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { Illustration } from '@/components/Illustration'
import { PublicTopBar } from '@/components/PublicTopBar'
import { StepIndicator } from '@/components/StepIndicator'
import type { Me } from '@/lib/me'
import { Footer } from '@/components/Footer'
import { APPLY_FUNNEL_EVENTS, newApplyFlowId, trackApply } from './applyFunnelEvents'
import { checkGeorgian, georgianError } from '@/lib/georgianText'
import { bioError, nameError, otherCatError, priceError, specialtyError, videoError, yearsError } from '@/lib/applyValidation'
import { phoneFormatError } from '@/lib/phone'
import { FormFooter, ProgressNav } from './_chrome'
import { clearApplyDraft, readApplyDraft, writeApplyDraft } from './_draft'
import { ApplyErrCtx } from './_fields'
import { AVAIL_WEEKS, ApplyErr, DEFAULT_AVAIL, FormState, INITIAL_FORM, MAX_CATS, MediaState, SERVER_FIELD, STEPS, StepId, StepPart, isValidEmail } from './_form'
import { MAX_PROFESSIONS } from '@/lib/professions'
import { LivePreview, Step1, Step2 } from './_steps'
import { certificatesPayload } from './_upload'

/** The top strip's steps — STEPS with its labels under the shared name. */
const STEP_STRIP = STEPS.map(s => ({ id: s.id, label: s.l }))

/* ───── Page ───── */
export default function TutorApply({ initialUser, seed, onContinueMaster }: {
  initialUser?: Me | null
  /** The /join door's answer — sphere (as `cats[0]`) and professions. Applied
   *  once on mount over the restored draft; empty fields leave the draft alone. */
  seed?: { cats?: string[]; professions?: string[] }
  /** Set when the applicant also ticked „ვარ ხელოსანი" on the door: the
   *  success screen then offers the master form as its next step. */
  onContinueMaster?: () => void
}) {
  const [submitted, setSubmitted] = useState(false)
  const [step, setStep] = useState<StepId>(1)
  const [part, setPart] = useState<StepPart>(1)
  // Jumping via the progress nav always lands on a step's first screen; the
  // footer's back/next manage `part` themselves.
  const jumpToStep = (s: StepId) => { setStep(s); setPart(1) }
  const [completed, setCompleted] = useState<Set<StepId>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // The same message, pinned to the control that refused. See ApplyErrCtx.
  const [fieldErr, setFieldErr] = useState<ApplyErr>(null)
  // Email-verification state, detected up front via /api/me so an unverified
  // applicant is warned from step 1 — not blocked only at final submit.
  // null = unknown/loading (or signed-out), true/false = known.
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null)
  const [accountEmail, setAccountEmail] = useState('')
  // Existing application status, so a returning applicant sees "under review" /
  // "rejected (reason)" instead of a blank form they might re-fill blindly.
  const [appStatus, setAppStatus] = useState<'SUBMITTED' | 'REJECTED' | 'APPROVED' | 'NEEDS_REVISION' | null>(null)
  const [appNote, setAppNote] = useState<string | null>(null)
  const [appLoaded, setAppLoaded] = useState(false)
  // A SUBMITTED applicant can choose to edit + re-submit; this reveals the form.
  const [forceEdit, setForceEdit] = useState(false)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  // Uploaded media — deliberately NOT persisted to the localStorage draft (base64
  // data URLs would exceed the quota); re-upload after a refresh is acceptable.
  const [media, setMedia] = useState<MediaState>({ certificates: [] })
  const setMediaPatch = (patch: Partial<MediaState>) => {
    setMedia(m => ({ ...m, ...patch }))
    // Uploading the photo IS the fix for „ატვირთე პროფილის ფოტო" — the error
    // has to clear on it exactly as it does on a keystroke.
    setSubmitError(e => (e ? null : e))
    setFieldErr(e => (e ? null : e))
  }
  const [draftRestored, setDraftRestored] = useState(false)
  const [draftLoaded, setDraftLoaded] = useState(false)
  // Restore any recent draft on mount. Runs once client-side.
  // One anonymous id per attempt — stitches this session's funnel rows together.
  // A ref, not state: it must never change and must never cause a re-render.
  const flowId = useRef<string>('')
  if (!flowId.current) flowId.current = newApplyFlowId()

  useEffect(() => {
    const restored = readApplyDraft()
    if (restored) {
      // Merge over INITIAL_FORM so a draft saved before a field existed (e.g.
      // `languages`) doesn't leave it undefined and crash consumers.
      setForm({ ...INITIAL_FORM, ...restored })
      setDraftRestored(true)
    }
    // The door's choice is the freshest answer, so it wins over the draft —
    // but only the fields it actually carries; a blank door leaves the draft.
    if (seed?.cats?.length || seed?.professions?.length) {
      setForm(f => ({
        ...f,
        cats: seed.cats?.length ? seed.cats.slice(0, MAX_CATS) : f.cats,
        professions: seed.professions?.length ? seed.professions : f.professions,
        otherCat: seed.cats?.length ? '' : f.otherCat,
      }))
    }
    setDraftLoaded(true)
    // The funnel's denominator. Without it „two people applied" and „twenty
    // started and two finished" are indistinguishable — opposite problems.
    trackApply(APPLY_FUNNEL_EVENTS.opened, { flowId: flowId.current, resumed: !!restored })
  }, [])
  // Prefill from the signed-in account so the expert never re-types what signup
  // already collected. The account carries fullName + email; we split fullName
  // on the first space into first/last and fill ONLY still-empty fields — so a
  // restored draft (or anything the user already typed) is never clobbered.
  useEffect(() => {
    let cancelled = false
    fetch('/api/me')
      .then(r => r.json())
      .then(d => {
        if (cancelled || !d?.user) return
        setEmailVerified(!!d.user.emailVerified)
        if (d.user.email) setAccountEmail(d.user.email)
        const full = (d.user.fullName ?? '').trim()
        const sp = full.indexOf(' ')
        const first = sp === -1 ? full : full.slice(0, sp)
        const last = sp === -1 ? '' : full.slice(sp + 1).trim()
        setForm(f => ({
          ...f,
          firstName: f.firstName.trim() ? f.firstName : first,
          lastName: f.lastName.trim() ? f.lastName : last,
          // ALWAYS the account address — the field is read-only and represents
          // where the answer actually goes, so a restored draft (or an older
          // typed value) must never win over it.
          email: d.user.email ?? f.email,
        }))
        // The photo is REQUIRED, and an avatar the person UPLOADED already
        // satisfies it — nobody should have to re-upload a photo they gave us.
        //
        // ⚠️ A GOOGLE AVATAR DOES NOT COUNT (owner's call, 2026-08-05, and the
        // URLs confirm it): Google hands back `…googleusercontent.com/a/…=s96`,
        // i.e. 96×96 pixels. That is fine for a small client avatar and far too
        // small for an expert's card and profile, where the photo is the first
        // thing a paying visitor judges. Seeding it silently marked the field
        // done and shipped a blurry expert — 17 of the 30 stored avatars are
        // exactly these. An uploaded one is a `data:` URL (our own /api/uploads
        // output, sharp-resized), which is why that is the whole test.
        const uploaded = d.user.avatarUrl?.startsWith('data:') ? d.user.avatarUrl : null
        if (uploaded) setMedia(m => (m.photoUrl ? m : { ...m, photoUrl: uploaded }))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  // Fetch the caller's own application so a returning applicant gets a real
  // status screen (under review / rejected) instead of a blank wizard.
  const [appPrefill, setAppPrefill] = useState<any>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/applications')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled) return
        const a = d?.application
        if (a?.status) { setAppStatus(a.status); setAppNote(a.moderatorNote ?? null) }
        if (a) setAppPrefill(a)
        setAppLoaded(true)
      })
      .catch(() => { if (!cancelled) setAppLoaded(true) })
    return () => { cancelled = true }
  }, [])
  // Seed the wizard from the applicant's OWN previously-submitted values so the
  // „needs revision" (or edit-and-resubmit) re-edit isn't a blank form off-device
  // / after the 7-day draft expired. A local draft always wins (it's the freshest
  // in-progress state), so we only seed when NO draft was restored. Runs once.
  const appSeeded = useRef(false)
  useEffect(() => {
    if (appSeeded.current) return
    if (!appLoaded || !draftLoaded) return   // wait for both status + draft to settle
    if (draftRestored) { appSeeded.current = true; return } // draft is fresher → don't overwrite
    const a = appPrefill
    if (!a) { appSeeded.current = true; return }
    appSeeded.current = true
    const pd = (a.professionData && typeof a.professionData === 'object') ? a.professionData : {}
    const full = (a.fullName ?? '').trim()
    const sp = full.indexOf(' ')
    const first = sp === -1 ? full : full.slice(0, sp)
    const last = sp === -1 ? '' : full.slice(sp + 1).trim()
    // Invert submitApplication()'s specialty packing: a niche the applicant typed
    // lands in professionData.requestedCategory (cats was empty); otherwise
    // specialty is the picked category name.
    const requestedCategory: string = typeof pd.requestedCategory === 'string' ? pd.requestedCategory : ''
    const professions: string[] = Array.isArray(pd.professions)
      ? pd.professions.map((x: any) => String(x)).filter(Boolean)
      : []
    const specialty: string = typeof a.specialty === 'string' ? a.specialty : ''
    const services = Array.isArray(pd.services) && pd.services.length
      ? pd.services.map((s: any) => ({
          name: String(s?.name ?? ''),
          dur: Number(s?.dur) || 60,
          price: Number(s?.price) || 0,
          free: !!s?.free,
          desc: String(s?.desc ?? ''),
        }))
      : null
    const languages = Array.isArray(pd.languages) && pd.languages.length
      ? pd.languages.map((l: any) => String(l))
      : null
    // Strip the keys we unpacked back into first-class form fields so the leftover
    // professionData (dynamic profession-specific answers) is preserved cleanly.
    // The weekly pattern, inverted back into the picker's shape. Without this a
    // „needs revision" resubmit would silently republish the DEFAULT week over
    // whatever the applicant actually chose the first time.
    const av = pd.availability
    const avail = av && Array.isArray(av.days)
      ? {
          days: Array.from({ length: 7 }, (_, i) => av.days.includes(i)),
          startHour: Number(av.startHour) || DEFAULT_AVAIL.startHour,
          endHour: Number(av.endHour) || DEFAULT_AVAIL.endHour,
        }
      : null
    const { requestedCategory: _rc, headline: _hl, languages: _lg, services: _sv, availability: _av, ...restPd } = pd
    setForm(f => ({
      ...f,
      firstName: f.firstName.trim() ? f.firstName : first,
      lastName: f.lastName.trim() ? f.lastName : last,
      phone: f.phone.trim() ? f.phone : (a.phone ?? ''),
      city: f.city.trim() ? f.city : (a.city ?? ''),
      yearsExp: f.yearsExp.trim() ? f.yearsExp : (a.yearsExp != null ? String(a.yearsExp) : ''),
      motivation: f.motivation.trim() ? f.motivation : (a.motivation ?? ''),
      linkedin: f.linkedin.trim() ? f.linkedin : (a.linkedinUrl ?? ''),
      website: f.website.trim() ? f.website : (a.websiteUrl ?? ''),
      introVideoUrl: f.introVideoUrl.trim() ? f.introVideoUrl : (a.introVideoUrl ?? ''),
      headline: f.headline.trim() ? f.headline : (typeof pd.headline === 'string' ? pd.headline : ''),
      // Trimmed to one: a draft saved while the step asked for „1–3" would
      // otherwise fail validation on a value the form can no longer produce,
      // blocking somebody on a choice they made yesterday. See MAX_CATS.
      cats: (f.cats.length ? f.cats : (requestedCategory || !specialty ? [] : [specialty])).slice(0, MAX_CATS),
      // The typed niche comes back too. Without this a „needs revision" resubmit
      // silently dropped it and the applicant was blocked by the sphere gate on
      // an answer they had already given.
      otherCat: f.otherCat.trim() ? f.otherCat : requestedCategory,
      professions: f.professions.length ? f.professions : professions,
      languages: languages ?? f.languages,
      services: services ?? f.services,
      avail: avail ?? f.avail,
      professionData: { ...restPd, ...f.professionData },
    }))
  }, [appLoaded, draftLoaded, draftRestored, appPrefill])
  // Recovery action for the unverified banner — (re)send the code and hand the
  // user to the verify view, which returns here (?next=/apply) once verified.
  const requestEmailVerify = () => {
    const em = (accountEmail || form.email).trim().toLowerCase()
    if (em) {
      fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em, purpose: 'verify' }),
      }).catch(() => {})
    }
    window.location.href = `/signin?view=verify${em ? `&email=${encodeURIComponent(em)}&next=/join` : ''}`
  }
  // Persist the merged form after each edit. `draftLoaded` guards against
  // clobbering a saved draft with the empty INITIAL_FORM before restore runs.
  const set = (patch: Partial<FormState>) => {
    setForm(f => {
      const next = { ...f, ...patch }
      if (draftLoaded) writeApplyDraft(next)
      return next
    })
    // Editing anything clears the complaint — including the one pinned under a
    // field. A red line that survives the fix reads as „still wrong".
    if (submitError) setSubmitError(null)
    if (fieldErr) setFieldErr(null)
  }
  // The draft is cleared on a SUCCESSFUL SUBMIT only (see submitApplication) —
  // never on merely reaching the last screen. It used to clear on `step === 3`,
  // so refreshing or navigating back on the review screen silently threw the
  // whole application away with nothing submitted.
  // Each screen change starts at the top — without this, advancing from a long
  // screen leaves the user mid-scroll on the next one, which reads as broken.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [step, part])

  // Final pre-submit gate. Must stay a SUPERSET of what /api/applications
  // enforces (fullName ≥2, specialty ≥2, motivation ≥20, hourlyRate 10–5000),
  // so a form that passes here can never be rejected by the server with the
  // generic „შეავსე ყველა აუცილებელი ველი" — which tells the user nothing.
  // Phone is NOT gated: it's optional in onboarding now.
  // A validator that only produces TEXT leaves the applicant hunting: the error
  // renders in a box at the bottom of the form, and if the offending field is
  // above the fold they are told „fill in the field" with no way to tell which.
  // `fail` keeps the message identical and records WHERE — the UI then takes
  // them there. Anchors are `data-field` attributes on the inputs.
  const invalidField = useRef<string | null>(null)
  const fail = (field: string, msg: string): string => {
    invalidField.current = field
    // Also render the sentence UNDER the control (ApplyErrCtx → <FieldError/>).
    // The box at the bottom says something is wrong; this says which thing.
    setFieldErr({ field, msg })
    return msg
  }
  /** Which screen each anchor lives on — so a jump can change steps first. */
  const FIELD_STEP: Record<string, StepId> = {
    firstName: 1, lastName: 1, email: 1, phone: 1, cats: 1, otherCat: 1, headline: 1,
    // `introVideoUrl` left this map with the field itself (2026-08-20) — a
    // name here with no `data-field` on the page is an error that jumps to a
    // control that does not exist.
    photo: 1, motivation: 1, yearsExp: 1, city: 1,
    // Moved onto step 1 with the third screen's removal (2026-08-07).
    linkedin: 1, website: 1, certificates: 1,
    services: 2, avail: 2,
  }
  /** Scroll to and focus the field the last validation failure named. */
  const focusInvalidField = () => {
    const key = invalidField.current
    if (!key || typeof document === 'undefined') return
    // THE FIELD MAY NOT BE ON SCREEN. The final gate re-checks all three steps
    // (and the API can refuse a step-1 value at submit time), so an error can
    // name a field two screens back. Without this the applicant reads „fix your
    // name" on the review screen with no name field in sight.
    const target = FIELD_STEP[key]
    const needsJump = target !== undefined && target !== step
    if (needsJump) { setStep(target); setPart(1) }
    // Next frame: the error box renders in the same commit and shifts layout,
    // so measuring before paint would scroll to the wrong place. A step change
    // needs one more — the new screen has to mount before it can be measured.
    const afterPaint = (fn: () => void) =>
      needsJump ? requestAnimationFrame(() => requestAnimationFrame(fn)) : requestAnimationFrame(fn)
    afterPaint(() => {
      const anchor = document.querySelector<HTMLElement>(`[data-field="${key}"]`)
      if (!anchor) return
      const target = anchor.matches('input,textarea,select,button')
        ? anchor
        : anchor.querySelector<HTMLElement>('input,textarea,select,button')
      ;(target ?? anchor).scrollIntoView({ block: 'center', behavior: 'smooth' })
      // preventScroll: scrollIntoView above already owns the movement, and a
      // second one from focus() lands a frame later as a visible jerk.
      target?.focus({ preventScroll: true })
    })
  }

  // The step gate reports through this, so „შემდეგი" also takes you to the
  // field instead of just complaining underneath the form.
  const onStepError = (msg: string | null) => {
    setSubmitError(msg)
    if (msg) focusInvalidField()
  }

  /* THE CONTRACT WITH THE API (lib/applyValidation.ts): everything this accepts,
   * POST /api/applications accepts. Both sides now call the SAME rule functions,
   * so „the form let it through and the server refused it" cannot come back by
   * someone editing one bound and not the other. The step gates below are the
   * same rules, applied as soon as the field is on screen — the last thing an
   * applicant should meet is a wall on the final screen. */
  const validateStep = (s: StepId, _p: StepPart = 1): string | null => {
    if (s === 1) {
      // EACH FIELD ON ITS OWN. This used to join them and validate the pair,
      // so „ნინო" + „Beridze" put the red line under სახელი — the one field
      // that was right — and said „name and surname". A form must point at the
      // thing that is wrong. The server still checks the joined value (it only
      // ever receives `fullName`), which is the backstop, not the first word.
      { const e = nameError(form.firstName); if (e) return fail('firstName', e) }
      { const e = nameError(form.lastName, 'გვარი'); if (e) return fail('lastName', e) }
      if (!isValidEmail(form.email)) return fail('email', 'შეიყვანე სწორი ელფოსტა.')
      // Required: the moderator phones the applicant. lib/phone is the same
      // rule signup uses, so a number accepted there is accepted here.
      { const e = phoneFormatError(form.phone, { required: true }); if (e) return fail('phone', e) }
      // EITHER a chip OR the applicant's own words. Until 2026-08-11 this was
      // chip-only, which meant anyone whose field is not on the list could not
      // finish the form at all — they picked the nearest wrong sphere or left.
      // See OTHER_CAT_MAX in ./_form for the whole reasoning.
      { const e = otherCatError(form.otherCat); if (e) return fail('cats', e) }
      // The SPHERE is the required answer; professions are the detail inside
      // it, and the typed-in niche is still a complete answer on its own.
      if (!form.cats.length && !form.otherCat.trim()) {
        return fail('cats', 'აირჩიე კატეგორია, ან დაწერე შენი.')
      }
      if (form.professions.length > MAX_PROFESSIONS) {
        return fail('cats', `მაქსიმუმ ${MAX_PROFESSIONS} პროფესია.`)
      }
      if (form.cats.length > MAX_CATS) return fail('cats', 'აირჩიე ერთი კატეგორია.')
      if (form.headline.trim().length < 2) return fail('headline', 'დაწერე ერთი წინადადება შენზე.')
      { const e = georgianError('ერთი წინადადება შენზე', checkGeorgian(form.headline)); if (e) return fail('headline', e) }
      // A profile with no face is the single weakest thing on the marketplace —
      // it converts badly and it reads as unfinished. Required from 2026-07-29.
      if (!media?.photoUrl) return fail('photo', 'ატვირთე პროფილის ფოტო — ის ყველგან გამოჩნდება, სადაც კლიენტი შენ გხედავს.')
      { const e = bioError(form.motivation); if (e) return fail('motivation', e) }
      // Optional fields, but a bad value in one still 400s the whole submit —
      // and it does so two screens later, where nothing points back here.
      { const e = yearsError(form.yearsExp); if (e) return fail('yearsExp', e) }
      // ⚠️ THE VIDEO URL IS NO LONGER VALIDATED, BECAUSE IT IS NO LONGER ASKED
      // (2026-08-20). The field left the form — see the note in ./_steps — so
      // naming it in a validator would jump to a control that is not on the
      // page: an error with nowhere to land, which is the exact failure
      // tests/apply-error-focus F2 exists to catch.
      //
      // ⚠️ AND THE FIELD NAME IS NOT WRITTEN OUT ANYWHERE ABOVE, deliberately.
      // That test scans this file as TEXT, comments included, so an example of
      // the very call being described re-creates the failure it explains. Cost
      // twenty minutes the day it was written.
      //
      // A value can still arrive from a draft saved before the removal; it is
      // passed through untouched and the server's own bound is the backstop.
      return null
    }
    if (s === 2) {
      const paidService = form.services.find(sv => !sv.free && sv.price > 0)
      { const e = priceError(paidService?.price ?? 0); if (e) return fail('services', e) }
      // Every offering needs a NAME. It was pre-filled with „კონსულტაცია" and
      // therefore never empty, so nothing checked it; the seeded row is blank
      // now (see FormState.services) because naming somebody's service for them
      // is an anchor, and a blank one must be refused rather than published.
      { const unnamed = form.services.find(sv => !sv.free && sv.name.trim().length < 2)
        if (unnamed) return fail('services', 'დაასახელე შენი სერვისი — ეს არის ის, რასაც კლიენტი კატალოგში დაინახავს.') }
      // ⚠️ THE SCHEDULE IS REQUIRED ONLY IF SOMETHING CAN BE BOOKED
      // (2026-08-20). This used to fire unconditionally, so an expert selling
      // a JOB — „ხელშეკრულების შედგენა" — was refused registration until they
      // published a working week for an appointment that does not exist. The
      // reason it exists at all is unchanged and still applies to the bookable
      // half: an expert with no published day cannot be booked, which was the
      // single biggest hole in the funnel.
      if (form.services.some(sv => sv.bookable)) {
        if (!form.avail.days.some(Boolean)) return fail('avail', 'აირჩიე მინიმუმ ერთი დღე — ამის გარეშე შენთან ჯავშანი შეუძლებელია.')
        if (form.avail.endHour <= form.avail.startHour) return fail('avail', 'დასრულების საათი დაწყებაზე გვიან უნდა იყოს.')
      }
      return null
    }
    return null
  }

  /* Final gate before the POST. Deliberately re-runs EVERY step, not just the
   * last one: a draft restored from localStorage, a value seeded from a previous
   * application, or a step reached before a rule existed can all put an invalid
   * value behind the applicant. `fail()` carries the step, so the jump lands on
   * the right screen instead of pointing at a field that isn't rendered. */
  const validate = (): string | null =>
    validateStep(1) ?? validateStep(2) ?? (() => {
      // `specialty` is derived at submit (cats[0], else the headline) — so it is
      // the one value no single input owns and no step gate covers.
      const specialty = form.cats[0] || form.otherCat.trim() || form.headline.trim().slice(0, 60)
      const e = specialtyError(specialty)
      return e ? fail('cats', e) : null
    })()

  /**
   * Field → block code. The names are the FIELD that refused, spelled as the
   * SCREAMING_SNAKE constants the events validator already accepts for `code`,
   * so no new prop key and no validator change is needed.
   *
   * A code, never the message: the message is copy and will be reworded, while
   * „PHOTO_REQUIRED" stays comparable across every rewrite.
   */
  const BLOCK_CODE: Record<string, string> = {
    firstName: 'NAME_REQUIRED',
    email: 'EMAIL_INVALID',
    phone: 'PHONE_INVALID',
    cats: 'CATEGORY_REQUIRED',
    headline: 'HEADLINE_INVALID',
    photo: 'PHOTO_REQUIRED',
    motivation: 'BIO_TOO_SHORT',
    services: 'PRICE_REQUIRED',
  }

  /** „გაგრძელება" was refused. `invalidField` was just set by `fail()`. */
  const onStepBlocked = (step: StepId) => {
    trackApply(APPLY_FUNNEL_EVENTS.blocked, {
      flowId: flowId.current,
      step,
      code: BLOCK_CODE[invalidField.current ?? ''] ?? 'UNKNOWN',
    })
  }

  // Step-completion facts. COUNTS and BOOLEANS only — the applicant's bio and
  // headline are them describing themselves; their length is a funnel signal,
  // the text is not ours to log (same rule as the booking funnel).
  const onStepDone = (done: StepId) => {
    if (done === 1) {
      trackApply(APPLY_FUNNEL_EVENTS.profileDone, {
        flowId: flowId.current,
        step: 1,
        catCount: form.cats.length,
        headlineLen: form.headline.trim().length,
        bioLen: form.motivation.trim().length,
        hasPhone: form.phone.trim().length > 0,
        hasPhoto: !!media.photoUrl,
        certCount: media.certificates.length,
      })
    } else if (done === 2) {
      const paid = form.services.find(sv => !sv.free && sv.price > 0)
      trackApply(APPLY_FUNNEL_EVENTS.pricingDone, {
        flowId: flowId.current,
        step: 2,
        serviceCount: form.services.filter(sv => sv.name.trim()).length,
        priceGel: paid?.price ?? 0,
      })
    }
  }

  const submitApplication = async () => {
    const err = validate()
    if (err) {
      setSubmitError(err)
      focusInvalidField()
      // A CLIENT-side block is still a funnel loss, and knowing it was a block
      // (not a shrug) is the whole point of separating these two events.
      trackApply(APPLY_FUNNEL_EVENTS.failed, { flowId: flowId.current, step: 2, code: 'CLIENT_VALIDATION' })
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const paidService = form.services.find(s => !s.free && s.price > 0)!
      // The niche the applicant typed falls back into `specialty` so a
      // not-listed expert is never blocked — and it is ALSO stashed in
      // professionData below, unconditionally. That „unconditionally" is the
      // whole repair: the deleted version wrote it only when no chip was
      // picked, so 7 of 8 answers were discarded in the browser and the admin
      // never saw what people were asking for.
      const specialty = form.cats[0] || form.otherCat.trim() || form.headline.trim().slice(0, 60)
      const body = {
        fullName: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
        phone: form.phone.trim(),
        city: form.city.trim() || undefined,
        specialty,
        yearsExp: Number(form.yearsExp) || 0,
        hourlyRate: paidService.price,
        motivation: form.motivation.trim(),
        linkedinUrl: form.linkedin.trim() || undefined,
        websiteUrl: form.website.trim() || undefined,
        introVideoUrl: form.introVideoUrl.trim() || undefined,
        // Languages are public info → fold into professionData (which the profile
        // may surface). Verification docs stay on their own admin-only fields.
        professionData: (() => {
          const pd: Record<string, any> = { ...form.professionData }
          // ALWAYS, chip or no chip. This is the signal the taxonomy grows from:
          // the moderator reads it on the application, and the „კატეგორიები" tab
          // aggregates it into „who asked for what, how many times".
          if (form.otherCat.trim()) pd.requestedCategory = form.otherCat.trim()
          // WHAT THEY ARE — „ბუღალტერი", „მარკეტოლოგი", several of them.
          // Approval copies these onto TutorProfile.professions; `specialty`
          // still carries the SPHERE, so the category match is untouched.
          if (form.professions.length) pd.professions = form.professions
          if (form.languages.length) pd.languages = form.languages
          // The one-line pitch the applicant wrote (and saw in the live preview)
          // used to be discarded at submit — the approved profile then showed the
          // category name as its headline. Stash it here so approval can seed the
          // real headline, not re-ask for it.
          if (form.headline.trim()) pd.headline = form.headline.trim()
          // Preserve EVERY service the expert defined (name/desc/duration/price),
          // not just the one paid rate sent as hourlyRate above — these become
          // real Consultation tiers on approval. Previously all but the first
          // paid service were silently dropped at submit.
          const services = form.services
            .filter(s => s.name.trim())
            .map(s => ({ name: s.name.trim(), desc: s.desc.trim(), dur: s.dur, price: s.free ? 0 : s.price, free: !!s.free }))
          if (services.length) pd.services = services
          // The weekly pattern approval materializes into real windows. Sent as
          // day INDEXES (Mon=0) — the same convention as the bulk availability
          // API, so nothing has to translate between them.
          pd.availability = {
            days: form.avail.days.map((on, i) => (on ? i : -1)).filter(i => i >= 0),
            startHour: form.avail.startHour,
            endHour: form.avail.endHour,
            weeks: AVAIL_WEEKS,
          }
          return Object.keys(pd).length ? pd : undefined
        })(),
        // ID doc / selfie removed from onboarding — no KYC gate. The optional
        // diploma/licence attachment from step 3 rides here; `undefined` when
        // nothing was attached, which never blocks the submit.
        // `issuer` rides along: approval already reads it (it writes the real
        // issuer onto the profile's certificate rows instead of a placeholder),
        // but the payload builder dropped it — so the input the applicant filled
        // in had never once reached the server.
        certificates: certificatesPayload(media.certificates),
      }
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 401) {
        window.location.href = '/signin?redirect=/join'
        return
      }
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || data?.ok === false) {
        const code = data?.error
        /* THE SERVER'S OWN SENTENCE COMES FIRST.
         *
         * This is the bug that started the 2026-08-06 pass: the API answered
         * „სახელი და გვარი ქართულად ჩაწერე…" in `message`, and this branch
         * dropped it on the floor, showed „სცადე თავიდან", and the applicant
         * retried the identical payload until they gave up. The API contract is
         * now { error, field, message } — read all three. The fallbacks below
         * only cover a response that predates it, or a code with no message. */
        const msg =
          (typeof data?.message === 'string' && data.message.trim()) ? data.message.trim() :
          code === 'INVALID_VIDEO_URL' ? 'YouTube-ის ბმული არასწორია — შეამოწმე ან ცარიელი დატოვე.' :
          code === 'INVALID' || code === 'INVALID_TEXT' ? 'ერთი ველი არასწორად არის შევსებული — შეამოწმე ფორმა და სცადე თავიდან.' :
          code === 'EMAIL_NOT_VERIFIED' ? 'ჯერ დაადასტურე ელფოსტა პარამეტრებში, შემდეგ გამოგზავნე განაცხადი.' :
          res.status === 429 ? 'ძალიან ბევრი მცდელობა — დაელოდე ერთ წუთს და სცადე თავიდან.' :
          res.status >= 500 ? 'სერვერზე შეცდომაა — შენი ნაწერი შენახულია, სცადე რამდენიმე წუთში.' :
          !res.ok && !code ? 'გაგზავნა ვერ მოხერხდა. თუ დოკუმენტი დაურთე, სცადე უფრო მცირე ზომის ფაილით.' :
          'განაცხადის გაგზავნა ვერ მოხერხდა — სცადე თავიდან.'
        setSubmitError(msg)
        // …and TAKE THEM TO IT. The API names the field in its own vocabulary;
        // SERVER_FIELD maps it onto this form's anchors, and focusInvalidField()
        // changes step if the field lives on a screen they have already left.
        const anchor = SERVER_FIELD[String(data?.field ?? '')]
        if (anchor) {
          invalidField.current = anchor
          setFieldErr({ field: anchor, msg })
          focusInvalidField()
        }
        // The server's own code, so „blocked by a rule" is separable from
        // „gave up". `reason` is a constant the API returned — never a message.
        trackApply(APPLY_FUNNEL_EVENTS.failed, {
          flowId: flowId.current,
          step: 2,
          code: typeof code === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(code) ? code : 'UNKNOWN',
        })
        return
      }
      setSubmitted(true)
      clearApplyDraft()
      trackApply(APPLY_FUNNEL_EVENTS.submitted, { flowId: flowId.current, step: 2 })
    } catch {
      setSubmitError('ქსელის შეცდომა — შეამოწმე კავშირი და სცადე თავიდან.')
      trackApply(APPLY_FUNNEL_EVENTS.failed, { flowId: flowId.current, step: 2, code: 'NETWORK' })
    } finally {
      setSubmitting(false)
    }
  }

  const clearDraftAndReset = () => {
    clearApplyDraft()
    setForm(INITIAL_FORM)
    setDraftRestored(false)
    setStep(1)
    setCompleted(new Set())
  }

  if (submitted) {
    // Honest confirmation: recap what the applicant ACTUALLY submitted (from
    // form state) + honest next steps. No fabricated moderator / auto-score /
    // countdown / file list — those were fiction shown right after the KYC step.
    const specialty = form.headline.trim() || form.cats[0] || 'ექსპერტი'
    const serviceCount = form.services.filter(s => s.name.trim()).length
    const recap: { l: string; v: string }[] = [
      { l: 'მიმართულება', v: specialty },
      ...(form.cats.length ? [{ l: 'კატეგორია', v: form.cats.join(', ') }] : []),
      ...(form.yearsExp.trim() ? [{ l: 'გამოცდილება', v: `${form.yearsExp} წელი` }] : []),
      ...(serviceCount > 0 ? [{ l: 'სერვისები', v: `${serviceCount} სერვისი` }] : []),
    ]
    return (
      <div className="font-sans bg-ink-50/30 text-ink-900 antialiased min-h-screen flex flex-col">
        <PublicTopBar activeHref="/join" initialUser={initialUser} />
        <Container as="main" size="content" className="flex-1 py-16 lg:py-24">
          <div className="max-w-[560px] mx-auto text-center">
            {/* The illustration REPLACES the green check medallion — a tinted
                disc behind a transparent drawing is the „separate background"
                the illustration rules forbid, and two success graphics stacked
                above one heading reads as a template. */}
            <div className="flex justify-center mb-4 motion-safe:animate-scale-in">
              <Illustration name="expertApplication" alt="" />
            </div>
            <h1 className="font-display text-h1 font-bold tracking-tight">განაცხადი მიღებულია</h1>
            <p className="mt-3 text-body text-ink-600 leading-[1.6]">
              მადლობა! განაცხადს ადამიანი წაიკითხავს და პასუხს ჩვეულებრივ 24–48 საათში მიიღებ — შეტყობინებით, დამტკიცების შემთხვევაში კი ელფოსტითაც.
            </p>

            <div className="mt-8 text-left rounded-card border border-ink-200 bg-white p-5">
              <div className="font-display text-micro font-semibold uppercase text-ink-500 mb-3">შენი განაცხადი</div>
              <dl className="space-y-2.5">
                {recap.map(r => (
                  <div key={r.l} className="flex items-baseline justify-between gap-4 text-small">
                    <dt className="text-ink-500 shrink-0">{r.l}</dt>
                    <dd className="font-display font-semibold text-ink-900 text-right">{r.v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row gap-2.5 justify-center">
              {/* Both halves ticked on the door: the master form is the next
                  step, so it takes the primary slot and home steps aside. */}
              {onContinueMaster ? (
                <Btn onClick={onContinueMaster}>გააგრძელე ხელოსნის ნაწილით</Btn>
              ) : (
                <Link href="/" className="h-11 px-6 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center justify-center transition-colors duration-fast">მთავარზე დაბრუნება</Link>
              )}
              <Link href="/experts" className="h-11 px-5 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-small tracking-wide inline-flex items-center justify-center transition-colors duration-fast">ექსპერტების ნახვა</Link>
            </div>
          </div>
        </Container>
        <Footer />
      </div>
    )
  }

  // Returning applicant who ALREADY submitted and is awaiting review → show the
  // status, not a blank form. (A just-submitted user hits the `submitted` screen
  // above.) They can still choose "edit + re-submit" to reopen the wizard.
  if (appLoaded && appStatus === 'SUBMITTED' && !forceEdit) {
    return (
      <div className="font-sans bg-ink-50/30 text-ink-900 antialiased min-h-screen flex flex-col">
        <PublicTopBar activeHref="/join" initialUser={initialUser} />
        <Container as="main" size="content" className="flex-1 py-16 lg:py-24">
          <div className="max-w-[560px] mx-auto text-center">
            <div className="w-16 h-16 rounded-full bg-brand-50 text-brand-700 inline-flex items-center justify-center mb-6 motion-safe:animate-scale-in">
              <Icon.clock className="w-8 h-8" />
            </div>
            <h1 className="font-display text-h1 font-bold tracking-tight">განაცხადი განიხილება</h1>
            <p className="mt-3 text-body text-ink-600 leading-[1.6]">
              განაცხადი მიღებულია და განხილვის რიგშია — თავიდან შევსება არ სჭირდება. პასუხს ჩვეულებრივ 24–48 საათში მიიღებ.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-2.5 justify-center">
              <Link href="/" className="h-11 px-6 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center justify-center transition-colors duration-fast">მთავარზე დაბრუნება</Link>
              <button type="button" onClick={() => setForceEdit(true)} className="h-11 px-5 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-small tracking-wide inline-flex items-center justify-center transition-colors duration-fast">რედაქტირება და თავიდან გაგზავნა</button>
            </div>
          </div>
        </Container>
        <Footer />
      </div>
    )
  }

  // Sent back for correction → NEEDS_REVISION. Softer than a reject: the applicant
  // keeps their draft and just fixes what the moderator flagged (e.g. „სახელი
  // ქართულად ჩაწერე"), then re-submits (the /apply POST resets them to SUBMITTED).
  // Mirrors the SUBMITTED/APPROVED short-circuit; „შეასწორე…" reveals the wizard.
  if (appLoaded && appStatus === 'NEEDS_REVISION' && !forceEdit) {
    return (
      <div className="font-sans bg-ink-50/30 text-ink-900 antialiased min-h-screen flex flex-col">
        <PublicTopBar activeHref="/join" initialUser={initialUser} />
        <Container as="main" size="content" className="flex-1 py-16 lg:py-24">
          <div className="max-w-[560px] mx-auto text-center">
            <div className="w-16 h-16 rounded-full bg-warning-50 text-warning-700 inline-flex items-center justify-center mb-6 motion-safe:animate-scale-in">
              <Icon.edit className="w-8 h-8" />
            </div>
            <h1 className="font-display text-h1 font-bold tracking-tight">საჭიროა შესწორება</h1>
            <p className="mt-3 text-body text-ink-600 leading-[1.6]">
              განაცხადი უარყოფილი არ არის — შეასწორე მითითებული და თავიდან გამოგზავნე.
            </p>
            {appNote?.trim() && (
              <div className="mt-6 text-left rounded-card border border-warning-200 bg-warning-50 px-4 py-3">
                <div className="font-display text-micro font-bold uppercase text-warning-700">რა უნდა შესწორდეს</div>
                <p className="mt-1.5 text-body text-ink-800 whitespace-pre-wrap">{appNote}</p>
              </div>
            )}
            <div className="mt-8 flex flex-col sm:flex-row gap-2.5 justify-center">
              <button type="button" onClick={() => setForceEdit(true)} className="h-11 px-6 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center justify-center transition-colors duration-fast">შეასწორე და თავიდან გააგზავნე</button>
              <Link href="/" className="h-11 px-5 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-small tracking-wide inline-flex items-center justify-center transition-colors duration-fast">მთავარზე დაბრუნება</Link>
            </div>
          </div>
        </Container>
        <Footer />
      </div>
    )
  }

  // Already an approved expert (or promoted to TUTOR) → the wizard is a dead end
  // for them (the API rejects non-students with ONLY_STUDENTS_CAN_APPLY). Show a
  // friendly "you're already an expert" screen instead of a blank form + generic
  // submit error.
  if (appLoaded && appStatus === 'APPROVED') {
    return (
      <div className="font-sans bg-ink-50/30 text-ink-900 antialiased min-h-screen flex flex-col">
        <PublicTopBar activeHref="/join" initialUser={initialUser} />
        <Container as="main" size="content" className="flex-1 py-16 lg:py-24">
          <div className="max-w-[560px] mx-auto text-center">
            <div className="w-16 h-16 rounded-full bg-success-100 text-success-700 inline-flex items-center justify-center mb-6 motion-safe:animate-scale-in">
              <Icon.check className="w-8 h-8" />
            </div>
            <h1 className="font-display text-h1 font-bold tracking-tight">შენ უკვე ექსპერტი ხარ</h1>
            <p className="mt-3 text-body text-ink-600 leading-[1.6]">
              განაცხადი დამტკიცებულია. გამოაქვეყნე თავისუფალი დრო, რომ დაჯავშნა შესაძლებელი გახდეს.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-2.5 justify-center">
              <Link href="/work/profile" className="h-11 px-6 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center justify-center transition-colors duration-fast">გახსენი პროფილი</Link>
              <Link href="/work" className="h-11 px-5 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-small tracking-wide inline-flex items-center justify-center transition-colors duration-fast">ჩემი სივრცე</Link>
            </div>
          </div>
        </Container>
        <Footer />
      </div>
    )
  }

  return (
    <div className="font-sans bg-ink-50/50 text-ink-900 antialiased min-h-[1000px] flex flex-col">
      <PublicTopBar activeHref="/join" initialUser={initialUser} />

      {/* Top horizontal progress (mobile + desktop) */}
      <div className="border-b border-ink-200 bg-white">
        <Container className="py-4">
          <div className="lg:hidden mb-3">
            <span className="text-meta text-ink-500 tabular-nums">ნაბიჯი {step} / 2</span>
          </div>
          <StepIndicator steps={STEP_STRIP} current={step} completed={completed} onSelect={jumpToStep} />
        </Container>
      </div>

      {/* NOT a <Container>, deliberately: this is the layout FRAME, and its
          gutter belongs to its children. <ProgressNav> is a bordered white rail
          that must sit flush against the column edge — Container always pads,
          which would inset the rail and leave its `border-r` floating. The
          gutter is applied by <main> below instead. Width matched to the canon
          column (1280) so the rail stays aligned with the step circles above,
          which DO go through Container. */}
      <div className="flex-1 max-w-[1280px] mx-auto w-full flex">
        <ProgressNav step={step} setStep={jumpToStep} completed={completed} />

        <main className="flex-1 min-w-0 px-6 lg:px-8 py-8 lg:py-10">
          <div className="max-w-[720px]">
            {draftRestored && (
              <div
                role="status"
                aria-live="polite"
                /* `flex-wrap`, not one rigid row. At 360px the three children
                   need ~320px inside a ~280px box, so flex fell back to
                   SHRINKING them — and the only child that can shrink is the
                   label, which broke „დაიწყე თავიდან" across two lines inside a
                   32px-tall button. Wrapping drops the controls to their own
                   line instead, which is the correct answer at that width.
                   Reported 2026-08-08 (owner) from a phone. */
                className="mb-4 rounded-card border border-brand-200 bg-brand-50 text-brand-900 px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 motion-safe:transition-opacity motion-safe:duration-fast"
              >
                <span className="font-display text-small font-semibold tracking-tight min-w-0">
                  შენახული მონახაზი აღდგა
                </span>
                {/* The two controls travel together — wrapped separately, the
                    „×" would strand itself on a third line. */}
                <div className="ml-auto flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={clearDraftAndReset}
                    /* `whitespace-nowrap` is the actual guard: it makes an
                       over-tight row impossible to "solve" by breaking the
                       label, so the wrap above has to happen instead.
                       `tap-area` gives the 32px control a ≥40px finger target
                       without moving anything (canon: tappable ≥40px). */
                    className="tap-area shrink-0 whitespace-nowrap h-8 px-3 rounded-btn bg-white border border-brand-200 hover:border-brand-300 text-brand-700 hover:text-brand-800 font-display font-semibold text-meta tracking-wide inline-flex items-center motion-safe:transition-colors motion-safe:duration-fast"
                  >
                    დაიწყე თავიდან
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftRestored(false)}
                    aria-label="დახურვა"
                    className="tap-area shrink-0 w-7 h-7 rounded-full text-brand-700 hover:bg-brand-100 inline-flex items-center justify-center motion-safe:transition-colors motion-safe:duration-fast"
                  >
                    <Icon.x className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
            {/* Email-verification banner removed: signup no longer sends an OTP and
                the applications API does NOT require a verified email, so this was
                a false blocker that navigated users out of the wizard (losing
                their uploads). Verification is not part of the apply flow. */}
            {appStatus === 'REJECTED' && (
              <div role="alert" className="mb-4 rounded-card border border-danger-200 bg-danger-50 px-4 py-3">
                <div className="font-display text-small font-bold text-danger-900">წინა განაცხადი უარყოფილია</div>
                <p className="text-meta text-danger-800 mt-1 leading-[1.5]">
                  {appNote?.trim()
                    ? <>მიზეზი: <span className="font-semibold">{appNote}</span>. გაითვალისწინე და თავიდან გამოგზავნე.</>
                    : <>შეასწორე და თავიდან გააგზავნე.</>}
                </p>
              </div>
            )}
            {appStatus === 'NEEDS_REVISION' && (
              <div role="alert" className="mb-4 rounded-card border border-warning-200 bg-warning-50 px-4 py-3">
                <div className="font-display text-small font-bold text-warning-800">საჭიროა შესწორება</div>
                <p className="text-meta text-ink-800 mt-1 leading-[1.5]">
                  {appNote?.trim()
                    ? <>შესასწორებელია: <span className="font-semibold">{appNote}</span>. შემდეგ თავიდან გააგზავნე.</>
                    : <>შეასწორე და თავიდან გააგზავნე.</>}
                </p>
              </div>
            )}
            <ApplyErrCtx.Provider value={fieldErr}>
              {step === 1 && <Step1 form={form} set={set} media={media} setMedia={setMediaPatch} />}
              {step === 2 && <Step2 form={form} set={set} />}
            </ApplyErrCtx.Provider>

            {submitError && (
              <div role="alert" className="mt-3 rounded-btn border border-danger-200 bg-danger-50 text-danger-800 px-3 py-2 text-small font-medium leading-[1.45] break-words">
                {submitError}
              </div>
            )}

            <FormFooter step={step} setStep={setStep} part={part} setPart={setPart} completed={completed} setCompleted={setCompleted} onSubmit={submitApplication} submitting={submitting} validateStep={validateStep} onError={onStepError} onStepDone={onStepDone} onBlocked={onStepBlocked} />
          </div>
        </main>

        <LivePreview step={step} form={form} media={media} />
      </div>

      {/* The wizard's own next/back bar is `max-lg:sticky bottom-0` INSIDE the
          form column, so it unpins the moment the form ends — it never covers
          the site footer, and the footer never hides the last field. */}
      <Footer />
    </div>
  )
}

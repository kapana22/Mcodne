'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { topicsForRoute, HELP_VISIBLE, HELP_EVENTS, trackHelp, type HelpTopic } from '@/lib/helpTopics'
import { useSiteTextMap } from '@/components/SiteTextProvider'
import { searchAnswer, scoreTopics, smallTalk, redactQuery, MAX_QUERY_CHARS } from '@/lib/helpSearch'
import type { HelpProfession } from '@/lib/helpProfessions'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'
import { emailFormatError } from '@/lib/emailRule'
import { useMe } from '@/lib/me'
import { showJoinInvite } from '@/lib/capabilities'
import { SEND_FAILED } from '@/lib/actionErrors'

/* THE HELP WIDGET — a shortcut to answers, not a chatbot.
 *
 * IT LOOKS LIKE A CHAT AND IS NOT ONE, and the distinction is the whole design.
 * Every question here has ONE fixed correct answer that is already written
 * (lib/helpTopics, shared with /help). A model would add nothing except the
 * ability to invent one — and the places people ask, pricing and cancellation,
 * are exactly where an invented answer costs money and trust. What the chat
 * SKIN buys is real and worth having: the transcript keeps history, so a person
 * can compare two answers instead of losing the first one to an accordion; and
 * a conversation is the form Georgian users already know how to use.
 *
 * THERE IS A FREE-TEXT INPUT (owner's call, 2026-08-04), and what keeps it
 * honest is not its absence but the absence of GENERATION. Every reply is one
 * of the paragraphs in lib/helpTopics, chosen by lib/helpSearch IN THIS TAB —
 * no API, no model. Three outcomes, and the third is the point: answer /
 * „which of these did you mean" / „I have no answer for this". The last one
 * opens a message form to a human right there in the thread, because the
 * moment somebody is stuck is the wrong moment to send them to another page.
 *
 * What makes it worth more than a link to /help:
 *  · the questions are ORDERED BY ROUTE, so the doubt someone has while
 *    standing on this page is answered before they have phrased it;
 *  · every answer that HAS a next step ends in it (FaqAction), role-gated;
 *  · it is instrumented, so the admin learns WHICH question gets asked WHERE —
 *    and that answer can then move onto the page itself. The widget's job is
 *    to make itself unnecessary, one question at a time.
 *
 * PLACEMENT. Bottom-right is crowded: BackToTop sits at z-to-top right-4/6
 * bottom-4/6, the cookie banner at 60, and mobile booking bars own the bottom
 * edge. This sits ABOVE BackToTop in the stack but OFFSET so they never
 * overlap. Its own lift against the bottom chrome lives in globals.css on the
 * `--help-bottom` variable, reading the SAME `data-bottom-nav` /
 * `data-mobile-cta` body attributes the cookie banner, the toast host and
 * BackToTop already read — one mechanism for „something occupies the bottom
 * edge", never a private offset (a private one is how this button ended up
 * sitting on top of BackToTop whenever the mobile tab bar lifted it).
 *
 * VISIBILITY. Two rules, both deliberate:
 *  · a mobile CTA bar (`data-mobile-cta`) wins the bottom edge — but ONLY on
 *    the viewports where those bars actually render (`lg:hidden`). The first
 *    version was viewport-blind and so removed the widget on DESKTOP too, on
 *    the expert profile, the booking detail, /ask and every chat thread —
 *    which is to say on the exact routes the context map was written for.
 *  · HIDDEN_ON routes below get no widget at all.
 */

const PANEL_W = 'w-[min(22rem,calc(100vw-2rem))]'

/* Where a floating help circle is wrong, not merely unnecessary:
 *   /session   — a live video consultation; nothing floats over a call.
 *   /admin     — the operator's own tool; client FAQ is noise there.
 *   /help      — the panel's „ყველა კითხვა“ points at the page you are on.
 *   /contact   — you are already writing to a human, which is the escape hatch.
 */
const HIDDEN_ON = ['/session', '/admin', '/help', '/contact']

const GREETING = 'გამარჯობა 👋 დაწერე კითხვა ან აირჩიე ქვემოთ.'

/**
 * The „წერს…“ beat before an answer bubble.
 *
 * It exists so an answer does not teleport in the same frame the question is
 * tapped — that reads as a page glitch rather than a reply. It is capped hard
 * at 240ms and skipped entirely under prefers-reduced-motion: the answer is
 * already written, so every millisecond spent pretending to compose it is time
 * taken from someone who came here stuck. Never raise this to look „more real“.
 */
const TYPING_MS = 240

type Bubble =
  | { kind: 'bot-text'; text: string }
  | { kind: 'user'; text: string }
  | { kind: 'bot-answer'; topic: HelpTopic }
  /** The matcher could not choose between these — ask rather than guess. */
  | { kind: 'bot-choice'; topics: HelpTopic[] }
  /** Nothing we have written answers this. Carries the question so it can be
   *  sent to a human together with the message, without retyping — and the
   *  answers that ALMOST matched, because throwing away a ranked list to show
   *  an empty form is the one thing worse than not knowing. */
  | { kind: 'bot-none'; query: string; near: HelpTopic[] }
  /** They named a profession. The generic „how to find an expert" answer plus
   *  the page for THAT profession — at that point a link beats a paragraph. */
  | { kind: 'bot-profession'; prof: HelpProfession; topic: HelpTopic }

export function HelpWidget() {
  const pathname = usePathname()
  const { me } = useMe()
  const [open, setOpen] = useState(false)
  const [hasCta, setHasCta] = useState(false)
  const [isNarrow, setIsNarrow] = useState(false)
  const [thread, setThread] = useState<Bubble[]>([{ kind: 'bot-text', text: GREETING }])
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  // The „write to us" form inside the last unanswered bubble. One at a time, so
  // one set of state rather than per-bubble state.
  const [msg, setMsg] = useState('')
  const [msgEmail, setMsgEmail] = useState('')
  const [msgState, setMsgState] = useState<'idle' | 'short' | 'sending' | 'sent' | 'error'>('idle')
  /* ⚠️ THE OPTIONAL ADDRESS WAS ONLY EVER JUDGED BY THE SERVER (fixed
   * 2026-08-31). /api/help/message parses it with `.email()`, so a typo in a
   * field labelled „სურვილისამებრ" refused the WHOLE report — and the only
   * thing the widget could say was „ვერ გაიგზავნა — სცადე თავიდან.", which
   * points at the message, not the address. Somebody who is already stuck and
   * has typed out their problem loses it to a missing dot in their own email.
   *
   * `required: false` is the point: empty stays legal here, exactly as the
   * schema has it — the label promises that and must keep it. */
  const [msgEmailErr, setMsgEmailErr] = useState<string | null>(null)
  // Which questions were asked on this page — drives both the suggestion list
  // (asked ones drop off) and the context that travels with „ვერ ვიპოვე
  // პასუხი". „Someone wrote in“ and „this person read the price answer and the
  // cancellation answer and still wrote in" are different tickets, and only the
  // second one tells you what to fix.
  const [asked, setAsked] = useState<string[]>([])
  const panelRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mobile booking bars set `data-mobile-cta` on <body>. Watched rather than
  // read once: the flag flips on client-side navigation, and a stale read
  // would leave the circle sitting on top of a booking CTA.
  useEffect(() => {
    const read = () => setHasCta(document.body.hasAttribute('data-mobile-cta'))
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.body, { attributes: true, attributeFilter: ['data-mobile-cta'] })
    return () => mo.disconnect()
  }, [pathname])

  // Those bars are `lg:hidden`, so the bottom edge is only contested below
  // 1024px. Matching the SAME breakpoint here is what keeps the widget on the
  // expert profile, the booking detail and the chat threads at desktop width.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const read = () => setIsNarrow(mq.matches)
    read()
    mq.addEventListener('change', read)
    return () => mq.removeEventListener('change', read)
  }, [])

  // Route change resets the conversation: the questions are about to be
  // reordered for a page the visitor is no longer looking at, and the „what did
  // they read here" trail belongs to the page it was collected on.
  useEffect(() => {
    setOpen(false)
    setThread([{ kind: 'bot-text', text: GREETING }])
    setAsked([])
    setTyping(false)
    setDraft('')
    setMsg('')
    setMsgState('idle')
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [pathname])

  // A pending „წერს…“ must not fire into an unmounted tree.
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  // Escape closes and returns focus to the trigger, like every other overlay
  // in the app (UserMenu, NotifBell).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus() }
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!panelRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [open])

  // Keep the newest bubble in view. `behavior: 'auto'` on purpose — a smooth
  // scroll here would still be running when the next tap lands.
  useEffect(() => {
    if (!open) return
    const el = logRef.current
    if (!el) return
    // Scroll to the newest bubble's TOP when it is tall enough to fill the log,
    // and to the bottom otherwise.
    //
    // WHY: the unanswered bubble carries a message form and is taller than the
    // 390px panel. Pinning the bottom scrolled its own first line — „ამაზე მზა
    // პასუხი არ მაქვს" — off the top, so the reply opened on a form with no
    // visible explanation of why it was there. A reply has to start where the
    // reader's eye is.
    const last = el.lastElementChild as HTMLElement | null
    if (last && last.offsetHeight > el.clientHeight * 0.66) {
      el.scrollTop += last.getBoundingClientRect().top - el.getBoundingClientRect().top - 8
    } else {
      el.scrollTop = el.scrollHeight
    }
  }, [thread, typing, open])

  /** Append a bot bubble after the „წერს…“ beat (or immediately, if motion is off). */
  const reply = (bubble: Bubble) => {
    const reduced = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) { setThread(prev => [...prev, bubble]); return }
    setTyping(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setTyping(false)
      setThread(prev => [...prev, bubble])
    }, TYPING_MS)
  }

  /**
   * Answer a known topic. `userText` is what the person actually typed when they
   * reached this topic through the input rather than by tapping — the transcript
   * should show THEIR words, not our phrasing of them.
   */
  const ask = (t: HelpTopic, userText?: string) => {
    if (!asked.includes(t.id)) setAsked(prev => [...prev, t.id])
    setThread(prev => [...prev, { kind: 'user', text: userText ?? t.q }])
    // The ID, never the question text: a copy edit must not reset the history,
    // and the text would sit under a 64-char prop cap it can outgrow without
    // warning.
    trackHelp(HELP_EVENTS.question, { route: pathname, q: t.id })
    reply({ kind: 'bot-answer', topic: t })
  }

  /**
   * THE TYPED QUESTION — the whole „chat bot“, and it runs in this tab.
   *
   * lib/helpSearch matches against the 16 answers we already wrote and returns
   * one of three outcomes. Nothing is generated: the worst case is that it
   * offers the wrong existing paragraph, which the person can see and reject —
   * never a confident invention about a refund that does not exist.
   */
  const submitQuery = (e: React.FormEvent) => {
    e.preventDefault()
    const raw = draft.trim()
    if (!raw) return
    setDraft('')

    // Not everything typed into a chat is a question. Answering „გამარჯობა“
    // with „ამაზე პასუხი ჯერ არ მაქვს“ is cold, and it would also fill the
    // unanswered backlog with greetings — so small talk is handled first and
    // is deliberately NOT recorded as a failure.
    const chat = smallTalk(raw)
    if (chat) {
      setThread(prev => [...prev, { kind: 'user', text: raw }])
      reply({ kind: 'bot-text', text: chat })
      return
    }

    const result = searchAnswer(raw, all)

    if (result.kind === 'answer') { ask(result.topic, raw); return }

    setThread(prev => [...prev, { kind: 'user', text: raw }])

    if (result.kind === 'profession') {
      // Naming a specialist is a destination, not a search. Still counted as
      // the find-expert question so the admin sees WHAT was asked.
      trackHelp(HELP_EVENTS.question, { route: pathname, q: result.topic.id })
      if (!asked.includes(result.topic.id)) setAsked(prev => [...prev, result.topic.id])
      reply({ kind: 'bot-profession', prof: result.prof, topic: result.topic })
      return
    }

    if (result.kind === 'choice') {
      // Genuinely ambiguous — „გაუქმება“ is both a booking and an account.
      // Asking costs one tap; guessing wrong misinforms half the askers.
      reply({ kind: 'bot-choice', topics: result.topics })
      return
    }

    // We have nothing written for this. Say so, hand them to a human, and keep
    // the question so the answer can be WRITTEN — the one place words a user
    // typed are stored, redacted first and disclosed under the input.
    trackHelp(HELP_EVENTS.unanswered, { route: pathname, text: redactQuery(raw) })
    // The ranked list is not empty just because nothing cleared the bar — the
    // top entries are what the matcher ALMOST chose. Offering the best two as a
    // question („იქნებ ეს გაინტერესებს") costs one tap to dismiss and is the
    // difference between a dead end and a near miss. They are deliberately not
    // presented as the answer: the bubble still says we do not have one.
    reply({ kind: 'bot-none', query: raw, near: scoreTopics(raw, all).slice(0, 2).map(s => s.topic) })
  }

  /**
   * Send the problem to a human — stored first, emailed second.
   *
   * The state machine is deliberately not optimistic. „გაიგზავნა" is only said
   * after the server confirms the row exists: telling somebody their problem
   * was received when it was not is the one failure this whole path exists to
   * prevent, and it is invisible to them until nobody ever replies.
   */
  const sendProblem = async (question: string) => {
    const body = msg.trim()
    if (msgState === 'sending') return
    // The button is NOT disabled while this is unmet (canon: never a disabled
    // primary CTA) — so refusing has to SAY something. A grey button that does
    // nothing when tapped is the same dead end wearing a different colour.
    if (body.length < 10) { setMsgState('short'); return }
    // The route's own rule on the optional address — see the note by the state.
    const emailMsg = emailFormatError(msgEmail, { required: false })
    if (emailMsg) {
      setMsgEmailErr(emailMsg)
      requestAnimationFrame(() => document.getElementById('help-report-email')?.focus())
      return
    }
    setMsgEmailErr(null)
    setMsgState('sending')
    try {
      const res = await fetch('/api/help/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: body,
          email: msgEmail.trim() || undefined,
          question: question.slice(0, MAX_QUERY_CHARS),
          route: pathname || '/',
        }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok || !j?.ok) { setMsgState('error'); return }
      setMsgState('sent')
      setMsg('')
      setThread(prev => [...prev, {
        kind: 'bot-text',
        // An honest promise: 24h is what /help already advertises, and nobody
        // is watching this live.
        text: me || msgEmail.trim()
          ? 'მადლობა — მივიღეთ. ადმინისტრაცია 24 საათში გიპასუხებს ელფოსტაზე.'
          : 'მადლობა — მივიღეთ. პასუხისთვის ელფოსტა დაგვიტოვე.',
      }])
    } catch {
      setMsgState('error')
    }
  }

  /** An action is shown only where it leads somewhere this person can go. */
  const actionOf = (t: HelpTopic) => {
    const a = t.action
    if (!a) return null
    if (a.gate === 'apply' && !showJoinInvite(me?.role, me?.provider)) return null
    if (a.gate === 'auth' && !me) return null
    return a
  }

  // The admin's wording, same as /help. Without the map the widget would keep
  // answering with the code defaults while the page showed the edited text —
  // the exact drift lib/helpTopics was extracted to prevent.
  const siteTexts = useSiteTextMap()
  const all = topicsForRoute(pathname, siteTexts)
  /**
   * Suggestions are ONBOARDING, not the interface — so they disappear after the
   * first message.
   *
   * Before the input existed they were the only way in and had to stay. Now
   * they answer one question („what can I ask?") and then compete with the
   * conversation for a 512px panel: measured, the pinned list plus the input
   * left the transcript 150px, i.e. one and a half bubbles. Once somebody has
   * asked anything they have learned the affordance and the input is right
   * there, so the space goes back to the answers.
   */
  const suggestions = thread.some(b => b.kind === 'user')
    ? []
    : all.filter(t => !asked.includes(t.id)).slice(0, HELP_VISIBLE)

  // A mobile CTA bar owns the bottom edge only where it renders; on the routes
  // below the widget has no business at all.
  if ((hasCta && isNarrow) || HIDDEN_ON.some(p => (pathname || '/').startsWith(p))) return null

  return (
    <>
      {/* The trigger is rendered BEFORE the panel so Tab flows from it INTO the
          panel. It also stays visible while open — an earlier version hid it
          with `data-[open=true]:hidden`, which removed the element that had
          focus the moment it was activated and dropped keyboard focus to
          <body>; Escape's focus-restore then ran against a hidden button and
          did nothing. A visible toggle is both the fix and the clearer
          affordance. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next) trackHelp(HELP_EVENTS.opened, { route: pathname })
        }}
        aria-expanded={open}
        aria-controls="help-panel"
        aria-label={open ? 'დახმარების დახურვა' : 'დახმარება'}
        className="help-anchor fixed right-4 sm:right-6 bottom-[var(--help-bottom)] z-help w-11 h-11 rounded-full bg-ink-900 text-white hover:bg-ink-800 inline-flex items-center justify-center shadow-card transition-colors duration-fast motion-safe:animate-fade-in-fast"
      >
        {open ? <Icon.close className="w-5 h-5" /> : <Icon.chat className="w-5 h-5" />}
      </button>

      {open && (
        <div
          ref={panelRef}
          id="help-panel"
          role="dialog"
          aria-labelledby="help-panel-title"
          /* Height is capped in BOTH units on purpose: 32rem keeps it from
             becoming a wall on a tall desktop, and 68vh keeps it inside a short
             phone — on a 667px screen the panel plus its 128px bottom offset
             still lands clear of the 64px sticky header, which a fixed rem
             height would not (measured: top 85px, not 59px). */
          className={`fixed right-4 sm:right-6 bottom-[calc(var(--help-bottom)+3.5rem)] z-help ${PANEL_W} h-[min(68vh,32rem)] rounded-card border border-ink-200 bg-white shadow-card overflow-hidden flex flex-col motion-safe:animate-scale-in`}
        >
          <div className="px-4 py-3 border-b border-ink-100 flex items-center justify-between gap-2 shrink-0">
            {/* The subtitle is the expectation-setter: „automatic answers" up
                front is what stops the first message being „ხარ ადამიანი?". */}
            <span className="min-w-0">
              <span id="help-panel-title" className="block font-display text-small font-bold text-ink-900 leading-tight">დახმარება</span>
              <span className="block text-meta text-ink-500 leading-tight">ავტომატური პასუხები · 24/7</span>
            </span>
            <button
              type="button"
              onClick={() => { setOpen(false); triggerRef.current?.focus() }}
              aria-label="დახურვა"
              className="w-9 h-9 -mr-2 rounded-btn text-ink-500 hover:text-ink-900 hover:bg-ink-50 inline-flex items-center justify-center transition-colors duration-fast"
            >
              <Icon.close className="w-4 h-4" />
            </button>
          </div>

          {/* THE TRANSCRIPT. `aria-live="polite"` because an answer arriving a
              beat after the tap is exactly the case a screen reader must be
              told about; `log` because the history is the point. */}
          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-label="საუბარი"
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
          >
            {thread.map((b, i) => {
              if (b.kind === 'user') {
                return (
                  <div key={i} className="flex justify-end motion-safe:animate-fade-in-fast">
                    {/* A FILLED brand surface is brand-600 — brand-500 under
                        white text measures 3.38 and fails AA. */}
                    <p className="max-w-[85%] rounded-card rounded-br-sm bg-brand-600 text-white px-3.5 py-2.5 text-small leading-[1.55]">
                      {b.text}
                    </p>
                  </div>
                )
              }
              if (b.kind === 'bot-text') {
                return (
                  <div key={i} className="flex justify-start">
                    <p className="max-w-[85%] rounded-card rounded-bl-sm bg-ink-75 border border-ink-200 text-ink-800 px-3.5 py-2.5 text-small leading-[1.55]">
                      {b.text}
                    </p>
                  </div>
                )
              }
              if (b.kind === 'bot-choice') {
                // The matcher declining to guess. Each option is a real
                // question, so one tap turns it into a normal answer.
                return (
                  <div key={i} className="flex justify-start motion-safe:animate-fade-in-fast">
                    <div className="max-w-[90%] rounded-card rounded-bl-sm bg-ink-75 border border-ink-200 px-3.5 py-2.5">
                      <p className="text-small text-ink-800 leading-[1.55]">
                        ზუსტად ვერ მივხვდი — რომელი გაინტერესებს?
                      </p>
                      <div className="mt-2 space-y-1.5">
                        {b.topics.map(t => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => ask(t)}
                            className="w-full min-h-11 text-left px-3 py-2 rounded-btn border border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50 text-small font-display font-semibold text-ink-800 transition-colors duration-fast"
                          >
                            {t.q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              }
              if (b.kind === 'bot-profession') {
                return (
                  <div key={i} className="flex justify-start motion-safe:animate-fade-in-fast">
                    <div className="max-w-[90%] rounded-card rounded-bl-sm bg-ink-75 border border-ink-200 px-3.5 py-2.5">
                      <p className="text-small text-ink-800 leading-[1.55]">
                        დიახ — {b.prof.label} გვყავს. აი, სად ნახავ:
                      </p>
                      <a
                        href={`/experts/${b.prof.slug}`}
                        className="mt-2.5 h-10 sm:h-9 px-3.5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-small inline-flex items-center justify-center transition-colors duration-fast"
                      >
                        {b.prof.label} →
                      </a>
                    </div>
                  </div>
                )
              }
              if (b.kind === 'bot-none') {
                /* THE HONEST OUTCOME, and now the useful one.
                 *
                 * It used to link to /contact. That is a page change at the
                 * exact moment somebody is already stuck, and the drop-off
                 * between „I have no answer" and a form on another route is
                 * where the report was being lost. The form is here instead:
                 * they are already typing, so they keep typing. Their question
                 * travels with it, so the admin sees the failure and the
                 * request as one thing.
                 *
                 * Only the LAST bubble carries the form. Older ones stay as
                 * transcript — three open forms in a scrollback is a puzzle,
                 * not an offer. */
                const isLast = i === thread.length - 1
                return (
                  <div key={i} className="flex justify-start motion-safe:animate-fade-in-fast">
                    <div className="w-full max-w-[92%] rounded-card rounded-bl-sm bg-ink-75 border border-ink-200 px-3.5 py-3">
                      <p className="text-small text-ink-800 leading-[1.55]">
                        ამაზე მზა პასუხი არ მაქვს — კითხვა ჩავიწერე. აღწერე პრობლემა და ადმინისტრაცია გიპასუხებს.
                      </p>

                      {/* The near misses. NOT presented as the answer — the line
                          above still says we do not have one — but the ranked
                          list is thrown away otherwise, and „almost" is worth a
                          tap. */}
                      {b.near.length > 0 && (
                        <div className="mt-2.5 space-y-1.5">
                          <p className="text-meta text-ink-500">იქნებ ეს გაინტერესებს:</p>
                          {b.near.map(t => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => ask(t)}
                              className="w-full min-h-11 text-left px-3 py-2 rounded-btn border border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50 text-small font-display font-semibold text-ink-800 transition-colors duration-fast"
                            >
                              {t.q}
                            </button>
                          ))}
                        </div>
                      )}

                      {isLast && msgState !== 'sent' && (
                        <form
                          onSubmit={e => { e.preventDefault(); void sendProblem(b.query) }}
                          className="mt-2.5 space-y-2"
                        >
                          <textarea
                            value={msg}
                            onChange={e => { setMsg(e.target.value); if (msgState === 'short') setMsgState('idle') }}
                            rows={2}
                            maxLength={2000}
                            aria-invalid={msgState === 'short' || undefined}
                            placeholder="მოგვწერე შენი პრობლემის შესახებ…"
                            className="w-full px-3 py-2 rounded-field border border-ink-200 bg-white text-body text-ink-900 placeholder-ink-400 outline-none resize-none leading-[1.5]"
                          />
                          {/* Only asked when we do not already know it. Demanding
                              an address from someone who is already stuck is how
                              the report gets abandoned — so it is optional, and
                              the label says what it costs to leave it empty. */}
                          {!me && (
                            <>
                              <input
                                id="help-report-email"
                                type="email" autoComplete="email"
                                value={msgEmail}
                                onChange={e => { setMsgEmail(e.target.value); setMsgEmailErr(null) }}
                                placeholder="ელფოსტა — რომ პასუხი მოგწეროთ (სურვილისამებრ)"
                                aria-invalid={!!msgEmailErr || undefined}
                                aria-describedby={msgEmailErr ? 'help-report-email-err' : undefined}
                                className={`w-full h-11 px-3 rounded-field border bg-white text-body text-ink-900 placeholder-ink-400 outline-none ${msgEmailErr ? 'border-danger-500' : 'border-ink-200'}`}
                              />
                              {msgEmailErr && (
                                <p id="help-report-email-err" role="alert" className="text-meta text-danger-700">{msgEmailErr}</p>
                              )}
                            </>
                          )}
                          {msgState === 'error' && (
                            <p role="alert" className="text-meta text-danger-700">{SEND_FAILED}</p>
                          )}
                          {msgState === 'short' && (
                            <p role="alert" className="text-meta text-ink-500">დაწერე ცოტა მეტი — მინიმუმ 10 სიმბოლო.</p>
                          )}
                          <button
                            type="submit"
                            disabled={msgState === 'sending'}
                            aria-busy={msgState === 'sending'}
                            className="w-full h-11 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-brand-600/70 text-white font-display font-semibold text-body inline-flex items-center justify-center transition-colors duration-fast"
                          >
                            {msgState === 'sending' ? 'იგზავნება…' : 'გაგზავნა'}
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                )
              }
              const action = actionOf(b.topic)
              return (
                <div key={i} className="flex justify-start motion-safe:animate-fade-in-fast">
                  <div className="max-w-[85%] rounded-card rounded-bl-sm bg-ink-75 border border-ink-200 px-3.5 py-2.5">
                    <p className="text-small text-ink-800 leading-[1.55]">{b.topic.a}</p>
                    {action && (
                      <a
                        href={action.href}
                        className="mt-2.5 h-10 sm:h-9 px-3.5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-small inline-flex items-center justify-center transition-colors duration-fast"
                      >
                        {action.label}
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
            {typing && (
              /* Carries the state in WORDS, not only in movement: with motion
                 removed an animated-only indicator is a frozen lie about
                 „working“ (the project's spinner rule). */
              <div className="flex justify-start">
                <p className="rounded-card rounded-bl-sm bg-ink-75 border border-ink-200 text-ink-500 px-3.5 py-2.5 text-meta motion-safe:animate-pulse-soft">
                  წერს…
                </p>
              </div>
            )}
          </div>

          {/* SUGGESTIONS, pinned. Deliberately buttons and not an input: see the
              header comment. Full-width rows rather than chips because a
              Georgian question does not fit a pill, and every one of them is
              ≥44px tall, which is the tappable floor. */}
          {suggestions.length > 0 && (
            /* No `overflow-y` here, deliberately: a pinned block that scrolls
               its own last row half out of view reads as a broken panel, which
               is exactly what 5 rows did. HELP_VISIBLE is what keeps this
               short enough to never need one. */
            <div className="shrink-0 border-t border-ink-100 px-3 py-3 space-y-1.5">
              {suggestions.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => ask(t)}
                  className="w-full min-h-11 text-left px-3 py-2 rounded-btn border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-small font-display font-semibold text-ink-800 transition-colors duration-fast"
                >
                  {t.q}
                </button>
              ))}
            </div>
          )}

          {/* THE INPUT. It answers from the 16 paragraphs we already wrote —
              lib/helpSearch matches locally, in this tab, with no API and no
              model. That ceiling is the feature: the worst thing it can do is
              offer the wrong existing answer, which a person can see and
              reject. It cannot invent a refund policy.

              The disclosure under it is not boilerplate. A question we fail to
              answer IS stored (redacted) so the answer can be written, and
              telling someone that before they type is the difference between
              collecting a backlog and collecting it quietly. */}
          <form onSubmit={submitQuery} className="shrink-0 border-t border-ink-100 px-3 pt-2.5 pb-2">
            <div className="flex items-center gap-2">
              <label htmlFor="help-ask" className="sr-only">დაწერე კითხვა</label>
              <input
                id="help-ask"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                maxLength={MAX_QUERY_CHARS}
                autoComplete="off"
                placeholder="დაწერე შენი კითხვა…"
                className="flex-1 min-w-0 h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 placeholder-ink-400 outline-none transition-colors duration-fast"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label="გაგზავნა"
                className="w-11 h-11 shrink-0 rounded-btn bg-ink-900 text-white hover:bg-ink-800 disabled:bg-ink-200 disabled:text-ink-400 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors duration-fast"
              >
                <Icon.send className="w-4 h-4" />
              </button>
            </div>
            {/* Shown BEFORE the first message and then retired.
                Measured at 360px it wrapped to three lines of grey text — as
                much vertical space as an answer — and it was doing that for the
                whole conversation. The disclosure has to be read before someone
                types, which is exactly when the thread is still empty; after
                that it is a permanent tax on the part of the panel people came
                for. Same rule as the suggestion list. */}
            {!thread.some(b => b.kind === 'user') && (
              <p className="mt-1.5 px-1 text-meta text-ink-400 leading-[1.4]">
                მზა პასუხებს გცემ. უპასუხო კითხვას ვინახავ.
              </p>
            )}
          </form>

          <div className="shrink-0 px-4 py-2 border-t border-ink-100 bg-ink-50/40 flex items-center justify-between gap-3">
            <Link href="/help" className="font-display text-meta font-semibold text-brand-700 hover:text-brand-800 transition-colors duration-fast">
              ყველა კითხვა
            </Link>
            {/* „Couldn't find it“ goes to a human, CARRYING what just failed:
                the page and the answers that were read and did not help. The
                contact form turns those into an editable first line, so the
                person can see and change everything that is sent — context, not
                a hidden payload. */}
            <a
              onClick={() => trackHelp(HELP_EVENTS.unresolved, { route: pathname, seen: asked.length })}
              href={`/contact?from=${encodeURIComponent(pathname || '/')}${asked.length ? `&asked=${encodeURIComponent(asked.join(','))}` : ''}`}
              title={`ან მოგვწერე: ${SUPPORT_EMAIL}`}
              className="font-display text-meta font-semibold text-ink-700 hover:text-ink-900 transition-colors duration-fast">
              ვერ ვიპოვე პასუხი →
            </a>
          </div>
        </div>
      )}
    </>
  )
}

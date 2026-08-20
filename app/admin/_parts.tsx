'use client'
// AdminConfirmDialog — shared admin confirmation dialog, modeled on
// components/ConfirmModal.tsx (a11y copied: role="alertdialog", focus trap,
// Escape, focus restore, ink-950/55 scrim, z-confirm, mobile bottom-sheet).
// Extends it with an OPTIONAL reason textarea:
//   reason="required" → confirm disabled until non-empty
//   reason="optional" → textarea shown, may be left empty
//   reason="none"     → plain confirm (default)
// onConfirm receives the trimmed reason text (empty string when none).

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Icon } from '@/components/Icon'
import { copyToClipboard } from '@/lib/clipboard'
import { KA_MONTHS_SHORT_DOT } from '@/lib/kaDate'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

// Shared modal chrome for the admin dialogs below: focus the first control on
// open, restore focus to the opener on close, Escape closes, Tab is trapped.
// Extracted so AdminMessageDialog inherits AdminConfirmDialog's a11y behaviour
// verbatim instead of re-implementing (and drifting from) it.
function useModalChrome(opts: {
  open: boolean
  onClose: () => void
  containerRef: RefObject<HTMLDivElement | null>
  initialFocusRef: RefObject<HTMLElement | null>
}) {
  const { open, onClose, containerRef, initialFocusRef } = opts
  const restoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreRef.current = (document.activeElement as HTMLElement | null) ?? null
    const t = window.setTimeout(() => initialFocusRef.current?.focus(), 20)
    return () => {
      window.clearTimeout(t)
      restoreRef.current?.focus?.()
    }
  }, [open, initialFocusRef])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab') return
      const root = containerRef.current
      if (!root) return
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(n => !n.hasAttribute('disabled') && n.tabIndex !== -1)
      if (!nodes.length) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault(); first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, containerRef])
}

/* adminOk — truthful success check for admin mutations. When the admin session
   expires mid-visit, the mutation endpoint answers with a redirect to sign-in;
   fetch follows it and hands back the sign-in page as an HTML 200, so a bare
   `res.ok` reports success for a write that never happened. A mutation counts
   as OK only when it wasn't redirected, came back as JSON, and that JSON says
   ok:true. Consumes the body — use it where the call site doesn't need the
   payload (toggles, renames, hide/show). */
export async function adminOk(res: Response): Promise<boolean> {
  return (await adminResult(res)).ok
}

/* Same check, but hands back the server's own sentence. A body can only be read
   once, so a call site that wants the reason cannot call `adminOk` first — and
   without this every refusal collapsed to „ოპერაცია ვერ შესრულდა.", which tells
   a moderator nothing about WHY a decision was refused (e.g. the application was
   already approved and the expert is live). */
export async function adminResult(res: Response): Promise<{ ok: boolean; message?: string }> {
  if (!res.ok || res.redirected) {
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return { ok: false }
    const j = (await res.json().catch(() => null)) as { message?: unknown } | null
    return { ok: false, message: typeof j?.message === 'string' ? j.message : undefined }
  }
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) return { ok: false }
  const j = (await res.json().catch(() => null)) as { ok?: unknown; message?: unknown } | null
  return { ok: j?.ok === true, message: typeof j?.message === 'string' ? j.message : undefined }
}

// Shared section header for every admin tab — consistent eyebrow + title + sub,
// with an optional right-aligned actions slot. Single source so all sections
// (including blog/texts) read identically.
export const TabHeader = ({ eyebrow, title, sub, actions }: { eyebrow: string; title: ReactNode; sub: string; actions?: ReactNode }) => (
  <section className="px-6 lg:px-8 pt-7 pb-5 border-b border-ink-100 bg-white">
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div className="min-w-0 max-w-[680px]">
        <div className="font-display text-micro font-semibold uppercase text-ink-900 mb-1.5">{eyebrow}</div>
        <h1 className="font-display text-h1 font-bold text-ink-900 tracking-tight leading-[1.1]">{title}</h1>
        <p className="mt-2 text-small text-ink-600 leading-[1.55]">{sub}</p>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  </section>
)

type Tone = 'danger' | 'brand' | 'warning'

const TONE_CLS: Record<Tone, string> = {
  danger:  'bg-danger-500 hover:bg-danger-600 active:bg-danger-700 text-white focus-visible:ring-danger-300',
  brand:   'bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white focus-visible:ring-brand-300',
  // 600, not 500 — white on warning-500 is 3.67:1 (fails AA); 600 is 5.51.
  warning: 'bg-warning-600 hover:bg-warning-700 active:bg-warning-800 text-white focus-visible:ring-warning-300',
}

type Props = {
  open: boolean
  title: string
  body?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: Tone
  reason?: 'required' | 'optional' | 'none'
  reasonLabel?: string
  reasonPlaceholder?: string
  onConfirm: (reason: string) => void | Promise<void>
  onCancel: () => void
  busy?: boolean
}

/* ═══════════ the three states every section has, written ONCE ════════════
 *
 * Counted before this existed: 93 hand-written `<button>` against 3 uses of the
 * shared `<Btn>`, „იტვირთება" spelled out 29 times in four different type
 * sizes, and 48 hand-rolled danger banners in three tiers of seriousness for
 * the same event. That is why the panel feels like eleven different products —
 * not because any one screen is wrong, but because the same idea is re-drawn
 * in every file.
 *
 * `AdminConfirmDialog` below already proves the pattern lands here: it is used
 * 13 times across 3 files and there is not one native `confirm()` left in the
 * admin. These three follow it.
 */

/**
 * „Loading" — and it says so in WORDS, not only in movement.
 *
 * A spinner frozen by `prefers-reduced-motion` is a lie about working (the
 * project's motion canon). There is no spinner here at all: a muted line is
 * honest at any motion setting, and `aria-busy` carries it to a screen reader.
 */
export function AdminLoading({ label = 'იტვირთება…', inset = false, className = '' }: {
  label?: string; inset?: boolean; className?: string
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={`${inset ? 'px-4 py-10 text-center' : 'py-6'} text-small text-ink-500 ${className}`}
    >
      {label}
    </div>
  )
}

/**
 * „It failed" — and it must never be mistaken for „there is nothing here".
 *
 * An empty list and a broken request look identical on screen, and only one of
 * them needs somebody to act. So this always says the request failed, and it
 * offers the retry when the caller can retry: a dead end with no way forward is
 * how an operator concludes the panel is broken and stops trusting the rest.
 */
export function AdminError({ message = 'ჩატვირთვა ვერ მოხერხდა.', hint, onRetry, className = '' }: {
  message?: string; hint?: string; onRetry?: () => void; className?: string
}) {
  return (
    <div role="alert" className={`rounded-card border border-danger-200 bg-danger-50/50 p-4 ${className}`}>
      <p className="text-small font-display font-semibold text-ink-900">{message}</p>
      {hint && <p className="mt-1 text-meta text-ink-700 leading-[1.5]">{hint}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2.5 h-9 px-3.5 rounded-btn bg-ink-900 hover:bg-ink-800 text-white font-display font-semibold text-small transition-colors duration-fast"
        >
          თავიდან ცდა
        </button>
      )}
    </div>
  )
}

/**
 * The 7/30/90-day segmented control, built twice before this with different
 * ranges and the same markup. `aria-pressed` rather than a radio group because
 * it is a filter on what is already shown, not a choice being submitted.
 */
export function PeriodSwitch({ value, onChange, options = [7, 30, 90] }: {
  value: number; onChange: (n: number) => void; options?: number[]
}) {
  return (
    <div role="group" aria-label="პერიოდი" className="inline-flex rounded-btn border border-ink-200 overflow-hidden">
      {options.map(n => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className={`h-11 px-4 font-display text-small font-semibold transition-colors duration-fast ${
            value === n ? 'bg-ink-900 text-white' : 'bg-white text-ink-700 hover:bg-ink-50'
          }`}
        >
          {n === 1 ? 'დღეს' : `${n} დღე`}
        </button>
      ))}
    </div>
  )
}

/**
 * ONE stat tile. It existed three times — byte-identical in `_insights` and
 * `_profileViews`, and a fourth shape in `_system` (`Count`). Same idea, same
 * markup, three files to keep in step.
 *
 * `bad` is the only tone: a number on this panel is either neutral or it is a
 * problem. A „good" green tier was deliberately not added — colouring healthy
 * numbers is what makes a dashboard read as decoration.
 */
export function Stat({ n, label, sub, bad }: {
  n: ReactNode; label: string; sub?: ReactNode; bad?: boolean
}) {
  return (
    <div className="rounded-card border border-ink-200 bg-white p-5">
      <div className={`font-display text-h2 font-bold tabular-nums leading-none ${bad ? 'text-danger-700' : 'text-ink-900'}`}>{n}</div>
      <div className="font-display text-small font-semibold text-ink-900 mt-1.5">{label}</div>
      {sub && <div className="text-meta text-ink-600 mt-0.5 leading-snug">{sub}</div>}
    </div>
  )
}

/**
 * „Nothing here, and that is a fact rather than a failure." Distinct from
 * <AdminError> on purpose — the two must never look alike (see AdminError).
 */
export function AdminEmpty({ text, ok = false }: { text: string; ok?: boolean }) {
  return (
    <div className={`rounded-card border bg-white px-5 py-6 flex items-center gap-3 ${ok ? 'border-brand-200' : 'border-ink-200'}`}>
      {ok
        ? <Icon.check className="w-4 h-4 text-brand-600 shrink-0" />
        : <Icon.search className="w-4 h-4 text-ink-400 shrink-0" />}
      <span className="text-small text-ink-600">{text}</span>
    </div>
  )
}

/**
 * Copy-to-clipboard with its own confirmation. Written four times across the
 * panel with three different labels for the same action; the confirmation
 * timeout had drifted too. Height and label size follow the canon pairing
 * (h-9 → text-small), which the hand-built copies did not.
 */
export function CopyBtn({ value, label = 'კოპირება', done = 'დაკოპირდა' }: {
  value: string; label?: string; done?: string
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(t)
  }, [copied])
  return (
    <button
      type="button"
      onClick={async () => { if (await copyToClipboard(value)) setCopied(true) }}
      className="h-9 px-3 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 hover:border-ink-300 text-ink-700 font-display text-small font-semibold inline-flex items-center transition-colors duration-fast"
    >
      {copied ? done : label}
    </button>
  )
}

/** „Open in a new tab" — same shape as <CopyBtn>, so a row's two actions match. */
export function OpenBtn({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="h-9 px-3 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 hover:border-ink-300 text-ink-700 font-display text-small font-semibold inline-flex items-center gap-1.5 transition-colors duration-fast"
    >
      <Icon.external className="w-3.5 h-3.5" /> {label}
    </a>
  )
}

/**
 * SECTIONS OF ONE TAB — not a second navigation.
 *
 * „ინსაითები" had grown to fifteen blocks and twenty-three numbers on a single
 * scroll, answering four unrelated questions at once. Splitting it into more
 * sidebar entries would have made the panel bigger; this splits the PAGE while
 * the tab stays one thing. Rendered as an underlined bar rather than filled
 * pills so it reads as „where am I in this page", not „which page am I on" —
 * the sidebar already owns that question.
 *
 * Sticky under the 64px TopBar, so switching section does not require scrolling
 * back up. The count is the whole point of putting a badge here: you can see
 * there are three people waiting without opening the section.
 */
export function SubTabs<T extends string>({ value, onChange, tabs }: {
  value: T
  onChange: (v: T) => void
  tabs: { id: T; label: string; count?: number }[]
}) {
  return (
    <div className="sticky top-16 z-20 bg-white border-b border-ink-100">
      <div
        role="tablist"
        aria-label="სექციები"
        className="px-6 lg:px-8 flex items-stretch gap-1 overflow-x-auto scrollbar-hide"
      >
        {tabs.map(t => {
          const on = value === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChange(t.id)}
              className={`relative h-12 px-3 shrink-0 inline-flex items-center gap-2 font-display text-small font-semibold transition-colors duration-fast ${
                on ? 'text-ink-900' : 'text-ink-500 hover:text-ink-800'
              }`}
            >
              {t.label}
              {typeof t.count === 'number' && t.count > 0 && (
                <span className={`min-w-[20px] h-5 px-1.5 rounded-pill inline-flex items-center justify-center text-meta font-bold tabular-nums ${
                  on ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600'
                }`}>
                  {t.count}
                </span>
              )}
              {on && <span aria-hidden className="absolute left-0 right-0 -bottom-px h-[2px] bg-ink-900 rounded-t-[2px]" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * The heading every section on a data tab shares: eyebrow, title, one muted
 * line. Written eleven times by hand across `_insights` alone, in two different
 * wrappers (`<Card as="section">` and a raw `<section className="rounded-card
 * …">`) that render the same box.
 */
export function SectionCard({ eyebrow, title, sub, children, className = '' }: {
  eyebrow: string; title: string; sub?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section className={`rounded-card border border-ink-200 bg-white p-5 sm:p-6 ${className}`}>
      <div className="font-display text-micro font-semibold uppercase text-brand-700">{eyebrow}</div>
      <h3 className="mt-1 font-display text-h3 font-bold text-ink-900 tracking-tight">{title}</h3>
      {sub && <p className="text-small text-ink-600 mt-1 leading-relaxed max-w-[680px]">{sub}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

/** A bordered, hairline-divided list — the row container every named list uses. */
export function RowList({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card border border-ink-200 divide-y divide-ink-100 overflow-hidden bg-white">
      {children}
    </div>
  )
}

export function AdminConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = 'brand',
  reason = 'none',
  reasonLabel,
  reasonPlaceholder,
  onConfirm,
  onCancel,
  busy,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null)
  const [text, setText] = useState('')

  const cancel = useCallback(() => {
    if (busy) return
    onCancel()
  }, [busy, onCancel])

  // Reset the reason text every time the dialog opens for a new action.
  useEffect(() => { if (open) setText('') }, [open])

  useModalChrome({ open, onClose: cancel, containerRef, initialFocusRef: cancelBtnRef })

  if (!open) return null

  const cLabel = confirmLabel ?? 'დადასტურე'
  const xLabel = cancelLabel ?? 'გაუქმება'
  const titleId = 'admin-confirm-title'
  const descId = body ? 'admin-confirm-desc' : undefined
  const needReason = reason === 'required'
  const showReason = reason !== 'none'
  const confirmDisabled = needReason && !text.trim()

  return (
    <div
      className="fixed inset-0 z-confirm flex items-end sm:items-center justify-center p-0 sm:p-4 motion-safe:animate-fade-in-fast"
      ref={containerRef}
    >
      <button
        type="button"
        aria-label={xLabel}
        onClick={cancel}
        tabIndex={-1}
        className="absolute inset-0 bg-ink-950/55 backdrop-blur-sm"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative w-full sm:max-w-[440px] bg-white sm:rounded-card rounded-t-card shadow-float overflow-hidden font-sans motion-safe:animate-scale-in"
      >
        <div className="px-6 pt-6 pb-4">
          <h2
            id={titleId}
            className="font-display text-h3 font-bold text-ink-900 tracking-tight leading-snug"
          >
            {title}
          </h2>
          {body && (
            <div
              id={descId}
              className="mt-2 text-body text-ink-600 leading-relaxed"
            >
              {body}
            </div>
          )}
          {showReason && (
            <div className="mt-4">
              <label
                htmlFor="admin-confirm-reason"
                className="block font-display text-micro font-semibold uppercase text-ink-500 mb-1.5"
              >
                {reasonLabel ?? (needReason ? 'მიზეზი (სავალდებულო)' : 'მიზეზი (სურვ.)')}
              </label>
              <textarea
                id="admin-confirm-reason"
                value={text}
                onChange={e => setText(e.target.value)}
                rows={3}
                maxLength={300}
                disabled={busy}
                placeholder={reasonPlaceholder ?? 'დაწერე მიზეზი…'}
                className="w-full px-3 py-3 rounded-field border border-ink-200 bg-white text-small focus:border-brand-400 focus:outline-none resize-none disabled:opacity-60"
              />
            </div>
          )}
        </div>
        <div className="px-6 pb-6 pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={cancel}
            disabled={busy}
            className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-ink-800 font-display font-semibold text-small transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ink-300 disabled:opacity-50 disabled:pointer-events-none"
          >
            {xLabel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(text.trim())}
            disabled={busy || confirmDisabled}
            className={`h-11 px-4 rounded-btn font-display font-semibold text-small transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 disabled:pointer-events-none inline-flex items-center justify-center gap-2 ${TONE_CLS[tone]}`}
          >
            {busy ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/70 border-t-transparent rounded-full motion-safe:animate-spin" />
                ინახება…
              </>
            ) : (
              cLabel
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   AdminMessageDialog — write to ONE person (in-app notification + email).

   The admin panel could suspend, impersonate or broadcast; it could not simply
   WRITE to someone. This is that composer. It deliberately does NOT open a chat
   thread: app/api/messages refuses any thread involving an ADMIN (client PII
   boundary), so the channel is a bell notification plus an email whose Reply-To
   is the support inbox.

   The prefilled starters exist because the motivating case is one specific
   sentence — „you registered as a student but seem to want to be an expert" —
   and it should be one click, not a blank page. Everything stays editable.
   ═══════════════════════════════════════════════════════════════════════════ */

export type AdminMessageStarterId = 'expert' | 'info' | 'blank'

export const ADMIN_MESSAGE_STARTERS: {
  id: AdminMessageStarterId
  label: string
  subject: string
  body: string
}[] = [
  {
    id: 'expert',
    label: 'ექსპერტის გზა',
    subject: 'გინდა ექსპერტად დარეგისტრირდე?',
    body:
      'გამარჯობა! ანგარიში კლიენტად შეიქმნა — თუ მცოდნეზე კონსულტაციების გაწევა გინდოდა, ეს ორ წუთში სწორდება.\n\n' +
      'დააჭირე ღილაკს „ექსპერტად რეგისტრაცია“ და შეავსე მოკლე განაცხადი — სახელი და ელფოსტა უკვე შევსებული დაგხვდება. განაცხადს 48 საათში გადავხედავთ.\n\n' +
      'თუ რამე გაუგებარია, უპასუხე ამ წერილს.',
  },
  {
    id: 'info',
    label: 'მეტი ინფორმაცია',
    subject: 'ერთი დაზუსტება გვჭირდება',
    body:
      'გამარჯობა! შენს ანგარიშთან დაკავშირებით ერთი დეტალის დაზუსტება გვინდა.\n\n' +
      '[დაწერე, ზუსტად რა გვჭირდება]\n\n' +
      'უპასუხე ამ წერილს — პირდაპირ ჩვენთან მოვა.',
  },
  { id: 'blank', label: 'ცარიელი', subject: '', body: '' },
]

const SUBJECT_MAX = 120
const BODY_MAX = 4000

type MessageTarget = { id: string; fullName: string; email: string }

export function AdminMessageDialog({
  open,
  user,
  onClose,
  onSent,
}: {
  open: boolean
  user: MessageTarget | null
  onClose: () => void
  /** Fired only on a fully-delivered send (notification + email). */
  onSent?: (msg: string) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const subjectRef = useRef<HTMLInputElement | null>(null)
  const [starter, setStarter] = useState<AdminMessageStarterId>('blank')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ kind: 'error' | 'warn'; msg: string } | null>(null)

  const close = useCallback(() => { if (!busy) onClose() }, [busy, onClose])

  // Every open is a fresh message — never inherit the previous recipient's text.
  useEffect(() => {
    if (!open) return
    setStarter('blank'); setSubject(''); setBody(''); setStatus(null); setBusy(false)
  }, [open, user?.id])

  useModalChrome({ open, onClose: close, containerRef, initialFocusRef: subjectRef })

  if (!open || !user) return null

  const applyStarter = (id: AdminMessageStarterId) => {
    const t = ADMIN_MESSAGE_STARTERS.find(s => s.id === id)
    if (!t) return
    setStarter(id); setSubject(t.subject); setBody(t.body); setStatus(null)
  }

  const valid = subject.trim().length > 0 && body.trim().length > 0

  const send = async () => {
    if (busy || !valid) return
    setBusy(true); setStatus(null)
    try {
      const res = await fetch(`/api/admin/users/${user.id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim(), template: starter }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j?.ok) {
        setStatus({ kind: 'error', msg: j?.message ?? 'გაგზავნა ვერ მოხერხდა' })
        return
      }
      // sendMail resolves { ok:false } on a provider failure — say so instead of
      // claiming a delivery that didn't happen. The text stays in the form.
      if (!j.emailOk) {
        setStatus({
          kind: 'warn',
          msg: j.emailTo
            ? 'შეტყობინება აპლიკაციაში მივიდა, ელფოსტა კი ვერ გაიგზავნა. ხელახლა გაგზავნა მეორე შეტყობინებას შექმნის.'
            : 'ამ ანგარიშს ელფოსტა არ აქვს — შეტყობინება მხოლოდ აპლიკაციაში მივიდა.',
        })
        return
      }
      onSent?.(`${user.fullName} — შეტყობინება და ელფოსტა გაიგზავნა.`)
      onClose()
    } catch {
      setStatus({ kind: 'error', msg: 'ქსელის შეცდომა' })
    } finally {
      setBusy(false)
    }
  }

  const titleId = 'admin-message-title'

  return (
    <div
      className="fixed inset-0 z-confirm flex items-end sm:items-center justify-center p-0 sm:p-4 motion-safe:animate-fade-in-fast"
      ref={containerRef}
    >
      <button
        type="button"
        aria-label="დახურვა"
        onClick={close}
        tabIndex={-1}
        className="absolute inset-0 bg-ink-950/55 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full sm:max-w-[560px] max-h-[92vh] bg-white sm:rounded-card rounded-t-card shadow-float overflow-hidden flex flex-col font-sans motion-safe:animate-scale-in"
      >
        <div className="px-6 pt-6 pb-4 border-b border-ink-100 shrink-0">
          <h2 id={titleId} className="font-display text-h3 font-bold text-ink-900 tracking-tight leading-snug">
            მიწერე — {user.fullName}
          </h2>
          <p className="mt-1 text-meta text-ink-500">
            <span className="font-mono">{user.email || '—'}</span> · მიუვა შეტყობინებაში და ელფოსტაზე. პასუხი ჩვენს ფოსტაზე მოვა.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <label className="block font-display text-micro font-semibold uppercase text-ink-500 mb-1.5">
              მზა ტექსტი
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {ADMIN_MESSAGE_STARTERS.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => applyStarter(s.id)}
                  disabled={busy}
                  aria-pressed={starter === s.id}
                  className={`h-11 px-3.5 rounded-pill border font-display text-small font-semibold transition-colors duration-fast disabled:opacity-50 ${
                    starter === s.id
                      ? 'bg-ink-900 border-ink-900 text-white'
                      : 'bg-white border-ink-200 text-ink-700 hover:border-ink-300 hover:bg-ink-50'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-meta text-ink-500">შაბლონი ჩაანაცვლებს ტექსტს — შემდეგ თავისუფლად დაარედაქტირე.</p>
          </div>

          <div>
            <label htmlFor="admin-message-subject" className="block font-display text-micro font-semibold uppercase text-ink-500 mb-1.5">
              სათაური
            </label>
            <input
              id="admin-message-subject"
              ref={subjectRef}
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              maxLength={SUBJECT_MAX}
              disabled={busy}
              placeholder="მაგ. გინდა ექსპერტად დარეგისტრირდე?"
              className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-small focus:border-brand-400 focus:outline-none disabled:opacity-60"
            />
            <div className="mt-1 font-mono text-meta tabular-nums text-ink-400">{subject.length}/{SUBJECT_MAX}</div>
          </div>

          <div>
            <label htmlFor="admin-message-body" className="block font-display text-micro font-semibold uppercase text-ink-500 mb-1.5">
              ტექსტი
            </label>
            <textarea
              id="admin-message-body"
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={8}
              maxLength={BODY_MAX}
              disabled={busy}
              placeholder="დაწერე შეტყობინება…"
              className="w-full px-3 py-3 rounded-field border border-ink-200 bg-white text-small focus:border-brand-400 focus:outline-none resize-y disabled:opacity-60"
            />
            <div className="mt-1 font-mono text-meta tabular-nums text-ink-400">{body.length}/{BODY_MAX}</div>
          </div>

          {status && (
            <div
              role="alert"
              className={`rounded-btn border px-3 py-2 text-small ${
                status.kind === 'error'
                  ? 'border-danger-200 bg-danger-50 text-danger-800'
                  : 'border-warning-200 bg-warning-50 text-warning-800'
              }`}
            >
              {status.msg}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 pt-3 border-t border-ink-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-ink-800 font-display font-semibold text-small transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ink-300 disabled:opacity-50 disabled:pointer-events-none"
          >
            გაუქმება
          </button>
          <button
            type="button"
            onClick={send}
            disabled={busy || !valid}
            className="h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-display font-semibold text-body transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-300 disabled:opacity-60 disabled:pointer-events-none inline-flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/70 border-t-transparent rounded-full motion-safe:animate-spin" />
                იგზავნება…
              </>
            ) : (
              <>
                <Icon.send className="w-3.5 h-3.5" /> გაგზავნა
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   AdminDeleteUserDialog — remove an account.

   Not an AdminConfirmDialog with a red button, for two reasons. First, the
   choice is not yes/no: an account with history has two defensible endings
   (erase it, or erase the person and keep the rows) and the admin has to pick
   one knowingly. Second, „წაშალო?" is not a question anyone can answer without
   knowing what hangs off the account — so the numbers are on screen before the
   button is, and they come from real counts, not from the capped arrays the
   modal already had.

   The reason field is mandatory. The account is about to stop existing, so the
   audit row is the only place the story survives.
   ═══════════════════════════════════════════════════════════════════════════ */

export type DeleteImpact = {
  bookings: number
  activeBookings: number
  messages: number
  reviews: number
  enrollments: number
}

export type DeleteMode = 'purge' | 'anonymize'

type DeleteTarget = { id: string; fullName: string; email: string; isExpert: boolean }

const IMPACT_ROWS: { key: keyof DeleteImpact; label: string }[] = [
  { key: 'bookings', label: 'ჯავშანი' },
  { key: 'messages', label: 'შეტყობინება' },
  { key: 'reviews', label: 'შეფასება' },
  { key: 'enrollments', label: 'პაკეტი' },
]

export function AdminDeleteUserDialog({
  open,
  user,
  impact,
  onClose,
  onDeleted,
}: {
  open: boolean
  user: DeleteTarget | null
  impact: DeleteImpact | null
  onClose: () => void
  /** Fired only after the server confirmed the deletion. */
  onDeleted: (mode: DeleteMode, name: string) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null)
  const [mode, setMode] = useState<DeleteMode>('anonymize')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = useCallback(() => { if (!busy) onClose() }, [busy, onClose])

  /* THREE states, not two. `impact === null` means the counts never arrived
     (an older cached response, a failed load) — and it must NOT collapse into
     „this account is empty". That is the same class as the 2026-08-01 rule that
     a failed fetch may never render as „no results", and here it would talk an
     admin into an irreversible purge of an account with two years of history.
     Unknown behaves like „has history": both modes offered, nothing claimed. */
  const known = !!impact
  const hasHistory = !known ||
    impact.bookings + impact.messages + impact.reviews + impact.enrollments > 0

  // A fresh decision every time. The default follows the account: whenever
  // anything might be lost the reversible option is preselected; only a
  // provably empty account preselects (and offers) the purge alone.
  useEffect(() => {
    if (!open) return
    setReason(''); setError(null); setBusy(false)
    setMode(hasHistory ? 'anonymize' : 'purge')
  }, [open, user?.id, hasHistory])

  useModalChrome({ open, onClose: close, containerRef, initialFocusRef: cancelBtnRef })

  if (!open || !user) return null

  const blocked = (impact?.activeBookings ?? 0) > 0
  const canSubmit = !busy && !blocked && reason.trim().length >= 3

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, reason: reason.trim() }),
      })
      // Same truthfulness check as `adminOk`: an expired admin session answers
      // with a redirect to sign-in, and fetch hands that page back as an HTML
      // 200 — a bare `res.ok` would report a deletion that never happened.
      if (res.redirected || !(res.headers.get('content-type') ?? '').includes('application/json')) {
        setError('სესია ამოიწურა — გადატვირთე გვერდი და თავიდან შედი')
        return
      }
      const j = await res.json().catch(() => null) as { ok?: boolean; message?: string } | null
      if (!res.ok || j?.ok !== true) {
        setError(j?.message ?? 'წაშლა ვერ მოხერხდა')
        return
      }
      onDeleted(mode, user.fullName)
    } catch {
      setError('ქსელის შეცდომა')
    } finally {
      setBusy(false)
    }
  }

  const titleId = 'admin-delete-title'
  const rows = impact ? IMPACT_ROWS.filter(r => impact[r.key] > 0) : []

  return (
    <div
      className="fixed inset-0 z-confirm flex items-end sm:items-center justify-center p-0 sm:p-4 motion-safe:animate-fade-in-fast"
      ref={containerRef}
    >
      <button
        type="button"
        aria-label="გაუქმება"
        onClick={close}
        tabIndex={-1}
        className="absolute inset-0 bg-ink-950/55 backdrop-blur-sm"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full sm:max-w-[540px] max-h-[92dvh] bg-white sm:rounded-card rounded-t-card shadow-float overflow-hidden flex flex-col font-sans motion-safe:animate-scale-in"
      >
        <div className="px-6 pt-6 pb-4 border-b border-ink-100 shrink-0">
          <h2 id={titleId} className="font-display text-h3 font-bold text-ink-900 tracking-tight leading-snug">
            ანგარიშის წაშლა — {user.fullName}
          </h2>
          <p className="mt-1 text-meta text-ink-500 font-mono truncate">{user.email}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* What is actually attached to this account. */}
          <div>
            <label className="block font-display text-micro font-semibold uppercase text-ink-500 mb-1.5">
              რა ჰკიდია ანგარიშზე
            </label>
            {!known ? (
              <p className="text-small text-warning-800">
                რიცხვები ვერ ჩაიტვირთა — ვერ გეტყვი, რა წაიშლება. დახურე, გადატვირთე გვერდი და თავიდან გახსენი.
              </p>
            ) : rows.length === 0 ? (
              <p className="text-small text-ink-600">
                ჯავშანი, მიმოწერა და შეფასება არ აქვს — ანგარიში ცარიელია.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {rows.map(r => (
                  <li
                    key={r.key}
                    className="inline-flex items-center h-7 px-2.5 rounded-pill border border-ink-200 bg-white text-meta text-ink-700"
                  >
                    <span className="font-mono font-semibold tabular-nums text-ink-900">{impact![r.key]}</span>
                    <span className="ml-1">{r.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* The one thing that stops both modes. Said before the choice, not
              after a failed submit. */}
          {blocked && (
            <div role="alert" className="rounded-btn border border-warning-200 bg-warning-50 px-3 py-2.5 text-small text-warning-800">
              <span className="font-display font-semibold">{impact!.activeBookings} აქტიური ჯავშანი აქვს.</span>{' '}
              წაშლამდე ეს სესიები უნდა გაუქმდეს — თორემ მეორე მხარეს დარჩება ჯავშანი, რომელზეც აღარავინ მოვა.
            </div>
          )}

          {hasHistory ? (
            <fieldset disabled={busy || blocked} className="disabled:opacity-60">
              <legend className="font-display text-micro font-semibold uppercase text-ink-500 mb-1.5">
                რეჟიმი
              </legend>
              <div className="space-y-2">
                {([
                  {
                    id: 'anonymize' as const,
                    title: 'ანონიმიზაცია',
                    desc: 'ჩანაწერები რჩება, ადამიანი ქრება: სახელი, ელფოსტა, ტელეფონი, ფოტო და ბიო იშლება, ანგარიში იბლოკება.'
                      + (user.isExpert
                        ? ' საჯარო პროფილი, სერტიფიკატები, განათლება და გამოცდილება იშლება — პროფილი საიტიდან ქრება.'
                        : '')
                      + ' მეორე მხარეს ისტორია რჩება. მიმოწერის ტექსტი რჩება.',
                  },
                  {
                    id: 'purge' as const,
                    title: 'სრული წაშლა',
                    desc: 'ანგარიშიც და ყველა ჩანაწერიც იშლება — მათ შორის მეორე მხარის ასლი იმ სესიისა, რომელიც მართლა შედგა. შეუქცევადია.',
                  },
                ]).map(o => (
                  <label
                    key={o.id}
                    className={`flex gap-3 p-3 rounded-card border cursor-pointer transition-colors duration-fast ${
                      mode === o.id
                        ? o.id === 'purge'
                          ? 'border-danger-300 bg-danger-50/60'
                          : 'border-ink-400 bg-ink-50'
                        : 'border-ink-200 bg-white hover:border-ink-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="admin-delete-mode"
                      value={o.id}
                      checked={mode === o.id}
                      onChange={() => setMode(o.id)}
                      className="mt-1 shrink-0 accent-ink-900"
                    />
                    <span className="min-w-0">
                      <span className="block font-display text-small font-bold text-ink-900">{o.title}</span>
                      <span className="block mt-0.5 text-meta text-ink-600 leading-[1.5]">{o.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="text-small text-ink-600">
              ანგარიში და მისი პროფილი სრულად წაიშლება. შეუქცევადია.
            </p>
          )}

          <div>
            <label htmlFor="admin-delete-reason" className="block font-display text-micro font-semibold uppercase text-ink-500 mb-1.5">
              მიზეზი (სავალდებულო · ინახება აუდიტში)
            </label>
            <textarea
              id="admin-delete-reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              maxLength={300}
              disabled={busy || blocked}
              placeholder="მაგ. სპამი · ტესტური ანგარიში · მომხმარებლის მოთხოვნა"
              className="w-full px-3 py-3 rounded-field border border-ink-200 bg-white text-small focus:border-brand-400 focus:outline-none resize-none disabled:opacity-60"
            />
            <p className="mt-1 text-meta text-ink-500">
              ანგარიში ქრება — ეს ჩანაწერი დარჩება ერთადერთი კვალი იმისა, რა და რატომ წაიშალა.
            </p>
          </div>

          {error && (
            <div role="alert" className="rounded-btn border border-danger-200 bg-danger-50 px-3 py-2 text-small text-danger-800">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 pt-3 border-t border-ink-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 shrink-0">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={close}
            disabled={busy}
            className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-ink-800 font-display font-semibold text-body transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ink-300 disabled:opacity-50 disabled:pointer-events-none"
          >
            გაუქმება
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className={`h-11 px-4 rounded-btn font-display font-semibold text-body transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 disabled:pointer-events-none inline-flex items-center justify-center gap-2 ${TONE_CLS.danger}`}
          >
            {busy ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/70 border-t-transparent rounded-full motion-safe:animate-spin" />
                იშლება…
              </>
            ) : (
              <>
                <Icon.warn className="w-3.5 h-3.5" />
                {mode === 'purge' ? 'სამუდამოდ წაშალე' : 'ანონიმიზაცია'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ───── Shared list/format helpers used by every admin tab ───── */
/* ───── CSV export helper — client-side Blob, no server round-trip ───── */
const escapeCsv = (v: unknown): string => {
  if (v == null) return ''
  const s = String(v)
  // Escape per RFC 4180: wrap in quotes when the field contains ", newline, or comma.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
export const downloadCsv = (filename: string, rows: (string | number | null | undefined)[][]) => {
  const csv = rows.map(r => r.map(escapeCsv).join(',')).join('\r\n')
  // BOM lets Excel open Georgian correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const KA_STATUS: Record<string, string> = {
  PREPARING: 'მოსამზადებელი', CONFIRMED: 'დადასტურდა', LIVE: 'ცოცხალი',
  COMPLETED: 'დასრულდა', CANCELED: 'გაუქმდა', NO_SHOW: 'გამოუცხადებლობა',
}
const KA_MO_SHORT = KA_MONTHS_SHORT_DOT
export const fmtShort = (iso: string) => {
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return `${d.getDate()} ${KA_MO_SHORT[d.getMonth()]} ${d.getFullYear()}`
}
export const fmtDT = (iso: string) => {
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getDate()} ${KA_MO_SHORT[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/* Shared "load more" footer for the paginated admin lists (users/bookings/
   reviews). Shows the button while a cursor remains, else a total-count line. */
export const LoadMoreBar = ({ hasMore, loading, onMore, count }: { hasMore: boolean; loading: boolean; onMore: () => void; count: number }) => {
  if (count === 0) return null
  return (
    <div className="px-6 lg:px-8 py-5 flex justify-center">
      {hasMore ? (
        <button type="button" onClick={onMore} disabled={loading} className="h-11 px-5 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 disabled:opacity-60 text-ink-700 font-display font-semibold text-small transition-colors duration-fast">
          {loading ? 'იტვირთება…' : 'მეტის ჩვენება'}
        </button>
      ) : (
        <span className="text-meta text-ink-400 tabular-nums">სულ {count} ჩანაწერი</span>
      )}
    </div>
  )
}

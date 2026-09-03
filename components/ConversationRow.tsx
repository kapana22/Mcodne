import Link from 'next/link'
import Image from 'next/image'
import { Icon } from './Icon'
import { fmtKaThreadTime } from '@/lib/kaDate'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { msgPreview } from '@/lib/msgText'

/* One conversation in the messages inbox — shared by the client's list and the
   provider's so the two surfaces can't drift apart again.

   ⚠️ REDRAWN FROM THE OWNER'S „Messages" ARTBOARD (2026-08-31). Four lines,
   in the order the artboard stacks them:

     name ······················ time
     the last message
     [ topic · price ]                  ●

   WHAT CHANGED, AND WHAT BEAT IT.
   · THE JOB CHIP IS NEW. The artboard puts „სერვისი 1 · 60₾" under every row,
     and it is the one thing that told two threads apart and was not on screen:
     a provider with three jobs open can have two of them under the same topic.
     The third line used to be the bare topic, in ink-400, which said the least
     of any line in the row.
   · THE UNREAD COUNT BECAME A DOT. It was a left accent bar + a bold name + a
     brand timestamp + a count badge — four treatments for one bit of
     information, and the number itself („2") answers a question nobody asks in
     an inbox of four rows. The artboard says it once, in danger-500, and the
     bold name carries the rest. The count survives for screen readers, where a
     coloured disc says nothing at all.
   · THE TIMESTAMP STOPPED TURNING GREEN on unread. Brand green is the „chosen
     / accepted" colour everywhere else in this product; on a clock it meant
     nothing.

   `min-h-[76px]` and the 40px disc keep the whole row well past the 40px tap
   floor — the row IS the target, which is why nothing inside it is separately
   clickable. */
export function ConversationRow({
  href,
  name,
  avatarUrl,
  topic,
  price,
  lastBody,
  lastHasFile,
  lastAt,
  lastFromMe,
  unread,
  active = false,
  now,
}: {
  href: string
  name: string | null
  avatarUrl?: string | null
  topic: string
  /** The agreed figure, or null where there is none — lib/inboxRows →
   *  offerRowPrice decides that, so this component never prints „0₾". */
  price?: string | null
  lastBody?: string | null
  lastHasFile?: boolean
  lastAt?: Date | null
  lastFromMe: boolean
  unread: number
  /** The open thread. The artboard tints the selected row with the page's own
   *  cream ground rather than a brand wash — the pane beside it is white, so
   *  the tint reads as „this row is the thing on the right". */
  active?: boolean
  now: Date
}) {
  const preview = msgPreview(lastBody, lastHasFile)
  const isUnread = unread > 0
  const chip = [topic, price].filter(Boolean).join(' · ')
  const photo = avatarUrl || DEFAULT_AVATAR
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`flex items-start gap-3 p-4 min-h-[76px] transition-colors duration-fast ${
        active ? 'bg-ink-50' : 'hover:bg-ink-50/60 active:bg-ink-100/50'
      }`}
    >
      <div className="relative w-10 h-10 rounded-full overflow-hidden ring-1 ring-ink-200 shrink-0">
        {/* Same rule as components/Avatar.tsx — keep the two in step. `data:`
            URIs the optimizer cannot process at all, and `/api/avatars/*` is
            ALREADY a ≤384px webp served `immutable`, so routing it through
            /_next/image only adds a server hop and a re-encode. */}
        <Image src={photo} alt="" fill sizes="40px" unoptimized={/^(data:|\/api\/avatars\/)/.test(photo)} className="object-cover" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`flex-1 min-w-0 font-display text-body text-ink-900 truncate ${isUnread ? 'font-extrabold' : 'font-semibold'}`}>
            {name}
          </span>
          <span className="shrink-0 text-meta tabular-nums text-ink-400">
            {lastAt ? fmtKaThreadTime(lastAt, now) : null}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-1.5 min-w-0 text-meta text-ink-500">
          {lastFromMe && <span className="shrink-0 text-ink-400">შენ:</span>}
          {preview.isAttachment && <Icon.paperclip className="w-3.5 h-3.5 text-ink-400 shrink-0" />}
          {/* min-w-0: a flex child defaults to min-width:auto, so without it
              one long unbroken message blows the row out sideways (+13000px
              overflow on mobile) instead of truncating. */}
          <span className="truncate min-w-0">{preview.text || (preview.isAttachment ? 'მიმაგრებული ფაილი' : '')}</span>
        </div>

        {chip && (
          <span className="mt-2 max-w-full inline-flex items-center h-[22px] px-2.5 rounded-pill bg-ink-75 border border-ink-200 text-meta font-semibold text-ink-600">
            <span className="truncate">{chip}</span>
          </span>
        )}
      </div>

      {isUnread && (
        <span className="shrink-0 mt-1.5 w-[9px] h-[9px] rounded-pill bg-danger-500">
          {/* The disc is the whole indicator on screen; the number is the whole
              indicator for a screen reader. Neither reads the other's medium. */}
          <span className="sr-only">{unread} წაუკითხავი</span>
        </span>
      )}
    </Link>
  )
}

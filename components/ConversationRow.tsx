import Link from 'next/link'
import Image from 'next/image'
import { Icon } from './Icon'
import { fmtKaThreadTime } from '@/lib/kaDate'
import { msgPreview } from '@/lib/msgText'

/* One conversation in the messages inbox — shared by the student and tutor
   lists so the two surfaces can't drift apart again.

   Hierarchy: name + smart timestamp on top, message preview as the scannable
   middle line, booking topic as a quiet third line. Unread rows get the full
   treatment at once (left accent bar, bold name, brand timestamp, count
   badge) so read/unread separates at a glance without hunting. */
export function ConversationRow({
  href,
  name,
  avatarUrl,
  topic,
  lastBody,
  lastHasFile,
  lastAt,
  lastFromMe,
  unread,
  now,
}: {
  href: string
  name: string | null
  avatarUrl?: string | null
  topic: string
  lastBody?: string | null
  lastHasFile?: boolean
  lastAt?: Date | null
  lastFromMe: boolean
  unread: number
  now: Date
}) {
  const preview = msgPreview(lastBody, lastHasFile)
  const isUnread = unread > 0
  return (
    <Link
      href={href}
      className="relative flex items-center gap-3.5 pl-4 pr-4 sm:pl-5 sm:pr-5 py-3.5 min-h-[76px] hover:bg-ink-50/60 active:bg-ink-100/50 transition-colors group"
    >
      {isUnread && <span aria-hidden className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-brand-500" />}

      <div className="relative w-12 h-12 rounded-full overflow-hidden ring-1 ring-ink-200 shrink-0">
        {avatarUrl ? (
          <Image src={avatarUrl} alt="" fill sizes="48px" className="object-cover" />
        ) : (
          <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-100 to-brand-200 text-brand-800 font-display font-semibold text-[18px]">
            {name?.trim()?.slice(0, 1).toUpperCase() ?? 'მ'}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className={`font-display text-[14px] text-ink-900 truncate ${isUnread ? 'font-bold' : 'font-semibold'}`}>
            {name}
          </span>
          <span className={`text-[11px] tabular-nums shrink-0 ${isUnread ? 'font-display font-bold text-brand-700' : 'text-ink-400'}`}>
            {lastAt ? fmtKaThreadTime(lastAt, now) : null}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 mt-0.5">
          <span className={`flex items-center gap-1.5 min-w-0 text-[13px] ${isUnread ? 'text-ink-900 font-medium' : 'text-ink-500'}`}>
            {lastFromMe && <span className="text-ink-400 shrink-0">შენ:</span>}
            {preview.isAttachment && <Icon.paperclip className="w-3.5 h-3.5 text-ink-400 shrink-0" />}
            <span className="truncate">{preview.text || (preview.isAttachment ? 'მიმაგრებული ფაილი' : '')}</span>
          </span>
          {isUnread && (
            <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-brand-500 text-white font-display text-[11px] font-bold tabular-nums">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </div>

        <div className="text-[11.5px] text-ink-400 truncate mt-1">{topic}</div>
      </div>
    </Link>
  )
}

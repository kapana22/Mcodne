'use client'
import { safeHttpUrl } from '@/lib/safeUrl'
import { Icon } from '@/components/Icon'

// Shared render for an instant video-call invite message. A message is a call
// invite when its `fileName === '__call__'` (Message has no `type` column) and
// `fileUrl` carries the room URL. Used by every chat surface (BookingChat +
// the student inline chats) so the card looks identical everywhere.
export const CALL_SENTINEL = '__call__'

export function CallInviteCard({
  fileUrl,
  fromName,
  mine,
  time,
}: {
  fileUrl?: string | null
  fromName: string
  mine: boolean
  time: string
}) {
  const room = safeHttpUrl(fileUrl)
  return (
    <div className="max-w-[85%] sm:max-w-[78%] rounded-card border border-brand-200 bg-brand-50 p-3.5">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-8 h-8 rounded-full bg-brand-500 text-white inline-flex items-center justify-center shrink-0">
          <Icon.video className="w-4 h-4" />
        </span>
        <div className="font-display text-[13.5px] font-bold text-ink-900 leading-tight">ვიდეოზარზე მოწვევა</div>
      </div>
      <div className="text-[12px] text-ink-600 mb-3 leading-snug">
        {mine ? 'მოწვევა გაიგზავნა — შედი ან დაელოდე.' : `${fromName} გიწვევს ვიდეოზარზე.`}
      </div>
      {room && (
        <a
          href={room}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full h-10 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13px] tracking-wide inline-flex items-center justify-center gap-1.5 transition-colors shadow-xs"
        >
          <Icon.video className="w-4 h-4" /> შემოსვლა
        </a>
      )}
      <div className="text-[10.5px] mt-2 font-mono tabular-nums text-ink-400">{time}</div>
    </div>
  )
}

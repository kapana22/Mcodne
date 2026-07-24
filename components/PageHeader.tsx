/* Canonical page header for EVERY workspace page (student · tutor · admin):
   eyebrow / title / one-line sub + right-aligned actions (wrap below sm). One
   title scale site-wide so the two workspaces read as one system — student
   pages used to hand-roll `<h1 text-3xl>` while tutor used this at 26px. */
import { Eyebrow } from '@/components/Eyebrow'

export function PageHeader({
  eyebrow,
  title,
  sub,
  actions,
  className = '',
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  sub?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-3 ${className}`}>
      <div className="min-w-0">
        {eyebrow && (
          <Eyebrow>
            {eyebrow}
          </Eyebrow>
        )}
        <h1 className="font-display text-[22px] sm:text-[26px] font-bold text-ink-900 tracking-tight mt-1">
          {title}
        </h1>
        {sub && <p className="text-[13px] text-ink-500 mt-1.5 leading-snug">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}

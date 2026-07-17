'use client'

/* Canonical page header for workspace pages: eyebrow / title / one-line sub +
   right-aligned actions (wrap below sm). Keeps every page's opening block on
   the same grid so the workspace reads as one system. */
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
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-brand-700">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-[22px] sm:text-[26px] font-bold text-ink-900 tracking-tight mt-0.5">
          {title}
        </h1>
        {sub && <p className="text-[13px] text-ink-500 mt-1 leading-snug">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}

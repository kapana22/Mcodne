type Tone = 'preparing' | 'confirmed' | 'live' | 'completed' | 'canceled' | 'noshow'

const TONES: Record<Tone, { cls: string; dot?: string; label: string; pulse?: boolean }> = {
  preparing: { cls: 'bg-warning-50 text-warning-700 border-warning-200', dot: 'bg-warning-500', label: 'მზადდება' },
  confirmed: { cls: 'bg-brand-50 text-brand-800 border-brand-200', dot: 'bg-brand-500', label: 'დადასტურდა' },
  live:      { cls: 'bg-danger-50 text-danger-700 border-danger-200', dot: 'bg-danger-500', label: 'ცოცხალია', pulse: true },
  completed: { cls: 'bg-success-50 text-success-700 border-success-200', dot: 'bg-success-500', label: 'დასრულდა' },
  canceled:  { cls: 'bg-ink-100 text-ink-600 border-ink-200', label: 'გაუქმდა' },
  noshow:    { cls: 'bg-ink-100 text-ink-600 border-ink-200', label: 'არ გამოცხადდა' },
}

export function StatusPill({ tone, label }: { tone: Tone; label?: string }) {
  const t = TONES[tone]
  return (
    <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-pill border font-display text-[10.5px] font-bold uppercase tracking-[0.16em] ${t.cls}`}>
      {t.dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${t.dot} ${t.pulse ? 'motion-safe:animate-pulse-soft' : ''}`} />
      )}
      {label ?? t.label}
    </span>
  )
}

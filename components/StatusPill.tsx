type Tone = 'preparing' | 'confirmed' | 'live' | 'completed' | 'canceled' | 'noshow'

// Quiet, premium status pills: hairline border + colored text, no fill, no dot.
// Color carries meaning only where it matters (confirmed / live = brand green);
// everything else stays neutral so the UI reads calm.
const TONES: Record<Tone, { cls: string; label: string }> = {
  preparing: { cls: 'border-ink-200 text-ink-500', label: 'ელოდება დადასტურებას' },
  confirmed: { cls: 'border-brand-200 text-brand-700', label: 'დადასტურდა' },
  live:      { cls: 'border-brand-500 text-brand-600', label: 'მიმდინარეობს' },
  completed: { cls: 'border-ink-200 text-ink-500', label: 'დასრულდა' },
  canceled:  { cls: 'border-ink-200 text-ink-400', label: 'გაუქმდა' },
  noshow:    { cls: 'border-ink-200 text-ink-400', label: 'არ გამოცხადდა' },
}

export function StatusPill({ tone, label }: { tone: Tone; label?: string }) {
  const t = TONES[tone]
  return (
    <span className={`inline-flex items-center h-6 px-2.5 rounded-pill border bg-transparent font-display text-[10.5px] font-bold uppercase tracking-[0.16em] ${t.cls}`}>
      {label ?? t.label}
    </span>
  )
}

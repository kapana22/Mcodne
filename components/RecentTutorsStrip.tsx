'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Eyebrow } from '@/components/Eyebrow'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'

// Client-side "Recently viewed tutors" cache. localStorage-only, no backend.
// Kept as a stand-alone component so app/tutors, app/tutors/[id], and
// app/page.tsx can share the same shape without touching lib/.

const STORAGE_KEY = 'mcodne:recent-tutors'
const MAX_ITEMS = 5

export type RecentTutor = {
  id: string
  name: string
  avatar: string | null
  specialty: string | null
  price: number | null
  viewedAt: number
}

function safeRead(): RecentTutor[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Basic shape guard — drop entries that don't look like tutors.
    return parsed
      .filter((r: any): r is RecentTutor =>
        r && typeof r.id === 'string' && typeof r.name === 'string' && typeof r.viewedAt === 'number'
      )
      .slice(0, MAX_ITEMS)
  } catch {
    return []
  }
}

function safeWrite(list: RecentTutor[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)))
  } catch {
    // Storage may be disabled or full — silent no-op.
  }
}

/** Push a tutor to the front of the recents list (LRU, dedupe by id, cap 5). */
export function pushRecentTutor(input: Omit<RecentTutor, 'viewedAt'>) {
  if (typeof window === 'undefined') return
  if (!input?.id) return
  const now = Date.now()
  const current = safeRead().filter(r => r.id !== input.id)
  const next: RecentTutor[] = [{ ...input, viewedAt: now }, ...current].slice(0, MAX_ITEMS)
  safeWrite(next)
  // Notify same-tab listeners.
  try { window.dispatchEvent(new CustomEvent('mcodne:recent-tutors:change')) } catch {}
}

/** Hook: reactive list of recent tutors, hydrated only after mount to avoid SSR mismatch. */
export function useRecentTutors() {
  const [mounted, setMounted] = useState(false)
  const [items, setItems] = useState<RecentTutor[]>([])

  useEffect(() => {
    setItems(safeRead())
    setMounted(true)
    const onChange = () => setItems(safeRead())
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onChange)
      window.addEventListener('mcodne:recent-tutors:change', onChange as EventListener)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onChange)
        window.removeEventListener('mcodne:recent-tutors:change', onChange as EventListener)
      }
    }
  }, [])

  const remove = useCallback((id: string) => {
    const next = safeRead().filter(r => r.id !== id)
    safeWrite(next)
    setItems(next)
    try { window.dispatchEvent(new CustomEvent('mcodne:recent-tutors:change')) } catch {}
  }, [])

  return { mounted, items, remove }
}

function truncate(s: string, n = 14) {
  if (!s) return ''
  if (s.length <= n) return s
  return s.slice(0, n - 1).trimEnd() + '…'
}

/** Horizontal chip strip. Renders nothing until mounted / when list is empty. */
export function RecentTutorsStrip({ className = '' }: { className?: string }) {
  const { mounted, items, remove } = useRecentTutors()
  if (!mounted || items.length === 0) return null
  return (
    <section
      aria-label="ბოლოს ნახე"
      className={`w-full ${className}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Eyebrow as="span" tone="muted">
          ბოლოს ნახე
        </Eyebrow>
        <span className="h-px flex-1 bg-ink-100" aria-hidden="true" />
      </div>
      <ul className="flex gap-2 overflow-x-auto scrollbar-hide rail-fade-end -mx-1 px-1 pb-1 motion-safe:scroll-smooth">
        {items.map(t => (
          <li key={t.id} className="shrink-0">
            <div className="group relative inline-flex items-center gap-2 h-11 pl-1.5 pr-8 rounded-pill border border-ink-200 bg-white hover:border-ink-300 hover:shadow-xs transition-all">
              <Link
                href={`/tutors/${t.id}`}
                className="inline-flex items-center gap-2 min-w-0"
                title={t.name}
              >
                <span className="w-7 h-7 rounded-full overflow-hidden bg-brand-100 text-brand-700 inline-flex items-center justify-center shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.avatar || DEFAULT_AVATAR} alt="" className="w-full h-full object-cover" />
                </span>
                <span className="font-display text-[12.5px] font-semibold text-ink-800 whitespace-nowrap">
                  {truncate(t.name, 14)}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => remove(t.id)}
                aria-label={`მოაშორე ${t.name} სიიდან`}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-ink-400 hover:text-ink-900 hover:bg-ink-100 inline-flex items-center justify-center motion-safe:transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12" aria-hidden="true">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

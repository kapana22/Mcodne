'use client'
// „ზემოთ" — a back-to-top control for long pages.
//
// WHY IT EXISTS: measured on a phone, the real pages here run 5.2–7.9 screens
// (/ 7.9 · /blog 6.4 · profile 6 · /konsultacia 5.3 · /tutors 5.2). Getting back
// to the search field or the nav from the foot of one of those is 6–8 swipes,
// and the header is `sticky`, so it is NOT reachable by scrolling up a little —
// you have to travel the whole way.
//
// SELF-GATING, deliberately: it appears only after the reader has passed two
// viewport heights, so a short page never shows it and no page needs to opt in
// or configure a threshold. Mount once in AppShell and it is correct everywhere.
//
// Placement notes:
//   • bottom-RIGHT is the convention; the toast host sits there too but toasts
//     are transient and own a higher z-index, so a toast simply passes over it.
//   • The mobile lifts live in globals.css against the same `data-bottom-nav` /
//     `data-mobile-cta` body hooks the cookie banner and the toast host already
//     use — one mechanism, not a third private offset.
//   • z-to-top: above page content and the BottomNav (40), below the cookie
//     banner (60), the nav drawer (70), Sheet (80) and ConfirmModal (90). A
//     dialog must never have this floating over it.

import { useEffect, useState } from 'react'
import { Icon } from './Icon'

export function BackToTop() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Threshold is two viewports, not a fixed pixel count: on a tall desktop
    // window 1200px is barely a scroll, on a phone it is most of the page.
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 2)
    onScroll()
    // Passive — this must never cost a scroll frame.
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  if (!show) return null

  const toTop = () => {
    // Smooth by default, instant for anyone who asked for less motion — a
    // multi-screen smooth-scroll is exactly the kind of unrequested travel that
    // causes nausea, and it is long enough here to matter.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
    // Return focus to the top of the document so a keyboard user lands where
    // the page now is, instead of keeping focus on a button that just vanished.
    document.getElementById('main')?.focus?.()
  }

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="ზემოთ დაბრუნება"
      title="ზემოთ"
      className="back-to-top fixed right-4 sm:right-6 bottom-4 sm:bottom-6 z-to-top w-11 h-11 rounded-full glass text-ink-700 hover:text-ink-900 inline-flex items-center justify-center motion-safe:animate-fade-in-fast"
    >
      {/* `chevD` rotated — the icon set has no dedicated up chevron, and adding
          one for a single call site would fork the single-source Icon file. */}
      <Icon.chevD aria-hidden className="w-4 h-4 rotate-180" />
    </button>
  )
}

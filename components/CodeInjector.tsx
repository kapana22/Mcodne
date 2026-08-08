'use client'
// Injects admin-managed raw header/footer code into the document.
//
// ⚠️ CONSENT-GATED since 2026-07-31. This component executes THIRD-PARTY code on
// behalf of every visitor, and until now it did so unconditionally — which is
// how the site came to load Google Analytics, fire a /g/collect beacon and write
// `_ga` / `_ga_<id>` cookies BEFORE the consent banner had been touched.
// Measured on production in a clean browser profile: banner visible on screen,
// tracking already done. The banner was asking for permission the page had taken.
//
// The GA snippet reached the admin „ინტეგრაციები" field almost certainly as a
// workaround from the window when components/Analytics.tsx could not fire (CSP
// blocked the Google domains until 2026-07-24). Analytics.tsx has ALWAYS been
// correctly gated and also sends SPA page views, so it is the right home for GA;
// the pasted snippet is a duplicate. Removing it in the admin panel is the clean
// end state — this gate is the guarantee that no future paste reopens the hole.
//
// WHY GATE EVERYTHING rather than things that "look like" tracking: arbitrary
// third-party JavaScript cannot be classified from the outside. A script that is
// harmless today can start setting cookies when its vendor ships an update, and
// a substring test for „gtag"/„analytics" is trivially missed by a tag manager,
// a bundled pixel or a self-hosted proxy. Consent is the only safe default.
//
// CONSEQUENCE, so nobody is surprised: injected code now runs only after the
// visitor chooses „თანხმობა". Someone who picks „მხოლოდ საჭირო" — or who never
// answers — never executes it. If a genuinely ESSENTIAL, non-tracking snippet is
// ever needed (a status widget, say) it belongs in the app itself, not in this
// field. That is a deliberate constraint, not an oversight.
//
// React's dangerouslySetInnerHTML does NOT execute <script> tags, so we recreate
// each script element (copying attrs + inline body) so snippets actually run.
// Content is admin-authored (site owner) only.

import { useEffect, useState } from 'react'

/** The same key and event CookieConsent writes and Analytics.tsx listens to. */
const CONSENT_KEY = 'mcodne:cookie-consent'

function hasConsent(): boolean {
  try { return window.localStorage.getItem(CONSENT_KEY) === 'accepted' } catch { return false }
}

function inject(target: HTMLElement, html: string, marker: string) {
  if (!html || !html.trim()) return
  // Guard against double-injection on Fast Refresh / re-mount — and now also on
  // the consent event arriving after a render that already injected.
  if (document.querySelector(`[data-injected="${marker}"]`)) return
  const wrap = document.createElement('div')
  wrap.setAttribute('data-injected', marker)
  wrap.style.display = 'contents'
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  tpl.content.querySelectorAll('script').forEach(old => {
    const s = document.createElement('script')
    for (const a of Array.from(old.attributes)) s.setAttribute(a.name, a.value)
    s.text = old.textContent || ''
    old.replaceWith(s)
  })
  wrap.appendChild(tpl.content)
  target.appendChild(wrap)
}

export function CodeInjector({ header, footer }: { header?: string; footer?: string }) {
  // Starts false on server AND first client render so hydration matches; the
  // effect below corrects it before anything can be injected.
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    if (hasConsent()) setAllowed(true)
    // React within the same page load — a visitor who accepts should not have to
    // reload before the site owner's snippets start.
    const onConsent = (e: Event) => {
      if ((e as CustomEvent).detail === 'accepted') setAllowed(true)
    }
    window.addEventListener('mcodne:consent', onConsent)
    return () => window.removeEventListener('mcodne:consent', onConsent)
  }, [])

  useEffect(() => {
    if (!allowed) return
    if (header) inject(document.head, header, 'header')
    if (footer) inject(document.body, footer, 'footer')
  }, [allowed, header, footer])

  return null
}

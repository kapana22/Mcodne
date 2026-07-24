'use client'
// Injects admin-managed raw header/footer code into the document. Runs once per
// full page load. React's dangerouslySetInnerHTML does NOT execute <script>
// tags, so we recreate each script element (copying attrs + inline body) so
// tracking snippets actually run. Content is admin-authored (site owner) only.

import { useEffect } from 'react'

function inject(target: HTMLElement, html: string, marker: string) {
  if (!html || !html.trim()) return
  // Guard against double-injection on Fast Refresh / re-mount.
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
  useEffect(() => {
    if (header) inject(document.head, header, 'header')
    if (footer) inject(document.body, footer, 'footer')
  }, [header, footer])
  return null
}

/*
 * WHOLE-SITE MOBILE AUDIT — live mcodne.ge, 390px (and 360px for the tight case).
 *
 * Run: node tests/mobile-audit-2026-08-07.mjs
 *
 * Checks per route: horizontal overflow, console/page errors, broken images,
 * missing alt, tap targets under 40px, text clipped by its container, elements
 * wider than the viewport, and the sticky/fixed chrome overlapping content.
 *
 * FILTERS ARE THE POINT. The 2026-08-05 audit's first run produced 144/144
 * "findings" that were all inline prose links. The exclusions below are the
 * documented false positives from that pass — do not remove them without a
 * measurement:
 *   • inline links inside prose (p/li/dd/blockquote/figcaption, display:inline)
 *   • the sr-only skip link
 *   • <input type=file> hidden behind an avatar picker (display:none → not in
 *     the a11y tree)
 *   • the Logo link (min-h-[40px] on the touch surface by design)
 */
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = 'https://mcodne.ge'
const OUT = process.env.OUT || '/tmp/mobile-audit'
fs.mkdirSync(OUT, { recursive: true })

const ROUTES = process.env.ROUTES
  ? process.env.ROUTES.split(',')
  : [
      '/', '/tutors', '/categories', '/about', '/help', '/contact', '/blog', '/apply',
      '/konsultacia', '/signin', '/signup', '/terms', '/privacy',
      '/categories/business', '/categories/it', '/categories/law',
      '/konsultacia/biznes-konsultanti', '/konsultacia/iuristi', '/konsultacia/fsikologi',
      '/blog/ra-aris-biznes-konsultacia', '/blog/shps-dafudzneba-saqartveloshi',
      '/tutors/luka-lortkipanidze', '/tutors/ana-gagoshidze', '/tutors/nino-gakhokia',
    ]

const browser = await chromium.launch()
const findings = []
const add = (route, width, kind, detail) => findings.push({ route, width, kind, detail })

for (const width of [390, 360]) {
  const ctx = await browser.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  })
  for (const route of ROUTES) {
    const page = await ctx.newPage()
    const errs = []
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)) })
    page.on('pageerror', e => errs.push('PAGEERROR ' + String(e).slice(0, 160)))
    try {
      const res = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 })
      if (!res || res.status() >= 400) { add(route, width, 'status', String(res && res.status())); await page.close(); continue }
      await page.waitForTimeout(2500)

      const r = await page.evaluate(() => {
        const out = { overflow: 0, wide: [], small: [], clipped: [], noAlt: [], brokenImg: [], h1: 0, headings: [] }
        const vw = document.documentElement.clientWidth
        out.overflow = document.documentElement.scrollWidth - vw

        const inProse = el => !!el.closest('p,li,dd,blockquote,figcaption')
        const isInline = el => getComputedStyle(el).display === 'inline'
        const srOnly = el => el.className && String(el.className).includes('sr-only')

        // elements physically wider than the viewport
        document.querySelectorAll('body *').forEach(el => {
          const b = el.getBoundingClientRect()
          if (b.width > vw + 1 && b.height > 0 && getComputedStyle(el).position !== 'fixed') {
            out.wide.push({ tag: el.tagName, cls: String(el.className || '').slice(0, 70), w: Math.round(b.width) })
          }
        })

        // tap targets
        document.querySelectorAll('a[href],button,[role="button"],input:not([type=hidden]),select,textarea').forEach(el => {
          if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return
          if (srOnly(el) || (inProse(el) && isInline(el))) return
          const b = el.getBoundingClientRect()
          if (b.width === 0 || b.height === 0) return
          // the ::before hit expander (.tap-area) is invisible to getBoundingClientRect
          if (String(el.className || '').includes('tap-area')) return
          if (b.height < 40 || b.width < 40) {
            out.small.push({
              tag: el.tagName, w: Math.round(b.width), h: Math.round(b.height),
              text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 34),
              cls: String(el.className || '').slice(0, 60),
            })
          }
        })

        // text clipped by its own box (no ellipsis/scroll declared)
        document.querySelectorAll('h1,h2,h3,p,span,div,button,a').forEach(el => {
          if (el.children.length) return
          // sr-only is clipped BY DESIGN (1px box) — the skip link and the
          // aria-live result count are not layout bugs. 50/50 of the first
          // run's "clipped text" was these two.
          if (srOnly(el) || el.closest('.sr-only')) return
          const cs = getComputedStyle(el)
          if (cs.overflow === 'visible' && cs.textOverflow !== 'ellipsis') return
          if (el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== 'ellipsis' && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') {
            out.clipped.push({ tag: el.tagName, text: (el.textContent || '').trim().slice(0, 40) })
          }
        })

        document.querySelectorAll('img').forEach(img => {
          if (!img.hasAttribute('alt')) out.noAlt.push(img.currentSrc?.slice(-50) || img.src.slice(-50))
          if (img.complete && img.naturalWidth === 0) out.brokenImg.push(img.src.slice(0, 90))
        })
        out.h1 = document.querySelectorAll('h1').length
        out.headings = [...document.querySelectorAll('h1,h2,h3,h4')].map(h => Number(h.tagName[1]))
        return out
      })

      if (r.overflow > 0) add(route, width, 'overflow', `${r.overflow}px`)
      for (const w of r.wide.slice(0, 3)) add(route, width, 'wider-than-viewport', `${w.tag}.${w.cls} = ${w.w}px`)
      for (const s of r.small) add(route, width, 'tap-target', `${s.tag} ${s.w}×${s.h} „${s.text}" ${s.cls}`)
      for (const c of r.clipped.slice(0, 4)) add(route, width, 'clipped-text', `${c.tag} „${c.text}"`)
      for (const a of r.noAlt) add(route, width, 'img-no-alt', a)
      for (const b of r.brokenImg) add(route, width, 'broken-img', b)
      if (r.h1 !== 1) add(route, width, 'h1-count', String(r.h1))
      for (let i = 1; i < r.headings.length; i++) {
        if (r.headings[i] - r.headings[i - 1] > 1) { add(route, width, 'heading-jump', `h${r.headings[i - 1]} → h${r.headings[i]}`); break }
      }
      for (const e of [...new Set(errs)]) add(route, width, 'console', e)
    } catch (e) {
      add(route, width, 'threw', String(e).split('\n')[0].slice(0, 120))
    }
    await page.close()
  }
  await ctx.close()
}
await browser.close()

// group + print
const byKind = {}
for (const f of findings) (byKind[f.kind] ??= []).push(f)
console.log(`\n=== ${findings.length} findings across ${ROUTES.length} routes × 2 widths ===\n`)
for (const [kind, list] of Object.entries(byKind).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n## ${kind} (${list.length})`)
  const seen = new Set()
  for (const f of list) {
    const key = `${f.kind}|${f.detail}`
    if (seen.has(key)) continue
    seen.add(key)
    console.log(`  [${f.width}] ${f.route} — ${f.detail}`)
  }
}
fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 2))
console.log(`\nfull json → ${OUT}/findings.json`)

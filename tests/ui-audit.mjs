/**
 * THE SIX WAYS A SCREEN LIES, checked across the live site.
 *
 *   node tests/ui-audit.mjs                    # production, both widths
 *   node tests/ui-audit.mjs http://localhost:3000
 *
 * A live-site harness like the other .mjs files here: it needs a deployment and
 * a browser, so it is deliberately NOT in `npm run check` (see scripts/check.mjs
 * — mixing it in would fail the gate for reasons that have nothing to do with
 * the change under test). Run it after a deploy, or when a page „looks wrong"
 * and nobody can say why.
 *
 * WHY IT EXISTS. Every defect below was found by the owner sending a screenshot
 * and asking what was wrong with it — one at a time, over a day:
 *
 *   ① a control that cannot change anything    the availability filter cut 4 of
 *                                              21 results; „მინ. რეიტინგი"
 *                                              returned 0 because no expert had
 *                                              a review; „ქართული" matched all 21
 *   ② raw data rendered as design               searching „ტესტ" printed „ტესტ"
 *                                              as a 44px h1
 *   ③ furniture invisible to its own audience   the „/" shortcut badge hid below
 *                                              lg and on focus
 *   ④ an element that reads as another element  a format badge stretched to the
 *                                              card width and looked like a
 *                                              disabled input
 *   ⑤ a label cut mid-word                      „…მშენ…" is not a choice
 *   ⑥ a claim that is not true today            counted numbers, never written
 *
 * ⚠️ IT MEASURES THE HIT AREA, NOT THE BOX. The first version reported 14
 * failures on /tutors, every one of them already correct: those links carry
 * `.tap-area`, which hangs an invisible `inset:-12px -6px` ::before over a 19px
 * line and gets it to 43px without moving the layout (globals.css). An audit
 * that cries wolf is deleted within a week, so the pseudo-element is read
 * before anything is judged.
 *
 * WHAT IT CANNOT SEE, and therefore what still needs eyes: whether the copy is
 * good, whether the order is sensible, and whether a true claim is the RIGHT
 * claim. It finds the mechanical half.
 */
import { chromium } from 'playwright'

const SITE = (process.argv[2] || 'https://mcodne.ge').replace(/\/$/, '')
const PAGES = ['/', '/tutors', '/categories', '/konsultacia', '/about', '/contact', '/help', '/apply']
const WIDTHS = [1280, 390]

const found = []
const add = (page, w, kind, detail) => found.push({ page, w, kind, detail })

async function auditPage(page, path, w) {
  const errs = []
  page.on('pageerror', e => errs.push(String(e).slice(0, 90)))
  const res = await page.goto(SITE + path, { waitUntil: 'domcontentloaded' }).catch(() => null)
  if (!res || res.status() >= 400) return add(path, w, 'HTTP', String(res?.status() ?? 'no response'))
  await page.getByRole('button', { name: 'თანხმობა' }).click().catch(() => {})
  await page.waitForTimeout(2200)

  /* ① a control with nothing to choose. One option is not a choice. */
  for (const sel of await page.locator('select').all()) {
    const n = await sel.locator('option').count()
    if (n <= 1) add(path, w, 'ერთვარიანტიანი კონტროლი', `select, ${n} option`)
  }

  /* ⑤ a label cut mid-word — only where truncation is DECLARED, so a naturally
     short label that happens to fit is never reported. */
  for (const t of await page.evaluate(() => {
    const out = []
    document.querySelectorAll('button, a, h1, h2, h3, label, span').forEach(el => {
      const declared = getComputedStyle(el).textOverflow === 'ellipsis'
        || el.className.toString().includes('truncate')
      if (!declared) return
      if (el.scrollWidth > el.clientWidth + 2 && (el.textContent || '').trim().length > 3)
        out.push((el.textContent || '').trim().slice(0, 44))
    })
    return [...new Set(out)].slice(0, 4)
  })) add(path, w, 'ტექსტი იჭრება', t)

  /* a heading with nothing under it */
  for (const t of await page.evaluate(() => {
    const out = []
    document.querySelectorAll('section').forEach(s => {
      const h = s.querySelector('h2, h3')
      if (h && (s.textContent || '').trim() === (h.textContent || '').trim())
        out.push((h.textContent || '').trim().slice(0, 36))
    })
    return out.slice(0, 3)
  })) add(path, w, 'ცარიელი სექცია', t)

  /* the project's own 40px tap floor — hit area, pseudo-element included */
  if (w === 390) {
    for (const t of await page.evaluate(() => {
      const out = []
      document.querySelectorAll('a[href], button').forEach(el => {
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height || !(el.textContent || '').trim()) return
        if (el.className.toString().includes('sr-only')) return
        let h = r.height
        const before = getComputedStyle(el, '::before')
        if (before.content && before.content !== 'none') {
          const top = parseFloat(before.top || '0')
          if (top < 0) h += Math.abs(top) * 2
        }
        if (h < 40) out.push(`${(el.textContent || '').trim().slice(0, 22)} — ${Math.round(h)}px`)
      })
      return [...new Set(out)].slice(0, 5)
    })) add(path, w, 'tap-target 40px-ზე ნაკლები', t)
  }

  /* a page that scrolls sideways is a page that was not laid out */
  if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1))
    add(path, w, 'ჰორიზონტალური გადავსება',
      await page.evaluate(() => `${document.documentElement.scrollWidth}px > ${document.documentElement.clientWidth}px`))

  for (const e of errs.slice(0, 2)) add(path, w, 'კონსოლის შეცდომა', e)
}

const browser = await chromium.launch()
try {
  await Promise.all(WIDTHS.map(async w => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } })
    await Promise.all(PAGES.map(async path => {
      const page = await ctx.newPage()
      await auditPage(page, path, w).catch(e => add(path, w, 'აუდიტი ჩავარდა', String(e).slice(0, 60)))
      await page.close()
    }))
    await ctx.close()
  }))
} finally {
  await browser.close()
}

console.log(`\n${SITE} — ${PAGES.length} გვერდი × ${WIDTHS.join('/')}px\n`)
if (!found.length) {
  console.log('✓ მექანიკური პრობლემა ვერ ვიპოვე.')
} else {
  const byKind = new Map()
  for (const f of found) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f])
  for (const [kind, list] of [...byKind.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`■ ${kind} — ${list.length}`)
    for (const f of list) console.log(`   ${f.page} @${f.w}px  ${f.detail}`)
    console.log('')
  }
}
process.exit(0)

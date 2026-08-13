/**
 * Build the raster icons from public/favicon.svg.
 *
 *   node scripts/build-favicons.mjs
 *
 * WHY THIS EXISTS. The site shipped ONLY an SVG favicon, and `/favicon.ico`
 * 404'd. Google fetches the root `/favicon.ico` when it cannot resolve a
 * declared icon, and a 404 there is one of the reasons Search Console draws the
 * generic globe instead of a site's mark (measured 2026-08-13). Several other
 * consumers — older browsers, link-preview bots, some Google surfaces — only
 * ever look for a raster file.
 *
 * SIZES ARE MULTIPLES OF 48, which is what Google documents for favicons
 * (48/96/144/192). The source is 64×64 — fine for an SVG, which scales, but not
 * a size to rasterise to.
 *
 * ⚠️ THE SVG STAYS THE SOURCE OF TRUTH. Re-run this after any change to
 * public/favicon.svg; the outputs are committed so a deploy needs no build step.
 */
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'

const svg = readFileSync('public/favicon.svg')
const png = (size) => sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer()

for (const [size, name] of [[48, 'icon-48.png'], [96, 'icon-96.png'], [192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]) {
  writeFileSync(`public/${name}`, await png(size))
  console.log(`  public/${name}`)
}

/* A .ico is a 6-byte header, one 16-byte directory entry per image, then the
   payloads. Since Vista an entry may be a whole PNG rather than a BMP, which is
   what every modern consumer reads — so this packs two PNGs (48 and 32) and
   needs no BMP encoder. `sharp` cannot write .ico, and pulling a dependency in
   for 40 bytes of header would be the larger change. */
const imgs = await Promise.all([48, 32].map(async (s) => ({ s, buf: await png(s) })))
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(imgs.length, 4)
let offset = 6 + 16 * imgs.length
const dir = Buffer.concat(imgs.map(({ s, buf }) => {
  const e = Buffer.alloc(16)
  e.writeUInt8(s >= 256 ? 0 : s, 0)   // width  (0 means 256)
  e.writeUInt8(s >= 256 ? 0 : s, 1)   // height
  e.writeUInt8(0, 2); e.writeUInt8(0, 3)
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6)
  e.writeUInt32LE(buf.length, 8); e.writeUInt32LE(offset, 12)
  offset += buf.length
  return e
}))
writeFileSync('public/favicon.ico', Buffer.concat([header, dir, ...imgs.map(i => i.buf)]))
console.log(`  public/favicon.ico (${imgs.map(i => i.s).join(' + ')}px)`)

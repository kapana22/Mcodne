import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { ensureDbReady } from '@/lib/dbBoot'
import { SITE_TEXTS, isKnownSiteTextKey } from '@/lib/siteTextDefs'
import { INTEGRATION_KEYS } from '@/lib/integrations'
import { checkGeorgianCopy, describeViolations } from '@/lib/georgianOrthography'
import { FEATURE_ABROAD } from '@/lib/flags'

// GET /api/admin/site-texts — the editable-text registry merged with current
// DB overrides, grouped-ready for the admin editor.
export async function GET() {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  await ensureDbReady()
  const rows = await prisma.siteText.findMany({ select: { key: true, value: true } })
  const overrides = new Map(rows.map(r => [r.key, r.value]))
  // Keys belonging to a dark vertical are withheld from the editor. Not for
  // secrecy — an admin can read the source — but because a group of fields that
  // edit a page nobody can open is a dead control, and the admin panel must not
  // change at all until the vertical is switched on.
  // `retired` keys are withheld for the mirror-image reason: their surface was
  // deleted, so the field would edit a void. The key stays in the registry (the
  // DB row is preserved) — it just stops being offered here.
  const items = SITE_TEXTS.filter(t => !t.retired && (t.vertical !== 'abroad' || FEATURE_ABROAD)).map(t => ({
    key: t.key,
    group: t.group,
    label: t.label,
    multiline: !!t.multiline,
    default: t.default,
    value: overrides.get(t.key) ?? t.default,
    overridden: overrides.has(t.key),
  }))
  /**
   * ORPHANS — overrides in the DB whose key no longer exists in the registry.
   *
   * This is the one way an admin's text can silently disappear, and it is worth
   * naming precisely: rename or delete a key in `lib/siteTextDefs` and the row
   * SURVIVES in the database, but the editor stops listing it and the public
   * page falls back to the CODE default. The admin's wording is replaced by the
   * developer's, nobody is told, and the only symptom is that the site says
   * something the owner did not write.
   *
   * Returning them makes that impossible to miss. They are reported, never
   * auto-deleted — the text is the owner's, and a cleanup that throws away
   * words somebody wrote is the same failure with better manners.
   */
  const known = new Set(SITE_TEXTS.map(t => t.key))

  /* ⚠️ NOT every row in this table belongs to the text registry.
   *
   * `integration.*` (the GA id and the raw header/footer code) deliberately
   * shares the SiteText table while being owned by lib/integrations and edited
   * in the „ინტეგრაციები" tab — see the note at the top of that file. The first
   * version of this check did not know that and reported the owner's live
   * Google Analytics tag as „no longer shown on the site", which is both wrong
   * and alarming: the tag was, and is, serving on every page.
   *
   * A key owned by ANOTHER registry is not an orphan. The prefix is matched as
   * well as the exact keys, so a fourth integration field added tomorrow does
   * not resurrect the false alarm. */
  const ownedElsewhere = (key: string) =>
    key.startsWith('integration.') || Object.values(INTEGRATION_KEYS).includes(key as never)

  const orphans = rows
    .filter(r => !known.has(r.key) && !ownedElsewhere(r.key))
    .map(r => ({ key: r.key, value: r.value }))

  return NextResponse.json({ items, orphans })
}

// PATCH /api/admin/site-texts — set a key's value, or reset it to the default.
// Only registry keys are accepted. Reset deletes the override row so the code
// default takes over again.
const Body = z.object({
  key: z.string().min(1),
  value: z.string().max(4000).optional(),
  reset: z.boolean().optional(),
})

export async function PATCH(req: Request) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const admin = auth.user
  await ensureDbReady()
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  const { key, value, reset } = parsed.data
  if (!isKnownSiteTextKey(key)) return NextResponse.json({ ok: false, error: 'UNKNOWN_KEY' }, { status: 400 })

  // Public-facing copy — audited so a changed headline/footer line is traceable
  // to an actor. Previous value comes along so the trail can reconstruct the diff.
  const before = await prisma.siteText.findUnique({ where: { key }, select: { value: true } })

  if (reset) {
    await prisma.siteText.deleteMany({ where: { key } })
    await audit(admin.id, 'siteText.reset', {
      targetType: 'SiteText',
      targetId: key,
      meta: { key, prevValue: before?.value?.slice(0, 300) ?? null },
    })
    return NextResponse.json({ ok: true, reset: true })
  }
  if (value === undefined) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  // ── The copy lint WARNS. It does not refuse. ──────────────────────────────
  //
  // It used to return 400 and drop the text on the floor. The reasoning was
  // sound — a SiteText row overrides the code default, lands on a public page,
  // and the source lint can never see it (three rows „ვიდეო-სესია" ×2 and
  // „ვიდეოშესავალს" were serving on every page while the file lint passed clean
  // on all 333 files). But the cost was paid by the wrong person: the owner
  // typed a sentence, pressed შენახვა, and the text simply did not stick. From
  // the chair it read as „the admin panel loses my work", which is the most
  // expensive thing a CMS can teach you.
  //
  // Owner's instruction, 2026-08-04: „ხელით თუ დავწერ, ის აღარასდროს შეცვალო".
  // A save that is refused IS a change to what they wrote — to nothing. So the
  // rule is now: the text is ALWAYS stored exactly as typed, and the violations
  // ride back in the response so the editor can show them beside the field. The
  // human decides; the linter advises. (The SOURCE lint in
  // tests/georgianOrthography.test.ts is unchanged and still blocks — that one
  // governs copy WE author, where the same strictness costs nobody anything.)
  const warnings = checkGeorgianCopy(value)

  await prisma.siteText.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
  await audit(admin.id, 'siteText.set', {
    targetType: 'SiteText',
    targetId: key,
    meta: { key, value: value.slice(0, 300), prevValue: before?.value?.slice(0, 300) ?? null },
  })
  // `ok: true` regardless — the row is written. `warnings` is advice about the
  // text that was just SAVED, never a reason it wasn't.
  return NextResponse.json({
    ok: true,
    warnings: warnings.length ? describeViolations(warnings) : null,
  })
}

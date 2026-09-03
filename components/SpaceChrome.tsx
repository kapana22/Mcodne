// SpaceChrome — the rail a signed-in person keeps when they step OUT of their
// room but not out of the product.
//
// ⚠️ WHY IT EXISTS (2026-09-03). Owner, asked to sweep the header layer: „ჰედერი
// ვის მიყვება და ვისთან ქრება… რომ არ დაიკარგოს მომხმარებელი და უკან გამოსვლა
// აღარ შეძლოს."
//
// Swept all 41 pages. Every one of them carries a header and a way out, and
// exactly TWO wore one nobody else does: /notifications and /settings. Both are
// reached from INSIDE a workspace — the bell, the tab bar, the account menu —
// and both dropped the rail on arrival and drew a bar of their own instead: a
// back chevron, a logo, and (on /notifications) a second copy of the bell and
// the user menu. A person working in /work pressed the bell and landed
// somewhere that looked like a different site, with one 40px chevron for a way
// home.
//
// ⚠️ THE PATTERN WAS ALREADY HERE AND HALF-APPLIED. app/settings/client says it
// in its own words — the standalone bar is „a FIFTH chrome in a product that
// already has four" — and /me/profile already renders that same component with
// `chrome={false}` inside ClientShell. What stopped the other half is written
// at app/me/profile/page.tsx: /settings „is the address a provider and an admin
// use — neither of whom has this rail." A provider HAS a rail. It is
// WorkspaceShell, and this file is the two lines that hand it to them.
//
// ⚠️ WHAT IT IS NOT. Not a guard: it renders chrome and decides nothing about
// access. Every page that uses it does its own `requireUser()` first and hands
// the row down, so this component never re-reads a session and never redirects.
//
// ⚠️ AND IT DELIBERATELY MIRRORS THE TWO LAYOUTS RATHER THAN REPLACING THEM.
// app/me/layout and app/work/layout each carry a page of reasoning about the
// numbers they gather — the two client counts, the grant, why the badge is a
// real count() — and moving that reasoning into a shared helper would file it
// away from the decisions it explains. What is shared is the LOW-LEVEL calls
// (`liveRequestCount`, `openRequestCount`, `grantEarnedTasks`, …), which is
// where drift would actually hurt. If a rail grows a badge, it grows here too;
// the note at each layout says so.

import type { ReactNode } from 'react'
import { isProvider as hasProviderCapability } from '@/lib/capabilities'
import { providersOn, requestsOn, REQUEST_ROUTE } from '@/lib/requests'
import { sellsHere, requestsViewer, openRequestCount } from '@/lib/requestsServer'
import { liveRequestCount } from '@/lib/myRequests'
import { clientUnreadTotal } from '@/lib/inboxRows'
import { balanceOf, grantEarnedTasks } from '@/lib/creditsServer'
import { ensureDbReady } from '@/lib/dbBoot'
import { asRole } from '@/lib/roles'
import { ClientShell } from '@/components/me/ClientShell'
import { WorkspaceShell } from '@/components/work/WorkspaceShell'

/** What the chrome needs about the reader. The row a `requireUser()` already
 *  returned — never the whole record: `user.passwordHash` must not travel into
 *  a client component's props, which is the rule app/work/layout states. */
export type ChromeUser = {
  id: string
  fullName: string
  avatarUrl: string | null
  role: string
}

/**
 * Wrap a page in the reader's own workspace.
 *
 * ⚠️ THE QUESTION IS `sellsHere`, NOT `role`. CLAUDE.md: a role is a
 * permission, a profile plus an allowlist row is the fact — a granted PROVIDER
 * who never finished registering sells nothing and is an ordinary client. It is
 * the same question app/me/layout asks before it redirects, so the two cannot
 * disagree about whose room this is.
 *
 * An ADMIN is not a seller and gets the client rail, which is exactly what /me
 * already gives them ("ADMIN is not a seller and keeps both rooms").
 */
export async function SpaceChrome({ user, children }: { user: ChromeUser; children: ReactNode }) {
  const chromeUser = { name: user.fullName, avatar: user.avatarUrl ?? undefined }

  if (await sellsHere(user.id)) {
    // ── The supply side, mirroring app/work/layout.tsx ────────────────────
    const provider = await hasProviderCapability(user.id)
    const viewer = providersOn() ? await requestsViewer() : null
    const groups = { work: viewer !== null && (provider || viewer.providerAllowed) }

    let balanceTetri: number | null = null
    let unearnedTetri = 0
    let grantPercent: number | null = null
    if (provider) {
      await ensureDbReady()
      /* ⚠️ THE GRANT RUNS HERE TOO, AND THAT IS THE POINT RATHER THAN A SIDE
         EFFECT. app/work/layout explains at length why it moved off one page
         and onto the shell: „A bonus that pays only the people who happen to
         walk past one door is not a bonus." Settings and the bell are two more
         doors the same person walks past. It is idempotent by a unique index,
         not by a check, so running it again is correct rather than tolerated —
         and the rail's „კიდევ N ₾" line would otherwise have to be drawn from
         numbers this page never read. */
      const granted = await grantEarnedTasks(user.id)
      unearnedTetri = granted.unearnedTetri
      grantPercent = granted.percent
      balanceTetri = await balanceOf(user.id)
    }

    // `openRequestCount` scopes the queue by the viewer's own trades — it
    // takes the USER row, the same argument app/work/layout passes, and not the
    // resolved viewer.
    const openRequests = groups.work ? await openRequestCount({ id: user.id, role: user.role }) : 0

    return (
      <WorkspaceShell
        user={chromeUser}
        role={asRole(user.role)}
        groups={groups}
        openRequests={openRequests}
        isProvider={viewer === null || viewer.provider !== null}
        balanceTetri={balanceTetri}
        unearnedTetri={unearnedTetri}
        grantPercent={grantPercent}
      >
        {children}
      </WorkspaceShell>
    )
  }

  // ── The client side, mirroring app/me/layout.tsx ──────────────────────────
  // Two independent counts on the critical path of the page: `Promise.all`,
  // for the reason stated there.
  const on = requestsOn()
  const [requests, messages] = on
    ? await Promise.all([liveRequestCount(user.id), clientUnreadTotal(user.id)])
    : [0, 0]

  return (
    <ClientShell
      user={chromeUser}
      badges={{ requests, messages }}
      newRequestHref={on ? REQUEST_ROUTE : null}
    >
      {children}
    </ClientShell>
  )
}

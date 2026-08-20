// WHO MAY BE COLD-MESSAGED — one predicate, because there is one catalogue.
//
// ⚠️ WHY THIS FILE EXISTS (2026-08-20). Both pair-thread guards in
// app/api/messages asked the same question the same wrong way:
//
//     const roles = new Set([me.role, other.role])
//     if (!roles.has(ROLE.EXPERT) || roles.has('ADMIN')) → 403
//
// „At least one party must be a TUTOR." That was true when the only provider on
// the site was an expert with a calendar. It stopped being true the day the job
// half arrived: a SERVICE PROVIDER is admitted through `RequestAccess`, NOT by
// being granted the TUTOR role — measured on the live database the day this
// file was written, all SEVEN visible ServiceProfiles belong to users whose
// role is STUDENT. So every one of them answered 403 to a client trying to
// write to them, and the profile page rendered „მიმოწერა ვერ მოიძებნა".
//
// It was invisible because until 2026-08-20 no provider profile offered a
// message button at all — the endpoint had been refusing an action nothing
// asked for. Adding the button (app/experts/[slug]/_providerCta) is what made
// the old rule visible, and it is the rule that is wrong, not the button:
// THE PRODUCT MODEL says one provider, and „what kind of person are you" is
// exactly the axis it forbids reading. A public ServiceProfile is as public as
// a live TutorProfile.
//
// ⚠️ SO THE TEST IS „ARE YOU LISTED", NOT „WHAT IS YOUR ROLE". Both halves reuse
// their OWN catalogue's visibility rule, IMPORTED and never re-typed — the same
// discipline lib/requestTarget follows for `?to=<slug>`. A looser rule here
// would let a paused or suspended profile be reached by id; a stricter one
// would refuse somebody the visitor is looking at.
//
// ADMIN is still never a valid counterparty on either side. That has nothing to
// do with the catalogue — an admin account is staff, and support has its own
// address (lib/supportEmails).
import { prisma } from '@/lib/prisma'
import { PUBLIC_TUTOR } from '@/lib/tutorsQuery'
import { PUBLIC as PUBLIC_SERVICE } from '@/app/experts/_masterData'

/**
 * Is this user LISTED — a live expert, a visible service provider, or both?
 *
 * One query per half, `findFirst` + `select: { id }`: the answer is a boolean
 * and neither profile's columns are wanted here (a ServiceProfile carries
 * base64 photo columns, which must never be selected into anything — see
 * app/experts/_masterData).
 */
export async function isListedProvider(userId: string): Promise<boolean> {
  const [expert, provider] = await Promise.all([
    prisma.tutorProfile.findFirst({ where: { userId, ...PUBLIC_TUTOR }, select: { id: true } }),
    prisma.serviceProfile.findFirst({ where: { userId, ...PUBLIC_SERVICE }, select: { id: true } }),
  ])
  return expert !== null || provider !== null
}

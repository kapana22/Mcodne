import { prisma } from './prisma'

// Fire-and-forget audit writer. Never throws — failing to write an audit row
// must not block the underlying admin action.
//
// Usage:
//   await audit(user.id, 'application.approve', { targetType: 'TutorApplication', targetId: appId, meta: { note } })

export async function audit(
  actorId: string | null,
  action: string,
  opts: { targetType?: string; targetId?: string; meta?: any } = {},
) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actorId ?? 'system',
        action,
        targetType: opts.targetType ?? null,
        targetId: opts.targetId ?? null,
        meta: opts.meta ?? undefined,
      },
    })
  } catch {
    // Silent — audit is side-effect only.
  }
}

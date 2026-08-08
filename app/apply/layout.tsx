// Pass-through layout for /apply.
//
// It used to (a) export `metadata` and (b) call requireRole(['STUDENT']).
// Both are gone:
//   · metadata — page.tsx is a server component and exports its own, and a
//     page's metadata REPLACES its layout's, so this block was never used.
//   · requireRole — it bounced GUESTS to /signin, which made /apply invisible
//     to search engines. Role routing now lives in page.tsx, where a guest gets
//     the public marketing view and only the FORM requires a session.
export const dynamic = 'force-dynamic'

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return children
}

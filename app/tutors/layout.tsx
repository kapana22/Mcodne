// Pass-through layout.
//
// It used to also export `metadata`, with a comment claiming page.tsx was a
// client component. Both are stale: page.tsx became a server component and
// exports its own metadata, and a page's metadata REPLACES its layout's — so
// that block was dead code shipping a title nobody ever saw. Metadata for
// /tutors lives in page.tsx; keep it there.
export default function TutorsLayout({ children }: { children: React.ReactNode }) {
  return children
}

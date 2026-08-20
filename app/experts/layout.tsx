// Pass-through layout for the whole /experts segment — the catalogue, the
// expert profiles and the profession landings.
//
// It used to also export `metadata`, with a comment claiming page.tsx was a
// client component. Both were stale: page.tsx is a server component and exports
// its own metadata, and a page's metadata REPLACES its layout's — so that block
// was dead code shipping a title nobody ever saw. Metadata for every page under
// /experts lives in that page; keep it there.
export default function ExpertsLayout({ children }: { children: React.ReactNode }) {
  return children
}

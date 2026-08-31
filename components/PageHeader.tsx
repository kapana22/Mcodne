/* Canonical page header for EVERY workspace page (client · provider · admin):
   eyebrow / title / one-line sub + right-aligned actions (wrap below sm). One
   title scale site-wide so the two workspaces read as one system — the client
   pages used to hand-roll `<h1 text-3xl>` while the provider used this at 26px.

   ⚠️ TWO RULES, WRITTEN DOWN 2026-08-30 BECAUSE NOTHING DECIDED THEM AND IT
   SHOWED. Audited that day across both rooms: eight headers, four with an
   eyebrow and four without, and no rule saying which. The four that had one
   disagreed about what it names — the SPACE („სამუშაო სივრცე", „ჩემი სივრცე"),
   the THING („პირადი სია"), or the title again („პროფილი" above „ჩემი
   პროფილი", „შეთავაზებები" above „ჩემი შეთავაზებები").

   1. THE EYEBROW IS FOR A PARENT YOU CANNOT SEE. On a top-level page it names
      the room — which the rail is already saying, permanently, in a lit row
      about 40px to its left. (app/work/messages/_frame had reasoned exactly
      that far already: it hides its own header on `lg` „because of the
      highlighted sidebar pill ~40px to its left".) So: NO eyebrow at the top
      level. On a DETAIL page it earns its place, because the parent is the one
      thing the screen cannot otherwise tell you — „შეთავაზებები" above
      „მიმოწერა", „სამუშაო · ბუღალტერია" above a request.

   2. THE TITLE IS THE RAIL ROW YOU CLICKED. Clicking „პროფილი" and landing on
      „ჩემი პროფილი" is a small dissonance paid on every page. „ჩემი" inside
      somebody's own workspace answers a question nobody asked — whose else
      would it be? — except where it genuinely separates two things, which is
      why the rail's „ჩემი სერვისები" (mine, not the catalogue's) keeps it. */
import { Eyebrow } from '@/components/Eyebrow'

export function PageHeader({
  eyebrow,
  title,
  sub,
  actions,
  className = '',
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  sub?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-3 ${className}`}>
      <div className="min-w-0">
        {eyebrow && (
          <Eyebrow>
            {eyebrow}
          </Eyebrow>
        )}
        <h1 className="font-display text-h2 sm:text-h1 font-bold text-ink-900 tracking-tight mt-1">
          {title}
        </h1>
        {sub && <p className="text-small text-ink-500 mt-1.5 leading-snug">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}

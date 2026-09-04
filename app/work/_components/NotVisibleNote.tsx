import Link from 'next/link'
import { Icon } from '@/components/Icon'

/**
 * „YOUR CARD IS NOT ON THE SITE YET, AND HERE IS THE LIST."
 *
 * Owner, 2026-09-04: „სანამ სრულად არ შევსებს, ფოტოს არ დადებს, იქამდე არ
 * გამოჩნდეს პროფილზე."
 *
 * ⚠️ THE HIDING IS THE EASY HALF; THIS IS THE HALF THAT DECIDES WHETHER IT
 * WORKS. A provider registers, believes they are live, hears nothing for two
 * weeks and leaves — and every part of that is invisible to us, because from
 * the outside it looks exactly like a market with no demand in it. A rule that
 * removes somebody from the catalogue silently is not a quality rule, it is a
 * leak. So the state is said in the loudest place the workspace has, in the
 * first position on the page, with the exact gaps named.
 *
 * ⚠️ IT IS NOT A WARNING AND IT DOES NOT SCOLD. `warning-` colours, a
 * triangle, „your profile is incomplete!" — all of that reads as a telling-off
 * for somebody who has done nothing wrong and is three minutes from finished.
 * It states the fact, names what is left, and opens the editor.
 *
 * ⚠️ AND IT DOES NOT SAY „YOU WILL GET NO WORK". That would be false: the
 * request SMS still goes out (lib/outbound → `request.verified.provider`,
 * switched on by the owner the same day), because real work waiting is the only
 * strong reason to come back and finish this. What is refused is SENDING an
 * offer — app/api/provider/offers — and the sentence says exactly that,
 * because a person who finds out at the moment they try to bid has been
 * ambushed by a rule nobody told them.
 */
export function NotVisibleNote({ missing, href = '/work/profile' }: { missing: string[]; href?: string }) {
  return (
    <div className="rounded-card border border-ink-200 bg-white px-4 py-3.5 grid grid-cols-[auto_1fr] gap-3.5 items-start">
      <span className="w-8 h-8 rounded-full bg-ink-100 text-ink-700 inline-flex items-center justify-center shrink-0">
        <Icon.eyeOff className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <div className="font-display text-small font-bold text-ink-900 tracking-tight">
          პროფილი ჯერ არ ჩანს საიტზე
        </div>
        <p className="text-small text-ink-600 mt-1 leading-relaxed">
          მოთხოვნები მაინც მოგივა, მაგრამ შეთავაზების გაგზავნას ვერ შეძლებ, სანამ ბარათი არ დასრულდება.
        </p>
        {/* The gaps as chips, not a sentence. „დარჩა: ფოტო, აღწერა" is one
            line to read; a paragraph about each is three, and the person is
            here to finish, not to be briefed. */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-meta text-ink-500">დარჩა:</span>
          {missing.map(m => (
            <span key={m} className="inline-flex items-center rounded-pill border border-ink-200 bg-ink-50 px-2.5 py-1 font-display text-meta font-semibold text-ink-700">
              {m}
            </span>
          ))}
        </div>
        <Link
          href={href}
          className="tap-area mt-3 inline-flex items-center gap-1.5 font-display text-small font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2 decoration-brand-300"
        >
          პროფილის შევსება
          <Icon.arrow className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  )
}

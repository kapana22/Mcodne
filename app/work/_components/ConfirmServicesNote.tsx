import Link from 'next/link'
import { Icon } from '@/components/Icon'

/**
 * „WE FILLED THIS IN — PLEASE CHECK IT."
 *
 * ⚠️ WHY A PROVIDER IS BEING ASKED AT ALL. When consultations were removed
 * (2026-08-24) the 27 people who came across were seeded with their whole
 * SPHERE, because a provider with no services is invisible to routing and
 * „nothing ticked" would have migrated them into silence. So a lawyer arrived
 * claiming all seven legal services, an accountant all five tax ones — and on a
 * card that shows two chips, all four lawyers read as the same person.
 *
 * ⚠️ AND WHY WE DO NOT JUST FIX IT. Deriving each person's real list from the
 * bio they wrote was built and run against the live data. It works, and it was
 * not applied: a bio is evidence of what somebody DOES and never of what they
 * do not, so it would have taken „დღგ" from an accountant who simply had not
 * used the word — and silently dropped them out of every queue that names it.
 * Owner, the same day: „არაფერი არ უნდა შეცვალოს, წაშლა არ გვინდა, მათ უნდა
 * შევიდნენ ისევ თავიან ექაუნთზე."
 *
 * So this note is the whole mechanism: nothing of theirs is touched, and the one
 * person who can say what they sell is asked to say it.
 *
 * ⚠️ IT DISAPPEARS ON SAVE, not on dismiss. `servicesConfirmedAt` is stamped by
 * app/api/provider/service-profile the moment they press save, whether or not
 * they changed anything — pressing save IS having looked. A dismiss button would
 * let the one state we are trying to clear be cleared without looking.
 */
export function ConfirmServicesNote({ href = '/work/services' }: { href?: string }) {
  return (
    <div className="rounded-card border border-brand-200 bg-brand-50/60 px-4 py-3.5 grid grid-cols-[auto_1fr] gap-3.5 items-start">
      <span className="w-8 h-8 rounded-full bg-white border border-brand-200 text-brand-700 inline-flex items-center justify-center shrink-0">
        <Icon.info className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <div className="font-display text-small font-bold text-ink-900 tracking-tight">
          გადახედე სერვისების სიას
        </div>
        {/* Says WHAT WE DID and WHY IT MATTERS TO THEM — a request to check
            something is ignored unless the reader can see the cost of not. */}
        <p className="text-small text-ink-600 mt-1 leading-relaxed">
          სია შენი კატეგორიის მიხედვით შევავსეთ, რომ მოთხოვნების გარეშე არ დარჩენილიყავი.
          მოხსენი, რასაც არ აკეთებ, და დაადე ფასი — კლიენტი ზუსტად ამის მიხედვით გპოულობს.
        </p>
        <Link
          href={href}
          className="tap-area mt-2.5 inline-flex items-center gap-1.5 font-display text-small font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2 decoration-brand-300"
        >
          სერვისების გახსნა
          <Icon.arrow className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  )
}

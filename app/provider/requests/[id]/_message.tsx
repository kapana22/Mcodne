// THE REQUEST, AS THE CLIENT SAYING IT — the provider's first message.
//
// ⚠️ WHY THIS IS NOT THE `<dl>` IT REPLACES (2026-08-17). A provider met the
// same relationship in two different visual languages: BEFORE bidding, a
// details card with six label/value pairs; AFTER bidding, a chat thread of
// bubbles (components/RequestChat). Same two people, same subject, and nothing
// on screen said they were the same conversation — the offer read as a form
// submitted into a void rather than a reply to somebody.
//
// Owner, 2026-08-17: „აქ რეალურ ჩათში უნდა იყოს ეს რექვესთი როგორც მიმოწერა და
// უფრო კომფორტულია."
//
// ⚠️ AND WHY BUBBLES ARE RIGHT HERE, HAVING BEEN WRONG IN THE WIZARD. The
// intake's transcript had to fold away (app/request/_transcript) because it was
// a document pretending to be a chat: one party, no composer, and a page that
// grew downwards forever. This screen is the opposite on every count — there are
// genuinely TWO parties, the reply box is pinned at the bottom where the
// reference products put it, and the thread is exactly two turns long. The
// metaphor is true here, so it is used here.
//
// ⚠️ THE STRUCTURED ANSWERS GO INSIDE THE BUBBLE, not beside it. They are
// things the client ANSWERED — the wizard showed each one back to them as their
// own words at the time — so attributing them to the client is accurate, and
// splitting them into a second panel would rebuild the two-languages problem
// one level down.

import { timeAgoKa } from '@/lib/requests'

type Fact = { label: string; value: string }

export function RequestMessage({
  topicLabel, description, createdAt, facts,
}: {
  topicLabel: string
  description: string | null
  createdAt: Date | string
  facts: Fact[]
}) {
  return (
    <div className="flex items-start gap-3">
      {/* Not a photo: the client has no account and therefore no avatar, and a
          generic silhouette would be a picture of nobody. The initial of what
          they asked for is the one true thing available at this point — the
          provider recognises the request by its topic, which is also why the
          page title is the topic. */}
      <span
        aria-hidden
        className="shrink-0 w-9 h-9 rounded-pill bg-ink-100 text-ink-600 inline-flex items-center justify-center font-display text-body font-bold"
      >
        {topicLabel.trim().charAt(0)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-meta text-ink-500 mb-1.5">
          კლიენტი · {timeAgoKa(createdAt)}
        </p>

        {/* The same ground, radius and leading as an incoming bubble in
            components/RequestChat, so the message a provider reads before
            bidding and the ones they read after are visibly one conversation.
            Wider padding only — this turn carries more than a sentence. */}
        <div className="max-w-[85%] rounded-card bg-ink-75 text-ink-900 px-4 py-3">
          {description ? (
            // `break-words` because this is the one field on the request a
            // person typed freely: a pasted link or an unbroken 60-character
            // word would otherwise push the bubble past its column.
            <p className="text-body leading-relaxed whitespace-pre-wrap break-words">{description}</p>
          ) : (
            // Silence is the honest rendering: the description is optional by
            // design and most people skip it. „—" would read as an empty answer
            // to a question they were asked, which is not what happened.
            <p className="text-body text-ink-500">აღწერა არ დაუწერია.</p>
          )}

          {facts.length > 0 && (
            <dl className="mt-3 pt-3 border-t border-ink-200 grid sm:grid-cols-2 gap-x-5 gap-y-2">
              {facts.map(f => (
                <div key={f.label}>
                  <dt className="text-meta text-ink-500">{f.label}</dt>
                  <dd className="text-body text-ink-900">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </div>
  )
}

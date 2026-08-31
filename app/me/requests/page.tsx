// /me/requests → /me (2026-08-30).
//
// ⚠️ THE PAGE IS NOT GONE, IT MOVED. „მთავარი" and „მოთხოვნები" were one thing
// said twice: the home drew the latest three of these rows with a „ყველა" link
// to this page, which drew the same rows again. The home is the list now
// (app/me/page), the rail carries three rows instead of four, and this address
// keeps working — it is in old emails, in browser history, and in anything a
// client bookmarked while waiting on an answer.
//
// A REDIRECT AND NOT A DELETION, for the same reason middleware.ts keeps 308s
// for every retired URL on the site: a link that once worked and now 404s tells
// the person their request is gone, which is the opposite of true.
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function MyRequestsMoved() {
  redirect('/me')
}

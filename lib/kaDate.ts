// Shared Georgian date/time formatting.
//
// The runtime's ICU (both Node on the server and some browsers) lacks `ka-GE`
// locale data, so `toLocaleDateString('ka-GE', …)` with month/weekday options
// silently falls back to ENGLISH names ("Jul", "Mon") inside an otherwise
// Georgian UI — and, worse, renders differently on server vs client causing
// hydration mismatches. Month and weekday names are therefore spelled out
// manually here. Pure numeric formats (day/hour/minute digits) are unaffected
// and may keep using toLocale* directly.

export const KA_MONTHS_SHORT = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ']
/**
 * The abbreviated months WITH the trailing period, for compact date chips.
 *
 * Five files had hand-written copies of this array and three of them disagreed
 * — „მარტ." vs „მარ.", „სექტ." vs „სექ." — so the same date rendered
 * differently depending on which screen you were on. One array, imported.
 */
export const KA_MONTHS_SHORT_DOT = KA_MONTHS_SHORT.map(m => `${m}.`)

export const KA_MONTHS_LONG = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი']
// Indexed by Date#getDay() — Sunday = 0.
export const KA_WEEKDAYS_SHORT = ['კვი', 'ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ']
export const KA_WEEKDAYS_LONG = ['კვირა', 'ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი']

export type KaDateOpts = { month?: 'short' | 'long'; weekday?: boolean; year?: boolean }

// "24 ივლ" · "24 ივლისი" · "ხუთ, 24 ივლ" · "24 ივლ 2026"
export function fmtKaDate(d: Date, opts?: KaDateOpts): string {
  const months = opts?.month === 'long' ? KA_MONTHS_LONG : KA_MONTHS_SHORT
  let s = `${d.getDate()} ${months[d.getMonth()]}`
  if (opts?.year) s += ` ${d.getFullYear()}`
  if (opts?.weekday) s = `${KA_WEEKDAYS_SHORT[d.getDay()]}, ${s}`
  return s
}

// "14:05" — zero-padded, 24-hour.
export function fmtKaTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// "24 ივლ · 14:05"
export function fmtKaDateTime(d: Date, opts?: KaDateOpts): string {
  return `${fmtKaDate(d, opts)} · ${fmtKaTime(d)}`
}

// The pill a chat transcript puts between two days — „დღეს" · „გუშინ" ·
// „24 აგვ" · „24 ივლ 2025".
//
// ⚠️ NOT `fmtKaThreadTime` WITH A DIFFERENT NAME. That one answers „when was
// this row last touched" and collapses today to a CLOCK („14:05"), which is
// exactly wrong over a group of messages: the separator's whole job is to name
// the day. It also skips the weekday shorthand, because „სამ" above a run of
// bubbles reads as a message rather than as a divider.
export function fmtKaDayLabel(d: Date, now: Date = new Date()): string {
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  if (dayDiff <= 0) return 'დღეს'
  if (dayDiff === 1) return 'გუშინ'
  return fmtKaDate(d, { year: d.getFullYear() !== now.getFullYear() })
}

// Inbox-style timestamp that spends detail only where it disambiguates:
// today → "14:05" · yesterday → "გუშინ" · <7 days → weekday ("სამ") ·
// same year → "24 ივლ" · older → "24 ივლ 2025". `now` is injectable for tests
// and for server components that want one consistent clock per render.
export function fmtKaThreadTime(d: Date, now: Date = new Date()): string {
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  if (dayDiff <= 0) return fmtKaTime(d)
  if (dayDiff === 1) return 'გუშინ'
  if (dayDiff < 7) return KA_WEEKDAYS_SHORT[d.getDay()]
  return fmtKaDate(d, { year: d.getFullYear() !== now.getFullYear() })
}

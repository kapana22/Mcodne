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

// Branded transactional email templates (Georgian). Each builder returns
// { subject, html }. Inline styles only — email clients strip <style>/external
// CSS. Brand green #2F9C86 (the logo teal), neutral ink, no external assets.

const BASE = 'https://mcodne.ge'
const BRAND = '#2F9C86'
const INK = '#1c1a17'
const MUTED = '#6b6862'

function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

// Shared shell: header wordmark, white card, optional CTA button, muted footer.
function shell(opts: { heading: string; bodyHtml: string; cta?: { label: string; href: string } }): string {
  const { heading, bodyHtml, cta } = opts
  const button = cta
    ? `<tr><td style="padding:8px 0 4px;">
         <a href="${esc(cta.href)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:10px;">${esc(cta.label)}</a>
       </td></tr>`
    : ''
  return `<!doctype html>
<html lang="ka"><body style="margin:0;padding:0;background:#f4f3f1;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3f1;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="padding:8px 4px 16px;">
          <span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${BRAND};">mcodne</span>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid #e6e4e0;border-radius:14px;padding:28px 26px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="font-size:20px;font-weight:800;color:${INK};letter-spacing:-0.01em;padding-bottom:12px;">${esc(heading)}</td></tr>
            <tr><td style="font-size:15px;line-height:1.6;color:${INK};">${bodyHtml}</td></tr>
            ${button}
          </table>
        </td></tr>
        <tr><td style="padding:16px 4px;font-size:12px;line-height:1.6;color:${MUTED};">
          mcodne — ბიზნეს-კონსულტაციები ექსპერტებთან.<br>
          ეს ავტომატური შეტყობინებაა. კითხვებზე: <a href="mailto:hi@mcodne.ge" style="color:${MUTED};">hi@mcodne.ge</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function p(text: string): string {
  return `<p style="margin:0 0 12px;">${text}</p>`
}

// A labelled detail row (used in booking/reminder emails).
function detail(rows: { label: string; value: string }[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 16px;border-top:1px solid #eee;">
    ${rows.map(r => `<tr>
      <td style="padding:8px 0;font-size:13px;color:${MUTED};width:40%;border-bottom:1px solid #f0efec;">${esc(r.label)}</td>
      <td style="padding:8px 0;font-size:14px;font-weight:600;color:${INK};border-bottom:1px solid #f0efec;">${esc(r.value)}</td>
    </tr>`).join('')}
  </table>`
}

export function welcomeEmail(name: string) {
  const first = (name || '').trim().split(/\s+/)[0] || 'მეგობარო'
  return {
    subject: 'მოგესალმებით mcodne-ზე 👋',
    html: shell({
      heading: `${esc(first)}, კეთილი იყოს შენი მობრძანება!`,
      bodyHtml:
        p('შენ წარმატებით დარეგისტრირდი <b>mcodne</b>-ზე — პლატფორმაზე, სადაც ბიზნეს-საკითხებზე პირდაპირ ექსპერტებს ელაპარაკები.') +
        p('დაიწყე ექსპერტის მოძებნით — აირჩიე საკითხი, დაჯავშნე დრო და ისაუბრე ვიდეოზარით.'),
      cta: { label: 'იპოვე ექსპერტი', href: `${BASE}/tutors` },
    }),
  }
}

export function bookingConfirmedEmail(o: { studentName: string; expertName: string; topic: string; whenText: string; bookingId: string }) {
  return {
    subject: 'ჯავშანი დადასტურდა ✅',
    html: shell({
      heading: 'შენი ჯავშანი დადასტურდა',
      bodyHtml:
        p(`${esc(o.expertName)}-მა დაადასტურა შენი კონსულტაცია. დეტალები:`) +
        detail([
          { label: 'ექსპერტი', value: o.expertName },
          { label: 'თემა', value: o.topic },
          { label: 'დრო', value: o.whenText },
        ]) +
        p('დანიშნულ დროზე ერთი კლიკით შეხვალ ვიდეო-ოთახში.'),
      cta: { label: 'ჯავშნის ნახვა', href: `${BASE}/student/bookings/${o.bookingId}` },
    }),
  }
}

export function sessionReminderEmail(o: { name: string; counterpartName: string; topic: string; whenText: string; href: string }) {
  return {
    subject: 'შეხსენება: სესია მალე იწყება ⏰',
    html: shell({
      heading: 'შენი სესია მალე იწყება',
      bodyHtml:
        p(`შეხსენება — მალე გაქვს დაგეგმილი კონსულტაცია ${esc(o.counterpartName)}-თან.`) +
        detail([
          { label: 'თემა', value: o.topic },
          { label: 'დრო', value: o.whenText },
        ]) +
        p('დარწმუნდი, რომ მზად ხარ — შედი ვიდეო-ოთახში დანიშნულ დროზე.'),
      cta: { label: 'სესიის გახსნა', href: `${BASE}${o.href}` },
    }),
  }
}

export function newMessageEmail(o: { name: string; fromName: string; preview: string; href: string }) {
  return {
    subject: `ახალი შეტყობინება — ${o.fromName}`,
    html: shell({
      heading: `${esc(o.fromName)}-მა მოგწერა`,
      bodyHtml:
        p(`<span style="color:${MUTED};">„</span>${esc(o.preview)}<span style="color:${MUTED};">“</span>`) +
        p('უპასუხე პლატფორმაზე — სწრაფი პასუხი დაგეხმარება.'),
      cta: { label: 'პასუხის გაცემა', href: `${BASE}${o.href}` },
    }),
  }
}

// Shared friendly default avatar — a soft person glyph on the brand-green wash,
// visually identical to the <Avatar> component's inline fallback. The app has
// ~15 raw <img>/<Image> avatar renders that DON'T go through <Avatar>; without
// a shared fallback a photoless user shows a broken image or an off-brand gray
// initials tile. Use `src={someUrl || DEFAULT_AVATAR}` everywhere so the SAME
// nice default appears in every avatar slot across the app.
const RAW =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'>" +
  "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>" +
  "<stop offset='0' stop-color='#D3ECE4'/><stop offset='1' stop-color='#ADDBCF'/></linearGradient></defs>" +
  "<rect width='40' height='40' fill='url(#g)'/>" +
  "<circle cx='20' cy='15.5' r='6.8' fill='#26806E'/>" +
  "<path d='M6.5 37c0-7.7 6-13 13.5-13s13.5 5.3 13.5 13z' fill='#26806E'/>" +
  "</svg>"

export const DEFAULT_AVATAR = `data:image/svg+xml,${encodeURIComponent(RAW)}`
